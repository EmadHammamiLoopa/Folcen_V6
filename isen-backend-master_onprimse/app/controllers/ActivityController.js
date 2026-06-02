const Activity = require('../models/Activity');
const Response = require('./Response');

exports.create = async (req, res) => {
  try {
    const payload = {
      type: req.body.type,
      actor: req.body.actor || req.auth._id,
      targetType: req.body.targetType,
      targetId: req.body.targetId,
      channel: req.body.channel,
      content: req.body.content,
      meta: req.body.meta || {},
      visibility: req.body.visibility || 'public'
    };
    const act = await Activity.create(payload);
    // emit via socket if available
    try { const io = req.app && req.app.get('io'); if (io) io.emit('activity:created', act); } catch (e) { console.warn('Activity socket emit failed', e); }
    return Response.sendResponse(res, act, 'Activity created');
  } catch (err) {
    console.error('Error creating activity', err);
    return Response.sendError(res, 500, 'Server error');
  }
};

exports.list = async (req, res) => {
  try {
    const filter = {};
    
    // Force actorId to 'me' if not provided or if user wants their own activity
    // This ensures that by default or when actorId=me, we only see our own activity
    const requesterId = req.auth && req.auth._id ? String(req.auth._id) : null;
    
    if (req.query.actorId === 'me' || !req.query.actorId) {
      if (requesterId) {
        filter.actor = req.auth._id;
      } else {
        return Response.sendError(res, 401, 'Unauthorized');
      }
    } else {
      // If a specific actorId is requested, we still apply visibility rules below
      filter.actor = req.query.actorId;
      
      // Check if the target actor is inactive
      const mongoose = require('mongoose');
      const User = require('../models/User');
      const targetActor = await User.findOne({ 
        _id: req.query.actorId,
        $or: [
          { enabled: false },
          { isDeleted: true },
          { deletedAt: { $ne: null } },
          { banned: true }
        ]
      }).select('_id');
      
      if (targetActor && String(targetActor._id) !== requesterId) {
        return Response.sendResponse(res, { docs: [], page: 0, limit: 20 }, 'User is inactive');
      }
    }

    if (req.query.channelId) filter.channel = req.query.channelId;
    if (req.query.type) {
      if (req.query.type.includes(',')) {
        filter.type = { $in: req.query.type.split(',').map(t => t.trim()) };
      } else {
        filter.type = req.query.type;
      }
    }
    const limit = parseInt(req.query.limit) || 20;
    const page = parseInt(req.query.page) || 0;
    // Visibility enforcement: if the requester is not the actor, filter by visibility
    const authUser = req.authUser || {};

    if (filter.actor && String(filter.actor) !== requesterId) {
      // Only include activities visible to requester
      const allowed = [ { visibility: 'public' } ];
      const friends = Array.isArray(authUser.friends) ? authUser.friends.map(f => String(f._id || f || '')) : [];
      const followers = Array.isArray(authUser.followers) ? authUser.followers.map(f => String(f._id || f || '')) : [];

      // friends-only allowed if requester is in actor's friends (we approximate by checking relation from authUser)
      if (friends.length) allowed.push({ visibility: 'friends-only' });

      // Build $or for visibility
      const orClause = [ { visibility: 'public' } ];
      // If requester is same as actor, allow all (handled above)
      // Allow friends-only only if requester is among friends
      if (friends.length) orClause.push({ visibility: 'friends-only' });

      filter.$or = orClause;
    }

    // Fetch activities and filter out those that reference now-anonymous posts/comments
    const rawDocs = await Activity.find(filter).populate('actor', 'firstName lastName mainAvatar avatarStyle avatarSeed avatarVariant avatarOverrides').sort({ createdAt: -1 }).skip(page * limit).limit(limit).lean();

    // If there are no docs or requester is the actor, return as-is (actor should see private activities)
    const requester = requesterId;

    // Collect referenced post/comment ids
    const postIds = rawDocs.filter(d => d.targetType === 'post' && d.targetId).map(d => d.targetId);
    const commentIds = rawDocs.filter(d => d.type === 'comment' && d.meta && d.meta.commentId).map(d => d.meta.commentId);
    const productIds = rawDocs.filter(d => d.targetType === 'product' && d.targetId).map(d => d.targetId);
    const jobIds = rawDocs.filter(d => d.targetType === 'job' && d.targetId).map(d => d.targetId);
    const serviceIds = rawDocs.filter(d => d.targetType === 'service' && d.targetId).map(d => d.targetId);

    const mongoose = require('mongoose');
    const Post = require('../models/Post');
    const Comment = require('../models/Comment');
    const Product = require('../models/Product');
    const Job = require('../models/Job');
    const Service = require('../models/Service');
    const User = require('../models/User');

    // Get inactive users to filter out their content from activity
    const inactiveUsers = await User.find({ 
        $or: [
            { enabled: false },
            { isDeleted: true },
            { deletedAt: { $ne: null } },
            { banned: true }
        ] 
    }).select('_id');
    const inactiveUserIds = inactiveUsers.map(u => String(u._id));

    const anonPostIds = postIds.length ? (await Post.find({ _id: { $in: postIds }, anonyme: true }).select('_id')).map(p => String(p._id)) : [];
    const anonCommentIds = commentIds.length ? (await Comment.find({ _id: { $in: commentIds }, anonyme: true }).select('_id')).map(c => String(c._id)) : [];

    // Find content belonging to inactive users
    const inactivePostIds = postIds.length ? (await Post.find({ _id: { $in: postIds }, user: { $in: inactiveUserIds } }).select('_id')).map(p => String(p._id)) : [];
    const inactiveCommentIds = commentIds.length ? (await Comment.find({ _id: { $in: commentIds }, user: { $in: inactiveUserIds } }).select('_id')).map(c => String(c._id)) : [];
    const inactiveProductIds = productIds.length ? (await Product.find({ _id: { $in: productIds }, user: { $in: inactiveUserIds } }).select('_id')).map(p => String(p._id)) : [];
    const inactiveJobIds = jobIds.length ? (await Job.find({ _id: { $in: jobIds }, user: { $in: inactiveUserIds } }).select('_id')).map(j => String(j._id)) : [];
    const inactiveServiceIds = serviceIds.length ? (await Service.find({ _id: { $in: serviceIds }, user: { $in: inactiveUserIds } }).select('_id')).map(s => String(s._id)) : [];

    const filtered = rawDocs.filter(d => {
      const actorId = String(d.actor && d.actor._id || d.actor);
      
      // If the actor of the activity is inactive, hide it (unless it's the requester themselves, which shouldn't happen if they are inactive)
      if (inactiveUserIds.includes(actorId) && actorId !== requester) return false;

      // If activity is private, allow only the actor to see it
      if (d.visibility === 'private' && actorId !== requester) return false;

      // If activity points to an anonymous post, allow only the post author (actor) to see it
      if (d.targetType === 'post' && d.targetId && anonPostIds.includes(String(d.targetId))) {
        return actorId === requester;
      }

      // If activity references an anonymous comment, allow only actor
      if ((d.type === 'comment' || d.type === 'like') && d.meta && d.meta.commentId && anonCommentIds.includes(String(d.meta.commentId))) {
        return actorId === requester;
      }

      // NEW: Filter out activities pointing to content from inactive users
      if (d.targetType === 'post' && d.targetId && inactivePostIds.includes(String(d.targetId))) {
        return actorId === requester; // Only show to the person who did the action (e.g., "I liked this post")
      }
      if ((d.type === 'comment' || d.type === 'like') && d.meta && d.meta.commentId && inactiveCommentIds.includes(String(d.meta.commentId))) {
        return actorId === requester;
      }
      if (d.targetType === 'product' && d.targetId && inactiveProductIds.includes(String(d.targetId))) {
        return actorId === requester;
      }
      if (d.targetType === 'job' && d.targetId && inactiveJobIds.includes(String(d.targetId))) {
        return actorId === requester;
      }
      if (d.targetType === 'service' && d.targetId && inactiveServiceIds.includes(String(d.targetId))) {
        return actorId === requester;
      }

      return true;
    });

    // Process filtered activities to show nice messages for hidden content
    const processed = filtered.map(d => {
      const actorId = String(d.actor && d.actor._id || d.actor);
      const targetId = d.targetId ? String(d.targetId) : null;
      const commentId = d.meta && d.meta.commentId ? String(d.meta.commentId) : null;
      
      // Only hide content if the requester is NOT the actor of the activity
      const isTargetHidden = actorId !== requester && (
                             (targetId && (inactivePostIds.includes(targetId) || 
                             inactiveProductIds.includes(targetId) ||
                             inactiveJobIds.includes(targetId) ||
                             inactiveServiceIds.includes(targetId))) ||
                             (commentId && inactiveCommentIds.includes(commentId))
      );

      if (isTargetHidden) {
        return {
          ...d,
          content: "Content hidden by admin",
          meta: { ...d.meta, isHidden: true, hiddenReason: "Author is inactive" }
        };
      }
      return d;
    });

    // Enrich post-typed activities with event/dating extras so the activity list
    // can render the same per-type info that the post detail page shows.
    try {
      const extrasPostIds = processed
        .filter(d => d.targetType === 'post' && d.targetId)
        .map(d => d.targetId);
      if (extrasPostIds.length) {
        const extras = await Post.find({ _id: { $in: extrasPostIds } })
          .select('_id eventDate eventLocation eventTime relationshipGoals ageRange interests hintAboutMe')
          .lean();
        const extrasMap = new Map(extras.map(p => [String(p._id), p]));
        processed.forEach(d => {
          if (d.targetType === 'post' && d.targetId) {
            const ex = extrasMap.get(String(d.targetId));
            if (ex) {
              d.postExtras = {
                eventDate: ex.eventDate || null,
                eventLocation: ex.eventLocation || null,
                eventTime: ex.eventTime || null,
                relationshipGoals: ex.relationshipGoals || [],
                ageRange: ex.ageRange || null,
                interests: ex.interests || [],
                hintAboutMe: ex.hintAboutMe || null,
              };
            }
          }
        });
      }
    } catch (e) { logger && logger.warn && logger.warn('activity extras enrichment failed', e); }

    return Response.sendResponse(res, { docs: processed, page, limit });
  } catch (err) {
    console.error('Error listing activities', err);
    return Response.sendError(res, 500, 'Server error');
  }
};
