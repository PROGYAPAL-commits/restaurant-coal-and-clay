// Seeds the database with the menu, ingredients, staff, and tables
// pulled from the existing frontend mock data (RestaurantDashboard.jsx,
// KitchenDashboard.jsx, OwnerDashboard.jsx).
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

// ---- Ingredients (from KitchenDashboard.jsx INGREDIENTS_INITIAL) ----
const INGREDIENTS = [
  { id: 'paneer', name: 'Paneer', unit: 'kg', stock: 6, max: 10, threshold: 2 },
  { id: 'mutton', name: 'Mutton', unit: 'kg', stock: 5, max: 8, threshold: 2 },
  { id: 'chicken', name: 'Chicken', unit: 'kg', stock: 7, max: 10, threshold: 2 },
  { id: 'pomfret', name: 'Pomfret', unit: 'pcs', stock: 4, max: 8, threshold: 2 },
  { id: 'lentils', name: 'Lentils (Dal)', unit: 'kg', stock: 8, max: 12, threshold: 2 },
  { id: 'gramflour', name: 'Gram Flour', unit: 'kg', stock: 5, max: 8, threshold: 1.5 },
  { id: 'bajraflour', name: 'Bajra Flour', unit: 'kg', stock: 4, max: 8, threshold: 1.5 },
  { id: 'wheatflour', name: 'Wheat Flour', unit: 'kg', stock: 9, max: 12, threshold: 2 },
  { id: 'ghee', name: 'Ghee', unit: 'ltr', stock: 3, max: 6, threshold: 1 },
  { id: 'saffron', name: 'Saffron', unit: 'g', stock: 25, max: 40, threshold: 8 },
  { id: 'khoya', name: 'Khoya', unit: 'kg', stock: 3, max: 6, threshold: 1 },
  { id: 'buttermilk', name: 'Curd / Buttermilk', unit: 'ltr', stock: 6, max: 10, threshold: 2 },
  { id: 'mathania', name: 'Mathania Chillies', unit: 'kg', stock: 2, max: 4, threshold: 0.5 },
  { id: 'almonds', name: 'Almonds', unit: 'kg', stock: 2, max: 4, threshold: 0.5 },
];

// ---- Menu items (from RestaurantDashboard.jsx INITIAL_MENU) ----
// `needs` mirrors KitchenDashboard.jsx DISHES_INITIAL — ingredient ids consumed per order.
const MENU_ITEMS = [
  { name: 'Dal ke Sooley', desc: 'Spiced lentil dumplings, char-grilled on skewers', price: 240, veg: true, category: 'Starters', needs: ['lentils'] },
  { name: 'Achari Paneer Tikka', desc: 'Cottage cheese marinated in pickling spice, tandoor-fired', price: 280, veg: true, category: 'Starters', needs: ['paneer'] },
  { name: 'Mutton Seekh Kebab', desc: 'Hand-minced mutton, charcoal smoked', price: 340, veg: false, category: 'Starters', needs: ['mutton'] },
  { name: 'Laal Maas', desc: 'Fiery Rajasthani mutton curry, mathania chillies', price: 520, veg: false, category: 'Mains', needs: ['mutton', 'mathania'] },
  { name: 'Gatte ki Sabzi', desc: 'Gram-flour dumplings simmered in spiced yogurt gravy', price: 320, veg: true, category: 'Mains', needs: ['gramflour', 'buttermilk'] },
  { name: 'Ker Sangri', desc: 'Desert beans and berries, slow-cooked Marwari style', price: 300, veg: true, category: 'Mains', needs: ['lentils'] },
  { name: 'Tandoori Pomfret', desc: 'Whole pomfret, coastal spice rub, clay-oven roasted', price: 480, veg: false, category: 'Tandoor & Grill', needs: ['pomfret'] },
  { name: 'Murgh Malai Tikka', desc: 'Cream-marinated chicken, cardamom and cheese', price: 380, veg: false, category: 'Tandoor & Grill', needs: ['chicken'] },
  { name: 'Paneer Angara', desc: 'Cottage cheese, smoked red chilli glaze', price: 350, veg: true, category: 'Tandoor & Grill', needs: ['paneer'] },
  { name: 'Bajre ki Roti', desc: 'Pearl millet flatbread, hearth-baked', price: 60, veg: true, category: 'Breads', needs: ['bajraflour'] },
  { name: 'Missi Roti', desc: 'Spiced gram-flour flatbread with ajwain', price: 70, veg: true, category: 'Breads', needs: ['gramflour', 'wheatflour'] },
  { name: 'Garlic Naan', desc: 'Leavened bread, roasted garlic and butter', price: 90, veg: true, category: 'Breads', needs: ['wheatflour', 'ghee'] },
  { name: 'Ghevar', desc: 'Disc-shaped Rajasthani sweet, soaked in sugar syrup', price: 180, veg: true, category: 'Desserts', needs: ['wheatflour', 'ghee'] },
  { name: 'Malpua with Rabri', desc: 'Sweet pancake, reduced saffron milk', price: 220, veg: true, category: 'Desserts', needs: ['wheatflour', 'saffron'] },
  { name: 'Mawa Kachori', desc: 'Deep-fried pastry, khoya and dry-fruit filling', price: 160, veg: true, category: 'Desserts', needs: ['khoya'] },
  { name: 'Masala Chaas', desc: 'Spiced buttermilk, roasted cumin', price: 90, veg: true, category: 'Drinks', needs: ['buttermilk'] },
  { name: 'Jaljeera', desc: 'Tangy cumin and mint cooler', price: 100, veg: true, category: 'Drinks', needs: [] },
  { name: 'Kesar Badam Milk', desc: 'Saffron and almond milk, served chilled', price: 150, veg: true, category: 'Drinks', needs: ['saffron', 'almonds'] },
];

// ---- Staff (from OwnerDashboard.jsx STAFF_INITIAL) ----
const STAFF = [
  { name: 'Ramesh Chaudhary', role: 'Head Chef', shift: '12 PM – 10 PM', onDuty: true, ordersHandled: 34 },
  { name: 'Suresh Nath', role: 'Tandoor Chef', shift: '12 PM – 10 PM', onDuty: true, ordersHandled: 28 },
  { name: 'Priya Rathore', role: 'Sous Chef', shift: '2 PM – 11 PM', onDuty: true, ordersHandled: 22 },
  { name: 'Aditya Singh', role: 'Line Cook', shift: '12 PM – 8 PM', onDuty: false, ordersHandled: 19 },
  { name: 'Kavita Meena', role: 'Server', shift: '12 PM – 10 PM', onDuty: true, ordersHandled: 41 },
  { name: 'Rohan Vyas', role: 'Server', shift: '6 PM – 11:30 PM', onDuty: true, ordersHandled: 17 },
  { name: 'Sunita Devi', role: 'Cashier', shift: '12 PM – 10 PM', onDuty: true, ordersHandled: 63 },
  { name: 'Manoj Purohit', role: 'Manager', shift: '11 AM – 11 PM', onDuty: true, ordersHandled: 0 },
];

// ---- Tables (from OwnerDashboard.jsx TABLES_INITIAL) ----
const TABLES = [
  { label: 'T1', seats: 2, status: 'occupied', party: 2 },
  { label: 'T2', seats: 2, status: 'available' },
  { label: 'T3', seats: 4, status: 'occupied', party: 3 },
  { label: 'T4', seats: 4, status: 'reserved' },
  { label: 'T5', seats: 4, status: 'occupied', party: 4 },
  { label: 'T6', seats: 6, status: 'occupied', party: 5 },
  { label: 'T7', seats: 2, status: 'available' },
  { label: 'T8', seats: 4, status: 'available' },
  { label: 'T9', seats: 6, status: 'occupied', party: 6 },
  { label: 'T10', seats: 2, status: 'occupied', party: 2 },
  { label: 'T11', seats: 4, status: 'reserved' },
  { label: 'T12', seats: 8, status: 'available' },
];

async function main() {
  console.log('Seeding Coal & Clay database...');

  // Ingredients
  for (const ing of INGREDIENTS) {
    await prisma.ingredient.upsert({
      where: { id: ing.id },
      update: ing,
      create: ing,
    });
  }
  console.log(`  ✓ ${INGREDIENTS.length} ingredients`);

  // Menu items + their ingredient links
  for (const item of MENU_ITEMS) {
    const { needs, ...data } = item;
    const existing = await prisma.menuItem.findFirst({ where: { name: item.name } });
    const menuItem = existing
      ? await prisma.menuItem.update({ where: { id: existing.id }, data })
      : await prisma.menuItem.create({ data });

    // clear old links then recreate (idempotent re-seed)
    await prisma.menuItemIngredient.deleteMany({ where: { menuItemId: menuItem.id } });
    for (const ingredientId of needs) {
      await prisma.menuItemIngredient.create({
        data: { menuItemId: menuItem.id, ingredientId, qtyPerOrder: 1 },
      });
    }
  }
  console.log(`  ✓ ${MENU_ITEMS.length} menu items (with ingredient links)`);

  // Staff
  for (const s of STAFF) {
    const existing = await prisma.staff.findFirst({ where: { name: s.name } });
    if (existing) await prisma.staff.update({ where: { id: existing.id }, data: s });
    else await prisma.staff.create({ data: s });
  }
  console.log(`  ✓ ${STAFF.length} staff members`);

  // Tables
  for (const t of TABLES) {
    await prisma.diningTable.upsert({
      where: { label: t.label },
      update: t,
      create: t,
    });
  }
  console.log(`  ✓ ${TABLES.length} dining tables`);

  // A demo customer account (email: demo@coalandclay.test / password: demo1234)
  const demoPasswordHash = await bcrypt.hash('demo1234', 10);
  await prisma.user.upsert({
    where: { email: 'demo@coalandclay.test' },
    update: {},
    create: {
      name: 'Demo Customer',
      email: 'demo@coalandclay.test',
      phone: '+919999999999',
      passwordHash: demoPasswordHash,
    },
  });
  console.log('  ✓ demo customer account (demo@coalandclay.test / demo1234)');

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
