const express = require('express');
const router = express.Router();
const { requireTeacher } = require('../middleware/auth');
const { isDbConnectionError, cache: localCache } = require('../utils/localDBSnapshot');

// GET /api/teacher/dashboard
router.get('/dashboard', requireTeacher, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const [
      totalStudents,
      totalGroups,
      assistants,
      sessionsToday,
      paymentsTodayRecords,
      expensesTodayRecords,
      logs
    ] = await Promise.all([
      prisma.student.count(),
      prisma.group.count(),
      prisma.user.findMany({ where: { role: 'assistant' }, select: { id: true, username: true, dateJoined: true } }),
      prisma.session.count({ where: { date: { gte: startOfDay, lt: endOfDay } } }),
      prisma.eachPayment.findMany({
        where: { lastPaymentDate: { gte: startOfDay, lt: endOfDay } }
      }),
      prisma.expense.findMany({
        where: { date: { gte: startOfDay, lt: endOfDay } }
      }),
      prisma.actionLog.findMany({
        where: {
          createdAt: { gte: startOfDay, lt: endOfDay },
          user: { role: 'assistant' }
        },
        include: { user: true },
        orderBy: { createdAt: 'desc' },
        take: 200
      })
    ]);

    const paymentsTodayCount = paymentsTodayRecords.length;
    const paymentsTodaySum = paymentsTodayRecords.reduce((sum, p) => sum + (p.amount || 0), 0);
    const expensesTodaySum = expensesTodayRecords.reduce((sum, e) => sum + (e.amount || 0), 0);
    const netToday = paymentsTodaySum - expensesTodaySum;

    res.json({
      stats: {
        totalStudents,
        totalGroups,
        assistantsCount: assistants.length,
        sessionsToday,
        paymentsTodayCount,
        paymentsTodaySum,
        expensesTodaySum,
        netToday
      },
      assistants,
      logs: logs.map(log => ({
        id: log.id,
        createdAt: log.createdAt,
        username: log.user.username,
        action: log.action,
        method: log.method,
        path: log.path
      }))
    });
  } catch (err) {
    console.warn('⚡ DB offline/timeout: Serving teacher dashboard from local cache:', err.message);
    const students = localCache.students || [];
    const groups = localCache.groups || [];
    const sessions = localCache.sessions || [];
    const expenses = localCache.expenses || [];
    const users = localCache.users || [];
    const assistants = users.filter(u => u.role === 'assistant');
    return res.json({
      stats: {
        totalStudents: students.length,
        totalGroups: groups.length,
        assistantsCount: assistants.length,
        sessionsToday: 0,
        paymentsTodayCount: 0,
        paymentsTodaySum: 0,
        expensesTodaySum: expenses.reduce((s, e) => s + (e.amount || 0), 0),
        netToday: 0
      },
      assistants,
      logs: [],
      isOfflineFallback: true
    });
  }
});

module.exports = router;
