/*********************************************************************
 * helpers/index.js  – single source of truth for “generic” helpers
 *********************************************************************/

const Response = require('./controllers/Response');
const Report   = require('./models/Report');
const mongoose = require('mongoose');
const { recordAudit } = require('./utils/audit');
const pushSvc  = require('.././app/utils/pushService');          // OneSignal / FCM wrapper
const socketManager = require('.././app/utils/socketManager');

/*────────────────────────── CONSTANTS ──────────────────────────*/
const manAvatarPath   = '/avatars/male.webp';
const womenAvatarPath = '/avatars/female.webp';
const othersAvatarPath = '/avatars/other.webp';

const ERROR_CODES     = { SUBSCRIPTION_ERROR: 1001 };

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
function emitToUser(userId, event, payload = {}) {
  if (!io) return;
  const sockets = userSocketIds(String(userId));
  sockets.forEach(sid => io.to(sid).emit(event, payload));
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

function emitFriendRequestsUpdated(userAId, userBId) {
  // Client will re-count precisely (API fetch) for both sides
  emitToUsers([userAId, userBId], 'friend-requests-updated', {});
}

function emitFriendRequestAccepted(userAId, userBId) {
  emitToUsers([userAId, userBId], 'friend-request-accepted', {});
}

function emitFriendRequestDeclined(userAId, userBId) {
  emitToUsers([userAId, userBId], 'friend-request-declined', {});
}

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
  const fs = require('fs').promises;
  const path = require('path');

  // 0. Fetch user to get file paths before deletion
  const user = await User.findById(userId).select('mainAvatar avatar').lean();
  if (user) {
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
    Channel.deleteMany({ user: userId })
  ]);

  // 2. Cleanup references in other models (e.g., removing user from follower arrays)
  await Promise.all([
    User.updateMany({}, { $pull: { followers: userId, following: userId, friends: userId, blockedUsers: userId } }),
    Channel.updateMany({}, { $pull: { followers: userId } })
  ]);
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

/*────────────────────── Push / OneSignal helper ───────────────*/
async function sendNotification(userIds, message, senderName, fromUserId, recipientsOverride) {
  // Handle the 5-argument signature used by some controllers:
  // sendNotification(headings, contents, data, buttons, recipients)
  let headings, contents, data, recipientIds;

  if (typeof userIds === 'object' && userIds.en && typeof message === 'object' && message.en) {
    // 5-argument signature
    headings = userIds;
    contents = message;
    data = senderName || {}; // 3rd arg is data
    recipientIds = recipientsOverride || [];
  } else {
    // Original 4-argument signature
    recipientIds = Array.isArray(userIds) ? userIds : [userIds];
    headings = { en: String(senderName) || 'New Message' };
    contents = { en: String(message)    || 'You have a new message' };
    
    const chatId = [fromUserId, recipientIds[0]].sort().join('-');
    data = { type: 'message', link: `/messages/chat/${chatId}` };
  }

  recipientIds = recipientIds
    .filter(id => id && typeof id === 'string' && id.trim())
    .map(id => id.trim());

  if (recipientIds.length === 0) {
    return console.error('❌ No valid user IDs for notification.');
  }

  const payload = {
    app_id  : '3b993591-823b-4f45-94b0-c2d0f7d0f6d8',
    headings: headings,
    contents: contents,
    include_external_user_ids: recipientIds,
    data    : data
  };

  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method : 'POST',
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': 'Basic os_v2_app_homtlemchnhulffqylippuhw3auw4vp7fmtu4xfrujbvrgzb536ngtne6z7hsyjy6r7yjvqpvx26bmpi42pvgguhvzdycwvca6ik3bi'
      },
      body: JSON.stringify(payload)
    });
    console.log('✅ Notification response:', await res.json());
  } catch (err) {
    console.error('❌ Error sending notification:', err);
  }
}

/*──────────────────────── Module exports ───────────────────────*/
module.exports = {
  /* constants */
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
  emitToUsers,                 // 👈 NEW
  emitToAll,                   // 👈 NEW
  emitNewFriendRequest,        // 👈 NEW
  emitFriendRequestsUpdated,   // 👈 NEW
  emitFriendRequestAccepted,
  emitFriendRequestDeclined,

  /* misc utilities */
  extractDashParams,
  report,
  adminCheck,
  purgeUser,
  validatePassword,

  /* push */
  sendNotification
};
