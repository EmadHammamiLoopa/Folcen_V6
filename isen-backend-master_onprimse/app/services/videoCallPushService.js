const { sendPushToUser } = require('./fcmPushService');

const DELIVERY_TTL_MS = 30_000;

function clean(value, fallback = '') {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  return text || fallback;
}

function safeTtl(expiresAt) {
  const remaining = Number(expiresAt || 0) - Date.now();

  if (!Number.isFinite(remaining) || remaining <= 0) {
    return 1000;
  }

  return Math.max(
    1000,
    Math.min(DELIVERY_TTL_MS, remaining)
  );
}

async function sendIncomingVideoCallPush(
  userId,
  {
    callId,
    callerId,
    calleeId,
    callerName,
    messageId,
    timestamp,
    expiresAt
  }
) {
  if (!userId || !callId || !callerId || !calleeId) {
    return {
      successCount: 0,
      failureCount: 0,
      removedInvalid: 0
    };
  }

  const sentAt = Number(timestamp) || Date.now();
  const expiry =
    Number(expiresAt) ||
    sentAt + DELIVERY_TTL_MS;

  const name = clean(callerName, 'Folcen user');

  return sendPushToUser(userId, {
    title: `${name} is calling`,
    body: 'Incoming video call',

    data: {
      type: 'incoming_video_call',
      category: 'call',
      event: 'call:invite',
      callType: 'video',

      callId: String(callId),

      callerId: String(callerId),
      fromUserId: String(callerId),
      from: String(callerId),

      calleeId: String(calleeId),
      receiverId: String(calleeId),
      toUserId: String(calleeId),
      to: String(calleeId),

      callerName: name,

      messageId:
        messageId != null
          ? String(messageId)
          : '',

      status: 'ringing',

      timestamp: String(sentAt),
      expiresAt: String(expiry)
    },

    android: {
      priority: 'high',
      ttl: safeTtl(expiry)
    }
  });
}

async function sendVideoCallLifecyclePush(
  userId,
  type,
  {
    callId,
    callerId,
    calleeId,
    callerName,
    messageId,
    reason,
    timestamp,
    expiresAt
  }
) {
  if (!userId || !callId || !callerId || !calleeId) {
    return {
      successCount: 0,
      failureCount: 0,
      removedInvalid: 0
    };
  }

  const allowed =
    type === 'video_call_cancelled' ||
    type === 'video_call_timeout';

  if (!allowed) {
    throw new Error(
      `Unsupported video call lifecycle type: ${type}`
    );
  }

  const sentAt = Number(timestamp) || Date.now();

  const status =
    type === 'video_call_timeout'
      ? 'timeout'
      : clean(reason, 'cancelled');

  return sendPushToUser(userId, {
    title: 'Call update',
    body: '',

    data: {
      type,
      category: 'call',

      event:
        type === 'video_call_timeout'
          ? 'call:timeout'
          : 'call:cancelled',

      callType: 'video',

      callId: String(callId),

      callerId: String(callerId),
      fromUserId: String(callerId),
      from: String(callerId),

      calleeId: String(calleeId),
      receiverId: String(calleeId),
      toUserId: String(calleeId),
      to: String(calleeId),

      callerName: clean(callerName, ''),

      messageId:
        messageId != null
          ? String(messageId)
          : '',

      status,
      reason: clean(reason, status),

      timestamp: String(sentAt),

      expiresAt:
        expiresAt != null
          ? String(expiresAt)
          : String(sentAt + DELIVERY_TTL_MS)
    },

    android: {
      priority: 'high',
      ttl: DELIVERY_TTL_MS
    }
  });
}

module.exports = {
  sendIncomingVideoCallPush,
  sendVideoCallLifecyclePush
};
