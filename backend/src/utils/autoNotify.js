const { sendParentNotificationSafe, resolveTextTemplate } = require('./notificationHelpers');

/**
 * Trigger attendance notifications in the background.
 */
async function autoNotifyAttendance(prisma, sessionId, studentIds, sentByUserId) {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { title: true, date: true, duration: true, location: true, description: true }
    });
    if (!session) return;

    const dateStr = new Date(session.date).toLocaleDateString('ar-EG');
    const timeStr = new Date(session.date).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    const records = await prisma.attendance.findMany({
      where: { sessionId, studentId: { in: studentIds } },
      include: { student: true }
    });

    for (const record of records) {
      const student = record.student;
      if (!student || !student.dadPhoneNumber) continue;

      const typeKey = record.isAttendant ? 'attendance_present' : 'attendance_absent';
      const status = record.isAttendant ? 'حاضر ✅' : 'غائب ❌';

      // Do not send absence message if the session hasn't ended yet (Pending status)
      const isPast = Date.now() > new Date(session.date).getTime() + ((session.duration || 2) * 3600000);
      if (!record.isAttendant && !isPast) {
        continue;
      }

      const tokens = {
        'كود_الطالب': student.id,
        'اسم_الطالب': student.name,
        'عنوان_الحصة': session.title,
        'الحضور': status,
        'التاريخ': `${dateStr} ${timeStr}`,
        'المكان': session.location || '-',
        'الوصف': session.description || '-'
      };

      const textBody = await resolveTextTemplate(prisma, typeKey, tokens, student);
      
      await sendParentNotificationSafe({
        prisma,
        student,
        type: typeKey,
        textBody,
        sentByUserId
      });
    }
  } catch (err) {
    console.error('Auto notify attendance failed:', err);
  }
}

/**
 * Trigger exam grade notifications in the background.
 */
async function autoNotifyExamGrades(prisma, examId, studentIds, sentByUserId) {
  try {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { title: true, totalDegree: true, minPassDegree: true }
    });
    if (!exam) return;

    const degrees = await prisma.studentDegree.findMany({
      where: { examId, studentId: { in: studentIds } },
      include: { student: true }
    });

    let stats = { sent: 0, archived: 0, skipped: 0, failed: 0 };

    for (const deg of degrees) {
      if (deg.studentDegree === null || deg.studentDegree === undefined) continue;

      const student = deg.student;
      if (!student || !student.dadPhoneNumber) continue;

      const typeKey = deg.studentDegree >= exam.minPassDegree ? 'exam_grade_good' : 'exam_grade_bad';

      const tokens = {
        'كود_الطالب': student.id,
        'اسم_الطالب': student.name,
        'عنوان_الامتحان': exam.title,
        'الدرجة': deg.studentDegree,
        'الدرجة_الكلية': exam.totalDegree
      };

      const textBody = await resolveTextTemplate(prisma, typeKey, tokens, student);
      
      const res = await sendParentNotificationSafe({
        prisma,
        student,
        type: typeKey,
        textBody,
        sentByUserId
      });

      if (res.sent) stats.sent++;
      else if (res.method === 'archived') stats.archived++;
      else if (res.method === 'skipped') stats.skipped++;
      else stats.failed++;
    }
    return stats;
  } catch (err) {
    console.error('Auto notify exam grades failed:', err);
    return { error: true };
  }
}

/**
 * Trigger session creation/update notifications in the background.
 */
async function autoNotifySession(prisma, sessionId, action, sentByUserId) {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        group: { include: { students: true } }
      }
    });
    if (!session) return;

    const isLecture = session.type === 'lecture';
    if (!isLecture && !session.group) return;

    const typeKey = isLecture ? 'new_lecture' : 'new_session';

    const targetStudents = isLecture
      ? await prisma.student.findMany({ where: { group: { grade: session.grade } }, include: { group: true } })
      : session.group.students;

    const dateStr = new Date(session.date).toLocaleDateString('ar-EG');
    const timeStr = new Date(session.date).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    let stats = { sent: 0, archived: 0, skipped: 0, failed: 0 };

    for (const student of targetStudents) {
      if (!student.dadPhoneNumber) continue;

      const tokens = {
        'كود_الطالب': student.id,
        'اسم_الطالب': student.name,
        'اسم_المجموعة': isLecture ? (student.group?.name || session.grade) : session.group.name,
        'الصف': isLecture ? session.grade : (student.group?.grade || session.group.grade),
        'عنوان_الحصة': session.title,
        'عنوان_المحاضرة': session.title,
        'التاريخ': `${dateStr} ${timeStr}`,
        'المكان': session.location || '-',
        'الوصف': session.description || '-'
      };

      const textBody = await resolveTextTemplate(prisma, typeKey, tokens, student);

      const res = await sendParentNotificationSafe({
        prisma,
        student,
        type: typeKey,
        textBody,
        sentByUserId
      });
      
      if (res.sent) stats.sent++;
      else if (res.method === 'archived') stats.archived++;
      else if (res.method === 'skipped') stats.skipped++;
      else stats.failed++;
    }
    return stats;
  } catch (err) {
    console.error('Auto notify session failed:', err);
    return { error: true };
  }
}

/**
 * Trigger payment added notifications in the background.
 */
async function autoNotifyPaymentAdded(prisma, student, amount, paymentType, sentByUserId) {
  try {
    if (!student || !student.dadPhoneNumber) return;

    const typeKey = paymentType === 'book' ? 'payment_added_book' : 'payment_added_sessions';
    const dateStr = new Date().toLocaleDateString('ar-EG');
    const { summarizeStudentPayments } = require('./payments');
    
    // We need the full student with groups/offers/payments to summarize, but summarizeStudentPayments 
    // expects certain relations to be loaded. We should fetch them if not present.
    let fullStudent = student;
    if (!fullStudent.eachPayments) {
      fullStudent = await prisma.student.findUnique({
        where: { id: student.id },
        include: { 
          group: true, offer: true,
          attendance: { include: { session: true } },
          bookBookings: { include: { book: true } },
          eachPayments: { orderBy: { lastPaymentDate: 'desc' } }
        }
      });
    }

    const summary = summarizeStudentPayments(fullStudent);
    // نستخدم أرقام النوع بتاع الدفعة نفسه (حصص أو كتب) مش الإجمالي الكلي المختلط
    const amountDue = paymentType === 'book' ? summary.bookingsDue : summary.sessionsDue;
    const amountPaid = paymentType === 'book' ? summary.bookingsPaid : summary.sessionsPaid;
    const remaining = Math.max(0, amountDue - amountPaid);

    const tokens = {
      'كود_الطالب': fullStudent.id,
      'اسم_الطالب': fullStudent.name,
      'قيمة_الدفعة': amount,
      'تاريخ_الدفع': dateStr,
      'الدرجة_الكلية': amountDue,
      'المتبقي': remaining
    };

    const textBody = await resolveTextTemplate(prisma, typeKey, tokens, fullStudent);

    await sendParentNotificationSafe({
      prisma,
      student: fullStudent,
      type: typeKey,
      textBody,
      sentByUserId
    });
  } catch (err) {
    console.error('Auto notify payment added failed:', err);
  }
}

module.exports = {
  autoNotifyAttendance,
  autoNotifyExamGrades,
  autoNotifySession,
  autoNotifyPaymentAdded
};
