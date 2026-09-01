'use strict';

/**
 * Integration tests — FCM invalid token cleanup (T-17, T-18)
 *
 * Tests the `sendPushToUser` function in `app/services/fcmPushService.js`
 * directly, using a real in-memory MongoDB and a mocked Firebase Admin SDK.
 *
 * This file intentionally loads the REAL fcmPushService (not the mock used
 * in triggers.test.js) so the actual cleanup logic in fcmPushService.js is
 * exercised.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const assert = require('chai').assert;

const PushToken = require('../../../app/models/PushToken');
const { IDS }   = require('../fixtures');

// ─── Build a configurable Firebase Admin mock ────────────────────────────────

/**
 * Creates a Firebase Admin cache-entry exports object whose shape matches what
 * fcmPushService.js expects:
 *   const { admin } = require('./firebaseAdmin');
 *
 * @param {object} sendResponse - canned sendEachForMulticast return value
 */
function makeAdminMock(sendResponse) {
  return {
    // exported as { admin } — matches `const { admin } = require('./firebaseAdmin')`
    admin: {
      apps: [{ name: '[DEFAULT]' }],   // makes admin.apps.length > 0
      messaging: () => ({
        sendEachForMulticast: async () => sendResponse,
      }),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('FCM invalid token cleanup (integration)', function () {
  this.timeout(30000);

  let mongod;
  let sendPushToUser;
  let originalFcmCache;
  let originalAdminCache;

  before(async () => {
    // Boot DB
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    // We need the REAL fcmPushService — remove any mock that may have been
    // injected by triggers.test.js (which runs first in the suite).
    const FCM_PATH   = require.resolve('../../../app/services/fcmPushService');
    const ADMIN_PATH = require.resolve('../../../app/services/firebaseAdmin');
    originalFcmCache = require.cache[FCM_PATH];
    originalAdminCache = require.cache[ADMIN_PATH];
    delete require.cache[FCM_PATH];

    // Inject a "success" admin mock for the base case.
    // Individual tests override this per-call by swapping the cache entry via useAdminMock().
    require.cache[ADMIN_PATH] = {
      id: ADMIN_PATH, filename: ADMIN_PATH, loaded: true,
      exports: makeAdminMock({ successCount: 1, failureCount: 0, responses: [{ success: true }] }),
    };
    // Also pre-seed FCM service cache entry so fcmPushService picks up ADMIN mock on first load
    delete require.cache[FCM_PATH];

    // Load the real service now that the cache is correct
    sendPushToUser = require('../../../app/services/fcmPushService').sendPushToUser;
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();

    const FCM_PATH   = require.resolve('../../../app/services/fcmPushService');
    const ADMIN_PATH = require.resolve('../../../app/services/firebaseAdmin');
    if (originalFcmCache) require.cache[FCM_PATH] = originalFcmCache;
    else delete require.cache[FCM_PATH];
    if (originalAdminCache) require.cache[ADMIN_PATH] = originalAdminCache;
    else delete require.cache[ADMIN_PATH];
  });

  beforeEach(async () => {
    await PushToken.deleteMany({});
  });

  /**
   * Helper: replace the Firebase Admin mock for this test only.
   * Automatically reloads fcmPushService so it picks up the new mock.
   */
  function useAdminMock(response) {
    const FCM_PATH   = require.resolve('../../../app/services/fcmPushService');
    const ADMIN_PATH = require.resolve('../../../app/services/firebaseAdmin');

    delete require.cache[FCM_PATH];
    require.cache[ADMIN_PATH] = {
      id: ADMIN_PATH, filename: ADMIN_PATH, loaded: true,
      exports: makeAdminMock(response),
    };
    sendPushToUser = require('../../../app/services/fcmPushService').sendPushToUser;
  }

  // ── T-17 ·  Invalid token is removed from DB ─────────────────────────────

  describe('T-17 · Invalid token removed on "registration-token-not-registered"', function () {
    it('deletes the stale token document after an FCM failure response', async () => {
      const invalidToken = 'stale-invalid-token-12345';
      await PushToken.create({
        userId:   String(IDS.bob),
        token:    invalidToken,
        platform: 'android',
        deviceId: 'bob-device-stale',
      });

      // Configure admin mock to return a token-not-registered error
      useAdminMock({
        successCount: 0,
        failureCount: 1,
        responses: [{
          success: false,
          error: { code: 'messaging/registration-token-not-registered' },
        }],
      });

      const result = await sendPushToUser(String(IDS.bob), {
        title: 'Test',
        body:  'This push is to a stale token',
      });

      assert.equal(result.removedInvalid, 1,  'Should report 1 removed token');
      assert.equal(result.failureCount,   1,  'Should report 1 failure');

      const remaining = await PushToken.countDocuments({ token: invalidToken });
      assert.equal(remaining, 0, 'Stale token must be deleted from DB');
    });

    it('also removes tokens marked as "messaging/invalid-registration-token"', async () => {
      const badToken = 'invalid-registration-token-xyz';
      await PushToken.create({
        userId:   String(IDS.bob),
        token:    badToken,
        platform: 'ios',
        deviceId: 'bob-ios-bad',
      });

      useAdminMock({
        successCount: 0,
        failureCount: 1,
        responses: [{
          success: false,
          error: { code: 'messaging/invalid-registration-token' },
        }],
      });

      await sendPushToUser(String(IDS.bob), { title: 'X', body: 'Y' });

      const remaining = await PushToken.countDocuments({ token: badToken });
      assert.equal(remaining, 0, 'Invalid-registration token must be deleted');
    });
  });

  // ── T-18 · Valid token is NOT removed ────────────────────────────────────

  describe('T-18 · Valid token is preserved after a successful send', function () {
    it('does NOT delete the token document when push succeeds', async () => {
      const goodToken = 'valid-active-token-abc';
      await PushToken.create({
        userId:   String(IDS.alice),
        token:    goodToken,
        platform: 'android',
        deviceId: 'alice-device-good',
      });

      useAdminMock({
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true }],
      });

      const result = await sendPushToUser(String(IDS.alice), {
        title: 'Welcome',
        body:  'Welcome to Folcen 👋',
      });

      assert.equal(result.successCount,  1, 'Should report 1 success');
      assert.equal(result.removedInvalid, 0, 'Should remove 0 tokens');

      const remaining = await PushToken.countDocuments({ token: goodToken });
      assert.equal(remaining, 1, 'Valid token must NOT be deleted');
    });
  });

  // ── Multi-token batch: only invalid ones removed ──────────────────────────

  describe('Batch: only invalid tokens removed in mixed-result response', function () {
    it('removes only the failed token when batch has one success and one failure', async () => {
      const goodToken = 'batch-good-token';
      const badToken  = 'batch-bad-token';

      await PushToken.create([
        { userId: String(IDS.bob), token: goodToken, platform: 'android', deviceId: 'dev-1' },
        { userId: String(IDS.bob), token: badToken,  platform: 'android', deviceId: 'dev-2' },
      ]);

      useAdminMock({
        successCount: 1,
        failureCount: 1,
        responses: [
          { success: true },
          { success: false, error: { code: 'messaging/registration-token-not-registered' } },
        ],
      });

      const result = await sendPushToUser(String(IDS.bob), {
        title: 'Batch test',
        body:  'Testing mixed result',
      });

      assert.equal(result.successCount,  1, 'One success');
      assert.equal(result.failureCount,  1, 'One failure');
      assert.equal(result.removedInvalid, 1, 'One invalid token removed');

      const goodRemaining = await PushToken.countDocuments({ token: goodToken });
      const badRemaining  = await PushToken.countDocuments({ token: badToken });

      assert.equal(goodRemaining, 1, 'Good token must remain');
      assert.equal(badRemaining,  0, 'Bad token must be deleted');
    });
  });

  // ── No tokens registered ──────────────────────────────────────────────────

  describe('No tokens registered for user', function () {
    it('returns zeroes and does not call Firebase when user has no tokens', async () => {
      // No PushToken created for IDS.carol
      const result = await sendPushToUser(String(IDS.carol), {
        title: 'Hello',
        body:  'Nobody to receive this',
      });

      assert.equal(result.successCount,  0);
      assert.equal(result.failureCount,  0);
      assert.equal(result.removedInvalid, 0);
    });
  });

  // ── No userId ─────────────────────────────────────────────────────────────

  describe('Missing userId guard', function () {
    it('returns zeroes without throwing when userId is falsy', async () => {
      const result = await sendPushToUser(null, { title: 'T', body: 'B' });
      assert.equal(result.successCount, 0);
      assert.equal(result.failureCount, 0);
    });
  });

});
