'use strict';

const { expect } = require('chai');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const helpers = require('../../app/helpers');
const User = require('../../app/models/User');
const Message = require('../../app/models/Message');
const Follow = require('../../app/models/Follow');

describe('P0 concurrent nonfriend opener security specification', function () {
  this.timeout(30000);

  const senderId = new mongoose.Types.ObjectId('64b000000000000000000501');
  const receiverId = new mongoose.Types.ObjectId('64b000000000000000000502');
  let mongod;

  function userData(id) {
    return {
      _id: id,
      firstName: `Audit-${String(id).slice(-3)}`,
      lastName: 'User',
      email: `${String(id)}@audit.example`,
      username: `audit-${String(id)}`,
      password: 'hashed',
      emailVerified: true,
      friends: [],
      blockedUsers: [],
    };
  }

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Message.deleteMany({}), Follow.deleteMany({})]);
    await User.create([userData(senderId), userData(receiverId)]);
  });

  it('SECURITY_SPEC concurrent normal opener checks reserve at most one opening message', async () => {
    const results = await Promise.all([
      helpers.canInitiateChat(senderId, receiverId),
      helpers.canInitiateChat(senderId, receiverId),
    ]);
    const allowed = results.filter(result => result.allowed).length;

    expect(
      allowed,
      'SECURITY_ASSERTION: The nonfriend opening-message decision must be atomic under concurrency.'
    ).to.be.at.most(1);
  });
});
