const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');
const { autoNotifyExamGrades } = require('../utils/autoNotify');

// GET /api/exams
router.get('/', requirePermission('exams'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { page = 1, per_page = 15, groupId, grade } = req.query;
  try {
    const skip = (parseInt(page) - 1) * parseInt(per_page);
    const where = {
      ...(groupId && { groupId: parseInt(groupId) }),
      ...(grade && { grade })
    };
    const [exams, total] = await Promise.all([
      prisma.exam.findMany({
        where,
        skip, take: parseInt(per_page),
        include: { group: true },
        orderBy: { id: 'desc' }
      }),
      prisma.exam.count({ where })
    ]);
    res.json({ exams, total, page: parseInt(page), per_page: parseInt(per_page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/exams
router.post('/', requirePermission('exams'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { title, totalDegree, minPassDegree, groupId, grade } = req.body;
  try {
    const total = parseFloat(totalDegree);
    const minPass = parseFloat(minPassDegree || 0);
    if (!Number.isFinite(total) || total <= 0) return res.status(400).json({ error: 'Invalid total degree' });
    if (!Number.isFinite(minPass) || minPass < 0 || minPass > total) return res.status(400).json({ error: 'Invalid minimum pass degree' });
    const exam = await prisma.exam.create({
      data: { title, totalDegree: total, minPassDegree: minPass, groupId: groupId ? parseInt(groupId) : null, grade: grade || null },
      include: { group: true }
    });
    await logAction(prisma, req, `إضافة امتحان ${title}`, 'POST');
    res.status(201).json(exam);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/exams/:id
router.get('/:id', requirePermission('exams'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const exam = await prisma.exam.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { group: true }
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    res.json(exam);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/exams/:id
router.put('/:id', requirePermission('exams'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { title, totalDegree, minPassDegree, groupId, grade } = req.body;
  try {
    const total = parseFloat(totalDegree);
    const minPass = parseFloat(minPassDegree || 0);
    if (!Number.isFinite(total) || total <= 0) return res.status(400).json({ error: 'Invalid total degree' });
    if (!Number.isFinite(minPass) || minPass < 0 || minPass > total) return res.status(400).json({ error: 'Invalid minimum pass degree' });
    const exam = await prisma.exam.update({
      where: { id: parseInt(req.params.id) },
      data: { title, totalDegree: total, minPassDegree: minPass, groupId: groupId ? parseInt(groupId) : null, grade: grade || null },
      include: { group: true }
    });
    await logAction(prisma, req, `تعديل امتحان ${title}`, 'PUT');
    res.json(exam);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/exams/:id
router.delete('/:id', requirePermission('exams'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const exam = await prisma.exam.findUnique({ where: { id: parseInt(req.params.id) } });
    await prisma.exam.delete({ where: { id: parseInt(req.params.id) } });
    await logAction(prisma, req, `حذف امتحان ${exam?.title}`, 'DELETE');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/exams/:id/degrees
router.get('/:id/degrees', requirePermission('exams'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const examId = parseInt(req.params.id);
  try {
    const exam = await prisma.exam.findUnique({ where: { id: examId }, include: { group: true } });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    // Ensure targeted students have a degree record
    let where = {};
    if (exam.groupId) {
      where.groupId = exam.groupId;
    } else if (exam.grade) {
      where.group = { grade: exam.grade };
    }

    const students = await prisma.student.findMany({ where });
    for (const student of students) {
      await prisma.studentDegree.upsert({
        where: { studentId_examId: { studentId: student.id, examId } },
        create: { studentId: student.id, examId },
        update: {}
      });
    }

    const degrees = await prisma.studentDegree.findMany({
      where: { examId },
      include: { student: true },
      orderBy: { studentDegree : 'desc' }
    });
    res.json({ exam, degrees });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/exams/:id/degrees/edit
router.post('/:id/degrees/edit', requirePermission('exams'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const examId = parseInt(req.params.id);
  const { degrees } = req.body; // [{ studentId, degree }]
  try {
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    for (const { studentId, degree } of degrees) {
      const parsedStudentId = parseInt(studentId);
      const parsedDegree = degree !== '' && degree !== null ? parseFloat(degree) : null;
      if (parsedDegree !== null && (!Number.isFinite(parsedDegree) || parsedDegree < 0 || parsedDegree > exam.totalDegree)) {
        return res.status(400).json({ error: 'Invalid student degree' });
      }

      const student = await prisma.student.findUnique({
        where: { id: parsedStudentId },
        include: { group: true }
      });
      if (!student) return res.status(404).json({ error: 'Student not found' });
      if (exam.groupId && student.groupId !== exam.groupId) return res.status(400).json({ error: 'Student is outside exam group' });
      if (exam.grade && student.group?.grade !== exam.grade) return res.status(400).json({ error: 'Student is outside exam grade' });

      await prisma.studentDegree.upsert({
        where: { studentId_examId: { studentId: parseInt(studentId), examId } },
        create: { studentId: parsedStudentId, examId, studentDegree: parsedDegree },
        update: { studentDegree: parsedDegree }
      });
    }
    await logAction(prisma, req, `تعديل درجات امتحان ${examId}`, 'POST');
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/exams/:id/notify
router.post('/:id/notify', requirePermission('exams'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const examId = parseInt(req.params.id);
  try {
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const degrees = await prisma.studentDegree.findMany({
      where: { examId, studentDegree: { not: null } },
      select: { studentId: true }
    });
    const studentIds = degrees.map(d => d.studentId);
    let stats = { sent: 0, archived: 0, skipped: 0, failed: 0 };
    if (studentIds.length > 0) {
      stats = await autoNotifyExamGrades(prisma, examId, studentIds, req.session.userId);
    }
    await logAction(prisma, req, `إرسال درجات امتحان ${exam.title}`, 'POST');
    res.json({ success: true, count: studentIds.length, ...stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
