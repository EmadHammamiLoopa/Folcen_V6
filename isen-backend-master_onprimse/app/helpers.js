/*********************************************************************
 * helpers/index.js  â€“ single source of truth for â€œgenericâ€ helpers
 *********************************************************************/

const Response = require('./controllers/Response');
const Report   = require('./models/Report');
const mongoose = require('mongoose');
const { recordAudit } = require('./utils/audit');
const pushSvc  = require('.././app/utils/pushService');          // FCM push shim (via app/utils/pushService â†’ services/fcmPushService)
const socketManager = require('.././app/utils/socketManager');

/*â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ CONSTANTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€*/
const manAvatarPath   = '/avatars/male.webp';
const womenAvatarPath = '/avatars/female.webp';
const othersAvatarPath = '/avatars/other.webp';

const ERROR_CODES     = { SUBSCRIPTION_ERROR: 1001 };

/**
 * Helper to normalize User ID (handles Base64 encoded IDs from frontend)
 */
const normalizeId = (id) => {
    if (!id) return id;
    id = String(id).trim();
    if (mongoose.Types.ObjectId.isValid(id)) return id;
    try {
        const safe = id.replace(/-/g, '+').replace(/_/g, '/');
        const padded = safe.padEnd(safe.length + (4 - safe.length % 4) % 4, '=');
        const decoded = Buffer.from(padded, 'base64').toString('utf8');
        if (mongoose.Types.ObjectId.isValid(decoded)) return decoded;
    } catch (e) {}
    return id;
};

/**
 * Normalize ObjectIds in lean query results to strings
 * Use this after .lean() queries to prevent buffer serialization issues
 */
const normalizeLeanDoc = (doc) => {
    if (!doc) return doc;
    
    // Handle arrays
    if (Array.isArray(doc)) {
        return doc.map(item => normalizeLeanDoc(item));
    }
    
    // Handle non-objects
    if (typeof doc !== 'object') return doc;
    
    // Handle ObjectId instances
    if (doc.constructor && doc.constructor.name === 'ObjectId') {
        return doc.toString();
    }
    
    // Handle plain objects - clone and normalize all fields
    const normalized = {};
    for (const key in doc) {
        if (doc.hasOwnProperty(key)) {
            const value = doc[key];
            
            // Convert ObjectId to string
            if (value && typeof value === 'object' && value.constructor && value.constructor.name === 'ObjectId') {
                normalized[key] = value.toString();
            }
            // Recursively handle arrays
            else if (Array.isArray(value)) {
                normalized[key] = value.map(item => {
                    if (item && typeof item === 'object' && item.constructor && item.constructor.name === 'ObjectId') {
                        return item.toString();
                    } else if (item && typeof item === 'object') {
                        return normalizeLeanDoc(item);
                    }
                    return item;
                });
            }
            // Recursively handle nested objects
            else if (value && typeof value === 'object' && value.constructor && value.constructor.name === 'Object') {
                normalized[key] = normalizeLeanDoc(value);
            }
            // Keep other values as-is
            else {
                normalized[key] = value;
            }
        }
    }
    
    return normalized;
};

/*â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Socket-IO bootstrap & helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€*/

// Live Socket.IO reference (initialized in server bootstrap via initSocket)
let io = null;

/** Initialize this helper module with a live io instance (call once in index.js) */
function initSocket(ioRef) {
  io = ioRef;
}

/** Build <userId â†’ Set<socketId>> map from live Socket.IO server */
function connectedUsersMap() {
  return socketManager.connectedUsers;
}

/** Get all socket ids for a user */
function userSocketIds(userId) {
  const sockets = socketManager.connectedUsers.get(String(userId));
  return sockets ? Array.from(sockets) : [];
}

/** Is a user currently connected (has at least one socket)? */
function isUserConnected(userId) {
  return socketManager.connectedUsers.has(String(userId));
}

/** Mutate an array of users to include .online based on socket presence */
function setOnlineUsers(users) {
  users.forEach(u => {
    if (u && u._id) {
      const userId = u._id.toString();
      // Check Map correctly using .has() or .get()
      u.online = socketManager.connectedUsers.has(userId);
    }
  });
  return users;
}

/** Emit an event to all sockets of a single user */
async function emitToUser(userId, event, payload = {}, options = {}) {
  if (!io) return false;

  // Reliability Hardening: Inject metadata (timestamp/version) for Task 2
  if (payload && typeof payload === 'object') {
     payload._metadata = {
       version: '1.0.0',
       timestamp: Date.now(),
       persistent: !!options.persistIfOffline
     };
  }

  const sockets = userSocketIds(String(userId));
  if (sockets.length > 0) {
    sockets.forEach(sid => io.to(sid).emit(event, payload));
    return true;
  } else if (options.persistIfOffline) {
    // Guaranteed Delivery: Save to Outbox if user is offline (Task 1)
    try {
      const EventOutbox = require('./models/EventOutbox');
      await EventOutbox.create({
        userId: String(userId),
        event,
        payload
      });
      console.log(`[STASHED] Offline event saved to Outbox: ${event}`);
    } catch (err) {
      console.error('Failed to stash offline event:', err.message);
    }
  }

  return false;
}

/** Replay events stashed while the user was offline */
async function replayOfflineEvents(userId, socket) {
  try {
    const EventOutbox = require('./models/EventOutbox');
    const events = await EventOutbox.find({ userId: String(userId) }).sort({ createdAt: 1 });
    if (events.length > 0) {
      console.log(`[REPLAY] Replaying ${events.length} queued event(s)`);
      for (const evt of events) {
        socket.emit(evt.event, evt.payload);
      }
      // Clear outbox after successful replay
      await EventOutbox.deleteMany({ userId: String(userId) });
    }
  } catch (err) {
    console.warn('[REPLAY] Replay failed:', err.message);
  }
}

/**
 * Shared policy for chat initiation permissions (Task 1: Single Source of Truth).
 * Enforces "Max 3 unique non-friend recipients per 24 hours" unless subscribed or friends.
 * Handles Block, Privacy (Follow fallback), and Thread Unlock.
 */
async function evaluateChatInitiation(senderId, receiverId) {
  const User = require('./models/User');
  const Message = require('./models/Message');
  const Follow = require('./models/Follow');
  const { userSubscribed } = require('./middlewares/subscription');

  // Video permission lifecycle is completely separate from normal chat.
  const normalMessageFilter = {
    type: { $ne: 'video-call-request' }
  };

  const [
    sender,
    receiver,
    peerHasReplied,
    senderHasSent
  ] = await Promise.all([
    User.findById(senderId)
      .select('friends blockedUsers subscription'),

    User.findById(receiverId)
      .select('friends blockedUsers isPrivate'),

    Message.exists({
      from: receiverId,
      to: senderId,
      ...normalMessageFilter
    }),

    Message.exists({
      from: senderId,
      to: receiverId,
      ...normalMessageFilter
    })
  ]);

  if (!sender || !receiver) {
    return {
      allowed: false,
      reason: 'user_not_found'
    };
  }

  const blockedByReceiver =
    (receiver.blockedUsers || []).some(
      id => String(id) === String(senderId)
    );

  const blockedBySender =
    (sender.blockedUsers || []).some(
      id => String(id) === String(receiverId)
    );

  if (blockedByReceiver || blockedBySender) {
    return {
      allowed: false,
      reason: 'blocked'
    };
  }

  const isFriend =
    (sender.friends || [])
      .map(String)
      .includes(String(receiverId));

  if (isFriend) {
    return {
      allowed: true,
      reason: null,
      budgetRemaining: Infinity,
      needsOpeningReservation: false
    };
  }

  // Once the other user has sent one NORMAL message back,
  // this normal-chat thread is unlocked.
  if (peerHasReplied) {
    return {
      allowed: true,
      reason: null,
      budgetRemaining: Infinity,
      needsOpeningReservation: false
    };
  }

  // Private accounts keep their privacy rule for first contact.
  // Friendship is NOT required; an active follow is enough.
  if (receiver.isPrivate) {
    const activeFollow =
      await Follow.findOne({
        follower: senderId,
        followed: receiverId,
        status: 'active'
      })
      .select('_id')
      .lean();

    if (!activeFollow) {
      return {
        allowed: false,
        reason: 'privacy_restricted'
      };
    }
  }

  // A non-friend has already used their opening message.
  if (senderHasSent) {
    return {
      allowed: false,
      reason: 'awaiting_reply'
    };
  }

  const premium = await userSubscribed(sender);
  if (premium) {
    return {
      allowed: true,
      reason: null,
      budgetRemaining: Infinity,
      needsOpeningReservation: true,
      premium: true,
      recentRecipientIds: [],
      friendIds: sender.friends || []
    };
  }

  const yesterday =
    new Date(
      Date.now() -
      24 * 60 * 60 * 1000
    );

  // Video request records MUST NOT consume this budget.
  const recentRecipients =
    await Message.find({
      from: senderId,
      createdAt: {
        $gte: yesterday
      },
      to: {
        $nin: sender.friends || []
      },
      ...normalMessageFilter
    }).distinct('to');

  const uniqueRecipients =
    new Set(
      recentRecipients.map(String)
    );

  if (uniqueRecipients.size >= 3) {
    return {
      allowed: false,
      reason: 'budget_exhausted',
      budgetRemaining: 0
    };
  }

  return {
    allowed: true,
    reason: null,
    budgetRemaining:
      Math.max(
        0,
        3 - uniqueRecipients.size
      ),
    needsOpeningReservation: true,
    premium: false,
    recentRecipientIds: recentRecipients,
    friendIds: sender.friends || []
  };
}

function publicChatPolicyResult(result) {
  return {
    allowed: !!result.allowed,
    reason: result.reason || null,
    ...(result.budgetRemaining !== undefined
      ? { budgetRemaining: result.budgetRemaining }
      : {})
  };
}

/**
 * Read-only chat permission check used by history/permission endpoints.
 * It observes active MongoDB opener leases but never acquires one.
 */
async function canInitiateChatPreview(senderId, receiverId) {
  const result = await evaluateChatInitiation(senderId, receiverId);
  if (!result.allowed || !result.needsOpeningReservation) {
    return publicChatPolicyResult(result);
  }

  const reservation = require('./services/chatOpeningReservation');
  const availability = await reservation.peekOpeningAvailability({
    senderId,
    receiverId,
    recentRecipientIds: result.recentRecipientIds || [],
    friendIds: result.friendIds || [],
    premium: !!result.premium
  });

  return publicChatPolicyResult(availability);
}

/**
 * Authoritative acquisition check for an actual normal-message send.
 * For a first non-friend opener this atomically acquires a MongoDB lease;
 * callers must finalize it after Message persistence or release it if
 * persistence itself fails.
 */
async function canInitiateChat(senderId, receiverId) {
  const result = await evaluateChatInitiation(senderId, receiverId);
  if (!result.allowed || !result.needsOpeningReservation) {
    return publicChatPolicyResult(result);
  }

  const reservation = require('./services/chatOpeningReservation');
  const acquired = await reservation.acquireOpeningReservation({
    senderId,
    receiverId,
    recentRecipientIds: result.recentRecipientIds || [],
    friendIds: result.friendIds || [],
    premium: !!result.premium
  });

  if (!acquired.allowed) {
    return publicChatPolicyResult(acquired);
  }

  return {
    ...publicChatPolicyResult(acquired),
    openingReservationToken: acquired.reservationToken
  };
}

async function finalizeChatOpeningReservation(senderId, receiverId, token, openedAt) {
  if (!token) return;
  const reservation = require('./services/chatOpeningReservation');
  return reservation.finalizeOpeningReservation({
    senderId,
    receiverId,
    token,
    openedAt: openedAt || new Date()
  });
}

async function releaseChatOpeningReservation(senderId, receiverId, token) {
  if (!token) return;
  const reservation = require('./services/chatOpeningReservation');
  return reservation.releaseOpeningReservation({
    senderId,
    receiverId,
    token
  });
}

async function releaseChatOpeningPair(senderId, receiverId) {
  const reservation = require('./services/chatOpeningReservation');
  return reservation.releaseOpeningPair(senderId, receiverId);
}

/** Simple memory-based rate limiting per user/type for reliability */
const rateLimitMap = new Map();
function checkRateLimit(userId, type, limit, windowMs) {
  const now = Date.now();
  const key = `${userId}:${type}`;
  const record = rateLimitMap.get(key) || { count: 0, startTime: now };

  if (now - record.startTime > windowMs) {
    record.count = 1;
    record.startTime = now;
  } else {
    record.count++;
  }

  rateLimitMap.set(key, record);
  return record.count <= limit;
}

/** Emit an event to multiple users */
function emitToUsers(userIds = [], event, payload = {}) {
  (Array.isArray(userIds) ? userIds : [userIds])
    .filter(Boolean)
    .forEach(uid => emitToUser(String(uid), event, payload));
}

/** Emit an event to all connected users */
function emitToAll(event, payload = {}) {
  if (!io) return;
  io.emit(event, payload);
}

/** Friends-related convenience emits used by the client UI */
function emitNewFriendRequest(toUserId, fromUserId) {
  // Client will instantly increment the "friends" badge
  emitToUser(toUserId, 'new-friend-request', { from: String(fromUserId) });
}

/**
 * Compute full statistics snapshot for a user
 */
async function getUserStatistics(userId) {
  try {
    const User = require('./models/User');
    const Follow = require('./models/Follow');
    const Request = require('./models/Request');

    const [u, pendingFollows, pendingFriends] = await Promise.all([
      User.findById(userId).select('friends followers following missedCallBudget'),
      Follow.countDocuments({ followed: userId, status: 'pending' }),
      Request.countDocuments({ to: userId, accepted: false })
    ]);

    if (!u) return null;

    return {
      friends: u.friends ? u.friends.length : 0,
      followers: u.followers ? u.followers.length : 0,
      following: u.following ? u.following.length : 0,
      budget: u.missedCallBudget || 0,
      pendingFollowRequests: pendingFollows,
      pendingFriendRequests: pendingFriends
    };
  } catch (e) {
    console.error('Error computing user stats:', e.message);
    return null;
  }
}

function emitFriendRequestsUpdated(userAId, userBId) {
  // Client will re-count precisely (API fetch) for both sides
  // We attach a snapshot of statistics to avoid force-reloading if possible
  setImmediate(async () => {
    try {
      const statsA = await getUserStatistics(userAId);
      const statsB = await getUserStatistics(userBId);

      const payloadA = { from: userBId, userId: userBId };
      const payloadB = { from: userAId, userId: userAId };

      if (statsA) {
        payloadA.statistics = statsA;
        // Explicit budget update for the notification badge
        emitToUser(userAId, 'budget-update', { missedCallBudget: statsA.budget });
      }
      if (statsB) {
        payloadB.statistics = statsB;
        // Explicit budget update for the notification badge
        emitToUser(userBId, 'budget-update', { missedCallBudget: statsB.budget });
      }

      emitToUser(userAId, 'friend-requests-updated', payloadA);
      emitToUser(userBId, 'friend-requests-updated', payloadB);
    } catch (e) {
      console.error('Failed to emit friend stats:', e);
      emitToUser(userAId, 'friend-requests-updated', { from: userBId, userId: userBId });
      emitToUser(userBId, 'friend-requests-updated', { from: userAId, userId: userAId });
    }
  });
}

function emitFriendRequestAccepted(userAId, userBId) {
  emitToUser(userAId, 'friend-requests-updated', { from: userBId, type: 'accepted', userId: userBId });
  emitToUser(userBId, 'friend-requests-updated', { from: userAId, type: 'accepted', userId: userAId });
}

function emitFriendRequestDeclined(userAId, userBId) {
  emitToUser(userAId, 'friend-requests-updated', { from: userBId, type: 'declined', userId: userBId });
  emitToUser(userBId, 'friend-requests-updated', { from: userAId, type: 'declined', userId: userAId });
}

/**
 * Create a persistent notification and optionally send push
 */
function cleanNotificationText(value, fallback) {
  let raw = value;
  if (raw && typeof raw === 'object') {
    raw = raw.en || raw.title || raw.body || raw.name || raw.displayName || raw.fullName || '';
  }
  const clean = String(raw ?? '')
    .replace(/\[object Object\]/gi, '')
    .replace(/\bundefined\b|\bnull\b|\bNaN\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || fallback;
}

function getSafeDisplayName(user, fallback = 'Someone') {
  if (!user) return fallback;
  const direct = cleanNotificationText(user.displayName || user.fullName || user.name, '');
  const first = cleanNotificationText(user.firstName, '');
  const last = cleanNotificationText(user.lastName, '');
  const composed = cleanNotificationText(`${first} ${last}`, '');
  const emailName = user.email ? cleanNotificationText(String(user.email).split('@')[0], '') : '';
  return cleanNotificationText(direct || composed || emailName, fallback);
}

function cleanNotificationData(data = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return Object.entries(data).reduce((acc, [key, value]) => {
    if (value === undefined || value === null) {
      acc[key] = '';
    } else if (typeof value === 'string') {
      acc[key] = cleanNotificationText(value, '');
    } else {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function cleanNotificationDoc(notification) {
  if (!notification || typeof notification !== 'object') return notification;
  const senderName = getSafeDisplayName(notification.sender, 'Folcen');
  const titleFallback = senderName === 'Folcen' ? 'Folcen' : senderName;
  return {
    ...notification,
    title: cleanNotificationText(notification.title, titleFallback),
    body: cleanNotificationText(notification.body, 'You have a new notification'),
    data: cleanNotificationData(notification.data || {})
  };
}

function isBroadActivityPush(type, data = {}) {
  if (data.inAppOnly === true || data.push === false || data.externalPush === false) return true;
  const key = String(type || data.type || '').toLowerCase();
  return [
    'followed_user_posted',
    'followed_user_created_product',
    'followed_user_created_service',
    'followed_user_created_job',
    'friend_activity',
    'friend_posted',
    'follower_activity',
    'channel_activity'
  ].some(token => key.includes(token));
}

async function createNotification({ recipientId, senderId, type, title, body, data = {} }) {
  try {
    const Notification = require('./models/Notification');
    let safeTitle = cleanNotificationText(title, 'Folcen');
    let safeBody = cleanNotificationText(body, 'You have a new notification');

    if ((/^(Folcen|Someone)$/.test(safeTitle) || /undefined|null/i.test(String(title || body || ''))) && senderId) {
      try {
        const User = require('./models/User');
        const sender = await User.findById(senderId).select('firstName lastName displayName fullName name email').lean();
        const senderName = getSafeDisplayName(sender);
        safeTitle = cleanNotificationText(title, senderName);
        safeBody = cleanNotificationText(body, `${senderName} sent you a notification`);
      } catch (_) {}
    }

    const safeData = cleanNotificationData(data);
    const notification = await Notification.create({
      recipient: recipientId,
      sender: senderId,
      type,
      title: safeTitle,
      body: safeBody,
      data: safeData
    });

    // Notify user via socket immediately if online (NotificationService listens)
    emitToUser(recipientId, 'notification-received', cleanNotificationDoc(notification.toObject ? notification.toObject() : notification));

    // Trigger push â€” use 5-arg path when data.link is set so the FCM deep-link
    // points to the actual content (post/comment) not a chat thread.
    if (isBroadActivityPush(type, safeData)) {
      return notification;
    }

    if (safeData && safeData.link) {
      sendNotification(
        { en: safeTitle },
        { en: safeBody },
        { type: type || 'message', link: safeData.link },
        [],
        [String(recipientId)]
      ).catch(() => {});
    } else {
      sendNotification([recipientId], safeBody, safeTitle, senderId).catch(() => {});
    }

    return notification;
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
}

/*â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ REAL-TIME SIGNALING HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€*/

const realtime = {
  /** Global or friend-based presence broadcast */
  broadcastPresence: (userId, isOnline) => {
    if (!io) return;
    io.emit('user-status-changed', { userId, online: isOnline });
  },

  /** Chat: Notify recipient of a new message (persistent) */
  emitNewMessage: (senderId, recipientId, messageData) => {
    emitToUser(recipientId, 'new-message', messageData, { persistIfOffline: true });
  },

  /** Chat: Confirm to sender that message was sent */
  emitMessageSent: (senderId, tempId, messageData) => {
    emitToUser(senderId, 'message_sent', { tempId, ...messageData });
  },

  /** Chat: Notify sender that message was delivered */
  emitMessageDelivered: (messageId, senderId, recipientId) => {
    emitToUser(senderId, 'message_delivered', { messageId, recipientId });
  },

  /** Chat: Notify sender that message was read */
  emitMessageRead: (messageId, senderId, recipientId) => {
    emitToUser(senderId, 'message_read', { messageId, recipientId });
  },

  /** Profile: Notify everyone (or listeners) of a profile change */
  emitProfileUpdate: (user) => {
    if (!io) return;
    io.emit('user-profile-updated', { 
        userId: user._id, 
        fields: {
            firstName: user.firstName,
            lastName: user.lastName,
            avatar: user.avatar,
            online: user.online,
            allowVideoRequestsFromNonFriends: user.allowVideoRequestsFromNonFriends
        }
    });
  },

  /** Social: Sync friend request status */
  emitFriendRequest: (fromId, toId, status) => {
    emitToUser(toId, 'friend-requests-updated', { type: status, from: fromId });
  },

  /** Social: Sync follow/unfollow status */
  emitFollowUpdate: (fromId, toId, status) => {
    setImmediate(async () => {
        try {
            const statsA = await getUserStatistics(fromId);
            const statsB = await getUserStatistics(toId);

            // Explicit budget updates for both parties
            if (statsA) emitToUser(fromId, 'budget-update', { missedCallBudget: statsA.budget });
            if (statsB) emitToUser(toId, 'budget-update', { missedCallBudget: statsB.budget });

            emitToUser(toId, 'follow-update', { 
                type: status, 
                userId: fromId,
                followerId: fromId,
                followedId: toId,
                actorId: fromId,
                targetId: toId,
                actorStatistics: statsA,
                targetStatistics: statsB
            });
            emitToUser(fromId, 'follow-update', { 
                type: status, 
                userId: toId,
                followerId: fromId,
                followedId: toId,
                actorId: fromId,
                targetId: toId,
                actorStatistics: statsA,
                targetStatistics: statsB
            });
        } catch (e) {
            console.error('Failed to emit follow stats:', e);
            emitToUser(toId, 'follow-update', { type: status, userId: fromId });
            emitToUser(fromId, 'follow-update', { type: status, userId: toId });
        }
    });
  },

  /** Mentions: Immediate propagation of mentions */
  emitMention: (userId, type, targetId, text) => {
    emitToUser(userId, 'mention-received', { type, targetId, text });
  },

  /** Feed: Notify recipients of new post in their feed */
  emitFeedPost: (recipients, postData) => {
    if (!io || !recipients || !Array.isArray(recipients)) return;
    
    // Normalize the post data to ensure all IDs are strings
    const normalizedPost = {
      ...postData,
      _id: postData._id ? String(postData._id) : undefined,
      user: postData.user ? {
        ...postData.user,
        _id: postData.user._id ? String(postData.user._id) : undefined
      } : undefined,
      channel: postData.channel ? String(postData.channel) : undefined
    };

    // Emit to each recipient
    recipients.forEach(recipientId => {
      const rid = String(recipientId);
      emitToUser(rid, 'new_feed_post', normalizedPost, { persistIfOffline: true });
    });
  },

  /** Post/Comment: Notify post/comment owner of an interaction (vote, comment, etc.) */
  emitPostInteraction: (postId, ownerId, actorId, type, payload = {}) => {
    if (!ownerId) return;
    emitToUser(String(ownerId), 'post-interaction', {
      postId: String(postId),
      actorId: String(actorId),
      type,
      ...payload
    });
  }
};

/**
 * Validate password strength
 * At least 8 characters, one uppercase, one lowercase, one number and one special character
 */
function validatePassword(password) {
  if (!password) return false;
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return regex.test(password);
}

/** Thoroughly purge a user and all their data (GDPR/Permanent Delete) */
async function purgeUser(userId) {
  const User = require('./models/User');
  const Message = require('./models/Message');
  const Post = require('./models/Post');
  const Comment = require('./models/Comment');
  const Product = require('./models/Product');
  const Job = require('./models/Job');
  const Service = require('./models/Service');
  const Follow = require('./models/Follow');
  const LegalAcceptance = require('./models/LegalAcceptance');
  const Report = require('./models/Report');
  const Activity = require('./models/Activity');
  const Channel = require('./models/Channel');
  const Request = require('./models/Request');
  const Notification = require('./models/Notification');
  const PushToken = require('./models/PushToken');
  const UserActivityDaily = require('./models/UserActivityDaily');

  // Operational records/references that must not survive permanent purge.
  const Peer = require('./models/Peer');
  const Subscription = require('./models/Subscription');
  const ChatOpeningLease = require('./models/ChatOpeningLease');
  const Announcement = require('./models/Announcement');
  const PlanRule = require('./models/PlanRule');
  const SubscriptionPaymentReceipt = require('./models/SubscriptionPaymentReceipt');
  const Content = require('./models/Content');

  const mediaStore = require('./utils/mediaStore');

  // New GDPR models — safe to skip if a deployment has not migrated them yet.
  let UserInterestProfile, UserConsent, AnalyticsEvent;
  try { UserInterestProfile = require('./models/UserInterestProfile'); } catch (e) {}
  try { UserConsent = require('./models/UserConsent'); } catch (e) {}
  try { AnalyticsEvent = require('./models/AnalyticsEvent'); } catch (e) {}

  const fs = require('fs').promises;
  const path = require('path');

  const normalizedUserId =
    String(userId);

  const publicRoot =
    path.resolve(
      __dirname,
      '..',
      'public'
    );

  const erasedMedia =
    new Set();

  /**
   * Delete one managed media path from both:
   *   - durable GridFS storage, when present
   *   - local public storage, when present
   *
   * External URLs and shared defaults are never unlinked locally.
   */
  async function eraseStoredMedia(value) {
    if (!value) {
      return;
    }

    const normalized =
      mediaStore.normalizePublicPath(
        value
      );

    if (!normalized) {
      return;
    }

    // Never delete the shared channel placeholder.
    if (
      normalized ===
      '/channels/channel-default.png'
    ) {
      return;
    }

    if (
      erasedMedia.has(
        normalized
      )
    ) {
      return;
    }

    erasedMedia.add(
      normalized
    );

    // Strict durable deletion. Errors propagate so a purge cannot silently
    // complete while a GridFS copy remains.
    await mediaStore.removeStored(
      normalized
    );

    let managedPath =
      normalized;

    if (
      managedPath.startsWith(
        '/public/uploads/'
      )
    ) {
      managedPath =
        managedPath.replace(
          '/public/uploads/',
          '/uploads/'
        );
    }

    const managedPrefixes = [
      '/uploads/',
      '/upload_chat/',
      '/channels/',
      '/products/',
      '/jobs/',
      '/services/'
    ];

    if (
      !managedPrefixes.some(prefix =>
        managedPath.startsWith(prefix)
      )
    ) {
      return;
    }

    const relative =
      managedPath.replace(
        /^\/+/,
        ''
      );

    const localPath =
      path.resolve(
        publicRoot,
        relative
      );

    // Prevent traversal outside backend/public.
    if (
      localPath !== publicRoot &&
      !localPath.startsWith(
        `${publicRoot}${path.sep}`
      )
    ) {
      throw new Error(
        'Refusing to erase media outside managed public storage'
      );
    }

    try {
      await fs.unlink(
        localPath
      );

      console.log(
        `[GDPR Purge] Deleted managed media: ${localPath}`
      );

    } catch (error) {

      if (
        error.code !==
        'ENOENT'
      ) {
        throw error;
      }
    }
  }


  // ----------------------------------------------------------
  // 0. Capture identity + media BEFORE deleting database rows.
  // ----------------------------------------------------------

  const user =
    await User.findById(
      userId
    )
      .select(
        'mainAvatar avatar firebaseUid email'
      )
      .lean();


  if (user) {

    if (
      user.mainAvatar
    ) {
      await eraseStoredMedia(
        user.mainAvatar
      );
    }

    if (
      Array.isArray(
        user.avatar
      )
    ) {

      for (
        const avatarPath
        of user.avatar
      ) {
        await eraseStoredMedia(
          avatarPath
        );
      }
    }
  }


  // Posts.
  const userPosts =
    await Post.find({
      user: userId
    })
      .select(
        'media.url'
      )
      .lean();


  for (
    const p
    of userPosts
  ) {

    if (
      p.media &&
      p.media.url
    ) {
      await eraseStoredMedia(
        p.media.url
      );
    }
  }


  // Comments.
  const userComments =
    await Comment.find({
      user: userId
    })
      .select(
        'media.url'
      )
      .lean();


  for (
    const c
    of userComments
  ) {

    if (
      c.media &&
      c.media.url
    ) {
      await eraseStoredMedia(
        c.media.url
      );
    }
  }


  // Only media sent by the deleted user is owned by that user.
  // Messages received from another user are deleted below as conversation
  // records, but their sender's underlying uploaded media is not treated as
  // media owned by the recipient.
  const userMessages =
    await Message.find({
      from: userId
    })
      .select(
        'image media'
      )
      .lean();


  for (
    const message
    of userMessages
  ) {

    if (
      message.image &&
      message.image.path
    ) {
      await eraseStoredMedia(
        message.image.path
      );
    }

    if (
      Array.isArray(
        message.media
      )
    ) {

      for (
        const item
        of message.media
      ) {

        if (
          item &&
          item.path
        ) {
          await eraseStoredMedia(
            item.path
          );
        }

        if (
          item &&
          item.thumbnail
        ) {
          await eraseStoredMedia(
            item.thumbnail
          );
        }
      }
    }
  }


  // Channels.
  const userChannels =
    await Channel.find({
      user: userId
    })
      .select(
        '_id photo photos'
      )
      .lean();


  const channelIds =
    userChannels.map(
      channel =>
        channel._id
    );


  for (
    const channel
    of userChannels
  ) {

    if (
      channel.photo &&
      channel.photo.path
    ) {
      await eraseStoredMedia(
        channel.photo.path
      );
    }

    if (
      Array.isArray(
        channel.photos
      )
    ) {

      for (
        const photo
        of channel.photos
      ) {

        if (
          photo &&
          photo.path
        ) {
          await eraseStoredMedia(
            photo.path
          );
        }
      }
    }
  }


  // Products.
  const userProducts =
    await Product.find({
      user: userId
    })
      .select(
        'photos'
      )
      .lean();


  for (
    const product
    of userProducts
  ) {

    if (
      Array.isArray(
        product.photos
      )
    ) {

      for (
        const photo
        of product.photos
      ) {

        if (
          photo &&
          photo.path
        ) {
          await eraseStoredMedia(
            photo.path
          );
        }
      }
    }
  }


  // Jobs.
  const userJobs =
    await Job.find({
      user: userId
    })
      .select(
        'photo'
      )
      .lean();


  for (
    const job
    of userJobs
  ) {

    if (
      job.photo &&
      job.photo.path
    ) {
      await eraseStoredMedia(
        job.photo.path
      );
    }
  }


  // Services.
  const userServices =
    await Service.find({
      user: userId
    })
      .select(
        'photo'
      )
      .lean();


  for (
    const service
    of userServices
  ) {

    if (
      service.photo &&
      service.photo.path
    ) {
      await eraseStoredMedia(
        service.photo.path
      );
    }
  }


  // Catch abandoned avatar/chat GridFS uploads that have a userId metadata
  // value but were never attached to a later database record.
  const orphanedUserMediaPaths =
    await mediaStore.removeStoredByUser(
      normalizedUserId
    );


  for (
    const orphanedPath
    of orphanedUserMediaPaths
  ) {
    await eraseStoredMedia(
      orphanedPath
    );
  }


  // ----------------------------------------------------------
  // 1. Delete owned/user-specific operational records.
  // ----------------------------------------------------------

  await Promise.all([

    User.deleteOne({
      _id: userId
    }),

    Post.deleteMany({
      user: userId
    }),

    Comment.deleteMany({
      user: userId
    }),

    Product.deleteMany({
      user: userId
    }),

    Job.deleteMany({
      user: userId
    }),

    Service.deleteMany({
      user: userId
    }),

    Message.deleteMany({
      $or: [
        {
          from: userId
        },
        {
          to: userId
        }
      ]
    }),

    Request.deleteMany({
      $or: [
        {
          from: userId
        },
        {
          to: userId
        }
      ]
    }),

    Follow.deleteMany({
      $or: [
        {
          follower: userId
        },
        {
          followed: userId
        }
      ]
    }),

    // Existing legal/activity behavior is preserved in B1.
    // Retention classification is handled separately in C4-B2.
    LegalAcceptance.deleteMany({
      userId: userId
    }),

    Activity.deleteMany({
      actor: userId
    }),

    Report.deleteMany({
      $or: [
        {
          reporter: userId
        },
        {
          entity: userId,
          entityModel: 'User'
        }
      ]
    }),

    Channel.deleteMany({
      user: userId
    }),

    PushToken.deleteMany({
      userId
    }),

    Notification.deleteMany({
      $or: [
        {
          recipient: userId
        },
        {
          sender: userId
        }
      ]
    }),

    UserActivityDaily.deleteMany({
      userId
    }),

    Peer.deleteMany({
      userId: normalizedUserId
    }),

    Subscription.deleteMany({
      userId
    }),

    SubscriptionPaymentReceipt.deleteMany({
      userId
    }),

    ChatOpeningLease.deleteMany({
      sender: userId
    }),

    Content.deleteMany({
      user: userId
    }),

    ...(UserInterestProfile
      ? [
          UserInterestProfile.deleteOne({
            userId
          })
        ]
      : []),

    ...(UserConsent
      ? [
          UserConsent.deleteOne({
            userId
          })
        ]
      : []),

    ...(AnalyticsEvent
      ? [
          AnalyticsEvent.deleteMany({
            userId
          })
        ]
      : [])
  ]);


  // ----------------------------------------------------------
  // 2. Remove references from surviving records.
  // ----------------------------------------------------------

  await Promise.all([

    User.updateMany(
      {},
      {
        $pull: {
          followers: userId,
          following: userId,
          friends: userId,
          blockedUsers: userId
        }
      }
    ),

    Channel.updateMany(
      {},
      {
        $pull: {
          followers: userId
        }
      }
    ),

    Channel.updateMany(
      {
        approvedBy: userId
      },
      {
        $unset: {
          approvedBy: 1
        }
      }
    ),

    Post.updateMany(
      {
        'votes.user': userId
      },
      {
        $pull: {
          votes: {
            user: userId
          }
        }
      }
    ),

    Comment.updateMany(
      {
        'votes.user': userId
      },
      {
        $pull: {
          votes: {
            user: userId
          }
        }
      }
    ),

    Announcement.updateMany(
      {
        seenBy: normalizedUserId
      },
      {
        $pull: {
          seenBy: normalizedUserId
        }
      }
    ),

    Announcement.updateMany(
      {
        createdBy: userId
      },
      {
        $unset: {
          createdBy: 1
        }
      }
    ),

    PlanRule.updateMany(
      {
        targetUsers: userId
      },
      {
        $pull: {
          targetUsers: userId
        }
      }
    ),

    ChatOpeningLease.updateMany(
      {
        'leases.receiver': userId
      },
      {
        $pull: {
          leases: {
            receiver: userId
          }
        }
      }
    )
  ]);


  // ----------------------------------------------------------
  // 3. Hard-delete Firebase Auth identity.
  // ----------------------------------------------------------

  if (
    user &&
    (
      user.firebaseUid ||
      user.email
    )
  ) {

    try {

      const {
        admin: firebaseAdmin
      } =
        require(
          './services/firebaseAdmin'
        );


      if (
        firebaseAdmin &&
        firebaseAdmin.apps &&
        firebaseAdmin.apps.length &&
        firebaseAdmin.auth
      ) {

        let firebaseUid =
          user.firebaseUid ||
          null;


        if (
          !firebaseUid &&
          user.email
        ) {

          try {

            const firebaseRecord =
              await firebaseAdmin
                .auth()
                .getUserByEmail(
                  String(
                    user.email
                  )
                    .trim()
                    .toLowerCase()
                );


            firebaseUid =
              firebaseRecord.uid;

          } catch (
            lookupErr
          ) {

            if (
              lookupErr.code !==
              'auth/user-not-found'
            ) {

              console.warn(
                '[GDPR Purge] Firebase lookup by email failed (non-fatal):',
                lookupErr.message
              );
            }
          }
        }


        if (
          firebaseUid
        ) {

          try {

            await firebaseAdmin.auth().deleteUser(firebaseUid);


            console.log(
              `[GDPR Purge] Deleted Firebase Auth user: ${firebaseUid}`
            );

          } catch (
            deleteErr
          ) {

            if (
              deleteErr.code ===
              'auth/user-not-found'
            ) {

              console.warn(
                '[GDPR Purge] Firebase user already absent during delete'
              );

            } else {

              throw deleteErr;
            }
          }
        }
      }

    } catch (
      fbErr
    ) {

      // Existing Firebase deletion remains non-fatal because deployments may
      // use local-only authentication or the Firebase identity may already be
      // absent.
      console.warn(
        '[GDPR Purge] Firebase Auth delete failed (non-fatal):',
        fbErr.message
      );
    }
  }
}

function buildCallInvitePayload(calleeId, callerId = null, options = {}) {
  const now = Date.now();
  const caller = callerId ? String(callerId) : '';
  const receiver = calleeId ? String(calleeId) : '';
  const callId = options.callId
    ? String(options.callId)
    : `call-${caller || 'unknown'}-${receiver || 'unknown'}-${now}`;

  return {
    type: 'incoming_call',
    category: 'call',
    event: 'call:invite',
    status: 'ringing',
    callId,
    callType: options.callType || 'video',
    callerId: caller,
    fromUserId: caller,
    receiverId: receiver,
    toUserId: receiver,
    callerName: options.callerName || '',
    callerAvatar: options.callerAvatar || '',
    timestamp: options.timestamp || now,
    expiresAt: options.expiresAt || (now + 90 * 1000)
  };
}

/** Wake the callee: emit on socket and also push so backgrounded apps wake. */
function notifyPeerNeeded(calleeId, callerId = null, options = {}) {
  if (!io) return console.warn('notifyPeerNeeded called before helpers.initSocket(io)');
  const payload = buildCallInvitePayload(calleeId, callerId, options);
  const sockets = userSocketIds(String(calleeId));
  if (sockets.length > 0) {
    sockets.forEach(sid => {
      io.to(sid).emit('call:invite', payload);
      io.to(sid).emit('incoming-call', payload);
      io.to(sid).emit('called', payload);
    });
  }
  pushSvc.sendPush(calleeId, {
    title: 'Incoming video call',
    body: 'Tap to answer',
    data: payload,
    android: {
      priority: 'high',
      ttl: 90 * 1000,
      notification: {
        channelId: 'calls',
        sound: 'default',
        priority: 'max',
        defaultSound: true
      }
    },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: {
        aps: {
          alert: {
            title: 'Incoming video call',
            body: 'Tap to answer'
          },
          sound: 'default',
          category: 'INCOMING_CALL',
          'interruption-level': 'time-sensitive'
        }
      }
    }
  }).then(result => {
    console.log(`[callPush] completed sockets=${sockets.length} success=${result?.successCount || 0} failure=${result?.failureCount || 0} removed=${result?.removedInvalid || 0}`);
  }).catch(err => {
    console.error('[callPush] failed:', err?.message || 'unknown error');
  });
}

/*â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Misc dashboard / admin helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€*/
function extractDashParams(req, searchFields) {
  let page          = req.query.page     ? +req.query.page     : 1;
  if (page < 1) page = 1; // Ensure page is at least 1
  const limit       = req.query.limit    ? +req.query.limit    : 10;
  const sortBy      = req.query.sortBy   || '_id';
  const sortDir     = req.query.sortDir  ? +req.query.sortDir  : 1;
  const searchQuery = req.query.searchQuery ? req.query.searchQuery.trim() : '';

  const sort = { [sortBy]: sortDir };
  const filter = {};

  // build $or search filter
  if (searchQuery) {
    const or = [];
    searchFields.forEach(field => {
      const obj = {};
      if (field === '_id') {
        if (mongoose.Types.ObjectId.isValid(searchQuery)) {
          obj[field] = new mongoose.Types.ObjectId(searchQuery);
          or.push(obj);
        }
      } else {
        obj[field] =
          ['text', 'description', 'title', 'name', 'firstName', 'lastName', 'email'].includes(field)
            ? { $regex: searchQuery, $options: 'i' }
            : searchQuery;
        or.push(obj);
      }
    });
    if (or.length > 0) {
      filter.$or = or;
    }
  }

  // Add additional filters from query params
  const reserved = ['page', 'limit', 'sortBy', 'sortDir', 'searchQuery', 'token'];
  Object.keys(req.query).forEach(key => {
    if (!reserved.includes(key) && req.query[key] !== '' && req.query[key] !== null && req.query[key] !== 'null' && req.query[key] !== undefined) {
      // Handle date ranges
      if (key === 'fromDate') {
        filter.createdAt = filter.createdAt || {};
        filter.createdAt.$gte = new Date(req.query[key]);
      } else if (key === 'toDate') {
        filter.createdAt = filter.createdAt || {};
        filter.createdAt.$lte = new Date(req.query[key]);
      } else if (key === 'minReports') {
        // This will be handled in the controller if it uses aggregation, 
        // but for simple find() we can't easily do $size in filter without $where or aggregation
      } else {
        // Exact match for other fields (role, enabled, etc.)
        let val = req.query[key];
        if (val === 'true') val = true;
        if (val === 'false') val = false;
        filter[key] = val;
      }
    }
  });

  return {
    filter,
    sort,
    skip   : limit * (page - 1),
    limit,
    page
  };
}

async function report(req, res, entityName, entityId) {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    const doc = await new Report({
      entity            : entityId,
      entityModel       : entityName.charAt(0).toUpperCase() + entityName.slice(1),
      reporter          : req.auth ? req.auth._id : req.user?._id,
      message           : req.body.message,
      reportType        : req.body.reportType || 'Other',
      severity          : req.body.severity || 'medium',
      reporterIp        : ip,
      reporterUserAgent : userAgent,
      consentGiven      : req.body.consentGiven === true,
      isAnonymous       : req.body.isAnonymous === true,
      evidence          : req.body.evidence || [],
      photoUrl          : req.body.photoUrl || null,
    }).save();

    // Record audit log for the report
    try {
      await recordAudit({
        actorId: req.auth ? req.auth._id : req.user?._id,
        action: 'report.created',
        details: { 
          entityName, 
          entityId, 
          reportId: doc._id,
          reportType: req.body.reportType,
          severity: req.body.severity
        },
        ip,
        userAgent
      });
    } catch (auditErr) {
      console.error('Audit log failed for report:', auditErr);
    }

    return doc;
  } catch (err) {
    console.error('Error saving report:', err);
    if (!res.headersSent) {
      Response.sendError(res, 400, 'Failed to save report');
    }
    return null;
  }
}

const adminCheck = (req) => {
  // Whenever withAuthUser has loaded the actor, that live database state
  // is authoritative. JWT role claims are only a compatibility fallback
  // for routes that have not loaded the actor.
  const actor =
    req.authUser ||
    req.auth;

  if (
    !actor ||
    actor.enabled === false ||
    actor.isDeleted === true
  ) {
    return false;
  }

  return (
    actor.role === 'ADMIN' ||
    actor.role === 'SUPER ADMIN'
  );
};

/*â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Push / FCM helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€*/
async function sendNotification(userIds, message, senderName, fromUserId, recipientsOverride) {
  // Handle the 5-argument signature used by some controllers:
  // sendNotification(headings, contents, data, buttons, recipients)
  let title, body, data, recipientIds;

  if (typeof userIds === 'object' && userIds.en && typeof message === 'object' && message.en) {
    // 5-argument signature
    title = cleanNotificationText(userIds.en, 'Folcen');
    body  = cleanNotificationText(message.en, 'You have a new notification');
    data  = cleanNotificationData(senderName || {}); // 3rd arg is data
    recipientIds = recipientsOverride || [];
  } else {
    // Original 4-argument signature
    recipientIds = Array.isArray(userIds) ? userIds : [userIds];
    // Normalize senderName: accept { en: '...' } objects (prevents "[object Object]" title)
    title = (senderName && typeof senderName === 'object' && senderName.en)
        ? String(senderName.en)
        : (senderName ? String(senderName) : 'New Message');
    title = cleanNotificationText(title, 'Folcen');
    body  = cleanNotificationText(message, 'You have a new message');

    data = cleanNotificationData({
      type: 'message',
      link: `/messages/chat/${fromUserId}`,
      fromUserId: fromUserId ? String(fromUserId) : ''
    });
  }

  recipientIds = recipientIds
    .filter(id => id && typeof id === 'string' && id.trim())
    .map(id => id.trim());

  if (recipientIds.length === 0) {
    return console.error('âŒ No valid user IDs for notification.');
  }

  if (isBroadActivityPush(data && data.type, data)) {
    return;
  }

  const { sendPushToUser } = require('./services/fcmPushService');

  await Promise.all(
    recipientIds.map(uid =>
      sendPushToUser(uid, { title, body, data }).catch(err =>
        console.error('âŒ FCM push error for', uid, err.message)
      )
    )
  );
}

/*â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Module exports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€*/
module.exports = {
  /* constants */
  normalizeId,
  normalizeLeanDoc,            // ðŸ‘ˆ NEW - prevents buffer serialization in lean queries
  manAvatarPath,
  womenAvatarPath,
  othersAvatarPath,
  ERROR_CODES,

  /* Socket bootstrap + helpers */
  initSocket,                  // ðŸ‘ˆ NEW
  notifyPeerNeeded,
  buildCallInvitePayload,
  connectedUsersMap,
  userSocketIds,               // ðŸ‘ˆ now exported too
  isUserConnected,
  setOnlineUsers,
  emitToUser,                  // ðŸ‘ˆ NEW
  replayOfflineEvents,         // ðŸ‘ˆ NEW
  checkRateLimit,              // ðŸ‘ˆ NEW
  emitToUsers,                 // ðŸ‘ˆ NEW
  emitToAll,                   // ðŸ‘ˆ NEW
  emitNewFriendRequest,        // ðŸ‘ˆ NEW
  emitFriendRequestsUpdated,   // ðŸ‘ˆ NEW
  emitFriendRequestAccepted,
  emitFriendRequestDeclined,
  createNotification,
  cleanNotificationText,
  getSafeDisplayName,
  cleanNotificationDoc,
  realtime,

  /* misc utilities */
  canInitiateChat,
  canInitiateChatPreview,
  finalizeChatOpeningReservation,
  releaseChatOpeningReservation,
  releaseChatOpeningPair,
  extractDashParams,
  report,
  adminCheck,
  purgeUser,
  validatePassword,

  /* push */
  sendNotification
};

