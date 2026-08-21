'use strict';

const { expect } = require('chai');
const User = require('../app/models/User');
const Message = require('../app/models/Message');
const callSessions = require('../app/utils/callSessionStore');
const socketManager = require('../app/utils/socketManager');
const videoCallEligibility = require('../app/services/videoCallEligibility');
const FakeSocket = require('./support/fake-socket');

const callerId = '64b000000000000000000601';
const calleeId = '64b000000000000000000602';
const attackerId = '64b000000000000000000603';

function resolvedQuery(value) {
  return {
    select() { return this; },
    sort() { return this; },
    lean: async () => value,
  };
}

describe('call start authorization', () => {
  let originalUserFindById;
  let originalMessageFindOne;
  let originalEligibility;
  let emitted;
  let registerVideo;
  let videoPath;
  let originalPush;
  let pushCalls;

  before(() => {
    const push = require('../app/services/videoCallPushService');
    originalPush = {
      sendIncomingVideoCallPush: push.sendIncomingVideoCallPush,
      sendVideoCallLifecyclePush: push.sendVideoCallLifecyclePush,
    };
    push.sendIncomingVideoCallPush = async () => { pushCalls += 1; return {}; };
    push.sendVideoCallLifecyclePush = async () => { pushCalls += 1; return {}; };

    videoPath = require.resolve('../app/sockets/video');
    delete require.cache[videoPath];
    registerVideo = require(videoPath);
  });

  after(() => {
    const push = require('../app/services/videoCallPushService');
    push.sendIncomingVideoCallPush = originalPush.sendIncomingVideoCallPush;
    push.sendVideoCallLifecyclePush = originalPush.sendVideoCallLifecyclePush;
    delete require.cache[videoPath];
  });

  beforeEach(() => {
    originalUserFindById = User.findById;
    originalMessageFindOne = Message.findOne;
    originalEligibility = videoCallEligibility.getVideoCallEligibility;
    callSessions.resetForTests();
    socketManager.connectedUsers.clear();
    socketManager.socketUserMap.clear();
    emitted = [];
    pushCalls = 0;
  });

  afterEach(() => {
    User.findById = originalUserFindById;
    Message.findOne = originalMessageFindOne;
    videoCallEligibility.getVideoCallEligibility = originalEligibility;
    callSessions.resetForTests();
    socketManager.connectedUsers.clear();
    socketManager.socketUserMap.clear();
  });

  function registerSocket(userId, name = userId) {
    const socket = new FakeSocket({ id: `socket-${name}`, userId });
    socketManager.connectedUsers.set(String(userId), new Set([socket.id]));
    registerVideo({
      to: socketId => ({
        emit: (event, payload) => emitted.push({ socketId, event, payload }),
      }),
    }, socket);
    return socket;
  }

  function stubRelationships({ callerFriends = [], calleeFriends = [], permission = null } = {}) {
    User.findById = id => {
      const value = String(id) === callerId
        ? { _id: callerId, friends: callerFriends }
        : String(id) === calleeId
          ? { _id: calleeId, friends: calleeFriends }
          : null;
      return resolvedQuery(value);
    };
    Message.findOne = query => {
      stubRelationships.lastPermissionQuery = query;
      return resolvedQuery(permission);
    };
  }

  it('allows a legitimate friend call start', async () => {
    stubRelationships({ callerFriends: [calleeId] });

    const result = await videoCallEligibility.getVideoCallEligibility(callerId, calleeId);

    expect(result.allowed).to.equal(true);
    expect(result.isFriend).to.equal(true);
  });

  it('allows A -> B after B accepted A directional video permission', async () => {
    const permission = { _id: '64b000000000000000000699' };
    stubRelationships({ permission });

    const result = await videoCallEligibility.getVideoCallEligibility(callerId, calleeId);

    expect(result.allowed).to.equal(true);
    expect(result.persistentVideoPermission).to.equal(permission);
    expect(stubRelationships.lastPermissionQuery).to.include({
      type: 'video-call-request',
      status: 'accepted',
      from: callerId,
      to: calleeId,
    });
  });

  it('keeps accepted nonfriend video permission directional', async () => {
    User.findById = id => resolvedQuery({ _id: id, friends: [] });
    Message.findOne = query => resolvedQuery(
      query.from === callerId && query.to === calleeId
        ? { _id: '64b000000000000000000698' }
        : null
    );

    const forward = await videoCallEligibility.getVideoCallEligibility(callerId, calleeId);
    const reverse = await videoCallEligibility.getVideoCallEligibility(calleeId, callerId);

    expect(forward.allowed).to.equal(true);
    expect(reverse.allowed).to.equal(false);
    expect(reverse.code).to.equal('video_permission_required');
  });

  it('rejects an unauthorized nonfriend raw call start before session creation or signaling', async () => {
    videoCallEligibility.getVideoCallEligibility = async () => ({
      allowed: false,
      code: 'video_permission_required',
    });
    const socket = registerSocket(attackerId, 'unauthorized');
    socketManager.connectedUsers.set(calleeId, new Set(['socket-callee']));
    const callId = 'call-unauthorized-start';

    await socket.trigger('video-call-started', {
      from: callerId,
      to: calleeId,
      callId,
    });

    expect(callSessions.getCallState(callId)).to.equal(null);
    expect(callSessions.getActiveCallId(attackerId, calleeId)).to.equal(null);
    expect(emitted).to.deep.equal([]);
    expect(pushCalls).to.equal(0);
  });

  it('uses authenticated socket identity instead of a client supplied caller identity', async () => {
    videoCallEligibility.getVideoCallEligibility = async (from, to) => ({
      allowed: from === attackerId && to === calleeId,
    });
    const socket = registerSocket(attackerId, 'actor');
    socketManager.connectedUsers.set(calleeId, new Set(['socket-callee']));
    const callId = 'call-no-impersonation';

    await socket.trigger('video-call-started', {
      from: callerId,
      to: calleeId,
      callId,
    });

    const state = callSessions.getCallState(callId);
    expect(state).to.include({ from: attackerId, to: calleeId, state: 'ringing' });
    expect(emitted.some(item =>
      item.event === 'video-call-started' &&
      item.payload.from === attackerId &&
      item.payload.from !== callerId
    )).to.equal(true);
  });

  it('does not let an authorized actor reuse another call session id', async () => {
    videoCallEligibility.getVideoCallEligibility = async () => ({ allowed: true });
    const foreignCallId = 'call-owned-by-others';
    callSessions.startRingingCall(callerId, calleeId, foreignCallId, {
      expiresAt: Date.now() + 60_000,
    });
    const socket = registerSocket(attackerId, 'collision');

    await socket.trigger('video-call-started', {
      from: attackerId,
      to: calleeId,
      callId: foreignCallId,
    });

    expect(callSessions.getCallState(foreignCallId)).to.include({
      from: callerId,
      to: calleeId,
      state: 'ringing',
    });
    expect(emitted).to.deep.equal([]);
  });

  it('preserves the existing video-call-started payload and callId contract', async () => {
    videoCallEligibility.getVideoCallEligibility = async () => ({ allowed: true });
    const socket = registerSocket(callerId, 'caller');
    socketManager.connectedUsers.set(calleeId, new Set(['socket-callee']));
    const callId = 'call-contract';

    await socket.trigger('video-call-started', {
      from: callerId,
      to: calleeId,
      callId,
      myPeerId: 'legacy-peer-a',
      partnerPeerId: 'legacy-peer-b',
    });

    expect(callSessions.getCallState(callId)).to.include({
      from: callerId,
      to: calleeId,
      state: 'ringing',
      started: true,
    });
    expect(emitted.some(item =>
      item.event === 'video-call-started' &&
      item.payload.from === callerId &&
      item.payload.to === calleeId &&
      item.payload.callId === callId
    )).to.equal(true);
  });

  it('keeps a protected peer/wake session immediately compatible with started signaling', async () => {
    const callId = 'call-protected-peer-session';
    callSessions.startRingingCall(callerId, calleeId, callId, {
      source: 'peer-wake',
      expiresAt: Date.now() + 60_000,
    });
    videoCallEligibility.getVideoCallEligibility = async () => {
      throw new Error('protected session should not repeat the lookup');
    };
    const socket = registerSocket(callerId, 'protected');
    socketManager.connectedUsers.set(calleeId, new Set(['socket-callee']));

    await socket.trigger('video-call-started', { from: callerId, to: calleeId, callId });

    expect(callSessions.getCallState(callId)).to.include({
      from: callerId,
      to: calleeId,
      state: 'ringing',
      started: true,
    });
  });

  it('fails closed when the eligibility lookup errors', async () => {
    videoCallEligibility.getVideoCallEligibility = async () => {
      throw new Error('lookup failed');
    };
    const socket = registerSocket(callerId, 'lookup-error');
    const callId = 'call-lookup-error';

    await socket.trigger('video-call-started', { from: callerId, to: calleeId, callId });

    expect(callSessions.getCallState(callId)).to.equal(null);
    expect(emitted).to.deep.equal([]);
  });
});
