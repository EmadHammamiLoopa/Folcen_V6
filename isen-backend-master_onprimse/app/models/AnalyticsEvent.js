/*********************************************************************
 * app/models/AnalyticsEvent.js
 * -------------------------------------------------------------------
 * Short-lived raw analytics events used ONLY to feed aggregation.
 * TTL index purges documents after ANALYTICS_EVENT_RETENTION_DAYS.
 * Only written when user.consents.analytics_optin === true.
 * Pseudonymous: stores userId (not email/name).
 *********************************************************************/
const mongoose = require('mongoose');

const RETENTION_DAYS = Number(process.env.ANALYTICS_EVENT_RETENTION_DAYS || 30);

const AnalyticsEventSchema = new mongoose.Schema(
  {
    // Pseudonymous reference — no PII beyond userId
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: ['post_like', 'post_view', 'post_comment', 'channel_visit', 'search'],
    },
    // References to the entity (no content stored)
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
    targetType: {
      type: String,
      enum: ['Post', 'Channel', 'Comment', null],
      default: null,
    },
    // Category/tag for aggregation
    category: { type: String, default: null },
    channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', default: null },
    tags: [{ type: String }],

    createdAt: {
      type: Date,
      default: Date.now,
      // TTL index — documents expire automatically
      index: { expireAfterSeconds: RETENTION_DAYS * 24 * 3600 },
    },
  },
  {
    collection: 'analyticsevents',
    minimize: false,
  }
);

AnalyticsEventSchema.index({ userId: 1, eventType: 1, createdAt: -1 });
AnalyticsEventSchema.index({ channelId: 1, createdAt: -1 });
AnalyticsEventSchema.index({ category: 1, createdAt: -1 });

module.exports =
  mongoose.models.AnalyticsEvent ||
  mongoose.model('AnalyticsEvent', AnalyticsEventSchema);
