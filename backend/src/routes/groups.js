const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission } = require('../middleware/auth');
const { logAction } = require('../utils/logAction');

// GET /api/groups
router.get('/', requireAuth, async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const groups = await prisma.group.findMany({
      include: { _count: { select: { students: true } } },
      orderBy: { name: 'asc' }
    });
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/groups
router.post('/', requirePermission('groups'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { name, grade } = req.body;
  try {
    const group = await prisma.group.create({ data: { name, grade } });
    await logAction(prisma, req, `إضافة مجموعة ${name}`, 'POST');
    res.status(201).json(group);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/groups/:id
router.get('/:id', requirePermission('groups'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const group = await prisma.group.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { _count: { select: { students: true } } }
    });
    if (!group) return res.status(404).json({ error: 'Group not found' });
    res.json(group);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/groups/:id
router.put('/:id', requirePermission('groups'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { name, grade } = req.body;
  try {
    const group = await prisma.group.update({
      where: { id: parseInt(req.params.id) },
      data: { name, grade }
    });
    await logAction(prisma, req, `تعديل مجموعة ${name}`, 'PUT');
    res.json(group);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/groups/:id
router.delete('/:id', requirePermission('groups'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const group = await prisma.group.findUnique({ where: { id: parseInt(req.params.id) } });
    await prisma.group.delete({ where: { id: parseInt(req.params.id) } });
    await logAction(prisma, req, `حذف مجموعة ${group?.name}`, 'DELETE');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/groups/:id/students - List students of group with attendance metrics
router.get('/:id/students', requirePermission('groups'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const groupId = parseInt(req.params.id);
  if (isNaN(groupId)) {
    return res.status(400).json({ error: 'معرف المجموعة غير صالح' });
  }

  try {
    const [students, groupSessions] = await Promise.all([
      prisma.student.findMany({
        where: { groupId },
        include: {
          offer: true,
          attendance: {
            where: { session: { groupId } },
            include: {
              session: {
                select: { id: true, title: true, date: true, price: true }
              }
            },
            orderBy: { session: { date: 'asc' } }
          }
        },
        orderBy: { id: 'asc' }
      }),
      prisma.session.findMany({
        where: { groupId },
        orderBy: { date: 'asc' },
        include: {
          _count: {
            select: { attendance: true }
          }
        }
      })
    ]);

    const totalGroupSessions = groupSessions.length;

    // Enhance each student with accurate attendance metrics
    const enhancedStudents = students.map(student => {
      const studentAttendance = student.attendance || [];
      const attendedCount = studentAttendance.filter(a => a.isAttendant).length;
      const recordedSessionsCount = studentAttendance.length;

      const attendanceRate = totalGroupSessions > 0
        ? Math.round((attendedCount / totalGroupSessions) * 100)
        : (recordedSessionsCount > 0 ? Math.round((attendedCount / recordedSessionsCount) * 100) : 0);

      // Last session record
      const lastRecord = studentAttendance.length > 0 ? studentAttendance[studentAttendance.length - 1] : null;
      const lastStatus = lastRecord ? (lastRecord.isAttendant ? 'present' : 'absent') : 'none';

      return {
        ...student,
        attendanceStats: {
          totalSessions: totalGroupSessions,
          attendedCount,
          absentCount: Math.max(0, totalGroupSessions - attendedCount),
          attendanceRate,
          lastStatus,
          lastSessionTitle: lastRecord?.session?.title || null,
          lastSessionDate: lastRecord?.session?.date || null
        },
        attendanceHistory: studentAttendance.map(a => ({
          sessionId: a.sessionId,
          sessionTitle: a.session.title,
          sessionDate: a.session.date,
          isAttendant: a.isAttendant,
          amountPaid: a.amountPaid
        }))
      };
    });

    // Compute overall group statistics
    const totalPossibleAttendances = enhancedStudents.length * totalGroupSessions;
    const totalActualAttendances = enhancedStudents.reduce((sum, s) => sum + s.attendanceStats.attendedCount, 0);
    const overallGroupAttendanceRate = totalPossibleAttendances > 0
      ? Math.round((totalActualAttendances / totalPossibleAttendances) * 100)
      : 0;

    res.json({
      students: enhancedStudents,
      groupSessions: groupSessions.map(s => ({
        id: s.id,
        title: s.title,
        date: s.date,
        totalRecords: s._count.attendance
      })),
      stats: {
        totalStudents: enhancedStudents.length,
        totalSessions: totalGroupSessions,
        overallAttendanceRate: overallGroupAttendanceRate
      }
    });
  } catch (err) {
    console.error('Error fetching group students:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
