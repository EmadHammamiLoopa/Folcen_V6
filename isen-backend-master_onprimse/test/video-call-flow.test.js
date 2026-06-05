const assert = require('assert');
const mongoose = require('mongoose');

describe('video call request flow', function () {
  this.timeout(20000);

  const callerId = '64b000000000000000000001';
  const calleeId = '64b000000000000000000002';

  afterEach(function () {
    const { connectedUsers } = require('../app/utils/socketManager');
    connectedUsers.clear();
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
    } finally {
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
});
