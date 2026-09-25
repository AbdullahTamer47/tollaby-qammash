const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { summarizeStudentPayments } = require('../utils/payments');

// GET /api/search?q=
router.get('/', requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  const q = (req.query.q || '').trim();
  const isTeacher = req.session.role === 'teacher';
  const permissions = Array.isArray(req.session.permissions) ? req.session.permissions : [];
  const can = permission => isTeacher || permissions.includes(permission);
  if (!q) return res.json({ query: q, students: [], students_count: 0, groups: [], groups_count: 0, sessions: [], sessions_count: 0, exams: [], exams_count: 0, payments: [], payments_count: 0, books: [], books_count: 0 });

  const numericId = parseInt(q);
  const isNumeric = !isNaN(numericId);

  try {
    const [students, groups, sessions, exams, paymentStudents, books] = await Promise.all([
      can('students') ? prisma.student.findMany({
        where: { OR: [{ name: { contains: q } }, ...(isNumeric ? [{ id: { equals: numericId } }] : [])] },
        include: { group: true, offer: true },
        orderBy: { id: 'asc' },
        take: 20
      }) : Promise.resolve([]),
      can('groups') ? prisma.group.findMany({
        where: { OR: [{ name: { contains: q } }, { grade: { contains: q } }] },
        orderBy: { name: 'asc' },
        take: 20
      }) : Promise.resolve([]),
      can('sessions') ? prisma.session.findMany({
        where: { OR: [{ title: { contains: q } }, { group: { name: { contains: q } } }, { group: { grade: { contains: q } } }] },
        include: { group: true },
        orderBy: { date: 'desc' },
        take: 20
      }) : Promise.resolve([]),
      can('exams') ? prisma.exam.findMany({
        where: { OR: [{ title: { contains: q } }, { group: { name: { contains: q } } }, { group: { grade: { contains: q } } }] },
        include: { group: true },
        orderBy: { id: 'desc' },
        take: 20
      }) : Promise.resolve([]),
      can('payments') ? prisma.student.findMany({
        where: { OR: [{ name: { contains: q } }, ...(isNumeric ? [{ id: { equals: numericId } }] : [])] },
        include: {
          group: true,
          offer: true,
          attendance: { include: { session: true } },
          bookBookings: { include: { book: true } },
          eachPayments: true
        },
        orderBy: { id: 'asc' },
        take: 20
      }) : Promise.resolve([]),
      can('books') ? prisma.book.findMany({
        where: { OR: [{ title: { contains: q } }, { grade: { contains: q } }] },
        orderBy: { title: 'asc' },
        take: 20
      }) : Promise.resolve([])
    ]);

    const payments = paymentStudents.map(student => ({
      studentId: student.id,
      student,
      ...summarizeStudentPayments(student)
    }));

    res.json({
      query: q,
      students, students_count: students.length,
      groups, groups_count: groups.length,
      sessions, sessions_count: sessions.length,
      exams, exams_count: exams.length,
      payments, payments_count: payments.length,
      books, books_count: books.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
