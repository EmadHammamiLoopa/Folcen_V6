const mongoose = require('mongoose');

const BLACKLIST_REVIEW_DAYS =
  Math.max(
    1,
    Number(
      process.env.BLACKLIST_REVIEW_DAYS ||
      90
    )
  );

const BLACKLIST_RETENTION_DAYS =
  Math.max(
    1,
    Number(
      process.env.BLACKLIST_RETENTION_DAYS ||
      365
    )
  );

const PERSONAL_ITEM_TYPES =
  new Set([
    'user',
    'ip',
    'ip address',
    'email'
  ]);

const blacklistSchema =
  new mongoose.Schema({
    itemType: {
      type: String,
      required: true
    },

    itemValue: {
      type: String,
      required: true,
      unique: true
    },

    reason: {
      type: String,
      required: true
    },

    /*
     * createdBy is optional because Article 17 minimization may remove the
     * identity of the erased administrator/user while preserving the security
     * rule itself.
     */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },

    createdAt: {
      type: Date,
      default: Date.now
    },

    /*
     * Personal blacklist entries require periodic necessity review.
     */
    reviewAt: {
      type: Date,
      default: null
    },

    /*
     * Hard upper retention boundary for identifying blacklist entries.
     * Review may shorten this period; it must not silently become indefinite.
     */
    retentionDate: {
      type: Date,
      default: null
    },

    /*
     * Article 17 default is erasure. Keeping a direct user blacklist after an
     * erasure request requires an explicit, documented, finite exception.
     */
    retainOnErasure: {
      type: Boolean,
      default: false
    },

    retentionReason: {
      type: String,
      default: null
    }
  });

blacklistSchema.pre(
  'validate',
  function(next) {
    const type =
      String(
        this.itemType ||
        ''
      )
        .trim()
        .toLowerCase();

    if (
      PERSONAL_ITEM_TYPES.has(
        type
      )
    ) {
      const now =
        new Date();

      if (
        !this.reviewAt
      ) {
        this.reviewAt =
          new Date(
            now.getTime() +
            BLACKLIST_REVIEW_DAYS *
            24 *
            60 *
            60 *
            1000
          );
      }

      if (
        !this.retentionDate
      ) {
        this.retentionDate =
          new Date(
            now.getTime() +
            BLACKLIST_RETENTION_DAYS *
            24 *
            60 *
            60 *
            1000
          );
      }
    }

    if (
      this.retainOnErasure &&
      (
        !this.retentionReason ||
        !String(
          this.retentionReason
        ).trim() ||
        !this.retentionDate
      )
    ) {
      return next(
        new Error(
          'retainOnErasure requires a documented retentionReason and finite retentionDate'
        )
      );
    }

    next();
  }
);

blacklistSchema.index({
  reviewAt: 1
});

blacklistSchema.index(
  { retentionDate: 1 },
  { expireAfterSeconds: 0 }
);

module.exports =
  mongoose.model(
    'Blacklist',
    blacklistSchema
  );
