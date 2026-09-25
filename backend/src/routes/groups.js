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

// GET /api/groups/:id/students
router.get('/:id/students', requirePermission('groups'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const students = await prisma.student.findMany({
      where: { groupId: parseInt(req.params.id) },
      include: { offer: true },
      orderBy: { id: 'asc' }
    });
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
