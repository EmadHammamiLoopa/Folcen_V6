const mongoose = require('mongoose');

const ACTIVITY_TTL_SECONDS = Number(process.env.ACTIVITY_RETENTION_DAYS || 90) * 24 * 3600;

const activitySchema = new mongoose.Schema({
  type: { type: String, required: true, enum: ['post','comment','like','share','product','job','service'] },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetType: { type: String },
  targetId: { type: mongoose.Schema.Types.ObjectId },
  channel: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel' },
  content: { type: String },
  meta: { type: mongoose.Schema.Types.Mixed },
  visibility: { type: String, enum: ['public','friends-only','private'], default: 'public' },
  createdAt: { type: Date, default: Date.now }
});

// Indexes for fast queries
activitySchema.index({ actor: 1, createdAt: -1 });
activitySchema.index({ channel: 1, createdAt: -1 });
activitySchema.index({ type: 1, createdAt: -1 });
// GDPR: TTL — activities expire after ACTIVITY_RETENTION_DAYS (default 90d)
activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: ACTIVITY_TTL_SECONDS });

module.exports = mongoose.model('Activity', activitySchema);
