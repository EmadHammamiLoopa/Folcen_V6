const mongoose = require('mongoose');

const LegalAcceptanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  documentType: { type: String, required: true }, // e.g. terms, privacy, seller_disclaimer
  documentVersion: { type: String, required: true }, // version string or content hash
  acceptedAt: { type: Date, default: Date.now },
  acceptanceContext: { type: String }, // e.g. signup, publish_product
  meta: { type: Object, default: {} } // minimal non-sensitive metadata (clientType etc.)
}, {
  collection: 'legal_acceptances',
  minimize: false,
  timestamps: true
});

// Append-only by design: do not expose update routes. Keep index for queries by user.
LegalAcceptanceSchema.index({ userId: 1, documentType: 1, acceptedAt: -1 });

module.exports = mongoose.model('LegalAcceptance', LegalAcceptanceSchema);
