/**
 * MessageEvent
 * Minimal event capture for messaging delivery/abuse signals.
 * Stores only technical metadata (sender, receiver, type of signal, timestamp).
 * Do NOT store message content.
 * Retention: MESSAGE_EVENT_RETENTION_DAYS (env, default 60).
 */
const mongoose = require('mongoose');

const MessageEventSchema = new mongoose.Schema({
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  to:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  event: { type: String, enum: ['send_attempt','delivered','blocked','reported'], required: true },
  reason: { type: String, default: null },
  createdAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, index: true }, // finite expiry enforced by purge job so linkedReport can be protected
  linkedReport: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', default: null }
}, { collection: 'message_events' });

MessageEventSchema.pre('save', function (next) {
  if (!this.expiresAt) {
    const days = Number(process.env.MESSAGE_EVENT_RETENTION_DAYS || 60);
    this.expiresAt = new Date(Date.now() + days * 24 * 3600 * 1000);
  }
  next();
});

module.exports = mongoose.model('MessageEvent', MessageEventSchema);
