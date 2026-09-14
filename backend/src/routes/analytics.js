const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

function rangeStart(range) {
  const now = new Date();
  const start = new Date(now);
  if (range === 'week') start.setDate(now.getDate() - 7);
  else if (range === 'month') start.setDate(now.getDate() - 30);
  else start.setHours(0, 0, 0, 0); // today
  return start;
}

// GET /api/analytics/sales?range=today|week|month
router.get('/sales', async (req, res) => {
  try {
    const range = ['today', 'week', 'month'].includes(req.query.range) ? req.query.range : 'today';
    const start = rangeStart(range);

    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: start } },
      orderBy: { createdAt: 'asc' },
    });

    const sales = orders.reduce((sum, o) => sum + o.total, 0);
    // Simple estimated profit margin (35%) since raw ingredient cost isn't tracked per-unit.
    const profit = Math.round(sales * 0.35);

    // Bucket for trend line: hourly for "today", daily otherwise.
    const buckets = new Map();
    for (const o of orders) {
      const key =
        range === 'today'
          ? `${String(o.createdAt.getHours()).padStart(2, '0')}:00`
          : o.createdAt.toISOString().slice(0, 10);
      buckets.set(key, (buckets.get(key) || 0) + o.total);
    }
    const trend = [...buckets.entries()].map(([label, value]) => ({ label, value }));

    res.json({
      range,
      orders: orders.length,
      sales,
      profit,
      avgOrderValue: orders.length ? Math.round(sales / orders.length) : 0,
      trend,
    });
  } catch (err) {
    console.error('[analytics/sales]', err);
    res.status(500).json({ error: 'Failed to compute sales analytics' });
  }
});

// GET /api/analytics/peak-hours?range=today|week|month
router.get('/peak-hours', async (req, res) => {
  try {
    const range = ['today', 'week', 'month'].includes(req.query.range) ? req.query.range : 'week';
    const start = rangeStart(range);

    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: start } },
      select: { createdAt: true, total: true },
    });

    const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, sales: 0 }));
    for (const o of orders) {
      const h = o.createdAt.getHours();
      hourly[h].orders += 1;
      hourly[h].sales += o.total;
    }

    const peak = hourly.reduce((max, cur) => (cur.orders > max.orders ? cur : max), hourly[0]);

    res.json({ range, hourly, peakHour: peak.hour, peakOrders: peak.orders });
  } catch (err) {
    console.error('[analytics/peak-hours]', err);
    res.status(500).json({ error: 'Failed to compute peak hours' });
  }
});

module.exports = router;
