const assert = require('assert');

describe('videoCallPushService', function () {
  let fcmPushService;
  let originalSendPushToUser;
  let captured;

  const fcmPath =
    require.resolve('../app/services/fcmPushService');

  const servicePath =
    require.resolve('../app/services/videoCallPushService');

  beforeEach(function () {
    captured = null;

    fcmPushService = require(fcmPath);
    originalSendPushToUser =
      fcmPushService.sendPushToUser;

    fcmPushService.sendPushToUser =
      async (userId, payload) => {
        captured = {
          userId: String(userId),
          payload
        };

        return {
          successCount: 1,
          failureCount: 0,
          removedInvalid: 0
        };
      };

    // videoCallPushService destructures sendPushToUser
    // at module load time, so reload it after installing mock.
    delete require.cache[servicePath];
  });

  afterEach(function () {
    if (fcmPushService) {
      fcmPushService.sendPushToUser =
        originalSendPushToUser;
    }

    delete require.cache[servicePath];
  });

  it('builds high-priority data payload for incoming video call', async function () {
    const {
      sendIncomingVideoCallPush
    } = require(servicePath);

    const now = Date.now();
    const expiresAt = now + 30_000;

    const result =
      await sendIncomingVideoCallPush(
        'callee-1',
        {
          callId: 'call-123',
          callerId: 'caller-1',
          calleeId: 'callee-1',
          callerName: 'Caller One',
          messageId: 'message-123',
          timestamp: now,
          expiresAt
        }
      );

    assert.ok(captured);

    assert.strictEqual(
      captured.userId,
      'callee-1'
    );

    const {
      data,
      android
    } = captured.payload;

    assert.strictEqual(
      data.type,
      'incoming_video_call'
    );

    assert.strictEqual(
      data.category,
      'call'
    );

    assert.strictEqual(
      data.event,
      'call:invite'
    );

    assert.strictEqual(
      data.callType,
      'video'
    );

    assert.strictEqual(
      data.callId,
      'call-123'
    );

    assert.strictEqual(
      data.callerId,
      'caller-1'
    );

    assert.strictEqual(
      data.fromUserId,
      'caller-1'
    );

    assert.strictEqual(
      data.calleeId,
      'callee-1'
    );

    assert.strictEqual(
      data.receiverId,
      'callee-1'
    );

    assert.strictEqual(
      data.callerName,
      'Caller One'
    );

    assert.strictEqual(
      data.messageId,
      'message-123'
    );

    assert.strictEqual(
      data.status,
      'ringing'
    );

    assert.strictEqual(
      Number(data.timestamp),
      now
    );

    assert.strictEqual(
      Number(data.expiresAt),
      expiresAt
    );

    assert.strictEqual(
      android.priority,
      'high'
    );

    assert.ok(
      android.ttl > 0 &&
      android.ttl <= 30_000,
      `unexpected TTL ${android.ttl}`
    );

    assert.deepStrictEqual(
      result,
      {
        successCount: 1,
        failureCount: 0,
        removedInvalid: 0
      }
    );
  });

  it('builds terminal cancellation lifecycle payload', async function () {
    const {
      sendVideoCallLifecyclePush
    } = require(servicePath);

    const now = Date.now();

    await sendVideoCallLifecyclePush(
      'callee-1',
      'video_call_cancelled',
      {
        callId: 'call-cancel-1',
        callerId: 'caller-1',
        calleeId: 'callee-1',
        callerName: 'Caller One',
        messageId: 'message-cancel',
        reason: 'cancelled',
        timestamp: now,
        expiresAt: now + 30_000
      }
    );

    assert.ok(captured);

    const {
      data,
      android
    } = captured.payload;

    assert.strictEqual(
      captured.userId,
      'callee-1'
    );

    assert.strictEqual(
      data.type,
      'video_call_cancelled'
    );

    assert.strictEqual(
      data.category,
      'call'
    );

    assert.strictEqual(
      data.event,
      'call:cancelled'
    );

    assert.strictEqual(
      data.callId,
      'call-cancel-1'
    );

    assert.strictEqual(
      data.callerId,
      'caller-1'
    );

    assert.strictEqual(
      data.calleeId,
      'callee-1'
    );

    assert.strictEqual(
      data.status,
      'cancelled'
    );

    assert.strictEqual(
      data.reason,
      'cancelled'
    );

    assert.strictEqual(
      android.priority,
      'high'
    );

    assert.strictEqual(
      android.ttl,
      30_000
    );
  });

  it('builds terminal timeout lifecycle payload', async function () {
    const {
      sendVideoCallLifecyclePush
    } = require(servicePath);

    const now = Date.now();

    await sendVideoCallLifecyclePush(
      'callee-2',
      'video_call_timeout',
      {
        callId: 'call-timeout-1',
        callerId: 'caller-2',
        calleeId: 'callee-2',
        callerName: 'Caller Two',
        messageId: 'message-timeout',
        reason: 'timeout',
        timestamp: now,
        expiresAt: now + 30_000
      }
    );

    assert.ok(captured);

    const {
      data,
      android
    } = captured.payload;

    assert.strictEqual(
      data.type,
      'video_call_timeout'
    );

    assert.strictEqual(
      data.event,
      'call:timeout'
    );

    assert.strictEqual(
      data.callId,
      'call-timeout-1'
    );

    assert.strictEqual(
      data.status,
      'timeout'
    );

    assert.strictEqual(
      data.reason,
      'timeout'
    );

    assert.strictEqual(
      android.priority,
      'high'
    );
  });

  it('rejects unsupported lifecycle types', async function () {
    const {
      sendVideoCallLifecyclePush
    } = require(servicePath);

    await assert.rejects(
      () =>
        sendVideoCallLifecyclePush(
          'callee-1',
          'some_unknown_event',
          {
            callId: 'call-bad',
            callerId: 'caller-1',
            calleeId: 'callee-1'
          }
        ),
      /Unsupported video call lifecycle type/
    );

    assert.strictEqual(
      captured,
      null
    );
  });

  it('does not send malformed incoming calls without callId', async function () {
    const {
      sendIncomingVideoCallPush
    } = require(servicePath);

    const result =
      await sendIncomingVideoCallPush(
        'callee-1',
        {
          callerId: 'caller-1',
          calleeId: 'callee-1',
          callerName: 'Caller'
        }
      );

    assert.strictEqual(
      captured,
      null
    );

    assert.deepStrictEqual(
      result,
      {
        successCount: 0,
        failureCount: 0,
        removedInvalid: 0
      }
    );
  });
});
