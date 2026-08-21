'use strict';

const fs = require('fs');
const path = require('path');
const { expect } = require('chai');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const helpers = require('../app/helpers');
const User = require('../app/models/User');
const Message = require('../app/models/Message');
const Follow = require('../app/models/Follow');
const ChatOpeningLease = require('../app/models/ChatOpeningLease');
const MessageController = require('../app/controllers/MessageController');
const registerChatSocket = require('../app/sockets/chat');
const socketManager = require('../app/utils/socketManager');

describe('atomic nonfriend opener reservation', function () {
  this.timeout(30000);

  const senderId = new mongoose.Types.ObjectId('64b000000000000000000601');
  const receiverId = new mongoose.Types.ObjectId('64b000000000000000000602');
  const recipientIds = Array.from({ length: 8 }, (_, index) =>
    new mongoose.Types.ObjectId(`64b0000000000000000006${String(index + 3).padStart(2, '0')}`)
  );
  let mongod;

  function userData(id, extra = {}) {
    return {
      _id: id,
      firstName: `Atomic-${String(id).slice(-3)}`,
      lastName: 'User',
      email: `${String(id)}@atomic.example`,
      username: `atomic-${String(id)}`,
      password: 'hashed',
      emailVerified: true,
      friends: [],
      blockedUsers: [],
      ...extra,
    };
  }

  function fakeRes() {
    return {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return payload;
      },
    };
  }

  function fakeSocket(userId) {
    return {
      id: `socket-${String(userId)}`,
      userId: String(userId),
      handlers: {},
      outgoing: [],
      on(event, handler) {
        this.handlers[event] = handler;
      },
      emit(event, payload) {
        this.outgoing.push({ event, payload });
      },
      async trigger(event, ...args) {
        if (!this.handlers[event]) throw new Error(`missing socket handler: ${event}`);
        return this.handlers[event](...args);
      },
      disconnect() {},
    };
  }

  function fakeIo() {
    return {
      emitted: [],
      to(socketId) {
        return {
          emit: (event, payload) => {
            this.emitted.push({ socketId, event, payload });
          },
        };
      },
      emit(event, payload) {
        this.emitted.push({ socketId: null, event, payload });
      },
    };
  }

  async function persistNormal(from, to, type = 'text') {
    const policy = await helpers.canInitiateChat(from, to);
    if (!policy.allowed) return { policy, message: null };

    let message;
    try {
      message = await Message.create({
        from,
        to,
        text: `${type} message`,
        type,
      });
    } catch (err) {
      if (policy.openingReservationToken) {
        await helpers.releaseChatOpeningReservation(
          from,
          to,
          policy.openingReservationToken
        );
      }
      throw err;
    }

    if (policy.openingReservationToken) {
      await helpers.finalizeChatOpeningReservation(
        from,
        to,
        policy.openingReservationToken,
        message.createdAt
      );
    }

    return { policy, message };
  }

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    await ChatOpeningLease.syncIndexes();
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Message.deleteMany({}),
      Follow.deleteMany({}),
      ChatOpeningLease.deleteMany({}),
    ]);
    socketManager.connectedUsers.clear();
    await User.create([
      userData(senderId),
      userData(receiverId),
      ...recipientIds.map(id => userData(id)),
    ]);
  });

  it('keeps read-only permission previews from consuming the opening slot', async () => {
    const previews = await Promise.all([
      helpers.canInitiateChatPreview(senderId, receiverId),
      helpers.canInitiateChatPreview(senderId, receiverId),
    ]);
    expect(previews.every(result => result.allowed)).to.equal(true);

    const acquired = await helpers.canInitiateChat(senderId, receiverId);
    expect(acquired.allowed).to.equal(true);
    expect(acquired.openingReservationToken).to.be.a('string');
  });

  it('allows at most one of two concurrent public first text openers', async () => {
    const results = await Promise.all([
      helpers.canInitiateChat(senderId, receiverId),
      helpers.canInitiateChat(senderId, receiverId),
    ]);

    expect(results.filter(result => result.allowed)).to.have.length(1);
    expect(results.filter(result => !result.allowed)[0].reason).to.equal('awaiting_reply');
  });

  it('allows at most one of ten simultaneous first openers to the same recipient', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => helpers.canInitiateChat(senderId, receiverId))
    );

    expect(results.filter(result => result.allowed)).to.have.length(1);
  });

  for (const type of ['image', 'video']) {
    it(`${type} participates in the same opener reservation`, async () => {
      const first = await persistNormal(senderId, receiverId, type);
      const second = await helpers.canInitiateChat(senderId, receiverId);

      expect(first.policy.allowed).to.equal(true);
      expect(first.message.type).to.equal(type);
      expect(second).to.include({ allowed: false, reason: 'awaiting_reply' });
    });
  }

  it('video-call-request does not consume or reserve the normal opener', async () => {
    await Message.create({
      from: senderId,
      to: receiverId,
      text: 'video permission',
      type: 'video-call-request',
      status: 'pending',
    });

    const preview = await helpers.canInitiateChatPreview(senderId, receiverId);
    const firstNormal = await helpers.canInitiateChat(senderId, receiverId);

    expect(preview).to.include({ allowed: true, budgetRemaining: 3 });
    expect(firstNormal.allowed).to.equal(true);
    expect(firstNormal.openingReservationToken).to.be.a('string');
  });

  it('a receiver normal reply unlocks subsequent sender messages', async () => {
    await persistNormal(senderId, receiverId, 'text');
    const reply = await persistNormal(receiverId, senderId, 'image');
    const afterReply = await helpers.canInitiateChat(senderId, receiverId);

    expect(reply.policy.allowed).to.equal(true);
    expect(afterReply.allowed).to.equal(true);
    expect(afterReply.budgetRemaining).to.equal(Infinity);
  });

  it('a receiver video-call-request does not unlock normal messaging', async () => {
    await persistNormal(senderId, receiverId, 'text');
    await Message.create({
      from: receiverId,
      to: senderId,
      text: 'video permission',
      type: 'video-call-request',
      status: 'pending',
    });

    const result = await helpers.canInitiateChat(senderId, receiverId);
    expect(result).to.include({ allowed: false, reason: 'awaiting_reply' });
  });

  it('keeps a private nonfriend blocked without an active follow', async () => {
    await User.updateOne({ _id: receiverId }, { $set: { isPrivate: true } });

    const results = await Promise.all([
      helpers.canInitiateChat(senderId, receiverId),
      helpers.canInitiateChat(senderId, receiverId),
    ]);

    expect(results.every(result => !result.allowed)).to.equal(true);
    expect(results.every(result => result.reason === 'privacy_restricted')).to.equal(true);
  });

  it('allows exactly one private-nonfriend opener with an active follow', async () => {
    await User.updateOne({ _id: receiverId }, { $set: { isPrivate: true } });
    await Follow.create({ follower: senderId, followed: receiverId, status: 'active' });

    const results = await Promise.all(
      Array.from({ length: 8 }, () => helpers.canInitiateChat(senderId, receiverId))
    );

    expect(results.filter(result => result.allowed)).to.have.length(1);
  });

  it('keeps friends unrestricted under concurrency', async () => {
    await Promise.all([
      User.updateOne({ _id: senderId }, { $set: { friends: [receiverId] } }),
      User.updateOne({ _id: receiverId }, { $set: { friends: [senderId] } }),
    ]);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => helpers.canInitiateChat(senderId, receiverId))
    );

    expect(results.every(result => result.allowed)).to.equal(true);
    expect(results.every(result => result.budgetRemaining === Infinity)).to.equal(true);
  });

  it('allows three different concurrent opening recipients for a standard user', async () => {
    const results = await Promise.all(
      recipientIds.slice(0, 3).map(id => helpers.canInitiateChat(senderId, id))
    );

    expect(results.filter(result => result.allowed)).to.have.length(3);
    const state = await ChatOpeningLease.findOne({ sender: senderId }).lean();
    expect(new Set(state.leases.map(lease => String(lease.receiver))).size).to.equal(3);
  });

  it('counts concurrent duplicates to one recipient only once toward the three-recipient budget', async () => {
    const duplicates = await Promise.all(
      Array.from({ length: 8 }, () => helpers.canInitiateChat(senderId, receiverId))
    );
    expect(duplicates.filter(result => result.allowed)).to.have.length(1);

    const nextTwo = await Promise.all([
      helpers.canInitiateChat(senderId, recipientIds[0]),
      helpers.canInitiateChat(senderId, recipientIds[1]),
    ]);
    expect(nextTwo.filter(result => result.allowed)).to.have.length(2);

    const fourth = await helpers.canInitiateChat(senderId, recipientIds[2]);
    expect(fourth).to.include({ allowed: false, reason: 'budget_exhausted', budgetRemaining: 0 });
  });

  it('atomically serializes the final standard recipient slot across different receivers', async () => {
    await Message.create([
      {
        from: senderId,
        to: recipientIds[0],
        text: 'historical opener one',
        type: 'text',
      },
      {
        from: senderId,
        to: recipientIds[1],
        text: 'historical opener two',
        type: 'text',
      },
    ]);

    const results = await Promise.all([
      helpers.canInitiateChat(senderId, recipientIds[2]),
      helpers.canInitiateChat(senderId, recipientIds[3]),
    ]);

    const allowed = results.filter(result => result.allowed);
    const blocked = results.filter(result => !result.allowed);

    expect(allowed).to.have.length(1);
    expect(blocked).to.have.length(1);
    expect(blocked[0]).to.include({
      allowed: false,
      reason: 'budget_exhausted',
      budgetRemaining: 0,
    });

    const state = await ChatOpeningLease.findOne({
      sender: senderId,
    }).lean();

    expect(state).to.not.equal(null);

    const racedRecipients = new Set([
      String(recipientIds[2]),
      String(recipientIds[3]),
    ]);

    const acquired = state.leases
      .map(lease => String(lease.receiver))
      .filter(receiver => racedRecipients.has(receiver));

    expect(acquired).to.have.length(1);

    const losingRecipient =
      acquired[0] === String(recipientIds[2])
        ? recipientIds[3]
        : recipientIds[2];

    const retry = await helpers.canInitiateChat(
      senderId,
      losingRecipient
    );

    expect(retry).to.include({
      allowed: false,
      reason: 'budget_exhausted',
      budgetRemaining: 0,
    });
  });

  it('blocks a standard user fourth unique opening recipient', async () => {
    const firstThree = await Promise.all(
      recipientIds.slice(0, 3).map(id => helpers.canInitiateChat(senderId, id))
    );
    expect(firstThree.every(result => result.allowed)).to.equal(true);

    const fourth = await helpers.canInitiateChat(senderId, recipientIds[3]);
    expect(fourth).to.include({ allowed: false, reason: 'budget_exhausted', budgetRemaining: 0 });
  });

  it('preserves premium unlimited-recipient behavior while keeping one opener per pair', async () => {
    await User.updateOne({ _id: senderId }, {
      $set: {
        subscription: {
          _id: new mongoose.Types.ObjectId(),
          expireDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      },
    });

    const distinct = await Promise.all(
      recipientIds.slice(0, 6).map(id => helpers.canInitiateChat(senderId, id))
    );
    expect(distinct.every(result => result.allowed)).to.equal(true);
    expect(distinct.every(result => result.budgetRemaining === Infinity)).to.equal(true);

    const duplicate = await helpers.canInitiateChat(senderId, recipientIds[0]);
    expect(duplicate).to.include({ allowed: false, reason: 'awaiting_reply' });
  });

  it('releases the acquired opener when REST message persistence fails', async () => {
    const originalCreate = Message.create;
    Message.create = async () => {
      throw new Error('forced persistence failure');
    };

    try {
      const res = fakeRes();
      await MessageController.storeMessage({
        auth: { _id: senderId },
        body: { to: String(receiverId), text: 'first opener', type: 'text' },
      }, res);

      expect(res.statusCode).to.equal(500);
    } finally {
      Message.create = originalCreate;
    }

    const retry = await helpers.canInitiateChat(senderId, receiverId);
    expect(retry.allowed).to.equal(true);
  });

  it('does not release a consumed opener when delivery fails after REST persistence', async () => {
    const originalEmit = helpers.emitToUser;
    helpers.emitToUser = async () => {
      throw new Error('forced socket delivery failure');
    };

    try {
      const res = fakeRes();
      await MessageController.storeMessage({
        auth: { _id: senderId },
        body: { to: String(receiverId), text: 'persisted opener', type: 'text' },
      }, res);

      expect(res.statusCode).to.equal(500);
      expect(await Message.exists({ from: senderId, to: receiverId, type: 'text' })).to.not.equal(null);
    } finally {
      helpers.emitToUser = originalEmit;
    }

    const duplicate = await helpers.canInitiateChat(senderId, receiverId);
    expect(duplicate).to.include({ allowed: false, reason: 'awaiting_reply' });
  });

  it('prevents REST and Socket.IO from independently acquiring the same first opener', async () => {
    const controllerSource = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'controllers', 'MessageController.js'),
      'utf8'
    );
    const socketSource = fs.readFileSync(
      path.join(__dirname, '..', 'app', 'sockets', 'chat.js'),
      'utf8'
    );

    expect(controllerSource).to.match(/helpers\.canInitiateChat\(senderId, recipientId\)/);
    expect(socketSource).to.match(/helpers\.canInitiateChat\(senderId, msg\.to\)/);

    const originalSendNotification = helpers.sendNotification;
    const originalEmitToUser = helpers.emitToUser;
    helpers.sendNotification = async () => ({ successCount: 0, failureCount: 0 });
    helpers.emitToUser = async () => false;

    const socket = fakeSocket(senderId);
    registerChatSocket(fakeIo(), socket);
    const restRes = fakeRes();

    try {
      await Promise.all([
        MessageController.storeMessage({
          auth: { _id: senderId },
          body: { to: String(receiverId), text: 'REST opener', type: 'text' },
        }, restRes),
        socket.trigger('send-message', {
          id: 'socket-temp-1',
          to: String(receiverId),
          text: 'Socket opener',
          type: 'text',
        }),
      ]);
    } finally {
      helpers.sendNotification = originalSendNotification;
      helpers.emitToUser = originalEmitToUser;
    }

    const persisted = await Message.find({
      from: senderId,
      to: receiverId,
      type: { $ne: 'video-call-request' },
    }).lean();
    expect(persisted).to.have.length(1);

    const restSucceeded = restRes.body?.success === true;
    const socketSucceeded = socket.outgoing.some(entry => entry.event === 'message-sent');
    expect(Number(restSucceeded) + Number(socketSucceeded)).to.equal(1);
  });

  it('preserves retry behavior if the only persisted normal opener is deleted', async () => {
    const first = await persistNormal(senderId, receiverId, 'text');
    expect(first.policy.allowed).to.equal(true);

    const res = fakeRes();
    await MessageController.deleteMessage({
      auth: { _id: senderId },
      params: { messageId: String(first.message._id) },
    }, res);

    expect(res.statusCode).to.equal(200);
    expect(await Message.findById(first.message._id)).to.equal(null);

    const retry = await helpers.canInitiateChat(senderId, receiverId);
    expect(retry.allowed).to.equal(true);
  });
});
