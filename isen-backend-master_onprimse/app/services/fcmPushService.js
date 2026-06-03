/*********************************************************************
 * app/services/fcmPushService.js
 * -------------------------------------------------------------------
 * Drop-in replacement for the OneSignal-based pushService.
 *
 * Usage:
 *   const { sendPushToUser } = require('./fcmPushService');
 *   await sendPushToUser(userId, { title, body, data });
 *
 * Returns: { successCount, failureCount, removedInvalid }
 *********************************************************************/

const { admin } = require('./firebaseAdmin');
const PushToken  = require('../models/PushToken');

/**
 * Send an FCM push notification to all devices registered for a user.
 *
 * @param {string|ObjectId} userId
 * @param {{ title: string, body: string, data?: object, android?: object, apns?: object }} payload
 * @returns {Promise<{ successCount: number, failureCount: number, removedInvalid: number }>}
 */
async function sendPushToUser(userId, { title, body, data = {}, android = null, apns = null }) {
  if (!userId) {
    console.warn('[fcmPushService] sendPushToUser called with no userId');
    return { successCount: 0, failureCount: 0, removedInvalid: 0 };
  }

  // Firebase Admin SDK must be initialised
  if (!admin.apps || !admin.apps.length) {
    console.warn('[fcmPushService] Firebase Admin not initialised — skipping push');
    return { successCount: 0, failureCount: 0, removedInvalid: 0 };
  }

  // Fetch all FCM tokens for this user
  const tokenDocs = await PushToken.find({ userId: String(userId) }).lean();
  if (!tokenDocs.length) {
    return { successCount: 0, failureCount: 0, removedInvalid: 0 };
  }

  const tokens = tokenDocs.map(d => d.token);

  // Convert all data values to strings (FCM requirement)
  const stringData = {};
  for (const [k, v] of Object.entries(data)) {
    stringData[k] = v === null || v === undefined ? '' : String(v);
  }

  const message = {
    notification: {
      title: title || 'Notification',
      body:  body  || '',
    },
    data: stringData,
    tokens,
  };
  if (android) message.android = android;
  if (apns) message.apns = apns;

  let successCount  = 0;
  let failureCount  = 0;
  let removedInvalid = 0;

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    successCount = response.successCount;
    failureCount = response.failureCount;

    // Remove stale / invalid tokens from DB
    const invalidTokens = [];
    response.responses.forEach((res, idx) => {
      if (!res.success) {
        const code = res.error && res.error.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    if (invalidTokens.length) {
      await PushToken.deleteMany({ token: { $in: invalidTokens } });
      removedInvalid = invalidTokens.length;
      console.log(`[fcmPushService] Removed ${removedInvalid} invalid token(s) for user ${userId}`);
    }

    console.log(
      `[fcmPushService] userId=${userId} success=${successCount} failure=${failureCount} removed=${removedInvalid}`
    );
  } catch (err) {
    console.error('[fcmPushService] Error sending multicast push:', err.message);
    failureCount = tokens.length;
  }

  return { successCount, failureCount, removedInvalid };
}

module.exports = { sendPushToUser };
