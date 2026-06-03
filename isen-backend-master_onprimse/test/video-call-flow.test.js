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
    const originalFindByIdAndUpdate = User.findByIdAndUpdate;

    Message.updateMany = async () => ({ modifiedCount: 0 });
    Message.prototype.save = async function () {
      this._id = new mongoose.Types.ObjectId('64b000000000000000000099');
      return this;
    };
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
      User.findByIdAndUpdate = originalFindByIdAndUpdate;
    }
  });
});
