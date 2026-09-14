const express = require('express');
const prisma = require('../lib/prisma');
const { emit } = require('../lib/socket');

const router = express.Router();

// GET /api/menu
router.get('/', async (req, res) => {
  try {
    const items = await prisma.menuItem.findMany({
      include: { ingredients: { include: { ingredient: true } } },
      orderBy: { id: 'asc' },
    });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

// PATCH /api/menu/:id/availability { available: boolean }
// Used by the kitchen dashboard to manually 86 (or bring back) a dish.
router.patch('/:id/availability', async (req, res) => {
  try {
    const { available } = req.body;
    if (typeof available !== 'boolean') return res.status(400).json({ error: 'available must be a boolean' });

    const item = await prisma.menuItem.update({
      where: { id: Number(req.params.id) },
      data: { available },
    });
    emit.menuUpdated(item);
    res.json(item);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Menu item not found' });
    res.status(500).json({ error: 'Failed to update availability' });
  }
});

module.exports = router;
