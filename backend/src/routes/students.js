const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/auth');
const { summarizeStudentPayments } = require('../utils/payments');
const { reconcileStudentPayments } = require('../utils/wallet');
const { logAction } = require('../utils/logAction');

// GET /api/students
router.get('/', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { q, page = 1, per_page = 15, groupId, active, grade, sex } = req.query;
  try {
    const where = {
      ...(q && {
        OR: [
          { name: { contains: q } },
          { id: isNaN(q) ? undefined : { equals: parseInt(q) } },
          { phoneNumber: { contains: q } },
          { dadPhoneNumber: { contains: q } }
        ].filter(Boolean)
      }),
      ...(groupId && { groupId: parseInt(groupId) }),
      ...(active !== undefined && active !== '' && { active: active === 'true' }),
      ...(sex && { sex }),
      ...(grade && { group: { grade } })
    };
    const skip = (parseInt(page) - 1) * parseInt(per_page);
    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where, skip, take: parseInt(per_page),
        orderBy: { id: 'asc' },
        include: { group: true, offer: true }
      }),
      prisma.student.count({ where })
    ]);
    res.json({ students, total, page: parseInt(page), per_page: parseInt(per_page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/students
router.post('/', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const name = req.body.name;
  const phoneNumber = req.body.phoneNumber || req.body.phone;
  const dadPhoneNumber = req.body.dadPhoneNumber || req.body.parent_phone || req.body.parentPhone;
  const sex = req.body.sex || 'male';
  const rawGroupId = req.body.groupId || req.body.group_id;
  const rawOfferId = req.body.offerId || req.body.offer_id;
  const active = req.body.active !== undefined ? req.body.active : true;
  try {
    const parsedGroupId = parseInt(rawGroupId);
    let parsedOfferId = parseInt(rawOfferId);
    if (!Number.isInteger(parsedGroupId)) return res.status(400).json({ error: 'Group is required' });
    if (!Number.isInteger(parsedOfferId)) {
      const defaultOffer = await prisma.offer.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1, title: 'بدون خصم', type: 'percentage', value: 0 }
      });
      parsedOfferId = defaultOffer.id;
    }
    const student = await prisma.student.create({
      data: { name, phoneNumber, dadPhoneNumber, sex, groupId: parsedGroupId, offerId: parsedOfferId, active: !!active },
      include: { group: true, offer: true }
    });
    await logAction(prisma, req, `إضافة طالب ${name}`, 'POST');
    res.status(201).json(student);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/students/barcodes?group_id=
router.get('/barcodes/print', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { group_id } = req.query;
  try {
    const where = group_id ? { groupId: parseInt(group_id) } : {};
    const [students, groups] = await Promise.all([
      prisma.student.findMany({ where, include: { group: true }, orderBy: { id: 'asc' } }),
      prisma.group.findMany({ orderBy: { name: 'asc' } })
    ]);
    res.json({ students, groups, selectedGroupId: group_id ? parseInt(group_id) : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/students/:id
router.get('/:id', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const student = await prisma.student.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { group: true, offer: true }
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/students/:id
router.put('/:id', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const name = req.body.name;
  const phoneNumber = req.body.phoneNumber || req.body.phone;
  const dadPhoneNumber = req.body.dadPhoneNumber || req.body.parent_phone || req.body.parentPhone;
  const sex = req.body.sex;
  const rawGroupId = req.body.groupId || req.body.group_id;
  const rawOfferId = req.body.offerId || req.body.offer_id;
  const active = req.body.active;
  try {
    const parsedGroupId = rawGroupId !== undefined ? parseInt(rawGroupId) : undefined;
    let parsedOfferId = rawOfferId !== undefined ? parseInt(rawOfferId) : undefined;
    if (parsedGroupId !== undefined && !Number.isInteger(parsedGroupId)) return res.status(400).json({ error: 'Group is required' });
    if (!Number.isInteger(parsedOfferId)) {
      const defaultOffer = await prisma.offer.upsert({
        where: { id: 1 },
        update: {},
        create: { id: 1, title: 'بدون خصم', type: 'percentage', value: 0 }
      });
      parsedOfferId = defaultOffer.id;
    }
    const student = await prisma.$transaction(async tx => {
      const updated = await tx.student.update({
        where: { id: parseInt(req.params.id) },
        data: { name, phoneNumber, dadPhoneNumber, sex, groupId: parsedGroupId, offerId: parsedOfferId, active: !!active },
        include: { group: true, offer: true }
      });
      await reconcileStudentPayments(tx, updated.id);
      await logAction(tx, req, `تعديل الطالب ${name}`, 'PUT');
      return updated;
    });
    res.json(student);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/students/:id
router.delete('/:id', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const student = await prisma.student.findUnique({ where: { id: parseInt(req.params.id) } });
    await prisma.student.delete({ where: { id: parseInt(req.params.id) } });
    await logAction(prisma, req, `حذف الطالب ${student?.name}`, 'DELETE');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/students/:id/activate  - toggle active
router.post('/:id/activate', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const student = await prisma.student.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const updated = await prisma.student.update({
      where: { id: parseInt(req.params.id) },
      data: { active: !student.active }
    });
    await logAction(prisma, req, `تغيير حالة الطالب ${student.name}`, 'POST');
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/students/:id/change-group
router.post('/:id/change-group', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { groupId } = req.body;
  try {
    const student = await prisma.$transaction(async tx => {
      const updated = await tx.student.update({
        where: { id: parseInt(req.params.id) },
        data: { groupId: parseInt(groupId) },
        include: { group: true }
      });
      await reconcileStudentPayments(tx, updated.id);
      await logAction(tx, req, `نقل الطالب ${updated.name} إلى مجموعة ${updated.group.name}`, 'POST');
      return updated;
    });
    res.json(student);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/students/:id/dashboard
router.get('/:id/dashboard', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const studentId = parseInt(req.params.id);
  if (isNaN(studentId)) {
    return res.status(400).json({ error: 'Invalid student ID' });
  }
  
  try {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { group: true, offer: true }
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const [allAttendance, eachPayments, examResults, allGroups] = await Promise.all([
      prisma.attendance.findMany({
        where: { studentId },
        include: { session: { include: { group: true } } },
        orderBy: { session: { date: 'desc' } }
      }),
      prisma.eachPayment.findMany({ where: { studentId }, orderBy: { lastPaymentDate: 'desc' } }),
      prisma.studentDegree.findMany({
        where: { studentId },
        include: { exam: true },
        orderBy: { examId: 'desc' }
      }),
      prisma.group.findMany({ orderBy: [{ grade: 'asc' }, { name: 'asc' }] })
    ]);

    const attended = allAttendance.filter(a => a.isAttendant);
    const totalAttended = attended.length;
    const totalGroupSessions = allAttendance.length;
    const attendancePercentage = totalGroupSessions > 0 ? (totalAttended / totalGroupSessions) * 100 : 0;

    // Books logic
    const studentGrade = student.group?.grade;
    const allBooks = await prisma.book.findMany();
    const availableBooks = allBooks.filter(b => !b.grade || b.grade === studentGrade);
    
    const bookBookings = await prisma.bookBooking.findMany({
      where: { studentId },
      include: { book: true }
    });
    const bookedBookIds = bookBookings.map(b => b.bookId);

    student.bookBookings = bookBookings;
    student.attendance = allAttendance;
    student.eachPayments = eachPayments;
    const paymentSummary = summarizeStudentPayments(student);

    res.json({
      student,
      allAttendance,
      totalGroupSessions,
      totalAttended,
      attendancePercentage,
      payment: paymentSummary,
      eachPayments,
      examResults,
      allGroups,
      totalSessionCost: paymentSummary.sessionsDue,
      discountAmount: 0,
      finalAmountAfterDiscount: paymentSummary.sessionsDue,
      availableBooks,
      bookedBookIds
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
