const { getBookCost, getSessionCosts } = require('./payments');

/**
 * Full reconciliation: zeros out all allocations then re-applies
 * payments using FIFO ordering.
 *
 * NOTE: This must be called inside a Prisma transaction (or with
 * a transaction-capable client) to prevent race conditions.
 */
async function reconcileStudentPayments(prisma, studentId) {
  const student = await prisma.student.findUnique({ where: { id: studentId }, include: { offer: true } });
  if (!student) return;

  // Reset all allocations in batch
  await Promise.all([
    prisma.attendance.updateMany({ where: { studentId }, data: { amountPaid: 0 } }),
    prisma.bookBooking.updateMany({ where: { studentId }, data: { amountPaid: 0 } }),
    prisma.eachPayment.updateMany({ where: { studentId }, data: { allocations: '[]' } }),
  ]);

  await applyUnallocatedBalance(prisma, studentId);
}

async function reconcileManyStudents(prisma, studentIds) {
  const uniqueIds = [...new Set(studentIds.map(Number).filter(Boolean))];
  for (const studentId of uniqueIds) {
    await reconcileStudentPayments(prisma, studentId);
  }
}

/**
 * FIFO allocation: applies payment amounts to attendance records
 * (sessions) first, then book bookings, ordered chronologically.
 *
 * Payments of type 'sessions' → attendance records
 * Payments of type 'book'     → book booking records
 */
async function applyUnallocatedBalance(prisma, studentId) {
  const payments = await prisma.eachPayment.findMany({ where: { studentId }, orderBy: { lastPaymentDate: 'asc' } });

  // Build unallocated payment list
  const unallocatedPayments = [];
  for (const p of payments) {
    const allocs = safeParseJSON(p.allocations);
    const allocatedSum = allocs.reduce((sum, a) => sum + (a.amount || 0), 0);
    const unallocated = roundMoney(p.amount - allocatedSum);
    if (unallocated > 0) {
      unallocatedPayments.push({ id: p.id, type: p.type, unallocated, allocations: allocs, amount: p.amount });
    }
  }

  if (unallocatedPayments.length === 0) return;

  const student = await prisma.student.findUnique({ where: { id: studentId }, include: { offer: true } });
  const attendances = await prisma.attendance.findMany({
    where: { studentId, isAttendant: true },
    include: { session: true },
    orderBy: { session: { date: 'asc' } }
  });

  const sessionCosts = getSessionCosts(student, attendances);

  // Batch updates to reduce DB calls
  const attendanceUpdates = new Map(); // attendanceId -> totalAllocated
  const bookingUpdates = new Map();    // bookingId -> totalAllocated
  const paymentAllocUpdates = new Map(); // paymentId -> allocations array

  // Initialize payment allocation tracking
  for (const p of unallocatedPayments) {
    paymentAllocUpdates.set(p.id, [...p.allocations]);
  }

  // Allocate session payments
  for (const a of attendances) {
    const sessionPrice = sessionCosts.get(a.id) || 0;
    let unpaid = roundMoney(sessionPrice - (attendanceUpdates.get(a.id) || 0));

    if (unpaid > 0) {
      for (const p of unallocatedPayments.filter(payment => payment.type === 'sessions')) {
        if (p.unallocated <= 0 || unpaid <= 0) continue;

        const allocate = Math.min(unpaid, p.unallocated);
        p.unallocated = roundMoney(p.unallocated - allocate);
        unpaid = roundMoney(unpaid - allocate);

        attendanceUpdates.set(a.id, roundMoney((attendanceUpdates.get(a.id) || 0) + allocate));
        paymentAllocUpdates.get(p.id).push({ type: 'attendance', id: a.id, amount: allocate, name: a.session.title });
      }
    }
  }

  // Allocate book payments
  const books = await prisma.bookBooking.findMany({
    where: { studentId },
    include: { book: true },
    orderBy: { id: 'asc' }
  });

  for (const b of books) {
    const price = getBookCost(b);
    let unpaid = roundMoney(price - (bookingUpdates.get(b.id) || 0));

    if (unpaid > 0) {
      for (const p of unallocatedPayments.filter(payment => payment.type === 'book')) {
        if (p.unallocated <= 0 || unpaid <= 0) continue;

        const allocate = Math.min(unpaid, p.unallocated);
        p.unallocated = roundMoney(p.unallocated - allocate);
        unpaid = roundMoney(unpaid - allocate);

        bookingUpdates.set(b.id, roundMoney((bookingUpdates.get(b.id) || 0) + allocate));
        paymentAllocUpdates.get(p.id).push({ type: 'bookBooking', id: b.id, amount: allocate, name: b.book.title });
      }
    }
  }

  // Write all updates to DB
  const updatePromises = [];

  for (const [attendanceId, amount] of attendanceUpdates) {
    updatePromises.push(
      prisma.attendance.update({ where: { id: attendanceId }, data: { amountPaid: amount } })
    );
  }

  for (const [bookingId, amount] of bookingUpdates) {
    updatePromises.push(
      prisma.bookBooking.update({ where: { id: bookingId }, data: { amountPaid: amount } })
    );
  }

  for (const [paymentId, allocs] of paymentAllocUpdates) {
    // Only update if there are new allocations beyond what was originally there
    const original = unallocatedPayments.find(p => p.id === paymentId);
    if (original && allocs.length > original.allocations.length) {
      updatePromises.push(
        prisma.eachPayment.update({ where: { id: paymentId }, data: { allocations: JSON.stringify(allocs) } })
      );
    }
  }

  // Execute updates in parallel (safe since each updates a different record)
  await Promise.all(updatePromises);
}

/**
 * Safely parse JSON, returning empty array on failure.
 */
function safeParseJSON(str) {
  try { return JSON.parse(str || '[]'); } catch { return []; }
}

/**
 * Round to 2 decimal places to avoid floating point drift.
 */
function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { applyUnallocatedBalance, reconcileManyStudents, reconcileStudentPayments };
