const express = require('express');
const prisma = require('../lib/prisma');
const { optionalAuth } = require('../middleware/auth');
const { emit } = require('../lib/socket');
const crypto = require('crypto');
const razorpay = require('../lib/razorpay');

const router = express.Router();

const STAGES = ['Received', 'Preparing', 'Plating', 'Served'];

// POST /api/orders
// body: { tableId?, items: [{ menuItemId, qty }], priority? }
// Looks up live prices/availability, deducts ingredient stock, and 86's any
// dish whose ingredient hits zero.
router.post('/', optionalAuth, async (req, res) => {
  try {
    const { tableId, items, priority } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items must be a non-empty array of { menuItemId, qty }' });
    }

    const menuItemIds = items.map((i) => i.menuItemId);
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds } },
      include: { ingredients: { include: { ingredient: true } } },
    });

    // Validate every requested item exists and is currently available
    const orderItems = [];
    for (const { menuItemId, qty } of items) {
      const menuItem = menuItems.find((m) => m.id === menuItemId);
      if (!menuItem) return res.status(400).json({ error: `Menu item ${menuItemId} not found` });
      if (!menuItem.available) return res.status(409).json({ error: `${menuItem.name} is currently unavailable` });
      if (!qty || qty < 1) return res.status(400).json({ error: `Invalid quantity for ${menuItem.name}` });
      orderItems.push({ menuItemId, name: menuItem.name, price: menuItem.price, qty });
    }

    const total = orderItems.reduce((sum, i) => sum + i.price * i.qty, 0);

    // Run stock deduction + order creation atomically
    const result = await prisma.$transaction(async (tx) => {
      const newlyUnavailable = [];
      const stockUpdates = [];

      for (const { menuItemId, qty } of items) {
        const menuItem = menuItems.find((m) => m.id === menuItemId);
        for (const link of menuItem.ingredients) {
          const decremented = await tx.ingredient.update({
            where: { id: link.ingredientId },
            data: { stock: { decrement: link.qtyPerOrder * qty } },
          });
          const clamped = Math.max(0, decremented.stock);
          if (clamped !== decremented.stock) {
            await tx.ingredient.update({ where: { id: link.ingredientId }, data: { stock: 0 } });
          }
          stockUpdates.push({ ...decremented, stock: clamped });
        }
      }

      // Any menu item whose ingredient is now at/below zero gets 86'd
      const affectedIngredientIds = new Set(stockUpdates.map((i) => i.id));
      const dependentItems = await tx.menuItem.findMany({
        where: { ingredients: { some: { ingredientId: { in: [...affectedIngredientIds] } } } },
        include: { ingredients: { include: { ingredient: true } } },
      });
      for (const item of dependentItems) {
        const outOfStock = item.ingredients.some((link) => {
          const updated = stockUpdates.find((s) => s.id === link.ingredientId);
          const currentStock = updated ? updated.stock : link.ingredient.stock;
          return currentStock <= 0;
        });
        if (outOfStock && item.available) {
          const updated = await tx.menuItem.update({ where: { id: item.id }, data: { available: false } });
          newlyUnavailable.push(updated);
        }
      }

      const order = await tx.order.create({
        data: {
          customerId: req.user ? req.user.id : null,
          tableId: tableId || null,
          items: orderItems,
          total,
          priority: priority || 'standard',
          status: 'Received',
          paymentStatus: 'Pending',
        },
      });

      return { order, stockUpdates, newlyUnavailable };
    });

    // Broadcast to all connected dashboards
    emit.orderNew(result.order);
    for (const ing of result.stockUpdates) emit.ingredientUpdated(ing);
    for (const item of result.newlyUnavailable) emit.menuUpdated(item);

    res.status(201).json(result.order);
  } catch (err) {
    console.error('[orders/create]', err);
    res.status(500).json({ error: 'Failed to place order' });
  }
});

// GET /api/orders?status=Preparing&tableId=3
router.get('/', async (req, res) => {
  try {
    const { status, tableId } = req.query;
    const where = {};
    if (status) where.status = status;
    if (tableId) where.tableId = Number(tableId);

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { table: true, customer: { select: { id: true, name: true, email: true, phone: true } } },
    });
    res.json(orders);
  } catch (err) {
    console.error('[orders/list]', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /api/orders/:id
router.get('/:id', async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: Number(req.params.id) },
      include: { table: true, customer: { select: { id: true, name: true, email: true, phone: true } } },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// PATCH /api/orders/:id/status  { status } — advances/sets Received -> Preparing -> Plating -> Served
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!STAGES.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${STAGES.join(', ')}` });
    }
    const order = await prisma.order.update({
      where: { id: Number(req.params.id) },
      data: { status },
    });
    emit.orderUpdated(order);
    res.json(order);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Order not found' });
    console.error('[orders/status]', err);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// PATCH /api/orders/:id/priority  { priority: 'standard' | 'rush' | 'vip' }
router.patch('/:id/priority', async (req, res) => {
  try {
    const { priority } = req.body;
    if (!['standard', 'rush', 'vip'].includes(priority)) {
      return res.status(400).json({ error: 'priority must be standard, rush, or vip' });
    }
    const order = await prisma.order.update({
      where: { id: Number(req.params.id) },
      data: { priority },
    });
    emit.orderUpdated(order);
    res.json(order);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Order not found' });
    console.error('[orders/priority]', err);
    res.status(500).json({ error: 'Failed to update order priority' });
  }
});

// PATCH /api/orders/:id/payment { paymentStatus: 'Paid' | 'Pending' }
router.patch('/:id/payment', async (req, res) => {
  try {
    const { paymentStatus } = req.body;
    if (!['Paid', 'Pending'].includes(paymentStatus)) {
      return res.status(400).json({ error: 'paymentStatus must be Paid or Pending' });
    }
    const order = await prisma.order.update({
      where: { id: Number(req.params.id) },
      data: { paymentStatus },
    });
    emit.orderUpdated(order);
    res.json(order);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Order not found' });
    res.status(500).json({ error: 'Failed to update payment status' });
  }
});
// POST /api/orders/:id/create-payment — creates a Razorpay order for this bill
router.post('/:id/create-payment', async (req, res) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: Number(req.params.id) } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.paymentStatus === 'Paid') return res.status(400).json({ error: 'Order already paid' });

    const tax = Math.round(order.total * 0.05);
    const grandTotal = order.total + tax;

    const razorpayOrder = await razorpay.orders.create({
      amount: grandTotal * 100, // paise
      currency: 'INR',
      receipt: `order_${order.id}`,
      notes: { orderId: String(order.id) },
    });

    res.json({
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error('[orders/create-payment]', err);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
});

// POST /api/orders/:id/verify-payment — verifies Razorpay signature, then marks order Paid
router.post('/:id/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification fields' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    const order = await prisma.order.update({
      where: { id: Number(req.params.id) },
      data: { paymentStatus: 'Paid' },
    });
    emit.orderUpdated(order);
    res.json(order);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Order not found' });
    console.error('[orders/verify-payment]', err);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

module.exports = router;
