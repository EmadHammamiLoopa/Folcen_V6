'use strict';

/**
 * FCM push mock
 *
 * Replaces `app/services/fcmPushService` for tests so no real Firebase
 * credentials or network calls are needed.
 *
 * Usage in a test file:
 *
 *   const fcmMock = require('../mocks/fcm');
 *
 *   beforeEach(() => fcmMock.reset());
 *
 *   // Intercept require() calls before loading the module under test
 *   // Use proxyquire or a manual require-cache swap, e.g.:
 *   //   require.cache[require.resolve('../../../app/services/fcmPushService')] =
 *   //     { exports: fcmMock };
 *
 *   it('sends push to recipient', async () => {
 *     await doSomethingThatTriggersPush();
 *     assert.equal(fcmMock.calls.length, 1);
 *     assert.equal(fcmMock.calls[0].userId, 'bob-id');
 *     assert.equal(fcmMock.calls[0].payload.title, 'Alice Smith');
 *   });
 */

/** Recorded invocations — each entry: { userId, payload } */
const calls = [];

/** Controls what the next sendPushToUser call returns (default: success) */
let _nextResult = null;

/**
 * Simulate `sendPushToUser(userId, { title, body, data })`.
 * Always resolves (never throws) to mirror production behaviour where
 * FCM errors are caught and logged rather than surfaced to callers.
 *
 * @param {string} userId
 * @param {{ title: string|object, body: string|object, data?: object }} payload
 * @returns {Promise<{ successCount: number, failureCount: number }>}
 */
async function sendPushToUser(userId, payload) {
  calls.push({ userId, payload, ts: Date.now() });
  if (_nextResult !== null) {
    const r = _nextResult;
    _nextResult = null;
    return r;
  }
  return { successCount: 1, failureCount: 0 };
}

/**
 * Simulate the legacy `sendPush(userIds, { title, body, data })` shim
 * (app/utils/pushService.js) which fans out per userId.
 *
 * @param {string|string[]} userIds
 * @param {{ title: string|object, body: string|object, data?: object }} payload
 */
async function sendPush(userIds, payload) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  await Promise.all(ids.map(uid => sendPushToUser(uid, payload)));
}

/** Reset recorded calls (call in beforeEach) */
function reset() {
  calls.length = 0;
  _nextResult = null;
}

/**
 * Schedule a specific result for the NEXT sendPushToUser call.
 * Useful to test the "invalid token" cleanup path.
 *
 * @param {{ successCount?: number, failureCount?: number, responses?: object[] }} result
 */
function setNextResult(result) {
  _nextResult = result;
}

/**
 * Convenience: queue a result that simulates an invalid-token error
 * on the first response so the cleanup path is exercised.
 *
 * @param {number} [totalTokens=1] - total tokens in the batch
 */
function failWithInvalidToken(totalTokens = 1) {
  const responses = Array.from({ length: totalTokens }, (_, i) => ({
    success: i !== 0,  // first token fails
    error: i === 0
      ? { code: 'messaging/registration-token-not-registered' }
      : null,
  }));
  setNextResult({
    successCount: totalTokens - 1,
    failureCount: 1,
    responses,
  });
}

/** Helper: assert that at least one push was sent to a specific userId */
function assertSentTo(assert, userId) {
  const sentTo = calls.map(c => String(c.userId));
  assert.include(sentTo, String(userId),
    `Expected push to be sent to userId "${userId}" but got: [${sentTo.join(', ')}]`);
}

/** Helper: assert that NO push was sent to a specific userId */
function assertNotSentTo(assert, userId) {
  const sentTo = calls.map(c => String(c.userId));
  assert.notInclude(sentTo, String(userId),
    `Expected NO push to userId "${userId}" but one was sent`);
}

/** Helper: get the most recent call to a given userId */
function lastCallTo(userId) {
  const matching = calls.filter(c => String(c.userId) === String(userId));
  return matching[matching.length - 1] || null;
}

module.exports = {
  // Replacements for the real service exports
  sendPushToUser,
  sendPush,

  // Test control
  reset,
  setNextResult,
  failWithInvalidToken,

  // Inspection
  calls,
  assertSentTo,
  assertNotSentTo,
  lastCallTo,
};
