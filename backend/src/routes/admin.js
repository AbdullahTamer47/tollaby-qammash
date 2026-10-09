const express = require('express');
const router = express.Router();
const { requireTeacher } = require('../middleware/auth');
const { summarizeStudentPayments } = require('../utils/payments');
const { withDbTimeout, cache: localCache } = require('../utils/localDBSnapshot');

// GET /api/admin/stats
router.get('/stats', requireTeacher, async (req, res) => {
  const prisma = req.app.locals.prisma;
  
  try {
    const [
      studentsCount,
      groupsCount,
      sessionsCount,
      totalPayments,
      teachersCount,
      assistantsCount,
      activeStudentsCount
    ] = await Promise.all([
      prisma.student.count(),
      prisma.group.count(),
      prisma.session.count(),
      prisma.eachPayment.aggregate({ _sum: { amount: true } }),
      prisma.user.count({ where: { role: 'teacher' } }),
      prisma.user.count({ where: { role: 'assistant' } }),
      prisma.student.count({ where: { active: true } })
    ]);

    // Calculate revenue for the last 6 months for chart
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const recentPayments = await prisma.eachPayment.findMany({
      where: { lastPaymentDate: { gte: sixMonthsAgo } },
      select: { amount: true, lastPaymentDate: true }
    });

    const monthlyRevenue = {};
    recentPayments.forEach(p => {
      const monthYear = `${p.lastPaymentDate.getFullYear()}-${String(p.lastPaymentDate.getMonth() + 1).padStart(2, '0')}`;
      monthlyRevenue[monthYear] = (monthlyRevenue[monthYear] || 0) + p.amount;
    });

    // Format monthly revenue to sorted array
    const revenueChart = Object.keys(monthlyRevenue).sort().map(key => ({
      month: key,
      revenue: monthlyRevenue[key]
    }));

    // Calculate total debt in batches to avoid loading all students at once
    let totalDebt = 0;
    const BATCH_SIZE = 100;
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await prisma.student.findMany({
        skip,
        take: BATCH_SIZE,
        include: {
          offer: true,
          attendance: { where: { isAttendant: true }, include: { session: true } },
          bookBookings: { include: { book: true } },
          eachPayments: true
        }
      });

      if (batch.length < BATCH_SIZE) hasMore = false;
      skip += BATCH_SIZE;

      for (const student of batch) {
        const payment = summarizeStudentPayments(student);
        if (payment.amountDue > payment.amountPaid) {
          totalDebt += (payment.amountDue - payment.amountPaid);
        }
      }
    }

    res.json({
      studentsCount,
      activeStudentsCount,
      groupsCount,
      sessionsCount,
      totalRevenue: totalPayments._sum.amount || 0,
      totalDebt: Math.round(totalDebt * 100) / 100,
      usersCount: teachersCount + assistantsCount,
      assistantsCount,
      revenueChart
    });
  } catch (err) {
    console.warn('⚡ DB offline/timeout: Serving admin stats from local cache');
    const students = localCache.students || [];
    const groups = localCache.groups || [];
    const sessions = localCache.sessions || [];
    const users = localCache.users || [];
    const assistants = users.filter(u => u.role === 'assistant');
    const teachers = users.filter(u => u.role === 'teacher');
    res.json({
      studentsCount: students.length,
      activeStudentsCount: students.filter(s => s.active !== false).length,
      groupsCount: groups.length,
      sessionsCount: sessions.length,
      totalRevenue: 0,
      totalDebt: 0,
      usersCount: users.length,
      assistantsCount: assistants.length,
      revenueChart: [],
      isOfflineFallback: true
    });
  }
});

module.exports = router;
