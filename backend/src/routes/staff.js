const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// GET /api/staff
router.get('/', async (req, res) => {
  try {
    const staff = await prisma.staff.findMany({ orderBy: { name: 'asc' } });
    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch staff' });
  }
});

// PATCH /api/staff/:id { onDuty? , ordersHandled? }
router.patch('/:id', async (req, res) => {
  try {
    const { onDuty, ordersHandled } = req.body;
    const data = {};
    if (typeof onDuty === 'boolean') data.onDuty = onDuty;
    if (typeof ordersHandled === 'number') data.ordersHandled = ordersHandled;

    const staff = await prisma.staff.update({ where: { id: Number(req.params.id) }, data });
    res.json(staff);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Staff member not found' });
    res.status(500).json({ error: 'Failed to update staff member' });
  }
});

module.exports = router;
