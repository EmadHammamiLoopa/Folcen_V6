'use strict';

const { expect } = require('chai');
const fs = require('fs');
const User = require('../app/models/User');
const UserController = require('../app/controllers/UserController');

describe('avatar mutation authorization', () => {
  const ownerId = '64b000000000000000000001';
  const otherId = '64b000000000000000000002';
  let originalFindById;
  let originalStoreAvatar;
  let originalAccess;
  let originalUnlink;

  function userDocument(id = ownerId) {
    return {
      _id: id,
      avatar: ['/uploads/first.png', '/uploads/second.png'],
      mainAvatar: '/uploads/first.png',
      async save() {},
      publicInfo() {
        return { _id: this._id, avatar: [...this.avatar], mainAvatar: this.mainAvatar };
      },
    };
  }

  function queryResult(user) {
    return {
      populate: async () => user,
      then(resolve, reject) {
        return Promise.resolve(user).then(resolve, reject);
      },
    };
  }

  function response() {
    return {
      statusCode: 200,
      body: undefined,
      status(code) { this.statusCode = code; return this; },
      send(payload) { this.body = payload; return payload; },
      json(payload) { this.body = payload; return payload; },
    };
  }

  function request({ actorId = ownerId, role = 'USER', targetId = ownerId, body = {}, file } = {}) {
    return {
      params: { userId: targetId },
      body,
      file,
      authUser: { _id: actorId, role },
      protocol: 'https',
      get: () => 'folcen.test',
      app: { get: () => null },
    };
  }

  beforeEach(() => {
    originalFindById = User.findById;
    originalStoreAvatar = UserController.storeAvatar;
    originalAccess = fs.promises.access;
    originalUnlink = fs.promises.unlink;
  });

  afterEach(() => {
    User.findById = originalFindById;
    UserController.storeAvatar = originalStoreAvatar;
    fs.promises.access = originalAccess;
    fs.promises.unlink = originalUnlink;
  });

  it('allows a user to select their own main avatar', async () => {
    const user = userDocument();
    User.findById = id => {
      expect(String(id)).to.equal(ownerId);
      return queryResult(user);
    };
    const res = response();

    await UserController.updateMainAvatar(
      request({ body: { avatarUrl: '/uploads/second.png' } }),
      res
    );

    expect(res.statusCode).to.equal(200);
    expect(user.mainAvatar).to.equal('/uploads/second.png');
  });

  it('allows a user to add to their own avatar list', async () => {
    const user = userDocument();
    User.findById = () => queryResult(user);
    UserController.storeAvatar = async (_file, target) => {
      target.mainAvatar = '/uploads/new.png';
      target.avatar.push('/uploads/new.png');
    };
    const res = response();

    await UserController.updateAvatar(
      request({ file: { path: '/tmp/avatar', mimetype: 'image/png' } }),
      res
    );

    expect(res.statusCode).to.equal(200);
    expect(user.avatar).to.include('/uploads/new.png');
    expect(user.mainAvatar).to.equal('/uploads/new.png');
  });

  it('rejects a cross-user main-avatar mutation before loading the target', async () => {
    const target = userDocument(otherId);
    let loaded = false;
    User.findById = () => { loaded = true; return queryResult(target); };
    const res = response();

    await UserController.updateMainAvatar(
      request({ targetId: otherId, body: { avatarUrl: '/uploads/second.png' } }),
      res
    );

    expect(res.statusCode).to.equal(403);
    expect(loaded).to.equal(false);
    expect(target.mainAvatar).to.equal('/uploads/first.png');
  });

  it('rejects the cross-user main-avatar id alias before loading the target', async () => {
    let loaded = false;
    User.findById = () => { loaded = true; return queryResult(userDocument(otherId)); };
    const req = request({
      body: { avatarUrl: '/uploads/second.png' },
    });
    req.params = { id: otherId };
    const res = response();

    await UserController.updateMainAvatar(req, res);

    expect(res.statusCode).to.equal(403);
    expect(loaded).to.equal(false);
  });

  it('rejects a cross-user avatar-list mutation before upload storage', async () => {
    const target = userDocument(otherId);
    let loaded = false;
    let stored = false;
    User.findById = () => { loaded = true; return queryResult(target); };
    UserController.storeAvatar = async () => { stored = true; };
    const res = response();

    await UserController.updateAvatar(
      request({ targetId: otherId, file: { path: '/tmp/avatar' } }),
      res
    );

    expect(res.statusCode).to.equal(403);
    expect(loaded).to.equal(false);
    expect(stored).to.equal(false);
    expect(target.avatar).to.deep.equal(['/uploads/first.png', '/uploads/second.png']);
  });

  it('preserves administrator mutation access', async () => {
    const target = userDocument(otherId);
    User.findById = () => queryResult(target);
    const res = response();

    await UserController.updateMainAvatar(
      request({
        actorId: '64b000000000000000000003',
        role: 'ADMIN',
        targetId: otherId,
        body: { avatarUrl: '/uploads/second.png' },
      }),
      res
    );

    expect(res.statusCode).to.equal(200);
    expect(target.mainAvatar).to.equal('/uploads/second.png');
  });

  it('keeps the existing self-owned remove-avatar behavior', async () => {
    const user = userDocument();
    User.findById = () => queryResult(user);
    fs.promises.access = async () => {};
    fs.promises.unlink = async () => {};
    const req = request();
    req.params.avatarUrl = 'first.png';
    const res = response();

    await UserController.removeAvatar(req, res);

    expect(res.statusCode).to.equal(200);
    expect(user.avatar).to.deep.equal(['/uploads/second.png']);
    expect(user.mainAvatar).to.equal('/uploads/second.png');
  });

  it('keeps cross-user remove-avatar requests rejected and unchanged', async () => {
    const target = userDocument(otherId);
    let loaded = false;
    User.findById = () => { loaded = true; return queryResult(target); };
    const req = request({ targetId: otherId });
    req.params.avatarUrl = 'first.png';
    const res = response();

    await UserController.removeAvatar(req, res);

    expect(res.statusCode).to.equal(403);
    expect(loaded).to.equal(false);
    expect(target.avatar).to.deep.equal(['/uploads/first.png', '/uploads/second.png']);
    expect(target.mainAvatar).to.equal('/uploads/first.png');
  });

  it('keeps the cross-user remove-avatar id alias rejected', async () => {
    let loaded = false;
    User.findById = () => { loaded = true; return queryResult(userDocument(otherId)); };
    const req = request();
    req.params = { id: otherId, avatarUrl: 'first.png' };
    const res = response();

    await UserController.removeAvatar(req, res);

    expect(res.statusCode).to.equal(403);
    expect(loaded).to.equal(false);
  });
});
