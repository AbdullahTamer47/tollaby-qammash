const express = require('express');
const router = express.Router();
const { reconcileManyStudents, reconcileStudentPayments } = require('../utils/wallet');
const { getSessionCosts, getStudentPaymentSnapshot } = require('../utils/payments');

// GET /api/sync/status - Ping server and database connectivity
router.get('/status', async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    // Quick test query
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      online: true,
      dbConnected: true,
      timestamp: Date.now(),
      mode: process.env.VERCEL ? 'cloud' : 'local'
    });
  } catch (err) {
    res.status(503).json({
      online: true,
      dbConnected: false,
      error: 'Database connection failed: ' + err.message,
      timestamp: Date.now()
    });
  }
});

// POST /api/sync/batch - Process a batch of mutations recorded offline
router.post('/batch', async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { mutations } = req.body;

  if (!Array.isArray(mutations) || mutations.length === 0) {
    return res.json({ success: true, processed: 0, errors: [] });
  }

  const results = [];
  const errors = [];
  const affectedStudents = new Set();

  for (const item of mutations) {
    try {
      const { type, payload } = item;

      if (type === 'SCAN_ATTENDANCE') {
        const { sessionId, studentId, autoPay } = payload;
        const sId = parseInt(studentId);
        const sesId = parseInt(sessionId);

        const session = await prisma.session.findUnique({ where: { id: sesId } });
        const student = await prisma.student.findUnique({ where: { id: sId }, include: { group: true } });

        if (session && student) {
          const record = await prisma.attendance.upsert({
            where: { studentId_sessionId: { studentId: sId, sessionId: sesId } },
            create: { studentId: sId, sessionId: sesId, isAttendant: true },
            update: { isAttendant: true }
          });

          affectedStudents.add(sId);

          if (autoPay) {
            const studentWithOffer = await prisma.student.findUnique({ where: { id: sId }, include: { offer: true } });
            const attendances = await prisma.attendance.findMany({
              where: { studentId: sId, isAttendant: true },
              include: { session: true },
              orderBy: { session: { date: 'asc' } }
            });
            const sessionCosts = getSessionCosts(studentWithOffer, attendances);
            const sessionCost = sessionCosts.get(record.id) || 0;
            const updatedRecord = await prisma.attendance.findUnique({ where: { id: record.id } });
            const autoPaidAmount = Math.max(0, Math.round((sessionCost - (updatedRecord?.amountPaid || 0)) * 100) / 100);

            if (autoPaidAmount > 0) {
              await prisma.eachPayment.create({
                data: {
                  studentId: sId,
                  amount: autoPaidAmount,
                  type: 'sessions',
                  targetName: session.title || 'دفع حصة',
                  allocations: '[]'
                }
              });
            }
          }
          results.push({ id: item.id, status: 'success' });
        } else {
          errors.push({ id: item.id, error: 'Student or session not found' });
        }
      } else if (type === 'TOGGLE_ATTENDANCE') {
        const { sessionId, studentId, isAttendant } = payload;
        const sId = parseInt(studentId);
        const sesId = parseInt(sessionId);

        await prisma.attendance.upsert({
          where: { studentId_sessionId: { studentId: sId, sessionId: sesId } },
          create: { studentId: sId, sessionId: sesId, isAttendant: Boolean(isAttendant) },
          update: { isAttendant: Boolean(isAttendant) }
        });
        affectedStudents.add(sId);
        results.push({ id: item.id, status: 'success' });
      } else if (type === 'ADD_PAYMENT') {
        const { studentId, amount, paymentType, targetName } = payload;
        const sId = parseInt(studentId);
        const amt = parseFloat(amount);
        const pType = paymentType === 'book' ? 'book' : 'sessions';

        if (sId && amt > 0) {
          await prisma.eachPayment.create({
            data: {
              studentId: sId,
              amount: amt,
              type: pType,
              targetName: targetName || (pType === 'sessions' ? 'دفع حصص (أوفلاين)' : 'دفع مذكرات (أوفلاين)'),
              allocations: '[]'
            }
          });
          affectedStudents.add(sId);
          results.push({ id: item.id, status: 'success' });
        }
      } else if (type === 'DELIVER_BOOK') {
        const { studentId, bookId } = payload;
        const sId = parseInt(studentId);
        const bId = parseInt(bookId);

        const booking = await prisma.bookBooking.findUnique({
          where: { studentId_bookId: { studentId: sId, bookId: bId } }
        });

        if (booking) {
          await prisma.bookBooking.update({
            where: { id: booking.id },
            data: { delivered: true, deliveredAt: new Date() }
          });
        } else {
          await prisma.bookBooking.create({
            data: {
              studentId: sId,
              bookId: bId,
              quantity: 1,
              delivered: true,
              deliveredAt: new Date()
            }
          });
        }
        affectedStudents.add(sId);
        results.push({ id: item.id, status: 'success' });
      } else {
        results.push({ id: item.id, status: 'ignored' });
      }
    } catch (err) {
      errors.push({ id: item.id, error: err.message });
    }
  }

  // Reconcile all affected students at once
  if (affectedStudents.size > 0) {
    try {
      await reconcileManyStudents(prisma, Array.from(affectedStudents));
    } catch (recErr) {
      console.error('Batch sync reconciliation error:', recErr);
    }
  }

  res.json({
    success: true,
    processed: results.length,
    results,
    errors
  });
});

module.exports = router;
