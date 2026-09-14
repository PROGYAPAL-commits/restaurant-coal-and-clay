const express = require('express');
const prisma = require('../lib/prisma');
const { emit } = require('../lib/socket');

const router = express.Router();

// GET /api/tables — live floor status
router.get('/', async (req, res) => {
  try {
    const tables = await prisma.diningTable.findMany({ orderBy: { label: 'asc' } });
    res.json(tables);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

// PATCH /api/tables/:id { status, party?, reservedFor? }
router.patch('/:id', async (req, res) => {
  try {
    const { status, party, reservedFor } = req.body;
    const data = {};
    if (status) {
      if (!['available', 'occupied', 'reserved'].includes(status)) {
        return res.status(400).json({ error: 'status must be available, occupied, or reserved' });
      }
      data.status = status;
      data.seatedAt = status === 'occupied' ? new Date() : null;
    }
    if (party !== undefined) data.party = party;
    if (reservedFor !== undefined) data.reservedFor = reservedFor ? new Date(reservedFor) : null;

    const table = await prisma.diningTable.update({ where: { id: Number(req.params.id) }, data });
    emit.tableUpdated(table);
    res.json(table);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Table not found' });
    res.status(500).json({ error: 'Failed to update table' });
  }
});

module.exports = router;
