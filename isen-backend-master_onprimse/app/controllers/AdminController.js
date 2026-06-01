const AuthEvent = require('../models/AuthEvent');
const User = require('../models/User');
const Message = require('../models/Message');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Announcement = require('../models/Announcement');
const Channel = require('../models/Channel');
const Subscription = require('../models/Subscription');
const Response = require('./Response');
const { emitToUsers, emitToAll, sendNotification } = require('../helpers');

// Return aggregated counts for auth events and recent entries (privacy-safe)
exports.authEventsOverview = async (req, res) => {
  try {
    // counts by type (limited set)
    const pipeline = [
      { $match: {} },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ];
    const counts = await AuthEvent.aggregate(pipeline).allowDiskUse(true);

    // recent events: avoid exposing IPs or full meta; return type, user (id only), reasonCode, createdAt
    const recent = await AuthEvent.find({}, { ipHash: 0, meta: 0 }).sort({ createdAt: -1 }).limit(50).lean();

    return Response.sendResponse(res, { counts, recent });
  } catch (err) {
    console.error('AdminController.authEventsOverview error', err);
    return Response.sendError(res, 500, 'Failed to load admin overview');
  }
};

// Return paginated recent auth events
exports.authEventsRecent = async (req, res) => {
  try {
    // Support either `page` or `skip` pagination and optional filters from dashboard
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const skip = Number(req.query.skip) || (Math.max(0, Number(req.query.page) || 0) * limit);

    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }
    if (req.query.q) {
      const q = String(req.query.q);
      filter.$or = [
        { reasonCode: { $regex: q, $options: 'i' } },
        { 'user': { $regex: q, $options: 'i' } }
      ];
    }

    const events = await AuthEvent.find(filter, { ipHash: 0, meta: 0 }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    return Response.sendResponse(res, { events, skip, limit });
  } catch (err) {
    console.error('AdminController.authEventsRecent error', err);
    return Response.sendError(res, 500, 'Failed to load auth events');
  }
};

// Send direct message to one or many users
exports.sendAdminMessage = async (req, res) => {
  try {
    const { text } = req.body;
    let { userIds } = req.body;

    console.log('DEBUG AdminController.sendAdminMessage: body', { userIds, text });
    console.log('DEBUG AdminController.sendAdminMessage: auth', req.auth);
    
    // Support single string or array
    if (typeof userIds === 'string') {
      userIds = [userIds];
    }

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      console.warn('AdminController.sendAdminMessage: No users specified. Body:', JSON.stringify(req.body));
      return Response.sendError(res, 400, 'No users specified');
    }
    if (!text) {
      console.warn('AdminController.sendAdminMessage: Message text is required. Body:', JSON.stringify(req.body));
      return Response.sendError(res, 400, 'Message text is required');
    }

    const fromId = req.auth && (req.auth._id || req.auth.id);
    if (!fromId) {
      console.error('AdminController.sendAdminMessage: No sender ID found in token');
      return Response.sendError(res, 401, 'Unauthorized: No sender ID found');
    }

    // Helper to decode base64 if needed
    const decodeId = (id) => {
      if (!id || typeof id !== 'string') return id;
      
      // If it's already a 24-char hex string (standard MongoDB ID), do NOT decode it.
      if (/^[0-9a-fA-F]{24}$/.test(id)) return id;

      // If it looks like base64 (length multiple of 4, contains only valid chars)
      if (id.length >= 16 && /^[A-Za-z0-9+/=]+$/.test(id)) {
        try {
          const decoded = Buffer.from(id, 'base64').toString('utf8');
          // If decoded looks like a hex ObjectId (24 chars) or a valid string, use it
          if (decoded && (decoded.length === 24 || decoded.length > 5)) {
            console.log(`DEBUG AdminController: decoded ID ${id} -> ${decoded}`);
            return decoded;
          }
        } catch (e) {}
      }
      return id;
    };

    const messages = [];
    for (let userId of userIds) {
      try {
        userId = decodeId(userId);
        
        if (!userId || typeof userId !== 'string' || userId.length < 12) {
          console.warn(`Skipping invalid userId: ${userId}`);
          continue;
        }

        const msg = new Message({
          from: fromId,
          to: userId,
          text: text,
          type: 'admin_direct' // Special type for admin messages
        });
        await msg.save();
        messages.push(msg);
        
        // Emit via socket if user is online
        emitToUsers([userId], 'new-message', msg);

        // Push fallback so offline users are notified the same way as normal chat
        try {
          const senderName = req.authUser?.firstName
            ? `${req.authUser.firstName} ${req.authUser.lastName || ''}`.trim()
            : 'System';
          sendNotification(
            [String(userId)],
            String(text).substring(0, 120),
            senderName,
            String(fromId)
          ).catch(() => {});
        } catch (pushErr) {
          console.warn('AdminController.sendAdminMessage push notify failed:', pushErr?.message || pushErr);
        }
      } catch (saveErr) {
        console.error(`Failed to save message for user ${userId}:`, saveErr.message || saveErr);
        if (saveErr.errors) {
          console.error('Validation errors:', JSON.stringify(saveErr.errors));
        }
      }
    }

    if (messages.length === 0 && userIds.length > 0) {
      return Response.sendError(res, 400, 'Failed to send any messages. Check user IDs.');
    }

    return Response.sendResponse(res, { count: messages.length }, 'Messages sent successfully');
  } catch (err) {
    console.error('AdminController.sendAdminMessage error', err);
    return Response.sendError(res, 500, 'Failed to send messages');
  }
};

// Announcements Management
exports.createAnnouncement = async (req, res) => {
  try {
    const { title, content, type, target, expiresAt } = req.body;
    const announcement = new Announcement({
      title,
      content,
      type,
      target,
      expiresAt,
      createdBy: req.auth._id
    });
    await announcement.save();

    // Notify recipients via socket + push fallback (offline users)
    let recipientIds = [];
    if (target === 'all' || !target) {
      const users = await User.find(
        { enabled: true, banned: { $ne: true }, isDeleted: { $ne: true } },
        { _id: 1 }
      ).lean();
      recipientIds = users.map(u => String(u._id));
    } else if (Array.isArray(target?.userIds)) {
      recipientIds = target.userIds.map((id) => String(id)).filter(Boolean);
    }

    if (recipientIds.length > 0) {
      emitToUsers(recipientIds, 'new_announcement', announcement);
      try {
        // Use the 5-argument signature so the push payload includes type/announcementId.
        // The FCM tap handler in the app checks data.type === 'announcement' to show the modal.
        await sendNotification(
          { en: title || content || 'New announcement' },
          { en: content || title || 'You have a new announcement' },
          { type: 'announcement', announcementId: String(announcement._id) },
          null,
          recipientIds
        );
      } catch (pushErr) {
        console.warn('AdminController.createAnnouncement push notify failed:', pushErr?.message || pushErr);
      }
    } else {
      emitToAll('new_announcement', announcement);
    }

    return Response.sendResponse(res, announcement, 'Announcement created');
  } catch (err) {
    console.error('AdminController.createAnnouncement error', err);
    return Response.sendError(res, 500, 'Failed to create announcement');
  }
};

exports.getAnnouncements = async (req, res) => {
  try {
    // Deduplicate by title and content to avoid showing the same announcement multiple times
    const announcements = await Announcement.aggregate([
      { $sort: { createdAt: -1 } },
      { $group: {
          _id: { title: "$title", content: "$content" },
          doc: { $first: "$$ROOT" }
      }},
      { $replaceRoot: { newRoot: "$doc" } },
      { $sort: { createdAt: -1 } }
    ]);
    return Response.sendResponse(res, announcements);
  } catch (err) {
    console.error('AdminController.getAnnouncements error', err);
    return Response.sendError(res, 500, 'Failed to load announcements');
  }
};

exports.deleteAnnouncement = async (req, res) => {
  try {
    await Announcement.findByIdAndDelete(req.params.id);
    return Response.sendResponse(res, null, 'Announcement deleted');
  } catch (err) {
    return Response.sendError(res, 500, 'Failed to delete announcement');
  }
};

// Export Users (CSV/JSON)
exports.exportUsers = async (req, res) => {
  try {
    const format = (req.query.format || 'csv').toLowerCase();

    // JSON format: stream as NDJSON to avoid loading all into memory
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      const cursor = User.find({}).cursor();
      res.write('[');
      let first = true;
      for await (const u of cursor) {
        if (!first) res.write(',');
        first = false;
        res.write(JSON.stringify({ _id: u._id, email: u.email || null, phone: u.phone || null, createdAt: u.createdAt, lastSeen: u.lastSeen || null, status: (u.isDeleted ? 'soft-deleted' : (u.banned ? 'banned' : 'active')), subscription: (u.subscription && u.subscription._id) || null, city: u.city || null, country: u.country || null }));
      }
      res.write(']');
      return res.end();
    }

    // CSV streaming
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users-export.csv"');

    // CSV header
    const fields = ['_id', 'email', 'phone', 'createdAt', 'lastSeen', 'status', 'subscription', 'city', 'country'];
    res.write(fields.join(',') + '\n');

    const cursor = User.find({}).cursor();
    for await (const u of cursor) {
      const row = [
        String(u._id),
        '"' + (u.email || '') + '"',
        '"' + (u.phone || '') + '"',
        u.createdAt ? u.createdAt.toISOString() : '',
        u.lastSeen ? u.lastSeen.toISOString() : '',
        (u.isDeleted ? 'soft-deleted' : (u.banned ? 'banned' : 'active')),
        (u.subscription && u.subscription._id) ? String(u.subscription._id) : '',
        '"' + (u.city || '') + '"',
        '"' + (u.country || '') + '"'
      ];
      res.write(row.join(',') + '\n');
    }
    return res.end();
  } catch (err) {
    console.error('AdminController.exportUsers error', err);
    return Response.sendError(res, 500, 'Failed to export users');
  }
};

// Export Channels (CSV/JSON)
exports.exportChannels = async (req, res) => {
  try {
    const format = (req.query.format || 'csv').toLowerCase();

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      const cursor = Channel.find({}).cursor();
      res.write('[');
      let first = true;
      for await (const c of cursor) {
        if (!first) res.write(',');
        first = false;
        res.write(JSON.stringify({ _id: c._id, name: c.name, country: c.country, city: c.city, approved: c.approved, enabled: c.enabled, createdAt: c.createdAt }));
      }
      res.write(']');
      return res.end();
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="channels-export.csv"');
    const fields = ['_id', 'name', 'country', 'city', 'approved', 'enabled', 'createdAt'];
    res.write(fields.join(',') + '\n');

    const cursor = Channel.find({}).cursor();
    for await (const c of cursor) {
      const row = [
        String(c._id),
        '"' + (c.name || '') + '"',
        '"' + (c.country || '') + '"',
        '"' + (c.city || '') + '"',
        c.approved ? 'true' : 'false',
        c.enabled ? 'true' : 'false',
        c.createdAt ? c.createdAt.toISOString() : ''
      ];
      res.write(row.join(',') + '\n');
    }
    return res.end();
  } catch (err) {
    console.error('AdminController.exportChannels error', err);
    return Response.sendError(res, 500, 'Failed to export channels');
  }
};

// Export Subscriptions (CSV/JSON)
exports.exportSubscriptions = async (req, res) => {
  try {
    const format = (req.query.format || 'csv').toLowerCase();

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      const cursor = Subscription.find({}).cursor();
      res.write('[');
      let first = true;
      for await (const s of cursor) {
        if (!first) res.write(',');
        first = false;
        res.write(JSON.stringify(s));
      }
      res.write(']');
      return res.end();
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="subscriptions-export.csv"');
    const fields = ['_id', 'name', 'dayPrice', 'weekPrice', 'monthPrice', 'yearPrice', 'currency'];
    res.write(fields.join(',') + '\n');

    const cursor = Subscription.find({}).cursor();
    for await (const s of cursor) {
      const row = [
        String(s._id),
        '"' + (s.name || '') + '"',
        s.dayPrice || 0,
        s.weekPrice || 0,
        s.monthPrice || 0,
        s.yearPrice || 0,
        '"' + (s.currency || '') + '"'
      ];
      res.write(row.join(',') + '\n');
    }
    return res.end();
  } catch (err) {
    console.error('AdminController.exportSubscriptions error', err);
    return Response.sendError(res, 500, 'Failed to export subscriptions');
  }
};

// Return list of soft-deleted users and purge status for admin dashboard
exports.deletedUsersStatus = async (req, res) => {
  try {
    const users = await User.find({ isDeleted: true }).select('_id email deletedAt purgeAt').lean();
    return Response.sendResponse(res, users);
  } catch (err) {
    console.error('AdminController.deletedUsersStatus error', err);
    return Response.sendError(res, 500, 'Failed to load deleted users');
  }
};

// Analytics (DAU/WAU/MAU + Charts)
exports.getAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [dau, wau, mau, totalUsers, reportedUsersCount] = await Promise.all([
      User.countDocuments({ lastSeen: { $gte: dayAgo }, isDeleted: false }),
      User.countDocuments({ lastSeen: { $gte: weekAgo }, isDeleted: false }),
      User.countDocuments({ lastSeen: { $gte: monthAgo }, isDeleted: false }),
      User.countDocuments({ isDeleted: false }),
      User.countDocuments({ 'reports.0': { $exists: true }, isDeleted: false })
    ]);

    // Growth Chart (last 7 days)
    const growth = await User.aggregate([
      { $match: { createdAt: { $gte: weekAgo }, isDeleted: false } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // Engagement Chart (last 7 days activity)
    const engagement = await User.aggregate([
      { $match: { lastSeen: { $gte: weekAgo }, isDeleted: false } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$lastSeen" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // Status Chart
    const status = await User.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: "$enabled", count: { $sum: 1 } } }
    ]);

    // Feature Usage (Counts of other entities)
    const [posts, channels, products, jobs, services] = await Promise.all([
      Post.countDocuments({}),
      Channel.countDocuments({}),
      Product.countDocuments({}),
      Job.countDocuments({}),
      Service.countDocuments({})
    ]);

    return Response.sendResponse(res, {
      kpis: { totalUsers, activeUsers: dau, dau, wau, mau, reportedUsersCount },
      charts: {
        growth,
        engagement,
        status,
        features: { posts, channels, products, jobs, services }
      }
    });
  } catch (err) {
    console.error('AdminController.getAnalytics error', err);
    return Response.sendError(res, 500, 'Failed to load analytics');
  }
};

// GET /api/v1/admin/analytics/users/active?from=YYYY-MM-DD&to=YYYY-MM-DD&bucket=day
exports.getActiveUsers = async (req, res) => {
  try {
    const UserActivityDaily = require('../models/UserActivityDaily');
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    const bucket = req.query.bucket || 'day';

    // Normalize dates
    const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));

    // Aggregation: group by day
    const pipeline = [
      { $match: { date: { $gte: start, $lte: end } } },
      { $group: { _id: '$date', dau: { $addToSet: '$userId' } } },
      { $project: { date: '$_id', dauCount: { $size: '$dau' } } },
      { $sort: { date: 1 } }
    ];

    const rows = await UserActivityDaily.aggregate(pipeline).allowDiskUse(true);
    const data = rows.map(r => ({ date: r.date.toISOString().slice(0,10), dau: r.dauCount }));
    return Response.sendResponse(res, data);
  } catch (err) {
    console.error('AdminController.getActiveUsers error', err);
    return Response.sendError(res, 500, 'Failed to load active users analytics');
  }
};

// GET /api/v1/admin/analytics/users/retention?cohort=day&start=YYYY-MM-DD
exports.getRetention = async (req, res) => {
  try {
    const UserActivityDaily = require('../models/UserActivityDaily');
    const cohort = req.query.cohort || 'week';
    const start = req.query.start ? new Date(req.query.start) : new Date();

    // For simplicity compute D1, D7, D30 retention for users active on start date
    const dayStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));

    const usersOnDay = await UserActivityDaily.find({ date: dayStart }).distinct('userId');
    const total = usersOnDay.length;

    const checkDays = [1,7,30];
    const results = {};
    for (const d of checkDays) {
      const checkDate = new Date(dayStart.getTime() + d * 24 * 3600 * 1000);
      const active = await UserActivityDaily.find({ date: checkDate, userId: { $in: usersOnDay } }).distinct('userId');
      results[`D${d}`] = { retained: active.length, rate: total === 0 ? 0 : active.length / total };
    }

    return Response.sendResponse(res, { cohortStart: dayStart.toISOString().slice(0,10), total, retention: results });
  } catch (err) {
    console.error('AdminController.getRetention error', err);
    return Response.sendError(res, 500, 'Failed to compute retention');
  }
};

// Permanent User Deletion
exports.deleteUserPermanent = async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) return Response.sendError(res, 400, 'User ID required');

    const { purgeUser } = require('../helpers');
    await purgeUser(userId);
    try {
      const { recordAudit } = require('../utils/audit');
      await recordAudit({ actorId: req.auth && req.auth._id, actorRole: req.auth && req.auth.role, action: 'ADMIN_PERMANENT_DELETE', targetUserId: userId, details: { reason: req.body && req.body.reason ? req.body.reason : null }, ip: req.ip, userAgent: req.get('User-Agent') });
    } catch (e) { console.warn('Failed to record audit for admin permanent delete', e); }

    return Response.sendResponse(res, null, 'User and all related data permanently deleted');
  } catch (err) {
    console.error('AdminController.deleteUserPermanent error', err);
    return Response.sendError(res, 500, 'Failed to permanently delete user');
  }
};
