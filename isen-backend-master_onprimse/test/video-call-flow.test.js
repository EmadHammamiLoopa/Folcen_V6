const assert = require('assert');
const mongoose = require('mongoose');

describe('video call request flow', function () {
  this.timeout(20000);

  const callerId = '64b000000000000000000001';
  const calleeId = '64b000000000000000000002';

  afterEach(function () {
    const { connectedUsers } = require('../app/utils/socketManager');
    connectedUsers.clear();
    require('../app/utils/callSessionStore').resetForTests();
  });

  it('emits a structured incoming call invite to an online receiver', async function () {
    const helpers = require('../app/helpers');
    const { connectedUsers } = require('../app/utils/socketManager');
    const emitted = [];
    const io = { to: sid => ({ emit: (event, payload) => emitted.push({ sid, event, payload }) }) };

    helpers.initSocket(io);
    connectedUsers.set(calleeId, new Set(['callee-socket']));

    helpers.notifyPeerNeeded(calleeId, callerId, {
      callId: 'call-test-1',
      callType: 'video',
      callerName: 'Caller One',
      callerAvatar: '/avatar.webp'
    });

    const invite = emitted.find(e => e.event === 'call:invite');
    assert.ok(invite, 'call:invite should be emitted to online receiver');
    assert.strictEqual(invite.sid, 'callee-socket');
    assert.strictEqual(invite.payload.callId, 'call-test-1');
    assert.strictEqual(invite.payload.callerId, callerId);
    assert.strictEqual(invite.payload.receiverId, calleeId);
    assert.strictEqual(invite.payload.type, 'incoming_call');
    assert.strictEqual(invite.payload.status, 'ringing');
    assert.ok(emitted.some(e => e.event === 'incoming-call'));
    assert.ok(emitted.some(e => e.event === 'called'));
  });

  it('sends structured high-priority call push when receiver is offline', async function () {
    const pushSvc = require('../app/utils/pushService');
    const helpers = require('../app/helpers');
    const originalSendPush = pushSvc.sendPush;
    let push;

    pushSvc.sendPush = (userId, payload) => {
      push = { userId, payload };
      return Promise.resolve();
    };

    try {
      helpers.notifyPeerNeeded(calleeId, callerId, {
        callId: 'call-test-offline',
        callerName: 'Caller One'
      });

      assert.strictEqual(push.userId, calleeId);
      assert.strictEqual(push.payload.data.type, 'incoming_call');
      assert.strictEqual(push.payload.data.category, 'call');
      assert.strictEqual(push.payload.data.callId, 'call-test-offline');
      assert.strictEqual(push.payload.data.callerId, callerId);
      assert.strictEqual(push.payload.android.priority, 'high');
      assert.strictEqual(push.payload.android.notification.channelId, 'calls');
      assert.strictEqual(push.payload.android.ttl, 90 * 1000);
      assert.ok(Number(push.payload.data.expiresAt) - Number(push.payload.data.timestamp) >= 90 * 1000);
    } finally {
      pushSvc.sendPush = originalSendPush;
    }
  });

  it('creates an answerable ringing session from peer wake push and accepts by payload callId', async function () {
    const User = require('../app/models/User');
    const peerStore = require('../app/utils/peerStorage');
    const pushSvc = require('../app/utils/pushService');
    const router = require('../routes/user');
    const callSessions = require('../app/utils/callSessionStore');
    const registerVideoSocket = require('../app/sockets/video');

    const originalFindById = User.findById;
    const originalPeerGet = peerStore.get;
    const originalSendPush = pushSvc.sendPush;
    let pushCount = 0;

    User.findById = id => ({
      select: () => ({
        lean: async () => ({
          _id: id,
          firstName: String(id) === callerId ? 'Caller' : 'Callee',
          lastName: 'One',
          emailVerified: true,
          isEmailVerified: true,
          friends: [String(id) === callerId ? calleeId : callerId]
        })
      })
    });
    peerStore.get = async () => null;
    pushSvc.sendPush = () => { pushCount += 1; return Promise.resolve(); };

    const req = {
      params: { userId: calleeId },
      query: { wake: '1', callId: 'call-peer-wake-1', callType: 'video' },
      auth: { _id: callerId },
      authUser: { _id: callerId, firstName: 'Caller', lastName: 'One', friends: [calleeId] }
    };
    let body;
    let resolveResponse;
    let resolveRoute;
    const responsePromise = new Promise(resolve => { resolveResponse = resolve; });
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(value) { body = value; resolveResponse(value); if (resolveRoute) resolveRoute(value); return value; }
    };

    try {
      const peerLayer = router.stack.find(layer => layer.route && layer.route.path === '/:userId/peer' && layer.route.methods.get);
      const stack = peerLayer.route.stack;
      await new Promise((resolve, reject) => {
        resolveRoute = resolve;
        const run = index => {
          if (index >= stack.length) return resolve();
          try {
            const ret = stack[index].handle(req, res, err => err ? reject(err) : run(index + 1));
            if (ret && typeof ret.catch === 'function') ret.catch(reject);
          } catch (err) {
            reject(err);
          }
        };
        run(0);
      });
      await responsePromise;
      assert.deepStrictEqual(body, { success: true, peerId: null });
      assert.strictEqual(pushCount, 1, 'peer wake should send exactly one push for the first lookup');

      const state = callSessions.getCallState('call-peer-wake-1');
      assert.ok(state, 'wake push should register a backend call session');
      assert.strictEqual(state.status, 'ringing');
      assert.strictEqual(state.from, callerId);
      assert.strictEqual(state.to, calleeId);

      const emitted = [];
      const socket = { id: 'callee-socket', userId: calleeId, handlers: {}, on(event, handler) { this.handlers[event] = handler; } };
      const io = { to: sid => ({ emit: (event, payload) => emitted.push({ sid, event, payload }) }) };
      const { connectedUsers } = require('../app/utils/socketManager');
      connectedUsers.set(callerId, new Set(['caller-socket']));
      connectedUsers.set(calleeId, new Set(['callee-socket']));
      registerVideoSocket(io, socket);

      let beforeAccept;
      socket.handlers['call-state-check']({ callId: 'call-peer-wake-1' }, value => { beforeAccept = value; });
      assert.strictEqual(beforeAccept.answerable, true);
      assert.strictEqual(beforeAccept.status, 'ringing');

      socket.handlers['video-call-accepted']({ from: callerId, to: calleeId, callId: 'call-peer-wake-1' });
      let afterAccept;
      socket.handlers['call-state-check']({ callId: 'call-peer-wake-1' }, value => { afterAccept = value; });
      assert.strictEqual(afterAccept.answerable, false);
      assert.strictEqual(afterAccept.status, 'connected');
      assert.ok(emitted.some(e => e.event === 'video-call-accepted' && e.payload.callId === 'call-peer-wake-1'));
    } finally {
      User.findById = originalFindById;
      peerStore.get = originalPeerGet;
      pushSvc.sendPush = originalSendPush;
    }
  });
  it('does not treat non-friend request messages as real ringing calls', async function () {
    const registerVideoSocket = require('../app/sockets/video');
    const socket = {
      userId: callerId,
      handlers: {},
      on(event, handler) { this.handlers[event] = handler; }
    };
    const emitted = [];
    const io = { to: () => ({ emit: (event, payload) => emitted.push({ event, payload }) }) };

    registerVideoSocket(io, socket);

    let ackCalled = false;
    await socket.handlers['video-call-request']({ requestOnly: true, to: calleeId }, () => {
      ackCalled = true;
    });

    assert.strictEqual(ackCalled, false);
    assert.deepStrictEqual(emitted, []);
  });

  it('acks and emits request-only video messages from chat immediately', async function () {
    const Message = require('../app/models/Message');
    const User = require('../app/models/User');
    const { connectedUsers } = require('../app/utils/socketManager');
    const registerChatSocket = require('../app/sockets/chat');

    const originalUpdateMany = Message.updateMany;
    const originalSave = Message.prototype.save;
    const originalFindById = User.findById;
    const originalFindByIdAndUpdate = User.findByIdAndUpdate;

    Message.updateMany = async () => ({ modifiedCount: 0 });
    Message.prototype.save = async function () {
      this._id = new mongoose.Types.ObjectId('64b000000000000000000099');
      return this;
    };
    User.findById = id => ({
      select: () => ({
        lean: async () => ({
          _id: id,
          firstName: String(id) === callerId ? 'Caller' : 'Callee',
          lastName: 'One',
          friends: [],
          allowVideoRequestsFromNonFriends: true
        })
      })
    });
    User.findByIdAndUpdate = async () => ({});

    connectedUsers.set(callerId, new Set(['caller-socket']));
    connectedUsers.set(calleeId, new Set(['callee-socket']));

    const socket = {
      id: 'caller-socket',
      userId: callerId,
      handlers: {},
      on(event, handler) { this.handlers[event] = handler; }
    };
    const emitted = [];
    const io = { to: sid => ({ emit: (event, payload) => emitted.push({ sid, event, payload }) }) };

    try {
      registerChatSocket(io, socket);

      let ack;
      await socket.handlers['video-call-request']({
        requestOnly: true,
        to: calleeId,
        text: 'A requested a video call.',
        messageId: 'temp-1'
      }, value => { ack = value; });

      assert.strictEqual(ack.success, true);
      assert.ok(String(ack.messageId));
      assert.ok(emitted.some(e => e.sid === 'callee-socket' && e.event === 'new-message'));
      assert.ok(emitted.some(e => e.sid === 'caller-socket' && e.event === 'message-sent' && e.payload.tempId === 'temp-1'));
    } finally {
      Message.updateMany = originalUpdateMany;
      Message.prototype.save = originalSave;
      User.findById = originalFindById;
      User.findByIdAndUpdate = originalFindByIdAndUpdate;
    }
  });

  it('rejects non-friend video requests when the receiver disables them', async function () {
    const Message = require('../app/models/Message');
    const User = require('../app/models/User');
    const registerChatSocket = require('../app/sockets/chat');

    const originalUpdateMany = Message.updateMany;
    const originalFindById = User.findById;

    let wroteMessage = false;
    Message.updateMany = async () => { wroteMessage = true; return { modifiedCount: 0 }; };
    User.findById = id => ({
      select: () => ({
        lean: async () => ({
          _id: id,
          firstName: String(id) === callerId ? 'Caller' : 'Callee',
          lastName: 'One',
          friends: [],
          allowVideoRequestsFromNonFriends: String(id) === calleeId ? false : true
        })
      })
    });

    const socket = {
      id: 'caller-socket',
      userId: callerId,
      handlers: {},
      on(event, handler) { this.handlers[event] = handler; }
    };
    const io = { to: () => ({ emit: () => {} }) };

    try {
      registerChatSocket(io, socket);

      let ack;
      await socket.handlers['video-call-request']({
        requestOnly: true,
        to: calleeId,
        text: 'A requested a video call.',
        messageId: 'temp-disabled'
      }, value => { ack = value; });

      assert.strictEqual(ack.success, false);
      assert.strictEqual(ack.error, 'video_requests_disabled');
      assert.strictEqual(wroteMessage, false);
    } finally {
      Message.updateMany = originalUpdateMany;
      User.findById = originalFindById;
    }
  });

  it('marks an accepted one-time video request used when either participant starts it', async function () {
    const Message = require('../app/models/Message');
    const { connectedUsers } = require('../app/utils/socketManager');
    const registerChatSocket = require('../app/sockets/chat');

    const originalFindOneAndUpdate = Message.findOneAndUpdate;
    let query;
    Message.findOneAndUpdate = async (q) => {
      query = q;
      return {
        id: '64b000000000000000000099',
        _id: new mongoose.Types.ObjectId('64b000000000000000000099'),
        from: new mongoose.Types.ObjectId(callerId),
        to: new mongoose.Types.ObjectId(calleeId),
        status: 'used'
      };
    };

    connectedUsers.set(callerId, new Set(['caller-socket']));
    connectedUsers.set(calleeId, new Set(['callee-socket']));

    const emitted = [];
    const socket = {
      id: 'callee-socket',
      userId: calleeId,
      handlers: {},
      on(event, handler) { this.handlers[event] = handler; }
    };
    const io = { to: sid => ({ emit: (event, payload) => emitted.push({ sid, event, payload }) }) };

    try {
      registerChatSocket(io, socket);
      await socket.handlers['video-call-used']({ messageId: '64b000000000000000000099' });

      assert.strictEqual(query.type, 'video-call-request');
      assert.strictEqual(query.status, 'accepted');
      assert.deepStrictEqual(query.$or.map(item => Object.keys(item)[0]).sort(), ['from', 'to']);
      assert.ok(emitted.some(e => e.sid === 'caller-socket' && e.event === 'video-call-used'));
      assert.ok(emitted.some(e => e.sid === 'callee-socket' && e.event === 'video-call-used'));
    } finally {
      Message.findOneAndUpdate = originalFindOneAndUpdate;
    }
  });

  it('rejects request-only video messages without emitting real-call missed cleanup', async function () {
    const Message = require('../app/models/Message');
    const { connectedUsers } = require('../app/utils/socketManager');
    const registerChatSocket = require('../app/sockets/chat');

    const originalFindByIdAndUpdate = Message.findByIdAndUpdate;
    Message.findByIdAndUpdate = async () => ({
      id: '64b000000000000000000099',
      _id: new mongoose.Types.ObjectId('64b000000000000000000099'),
      from: new mongoose.Types.ObjectId(callerId),
      to: new mongoose.Types.ObjectId(calleeId),
      type: 'video-call-request',
      status: 'rejected'
    });

    connectedUsers.set(callerId, new Set(['caller-socket']));
    connectedUsers.set(calleeId, new Set(['callee-socket']));

    const emitted = [];
    const socket = {
      id: 'callee-socket',
      userId: calleeId,
      handlers: {},
      on(event, handler) { this.handlers[event] = handler; }
    };
    const io = { to: sid => ({ emit: (event, payload) => emitted.push({ sid, event, payload }) }) };

    try {
      registerChatSocket(io, socket);
      await socket.handlers['video-call-cancelled']({
        from: calleeId,
        to: callerId,
        messageId: '64b000000000000000000099',
        status: 'rejected',
        reason: 'rejected'
      });

      assert.ok(emitted.some(e => e.event === 'video-call-cancelled' && e.payload.status === 'rejected'));
      assert.ok(!emitted.some(e => e.event === 'video-canceled'));
      assert.ok(!emitted.some(e => e.event === 'missed-call'));
    } finally {
      Message.findByIdAndUpdate = originalFindByIdAndUpdate;
    }
  });

  it('keeps caller and receiver in ringing state until the receiver accepts', async function () {
    const Message = require('../app/models/Message');
    const User = require('../app/models/User');
    const eventLogger = require('../app/utils/eventLogger');
    const { connectedUsers } = require('../app/utils/socketManager');
    const videoPath = require.resolve('../app/sockets/video');

    const originalFindById = User.findById;
    const originalSave = Message.prototype.save;
    const originalCreateCallRequest = eventLogger.createCallRequest;
    const originalAppendCallLifecycle = eventLogger.appendCallLifecycle;
    delete require.cache[videoPath];

    User.findById = async id => ({ _id: id, friends: [String(id) === callerId ? calleeId : callerId] });
    Message.prototype.save = async function () { return this; };
    eventLogger.createCallRequest = async () => ({ callId: 'call-state-1' });
    eventLogger.appendCallLifecycle = async () => {};

    connectedUsers.set(callerId, new Set(['caller-socket']));
    connectedUsers.set(calleeId, new Set(['callee-socket']));

    const emitted = [];
    const socket = {
      id: 'caller-socket',
      userId: callerId,
      handlers: {},
      on(event, handler) { this.handlers[event] = handler; }
    };
    const io = { to: sid => ({ emit: (event, payload) => emitted.push({ sid, event, payload }) }) };

    try {
      const registerVideoSocket = require('../app/sockets/video');
      registerVideoSocket(io, socket);

      let requestAck;
      await socket.handlers['video-call-request']({
        to: calleeId,
        text: 'Call me',
        messageId: 'call-message-1'
      }, value => { requestAck = value; });

      assert.strictEqual(requestAck.success, true);
      assert.strictEqual(requestAck.callId, 'call-state-1');

      socket.handlers['video-call-started']({ from: callerId, to: calleeId });

      let stateAfterStarted;
      socket.handlers['call-state-check']({ callId: 'call-state-1' }, value => { stateAfterStarted = value; });
      assert.strictEqual(stateAfterStarted.status, 'ringing');
      assert.strictEqual(stateAfterStarted.answerable, true);

      socket.userId = calleeId;
      socket.handlers['video-call-accepted']({ from: callerId, to: calleeId });

      let stateAfterAccepted;
      socket.handlers['call-state-check']({ callId: 'call-state-1' }, value => { stateAfterAccepted = value; });
      assert.strictEqual(stateAfterAccepted.status, 'connected');
      assert.strictEqual(stateAfterAccepted.answerable, false);
      assert.ok(emitted.some(e => e.event === 'video-call-accepted'));
    } finally {
      User.findById = originalFindById;
      Message.prototype.save = originalSave;
      eventLogger.createCallRequest = originalCreateCallRequest;
      eventLogger.appendCallLifecycle = originalAppendCallLifecycle;
      delete require.cache[videoPath];
    }
  });

  it('rejects non-friend peer lookup without an accepted one-time video request', async function () {
    const User = require('../app/models/User');
    const peerStore = require('../app/utils/peerStorage');
    const router = require('../routes/user');
    const originalFindById = User.findById;
    const originalPeerGet = peerStore.get;

    let peerLookupCalled = false;
    User.findById = id => ({
      select: () => ({
        lean: async () => ({ _id: id, friends: [] })
      })
    });
    peerStore.get = async () => {
      peerLookupCalled = true;
      return { peerId: 'should-not-return' };
    };

    try {
      const layer = router.stack.find(item => item.route?.path === '/:userId/peer' && item.route?.methods?.get);
      const handler = layer.route.stack[layer.route.stack.length - 1].handle;
      let statusCode = 200;
      let body;
      await handler(
        { params: { userId: calleeId }, query: {}, auth: { _id: callerId }, authUser: { _id: callerId } },
        { status(code) { statusCode = code; return this; }, json(value) { body = value; return value; } },
        err => { throw err; }
      );

      assert.strictEqual(statusCode, 403);
      assert.strictEqual(body.code, 'not_friends');
      assert.strictEqual(peerLookupCalled, false);
    } finally {
      User.findById = originalFindById;
      peerStore.get = originalPeerGet;
    }
  });

  it('allows non-friend peer lookup only with an accepted one-time video request', async function () {
    const Message = require('../app/models/Message');
    const User = require('../app/models/User');
    const peerStore = require('../app/utils/peerStorage');
    const router = require('../routes/user');
    const originalFindById = User.findById;
    const originalFindOne = Message.findOne;
    const originalPeerGet = peerStore.get;

    User.findById = id => ({
      select: () => ({
        lean: async () => ({ _id: id, friends: [] })
      })
    });
    Message.findOne = query => ({
      select: () => ({
        lean: async () => {
          assert.strictEqual(String(query._id), '64b000000000000000000099');
          assert.strictEqual(query.status, 'accepted');
          return { _id: query._id };
        }
      })
    });
    peerStore.get = async () => ({ peerId: `${calleeId}-peer-live` });

    try {
      const layer = router.stack.find(item => item.route?.path === '/:userId/peer' && item.route?.methods?.get);
      const handler = layer.route.stack[layer.route.stack.length - 1].handle;
      let body;
      await handler(
        {
          params: { userId: calleeId },
          query: { videoRequestId: '64b000000000000000000099' },
          auth: { _id: callerId },
          authUser: { _id: callerId }
        },
        { status() { return this; }, json(value) { body = value; return value; } },
        err => { throw err; }
      );

      assert.strictEqual(body.success, true);
      assert.strictEqual(body.peerId, `${calleeId}-peer-live`);
    } finally {
      User.findById = originalFindById;
      Message.findOne = originalFindOne;
      peerStore.get = originalPeerGet;
    }
  });

  it('allows peer lookup when either side still has the friendship during sync', async function () {
    const User = require('../app/models/User');
    const peerStore = require('../app/utils/peerStorage');
    const router = require('../routes/user');
    const originalFindById = User.findById;
    const originalPeerGet = peerStore.get;

    User.findById = id => ({
      select: () => ({
        lean: async () => ({
          _id: id,
          friends: String(id) === callerId ? [calleeId] : []
        })
      })
    });
    peerStore.get = async () => ({ peerId: `${calleeId}-peer-live` });

    try {
      const layer = router.stack.find(item => item.route?.path === '/:userId/peer' && item.route?.methods?.get);
      const handler = layer.route.stack[layer.route.stack.length - 1].handle;
      let body;
      await handler(
        { params: { userId: calleeId }, query: {}, auth: { _id: callerId }, authUser: { _id: callerId } },
        { status() { return this; }, json(value) { body = value; return value; } },
        err => { throw err; }
      );

      assert.strictEqual(body.success, true);
      assert.strictEqual(body.peerId, `${calleeId}-peer-live`);
    } finally {
      User.findById = originalFindById;
      peerStore.get = originalPeerGet;
    }
  });
});

