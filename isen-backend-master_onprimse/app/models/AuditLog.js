const mongoose = require('mongoose');

// AUDIT_LOG_RETENTION_DAYS: how long to keep GDPR audit records (Art. 30 accountability).
// Default 3 years. Must not be set below 365 (regulators expect at least 12 months).
const RETENTION_DAYS = Math.max(365, Number(process.env.AUDIT_LOG_RETENTION_DAYS || 1095));

const AuditLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now, immutable: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  actorRole: { type: String, required: false },
  action: { type: String, required: true },
  targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  meta: { type: Object, default: {} }, // redacted metadata (no raw tokens)
  ip: { type: String },
  userAgent: { type: String }
}, {
  collection: 'audit_logs',
  capped: false,
  minimize: false
});

// Append-only: no update endpoints provided.
AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ targetUserId: 1, timestamp: -1 });
AuditLogSchema.index({ action: 1, timestamp: -1 });
// TTL: auto-purge old audit records (configurable, minimum 1 year)
AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: RETENTION_DAYS * 24 * 3600 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
