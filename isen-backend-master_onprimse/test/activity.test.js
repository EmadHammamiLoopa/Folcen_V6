const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Activity = require('../app/models/Activity');
const ActivityController = require('../app/controllers/ActivityController');

const assert = require('chai').assert;

describe('ActivityController visibility', function() {
  this.timeout(20000);
  let mongod;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await Activity.deleteMany({});
  });

  it('returns only public activities to strangers', async () => {
    // actor A creates public and private activities
    const actorA = mongoose.Types.ObjectId();
    await Activity.create({ type: 'post', actor: actorA, content: 'public', visibility: 'public' });
    await Activity.create({ type: 'post', actor: actorA, content: 'private', visibility: 'private' });

    const req = { query: { actorId: String(actorA) }, auth: { _id: mongoose.Types.ObjectId() }, authUser: { friends: [], followers: [] } };
    let jsonData = null;
    const res = { json: (payload) => (jsonData = payload) };
    await ActivityController.list(req, res);
    assert.isTrue(jsonData.success);
    assert.isArray(jsonData.data.docs);
    assert.equal(jsonData.data.docs.length, 1);
    assert.equal(jsonData.data.docs[0].content, 'public');
  });

  it('returns friends-only to friends', async () => {
    const actorA = mongoose.Types.ObjectId();
    await Activity.create({ type: 'post', actor: actorA, content: 'public', visibility: 'public' });
    await Activity.create({ type: 'post', actor: actorA, content: 'friends', visibility: 'friends-only' });

    // requester has friends list containing actorA
    const req = { query: { actorId: String(actorA) }, auth: { _id: mongoose.Types.ObjectId() }, authUser: { friends: [String(actorA)], followers: [] } };
    let jsonData = null;
    const res = { json: (payload) => (jsonData = payload) };
    await ActivityController.list(req, res);
    assert.isTrue(jsonData.success);
    assert.equal(jsonData.data.docs.length, 2);
  });

  it('returns all to actor himself', async () => {
    const actorA = mongoose.Types.ObjectId();
    await Activity.create({ type: 'post', actor: actorA, content: 'public', visibility: 'public' });
    await Activity.create({ type: 'post', actor: actorA, content: 'private', visibility: 'private' });

    const req = { query: { actorId: String(actorA) }, auth: { _id: String(actorA) }, authUser: { friends: [], followers: [] } };
    let jsonData = null;
    const res = { json: (payload) => (jsonData = payload) };
    await ActivityController.list(req, res);
    assert.isTrue(jsonData.success);
    assert.equal(jsonData.data.docs.length, 2);
  });
});
