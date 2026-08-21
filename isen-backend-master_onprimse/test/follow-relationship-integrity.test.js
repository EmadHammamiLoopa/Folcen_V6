'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const USER_CONTROLLER_PATH = path.join(
  __dirname,
  '..',
  'app',
  'controllers',
  'UserController.js'
);
const FOLLOW_CONTROLLER_PATH = path.join(
  __dirname,
  '..',
  'app',
  'controllers',
  'FollowController.js'
);

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing marker: ${startMarker}`);
  assert.ok(end > start, `missing marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

function loadLegacyFollowHarness() {
  const source = fs.readFileSync(USER_CONTROLLER_PATH, 'utf8');
  const followSource = section(source, 'exports.follow =', 'exports.getUsers =');
  const responses = [];
  const notifications = [];
  const realtimeEvents = [];

  const Response = {
    sendResponse(res, data, message) {
      const result = { data, message };
      responses.push(result);
      res.result = result;
      return result;
    },
  };
  const sendNotification = (...args) => notifications.push(args);
  const realtime = {
    emitFollowUpdate: (...args) => realtimeEvents.push(args),
  };
  const exported = {};
  const factory = new Function(
    'Response',
    'sendNotification',
    'realtime',
    'exports',
    `${followSource}\nreturn exports.follow;`
  );
  const handler = factory(Response, sendNotification, realtime, exported);

  return { handler, responses, notifications, realtimeEvents };
}

function fakeUser(id, options = {}) {
  const state = {
    _id: String(id),
    firstName: options.firstName || String(id),
    lastName: options.lastName || 'User',
    friends: [...(options.friends || [])].map(String),
    following: [...(options.following || [])].map(String),
    followers: [...(options.followers || [])].map(String),
    saveCount: 0,
    async save() {
      this.saveCount += 1;
      return this;
    },
  };
  return state;
}

async function invoke(harness, authUser, user) {
  const res = {};
  const result = await harness.handler({ authUser, user }, res);
  return { result, res };
}

function countId(values, id) {
  return values.filter(value => String(value) === String(id)).length;
}

describe('follow relationship integrity', () => {
  it('following an existing friend preserves the authenticated user friendship direction', async () => {
    const authUser = fakeUser('A', { friends: ['B', 'C'] });
    const user = fakeUser('B', { friends: ['A', 'D'] });
    const harness = loadLegacyFollowHarness();

    await invoke(harness, authUser, user);

    assert.ok(authUser.friends.includes('B'));
    assert.deepStrictEqual(authUser.friends, ['B', 'C']);
  });

  it('following an existing friend preserves the target user friendship direction', async () => {
    const authUser = fakeUser('A', { friends: ['B', 'C'] });
    const user = fakeUser('B', { friends: ['A', 'D'] });
    const harness = loadLegacyFollowHarness();

    await invoke(harness, authUser, user);

    assert.ok(user.friends.includes('A'));
    assert.deepStrictEqual(user.friends, ['A', 'D']);
  });

  it('following a friend leaves unrelated friendship entries untouched on both users', async () => {
    const authUser = fakeUser('A', { friends: ['B', 'C', 'E'] });
    const user = fakeUser('B', { friends: ['A', 'D', 'F'] });
    const harness = loadLegacyFollowHarness();

    await invoke(harness, authUser, user);

    assert.deepStrictEqual(authUser.friends, ['B', 'C', 'E']);
    assert.deepStrictEqual(user.friends, ['A', 'D', 'F']);
  });

  it('following a nonfriend still creates the normal following and follower relationship', async () => {
    const authUser = fakeUser('A');
    const user = fakeUser('B');
    const harness = loadLegacyFollowHarness();

    const { result } = await invoke(harness, authUser, user);

    assert.strictEqual(result.data, true);
    assert.deepStrictEqual(authUser.following, ['B']);
    assert.deepStrictEqual(user.followers, ['A']);
    assert.strictEqual(authUser.saveCount, 1);
    assert.strictEqual(user.saveCount, 1);
  });

  it('unfollowing removes only following and follower state', async () => {
    const authUser = fakeUser('A', { following: ['B'] });
    const user = fakeUser('B', { followers: ['A'] });
    const harness = loadLegacyFollowHarness();

    const { result } = await invoke(harness, authUser, user);

    assert.strictEqual(result.data, false);
    assert.deepStrictEqual(authUser.following, []);
    assert.deepStrictEqual(user.followers, []);
    assert.deepStrictEqual(authUser.friends, []);
    assert.deepStrictEqual(user.friends, []);
  });

  it('unfollowing an existing friend preserves friendship in both directions', async () => {
    const authUser = fakeUser('A', {
      friends: ['B', 'C'],
      following: ['B'],
    });
    const user = fakeUser('B', {
      friends: ['A', 'D'],
      followers: ['A'],
    });
    const harness = loadLegacyFollowHarness();

    await invoke(harness, authUser, user);

    assert.deepStrictEqual(authUser.following, []);
    assert.deepStrictEqual(user.followers, []);
    assert.deepStrictEqual(authUser.friends, ['B', 'C']);
    assert.deepStrictEqual(user.friends, ['A', 'D']);
  });

  it('repeated follow-toggle calls remain duplicate-free under the existing toggle semantics', async () => {
    const authUser = fakeUser('A');
    const user = fakeUser('B', { followers: ['A'] });
    const harness = loadLegacyFollowHarness();

    await invoke(harness, authUser, user);
    assert.strictEqual(countId(authUser.following, 'B'), 1);
    assert.strictEqual(countId(user.followers, 'A'), 1);

    await invoke(harness, authUser, user);
    assert.strictEqual(countId(authUser.following, 'B'), 0);
    assert.strictEqual(countId(user.followers, 'A'), 0);

    await invoke(harness, authUser, user);
    assert.strictEqual(countId(authUser.following, 'B'), 1);
    assert.strictEqual(countId(user.followers, 'A'), 1);
  });

  it('the dedicated unfollow path remains safe when no follow record exists and does not mutate friends', () => {
    const source = fs.readFileSync(FOLLOW_CONTROLLER_PATH, 'utf8');
    const unfollow = section(source, 'exports.unfollowUser =', 'exports.removeFollower =');

    assert.match(unfollow, /findOneAndDelete/);
    assert.match(unfollow, /if\s*\(follow\)/);
    assert.match(unfollow, /Unfollowed successfully/);
    assert.doesNotMatch(unfollow, /friends\s*:/);
  });

  it('explicit removeFriendship remains responsible for changing friendship state', () => {
    const source = fs.readFileSync(USER_CONTROLLER_PATH, 'utf8');
    const removeFriendship = section(
      source,
      'exports.removeFriendship =',
      'exports.blockUser ='
    );

    assert.match(
      removeFriendship,
      /User\.updateOne\(\{ _id: user\._id \}, \{ \$pull: \{ friends: authUser\._id \} \}\)/
    );
    assert.match(
      removeFriendship,
      /User\.updateOne\(\{ _id: authUser\._id \}, \{ \$pull: \{ friends: user\._id \} \}\)/
    );
  });

  it('preserves the existing follow response, realtime event, and notification contracts', async () => {
    const authUser = fakeUser('A', { firstName: 'Alice', lastName: 'Example' });
    const user = fakeUser('B');
    const harness = loadLegacyFollowHarness();

    let call = await invoke(harness, authUser, user);
    assert.deepStrictEqual(call.result, { data: true, message: 'followed' });
    assert.deepStrictEqual(harness.realtimeEvents[0], ['A', 'B', 'followed']);
    assert.strictEqual(harness.notifications.length, 1);
    assert.deepStrictEqual(harness.notifications[0], [
      { en: 'Alice Example' },
      { en: 'started following you' },
      { type: 'follow-user', link: '/tabs/profile/display/B' },
      [],
      ['B'],
    ]);

    call = await invoke(harness, authUser, user);
    assert.deepStrictEqual(call.result, { data: false, message: 'unfollowed' });
    assert.deepStrictEqual(harness.realtimeEvents[1], ['A', 'B', 'unfollowed']);
    assert.strictEqual(harness.notifications.length, 1);
  });
});
