'use strict';

const { expect } = require('chai');
const router = require('../routes/user');
const { isAuth } = require('../app/middlewares/auth');
const Peer = require('../app/models/Peer');
const peerStore = require('../app/utils/peerStorage');

describe('peer identity mutation authorization', () => {
  const ownerId = '64b000000000000000000001';
  const otherId = '64b000000000000000000002';
  let originalSet;
  let originalGet;
  let originalDelete;
  let originalUpdateOne;
  let peerState;

  beforeEach(() => {
    peerState = new Map();
    originalSet = peerStore.set;
    originalGet = peerStore.get;
    originalDelete = peerStore.delete;
    originalUpdateOne = Peer.updateOne;

    peerStore.set = async (userId, peerId) => {
      peerState.set(String(userId), { peerId, lastUpdated: new Date() });
    };
    peerStore.get = async userId => peerState.get(String(userId)) || null;
    peerStore.delete = async userId => { peerState.delete(String(userId)); };
    Peer.updateOne = async ({ userId }, update) => {
      const current = peerState.get(String(userId));
      if (current) current.lastUpdated = update.$set.lastUpdated;
      return { matchedCount: current ? 1 : 0, modifiedCount: current ? 1 : 0 };
    };
  });

  afterEach(() => {
    peerStore.set = originalSet;
    peerStore.get = originalGet;
    peerStore.delete = originalDelete;
    Peer.updateOne = originalUpdateOne;
  });

  function route(method, path) {
    return router.stack.find(layer =>
      layer.route && layer.route.path === path && layer.route.methods[method]
    ).route;
  }

  function invokeMutation(method, path, { actorId, targetId, body = {} }) {
    const selected = route(method, path);
    const authIndex = selected.stack.findIndex(layer => layer.handle === isAuth);
    expect(authIndex, `${method.toUpperCase()} ${path} must include isAuth`).to.be.at.least(0);

    const req = {
      params: { userId: targetId },
      body,
      auth: { _id: actorId, role: 'USER' },
      authUser: { _id: actorId, role: 'USER' },
      user: { _id: targetId },
    };

    return new Promise((resolve, reject) => {
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) { resolve({ status: this.statusCode, payload }); return payload; },
      };

      const run = index => {
        if (index >= selected.stack.length) return resolve({ status: res.statusCode });
        try {
          const result = selected.stack[index].handle(
            req,
            res,
            error => error ? reject(error) : run(index + 1)
          );
          if (result && typeof result.catch === 'function') result.catch(reject);
        } catch (error) {
          reject(error);
        }
      };

      run(authIndex);
    });
  }

  it('allows an owner to register and update their peer ID', async () => {
    let result = await invokeMutation('post', '/:userId/peer', {
      actorId: ownerId,
      targetId: ownerId,
      body: { peerId: 'peer-one' },
    });
    expect(result.status).to.equal(200);
    expect(peerState.get(ownerId).peerId).to.equal('peer-one');

    result = await invokeMutation('post', '/:userId/peer', {
      actorId: ownerId,
      targetId: ownerId,
      body: { peerId: 'peer-two' },
    });
    expect(result.status).to.equal(200);
    expect(peerState.get(ownerId).peerId).to.equal('peer-two');
  });

  it('allows an owner to heartbeat their peer ID', async () => {
    const before = new Date(0);
    peerState.set(ownerId, { peerId: 'peer-one', lastUpdated: before });
    const result = await invokeMutation('patch', '/:userId/peer/heartbeat', {
      actorId: ownerId,
      targetId: ownerId,
    });
    expect(result.status).to.equal(200);
    expect(peerState.get(ownerId).lastUpdated).to.be.greaterThan(before);
  });

  it('allows an owner to delete their peer ID', async () => {
    peerState.set(ownerId, { peerId: 'peer-one', lastUpdated: new Date() });
    const result = await invokeMutation('delete', '/:userId/peer', {
      actorId: ownerId,
      targetId: ownerId,
    });
    expect(result.status).to.equal(200);
    expect(peerState.has(ownerId)).to.equal(false);
  });

  [
    ['register', 'post', '/:userId/peer', { peerId: 'foreign-peer' }],
    ['update', 'post', '/:userId/peer', { peerId: 'replacement-peer' }],
    ['heartbeat', 'patch', '/:userId/peer/heartbeat', {}],
    ['delete', 'delete', '/:userId/peer', {}],
  ].forEach(([operation, method, path, body]) => {
    it(`rejects cross-user peer ${operation} without changing target state`, async () => {
      const existing = { peerId: 'target-peer', lastUpdated: new Date(0) };
      peerState.set(otherId, existing);
      const result = await invokeMutation(method, path, {
        actorId: ownerId,
        targetId: otherId,
        body,
      });
      expect(result.status).to.equal(403);
      expect(peerState.get(otherId)).to.equal(existing);
      expect(peerState.get(otherId).peerId).to.equal('target-peer');
      expect(peerState.get(otherId).lastUpdated).to.equal(existing.lastUpdated);
    });
  });

  it('does not apply self-only mutation authorization to peer lookup', () => {
    const lookup = route('get', '/:userId/peer');
    expect(lookup.stack.some(layer => layer.handle === isAuth)).to.equal(false);
  });
});
