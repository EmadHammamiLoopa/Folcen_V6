const mongoose = require('mongoose');

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

module.exports = mongoose.model('Activity', activitySchema);
