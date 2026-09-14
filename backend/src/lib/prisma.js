const { PrismaClient } = require('@prisma/client');

// Reuse a single PrismaClient instance across the app (recommended pattern
// to avoid exhausting DB connections in dev with hot-reload).
const prisma = global.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.__prisma = prisma;

module.exports = prisma;
