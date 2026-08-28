'use strict';

const mongoose =
  require('mongoose');

const subscriptionPaymentReceiptSchema =
  new mongoose.Schema(
    {
      _id: {
        type:
          String,

        required:
          true
      },

      userId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          'User',

        required:
          true,

        index:
          true
      },

      subscriptionId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          'Subscription',

        required:
          true
      },

      duration: {
        type:
          String,

        enum: [
          'day',
          'week',
          'month',
          'year'
        ],

        required:
          true
      },

      amountCents: {
        type:
          Number,

        required:
          true
      },

      currency: {
        type:
          String,

        required:
          true
      },

      status: {
        type:
          String,

        enum: [
          'claimed',
          'granted'
        ],

        default:
          'claimed',

        required:
          true
      },

      grantedAt: {
        type:
          Date,

        default:
          null
      },

      entitlementExpireDate: {
        type:
          Date,

        default:
          null
      },

      deleteAfter: {
        type:
          Date,

        required:
          true
      }
    },
    {
      timestamps:
        true
    }
  );

subscriptionPaymentReceiptSchema.index(
  {
    deleteAfter:
      1
  },
  {
    expireAfterSeconds:
      0
  }
);

module.exports =
  mongoose.model(
    'SubscriptionPaymentReceipt',
    subscriptionPaymentReceiptSchema
  );
