const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/auth');
const { reconcileStudentPayments } = require('../utils/wallet');
const { getStudentPaymentSnapshot, summarizeStudentPayments } = require('../utils/payments');
const { logAction } = require('../utils/logAction');
const { autoNotifyPaymentAdded } = require('../utils/autoNotify');
const { runBackgroundTask } = require('../utils/backgroundTask');

function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// GET /api/payments
router.get('/', requirePermission('payments'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { q, page = 1, per_page = 15, groupId } = req.query;
  try {
    const where = {
      ...(q && { OR: [{ name: { contains: q } }, { id: isNaN(q) ? undefined : { equals: parseInt(q) } }].filter(Boolean) }),
      ...(groupId && { groupId: parseInt(groupId) })
    };
    const skip = (parseInt(page) - 1) * parseInt(per_page);
    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where, skip, take: parseInt(per_page),
        include: { 
          group: true, offer: true,
          attendance: { include: { session: true } },
          bookBookings: { include: { book: true } },
          eachPayments: { orderBy: { lastPaymentDate: 'desc' } }
        },
        orderBy: { id: 'asc' }
      }),
      prisma.student.count({ where })
    ]);

    const payments = students.map(student => {
      const summary = summarizeStudentPayments(student);
      const lastPayment = student.eachPayments[0]?.amount || 0;
      const lastPaymentDate = student.eachPayments[0]?.lastPaymentDate || new Date(0);

      return {
        id: student.id,
        studentId: student.id,
        student,
        sessionsDue: summary.sessionsDue,
        sessionsPaid: summary.sessionsPaid,
        bookingsDue: summary.bookingsDue,
        bookingsPaid: summary.bookingsPaid,
        amountDue: summary.amountDue,
        amountPaid: summary.amountPaid,
        sessionsBalance: summary.sessionsBalance,
        bookingsBalance: summary.bookingsBalance,
        lastPayment,
        lastPaymentDate
      };
    });

    res.json({ payments, total, page: parseInt(page), per_page: parseInt(per_page) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/reload - Deprecated, returns success to not break existing frontend code
router.post('/reload', requirePermission('payments'), async (req, res) => {
  res.json({ success: true, message: 'تم إيقاف نظام إعادة الحساب واستبداله بالحساب اللحظي المباشر.' });
});

// GET /api/payments/download-csv
router.get('/download-csv', requirePermission('payments'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const students = await prisma.student.findMany({
      include: { 
        group: true, offer: true,
        attendance: { include: { session: true } },
        bookBookings: { include: { book: true } },
        eachPayments: { orderBy: { lastPaymentDate: 'desc' } }
      },
      orderBy: { id: 'asc' }
    });

    const rows = students.map(student => {
      const summary = summarizeStudentPayments(student);
      const lastPayment = student.eachPayments[0]?.amount || 0;

      return [
        student.name,
        summary.amountDue,
        summary.amountPaid,
        summary.amountDue - summary.amountPaid,
        summary.sessionsDue - summary.sessionsPaid,
        summary.bookingsDue - summary.bookingsPaid,
        lastPayment
      ].map(csvEscape).join(',');
    });

    const header = 'الطالب,المبلغ المستحق كلي,المدفوع كلي,المتبقي كلي,متبقي حصص,متبقي كتب,آخر دفعة\n';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="payments.csv"');
    res.send('\uFEFF' + header + rows.join('\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/payments/:studentId/add
router.post('/:studentId/add', requirePermission('payments'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const studentId = parseInt(req.params.studentId);
  let { amount, type, targetName } = req.body;
  amount = parseFloat(amount);
  type = type === 'book' ? 'book' : 'sessions';

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Invalid payment amount' });
  }

  try {
    const student = await prisma.student.findUnique({ where: { id: studentId }, include: { offer: true } });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const eachPayment = await prisma.$transaction(async tx => {
      const created = await tx.eachPayment.create({
        data: {
          studentId,
          amount,
          type,
          targetName: targetName || (type === 'sessions' ? 'دفع حصص' : 'دفع كتب'),
          allocations: '[]'
        }
      });
      await reconcileStudentPayments(tx, studentId);
      await logAction(tx, req, `إضافة دفعة ${amount} (${type}) للطالب ${student.name}`, 'POST');
      return created;
    });
    
    // Auto notify payment added
    runBackgroundTask(
      () => autoNotifyPaymentAdded(prisma, student, amount, type, req.session?.userId),
      'auto notify payment added'
    );

    res.json(eachPayment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/payments/each/:id - Not supported, must delete and re-add
router.put('/each/:id', requirePermission('payments'), async (req, res) => {
  res.status(405).json({ error: 'يرجى حذف الدفعة وإضافتها من جديد لضمان دقة الحسابات.' });
});

// DELETE /api/payments/each/:id
router.delete('/each/:id', requirePermission('payments'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const eachPayment = await prisma.eachPayment.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!eachPayment) return res.status(404).json({ error: 'Payment not found' });

    await prisma.$transaction(async tx => {
      await tx.eachPayment.delete({ where: { id: parseInt(req.params.id) } });
      await reconcileStudentPayments(tx, eachPayment.studentId);
      await logAction(tx, req, `حذف دفعة برقم ${req.params.id}`, 'DELETE');
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/payments/:studentId/history
router.get('/:studentId/history', requirePermission('payments'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const studentId = parseInt(req.params.studentId);
  try {
    const snapshot = await getStudentPaymentSnapshot(prisma, studentId);
    if (!snapshot) return res.status(404).json({ error: 'Student not found' });
    const { student, payment } = snapshot;
    const eachPayments = await prisma.eachPayment.findMany({ 
      where: { studentId }, 
      orderBy: { lastPaymentDate: 'desc' } 
    });

    res.json({ student, payment, eachPayments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
