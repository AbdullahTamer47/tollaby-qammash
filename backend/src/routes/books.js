const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/auth');
const { reconcileManyStudents } = require('../utils/wallet');
const { logAction } = require('../utils/logAction');

// GET /api/books
router.get('/', requirePermission('books'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const [books, bookingStats] = await Promise.all([
      prisma.book.findMany({
        orderBy: [{ grade: 'asc' }, { title: 'asc' }]
      }),
      prisma.bookBooking.groupBy({
        by: ['bookId', 'delivered'],
        _count: { _all: true }
      })
    ]);

    const statsMap = {};
    for (const row of bookingStats) {
      if (!statsMap[row.bookId]) statsMap[row.bookId] = { total: 0, delivered: 0, notDelivered: 0 };
      statsMap[row.bookId].total += row._count._all;
      if (row.delivered) statsMap[row.bookId].delivered += row._count._all;
      else statsMap[row.bookId].notDelivered += row._count._all;
    }

    const result = books.map(b => ({
      ...b,
      bookingsCount: statsMap[b.id]?.total || 0,
      deliveredCount: statsMap[b.id]?.delivered || 0,
      notDeliveredCount: statsMap[b.id]?.notDelivered || 0
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/books
router.post('/', requirePermission('books'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { title, grade, price } = req.body;
  try {
    const parsedPrice = parseFloat(price || 0);
    if (!title || !Number.isFinite(parsedPrice) || parsedPrice < 0) return res.status(400).json({ error: 'Invalid book data' });
    const normalizedGrade = grade || null;
    const existing = await prisma.book.findFirst({ where: { title, grade: normalizedGrade } });
    const book = existing
      ? await prisma.book.update({ where: { id: existing.id }, data: { price: parsedPrice } })
      : await prisma.book.create({ data: { title, grade: normalizedGrade, price: parsedPrice } });
    await logAction(prisma, req, `إضافة كتاب ${title}`, 'POST');
    res.status(201).json(book);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/books/:id
router.delete('/:id', requirePermission('books'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const bookId = parseInt(req.params.id);
    await prisma.$transaction(async tx => {
      const bookings = await tx.bookBooking.findMany({ where: { bookId }, select: { studentId: true } });
      await tx.book.delete({ where: { id: bookId } });
      await reconcileManyStudents(tx, bookings.map(b => b.studentId));
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/books/bookings?book_id=
router.get('/bookings', requirePermission('books'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { q, groupId, page = 1, per_page = 15 } = req.query;
  try {
    const skip = (parseInt(page) - 1) * parseInt(per_page);
    
    // Build where clause for students
    let where = {};
    if (groupId) where.groupId = parseInt(groupId);
    if (q) {
      const qNum = parseInt(q);
      if (!isNaN(qNum)) where.id = qNum;
      else where.name = { contains: q };
    }

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where,
        skip,
        take: parseInt(per_page),
        include: { group: true },
        orderBy: { name: 'asc' }
      }),
      prisma.student.count({ where })
    ]);

    const books = await prisma.book.findMany();
    const studentIds = students.map(s => s.id);
    
    const allBookings = await prisma.bookBooking.findMany({
      where: { studentId: { in: studentIds } }
    });

    // Map data for frontend
    const mappedBookings = students.map(student => {
      const studentGrade = student.group?.grade;
      // Books available for this student's grade, or books with no grade specified
      const availableBooks = books.filter(b => !b.grade || b.grade === studentGrade);
      const studentBookingsForStudent = allBookings.filter(b => b.studentId === student.id);
      const studentBookIds = studentBookingsForStudent.map(b => b.bookId);
      const deliveredBookIds = studentBookingsForStudent.filter(b => b.delivered).map(b => b.bookId);

      return {
        student,
        availableBooks,
        studentBookIds,
        deliveredBookIds
      };
    });

    res.json({ bookings: mappedBookings, total, page: parseInt(page), per_page: parseInt(per_page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/books/bookings/toggle
router.post('/bookings/toggle', (req, res, next) => {
  const perms = Array.isArray(req.session?.permissions) ? req.session.permissions : [];
  if (req.session?.role === 'teacher' || perms.includes('books') || perms.includes('students')) {
    return next();
  }
  return res.status(403).json({ error: 'غير مصرح لك للقيام بهذا الإجراء' });
}, async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { bulk_action, student_id, book_id, selected_students, studentId, bookId } = req.body;
  const targetBookId = parseInt(book_id || bookId || 0);

  try {
    await prisma.$transaction(async tx => {
      const book = await tx.book.findUnique({ where: { id: targetBookId } });
      if (!book) throw new Error('Book not found');
      const affectedStudents = new Set();

      if (bulk_action) {
        const selectedIds = (Array.isArray(selected_students) ? selected_students : [selected_students]).map(Number).filter(Boolean);

        if (bulk_action === 'book_selected') {
          for (const sid of selectedIds) {
            const existing = await tx.bookBooking.findUnique({ where: { studentId_bookId: { studentId: sid, bookId: targetBookId } } });
            if (!existing) {
              await tx.bookBooking.create({ data: { studentId: sid, bookId: targetBookId, quantity: 1 } });
              affectedStudents.add(sid);
            }
          }
        } else if (bulk_action === 'unbook_selected') {
          const bookingsToRemove = await tx.bookBooking.findMany({ where: { studentId: { in: selectedIds }, bookId: targetBookId } });
          for (const b of bookingsToRemove) {
            await tx.bookBooking.delete({ where: { id: b.id } });
            affectedStudents.add(b.studentId);
          }
        } else if (bulk_action === 'toggle_all') {
          const targetGrade = book.grade;
          let allStudentsQuery = targetGrade ? { where: { group: { grade: targetGrade } } } : {};
          const allStudentIds = (await tx.student.findMany({ ...allStudentsQuery, select: { id: true } })).map(s => s.id);
          const bookedIds = new Set((await tx.bookBooking.findMany({ where: { bookId: targetBookId, studentId: { in: allStudentIds } }, select: { studentId: true } })).map(b => b.studentId));

          for (const sid of allStudentIds) {
            if (bookedIds.has(sid)) {
              await tx.bookBooking.delete({ where: { studentId_bookId: { studentId: sid, bookId: targetBookId } } });
            } else {
              await tx.bookBooking.create({ data: { studentId: sid, bookId: targetBookId, quantity: 1 } });
            }
            affectedStudents.add(sid);
          }
        }
      } else {
        const targetStudentId = parseInt(student_id || studentId || 0);
        const existing = await tx.bookBooking.findUnique({ where: { studentId_bookId: { studentId: targetStudentId, bookId: targetBookId } } });
        if (existing) {
          await tx.bookBooking.delete({ where: { studentId_bookId: { studentId: targetStudentId, bookId: targetBookId } } });
        } else {
          await tx.bookBooking.create({ data: { studentId: targetStudentId, bookId: targetBookId, quantity: 1 } });
        }
        affectedStudents.add(targetStudentId);
      }

      await reconcileManyStudents(tx, [...affectedStudents]);
      await logAction(tx, req, `تحديث حجز كتاب ${targetBookId}`, 'POST');
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/books/bookings/deliver
router.post('/bookings/deliver', (req, res, next) => {
  const perms = Array.isArray(req.session?.permissions) ? req.session.permissions : [];
  if (req.session?.role === 'teacher' || perms.includes('books') || perms.includes('students')) {
    return next();
  }
  return res.status(403).json({ error: 'غير مصرح لك للقيام بهذا الإجراء' });
}, async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { studentId, bookId, student_id, book_id } = req.body;

  try {
    const sId = parseInt(studentId || student_id || 0);
    const bId = parseInt(bookId || book_id || 0);
    if (!sId || !bId) return res.status(400).json({ error: 'بيانات غير صالحة' });

    const booking = await prisma.bookBooking.findUnique({
      where: { studentId_bookId: { studentId: sId, bookId: bId } },
      include: { book: true }
    });

    if (!booking) {
      // If not yet booked, book it and deliver immediately!
      const book = await prisma.book.findUnique({ where: { id: bId } });
      if (!book) return res.status(404).json({ error: 'الكتاب غير موجود' });
      const newBooking = await prisma.bookBooking.create({
        data: {
          studentId: sId,
          bookId: bId,
          quantity: 1,
          delivered: true,
          deliveredAt: new Date()
        },
        include: { book: true }
      });
      await reconcileManyStudents(prisma, [sId]);
      await logAction(prisma, req, `حجز وتسليم كتاب ${book.title} للطالب`, 'POST');
      return res.json({ success: true, delivered: true, deliveredAt: newBooking.deliveredAt });
    }

    const newDelivered = !booking.delivered;
    const updated = await prisma.bookBooking.update({
      where: { id: booking.id },
      data: { delivered: newDelivered, deliveredAt: newDelivered ? new Date() : null }
    });

    await logAction(prisma, req, `${newDelivered ? 'تسليم' : 'إلغاء تسليم'} كتاب ${booking.book.title} للطالب`, 'POST');
    res.json({ success: true, delivered: updated.delivered, deliveredAt: updated.deliveredAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/books/bookings/discount
router.post('/bookings/discount', (req, res, next) => {
  const perms = Array.isArray(req.session?.permissions) ? req.session.permissions : [];
  if (req.session?.role === 'teacher' || perms.includes('books') || perms.includes('students')) {
    return next();
  }
  return res.status(403).json({ error: 'غير مصرح لك للقيام بهذا الإجراء' });
}, async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { studentId, bookId, discountType, discountValue } = req.body;

  try {
    const booking = await prisma.bookBooking.findUnique({
      where: { studentId_bookId: { studentId: parseInt(studentId), bookId: parseInt(bookId) } },
      include: { book: true }
    });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (discountType && !['percentage', 'amount'].includes(discountType)) {
      return res.status(400).json({ error: 'Invalid discount type' });
    }
    const val = parseFloat(discountValue) || 0;
    if (val < 0) return res.status(400).json({ error: 'Invalid discount value' });
    const totalPrice = Number(booking.book?.price || 0) * Number(booking.quantity || 1);
    if (discountType === 'percentage' && val > 100) return res.status(400).json({ error: 'Invalid discount percentage' });
    if (discountType === 'amount' && val > totalPrice) return res.status(400).json({ error: 'Invalid discount amount' });

    await prisma.$transaction(async tx => {
      await tx.bookBooking.update({
        where: { id: booking.id },
        data: { discountType, discountValue: val }
      });
      await reconcileManyStudents(tx, [parseInt(studentId)]);
      await logAction(tx, req, `تحديث خصم كتاب ${booking.book.title} للطالب`, 'POST');
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
