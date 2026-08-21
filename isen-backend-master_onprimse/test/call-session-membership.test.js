'use strict';

const assert = require('assert');
const FakeSocket = require('./support/fake-socket');
const callSessions = require('../app/utils/callSessionStore');
const socketManager = require('../app/utils/socketManager');

describe('authoritative call session membership', function () {
  const callerId = '64b000000000000000000501';
  const calleeId = '64b000000000000000000502';
  const attackerId = '64b000000000000000000503';
  const otherCallerId = '64b000000000000000000504';
  const otherCalleeId = '64b000000000000000000505';
  const videoPath = require.resolve('../app/sockets/video');
  const pushPath = require.resolve('../app/services/videoCallPushService');
  const eventLoggerPath = require.resolve('../app/utils/eventLogger');

  let registerVideo;
  let originalVideoCache;
  let originalPush;
  let originalCreateCallRequest;
  let originalAppendCallLifecycle;
  let emitted;
  let pushes;

  function socketFor(userId, name) {
    const socket = new FakeSocket({ id: `membership-${name}`, userId });
    socketManager.connectedUsers.set(String(userId), new Set([socket.id]));
    registerVideo({
      to: socketId => ({
        emit: (event, payload) => emitted.push({ socketId, event, payload }),
      }),
    }, socket);
    return socket;
  }

  function ringing(callId, from = callerId, to = calleeId) {
    return callSessions.startRingingCall(from, to, callId, {
      expiresAt: Date.now() + 60_000,
      callerName: 'Caller Test',
      messageId: `message-${callId}`,
    });
  }

  function eventsFor(socketId, event) {
    return emitted.filter(item => item.socketId === socketId && item.event === event);
  }

  before(() => {
    const push = require(pushPath);
    const eventLogger = require(eventLoggerPath);

    originalPush = {
      sendIncomingVideoCallPush: push.sendIncomingVideoCallPush,
      sendVideoCallLifecyclePush: push.sendVideoCallLifecyclePush,
    };
    originalCreateCallRequest = eventLogger.createCallRequest;
    originalAppendCallLifecycle = eventLogger.appendCallLifecycle;

    push.sendIncomingVideoCallPush = async (...args) => {
      pushes.push({ type: 'incoming', args });
      return { successCount: 0, failureCount: 0 };
    };
    push.sendVideoCallLifecyclePush = async (...args) => {
      pushes.push({ type: 'lifecycle', args });
      return { successCount: 0, failureCount: 0 };
    };
    eventLogger.createCallRequest = async () => ({ callId: 'membership-generated' });
    eventLogger.appendCallLifecycle = async () => null;

    originalVideoCache = require.cache[videoPath];
    delete require.cache[videoPath];
    registerVideo = require(videoPath);
  });

  after(() => {
    const push = require(pushPath);
    const eventLogger = require(eventLoggerPath);
    push.sendIncomingVideoCallPush = originalPush.sendIncomingVideoCallPush;
    push.sendVideoCallLifecyclePush = originalPush.sendVideoCallLifecyclePush;
    eventLogger.createCallRequest = originalCreateCallRequest;
    eventLogger.appendCallLifecycle = originalAppendCallLifecycle;
    delete require.cache[videoPath];
    if (originalVideoCache) require.cache[videoPath] = originalVideoCache;
  });

  beforeEach(() => {
    callSessions.resetForTests();
    socketManager.connectedUsers.clear();
    socketManager.socketUserMap.clear();
    emitted = [];
    pushes = [];
  });

  afterEach(() => {
    callSessions.resetForTests();
  });

  it('allows the stored caller to cancel with the existing payload contract', async () => {
    const callId = 'membership-cancel-legitimate';
    ringing(callId);
    const caller = socketFor(callerId, 'cancel-caller');
    socketFor(calleeId, 'cancel-callee');

    await caller.trigger('cancel-video', {
      to: calleeId,
      callId,
      callerName: 'Caller Test',
      messageId: 'legacy-message',
    });

    assert.strictEqual(callSessions.getCallState(callId).state, 'cancel');
    assert.strictEqual(eventsFor('membership-cancel-callee', 'video-canceled').length, 1);
    assert.strictEqual(eventsFor('membership-cancel-caller', 'video-canceled').length, 1);
  });

  it('preserves legacy caller cancellation without callId using only server active membership', async () => {
    const callId = 'membership-cancel-legacy';
    ringing(callId);
    const caller = socketFor(callerId, 'cancel-legacy-caller');
    socketFor(calleeId, 'cancel-legacy-callee');

    await caller.trigger('cancel-video', calleeId);

    assert.strictEqual(callSessions.getCallState(callId).state, 'cancel');
    assert.strictEqual(eventsFor('membership-cancel-legacy-callee', 'video-canceled').length, 1);
  });

  it('rejects an unrelated user cancelling another call without state or signaling changes', async () => {
    const callId = 'membership-cancel-attacker';
    ringing(callId);
    socketFor(callerId, 'cancel-target-caller');
    socketFor(calleeId, 'cancel-target-callee');
    const attacker = socketFor(attackerId, 'cancel-attacker');

    await attacker.trigger('cancel-video', {
      from: callerId,
      to: calleeId,
      callId,
    });

    assert.deepStrictEqual(
      { state: callSessions.getCallState(callId).state, from: callSessions.getCallState(callId).from, to: callSessions.getCallState(callId).to },
      { state: 'ringing', from: callerId, to: calleeId }
    );
    assert.strictEqual(eventsFor('membership-cancel-target-caller', 'video-canceled').length, 0);
    assert.strictEqual(eventsFor('membership-cancel-target-callee', 'video-canceled').length, 0);
    assert.strictEqual(eventsFor('membership-cancel-target-caller', 'video-call-cancelled').length, 0);
    assert.strictEqual(eventsFor('membership-cancel-target-callee', 'video-call-cancelled').length, 0);
    assert.strictEqual(pushes.length, 0);
  });

  it('does not let the callee impersonate caller-only cancellation', async () => {
    const callId = 'membership-cancel-callee';
    ringing(callId);
    socketFor(callerId, 'cancel-role-caller');
    const callee = socketFor(calleeId, 'cancel-role-callee');

    await callee.trigger('cancel-video', {
      from: callerId,
      to: calleeId,
      callId,
    });

    assert.strictEqual(callSessions.getCallState(callId).state, 'ringing');
    assert.strictEqual(emitted.some(item => item.event === 'video-canceled'), false);
  });

  it('ignores forged cancellation participant identities and cannot redirect the stored caller', async () => {
    const callId = 'membership-cancel-forged';
    ringing(callId);
    const caller = socketFor(callerId, 'cancel-forged-caller');
    socketFor(calleeId, 'cancel-forged-callee');
    socketFor(attackerId, 'cancel-forged-attacker');

    await caller.trigger('cancel-video', {
      from: attackerId,
      to: attackerId,
      callId,
    });

    assert.strictEqual(callSessions.getCallState(callId).state, 'cancel');
    assert.strictEqual(eventsFor('membership-cancel-forged-callee', 'video-canceled').length, 1);
    assert.strictEqual(eventsFor('membership-cancel-forged-attacker', 'video-canceled').length, 0);
    const payload = eventsFor('membership-cancel-forged-callee', 'video-canceled')[0].payload;
    assert.strictEqual(payload.from, callerId);
    assert.strictEqual(payload.to, calleeId);
  });

  it('does not let a wrong callId mutate another call', async () => {
    const victimCallId = 'membership-wrong-victim';
    const otherCallId = 'membership-wrong-other';
    ringing(victimCallId);
    ringing(otherCallId, otherCallerId, otherCalleeId);
    const caller = socketFor(callerId, 'wrong-caller');
    socketFor(calleeId, 'wrong-callee');
    socketFor(otherCallerId, 'wrong-other-caller');
    socketFor(otherCalleeId, 'wrong-other-callee');

    await caller.trigger('cancel-video', { callId: otherCallId, to: otherCalleeId });

    assert.strictEqual(callSessions.getCallState(victimCallId).state, 'ringing');
    assert.strictEqual(callSessions.getCallState(otherCallId).state, 'ringing');
    assert.strictEqual(emitted.some(item => item.event === 'video-canceled'), false);
  });

  it('allows only the stored callee to accept and emits authoritative participants', async () => {
    const callId = 'membership-accept-legitimate';
    ringing(callId);
    socketFor(callerId, 'accept-caller');
    const callee = socketFor(calleeId, 'accept-callee');

    await callee.trigger('video-call-accepted', {
      from: attackerId,
      to: attackerId,
      callId,
      stage: 'ready',
      peerId: 'peer-callee',
    });

    assert.strictEqual(callSessions.getCallState(callId).state, 'accepted');
    const accepted = eventsFor('membership-accept-caller', 'video-call-accepted');
    assert.strictEqual(accepted.length, 1);
    assert.strictEqual(accepted[0].payload.from, callerId);
    assert.strictEqual(accepted[0].payload.to, calleeId);
    assert.strictEqual(accepted[0].payload.callId, callId);
    assert.strictEqual(accepted[0].payload.peerId, 'peer-callee');
  });

  it('preserves legacy callee acceptance without callId through server active membership', async () => {
    const callId = 'membership-accept-legacy';
    ringing(callId);
    socketFor(callerId, 'accept-legacy-caller');
    const callee = socketFor(calleeId, 'accept-legacy-callee');

    await callee.trigger('video-call-accepted', {
      from: callerId,
      to: calleeId,
      stage: 'ready',
    });

    assert.strictEqual(callSessions.getCallState(callId).state, 'accepted');
  });

  it('rejects caller self-accept and unrelated-user accept without false signaling', async () => {
    const callId = 'membership-accept-role';
    ringing(callId);
    const caller = socketFor(callerId, 'accept-role-caller');
    socketFor(calleeId, 'accept-role-callee');
    const attacker = socketFor(attackerId, 'accept-role-attacker');

    await caller.trigger('video-call-accepted', { from: callerId, to: callerId, callId });
    await attacker.trigger('video-call-accepted', { from: callerId, to: attackerId, callId });

    assert.strictEqual(callSessions.getCallState(callId).state, 'ringing');
    assert.strictEqual(emitted.some(item => item.event === 'video-call-accepted'), false);
    assert.strictEqual(pushes.length, 0);
  });

  it('rejects an accept carrying another session callId', async () => {
    const victimCallId = 'membership-accept-victim';
    const otherCallId = 'membership-accept-other';
    ringing(victimCallId);
    ringing(otherCallId, otherCallerId, otherCalleeId);
    socketFor(callerId, 'accept-wrong-caller');
    const callee = socketFor(calleeId, 'accept-wrong-callee');

    await callee.trigger('video-call-accepted', {
      from: otherCallerId,
      to: calleeId,
      callId: otherCallId,
      stage: 'ready',
    });

    assert.strictEqual(callSessions.getCallState(victimCallId).state, 'ringing');
    assert.strictEqual(callSessions.getCallState(otherCallId).state, 'ringing');
    assert.strictEqual(emitted.some(item => item.event === 'video-call-accepted'), false);
  });

  it('does not promote a terminal call back to accepted', async () => {
    const callId = 'membership-accept-terminal';
    ringing(callId);
    callSessions.setCallState(callId, 'declined', { from: callerId, to: calleeId, reason: 'declined' });
    socketFor(callerId, 'accept-terminal-caller');
    const callee = socketFor(calleeId, 'accept-terminal-callee');

    await callee.trigger('video-call-accepted', { from: callerId, to: calleeId, callId });

    assert.strictEqual(callSessions.getCallState(callId).state, 'declined');
    assert.strictEqual(emitted.some(item => item.event === 'video-call-accepted'), false);
  });

  it('allows only the stored callee to decline and ignores forged identities', async () => {
    const callId = 'membership-decline-legitimate';
    ringing(callId);
    socketFor(callerId, 'decline-caller');
    const callee = socketFor(calleeId, 'decline-callee');
    socketFor(attackerId, 'decline-attacker-target');

    await callee.trigger('video-call-declined', {
      from: attackerId,
      to: attackerId,
      callId,
    });

    assert.strictEqual(callSessions.getCallState(callId).state, 'declined');
    const declined = eventsFor('membership-decline-caller', 'video-call-declined');
    assert.strictEqual(declined.length, 1);
    assert.strictEqual(declined[0].payload.from, callerId);
    assert.strictEqual(declined[0].payload.to, calleeId);
    assert.strictEqual(eventsFor('membership-decline-attacker-target', 'video-call-declined').length, 0);
  });

  it('preserves legacy callee decline without callId through server active membership', async () => {
    const callId = 'membership-decline-legacy';
    ringing(callId);
    socketFor(callerId, 'decline-legacy-caller');
    const callee = socketFor(calleeId, 'decline-legacy-callee');

    await callee.trigger('video-call-declined', {
      from: callerId,
      to: calleeId,
    });

    assert.strictEqual(callSessions.getCallState(callId).state, 'declined');
    assert.strictEqual(eventsFor('membership-decline-legacy-caller', 'video-call-declined').length, 1);
  });

  it('rejects caller and unrelated-user decline without terminal signaling', async () => {
    const callId = 'membership-decline-role';
    ringing(callId);
    const caller = socketFor(callerId, 'decline-role-caller');
    socketFor(calleeId, 'decline-role-callee');
    const attacker = socketFor(attackerId, 'decline-role-attacker');

    await caller.trigger('video-call-declined', { from: callerId, to: callerId, callId });
    await attacker.trigger('video-call-declined', { from: callerId, to: attackerId, callId });

    assert.strictEqual(callSessions.getCallState(callId).state, 'ringing');
    assert.strictEqual(emitted.some(item => item.event === 'video-call-declined'), false);
    assert.strictEqual(pushes.length, 0);
  });

  it('handles a wrong decline callId safely', async () => {
    const victimCallId = 'membership-decline-victim';
    const otherCallId = 'membership-decline-other';
    ringing(victimCallId);
    ringing(otherCallId, otherCallerId, otherCalleeId);
    const callee = socketFor(calleeId, 'decline-wrong-callee');
    socketFor(callerId, 'decline-wrong-caller');

    await callee.trigger('video-call-declined', {
      from: otherCallerId,
      to: calleeId,
      callId: otherCallId,
    });

    assert.strictEqual(callSessions.getCallState(victimCallId).state, 'ringing');
    assert.strictEqual(callSessions.getCallState(otherCallId).state, 'ringing');
  });

  ['caller', 'receiver'].forEach(role => {
    it(`preserves legitimate ${role} hangup behavior`, async () => {
      const callId = `membership-${role}-hangup`;
      ringing(callId);
      callSessions.setCallState(callId, 'connected', { from: callerId, to: calleeId });
      const caller = socketFor(callerId, `${role}-hangup-caller`);
      const callee = socketFor(calleeId, `${role}-hangup-callee`);
      const actor = role === 'caller' ? caller : callee;

      await actor.trigger('video-call-ended', {
        from: callerId,
        to: calleeId,
        callId,
        reason: 'ended',
      });

      assert.strictEqual(callSessions.getCallState(callId).state, 'ended');
    });
  });
});
