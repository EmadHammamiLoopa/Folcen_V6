/*********************************************************************
 * app/models/PushToken.js
 * -------------------------------------------------------------------
 * Stores FCM device tokens linked to users.
 * Multiple tokens are allowed per user (multiple devices/installs).
 * A unique index on `token` prevents duplicates.
 *********************************************************************/

const mongoose = require('mongoose');

const pushTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,   // one record per physical FCM token
      trim: true,
    },
    platform: {
      type: String,
      enum: ['android', 'ios', 'web'],
      default: 'android',
    },
    deviceId: {
      type: String,
      default: null,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PushToken', pushTokenSchema);
