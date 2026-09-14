const express = require('express');
const prisma = require('../lib/prisma');
const { emit } = require('../lib/socket');

const router = express.Router();

// GET /api/ingredients
router.get('/', async (req, res) => {
  try {
    const ingredients = await prisma.ingredient.findMany({ orderBy: { name: 'asc' } });
    res.json(ingredients);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ingredients' });
  }
});

// PATCH /api/ingredients/:id/restock { amount? }
// With no body, tops the ingredient up to its full `max` capacity (mirrors the
// kitchen's one-tap "Restock" action). Pass { amount } to add a specific quantity instead.
router.patch('/:id/restock', async (req, res) => {
  try {
    const { amount } = req.body || {};
    if (amount !== undefined && (typeof amount !== 'number' || amount <= 0)) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }

    const current = await prisma.ingredient.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: 'Ingredient not found' });

    const newStock = amount !== undefined ? Math.min(current.max, current.stock + amount) : current.max;
    const ingredient = await prisma.ingredient.update({
      where: { id: req.params.id },
      data: { stock: newStock },
    });
    emit.ingredientUpdated(ingredient);

    // Restocking may bring dependent dishes back into availability.
    const dependents = await prisma.menuItem.findMany({
      where: { available: false, ingredients: { some: { ingredientId: ingredient.id } } },
      include: { ingredients: { include: { ingredient: true } } },
    });
    const restored = [];
    for (const item of dependents) {
      const stillOut = item.ingredients.some((link) => link.ingredient.stock <= 0);
      if (!stillOut) {
        const updated = await prisma.menuItem.update({ where: { id: item.id }, data: { available: true } });
        restored.push(updated);
        emit.menuUpdated(updated);
      }
    }

    res.json({ ingredient, restoredMenuItems: restored });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Ingredient not found' });
    console.error('[ingredients/restock]', err);
    res.status(500).json({ error: 'Failed to restock ingredient' });
  }
});

// PATCH /api/ingredients/:id/stock { stock } — sets absolute stock value (e.g. manual correction)
router.patch('/:id/stock', async (req, res) => {
  try {
    const { stock } = req.body;
    if (typeof stock !== 'number' || stock < 0) {
      return res.status(400).json({ error: 'stock must be a non-negative number' });
    }
    const ingredient = await prisma.ingredient.update({
      where: { id: req.params.id },
      data: { stock },
    });
    emit.ingredientUpdated(ingredient);
    res.json(ingredient);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Ingredient not found' });
    res.status(500).json({ error: 'Failed to update stock' });
  }
});

module.exports = router;
