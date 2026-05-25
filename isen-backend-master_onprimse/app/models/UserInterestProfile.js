/*********************************************************************
 * app/models/UserInterestProfile.js
 * -------------------------------------------------------------------
 * GDPR-safe aggregated interest profile per user.
 * Only populated when user has consented (analytics_optin = true).
 * Stores aggregated counters — NOT raw event streams.
 * Privacy by design:
 *  - No raw behavioral events stored here.
 *  - Counters are degraded (aged out) if user revokes consent.
 *  - Deleted in purgeUser() cascade.
 *********************************************************************/
const mongoose = require('mongoose');

const CategoryCountSchema = new mongoose.Schema(
  {
    category: { type: String, required: true },  // e.g. 'sports', 'tech', 'art'
    channel:  { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', default: null },
    likes:    { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    views:    { type: Number, default: 0 },
    // Explainability: last N post IDs (up to 5) that contributed to this count
    samplePostIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    lastUpdated: { type: Date, default: Date.now },
  },
  { _id: false }
);

const UserInterestProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    // Only valid if the user has consented (checked at write time, not stored here)
    topCategories: [CategoryCountSchema],

    // Aggregated tag weights (e.g. { 'nodejs': 12, 'football': 7 })
    tagCounts: {
      type: Map,
      of: Number,
      default: {},
    },

    // Last full recomputation timestamp
    lastComputedAt: { type: Date, default: Date.now },

    // Retention: when this profile will be purged even if user is active
    expiresAt: {
      type: Date,
      // Default: 90 days rolling window
      default: () => new Date(Date.now() + 90 * 24 * 3600 * 1000),
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    collection: 'userinterestprofiles',
    minimize: false,
  }
);

module.exports =
  mongoose.models.UserInterestProfile ||
  mongoose.model('UserInterestProfile', UserInterestProfileSchema);
