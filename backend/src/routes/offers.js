const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/auth');

// GET /api/offers
router.get('/', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const offers = await prisma.offer.findMany({ orderBy: { id: 'asc' } });
    res.json(offers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/offers
router.post('/', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const { title, type, value } = req.body;
  try {
    const offer = await prisma.offer.create({
      data: { title, type: type || 'percentage', value: parseFloat(value) }
    });
    res.status(201).json(offer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/offers/:id
router.delete('/:id', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    await prisma.offer.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
