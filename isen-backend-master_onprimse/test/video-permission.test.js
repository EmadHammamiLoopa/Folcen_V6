'use strict';

const { expect } = require('chai');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const FakeSocket = require('./support/fake-socket');
const helpers = require('../app/helpers');
const User = require('../app/models/User');
const Message = require('../app/models/Message');

describe('directional video permission characterization', function () {
  this.timeout(30000);

  const aliceId = new mongoose.Types.ObjectId('64b000000000000000000201');
  const bobId = new mongoose.Types.ObjectId('64b000000000000000000202');
  const chatPath = require.resolve('../app/sockets/chat');
  const fcmPath = require.resolve('../app/services/fcmPushService');
  let mongod;
  let registerChat;
  let originalChatCache;
  let originalSendPushToUser;

  const userData = (id, firstName) => ({
    _id: id,
    firstName,
    lastName: 'Test',
    email: `${String(id)}@example.test`,
    hashed_password: 'test-only',
    emailVerified: true,
    friends: [],
    messages: [],
    allowVideoRequestsFromNonFriends: true,
  });

  const io = {
    to: () => ({ emit: () => {} }),
    emit: () => {},
  };

  function socketFor(userId, suffix) {
    const socket = new FakeSocket({ id: `socket-${suffix}`, userId: String(userId) });
    registerChat(io, socket);
    return socket;
  }

  async function emitAck(socket, event, data) {
    let response;
    await socket.trigger(event, data, value => { response = value; });
    return response;
  }

  async function requestPermission(socket, to = bobId) {
    return emitAck(socket, 'video-call-request', {
      requestOnly: true,
      to: String(to),
      text: 'Video permission request',
      messageId: `temp-${Date.now()}-${Math.random()}`,
    });
  }

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    const fcmPushService = require(fcmPath);
    originalSendPushToUser = fcmPushService.sendPushToUser;
    fcmPushService.sendPushToUser = async () => ({ successCount: 0, failureCount: 0 });

    originalChatCache = require.cache[chatPath];
    delete require.cache[chatPath];
    registerChat = require(chatPath);
  });

  after(async () => {
    const fcmPushService = require(fcmPath);
    fcmPushService.sendPushToUser = originalSendPushToUser;
    delete require.cache[chatPath];
    if (originalChatCache) require.cache[chatPath] = originalChatCache;

    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Message.deleteMany({})]);
    await User.create([
      userData(aliceId, 'Alice'),
      userData(bobId, 'Bob'),
    ]);
  });

  it('persists a pending request in the A to B direction', async () => {
    const response = await requestPermission(socketFor(aliceId, 'alice-request'));
    const saved = await Message.findById(response.messageId).lean();

    expect(response.success).to.equal(true);
    expect(saved).to.include({ type: 'video-call-request', status: 'pending' });
    expect(String(saved.from)).to.equal(String(aliceId));
    expect(String(saved.to)).to.equal(String(bobId));
  });

  it('reports a sequential duplicate as the existing pending request', async () => {
    const socket = socketFor(aliceId, 'alice-duplicate');
    const first = await requestPermission(socket);
    const second = await requestPermission(socket);

    expect(first.success).to.equal(true);
    expect(second).to.include({ success: false, error: 'request_pending' });
    expect(String(second.messageId)).to.equal(String(first.messageId));
    expect(await Message.countDocuments({ type: 'video-call-request' })).to.equal(1);
  });

  it('LEGACY_CHARACTERIZATION observes concurrent duplicate requests creating two records', async () => {
    const firstSocket = socketFor(aliceId, 'alice-concurrent-one');
    const secondSocket = socketFor(aliceId, 'alice-concurrent-two');
    const originalFindOne = Message.findOne;

    // Force the race interleaving deterministically: both handlers complete
    // their pending-request preflight before either write becomes visible.
    // The production path has no atomic reservation or unique constraint, so
    // both handlers then persist a request.
    Message.findOne = function (query) {
      if (
        query?.type === 'video-call-request' &&
        query?.status === 'pending'
      ) {
        return {
          sort: () => ({
            select: () => ({ lean: async () => null }),
          }),
        };
      }
      return originalFindOne.apply(this, arguments);
    };

    let responses;
    try {
      responses = await Promise.all([
        requestPermission(firstSocket),
        requestPermission(secondSocket),
      ]);
    } finally {
      Message.findOne = originalFindOne;
    }

    expect(responses.filter(result => result?.success)).to.have.length(2);
    expect(await Message.countDocuments({
      from: aliceId,
      to: bobId,
      type: 'video-call-request',
      status: 'pending',
    })).to.equal(2);
  });

  it('allows only recipient B to accept A to B permission', async () => {
    const requested = await requestPermission(socketFor(aliceId, 'alice-accept'));
    const response = await emitAck(socketFor(bobId, 'bob-accept'), 'video-call-accepted', {
      messageId: String(requested.messageId),
    });
    const saved = await Message.findById(requested.messageId).lean();

    expect(response).to.include({ success: true, status: 'accepted' });
    expect(saved.status).to.equal('accepted');
  });

  it('allows recipient B to reject a pending A to B request', async () => {
    const requested = await requestPermission(socketFor(aliceId, 'alice-reject'));
    const response = await emitAck(socketFor(bobId, 'bob-reject'), 'video-call-cancelled', {
      messageId: String(requested.messageId),
      status: 'rejected',
      reason: 'rejected',
    });

    expect(response).to.include({ success: true, status: 'rejected' });
    expect((await Message.findById(requested.messageId).lean()).status).to.equal('rejected');
  });

  it('allows recipient B to revoke an accepted A to B permission', async () => {
    const requested = await requestPermission(socketFor(aliceId, 'alice-revoke'));
    await emitAck(socketFor(bobId, 'bob-accept-revoke'), 'video-call-accepted', {
      messageId: String(requested.messageId),
    });
    const response = await emitAck(socketFor(bobId, 'bob-revoke'), 'video-call-cancelled', {
      messageId: String(requested.messageId),
      status: 'revoked',
      reason: 'revoked',
    });

    expect(response).to.include({ success: true, status: 'revoked' });
    expect((await Message.findById(requested.messageId).lean()).status).to.equal('revoked');
  });

  it('keeps an accepted permission persistent after video-call-used', async () => {
    const requested = await requestPermission(socketFor(aliceId, 'alice-use'));
    await emitAck(socketFor(bobId, 'bob-accept-use'), 'video-call-accepted', {
      messageId: String(requested.messageId),
    });

    await socketFor(aliceId, 'alice-used').trigger('video-call-used', {
      messageId: String(requested.messageId),
    });

    expect((await Message.findById(requested.messageId).lean()).status).to.equal('accepted');
  });

  it('does not grant reverse B to A permission when A to B is accepted', async () => {
    const requested = await requestPermission(socketFor(aliceId, 'alice-direction'));
    await emitAck(socketFor(bobId, 'bob-direction'), 'video-call-accepted', {
      messageId: String(requested.messageId),
    });

    const forward = await emitAck(socketFor(aliceId, 'alice-state'), 'video-call-permission-state', {
      peerId: String(bobId),
    });
    const reverse = await emitAck(socketFor(bobId, 'bob-state'), 'video-call-permission-state', {
      peerId: String(aliceId),
    });

    expect(forward.outgoing).to.include({ status: 'accepted' });
    expect(reverse.outgoing).to.equal(null);
    expect(reverse.incomingAccepted).to.include({ status: 'accepted' });
  });

  it('accepted video permission does not unlock a second normal text message', async () => {
    const requested = await requestPermission(socketFor(aliceId, 'alice-text-lock'));
    await emitAck(socketFor(bobId, 'bob-text-lock'), 'video-call-accepted', {
      messageId: String(requested.messageId),
    });
    await Message.create({ from: aliceId, to: bobId, text: 'normal opener', type: 'text' });

    const result = await helpers.canInitiateChat(aliceId, bobId);

    expect(result).to.include({ allowed: false, reason: 'awaiting_reply' });
  });

  it('an incoming video permission request does not count as a normal reply', async () => {
    await Message.create({ from: aliceId, to: bobId, text: 'normal opener', type: 'text' });
    await requestPermission(socketFor(bobId, 'bob-video-reply'), aliceId);

    const result = await helpers.canInitiateChat(aliceId, bobId);

    expect(result).to.include({ allowed: false, reason: 'awaiting_reply' });
  });
});
