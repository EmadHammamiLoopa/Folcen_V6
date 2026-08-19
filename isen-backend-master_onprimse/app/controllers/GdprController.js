const Response = require('./Response');
const { recordAudit } = require('../utils/audit');
const tokenBlacklist = require('../utils/tokenBlacklist');
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Message = require('../models/Message');
const { connectedUsers, socketUserMap } = require('../utils/socketManager');
const { purgeUser, userSocketIds } = require('../helpers');

// Allowed fields for rectification (minimization principle)
const ALLOWED_RECTIFY_FIELDS = ['firstName','lastName','email','gender','birthDate','aboutMe','school','education','profession','interests'];

// Helper: sanitize user public info using existing publicInfo method if available
function sanitizeUserForDsar(user){
  if (!user) return null;
  try { return user.publicInfo ? user.publicInfo(true) : { id: user._id }; } catch (e) { return { id: user._id }; }
}

exports.access = async (req, res) => {
  try {
    const actor = req.authUser;
    let target = actor;
    // Allow admins with explicit role to fetch other users via query param
    if (req.query && req.query.userId) {
      // require server-side RBAC check: only allowed if caller has privacy/admin role (handled at route level)
      target = await User.findById(req.query.userId);
      if (!target) return Response.sendResponse(res, {}, 'Request processed'); // generic response to avoid enumeration
    }

    const sanitized = sanitizeUserForDsar(target);
    // Include acceptance history
    try {
      const { getAcceptancesForUser } = require('../utils/legalAccept');
      const acceptances = await getAcceptancesForUser(target._id, { page: 1, limit: 1000 });
      sanitized.legalAcceptances = acceptances.map(a => {
        let rawDate = a.acceptedAt || a.createdAt || a.updatedAt;
        if (!rawDate && a._id) {
          try {
            const idStr = a._id.toString();
            if (idStr.length === 24) {
              rawDate = new Date(parseInt(idStr.substring(0, 8), 16) * 1000);
            }
          } catch (e) {}
        }
        
        const acceptedAt = (rawDate instanceof Date ? rawDate : new Date(rawDate || Date.now())).toISOString();
        const meta = a.meta || {};
        return { 
          _id: a._id,
          documentType: a.documentType, 
          documentVersion: a.documentVersion, 
          acceptedAt: acceptedAt, 
          acceptanceContext: a.acceptanceContext || 'unknown',
          meta: {
            ip: meta.ip || 'Legacy Record',
            userAgent: meta.userAgent || 'Legacy Record',
            clientType: meta.clientType || 'mobile_app'
          }
        };
      });
    } catch (e) { console.warn('Failed to include acceptance history in DSAR access', e && e.message); }

    await recordAudit({ actorId: actor._id, actorRole: actor.role, action: 'ACCESS', targetUserId: target._id, details: { reason: 'GDPR Data Access Request', fields: Object.keys(sanitized) }, ip: req.ip, userAgent: req.get('User-Agent') });
    return Response.sendResponse(res, { user: sanitized });
  } catch (e) {
    console.error('GDPR access error', e);
    return Response.sendError(res, 500, 'Server error');
  }
};

exports.portability = async (req, res) => {
  try {
    const actor = req.authUser;
    let target = actor;
    if (req.query && req.query.userId) {
      target = await User.findById(req.query.userId);
      if (!target) return Response.sendResponse(res, {}, 'Request processed');
    }

    // Paginate related data
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(100, parseInt(req.query.limit || '50'));
    const skip = (page - 1) * limit;

    const userId = target._id;
    const posts = await Post.find({ user: userId }).skip(skip).limit(limit).lean();
    const comments = await Comment.find({ user: userId }).skip(skip).limit(limit).lean();
    const messages = await Message.find({ $or: [{ from: userId }, { to: userId }] }).skip(skip).limit(limit).lean();
    
    // Include follow relationships
    const Follow = require('../models/Follow');
    const followers = await Follow.find({ followed: userId }).skip(skip).limit(limit).lean();
    const following = await Follow.find({ follower: userId }).skip(skip).limit(limit).lean();

      // Include non-content event metadata: call events and message events
      const CallEvent = require('../models/CallEvent');
      const MessageEvent = require('../models/MessageEvent');
      const callEvents = await CallEvent.find({ $or: [ { initiatedBy: userId }, { participants: userId } ] }).skip(skip).limit(limit).lean();
      const messageEvents = await MessageEvent.find({ $or: [ { from: userId }, { to: userId } ] }).skip(skip).limit(limit).lean();

      // Include activities, reports, products, jobs, services, and channels
      const Activity = require('../models/Activity');
      const Report = require('../models/Report');
      const Product = require('../models/Product');
      const Job = require('../models/Job');
      const Service = require('../models/Service');
      const Channel = require('../models/Channel');
      
      const activities = await Activity.find({ actor: userId }).skip(skip).limit(limit).lean();
      const reports = await Report.find({ reporter: userId }).skip(skip).limit(limit).lean();
      const products = await Product.find({ user: userId }).skip(skip).limit(limit).lean();
      const jobs = await Job.find({ user: userId }).skip(skip).limit(limit).lean();
      const services = await Service.find({ user: userId }).skip(skip).limit(limit).lean();
      const channels = await Channel.find({ user: userId }).skip(skip).limit(limit).lean();

      // GDPR: notifications, consent record, and analytics event summary (no raw events)
      const Notification = require('../models/Notification');
      const notifications = await Notification.find({ recipient: userId }).select('type message createdAt').skip(skip).limit(limit).lean();

      let consentRecord = null;
      try {
        const UserConsent = require('../models/UserConsent');
        consentRecord = await UserConsent.findOne({ userId }).select('-_id analytics_optin personalization createdAt updatedAt history').lean();
      } catch (e) {}

      let analyticsEventSummary = null;
      try {
        const AnalyticsEvent = require('../models/AnalyticsEvent');
        const evtAgg = await AnalyticsEvent.aggregate([
          { $match: { userId } },
          { $group: { _id: '$eventType', count: { $sum: 1 } } }
        ]);
        analyticsEventSummary = { note: 'Aggregate counts only; raw events are pseudonymous and auto-purged after ' + (process.env.ANALYTICS_EVENT_RETENTION_DAYS || 30) + ' days.', counts: Object.fromEntries(evtAgg.map(e => [e._id, e.count])) };
      } catch (e) {}

    const exportObj = {
      user: sanitizeUserForDsar(target),
      posts,
      comments,
      messages,
      followers,
      following,
      callEvents,
      messageEvents,
      activities,
      reports,
      products,
      jobs,
      services,
      channels,
      notifications,
      consentRecord,
      analyticsEventSummary,
      page,
      limit
    };

    // Include legal acceptance history in portability export
    try {
      const { getAcceptancesForUser } = require('../utils/legalAccept');
      const acceptances = await getAcceptancesForUser(target._id, { page: 1, limit: 1000 });
      exportObj.legalAcceptances = acceptances.map(a => {
        let acceptedAt = a.acceptedAt || a.createdAt;
        if (!acceptedAt && a._id) {
          try {
            if (typeof a._id.getTimestamp === 'function') {
              acceptedAt = a._id.getTimestamp();
            } else if (typeof a._id === 'string' && a._id.length === 24) {
              acceptedAt = new Date(parseInt(a._id.substring(0, 8), 16) * 1000);
            }
          } catch (e) {}
        }
        const meta = a.meta || {};
        return { 
          documentType: a.documentType, 
          documentVersion: a.documentVersion, 
          acceptedAt: acceptedAt || new Date(), 
          acceptanceContext: a.acceptanceContext || 'unknown',
          meta: {
            ip: meta.ip || 'Legacy Record',
            userAgent: meta.userAgent || 'Legacy Record',
            clientType: meta.clientType || 'mobile_app'
          }
        };
      });
    } catch (e) {
      console.warn('Failed to include legal acceptances in portability export', e && e.message);
    }

    await recordAudit({ actorId: actor._id, actorRole: actor.role, action: 'EXPORT', targetUserId: target._id, details: { reason: 'GDPR Data Portability Export', counts: { posts: posts.length, comments: comments.length, messages: messages.length, notifications: notifications.length } }, ip: req.ip, userAgent: req.get('User-Agent') });
    return Response.sendResponse(res, exportObj);
  } catch (e) {
    console.error('GDPR portability error', e);
    return Response.sendError(res, 500, 'Server error');
  }
};

exports.rectify = async (req, res) => {
  try {
    const actor = req.authUser;
    let target = actor;
    if (req.body && req.body.userId) {
      // server-side RBAC required for other-user modifications
      target = await User.findById(req.body.userId);
      if (!target) return Response.sendResponse(res, {}, 'Request processed');
    }

    const updates = {};
    for (const k of Object.keys(req.body || {})) {
      if (ALLOWED_RECTIFY_FIELDS.includes(k)) updates[k] = req.body[k];
    }
    if (Object.keys(updates).length === 0) return Response.sendError(res, 400, 'Invalid input');

    // Apply updates and save
    Object.assign(target, updates);
    await target.save();

    await recordAudit({ actorId: actor._id, actorRole: actor.role, action: 'DSAR_RECTIFY', targetUserId: target._id, details: { updates }, ip: req.ip, userAgent: req.get('User-Agent') });
    return Response.sendResponse(res, { user: sanitizeUserForDsar(target) }, 'User updated');
  } catch (e) {
    console.error('GDPR rectify error', e);
    return Response.sendError(res, 500, 'Server error');
  }
};

// Soft delete (erase) with immediate revocation and scheduled purge
exports.erase = async (req, res) => {
  try {
    const io = req.app && typeof req.app.get === 'function'
      ? req.app.get('io')
      : null;
    const actor = req.authUser;
    let target = actor;
    const isAdmin = actor.role === 'ADMIN' || actor.role === 'SUPER ADMIN';

    if (req.body && req.body.userId) {
      // Only admins can erase other users
      if (!isAdmin) return Response.sendError(res, 403, 'Access forbidden');
      target = await User.findById(req.body.userId);
      if (!target) return Response.sendResponse(res, {}, 'Request processed');
    }

    const now = new Date();
    const reason = req.body.reason || 'No reason provided';

    if (isAdmin && String(actor._id) !== String(target._id)) {
      // Hard Delete for Admin-initiated erasure of others
      console.log(`[GDPR Hard Erase] Admin ${actor._id} is purging user ${target._id}. Reason: ${reason}`);
      
      await recordAudit({ 
        actorId: actor._id, 
        actorRole: actor.role, 
        action: 'ERASURE_HARD', 
        targetUserId: target._id, 
        details: { reason, method: 'ADMIN_PURGE' }, 
        ip: req.ip, 
        userAgent: req.get('User-Agent') 
      });

      // Perform physical purge
      await purgeUser(target._id);

      // Disconnect sockets
      try {
        const sockets = userSocketIds(target._id);
        if (sockets && io && io.sockets) {
          for (const sid of sockets) {
            try { 
              const s = io.sockets.sockets.get(sid); 
              if (s) {
                s.emit('force-logout', { reason: 'Account permanently erased per GDPR request' });
                s.disconnect(true); 
              }
            } catch (e) {}
          }
        }
      } catch (e) { console.warn('Failed to disconnect sockets on hard erase', e); }

      return Response.sendResponse(res, { deletedAt: now, purged: true }, 'Account permanently erased and data purged');
    } else {
      // Soft Delete for self-erasure or if we want to keep grace period
      const days = parseInt(process.env.DATA_RETENTION_DAYS || '30');
      
      target.isDeleted = true;
      target.deletedAt = now;
      target.deletedBy = actor._id;
      target.purgeAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

      await target.save();

      // Immediate revocation
      await tokenBlacklist.revokeUser(String(target._id));

      // Disconnect sockets
      try {
        const sockets = userSocketIds(target._id);
        if (sockets && io && io.sockets) {
          for (const sid of sockets) {
            try { const s = io.sockets.sockets.get(sid); if (s) s.disconnect(true); } catch (e) {}
          }
        }
      } catch (e) { console.warn('Failed to disconnect sockets on soft erase', e); }

      await recordAudit({ 
        actorId: actor._id, 
        actorRole: actor.role, 
        action: 'ERASURE_SOFT', 
        targetUserId: target._id, 
        details: { reason, retentionDays: days }, 
        ip: req.ip, 
        userAgent: req.get('User-Agent') 
      });

      return Response.sendResponse(res, { deletedAt: now, purgeAt: target.purgeAt }, 'Account scheduled for deletion');
    }
  } catch (e) {
    console.error('GDPR erase error', e);
    return Response.sendError(res, 500, 'Server error');
  }
};

exports.consentHistory = async (req, res) => {
  try {
    const actor = req.authUser;
    let target = actor;
    if (req.query && req.query.userId) {
      target = await User.findById(req.query.userId);
      if (!target) return Response.sendResponse(res, {}, 'Request processed');
    }

    const { getAcceptancesForUser } = require('../utils/legalAccept');
    const acceptances = await getAcceptancesForUser(target._id, { page: 1, limit: 1000 });
    const history = acceptances.map(a => ({ 
      documentType: a.documentType, 
      version: a.documentVersion, 
      ts: a.acceptedAt || a.createdAt, 
      context: a.acceptanceContext,
      meta: a.meta || {}
    }));

    await recordAudit({ actorId: actor._id, actorRole: actor.role, action: 'DSAR_CONSENT_HISTORY', targetUserId: target._id, details: { count: history.length }, ip: req.ip, userAgent: req.get('User-Agent') });
    return Response.sendResponse(res, { consents: history });
  } catch (e) {
    console.error('GDPR consentHistory error', e);
    return Response.sendError(res, 500, 'Server error');
  }
};

exports.auditLogs = async (req, res) => {
  try {
    const actor = req.authUser;
    const isAdmin = actor.role === 'ADMIN' || actor.role === 'SUPER ADMIN';
    if (!isAdmin) return Response.sendError(res, 403, 'Access forbidden');

    const qUserId = req.query.userId || null;
    const qAction = req.query.action || null;

    const AuditLog = require('../models/AuditLog');
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(200, parseInt(req.query.limit || '50'));
    const skip = (page - 1) * limit;

    const filter = {};
    if (qUserId) filter.targetUserId = qUserId;
    if (qAction) filter.action = { $regex: qAction, $options: 'i' };

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .populate('actorId', 'firstName lastName email role')
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    return Response.sendResponse(res, {
      docs: logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (e) {
    console.error('GDPR auditLogs error', e);
    return Response.sendError(res, 500, 'Server error');
  }
};

// ─────────────────── Dry-run erasure preview ───────────────────
exports.erasePreview = async (req, res) => {
  try {
    const actor = req.authUser;
    const isAdmin = actor.role === 'ADMIN' || actor.role === 'SUPER ADMIN';
    if (!isAdmin) return Response.sendError(res, 403, 'Access forbidden');

    const targetId = req.query.userId || req.body.userId;
    if (!targetId) return Response.sendError(res, 400, 'userId required');

    const target = await User.findById(targetId).select('_id firstName lastName email').lean();
    if (!target) return Response.sendResponse(res, {}, 'User not found');

    const userId = target._id;

    const [
      posts, comments, messages, notifications, activities,
      pushTokens, follows, dailyActivity, analyticsEvents
    ] = await Promise.all([
      require('../models/Post').countDocuments({ user: userId }),
      require('../models/Comment').countDocuments({ user: userId }),
      require('../models/Message').countDocuments({ $or: [{ from: userId }, { to: userId }] }),
      require('../models/Notification').countDocuments({ $or: [{ recipient: userId }, { sender: userId }] }),
      require('../models/Activity').countDocuments({ actor: userId }),
      require('../models/PushToken').countDocuments({ userId }),
      require('../models/Follow').countDocuments({ $or: [{ follower: userId }, { followed: userId }] }),
      require('../models/UserActivityDaily').countDocuments({ userId }),
      (async () => { try { return await require('../models/AnalyticsEvent').countDocuments({ userId }); } catch (e) { return 0; } })(),
    ]);

    let interestProfile = false;
    let consents = false;
    try { interestProfile = !!(await require('../models/UserInterestProfile').findOne({ userId }).select('_id').lean()); } catch (e) {}
    try { consents = !!(await require('../models/UserConsent').findOne({ userId }).select('_id').lean()); } catch (e) {}

    await recordAudit({ actorId: actor._id, actorRole: actor.role, action: 'ERASURE_PREVIEW', targetUserId: userId, details: { dry_run: true }, ip: req.ip, userAgent: req.get('User-Agent') });

    return Response.sendResponse(res, {
      userId: target._id,
      name: `${target.firstName || ''} ${target.lastName || ''}`.trim(),
      email: target.email,
      wouldDelete: { posts, comments, messages, notifications, activities, pushTokens, follows, dailyActivity, analyticsEvents, interestProfile, consents }
    });
  } catch (e) {
    console.error('GDPR erasePreview error', e);
    return Response.sendError(res, 500, 'Server error');
  }
};

// ─────────────────── Anonymize all posts/comments by user ──────
const ANON_PLACEHOLDER_ID = '000000000000000000000000';
exports.anonymizeAuthor = async (req, res) => {
  try {
    const actor = req.authUser;
    const isAdmin = actor.role === 'ADMIN' || actor.role === 'SUPER ADMIN';
    if (!isAdmin) return Response.sendError(res, 403, 'Access forbidden');

    const targetId = req.body.userId;
    if (!targetId) return Response.sendError(res, 400, 'userId required');
    const reason = req.body.reason || 'GDPR anonymization request';

    const Post = require('../models/Post');
    const Comment = require('../models/Comment');
    const mongoose = require('mongoose');
    const anonId = new mongoose.Types.ObjectId(ANON_PLACEHOLDER_ID);

    const [postRes, commentRes] = await Promise.all([
      Post.updateMany({ user: targetId }, { $set: { user: anonId, anonyme: true } }),
      Comment.updateMany({ user: targetId }, { $set: { user: anonId, anonyme: true } }),
    ]);

    await recordAudit({ actorId: actor._id, actorRole: actor.role, action: 'ANONYMIZE_AUTHOR', targetUserId: targetId, details: { reason, posts: postRes.modifiedCount, comments: commentRes.modifiedCount }, ip: req.ip, userAgent: req.get('User-Agent') });

    return Response.sendResponse(res, { posts: postRes.modifiedCount, comments: commentRes.modifiedCount }, 'Author anonymized');
  } catch (e) {
    console.error('GDPR anonymizeAuthor error', e);
    return Response.sendError(res, 500, 'Server error');
  }
};

// ─────────────────── Consent management ────────────────────────
exports.consentStatus = async (req, res) => {
  try {
    const actor = req.authUser;
    const isAdmin = actor.role === 'ADMIN' || actor.role === 'SUPER ADMIN';
    let targetId = actor._id;
    if (req.query.userId) {
      if (!isAdmin) return Response.sendError(res, 403, 'Access forbidden');
      targetId = req.query.userId;
    }

    const UserConsent = require('../models/UserConsent');
    const consent = await UserConsent.findOne({ userId: targetId }).lean();
    return Response.sendResponse(res, {
      userId: targetId,
      analytics_optin: consent ? consent.analytics_optin : false,
      personalization: consent ? consent.personalization : false,
      updatedAt: consent ? consent.updatedAt : null,
    });
  } catch (e) {
    console.error('GDPR consentStatus error', e);
    return Response.sendError(res, 500, 'Server error');
  }
};

const ALLOWED_CONSENT_KEYS = ['analytics_optin', 'personalization'];
exports.updateConsent = async (req, res) => {
  try {
    const actor = req.authUser;
    const isAdmin = actor.role === 'ADMIN' || actor.role === 'SUPER ADMIN';
    let targetId = actor._id;
    if (req.body.userId && String(req.body.userId) !== String(actor._id)) {
      if (!isAdmin) return Response.sendError(res, 403, 'Access forbidden');
      targetId = req.body.userId;
    }

    const { key, value } = req.body;
    if (!ALLOWED_CONSENT_KEYS.includes(key)) return Response.sendError(res, 400, 'Invalid consent key');
    if (typeof value !== 'boolean') return Response.sendError(res, 400, 'value must be boolean');

    const UserConsent = require('../models/UserConsent');
    const existing = await UserConsent.findOne({ userId: targetId });
    const oldValue = existing ? existing[key] : false;

    const historyEntry = { key, oldValue, newValue: value, changedAt: new Date(), changedBy: actor._id, source: isAdmin && String(targetId) !== String(actor._id) ? 'admin' : 'self' };

    const updated = await UserConsent.findOneAndUpdate(
      { userId: targetId },
      { $set: { [key]: value, updatedAt: new Date() }, $push: { history: historyEntry } },
      { upsert: true, new: true }
    );

    // If user opts out of analytics, delete their interest profile
    if (key === 'analytics_optin' && value === false) {
      try { await require('../models/UserInterestProfile').deleteOne({ userId: targetId }); } catch (e) {}
    }

    await recordAudit({ actorId: actor._id, actorRole: actor.role, action: 'CONSENT_CHANGE', targetUserId: targetId, details: { key, oldValue, newValue: value }, ip: req.ip, userAgent: req.get('User-Agent') });

    return Response.sendResponse(res, { userId: targetId, [key]: updated[key] }, 'Consent updated');
  } catch (e) {
    console.error('GDPR updateConsent error', e);
    return Response.sendError(res, 500, 'Server error');
  }
};
