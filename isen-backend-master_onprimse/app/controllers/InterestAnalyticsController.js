/*********************************************************************
 * app/controllers/InterestAnalyticsController.js
 * -------------------------------------------------------------------
 * GDPR-safe interest/activity analytics for the admin dashboard.
 * Privacy design:
 *  - Aggregates only — no per-user raw event exposure.
 *  - Respects analytics_optin consent flag.
 *  - Explainability: per-user interest evidence shown only to admins.
 *  - Opt-out users are excluded from all aggregations.
 *********************************************************************/

const Response = require('./Response');
const mongoose = require('mongoose');

/**
 * GET /api/v1/analytics/interests
 * Returns aggregated channel/category engagement stats for the dashboard.
 * No individual user data exposed.
 */
exports.aggregatedInterests = async (req, res) => {
  try {
    const UserConsent = require('../models/UserConsent');
    const UserInterestProfile = require('../models/UserInterestProfile');
    const AnalyticsEvent = require('../models/AnalyticsEvent');

    const { fromDate, toDate } = req.query;
    const start = fromDate ? new Date(fromDate) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const end = toDate ? new Date(toDate) : new Date();

    // Count opted-in vs opted-out
    const [optedIn, optedOut, total] = await Promise.all([
      UserConsent.countDocuments({ analytics_optin: true }),
      UserConsent.countDocuments({ analytics_optin: false }),
      (async () => { const User = require('../models/User'); return User.countDocuments({ isDeleted: { $ne: true } }); })()
    ]);
    const neverResponded = total - optedIn - optedOut;

    // Aggregate top categories from AnalyticsEvent (only consented users)
    // Privacy: we only aggregate events — user IDs are not returned
    const consentedUserIds = await UserConsent.find({ analytics_optin: true })
      .select('userId').lean().then(r => r.map(x => x.userId));

    const topCategories = await AnalyticsEvent.aggregate([
      {
        $match: {
          userId: { $in: consentedUserIds },
          createdAt: { $gte: start, $lte: end },
          category: { $ne: null }
        }
      },
      { $group: { _id: '$category', count: { $sum: 1 }, eventTypes: { $addToSet: '$eventType' } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    const topChannels = await AnalyticsEvent.aggregate([
      {
        $match: {
          userId: { $in: consentedUserIds },
          createdAt: { $gte: start, $lte: end },
          channelId: { $ne: null }
        }
      },
      { $group: { _id: '$channelId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
      { $lookup: { from: 'channels', localField: '_id', foreignField: '_id', as: 'channel' } },
      { $unwind: { path: '$channel', preserveNullAndEmptyArrays: true } },
      { $project: { _id: 1, count: 1, channelName: '$channel.title' } }
    ]);

    // Event type breakdown
    const eventBreakdown = await AnalyticsEvent.aggregate([
      {
        $match: {
          userId: { $in: consentedUserIds },
          createdAt: { $gte: start, $lte: end }
        }
      },
      { $group: { _id: '$eventType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    return Response.sendResponse(res, {
      consentStats: { optedIn, optedOut, neverResponded, total, optOutRate: total > 0 ? ((optedOut / total) * 100).toFixed(1) + '%' : '0%' },
      topCategories,
      topChannels,
      eventBreakdown,
      period: { from: start, to: end }
    });
  } catch (e) {
    console.error('InterestAnalytics aggregatedInterests error', e);
    return Response.sendError(res, 500, 'Server error');
  }
};

/**
 * GET /api/v1/analytics/interest-explainer/:userId
 * Returns per-user interest evidence for explainability panel.
 * Admin only — shows WHY certain interests are inferred.
 * Only available if user has consented.
 */
exports.interestExplainer = async (req, res) => {
  try {
    const targetId = req.params.userId;
    if (!targetId) return Response.sendError(res, 400, 'userId required');

    const UserConsent = require('../models/UserConsent');
    const UserInterestProfile = require('../models/UserInterestProfile');
    const AnalyticsEvent = require('../models/AnalyticsEvent');

    // Check consent first
    const consent = await UserConsent.findOne({ userId: targetId }).lean();
    if (!consent || !consent.analytics_optin) {
      return Response.sendResponse(res, {
        userId: targetId,
        hasConsented: false,
        message: 'User has not consented to analytics profiling. No interest data available.'
      });
    }

    const profile = await UserInterestProfile.findOne({ userId: targetId }).lean();
    if (!profile) {
      return Response.sendResponse(res, { userId: targetId, hasConsented: true, profile: null, reason: 'No profile computed yet' });
    }

    // Recent contributing events (last 30 events, aggregated by category — no raw content)
    const recentEvents = await AnalyticsEvent.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(targetId) } },
      { $sort: { createdAt: -1 } },
      { $limit: 50 },
      { $group: { _id: { eventType: '$eventType', category: '$category' }, count: { $sum: 1 }, latest: { $max: '$createdAt' } } },
      { $sort: { count: -1 } }
    ]);

    return Response.sendResponse(res, {
      userId: targetId,
      hasConsented: true,
      consentUpdatedAt: consent.updatedAt,
      profile: {
        topCategories: (profile.topCategories || []).slice(0, 10),
        tagCounts: profile.tagCounts ? Object.fromEntries(profile.tagCounts) : {},
        lastComputedAt: profile.lastComputedAt,
      },
      evidence: recentEvents, // aggregated counts — no PII or raw content
    });
  } catch (e) {
    console.error('InterestAnalytics interestExplainer error', e);
    return Response.sendError(res, 500, 'Server error');
  }
};

/**
 * POST /api/v1/analytics/record-event (internal — called only by consented flows)
 * Records a single analytics event for a user.
 * MUST check consent before calling.
 */
exports.recordEvent = async (req, res) => {
  try {
    const actor = req.authUser;
    const { eventType, targetId, targetType, category, channelId, tags } = req.body;

    // Enforce consent
    const UserConsent = require('../models/UserConsent');
    const consent = await UserConsent.findOne({ userId: actor._id }).lean();
    if (!consent || !consent.analytics_optin) {
      // Silently drop — not an error, just not opted in
      return Response.sendResponse(res, { recorded: false, reason: 'not_consented' });
    }

    const AnalyticsEvent = require('../models/AnalyticsEvent');
    await AnalyticsEvent.create({
      userId: actor._id,
      eventType,
      targetId: targetId || null,
      targetType: targetType || null,
      category: category || null,
      channelId: channelId || null,
      tags: Array.isArray(tags) ? tags : [],
    });

    return Response.sendResponse(res, { recorded: true });
  } catch (e) {
    console.error('InterestAnalytics recordEvent error', e);
    return Response.sendError(res, 500, 'Server error');
  }
};

/**
 * Utility: recompute UserInterestProfile from AnalyticsEvent aggregates.
 * Called by a scheduled job or on-demand by admin.
 */
exports.recomputeInterestProfiles = async () => {
  const UserConsent = require('../models/UserConsent');
  const UserInterestProfile = require('../models/UserInterestProfile');
  const AnalyticsEvent = require('../models/AnalyticsEvent');

  const consentedUsers = await UserConsent.find({ analytics_optin: true }).select('userId').lean();
  let updated = 0;

  for (const { userId } of consentedUsers) {
    try {
      const categoryAgg = await AnalyticsEvent.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: { category: '$category', channelId: '$channelId' },
            likes: { $sum: { $cond: [{ $eq: ['$eventType', 'post_like'] }, 1, 0] } },
            comments: { $sum: { $cond: [{ $eq: ['$eventType', 'post_comment'] }, 1, 0] } },
            views: { $sum: { $cond: [{ $eq: ['$eventType', 'post_view'] }, 1, 0] } },
            samplePostIds: { $addToSet: '$targetId' }
          }
        },
        { $sort: { likes: -1 } },
        { $limit: 20 }
      ]);

      const topCategories = categoryAgg.map(c => ({
        category: c._id.category || 'unknown',
        channel: c._id.channelId || null,
        likes: c.likes,
        comments: c.comments,
        views: c.views,
        samplePostIds: (c.samplePostIds || []).filter(Boolean).slice(0, 5),
        lastUpdated: new Date(),
      }));

      const tagAgg = await AnalyticsEvent.aggregate([
        { $match: { userId } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 50 }
      ]);
      const tagCounts = Object.fromEntries(tagAgg.map(t => [t._id, t.count]));

      await UserInterestProfile.findOneAndUpdate(
        { userId },
        {
          $set: {
            topCategories,
            tagCounts,
            lastComputedAt: new Date(),
            expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
          }
        },
        { upsert: true }
      );
      updated++;
    } catch (e) {
      console.error('[InterestAnalytics] Failed to recompute profile:', e?.message || 'unknown error');
    }
  }
  return updated;
};
