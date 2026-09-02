const mongoose = require('mongoose');

const NOTIFICATION_TTL_SECONDS = Number(process.env.NOTIFICATION_RETENTION_DAYS || 90) * 24 * 3600;

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  sender:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type:      { type: String, required: true },
  title:     { type: String, default: '' },
  body:      { type: String, default: '' },
  data:      { type: mongoose.Schema.Types.Mixed, default: {} },
  read:      { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, read: 1 });
// GDPR: TTL — notifications expire after NOTIFICATION_RETENTION_DAYS (default 90d)
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: NOTIFICATION_TTL_SECONDS });

module.exports = mongoose.model('Notification', notificationSchema);
