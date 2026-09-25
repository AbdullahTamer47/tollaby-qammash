const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/auth');
const { sendParentNotificationSafe, resolveTextTemplate } = require('../utils/notificationHelpers');

// ============================================================
// GET /api/notifications/status — حالة إعدادات الإشعارات
// ============================================================
router.get('/status', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const dbTemplates = await prisma.notificationTemplate.groupBy({
      by: ['type'],
      where: { active: true },
      _count: { type: true }
    });
    const dbTemplateTypes = Object.fromEntries(dbTemplates.map(t => [t.type, t._count.type]));

    res.json({
      whatsapp: {}, // Removed Meta templates support
      dbTemplates: dbTemplateTypes,
      hasWhatsappToken: !!process.env.WHATSAPP_TOKEN,
      requireTrigger: true // Now strictly relies on conversation triggers
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/notifications/attendance/:sessionId
// إرسال إشعار حضور/غياب لجميع أولياء أمور طلاب الحصة
// ============================================================
router.post('/attendance/:sessionId', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const sessionId = parseInt(req.params.sessionId);
  const { dryRun = false } = req.body;

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { group: true }
    });
    if (!session) return res.status(404).json({ error: 'الحصة غير موجودة' });

    const attendance = await prisma.attendance.findMany({
      where: { sessionId },
      include: { student: { include: { group: true } } }
    });

    const results = [];
    for (const record of attendance) {
      const student = record.student;
      if (!student.dadPhoneNumber) continue;

      const status = record.isAttendant ? 'حاضر ✅' : 'غائب ❌';
      const dateStr = new Date(session.date).toLocaleDateString('ar-EG');

      const tokens = {
        'كود_الطالب': student.id,
        'اسم_الطالب': student.name,
        'عنوان_الحصة': session.title,
        'الحضور': status,
        'التاريخ': dateStr,
        'المكان': session.location || '-',
        'الوصف': session.description || '-'
      };

      const typeKey = record.isAttendant ? 'attendance_present' : 'attendance_absent';
      const textBody = await resolveTextTemplate(prisma, typeKey, tokens, student);

      const result = await sendParentNotificationSafe({
        prisma,
        student,
        type: typeKey,
        textBody,
        sentByUserId: req.session.userId,
        dryRun
      });

      results.push({ studentId: student.id, studentName: student.name, ...result });
    }

    const summary = {
      total: results.length,
      sent: results.filter(r => r.sent).length,
      skipped: results.filter(r => !r.sent && r.method === 'skipped').length,
      failed: results.filter(r => r.method === 'failed').length,
      byText: results.filter(r => r.method === 'text').length,
      byTemplate: results.filter(r => r.method === 'template').length,
      dryRun,
      results
    };
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/notifications/exam/:examId
// إرسال درجات الامتحان لأولياء الأمور
// ============================================================
router.post('/exam/:examId', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const examId = parseInt(req.params.examId);
  const { dryRun = false } = req.body;

  try {
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        studentDegrees: {
          include: { student: { include: { group: true } } }
        }
      }
    });
    if (!exam) return res.status(404).json({ error: 'الامتحان غير موجود' });

    const results = [];
    for (const deg of exam.studentDegrees) {
      const student = deg.student;
      if (!student.dadPhoneNumber) continue;
      if (deg.studentDegree === null || deg.studentDegree === undefined) continue;

      const tokens = {
        'كود_الطالب': student.id,
        'اسم_الطالب': student.name,
        'عنوان_الامتحان': exam.title,
        'الدرجة': deg.studentDegree,
        'الدرجة_الكلية': exam.totalDegree
      };

      const typeKey = deg.studentDegree >= exam.minPassDegree ? 'exam_grade_good' : 'exam_grade_bad';
      const textBody = await resolveTextTemplate(prisma, typeKey, tokens, student);

      const result = await sendParentNotificationSafe({
        prisma,
        student,
        type: typeKey,
        textBody,
        sentByUserId: req.session.userId,
        dryRun
      });

      results.push({ studentId: student.id, studentName: student.name, degree: deg.studentDegree, ...result });
    }

    res.json({
      total: results.length,
      sent: results.filter(r => r.sent).length,
      skipped: results.filter(r => !r.sent && r.method === 'skipped').length,
      failed: results.filter(r => r.method === 'failed').length,
      byText: results.filter(r => r.method === 'text').length,
      byTemplate: results.filter(r => r.method === 'template').length,
      dryRun,
      results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/notifications/session/:sessionId/:action
// action: "created" | "updated"
// إشعار إضافة/تعديل حصة أو محاضرة
// ============================================================
router.post('/session/:sessionId/:action', requirePermission('chat'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const sessionId = parseInt(req.params.sessionId);
  const action = req.params.action; // "created" | "updated"
  const { dryRun = false } = req.body;

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        group: {
          include: { students: true }
        }
      }
    });
    if (!session) return res.status(404).json({ error: 'الحصة غير موجودة' });

    const isLecture = session.type === 'lecture';
    const typeKey = isLecture ? 'new_lecture' : 'new_session';

    const targetStudents = isLecture
      ? await prisma.student.findMany({ where: { group: { grade: session.grade } }, include: { group: true } })
      : (session.group?.students || []);

    const dateStr = new Date(session.date).toLocaleDateString('ar-EG');
    const timeStr = new Date(session.date).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    const results = [];
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

      const result = await sendParentNotificationSafe({
        prisma,
        student,
        type: typeKey,
        textBody,
        sentByUserId: req.session.userId,
        dryRun
      });

      results.push({ studentId: student.id, studentName: student.name, ...result });
    }

    res.json({
      total: results.length,
      sent: results.filter(r => r.sent).length,
      skipped: results.filter(r => !r.sent && r.method === 'skipped').length,
      failed: results.filter(r => r.method === 'failed').length,
      byText: results.filter(r => r.method === 'text').length,
      byTemplate: results.filter(r => r.method === 'template').length,
      dryRun,
      results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
