// app/utils/socketManager.js

// userId -> Set of socket IDs (to support multi-device / multi-tab)
const connectedUsers = new Map();
// socketId -> userId (for quick lookup on disconnect)
const socketUserMap = new Map();

// presence layer (Redis-backed when available)
const presence = require('./presence');

/**
 * Register a socket connection for a user
 */
function userConnected(userId, socketId) {
  if (!connectedUsers.has(userId)) {
    connectedUsers.set(userId, new Set());
  }
  connectedUsers.get(userId).add(socketId);
  socketUserMap.set(socketId, userId);
  console.log(`Socket connected. Active sockets for account: ${connectedUsers.get(userId).size}`);

  // Mark presence in Redis/in-memory
  try { presence.setUserOnline(userId).catch(() => {}); } catch (e) {}
}

/**
 * Remove a socket when disconnected
 */
function userDisconnected(socketId) {
    const userId = socketUserMap.get(socketId);
    if (!userId) return false;

    socketUserMap.delete(socketId);

    const userSockets = connectedUsers.get(userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        connectedUsers.delete(userId);
          console.log('Account socket set is now offline');
          try { presence.setUserOffline(userId).catch(() => {}); } catch(e) {}
          return true; // went offline
      } else {
        console.log(`Account still has ${userSockets.size} active sockets`);
      }
    }
    return false; // still online somewhere
  }


/**
 * Check if a user is online
 */
function isUserOnline(userId) {
  // Prefer presence store for authoritative online state.
  try {
    // presence.isUserOnline returns promise; but many callers expect sync.
    // Provide sync fallback using connectedUsers while callers in async flow may call presence directly.
    // We'll check in-memory first (fast), then fire-and-forget an async check if needed.
    if (connectedUsers.has(userId) && connectedUsers.get(userId).size > 0) return true;
    // If not in-memory, we cannot await here synchronously; return false and let callers call presence.isUserOnline when they need accuracy.
    return false;
  } catch (e) {
    return false;
  }
}

module.exports = {
  connectedUsers,
  socketUserMap,
  userConnected,
  userDisconnected,
  isUserOnline
};
