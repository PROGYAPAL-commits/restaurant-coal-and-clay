// Holds the Socket.IO server instance so any route/controller can emit
// events without circular-importing src/index.js.
let io = null;

function init(server, corsOrigin) {
  const { Server } = require('socket.io');
  io = new Server(server, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST', 'PATCH'] },
  });

  io.on('connection', (socket) => {
    console.log(`[socket] client connected: ${socket.id}`);
    socket.on('disconnect', () => {
      console.log(`[socket] client disconnected: ${socket.id}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.IO not initialized yet — call init(server) first.');
  return io;
}

// Convenience emitters — every route calls these instead of touching `io` directly,
// so the event names/payloads documented in the README stay the single source of truth.
const emit = {
  orderNew: (order) => io && io.emit('order:new', order),
  orderUpdated: (order) => io && io.emit('order:updated', order),
  menuUpdated: (menuItem) => io && io.emit('menu:updated', menuItem),
  ingredientUpdated: (ingredient) => io && io.emit('ingredient:updated', ingredient),
  tableUpdated: (table) => io && io.emit('table:updated', table),
};

module.exports = { init, getIO, emit };
