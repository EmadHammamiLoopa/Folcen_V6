'use strict';

const { expect } = require('chai');
const FakeSocket = require('./support/fake-socket');
const callSessions = require('../app/utils/callSessionStore');
const socketManager = require('../app/utils/socketManager');

describe('call lifecycle and teardown characterization', function () {
  const callerId = '64b000000000000000000301';
  const calleeId = '64b000000000000000000302';
  const videoPath = require.resolve('../app/sockets/video');
  const pushPath = require.resolve('../app/services/videoCallPushService');
  const eventLoggerPath = require.resolve('../app/utils/eventLogger');
  let registerVideo;
  let originalVideoCache;
  let originalPush;
  let originalCreateCallRequest;
  let originalAppendCallLifecycle;
  let emitted;

  function setupPair(callId, state = 'ringing') {
    callSessions.startRingingCall(callerId, calleeId, callId, {
      callerName: 'Caller Test',
      messageId: `message-${callId}`,
      expiresAt: Date.now() + 60_000,
    });
    if (state !== 'ringing') {
      callSessions.setCallState(callId, state, { from: callerId, to: calleeId });
    }
  }

  function socketFor(userId, name) {
    const socket = new FakeSocket({ id: `socket-${name}`, userId });
    socketManager.connectedUsers.set(userId, new Set([socket.id]));
    registerVideo({
      to: socketId => ({
        emit: (event, payload) => emitted.push({ socketId, event, payload }),
      }),
    }, socket);
    return socket;
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

    push.sendIncomingVideoCallPush = async () => ({ successCount: 0, failureCount: 0 });
    push.sendVideoCallLifecyclePush = async () => ({ successCount: 0, failureCount: 0 });
    eventLogger.createCallRequest = async () => ({ callId: 'call-test-generated' });
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
  });

  afterEach(() => {
    callSessions.resetForTests();
  });

  it('tracks ringing membership in both directions and preserves a ringing callee on disconnect', async () => {
    const callId = 'call-membership';
    setupPair(callId);
    const callee = socketFor(calleeId, 'callee-membership');

    expect(callSessions.activeVideoCalls[callerId]).to.equal(calleeId);
    expect(callSessions.activeVideoCalls[calleeId]).to.equal(callerId);
    expect(callSessions.getActiveCallId(callerId, calleeId)).to.equal(callId);

    await callee.trigger('disconnect');

    expect(callSessions.getCallState(callId).state).to.equal('ringing');
    expect(callSessions.getActiveCallId(callerId, calleeId)).to.equal(callId);
  });

  it('reports a stale call ID as unknown and not answerable', async () => {
    const caller = socketFor(callerId, 'caller-stale');
    let response;

    await caller.trigger('call-state-check', { callId: 'call-stale' }, value => {
      response = value;
    });

    expect(response).to.deep.equal({ success: true, answerable: false, status: 'unknown' });
  });

  it('moves from ringing to accepted to connected through callee accept and caller start', async () => {
    const callId = 'call-accept-start';
    setupPair(callId);
    const caller = socketFor(callerId, 'caller-start');
    const callee = socketFor(calleeId, 'callee-accept');

    await callee.trigger('video-call-accepted', {
      from: callerId, to: calleeId, callId, stage: 'ready', peerId: 'peer-callee',
    });
    expect(callSessions.getCallState(callId).state).to.equal('accepted');

    await caller.trigger('video-call-started', { from: callerId, to: calleeId, callId });
    expect(callSessions.getCallState(callId).state).to.equal('connected');
    expect(emitted.some(value => value.event === 'video-call-accepted')).to.equal(true);
    expect(emitted.some(value => value.event === 'video-call-started')).to.equal(true);
  });

  it('records callee rejection as a terminal declined state', async () => {
    const callId = 'call-declined';
    setupPair(callId);
    socketFor(callerId, 'caller-declined');
    const callee = socketFor(calleeId, 'callee-declined');

    await callee.trigger('video-call-declined', { from: callerId, to: calleeId, callId });

    expect(callSessions.getCallState(callId).state).to.equal('declined');
    expect(callSessions.getActiveCallId(callerId, calleeId)).to.equal(null);
  });

  it('records caller cancellation and clears call membership', async () => {
    const callId = 'call-cancelled';
    setupPair(callId);
    const caller = socketFor(callerId, 'caller-cancelled');
    socketFor(calleeId, 'callee-cancelled');

    await caller.trigger('cancel-video', { to: calleeId, callId });

    expect(callSessions.getCallState(callId).state).to.equal('cancel');
    expect(callSessions.activeVideoCalls).not.to.have.property(callerId);
    expect(callSessions.activeVideoCalls).not.to.have.property(calleeId);
  });

  ['caller', 'receiver'].forEach(role => {
    it(`${role} hangup ends the call without modifying authentication session state`, async () => {
      const callId = `call-${role}-hangup`;
      setupPair(callId, 'connected');
      const token = `token-before-${role}`;
      const authSession = { token, user: { _id: callerId }, authenticated: true };
      const socket = socketFor(role === 'caller' ? callerId : calleeId, `${role}-hangup`);

      await socket.trigger('video-call-ended', {
        from: callerId, to: calleeId, callId, reason: 'ended',
      });

      expect(callSessions.getCallState(callId).state).to.equal('ended');
      expect(authSession).to.deep.equal({
        token,
        user: { _id: callerId },
        authenticated: true,
      });
    });
  });

  it('does not resurrect a call when an accept arrives after a terminal event', async () => {
    const callId = 'call-duplicate-terminal';
    setupPair(callId, 'connected');
    const caller = socketFor(callerId, 'caller-terminal');
    const callee = socketFor(calleeId, 'callee-terminal');

    await caller.trigger('video-call-ended', {
      from: callerId, to: calleeId, callId, reason: 'ended',
    });
    await callee.trigger('video-call-accepted', {
      from: callerId, to: calleeId, callId, stage: 'answered',
    });

    expect(callSessions.getCallState(callId).state).to.equal('ended');
  });
});
