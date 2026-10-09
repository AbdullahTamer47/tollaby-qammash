const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/auth');
const { withDbTimeout, cache: localCache } = require('../utils/localDBSnapshot');

// GET /api/offers
router.get('/', requirePermission('students'), async (req, res) => {
  const prisma = req.app.locals.prisma;
  try {
    const offers = await withDbTimeout(
      prisma.offer.findMany({ orderBy: { id: 'asc' } }),
      1500
    );
    res.json(offers);
  } catch (err) {
    console.warn('⚡ DB offline/timeout: Serving offers from local cache');
    const fallback = (localCache.offers && localCache.offers.length > 0)
      ? localCache.offers
      : [{ id: 1, title: 'بدون خصم', type: 'percentage', value: 0 }];
    res.json(fallback);
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
