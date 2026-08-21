'use strict';

const { expect } = require('chai');
const FakeSocket = require('../support/fake-socket');
const callSessions = require('../../app/utils/callSessionStore');
const socketManager = require('../../app/utils/socketManager');
const videoCallEligibility = require('../../app/services/videoCallEligibility');

describe('P0 call signaling authorization security specifications', () => {
  const callerId = '64b000000000000000000401';
  const calleeId = '64b000000000000000000402';
  const attackerId = '64b000000000000000000403';
  const videoPath = require.resolve('../../app/sockets/video');
  const pushPath = require.resolve('../../app/services/videoCallPushService');
  const eventLoggerPath = require.resolve('../../app/utils/eventLogger');
  let registerVideo;
  let originalVideoCache;
  let originalPush;
  let originalCreateCallRequest;
  let originalAppendCallLifecycle;
  let originalGetVideoCallEligibility;
  let emitted;

  function socketFor(userId, name) {
    const socket = new FakeSocket({ id: `audit-${name}`, userId });
    socketManager.connectedUsers.set(userId, new Set([socket.id]));
    registerVideo({
      to: socketId => ({
        emit: (event, payload) => emitted.push({ socketId, event, payload }),
      }),
    }, socket);
    return socket;
  }

  function ringing(callId) {
    callSessions.startRingingCall(callerId, calleeId, callId, {
      expiresAt: Date.now() + 60_000,
    });
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
    originalGetVideoCallEligibility = videoCallEligibility.getVideoCallEligibility;
    push.sendIncomingVideoCallPush = async () => ({ successCount: 0, failureCount: 0 });
    push.sendVideoCallLifecyclePush = async () => ({ successCount: 0, failureCount: 0 });
    eventLogger.createCallRequest = async () => ({ callId: 'audit-call-generated' });
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
    videoCallEligibility.getVideoCallEligibility = originalGetVideoCallEligibility;
    delete require.cache[videoPath];
    if (originalVideoCache) require.cache[videoPath] = originalVideoCache;
  });

  beforeEach(() => {
    callSessions.resetForTests();
    socketManager.connectedUsers.clear();
    socketManager.socketUserMap.clear();
    emitted = [];
    videoCallEligibility.getVideoCallEligibility = originalGetVideoCallEligibility;
  });

  afterEach(() => {
    callSessions.resetForTests();
  });

  it('SECURITY_SPEC raw call start requires friendship or accepted directional permission', async () => {
    const callId = 'audit-unauthorized-start';
    const attacker = socketFor(attackerId, 'raw-start');
    videoCallEligibility.getVideoCallEligibility = async () => ({
      allowed: false,
      code: 'video_permission_required',
    });

    await attacker.trigger('video-call-started', { from: callerId, to: calleeId, callId });

    expect(
      callSessions.getCallState(callId),
      'SECURITY_ASSERTION: An unauthorized socket must not create an authoritative call session.'
    ).to.equal(null);
  });

  it('SECURITY_SPEC a nonparticipant cannot cancel another user call', async () => {
    const callId = 'audit-nonparticipant-cancel';
    ringing(callId);
    socketFor(calleeId, 'cancel-target');
    const attacker = socketFor(attackerId, 'cancel-attacker');

    await attacker.trigger('cancel-video', { to: calleeId, callId });

    const targetSocket = 'audit-cancel-target';
    expect(
      emitted.some(item => item.socketId === targetSocket && item.event === 'video-canceled'),
      'SECURITY_ASSERTION: A socket outside the call session must not emit cancellation to a participant.'
    ).to.equal(false);
  });

  it('SECURITY_SPEC a nonparticipant cannot accept another user call', async () => {
    const callId = 'audit-nonparticipant-accept';
    ringing(callId);
    const attacker = socketFor(attackerId, 'accept-attacker');

    await attacker.trigger('video-call-accepted', {
      from: callerId,
      to: attackerId,
      callId,
      stage: 'ready',
    });

    expect(
      callSessions.getCallState(callId),
      'SECURITY_ASSERTION: Acceptance must be limited to the callee recorded in the call session.'
    ).to.include({ state: 'ringing', from: callerId, to: calleeId });
  });

  it('SECURITY_SPEC a nonparticipant cannot decline another user call', async () => {
    const callId = 'audit-nonparticipant-decline';
    ringing(callId);
    const attacker = socketFor(attackerId, 'decline-attacker');

    await attacker.trigger('video-call-declined', {
      from: callerId,
      to: attackerId,
      callId,
    });

    expect(
      callSessions.getCallState(callId),
      'SECURITY_ASSERTION: Decline must be limited to the callee recorded in the call session.'
    ).to.include({ state: 'ringing', from: callerId, to: calleeId });
  });
});
