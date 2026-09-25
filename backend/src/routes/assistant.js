const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// GET /api/assistant/info
router.get('/info', requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const userId = req.session.userId;
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);

    const [user, recentLogs, weeklyActivities, todayActivities] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, role: true, dateJoined: true }
      }),
      prisma.actionLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20
      }),
      prisma.actionLog.count({
        where: { userId, createdAt: { gte: weekAgo } }
      }),
      prisma.actionLog.count({
        where: { userId, createdAt: { gte: startOfDay } }
      })
    ]);

    res.json({ user, recentLogs, weeklyActivities, todayActivities });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
