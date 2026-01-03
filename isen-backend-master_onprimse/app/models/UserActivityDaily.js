const mongoose = require('mongoose');

const UserActivityDailySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  date: { type: Date, required: true, index: true },
  createdAt: { type: Date, default: Date.now }
}, { collection: 'user_activity_daily' });

// Unique per user per day
UserActivityDailySchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.models.UserActivityDaily || mongoose.model('UserActivityDaily', UserActivityDailySchema);
