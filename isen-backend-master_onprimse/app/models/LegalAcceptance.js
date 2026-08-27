const mongoose = require('mongoose');

const LEGAL_ACCEPTANCE_RETENTION_DAYS =
  Math.max(
    1,
    Number(
      process.env.LEGAL_ACCEPTANCE_RETENTION_DAYS ||
      1095
    )
  );

const LegalAcceptanceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  documentType: {
    type: String,
    required: true
  },

  documentVersion: {
    type: String,
    required: true
  },

  acceptedAt: {
    type: Date,
    default: Date.now
  },

  acceptanceContext: {
    type: String
  },

  meta: {
    type: Object,
    default: {}
  },

  /*
   * Finite lifecycle for legal-acceptance evidence.
   *
   * This is a configurable Folcen retention policy, not a statement that
   * GDPR itself requires 1095 days. Article 17 erasure may delete the record
   * earlier where no independent lawful retention basis applies.
   */
  retentionDate: {
    type: Date
  }
}, {
  collection: 'legal_acceptances',
  minimize: false,
  timestamps: true
});

LegalAcceptanceSchema.pre(
  'validate',
  function(next) {
    if (
      !this.retentionDate
    ) {
      const accepted =
        this.acceptedAt instanceof Date
          ? this.acceptedAt
          : new Date();

      this.retentionDate =
        new Date(
          accepted.getTime() +
          LEGAL_ACCEPTANCE_RETENTION_DAYS *
          24 *
          60 *
          60 *
          1000
        );
    }

    next();
  }
);

// Append-only by design.
LegalAcceptanceSchema.index({
  userId: 1,
  documentType: 1,
  acceptedAt: -1
});

// MongoDB deletes the record once its finite retentionDate is reached.
LegalAcceptanceSchema.index(
  { retentionDate: 1 },
  { expireAfterSeconds: 0 }
);

module.exports =
  mongoose.model(
    'LegalAcceptance',
    LegalAcceptanceSchema
  );
