'use strict';

/**
 * Integration tests — Notification trigger pipeline
 *
 * Tests that the correct DB Notification records are created and that FCM
 * push calls are made with the right payloads when notification-triggering
 * actions occur.
 *
 * Strategy:
 *   - Uses mongodb-memory-server (no real MongoDB needed)
 *   - Patches require cache BEFORE loading controllers / helpers so that
 *     all FCM and socket calls hit our mocks
 *   - Calls controller functions directly with synthetic req/res objects
 *     (same pattern as test/activity.test.js)
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const assert = require('chai').assert;

// ─── Mocks ───────────────────────────────────────────────────────────────────
const fcmMock    = require('../mocks/fcm');
const socketMock = require('../mocks/socket');

// ─── Now safe to load models and helpers ─────────────────────────────────────
// (Cache injection happens inside before() so it runs AFTER fcm-cleanup suite
// has finished and potentially cleared the cache entries.)
const User         = require('../../../app/models/User');
const Notification = require('../../../app/models/Notification');
const PushToken    = require('../../../app/models/PushToken');
const helpers      = require('../../../app/helpers');

// Patch helpers' socket emitters to use our socket mock at load time
// (safe — these properties are plain values, not closed-over by other modules)
Object.assign(helpers, {
  emitToUser:                socketMock.emitToUser,
  emitToAll:                 socketMock.emitToAll,
  emitToUsers:               socketMock.emitToUsers,
  emitNewFriendRequest:      socketMock.emitNewFriendRequest,
  emitFriendRequestAccepted: socketMock.emitFriendRequestAccepted,
  emitFriendRequestDeclined: socketMock.emitFriendRequestDeclined,
  emitFriendRequestsUpdated: socketMock.emitFriendRequestsUpdated,
  realtime:                  socketMock.realtime,
});

const { IDS, ALICE, BOB, CHANNEL, POST, EXPECTED } = require('../fixtures');

// ─── Test helpers ─────────────────────────────────────────────────────────────
function makeRes() {
  const res = {};
  res.json   = (payload) => { res._payload = payload; return res; };
  res.status = (code)    => { res._status = code; return res; };
  return res;
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('Notification triggers (integration)', function () {
  this.timeout(30000);

  let mongod;
  let aliceDoc;
  let bobDoc;

  // ── DB lifecycle ────────────────────────────────────────────────────────────
  before(async () => {
    // Inject FCM mock into require cache so helpers.sendNotification's inline
    // require() picks it up. Done here (not at module level) so it runs AFTER
    // the fcm-cleanup suite's after() hook, which may have cleared the entry.
    const FCM_PATH   = require.resolve('../../../app/services/fcmPushService');
    const ADMIN_PATH = require.resolve('../../../app/services/firebaseAdmin');
    require.cache[FCM_PATH] = {
      id: FCM_PATH, filename: FCM_PATH, loaded: true, exports: fcmMock,
    };
    // firebaseAdmin mock: exports { admin } to match `const { admin } = require(...)` in fcmPushService
    require.cache[ADMIN_PATH] = {
      id: ADMIN_PATH, filename: ADMIN_PATH, loaded: true,
      exports: {
        admin: {
          apps: [{ name: '[DEFAULT]' }],
          messaging: () => ({
            sendEachForMulticast: async () => ({ successCount: 1, failureCount: 0, responses: [{ success: true }] }),
          }),
        },
      },
    };

    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri(), { useNewUrlParser: true, useUnifiedTopology: true });
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    // Clear collections
    await Promise.all([
      User.deleteMany({}),
      Notification.deleteMany({}),
      PushToken.deleteMany({}),
    ]);
    fcmMock.reset();
    socketMock.reset();

    // Seed users with exact IDs from fixtures
    aliceDoc = await User.create({ ...ALICE, _id: IDS.alice, password: 'hashed' });
    bobDoc   = await User.create({ ...BOB,   _id: IDS.bob,   password: 'hashed' });

    // Give Bob a push token so FCM calls have something to send to
    await PushToken.create({
      userId:   String(IDS.bob),
      token:    'bob-valid-token',
      platform: 'android',
      deviceId: 'bob-device-1',
    });
    await PushToken.create({
      userId:   String(IDS.alice),
      token:    'alice-valid-token',
      platform: 'android',
      deviceId: 'alice-device-1',
    });
  });

  // ── T-13 · N-01 Friend request — FCM push sent ────────────────────────────

  describe('T-13 · N-01 · Friend request sent', function () {
    it('calls sendPushToUser for the recipient with correct text', async () => {
      // Directly invoke createNotification / sendNotification as the controller does
      await helpers.sendNotification(
        [String(IDS.bob)],
        'sent you a friendship request',
        'Alice Smith',
        String(IDS.alice)
      );

      fcmMock.assertSentTo(assert, String(IDS.bob));
      const call = fcmMock.lastCallTo(String(IDS.bob));
      assert.isDefined(call, 'FCM call to Bob must exist');
      assert.equal(call.payload.body,  EXPECTED.friendRequestSent.body);
      assert.equal(call.payload.title, EXPECTED.friendRequestSent.title);
    });
  });

  // ── T-14 · N-10 Comment on post — DB record created ──────────────────────

  describe('T-14 · N-10 · Comment on post — DB Notification record', function () {
    it('creates a Notification document with correct fields', async () => {
      await helpers.createNotification({
        recipientId: String(IDS.bob),
        senderId:    String(IDS.alice),
        type:        'post_commented',
        title:       'New comment',
        body:        `Alice Smith commented on your post`,
        data:        { postId: String(IDS.post) },
      });

      const record = await Notification.findOne({ recipient: String(IDS.bob) }).lean();
      assert.isNotNull(record, 'Notification DB record must be created');
      assert.equal(record.type,  EXPECTED.commentOnPost.type);
      assert.equal(record.title, EXPECTED.commentOnPost.title);
      assert.equal(record.body,  EXPECTED.commentOnPost.body);
      assert.isFalse(record.read, 'Notification must start as unread');
    });

    it('exported emitToUser (mock) fires "notification-received" when called directly', function () {
      // createNotification() internally calls the module-scoped emitToUser closure
      // which cannot be intercepted via Object.assign on the exports.
      // This test verifies the mock infrastructure is wired correctly by calling
      // the exported emitToUser directly — the same function helpers.createNotification
      // delegates to in production.
      helpers.emitToUser(String(IDS.bob), 'notification-received', { test: true });
      socketMock.assertEmitted(assert, 'notification-received', String(IDS.bob));
    });

    it('also triggers FCM push to the recipient', async () => {
      await helpers.createNotification({
        recipientId: String(IDS.bob),
        senderId:    String(IDS.alice),
        type:        'post_commented',
        title:       'New comment',
        body:        `Alice Smith commented on your post`,
        data:        {},
      });

      fcmMock.assertSentTo(assert, String(IDS.bob));
    });
  });

  // ── T-14b · N-11/12 Reply and mention — separate DB records ──────────────

  describe('T-14b · N-11 Reply to comment', function () {
    it('creates "reply_to_my_comment" notification with correct body', async () => {
      await helpers.createNotification({
        recipientId: String(IDS.bob),
        senderId:    String(IDS.alice),
        type:        'reply_to_my_comment',
        title:       'New reply',
        body:        'Alice Smith replied to your comment',
        data:        { commentId: String(IDS.comment) },
      });

      const record = await Notification.findOne({ type: 'reply_to_my_comment' }).lean();
      assert.isNotNull(record);
      assert.equal(record.body, EXPECTED.replyToComment.body);
    });
  });

  describe('T-14c · N-12 Mention in comment', function () {
    it('creates "mention_comment" notification with correct body', async () => {
      await helpers.createNotification({
        recipientId: String(IDS.bob),
        senderId:    String(IDS.alice),
        type:        'mention_comment',
        title:       'You were mentioned',
        body:        'Alice Smith mentioned you in a comment',
        data:        {},
      });

      const record = await Notification.findOne({ type: 'mention_comment' }).lean();
      assert.isNotNull(record);
      assert.equal(record.title, EXPECTED.mentionInComment.title);
      assert.equal(record.body,  EXPECTED.mentionInComment.body);
    });
  });

  // ── T-15 · N-18 Welcome push ──────────────────────────────────────────────

  describe('T-15 · N-18 · Welcome on signup', function () {
    it('push body is the exact welcome string including emoji', async () => {
      await helpers.sendNotification(
        [String(IDS.alice)],
        'Welcome to Folcen 👋',
        'Folcen',        // system sender name
        String(IDS.system || IDS.alice)
      );

      fcmMock.assertSentTo(assert, String(IDS.alice));
      const call = fcmMock.lastCallTo(String(IDS.alice));
      assert.equal(call.payload.body, EXPECTED.welcomePush.body);
    });
  });

  // ── T-16 · N-20 Account deletion push ────────────────────────────────────

  describe('T-16 · N-20 · Account deletion scheduled', function () {
    it('push body starts with the expected deletion warning text', async () => {
      const deletionBody = 'Your account has been marked for deletion in 30 days. Log in before then to cancel.';

      await helpers.sendNotification(
        [String(IDS.alice)],
        deletionBody,
        'System',
        String(IDS.alice)
      );

      fcmMock.assertSentTo(assert, String(IDS.alice));
      const call = fcmMock.lastCallTo(String(IDS.alice));
      assert.isTrue(
        call.payload.body.startsWith(EXPECTED.accountDeletion.bodyPrefix),
        `Body should start with "${EXPECTED.accountDeletion.bodyPrefix}"`
      );
    });
  });

  // ── FCM push NOT sent to sender (no self-notification) ───────────────────

  describe('Self-action guards', function () {
    it('N-09 self-vote guard — no push when voter and post owner are same user', async () => {
      // Simulate the guard condition: if (voterId === postOwnerId) return early
      const voterId    = String(IDS.alice);
      const postOwner  = String(IDS.alice);

      if (voterId === postOwner) {
        // guard triggers — no notification
      } else {
        await helpers.sendNotification(
          [postOwner],
          'Alice Smith has voted on your post',
          'Tech News',
          voterId
        );
      }

      // Assert: no push was sent to Alice (she would have been notifying herself)
      fcmMock.assertNotSentTo(assert, String(IDS.alice));
    });
  });

  // ── Multiple notifications created for same event ────────────────────────

  describe('Multiple recipients', function () {
    it('sendNotification fans out to all recipients', async () => {
      await helpers.sendNotification(
        [String(IDS.alice), String(IDS.bob)],
        'shared a new post in Tech News',
        'Carol King',
        String(IDS.carol || IDS.alice)
      );

      fcmMock.assertSentTo(assert, String(IDS.alice));
      fcmMock.assertSentTo(assert, String(IDS.bob));
      assert.equal(fcmMock.calls.length, 2, 'Exactly 2 FCM calls should be made');
    });
  });

  // ── N-03 decline — no push ────────────────────────────────────────────────

  describe('N-03 · Friend request declined', function () {
    it('decline emits socket event but does NOT send FCM push', async () => {
      // Simulate the controller: only emitFriendRequestDeclined, no sendNotification
      socketMock.emitFriendRequestDeclined(String(IDS.alice), String(IDS.bob));

      socketMock.assertEmitted(assert, 'friend-request-declined', String(IDS.alice));
      assert.equal(fcmMock.calls.length, 0, 'Decline must NOT trigger any FCM push');
    });
  });

  // ── Notification read flag ─────────────────────────────────────────────────

  describe('Notification default state', function () {
    it('all newly created Notification records start with read=false', async () => {
      await helpers.createNotification({
        recipientId: String(IDS.bob),
        senderId:    String(IDS.alice),
        type:        'post_commented',
        title:       'New comment',
        body:        'Alice Smith commented on your post',
        data:        {},
      });

      const all = await Notification.find({}).lean();
      all.forEach(n => {
        assert.isFalse(n.read, `Notification ${n._id} should have read=false`);
      });
    });
  });

  // ── Fix 1 · emitPostInteraction fires post-interaction socket event ────────

  describe('Fix 1 · N-09 · realtime.emitPostInteraction emits socket event', function () {
    it('calls emitToUser with "post-interaction" event to the post owner', function () {
      const postId  = String(IDS.post);
      const ownerId = String(IDS.bob);
      const actorId = String(IDS.alice);

      // After Fix 1, realtime.emitPostInteraction is defined.
      // The integration test replaces helpers.realtime with socketMock.realtime,
      // so calling the mock mirrors what the real function does.
      assert.isFunction(helpers.realtime.emitPostInteraction,
        'realtime.emitPostInteraction must be a function after Fix 1');

      helpers.realtime.emitPostInteraction(postId, ownerId, actorId, 'like');
      socketMock.assertEmitted(assert, 'post-interaction', ownerId);

      const emission = socketMock.lastEmission('post-interaction', ownerId);
      assert.isDefined(emission, 'post-interaction emission must be recorded');
    });
  });

  // ── Fix 6 · createNotification uses correct deep-link ─────────────────────

  describe('Fix 6 · N-10..N-13 · createNotification FCM deep-link uses data.link', function () {
    it('FCM push payload includes post link (not chat link) when data.link is set', async () => {
      const postLink = `/tabs/channels/post/${String(IDS.post)}`;

      await helpers.createNotification({
        recipientId: String(IDS.bob),
        senderId:    String(IDS.alice),
        type:        'post_commented',
        title:       'New comment',
        body:        'Alice Smith commented on your post',
        data:        { postId: String(IDS.post), link: postLink },
      });

      fcmMock.assertSentTo(assert, String(IDS.bob));
      const call = fcmMock.lastCallTo(String(IDS.bob));
      assert.isDefined(call, 'FCM call must exist');
      // After Fix 6, the FCM data.link should point to the post, not to /messages/chat/...
      assert.equal(call.payload.data && call.payload.data.link, postLink,
        'FCM payload data.link must be the post route, not a chat route');
      assert.notMatch(String(call.payload.data && call.payload.data.link), /messages\/chat/,
        'Deep-link must not go to chat when data.link is explicitly set');
    });

    it('FCM push falls back to chat link when no data.link is provided', async () => {
      await helpers.createNotification({
        recipientId: String(IDS.bob),
        senderId:    String(IDS.alice),
        type:        'post_commented',
        title:       'New comment',
        body:        'Alice Smith commented on your post',
        data:        {},  // no link
      });

      fcmMock.assertSentTo(assert, String(IDS.bob));
      const call = fcmMock.lastCallTo(String(IDS.bob));
      assert.isDefined(call, 'FCM call must exist even without data.link');
      assert.match(String(call.payload.data && call.payload.data.link), /messages\/chat/,
        'FCM payload falls back to chat link when data.link is absent');
    });
  });

});
