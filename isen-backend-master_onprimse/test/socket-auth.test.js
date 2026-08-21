'use strict';

const { expect } = require('chai');
const {
  createSocketAuthMiddleware,
  isSocketAccountEligible,
} = require('../app/middlewares/socketAuth');

describe('Socket.IO account-state authentication parity', () => {
  const activeUser = {
    _id: '64b000000000000000000001',
    role: 'USER',
    enabled: true,
    banned: false,
    isDeleted: false,
    deletedAt: null,
    emailVerified: true,
  };

  function harness({
    user = activeUser,
    tokenError = null,
    jtiRevoked = false,
    userRevoked = false,
    decoded = { _id: activeUser._id, jti: 'valid-jti' },
  } = {}) {
    const socket = { handshake: { auth: { token: 'signed-token' } } };
    const jwtService = {
      verify() {
        if (tokenError) throw tokenError;
        return decoded;
      },
    };
    const blacklist = {
      isRevokedByJti: async () => jtiRevoked,
      isUserRevoked: async () => userRevoked,
    };
    const userModel = {
      findById: () => ({
        select: () => ({ lean: async () => user }),
      }),
    };
    const logger = { log() {}, warn() {}, error() {} };
    const middleware = createSocketAuthMiddleware({
      jwtService,
      blacklist,
      userModel,
      logger,
    });

    return new Promise(resolve => {
      middleware(socket, error => resolve({ socket, error }));
    });
  }

  it('connects an active verified user and binds the authenticated owner', async () => {
    const { socket, error } = await harness();
    expect(error).to.equal(undefined);
    expect(socket.userId).to.equal(activeUser._id);
    expect(socket.authUser).to.equal(activeUser);
  });

  [
    ['deleted', { isDeleted: true }],
    ['pending deletion', { deletedAt: new Date() }],
    ['banned', { banned: true }],
    ['disabled', { enabled: false }],
    ['unverified', { emailVerified: false }],
  ].forEach(([label, state]) => {
    it(`rejects a ${label} normal user`, async () => {
      const { socket, error } = await harness({ user: { ...activeUser, ...state } });
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.equal('Authentication error');
      expect(socket.userId).to.equal(undefined);
      expect(socket.authUser).to.equal(undefined);
    });
  });

  it('preserves the REST email-verification bypass for administrators', async () => {
    const { socket, error } = await harness({
      user: { ...activeUser, role: 'ADMIN', emailVerified: false },
    });
    expect(error).to.equal(undefined);
    expect(socket.userId).to.equal(activeUser._id);
  });

  it('rejects an invalid token', async () => {
    const { error } = await harness({ tokenError: new Error('invalid signature') });
    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.equal('Authentication error');
  });

  it('rejects a revoked token JTI', async () => {
    const { error } = await harness({ jtiRevoked: true });
    expect(error).to.be.instanceOf(Error);
  });

  it('rejects a user-level session revocation', async () => {
    const { error } = await harness({ userRevoked: true });
    expect(error).to.be.instanceOf(Error);
  });

  it('keeps the eligibility predicate aligned with the tested account states', () => {
    expect(isSocketAccountEligible(activeUser)).to.equal(true);
    expect(isSocketAccountEligible({ ...activeUser, enabled: false })).to.equal(false);
    expect(isSocketAccountEligible({ ...activeUser, banned: true })).to.equal(false);
    expect(isSocketAccountEligible({ ...activeUser, isDeleted: true })).to.equal(false);
    expect(isSocketAccountEligible({ ...activeUser, emailVerified: false })).to.equal(false);
  });
});
