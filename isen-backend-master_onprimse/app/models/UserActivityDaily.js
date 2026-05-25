const mongoose = require('mongoose');

const DAU_TTL_SECONDS = Number(process.env.USER_ACTIVITY_DAILY_RETENTION_DAYS || 365) * 24 * 3600;

const UserActivityDailySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  date: { type: Date, required: true, index: true },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'user_activity_daily' });

// Unique per user per day
UserActivityDailySchema.index({ userId: 1, date: 1 }, { unique: true });
// GDPR: TTL — daily activity records expire after USER_ACTIVITY_DAILY_RETENTION_DAYS (default 365d)
UserActivityDailySchema.index({ date: 1 }, { expireAfterSeconds: DAU_TTL_SECONDS });

module.exports = mongoose.models.UserActivityDaily || mongoose.model('UserActivityDaily', UserActivityDailySchema);
