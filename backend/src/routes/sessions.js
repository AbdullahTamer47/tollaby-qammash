const express = require('express');
const router = express.Router();
const { requireTeacher, requirePermission } = require('../middleware/auth');
const { reconcileManyStudents } = require('../utils/wallet');
const { getSessionCosts } = require('../utils/payments');
const { logAction } = require('../utils/logAction');
const { autoNotifySession, autoNotifyAttendance } = require('../utils/autoNotify');
const { runBackgroundTask } = require('../utils/backgroundTask');

// GET /api/sessions  (active only)
router.get('/', requirePermission('sessions'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { all } = req.query;
  try {
    const where = all === 'true' ? {} : { active: true };
    const sessions = await prisma.session.findMany({
      where,
      include: { group: true },
      orderBy: { date: 'desc' }
    });
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sessions
router.post('/', requirePermission('sessions'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { groupId, grade, title, type, description, location, duration, price, date, active } = req.body;
  const isLecture = type === 'lecture';
  try {
    if (isLecture && !grade) return res.status(400).json({ error: 'الصف الدراسي مطلوب للمحاضرة' });
    if (!isLecture && !groupId) return res.status(400).json({ error: 'المجموعة مطلوبة للحصة' });

    const session = await prisma.session.create({
      data: {
        groupId: isLecture ? null : parseInt(groupId),
        grade: isLecture ? grade : null,
        title,
        type: isLecture ? 'lecture' : 'session',
        description: description || null,
        location: location || null,
        duration: parseFloat(duration),
        price: parseFloat(price),
        date: date ? new Date(date) : new Date(),
        active: !!active
      },
      include: { group: true }
    });
    await logAction(prisma, req, `إضافة ${isLecture ? 'محاضرة' : 'حصة'} ${title}`, 'POST');
    res.status(201).json(session);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/sessions/bulk-create
router.post('/bulk-create', requirePermission('sessions'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { bulkType, groupId, grade, sessionName, sessionType, sessionMonth, startDate, endDate, numberOfSessions, sessionDays, sessionHour, duration, price } = req.body;
  const isLecture = sessionType === 'lecture';

  try {
    if (isLecture && !grade) return res.status(400).json({ error: 'الصف الدراسي مطلوب للمحاضرة' });
    if (!isLecture && !groupId) return res.status(400).json({ error: 'المجموعة مطلوبة للحصة' });

    const days = (Array.isArray(sessionDays) ? sessionDays : [sessionDays]).map(Number);
    const [hourStr, minuteStr] = (sessionHour || '08:00').split(':');
    const hour = parseInt(hourStr);
    const minute = parseInt(minuteStr);

    const created = [];
    const dates = [];

    if (bulkType === 'monthly') {
      const year = new Date().getFullYear();
      const month = parseInt(sessionMonth);
      const daysInMonth = new Date(year, month, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month - 1, day, hour, minute);
        if (days.includes(d.getDay())) dates.push(d);
      }
    } else if (bulkType === 'weekly' && startDate && endDate) {
      let current = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      while (current <= end) {
        if (days.includes(current.getDay())) {
          const d = new Date(current);
          d.setHours(hour, minute, 0, 0);
          dates.push(d);
        }
        current.setDate(current.getDate() + 1);
      }
    } else if (bulkType === 'number' && startDate && numberOfSessions) {
      let current = new Date(startDate);
      while (dates.length < numberOfSessions) {
        if (days.includes(current.getDay())) {
          const d = new Date(current);
          d.setHours(hour, minute, 0, 0);
          dates.push(d);
        }
        current.setDate(current.getDate() + 1);
      }
    }

    // Sort and limit to a reasonable number just in case
    dates.sort((a, b) => a - b).splice(50); // limit to max 50 sessions at a time

    // Wrap in transaction so either all sessions are created or none
    await prisma.$transaction(async tx => {
      for (let i = 0; i < dates.length; i++) {
        const d = dates[i];
        const session = await tx.session.create({
          data: {
            groupId: isLecture ? null : parseInt(groupId),
            grade: isLecture ? grade : null,
            title: `${sessionName} - ${i + 1}`,
            type: isLecture ? 'lecture' : 'session',
            duration: parseFloat(duration),
            price: parseFloat(price),
            date: d
          }
        });
        created.push(session);
      }
      await logAction(tx, req, `إنشاء ${created.length} حصة بالجملة`, 'POST');
    });
    res.json({ created: created.length, sessions: created });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/sessions/:id
router.get('/:id', requirePermission('sessions'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const session = await prisma.session.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { group: true }
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/sessions/:id
router.put('/:id', requirePermission('sessions'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { groupId, grade, title, type, description, location, duration, price, date, active } = req.body;
  const isLecture = type === 'lecture';
  try {
    if (isLecture && !grade) return res.status(400).json({ error: 'الصف الدراسي مطلوب للمحاضرة' });
    if (!isLecture && !groupId) return res.status(400).json({ error: 'المجموعة مطلوبة للحصة' });

    const session = await prisma.$transaction(async tx => {
      const sessionId = parseInt(req.params.id);
      const existing = await tx.session.findUnique({ where: { id: sessionId } });
      if (!existing) throw new Error('Session not found');

      const oldAttendance = await tx.attendance.findMany({
        where: { sessionId },
        select: { studentId: true }
      });
      const affectedStudentIds = new Set(oldAttendance.map(a => a.studentId));

      const nextGroupId = isLecture ? null : parseInt(groupId);
      const nextGrade = isLecture ? grade : null;

      const targetChanged = isLecture
        ? (existing.type !== 'lecture' || existing.grade !== nextGrade)
        : (existing.type !== 'session' || existing.groupId !== nextGroupId);

      if (targetChanged) {
        const newTargetStudents = isLecture
          ? await tx.student.findMany({ where: { group: { grade: nextGrade } }, select: { id: true } })
          : await tx.student.findMany({ where: { groupId: nextGroupId }, select: { id: true } });
        const newTargetStudentIds = new Set(newTargetStudents.map(s => s.id));
        newTargetStudents.forEach(s => affectedStudentIds.add(s.id));

        await tx.attendance.deleteMany({
          where: {
            sessionId,
            studentId: { notIn: [...newTargetStudentIds] }
          }
        });
      }

      const updated = await tx.session.update({
        where: { id: sessionId },
        data: {
          groupId: nextGroupId,
          grade: nextGrade,
          title,
          type: isLecture ? 'lecture' : 'session',
          description: description || null,
          location: location || null,
          duration: parseFloat(duration),
          price: parseFloat(price),
          date: date ? new Date(date) : undefined,
          active: !!active
        },
        include: { group: true }
      });
      await reconcileManyStudents(tx, [...affectedStudentIds]);
      await logAction(tx, req, `تعديل ${isLecture ? 'محاضرة' : 'حصة'} ${title}`, 'PUT');
      return updated;
    });
    res.json(session);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/sessions/:id/notify
router.post('/:id/notify', requirePermission('sessions'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const sessionId = parseInt(req.params.id);
  const { action = 'created' } = req.body;
  try {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    const stats = await autoNotifySession(prisma, sessionId, action, req.session.userId);
    await logAction(prisma, req, `إرسال تنبيه (${action}) لـ ${session.title}`, 'POST');
    res.json({ success: true, ...stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sessions/month/:groupId/:year/:month
router.delete('/month/:groupId/:year/:month', requirePermission('sessions'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { groupId, year, month } = req.params;
  try {
    const start = new Date(parseInt(year), parseInt(month) - 1, 1);
    const end = new Date(parseInt(year), parseInt(month), 1);
    const count = await prisma.$transaction(async tx => {
      const sessions = await tx.session.findMany({
        where: {
          groupId: parseInt(groupId),
          date: { gte: start, lt: end }
        },
        select: { id: true }
      });
      const sessionIds = sessions.map(s => s.id);
      const attendance = await tx.attendance.findMany({ where: { sessionId: { in: sessionIds } }, select: { studentId: true } });
      const result = await tx.session.deleteMany({ where: { id: { in: sessionIds } } });
      await reconcileManyStudents(tx, attendance.map(a => a.studentId));
      await logAction(tx, req, `حذف ${result.count} حصة لشهر ${month}/${year}`, 'DELETE');
      return result.count;
    });
    res.json({ deleted: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sessions/month-by-grade/:grade/:year/:month
// حذف محاضرات صف دراسي كامل خلال شهر معين
router.delete('/month-by-grade/:grade/:year/:month', requirePermission('sessions'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { grade, year, month } = req.params;
  try {
    const start = new Date(parseInt(year), parseInt(month) - 1, 1);
    const end = new Date(parseInt(year), parseInt(month), 1);
    const count = await prisma.$transaction(async tx => {
      const sessions = await tx.session.findMany({
        where: {
          type: 'lecture',
          grade: decodeURIComponent(grade),
          date: { gte: start, lt: end }
        },
        select: { id: true }
      });
      const sessionIds = sessions.map(s => s.id);
      const attendance = await tx.attendance.findMany({ where: { sessionId: { in: sessionIds } }, select: { studentId: true } });
      const result = await tx.session.deleteMany({ where: { id: { in: sessionIds } } });
      await reconcileManyStudents(tx, attendance.map(a => a.studentId));
      await logAction(tx, req, `حذف ${result.count} محاضرة لشهر ${month}/${year}`, 'DELETE');
      return result.count;
    });
    res.json({ deleted: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sessions/:id
router.delete('/:id', requirePermission('sessions'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const sessionId = parseInt(req.params.id);
    await prisma.$transaction(async tx => {
      const session = await tx.session.findUnique({ where: { id: sessionId } });
      const attendance = await tx.attendance.findMany({ where: { sessionId }, select: { studentId: true } });
      await tx.session.delete({ where: { id: sessionId } });
      await reconcileManyStudents(tx, attendance.map(a => a.studentId));
      await logAction(tx, req, `حذف حصة ${session?.title}`, 'DELETE');
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sessions/:id/toggle-active
router.post('/:id/toggle-active', requireTeacher, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const session = await prisma.session.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const updated = await prisma.session.update({
      where: { id: parseInt(req.params.id) },
      data: { active: !session.active }
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sessions/:id/attendance
router.get('/:id/attendance', requirePermission('attendance'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const sessionId = parseInt(req.params.id);
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { group: true }
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const isLecture = session.type === 'lecture';
    const targetStudents = isLecture
      ? await prisma.student.findMany({ where: { group: { grade: session.grade } }, include: { offer: true, group: true } })
      : await prisma.student.findMany({ where: { groupId: session.groupId }, include: { offer: true, group: true } });

    // Ensure all target students have an attendance record
    for (const student of targetStudents) {
      await prisma.attendance.upsert({
        where: { studentId_sessionId: { studentId: student.id, sessionId } },
        create: { studentId: student.id, sessionId, isAttendant: false },
        update: {}
      });
    }

    const attendance = await prisma.attendance.findMany({
      where: { sessionId },
      include: { student: { include: { offer: true, group: true } } },
      orderBy: { student: { name: 'asc' } }
    });
    res.json({ session, attendance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sessions/:id/attendance/edit
router.post('/:id/attendance/edit', requirePermission('attendance'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const sessionId = parseInt(req.params.id);
  const { bulk_action, student_id, selected_students } = req.body;

  try {
    const affectedResult = await prisma.$transaction(async tx => {
      const session = await tx.session.findUnique({ where: { id: sessionId } });
      if (!session) throw new Error('Session not found');

      const isLecture = session.type === 'lecture';
      const targetStudentsList = isLecture
        ? await tx.student.findMany({ where: { group: { grade: session.grade } }, select: { id: true } })
        : await tx.student.findMany({ where: { groupId: session.groupId }, select: { id: true } });
      const groupStudentIds = new Set(targetStudentsList.map(s => s.id));
      let affectedStudents = new Set();

      const ensureAttendance = async studentIds => {
        for (const studentId of studentIds) {
          if (!groupStudentIds.has(studentId)) continue;
          await tx.attendance.upsert({
            where: { studentId_sessionId: { studentId, sessionId } },
            create: { studentId, sessionId, isAttendant: false },
            update: {}
          });
        }
      };

      if (bulk_action) {
        const selectedIds = (Array.isArray(selected_students) ? selected_students : [selected_students]).map(Number).filter(Boolean);
        await ensureAttendance(selectedIds);

        if (bulk_action === 'mark_present') {
          await tx.attendance.updateMany({ where: { studentId: { in: selectedIds.filter(id => groupStudentIds.has(id)) }, sessionId }, data: { isAttendant: true } });
          selectedIds.filter(id => groupStudentIds.has(id)).forEach(id => affectedStudents.add(id));
        } else if (bulk_action === 'mark_absent') {
          await tx.attendance.updateMany({ where: { studentId: { in: selectedIds.filter(id => groupStudentIds.has(id)) }, sessionId }, data: { isAttendant: false } });
          selectedIds.filter(id => groupStudentIds.has(id)).forEach(id => affectedStudents.add(id));
        } else if (bulk_action === 'toggle_selected') {
          const records = await tx.attendance.findMany({ where: { studentId: { in: selectedIds }, sessionId } });
          for (const r of records) {
            await tx.attendance.update({ where: { id: r.id }, data: { isAttendant: !r.isAttendant } });
            affectedStudents.add(r.studentId);
          }
        } else if (bulk_action === 'toggle_all') {
          const records = await tx.attendance.findMany({ where: { sessionId } });
          for (const r of records) {
            await tx.attendance.update({ where: { id: r.id }, data: { isAttendant: !r.isAttendant } });
            affectedStudents.add(r.studentId);
          }
        } else if (bulk_action === 'mark_all_present') {
          const records = await tx.attendance.findMany({ where: { sessionId } });
          await tx.attendance.updateMany({ where: { sessionId }, data: { isAttendant: true } });
          records.forEach(r => affectedStudents.add(r.studentId));
        } else if (bulk_action === 'mark_all_absent') {
          const records = await tx.attendance.findMany({ where: { sessionId } });
          await tx.attendance.updateMany({ where: { sessionId }, data: { isAttendant: false } });
          records.forEach(r => affectedStudents.add(r.studentId));
        }
      } else if (student_id) {
        const targetStudentId = parseInt(student_id);
        if (!groupStudentIds.has(targetStudentId)) throw new Error(isLecture ? 'الطالب ليس ضمن هذا الصف الدراسي' : 'Student is not in this session group');
        await ensureAttendance([targetStudentId]);
        const record = await tx.attendance.findUnique({
          where: { studentId_sessionId: { studentId: targetStudentId, sessionId } }
        });
        if (record) {
          await tx.attendance.update({ where: { id: record.id }, data: { isAttendant: !record.isAttendant } });
          affectedStudents.add(record.studentId);
        }
      }

      await reconcileManyStudents(tx, [...affectedStudents]);
      await logAction(tx, req, `تحديث حضور ${isLecture ? 'المحاضرة' : 'الحصة'} ${sessionId}`, 'POST');
      return affectedStudents;
    });
    res.json({ success: true });
    if (affectedResult && affectedResult.size > 0) {
      runBackgroundTask(
        () => autoNotifyAttendance(prisma, sessionId, Array.from(affectedResult), req.session.userId),
        'auto notify attendance'
      );
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sessions/:id/attendance/scan
router.post('/:id/attendance/scan', requirePermission('attendance'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const sessionId = parseInt(req.params.id);
  const { student_id, autoPay } = req.body;
  try {
    const studentId = parseInt(student_id);
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return res.status(404).json({ success: false, message: 'الحصة غير موجودة' });
    const student = await prisma.student.findUnique({ where: { id: studentId }, include: { group: true } });
    if (!student) return res.status(404).json({ success: false, message: 'لم يتم العثور على الطالب' });

    const isLecture = session.type === 'lecture';
    const belongsToTarget = isLecture
      ? student.group?.grade === session.grade
      : student.groupId === session.groupId;
    if (!belongsToTarget) {
      return res.status(409).json({ success: false, message: isLecture ? 'هذا الطالب ليس ضمن صف هذه المحاضرة' : 'هذا الطالب ليس ضمن مجموعة هذه الحصة' });
    }

    const record = await prisma.attendance.upsert({
      where: { studentId_sessionId: { studentId, sessionId } },
      create: { studentId, sessionId, isAttendant: true },
      update: { isAttendant: true }
    });

    await reconcileManyStudents(prisma, [studentId]);

    let updatedRecord = await prisma.attendance.findUnique({ where: { id: record.id }, include: { session: true } });
    let autoPaidAmount = 0;

    if (autoPay) {
      const studentWithOffer = await prisma.student.findUnique({ where: { id: studentId }, include: { offer: true } });
      const attendances = await prisma.attendance.findMany({
        where: { studentId, isAttendant: true },
        include: { session: true },
        orderBy: { session: { date: 'asc' } }
      });
      const sessionCosts = getSessionCosts(studentWithOffer, attendances);
      const sessionCost = sessionCosts.get(record.id) || 0;
      autoPaidAmount = Math.max(0, Math.round((sessionCost - (updatedRecord.amountPaid || 0)) * 100) / 100);

      if (autoPaidAmount > 0) {
        await prisma.eachPayment.create({
          data: {
            studentId,
            amount: autoPaidAmount,
            type: 'sessions',
            targetName: updatedRecord.session?.title || 'دفع حصة',
            allocations: '[]'
          }
        });
        await reconcileManyStudents(prisma, [studentId]);
        updatedRecord = await prisma.attendance.findUnique({ where: { id: record.id } });
      }
    }

    res.json({
      success: true,
      student_id: student.id,
      student_name: student.name,
      group_name: student.group.name,
      is_attendant: updatedRecord.isAttendant,
      amount_paid: updatedRecord.amountPaid, // Let the frontend know if it was auto-paid
      auto_paid: autoPaidAmount,
      changed: true
    });
    
    // Auto notify
    runBackgroundTask(
      () => autoNotifyAttendance(prisma, sessionId, [student.id], req.session.userId),
      'auto notify attendance scan'
    );
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
