'use strict';

/**
 * Socket.IO event mock
 *
 * Records all socket emissions that go through the exported helpers in
 * `app/helpers.js` (emitToUser, emitNewFriendRequest, realtime.*, etc.)
 * without needing a live Socket.IO server.
 *
 * Usage:
 *
 *   const socketMock = require('../mocks/socket');
 *
 *   before(() => {
 *     // Swap the module cache so helpers.js uses our mock
 *     const helpersPath = require.resolve('../../../app/helpers');
 *     const helpers = require(helpersPath);
 *
 *     // Replace the live io / emitters with spies
 *     helpers.__setSocketMock(socketMock);
 *   });
 *
 *   beforeEach(() => socketMock.reset());
 *
 *   it('emits notification-received to recipient', () => {
 *     socketMock.assertEmitted(assert, 'notification-received', String(bobId));
 *   });
 */

/**
 * Recorded socket emissions.
 * Each entry: { event, targetUserId, data, ts }
 */
const emissions = [];

/** Record an emitToUser call */
function emitToUser(userId, event, data) {
  emissions.push({ event, targetUserId: String(userId), data, ts: Date.now() });
}

/** Record a broadcast-to-all call */
function emitToAll(event, data) {
  emissions.push({ event, targetUserId: '*', data, ts: Date.now() });
}

/** Record multi-user emit calls */
function emitToUsers(userIds, event, data) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  ids.forEach(uid => emitToUser(uid, event, data));
}

// ─── Named helpers that map to specific events ───────────────────────────────

function emitNewFriendRequest(toId, fromId) {
  emitToUser(toId, 'new-friend-request', { fromId });
}

function emitFriendRequestAccepted(fromId, toId) {
  emitToUser(fromId, 'friend-request-accepted', { toId });
  emitToUser(toId,   'friend-request-accepted', { fromId });
}

function emitFriendRequestDeclined(fromId, toId) {
  emitToUser(fromId, 'friend-request-declined', { toId });
}

function emitFriendRequestsUpdated(fromId, toId) {
  emitToUser(fromId, 'friend-requests-updated', {});
  emitToUser(toId,   'friend-requests-updated', {});
}

/**
 * realtime namespace — mirrors the `realtime` object exported from helpers.js.
 * Each method simply delegates to emitToUser with a specific event name.
 */
const realtime = {
  /**
   * Emits "new-message" (hyphen) — standardized in helpers.js and AdminController.
   * (Previously emitted "new_message" with underscore — fixed in Fix 3.)
   */
  emitNewMessage(toId, data) {
    emitToUser(toId, 'new-message', data);
  },
  emitFeedPost(userIds, data) {
    emitToUsers(userIds, 'feed-post', data);
  },
  emitMention(userId, data) {
    emitToUser(userId, 'notification-received', data);
  },
  emitPostVote(userId, data) {
    emitToUser(userId, 'post-voted', data);
  },
  emitCommentVote(userId, data) {
    emitToUser(userId, 'comment-voted', data);
  },
  emitPostInteraction(postId, ownerId, actorId, type, payload = {}) {
    emitToUser(String(ownerId), 'post-interaction', { postId: String(postId), actorId: String(actorId), type, ...payload });
  },
};

/** Reset all recorded emissions between tests */
function reset() {
  emissions.length = 0;
}

// ─── Assertion helpers ────────────────────────────────────────────────────────

/**
 * Assert that an event was emitted to a specific user at least once.
 *
 * @param {object} assert  - Chai assert object
 * @param {string} event   - Socket event name
 * @param {string} userId  - Expected target user ID (falsy = any user)
 */
function assertEmitted(assert, event, userId) {
  const matches = emissions.filter(e =>
    e.event === event && (!userId || e.targetUserId === String(userId))
  );
  assert.isAbove(matches.length, 0,
    `Expected socket event "${event}"${userId ? ` to user "${userId}"` : ''} to be emitted, but it was not.`
  );
}

/**
 * Assert that an event was NOT emitted to a specific user.
 */
function assertNotEmitted(assert, event, userId) {
  const matches = emissions.filter(e =>
    e.event === event && (!userId || e.targetUserId === String(userId))
  );
  assert.equal(matches.length, 0,
    `Expected socket event "${event}"${userId ? ` to user "${userId}"` : ''} NOT to be emitted, but it was.`
  );
}

/** Get latest emission for event + userId */
function lastEmission(event, userId) {
  const matches = emissions.filter(e =>
    e.event === event && (!userId || e.targetUserId === String(userId))
  );
  return matches[matches.length - 1] || null;
}

module.exports = {
  // Emitter functions (use to replace helpers exports in tests)
  emitToUser,
  emitToAll,
  emitToUsers,
  emitNewFriendRequest,
  emitFriendRequestAccepted,
  emitFriendRequestDeclined,
  emitFriendRequestsUpdated,
  realtime,

  // Test control
  reset,

  // Inspection
  emissions,
  assertEmitted,
  assertNotEmitted,
  lastEmission,
};
