const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');

// Helper to check permission for expenses (teacher or permission 'expenses' or 'payments')
function canManageExpenses(req) {
  if (req.session.role === 'teacher') return true;
  let perms = req.session.permissions;
  if (typeof perms === 'string') {
    try { perms = JSON.parse(perms); } catch { perms = []; }
  }
  return Array.isArray(perms) && (perms.includes('expenses') || perms.includes('payments'));
}

router.use(requireAuth);
router.use((req, res, next) => {
  if (!canManageExpenses(req)) {
    return res.status(403).json({ error: 'ليس لديك صلاحية لإدارة المصروفات' });
  }
  next();
});

// GET /api/expenses/summary - Get summary stats of expenses
router.get('/summary', async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalAgg, monthAgg, allExpenses] = await Promise.all([
      prisma.expense.aggregate({ _sum: { amount: true }, _count: true }),
      prisma.expense.aggregate({
        where: { date: { gte: startOfMonth } },
        _sum: { amount: true },
        _count: true
      }),
      prisma.expense.findMany({ select: { category: true, amount: true } })
    ]);

    // Group by category
    const byCategory = {};
    for (const exp of allExpenses) {
      byCategory[exp.category] = (byCategory[exp.category] || 0) + (exp.amount || 0);
    }

    res.json({
      totalAmount: totalAgg._sum.amount || 0,
      totalCount: totalAgg._count || 0,
      thisMonthAmount: monthAgg._sum.amount || 0,
      thisMonthCount: monthAgg._count || 0,
      byCategory
    });
  } catch (err) {
    console.error('Error in expenses summary:', err);
    res.status(500).json({ error: 'فشل جلب إحصائيات المصروفات' });
  }
});

// GET /api/expenses - List expenses with filters and pagination
router.get('/', async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { q, category, from, to, page = 1, per_page = 20 } = req.query;

  try {
    const where = {};

    if (category && category !== 'all') {
      where.category = category;
    }

    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        where.date.lte = toDate;
      }
    }

    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { notes: { contains: term, mode: 'insensitive' } },
        { paidBy: { contains: term, mode: 'insensitive' } }
      ];
    }

    const currentPage = Math.max(1, parseInt(page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(per_page) || 20));
    const skip = (currentPage - 1) * limit;

    const [expenses, total, sumAgg] = await Promise.all([
      prisma.expense.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' }
      }),
      prisma.expense.count({ where }),
      prisma.expense.aggregate({ where, _sum: { amount: true } })
    ]);

    res.json({
      expenses,
      total,
      filteredSum: sumAgg._sum.amount || 0,
      page: currentPage,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('Error fetching expenses:', err);
    res.status(500).json({ error: 'فشل تحميل قائمة المصروفات' });
  }
});

// POST /api/expenses - Create new expense
router.post('/', async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { title, category, amount, notes, date, paidBy } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'اسم بند المصروف مطلوب' });
  }

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'المبلغ يجب أن يكون رقماً أكبر من صفر' });
  }

  try {
    let currentUser = null;
    if (req.session.userId) {
      currentUser = await prisma.user.findUnique({
        where: { id: req.session.userId },
        select: { username: true }
      });
    }

    const expense = await prisma.expense.create({
      data: {
        title: title.trim(),
        category: category || 'other',
        amount: numAmount,
        notes: notes ? notes.trim() : null,
        date: date ? new Date(date) : new Date(),
        paidBy: paidBy ? paidBy.trim() : (currentUser?.username || 'المعلم')
      }
    });

    await logAction(prisma, req.session.userId, `إضافة مصروف: ${expense.title} بقيمة ${expense.amount}`, '/api/expenses', 'POST');
    res.status(201).json(expense);
  } catch (err) {
    console.error('Error creating expense:', err);
    res.status(500).json({ error: 'فشل تسجيل المصروف' });
  }
});

// PUT /api/expenses/:id - Update an expense
router.put('/:id', async (req, res) => {
  const prisma = req.app.locals.prisma;
  const id = parseInt(req.params.id);
  const { title, category, amount, notes, date, paidBy } = req.body;

  if (isNaN(id)) return res.status(400).json({ error: 'معرف غير صالح' });

  try {
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'بند المصروف غير موجود' });

    const updateData = {};
    if (title && title.trim()) updateData.title = title.trim();
    if (category) updateData.category = category;
    if (amount !== undefined) {
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ error: 'المبلغ يجب أن يكون رقماً صحيحاً وموجباً' });
      }
      updateData.amount = numAmount;
    }
    if (notes !== undefined) updateData.notes = notes ? notes.trim() : null;
    if (date) updateData.date = new Date(date);
    if (paidBy !== undefined) updateData.paidBy = paidBy ? paidBy.trim() : null;

    const updated = await prisma.expense.update({
      where: { id },
      data: updateData
    });

    await logAction(prisma, req.session.userId, `تعديل مصروف #${id}: ${updated.title}`, '/api/expenses', 'PUT');
    res.json(updated);
  } catch (err) {
    console.error('Error updating expense:', err);
    res.status(500).json({ error: 'فشل تحديث المصروف' });
  }
});

// DELETE /api/expenses/:id - Delete an expense
router.delete('/:id', async (req, res) => {
  const prisma = req.app.locals.prisma;
  const id = parseInt(req.params.id);

  if (isNaN(id)) return res.status(400).json({ error: 'معرف غير صالح' });

  try {
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'بند المصروف غير موجود' });

    await prisma.expense.delete({ where: { id } });
    await logAction(prisma, req.session.userId, `حذف مصروف #${id}: ${existing.title}`, '/api/expenses', 'DELETE');
    res.json({ message: 'تم حذف المصروف بنجاح' });
  } catch (err) {
    console.error('Error deleting expense:', err);
    res.status(500).json({ error: 'فشل حذف المصروف' });
  }
});

module.exports = router;
