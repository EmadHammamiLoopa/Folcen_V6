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

function cleanPushText(value, fallback = '') {
  let raw = value;
  if (raw && typeof raw === 'object') {
    raw = raw.en || raw.title || raw.body || raw.name || raw.displayName || raw.fullName || '';
  }
  const clean = String(raw ?? '')
    .replace(/\[object Object\]/gi, '')
    .replace(/\bundefined\b|\bnull\b|\bNaN\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || fallback;
}

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
    console.warn('[fcmPushService] Firebase Admin not initialised â€” skipping push');
    return { successCount: 0, failureCount: 0, removedInvalid: 0 };
  }

  // Fetch all FCM tokens for this user
  const tokenDocs = await PushToken.find({ userId: String(userId) }).lean();
  if (!tokenDocs.length) {
    console.warn(
      `[fcmPushService] no tokens for userId=${userId} type=${data.type || data.event || data.category || 'notification'}`
    );
    return { successCount: 0, failureCount: 0, removedInvalid: 0 };
  }

  const tokens = tokenDocs.map(d => d.token);
  console.log(`[fcmPushService] preparing push userId=${userId} tokens=${tokens.length} type=${data.type || data.event || data.category || 'notification'}`);

  const safeTitle = cleanPushText(title, 'Notification');
  const safeBody = cleanPushText(body, '');

  // Convert all data values to strings (FCM requirement)
  const stringData = {};
  for (const [k, v] of Object.entries(data)) {
    stringData[k] = v === null || v === undefined ? '' : cleanPushText(v, '');
  }

  const isIncomingCall =
    stringData.type === 'incoming_call' ||
    stringData.event === 'call:invite' ||
    stringData.category === 'call';

  const videoPermissionType =
    stringData.type || stringData.event || '';

  const isVideoPermissionEvent = [
    'video-call-request',
    'video-call-accepted',
    'video-call-rejected',
    'video-call-revoked',
    'video-call-cancelled'
  ].includes(videoPermissionType);

  // These Android events must be data-only so Folcen's native
  // FirebaseMessagingService always owns notification presentation.
  const isNativeHandledAndroid =
    isIncomingCall || isVideoPermissionEvent;

  const message = {
    data: {
      ...stringData,
      serverSentAt: stringData.serverSentAt || String(Date.now()),
      title: safeTitle,
      body: safeBody
    },
    tokens,
  };

  // Incoming calls and video-permission events are data-only on Android.
  // The native Folcen Firebase service creates their actual notifications.
  if (!isNativeHandledAndroid) {
    message.notification = {
      title: safeTitle,
      body: safeBody,
    };
  }

  if (android) {
    message.android = isNativeHandledAndroid
      ? {
          priority: android.priority || 'high',
          ttl: android.ttl || (isIncomingCall ? 90 * 1000 : 5 * 60 * 1000),
          collapseKey: isIncomingCall
            ? (
                stringData.callId ||
                stringData.fromUserId ||
                stringData.callerId ||
                'incoming_call'
              )
            : (
                stringData.messageId ||
                videoPermissionType ||
                'video_permission'
              )
        }
      : android;
  }

  // Keep normal visible APNs alerts while Android uses the data-only
  // native path above.
  if (apns) {
    if (isVideoPermissionEvent) {
      const existingAps =
        (apns.payload && apns.payload.aps) || {};

      message.apns = {
        ...apns,
        payload: {
          ...(apns.payload || {}),
          aps: {
            ...existingAps,
            alert: existingAps.alert || {
              title: safeTitle,
              body: safeBody
            },
            sound: existingAps.sound || 'default'
          }
        }
      };
    } else {
      message.apns = apns;
    }
  }

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
        console.warn(`[fcmPushService] tokenTail=${String(tokens[idx]).slice(-8)} failed code=${code || 'unknown'} message=${res.error?.message || ''}`);
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

