const mongoose = require('mongoose');

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

// Ensure append-only: do not allow overwrite by application design (no update endpoints provided)
AuditLogSchema.index({ timestamp: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
