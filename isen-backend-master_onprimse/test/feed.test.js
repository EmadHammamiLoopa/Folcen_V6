const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const chai = require('chai');
const expect = chai.expect;

const User = require('../app/models/User');
const Follow = require('../app/models/Follow');
const Channel = require('../app/models/Channel');
const Post = require('../app/models/Post');
const PostController = require('../app/controllers/PostController');
const Response = require('../app/controllers/Response');

// Helper to call controller and capture JSON response
function makeRes() {
  let out = null;
  return {
    json: (payload) => { out = payload; },
    status: function() { return this; },
    get body() { return out; }
  };
}

function makeReq(authUser, query = {}) {
  return {
    auth: { _id: authUser._id },
    authUser,
    query
  };
}

describe('Feed scenarios', function() {
  this.timeout(20000);
  let mongoServer;

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  });

  after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Follow.deleteMany({}),
      Channel.deleteMany({}),
      Post.deleteMany({})
    ]);
  });

  it('shows followed user public post to follower', async () => {
    const viewer = await User.create({ firstName: 'Viewer', lastName: 'One' });
    const author = await User.create({ firstName: 'Author', lastName: 'Two' });
    await Follow.create({ follower: viewer._id, followed: author._id, status: 'active' });

    const channel = await Channel.create({ name: 'General', followers: [] });

    const post = await Post.create({ text: 'Hello world', user: author._id, channel: channel._id, anonyme: false, visibility: 'public', moderationStatus: 'approved' });

    const req = makeReq(viewer);
    const res = makeRes();

    await PostController.getFeed(req, res);

    const docs = res.body && res.body.data && res.body.data.docs;
    expect(docs).to.be.an('array');
    const found = docs.some(p => p.text === 'Hello world');
    expect(found).to.equal(true);
  });

  it('shows followers-only post to follower', async () => {
    const viewer = await User.create({ firstName: 'Viewer', lastName: 'One' });
    const author = await User.create({ firstName: 'Author', lastName: 'Two' });
    await Follow.create({ follower: viewer._id, followed: author._id, status: 'active' });

    const channel = await Channel.create({ name: 'General', followers: [] });

    const post = await Post.create({ text: 'Followers only', user: author._id, channel: channel._id, anonyme: false, visibility: 'followers-only', moderationStatus: 'approved' });

    const req = makeReq(viewer);
    const res = makeRes();

    await PostController.getFeed(req, res);

    const docs = res.body && res.body.data && res.body.data.docs;
    expect(docs.some(p => p.text === 'Followers only')).to.equal(true);
  });

  it('does not show anonymous post from followed user to follower', async () => {
    const viewer = await User.create({ firstName: 'Viewer', lastName: 'One' });
    const author = await User.create({ firstName: 'Author', lastName: 'Two' });
    await Follow.create({ follower: viewer._id, followed: author._id, status: 'active' });

    const channel = await Channel.create({ name: 'General', followers: [] });

    const post = await Post.create({ text: 'Secret', user: author._id, channel: channel._id, anonyme: true, visibility: 'public', moderationStatus: 'approved' });

    const req = makeReq(viewer);
    const res = makeRes();

    await PostController.getFeed(req, res);

    const docs = res.body && res.body.data && res.body.data.docs;
    expect(docs.some(p => p.text === 'Secret')).to.equal(false);
  });

  it('does not show blocked user posts', async () => {
    const viewer = await User.create({ firstName: 'Viewer', lastName: 'One', blockedUsers: [] });
    const author = await User.create({ firstName: 'Author', lastName: 'Two' });
    // author blocks viewer
    author.blockedUsers = [viewer._id];
    await author.save();

    const channel = await Channel.create({ name: 'General', followers: [] });
    const post = await Post.create({ text: 'Blocked post', user: author._id, channel: channel._id, anonyme: false, visibility: 'public', moderationStatus: 'approved' });

    const req = makeReq(viewer);
    const res = makeRes();

    await PostController.getFeed(req, res);

    const docs = res.body && res.body.data && res.body.data.docs;
    expect(docs.some(p => p.text === 'Blocked post')).to.equal(false);
  });

});
