'use strict';

const fs = require('fs');
const path = require('path');
const { expect } = require('chai');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, `Missing source marker: ${start}`).to.be.at.least(0);
  expect(endIndex, `Missing source marker: ${end}`).to.be.greaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('P0 authorization boundary security specifications', () => {
  const socketAuth = read('app/middlewares/socketAuth.js');
  const userRoutes = read('routes/user.js');
  const userController = read('app/controllers/UserController.js');

  it('SECURITY_SPEC socket authentication rejects a banned account', () => {
    expect(
      socketAuth,
      'SECURITY_ASSERTION: Socket authentication must enforce the REST banned-account policy.'
    ).to.match(/user\.banned/);
  });

  it('SECURITY_SPEC socket authentication rejects a disabled account', () => {
    expect(
      socketAuth,
      'SECURITY_ASSERTION: Socket authentication must enforce the REST disabled-account policy.'
    ).to.match(/user\.enabled\s*===\s*false|!user\.enabled/);
  });

  it('SECURITY_SPEC socket authentication rejects an unverified account', () => {
    expect(
      socketAuth,
      'SECURITY_ASSERTION: Socket authentication must enforce the REST email-verification policy.'
    ).to.match(/user\.emailVerified/);
  });

  it('SECURITY_SPEC peer identity mutations reject a cross-user target', () => {
    const mutations = [
      section(userRoutes, "router.post('/:userId/peer'", "router.get('/:userId/peer'"),
      section(userRoutes, "router.delete('/:userId/peer'", "router.patch('/:userId/peer/heartbeat'"),
      section(userRoutes, "router.patch('/:userId/peer/heartbeat'", "router.post('/:userId/upload'"),
    ];
    const allProtected = mutations.every(route =>
      /\[requireSignin, withAuthUser, isAuth\]/.test(route)
    );

    expect(
      allProtected,
      'SECURITY_ASSERTION: Register, delete, and heartbeat must authorize the actor against the peer owner.'
    ).to.equal(true);
  });

  it('SECURITY_SPEC avatar mutations reject a cross-user target', () => {
    const mainAvatar = section(
      userController,
      'exports.updateMainAvatar =',
      'exports.updateAvatar ='
    );
    const avatarList = section(
      userController,
      'exports.updateAvatar =',
      'exports.deleteAccount ='
    );
    const allProtected = [mainAvatar, avatarList].every(handler =>
      /req\.(?:authUser|auth)[\s\S]*?_id/.test(handler) &&
      /403|unauthorized|forbidden/i.test(handler)
    );

    expect(
      allProtected,
      'SECURITY_ASSERTION: Main-avatar and avatar-list updates must authorize the actor against the target user.'
    ).to.equal(true);
  });

  it('SECURITY_SPEC following an existing friend does not corrupt relationship arrays', () => {
    const follow = section(userController, 'exports.follow =', 'exports.getUsers =');

    expect(
      follow,
      'SECURITY_ASSERTION: A follow operation must not silently remove either side of an existing friendship.'
    ).not.to.match(/(?:authUser|user)\.friends\s*=\s*(?:authUser|user)\.friends\.filter/);
  });
});
