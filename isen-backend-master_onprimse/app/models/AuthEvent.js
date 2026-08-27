const mongoose = require('mongoose');

const AuthEventSchema = new mongoose.Schema({
  type: { type: String, enum: ['signin_attempt','signin_success','signin_failed','token_revoked','logout','blocked_request'], required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  ipHash: { type: String, default: null },
  reasonCode: { type: String, default: null },
  meta: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: false });

const AUTH_EVENT_RETENTION_DAYS =
  Number(
    process.env.AUTH_EVENT_RETENTION_DAYS ||
    30
  );


const boundedAuthEventRetentionDays =
  Number.isFinite(
    AUTH_EVENT_RETENTION_DAYS
  ) &&
  AUTH_EVENT_RETENTION_DAYS > 0
    ? Math.floor(
        AUTH_EVENT_RETENTION_DAYS
      )
    : 30;


AuthEventSchema.index(
  {
    createdAt:
      1
  },
  {
    expireAfterSeconds:
      boundedAuthEventRetentionDays *
      24 *
      3600
  }
);

module.exports = mongoose.models.AuthEvent || mongoose.model('AuthEvent', AuthEventSchema);
