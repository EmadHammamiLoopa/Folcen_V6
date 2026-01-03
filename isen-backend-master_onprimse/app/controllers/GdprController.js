const Response = require('./Response');
const { recordAudit } = require('../utils/audit');
const tokenBlacklist = require('../utils/tokenBlacklist');
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Message = require('../models/Message');
const { connectedUsers, socketUserMap } = require('../utils/socketManager');
const { purgeUser, userSocketIds } = require('../helpers');
const io = require('../../index').io;

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

    const exportObj = {
      user: sanitizeUserForDsar(target),
      posts,
      comments,
      messages,
      followers,
      following,
      callEvents, // minimal technical metadata about call lifecycle
      messageEvents, // minimal delivery/abuse signals
      activities,
      reports,
      products,
      jobs,
      services,
      channels,
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

    await recordAudit({ actorId: actor._id, actorRole: actor.role, action: 'EXPORT', targetUserId: target._id, details: { reason: 'GDPR Data Portability Export', counts: { posts: posts.length, comments: comments.length, messages: messages.length } }, ip: req.ip, userAgent: req.get('User-Agent') });
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
    const qUserId = req.query.userId;
    if (!qUserId) return Response.sendError(res, 400, 'userId required');

    const AuditLog = require('../models/AuditLog');
    const page = parseInt(req.query.page || '1');
    const limit = parseInt(req.query.limit || '50');
    const skip = (page - 1) * limit;

    const logs = await AuditLog.find({ targetUserId: qUserId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('actorId', 'firstName lastName email role')
      .lean();

    const total = await AuditLog.countDocuments({ targetUserId: qUserId });

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
