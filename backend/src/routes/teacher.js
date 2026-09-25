const express = require('express');
const router = express.Router();
const { requireTeacher } = require('../middleware/auth');

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
      logs
    ] = await Promise.all([
      prisma.student.count(),
      prisma.group.count(),
      prisma.user.findMany({ where: { role: 'assistant' }, select: { id: true, username: true, dateJoined: true } }),
      prisma.session.count({ where: { date: { gte: startOfDay, lt: endOfDay } } }),
      prisma.eachPayment.findMany({
        where: { lastPaymentDate: { gte: startOfDay, lt: endOfDay } }
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

    res.json({
      stats: {
        totalStudents,
        totalGroups,
        assistantsCount: assistants.length,
        sessionsToday,
        paymentsTodayCount,
        paymentsTodaySum
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
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
