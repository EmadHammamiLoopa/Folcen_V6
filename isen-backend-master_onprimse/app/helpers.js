/*********************************************************************
 * helpers/index.js  – single source of truth for “generic” helpers
 *********************************************************************/

const Response = require('./controllers/Response');
const Report   = require('./models/Report');
const mongoose = require('mongoose');
const { recordAudit } = require('./utils/audit');
const pushSvc  = require('.././app/utils/pushService');          // FCM push shim (via app/utils/pushService → services/fcmPushService)
const socketManager = require('.././app/utils/socketManager');

/*────────────────────────── CONSTANTS ──────────────────────────*/
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

/*───────────────────── Socket-IO bootstrap & helpers ───────────*/

// Live Socket.IO reference (initialized in server bootstrap via initSocket)
let io = null;

/** Initialize this helper module with a live io instance (call once in index.js) */
function initSocket(ioRef) {
  io = ioRef;
}

/** Build <userId → Set<socketId>> map from live Socket.IO server */
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
  if (!io) return;

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
  } else if (options.persistIfOffline) {
    // Guaranteed Delivery: Save to Outbox if user is offline (Task 1)
    try {
      const EventOutbox = require('./models/EventOutbox');
      await EventOutbox.create({
        userId: String(userId),
        event,
        payload
      });
      console.log(`[STASHED] User ${userId} offline. Event ${event} saved to Outbox.`);
    } catch (err) {
      console.error('Failed to stash offline event:', err.message);
    }
  }
}

/** Replay events stashed while the user was offline */
async function replayOfflineEvents(userId, socket) {
  try {
    const EventOutbox = require('./models/EventOutbox');
    const events = await EventOutbox.find({ userId: String(userId) }).sort({ createdAt: 1 });
    if (events.length > 0) {
      console.log(`[REPLAY] Replaying ${events.length} events for user ${userId} on socket ${socket.id}`);
      for (const evt of events) {
        socket.emit(evt.event, evt.payload);
      }
      // Clear outbox after successful replay
      await EventOutbox.deleteMany({ userId: String(userId) });
    }
  } catch (err) {
    console.warn(`[REPLAY] Replay failed for user ${userId}:`, err.message);
  }
}

/**
 * Shared policy for chat initiation permissions (Task 1: Single Source of Truth).
 * Enforces "Max 3 unique non-friend recipients per 24 hours" unless subscribed or friends.
 * Handles Block, Privacy (Follow fallback), and Thread Unlock.
 */
async function canInitiateChat(senderId, receiverId) {
  const User = require('./models/User');
  const Message = require('./models/Message');
  const Follow = require('./models/Follow');
  const { userSubscribed } = require('./middlewares/subscription');

  // Fetch users with minimal projection to avoid overhead
  const [sender, receiver] = await Promise.all([
    User.findById(senderId).select('friends blockedUsers subscription'),
    User.findById(receiverId).select('friends blockedUsers isPrivate')
  ]);

  if (!sender || !receiver) return { allowed: false, reason: 'user_not_found' };

  // 1. Block Check (Highest Priority)
  const isBlockedByReceiver = receiver.blockedUsers && receiver.blockedUsers.some(id => id.toString() === String(senderId));
  const isBlockedBySender = sender.blockedUsers && sender.blockedUsers.some(id => id.toString() === String(receiverId));
  if (isBlockedByReceiver || isBlockedBySender) return { allowed: false, reason: 'blocked' };

  // 2. Friendship / Unlock Bypass
  const isFriend = (sender.friends || []).map(String).includes(String(receiverId));
  if (isFriend) return { allowed: true, budgetRemaining: Infinity };

  // If receiver has ever replied, the conversation is "unlocked"
  const hasReplied = await Message.exists({ from: receiverId, to: senderId });
  if (hasReplied) return { allowed: true, budgetRemaining: Infinity };

  // 3. Privacy Check (Follow Fallback)
  if (receiver.isPrivate) {
    const follow = await Follow.findOne({ follower: senderId, followed: receiverId, status: 'active' });
    if (!follow) return { allowed: false, reason: 'privacy_restricted' };
  }

  // 4. Recipient Budget Check (Max 3 unique non-friends / 24h)
  if (await userSubscribed(sender)) return { allowed: true, budgetRemaining: Infinity };

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  // Get unique recipients messaged in last 24h who are NOT friends
  const recentRecipients = await Message.find({
    from: senderId,
    createdAt: { $gte: yesterday },
    to: { $nin: (sender.friends || []) }
  }).distinct('to');

  const distinctCount = recentRecipients.length;
  const alreadyMessagedThisTarget = recentRecipients.some(id => String(id) === String(receiverId));

  if (!alreadyMessagedThisTarget && distinctCount >= 3) {
    return { allowed: false, reason: 'budget_exhausted', budgetRemaining: 0 };
  }

  // Calculate remaining budget (for UI indicator)
  const budget = alreadyMessagedThisTarget ? Infinity : Math.max(0, 3 - distinctCount);
  return { allowed: true, budgetRemaining: budget };
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
    console.error(`Error computing stats for ${userId}:`, e.message);
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
async function createNotification({ recipientId, senderId, type, title, body, data = {} }) {
  try {
    const Notification = require('./models/Notification');
    const notification = await Notification.create({
      recipient: recipientId,
      sender: senderId,
      type,
      title,
      body,
      data
    });

    // Notify user via socket immediately if online (NotificationService listens)
    emitToUser(recipientId, 'notification-received', notification);

    // Trigger push — use 5-arg path when data.link is set so the FCM deep-link
    // points to the actual content (post/comment) not a chat thread.
    if (data && data.link) {
      sendNotification(
        { en: title },
        { en: body },
        { type: type || 'message', link: data.link },
        [],
        [String(recipientId)]
      ).catch(() => {});
    } else {
      sendNotification([recipientId], body, title, senderId).catch(() => {});
    }

    return notification;
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
}

/*───────────────────── REAL-TIME SIGNALING HELPERS ───────────*/

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
            online: user.online
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
  // new GDPR models — safe to skip if not yet migrated
  let UserInterestProfile, UserConsent, AnalyticsEvent;
  try { UserInterestProfile = require('./models/UserInterestProfile'); } catch (e) {}
  try { UserConsent = require('./models/UserConsent'); } catch (e) {}
  try { AnalyticsEvent = require('./models/AnalyticsEvent'); } catch (e) {}
  const fs = require('fs').promises;
  const path = require('path');

  // 0. Fetch user to get file paths and firebaseUid before deletion
  const user = await User.findById(userId).select('mainAvatar avatar firebaseUid email').lean();
    // 0. Fetch user to get file paths and firebaseUid before deletion
    const filesToDelete = [];
    if (user.mainAvatar && user.mainAvatar.startsWith('/uploads/')) {
      filesToDelete.push(path.join(__dirname, '..', 'public', user.mainAvatar));
    }
    if (Array.isArray(user.avatar)) {
      user.avatar.forEach(av => {
        if (av && av.startsWith('/uploads/')) {
          filesToDelete.push(path.join(__dirname, '..', 'public', av));
        }
      });
    }

    // Delete files from disk
    for (const filePath of filesToDelete) {
      try {
        await fs.unlink(filePath);
        console.log(`[GDPR Purge] Deleted file: ${filePath}`);
      } catch (e) {
        // Ignore if file doesn't exist
        if (e.code !== 'ENOENT') console.warn(`[GDPR Purge] Failed to delete file: ${filePath}`, e.message);
      }
    }
  }

  // 0.1 Fetch posts to delete media files
  const userPosts = await Post.find({ user: userId }).select('media.url').lean();
  for (const p of userPosts) {
    if (p.media && p.media.url && p.media.url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '..', 'public', p.media.url);
      try {
        await fs.unlink(filePath);
        console.log(`[GDPR Purge] Deleted post media: ${filePath}`);
      } catch (e) {
        if (e.code !== 'ENOENT') console.warn(`[GDPR Purge] Failed to delete post media: ${filePath}`, e.message);
      }
    }
  }

  // 0.2 Fetch comments to delete media files
  const userComments = await Comment.find({ user: userId }).select('media.url').lean();
  for (const c of userComments) {
    if (c.media && c.media.url && c.media.url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, '..', 'public', c.media.url);
      try {
        await fs.unlink(filePath);
        console.log(`[GDPR Purge] Deleted comment media: ${filePath}`);
      } catch (e) {
        if (e.code !== 'ENOENT') console.warn(`[GDPR Purge] Failed to delete comment media: ${filePath}`, e.message);
      }
    }
  }

  // 1. Find all channels owned by the user to delete them
  const userChannels = await Channel.find({ user: userId }).select('_id');
  const channelIds = userChannels.map(c => c._id);

  await Promise.all([
    // Delete the user
    User.deleteOne({ _id: userId }),
    
    // Delete all social content
    Post.deleteMany({ user: userId }),
    Comment.deleteMany({ user: userId }),
    
    // Delete all marketplace content
    Product.deleteMany({ user: userId }),
    Job.deleteMany({ user: userId }),
    Service.deleteMany({ user: userId }),
    
    // Delete all communication
    Message.deleteMany({ $or: [{ from: userId }, { to: userId }] }),
    Request.deleteMany({ $or: [{ from: userId }, { to: userId }] }),
    
    // Delete all social connections
    Follow.deleteMany({ $or: [{ follower: userId }, { followed: userId }] }),
    
    // Delete all legal/activity traces
    LegalAcceptance.deleteMany({ userId: userId }),
    Activity.deleteMany({ actor: userId }),
    
    // Delete all reports (where user is reporter or the reported entity)
    Report.deleteMany({ $or: [{ reporter: userId }, { entity: userId, entityModel: 'User' }] }),

    // Delete channels owned by the user
    Channel.deleteMany({ user: userId }),

    // GDPR: push tokens, notifications, daily activity, interest profile, consents, analytics events
    PushToken.deleteMany({ userId }),
    Notification.deleteMany({ $or: [{ recipient: userId }, { sender: userId }] }),
    UserActivityDaily.deleteMany({ userId }),
    ...(UserInterestProfile ? [UserInterestProfile.deleteOne({ userId })] : []),
    ...(UserConsent ? [UserConsent.deleteOne({ userId })] : []),
    ...(AnalyticsEvent ? [AnalyticsEvent.deleteMany({ userId })] : []),
  ]);

  // 2. Cleanup references in other models (e.g., removing user from follower arrays)
  await Promise.all([
    User.updateMany({}, { $pull: { followers: userId, following: userId, friends: userId, blockedUsers: userId } }),
    Channel.updateMany({}, { $pull: { followers: userId } })
  ]);

  // 3. Hard-delete from Firebase Auth (non-fatal if missing)
  if (user && (user.firebaseUid || user.email)) {
    try {
      const { admin: firebaseAdmin } = require('./services/firebaseAdmin');
      if (firebaseAdmin && firebaseAdmin.apps && firebaseAdmin.apps.length && firebaseAdmin.auth) {
        let firebaseUid = user.firebaseUid || null;

        if (!firebaseUid && user.email) {
          try {
            const firebaseRecord = await firebaseAdmin.auth().getUserByEmail(String(user.email).trim().toLowerCase());
            firebaseUid = firebaseRecord.uid;
          } catch (lookupErr) {
            if (lookupErr.code !== 'auth/user-not-found') {
              console.warn('[GDPR Purge] Firebase lookup by email failed (non-fatal):', lookupErr.message);
            }
          }
        }

        if (firebaseUid) {
          try {
            await firebaseAdmin.auth().deleteUser(firebaseUid);
            console.log(`[GDPR Purge] Deleted Firebase Auth user: ${firebaseUid}`);
          } catch (deleteErr) {
            if (deleteErr.code === 'auth/user-not-found') {
              console.warn('[GDPR Purge] Firebase user already absent during delete');
            } else {
              throw deleteErr;
            }
          }
        }
      }
    } catch (fbErr) {
      // User may already be deleted from Firebase; non-fatal
      console.warn('[GDPR Purge] Firebase Auth delete failed (non-fatal):', fbErr.message);
    }
  }
}

/** Wake the callee: emit on socket if online, else push */
function notifyPeerNeeded(calleeId) {
  if (!io) return console.warn('notifyPeerNeeded called before helpers.initSocket(io)');
  if (io.sockets?.adapter?.rooms?.has(calleeId)) {
    io.to(calleeId).emit('incoming-call');
  } else {
    pushSvc.sendPush(calleeId, { title: 'Incoming call', body: 'Tap to answer' });
  }
}

/*──────────────────── Misc dashboard / admin helpers ───────────*/
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
      retentionDate     : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // Default 1 year retention
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
  const role = (req.auth && req.auth.role) || (req.authUser && req.authUser.role);
  return role === 'ADMIN' || role === 'SUPER ADMIN';
};

/*────────────────────── Push / FCM helper ─────────────────────*/
async function sendNotification(userIds, message, senderName, fromUserId, recipientsOverride) {
  // Handle the 5-argument signature used by some controllers:
  // sendNotification(headings, contents, data, buttons, recipients)
  let title, body, data, recipientIds;

  if (typeof userIds === 'object' && userIds.en && typeof message === 'object' && message.en) {
    // 5-argument signature
    title = userIds.en;
    body  = message.en;
    data  = senderName || {}; // 3rd arg is data
    recipientIds = recipientsOverride || [];
  } else {
    // Original 4-argument signature
    recipientIds = Array.isArray(userIds) ? userIds : [userIds];
    // Normalize senderName: accept { en: '...' } objects (prevents "[object Object]" title)
    title = (senderName && typeof senderName === 'object' && senderName.en)
        ? String(senderName.en)
        : (senderName ? String(senderName) : 'New Message');
    body  = String(message)    || 'You have a new message';

    const chatId = [fromUserId, recipientIds[0]].sort().join('-');
    data = { type: 'message', link: `/messages/chat/${chatId}` };
  }

  recipientIds = recipientIds
    .filter(id => id && typeof id === 'string' && id.trim())
    .map(id => id.trim());

  if (recipientIds.length === 0) {
    return console.error('❌ No valid user IDs for notification.');
  }

  const { sendPushToUser } = require('./services/fcmPushService');

  await Promise.all(
    recipientIds.map(uid =>
      sendPushToUser(uid, { title, body, data }).catch(err =>
        console.error('❌ FCM push error for', uid, err.message)
      )
    )
  );
}

/*──────────────────────── Module exports ───────────────────────*/
module.exports = {
  /* constants */
  normalizeId,
  normalizeLeanDoc,            // 👈 NEW - prevents buffer serialization in lean queries
  manAvatarPath,
  womenAvatarPath,
  othersAvatarPath,
  ERROR_CODES,

  /* Socket bootstrap + helpers */
  initSocket,                  // 👈 NEW
  notifyPeerNeeded,
  connectedUsersMap,
  userSocketIds,               // 👈 now exported too
  isUserConnected,
  setOnlineUsers,
  emitToUser,                  // 👈 NEW
  replayOfflineEvents,         // 👈 NEW
  checkRateLimit,              // 👈 NEW
  emitToUsers,                 // 👈 NEW
  emitToAll,                   // 👈 NEW
  emitNewFriendRequest,        // 👈 NEW
  emitFriendRequestsUpdated,   // 👈 NEW
  emitFriendRequestAccepted,
  emitFriendRequestDeclined,
  createNotification,
  realtime,

  /* misc utilities */
  canInitiateChat,
  extractDashParams,
  report,
  adminCheck,
  purgeUser,
  validatePassword,

  /* push */
  sendNotification
};
