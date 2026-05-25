/*********************************************************************
 * app/models/UserConsent.js
 * -------------------------------------------------------------------
 * Stores per-user GDPR consent preferences.
 * One document per user (upsert pattern).
 * Privacy by design: only stores consent flags, not behavioural data.
 *********************************************************************/
const mongoose = require('mongoose');

const UserConsentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    // Analytics / interest profiling consent
    analytics_optin: {
      type: Boolean,
      default: false, // opt-IN model — must be explicitly enabled
    },
    // Content personalisation (e.g. feed ranking based on interests)
    personalization: {
      type: Boolean,
      default: false,
    },
    // When the consent record was first created (immutable — proves when consent was first obtained per Art.7)
    createdAt: { type: Date, default: Date.now, immutable: true },
    // Last time the user updated their consent
    updatedAt: { type: Date, default: Date.now },
    // History of changes (append-only via $push)
    history: [
      {
        key: String,
        oldValue: Boolean,
        newValue: Boolean,
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // admin or self
        source: { type: String, enum: ['self', 'admin', 'system'], default: 'self' },
      },
    ],
  },
  {
    collection: 'userconsents',
    minimize: false,
  }
);

module.exports =
  mongoose.models.UserConsent ||
  mongoose.model('UserConsent', UserConsentSchema);
