'use strict';

const { expect } = require('chai');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const helpers = require('../app/helpers');
const User = require('../app/models/User');
const Message = require('../app/models/Message');
const Follow = require('../app/models/Follow');
const ChatOpeningLease = require('../app/models/ChatOpeningLease');

describe('normal messaging policy characterization', function () {
  this.timeout(30000);

  const senderId = new mongoose.Types.ObjectId('64b000000000000000000101');
  const receiverId = new mongoose.Types.ObjectId('64b000000000000000000102');
  const otherIds = [
    new mongoose.Types.ObjectId('64b000000000000000000103'),
    new mongoose.Types.ObjectId('64b000000000000000000104'),
    new mongoose.Types.ObjectId('64b000000000000000000105'),
  ];
  let mongod;

  const userData = (id, extra = {}) => ({
    _id: id,
    firstName: `User-${String(id).slice(-3)}`,
    lastName: 'Test',
    email: `${String(id)}@example.test`,
    username: `user-${String(id)}`,
    password: 'hashed',
    emailVerified: true,
    friends: [],
    blockedUsers: [],
    ...extra,
  });

  async function addNormalMessage(from, to, type = 'text') {
    return Message.create({ from, to, text: `${type} message`, type });
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
    await Promise.all([User.deleteMany({}), Message.deleteMany({}), Follow.deleteMany({}), ChatOpeningLease.deleteMany({})]);
    await User.create([
      userData(senderId),
      userData(receiverId),
      ...otherIds.map(id => userData(id)),
    ]);
  });

  it('allows unrestricted normal messaging between friends', async () => {
    await User.updateOne({ _id: senderId }, { $set: { friends: [receiverId] } });
    await addNormalMessage(senderId, receiverId, 'text');

    const result = await helpers.canInitiateChat(senderId, receiverId);

    expect(result.allowed).to.equal(true);
    expect(result.budgetRemaining).to.equal(Infinity);
  });

  it('allows one opening normal message to a public non-friend', async () => {
    const result = await helpers.canInitiateChat(senderId, receiverId);

    expect(result).to.include({ allowed: true, reason: null, budgetRemaining: 3 });
  });

  it('blocks a second normal message until the public non-friend replies', async () => {
    await addNormalMessage(senderId, receiverId, 'text');

    const result = await helpers.canInitiateChat(senderId, receiverId);

    expect(result).to.include({ allowed: false, reason: 'awaiting_reply' });
  });

  it('allows the receiver to send the normal reply', async () => {
    await addNormalMessage(senderId, receiverId, 'text');

    const result = await helpers.canInitiateChat(receiverId, senderId);

    expect(result.allowed).to.equal(true);
  });

  it('a normal reply unlocks subsequent normal messages', async () => {
    await addNormalMessage(senderId, receiverId, 'text');
    await addNormalMessage(receiverId, senderId, 'image');

    const result = await helpers.canInitiateChat(senderId, receiverId);

    expect(result.allowed).to.equal(true);
    expect(result.budgetRemaining).to.equal(Infinity);
  });

  it('requires an active follow before opening a private non-friend chat', async () => {
    await User.updateOne({ _id: receiverId }, { $set: { isPrivate: true } });

    const result = await helpers.canInitiateChat(senderId, receiverId);

    expect(result).to.include({ allowed: false, reason: 'privacy_restricted' });
  });

  it('allows a private non-friend opener after an active follow', async () => {
    await User.updateOne({ _id: receiverId }, { $set: { isPrivate: true } });
    await Follow.create({ follower: senderId, followed: receiverId, status: 'active' });

    const result = await helpers.canInitiateChat(senderId, receiverId);

    expect(result.allowed).to.equal(true);
  });

  it('keeps reply-first enforcement after the private-account follow requirement is met', async () => {
    await User.updateOne({ _id: receiverId }, { $set: { isPrivate: true } });
    await Follow.create({ follower: senderId, followed: receiverId, status: 'active' });
    await addNormalMessage(senderId, receiverId, 'text');

    const result = await helpers.canInitiateChat(senderId, receiverId);

    expect(result).to.include({ allowed: false, reason: 'awaiting_reply' });
  });

  ['text', 'image', 'video'].forEach(type => {
    it(`${type} counts as the one normal opening message`, async () => {
      await addNormalMessage(senderId, receiverId, type);

      const result = await helpers.canInitiateChat(senderId, receiverId);

      expect(result).to.include({ allowed: false, reason: 'awaiting_reply' });
    });
  });

  it('video-call-request does not count as the normal opener', async () => {
    await Message.create({
      from: senderId, to: receiverId, text: 'video permission',
      type: 'video-call-request', status: 'pending',
    });

    const result = await helpers.canInitiateChat(senderId, receiverId);

    expect(result).to.include({ allowed: true, budgetRemaining: 3 });
  });

  it('video-call-request does not count as a normal reply or unlock text', async () => {
    await addNormalMessage(senderId, receiverId, 'text');
    await Message.create({
      from: receiverId, to: senderId, text: 'video permission',
      type: 'video-call-request', status: 'accepted',
    });

    const result = await helpers.canInitiateChat(senderId, receiverId);

    expect(result).to.include({ allowed: false, reason: 'awaiting_reply' });
  });

  it('preserves the three-unique-recipient opening budget for standard users', async () => {
    for (const recipient of otherIds) await addNormalMessage(senderId, recipient, 'text');

    const result = await helpers.canInitiateChat(senderId, receiverId);

    expect(result).to.include({ allowed: false, reason: 'budget_exhausted', budgetRemaining: 0 });
  });

  it('does not charge video permission requests against the opening budget', async () => {
    for (const recipient of otherIds) {
      await Message.create({
        from: senderId, to: recipient, text: 'video permission',
        type: 'video-call-request', status: 'pending',
      });
    }

    const result = await helpers.canInitiateChat(senderId, receiverId);

    expect(result).to.include({ allowed: true, budgetRemaining: 3 });
  });

  it('premium removes the recipient budget but does not remove reply-first enforcement', async () => {
    await User.updateOne({ _id: senderId }, {
      $set: {
        subscription: {
          _id: new mongoose.Types.ObjectId(),
          expireDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      },
    });
    for (const recipient of otherIds) await addNormalMessage(senderId, recipient, 'text');

    const first = await helpers.canInitiateChat(senderId, receiverId);
    await addNormalMessage(senderId, receiverId, 'text');
    const second = await helpers.canInitiateChat(senderId, receiverId);

    expect(first).to.include({ allowed: true, budgetRemaining: Infinity });
    expect(second).to.include({ allowed: false, reason: 'awaiting_reply' });
  });
});
