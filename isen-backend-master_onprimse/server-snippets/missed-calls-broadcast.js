// Minimal Socket.IO snippet: receive client emits and broadcast to all sockets for a user
// Intended to be integrated into an existing Node.js + Socket.IO server.
// Assumptions:
// - You track a mapping from userId -> Set(socketId) when sockets connect (see example below).
// - This snippet only shows the minimal on-event handlers and broadcasting logic.

// Example integration sketch:
// const io = require('socket.io')(httpServer, { /* options */ });
// const userSockets = new Map(); // userId -> Set(socketId)

// On socket connection (example):
// io.on('connection', (socket) => {
//   const userId = socket.handshake.query.userId; // or your auth-derived id
//   if (!userSockets.has(userId)) userSockets.set(userId, new Set());
//   userSockets.get(userId).add(socket.id);
//   socket.on('disconnect', () => {
//     const s = userSockets.get(userId);
//     if (s) { s.delete(socket.id); if (s.size === 0) userSockets.delete(userId); }
//   });
//   // attach the handlers below per-socket
// });

// Handler attachment (to be used inside your io.on('connection', socket => { ... }))
function attachMissedCallHandlers(io, socket, userSockets) {
  // When a client clears all missed calls for a user/thread
  socket.on('missed-calls-cleared', (payload) => {
    // payload: { userId: 'targetUserId', clearedAt: 123456789 }
    if (!payload || !payload.userId) return;
    const targetUser = payload.userId;

    // Broadcast to all sockets that belong to the targetUser
    const sockets = userSockets.get(targetUser);
    if (!sockets) return;
    for (const sid of sockets) {
      // use io.to(sid).emit to target a particular socket
      io.to(sid).emit('missed-calls-cleared', payload);
    }
  });

  // When a client requests removal of a single missed-call (owner removed a missed call entry)
  socket.on('missed-call-removed', (payload) => {
    // payload: { owner: 'ownerUserId', removedUserId: 'callerId', at: 123456789 }
    if (!payload || !payload.owner) return;
    const targetUser = payload.owner;
    const sockets = userSockets.get(targetUser);
    if (!sockets) return;
    for (const sid of sockets) {
      io.to(sid).emit('missed-call-removed', payload);
    }
  });
}

module.exports = { attachMissedCallHandlers };

// Usage example (server-side):
// const { attachMissedCallHandlers } = require('./server-snippets/missed-calls-broadcast');
// io.on('connection', (socket) => {
//   // ... manage userSockets mapping as above ...
//   attachMissedCallHandlers(io, socket, userSockets);
// });
