require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');

const socket = require('./lib/socket');
const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const menuRoutes = require('./routes/menu');
const ingredientRoutes = require('./routes/ingredients');
const analyticsRoutes = require('./routes/analytics');
const tableRoutes = require('./routes/tables');
const staffRoutes = require('./routes/staff');

const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'];

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true, service: 'coal-and-clay-backend' }));

app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/ingredients', ingredientRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/staff', staffRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);
socket.init(server, CORS_ORIGIN);

server.listen(PORT, () => {
  console.log(`Coal & Clay backend listening on http://localhost:${PORT}`);
  console.log(`Socket.IO ready — CORS origins: ${CORS_ORIGIN.join(', ')}`);
});
