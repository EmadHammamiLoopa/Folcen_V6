/**
 * CallEvent
 * Minimal, non-content event logging for random / video calls.
 * Purpose: store only technical metadata required for auditing, abuse detection,
 * and lawful-basis reporting (legitimate interest / contract performance).
 * Do NOT store audio/video or any user content.
 * Retention: automatically purged after CALL_EVENT_RETENTION_DAYS (env, default 90).
 */
const mongoose = require('mongoose');

const CallEventSchema = new mongoose.Schema({
  callId: { type: String, required: true, index: true }, // server-generated UUID-like
  initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // lightly denormalized
  // lifecycle: matched, connected, timeout, cancelled, declined, ended
  lifecycle: [{
    at: { type: Date, default: Date.now },
    event: { type: String, enum: ['requested','matched','connected','timeout','cancelled','declined','ended'], required: true },
    durationSeconds: { type: Number, default: null } // only for connected->ended
  }],
  createdAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } }, // TTL index
  linkedReport: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', default: null }
}, { collection: 'call_events' });

// set default expiry based on env
CallEventSchema.pre('save', function (next) {
  if (!this.expiresAt) {
    const days = Number(process.env.CALL_EVENT_RETENTION_DAYS || 90);
    this.expiresAt = new Date(Date.now() + days * 24 * 3600 * 1000);
  }
  next();
});

module.exports = mongoose.model('CallEvent', CallEventSchema);
