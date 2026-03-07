/*********************************************************************
 * app/utils/pushService.js
 * -------------------------------------------------------------------
 * Thin compatibility shim — delegates to the FCM push service.
 * Existing callers (helpers.js, etc.) that use pushSvc.sendPush() are
 * unchanged; this module now fans-out per-userId via FCM.
 *********************************************************************/

const { sendPushToUser } = require('../services/fcmPushService');

/**
 * sendPush(userIds, { title, body, data })
 *
 * @param {string|string[]} userIds  – MongoDB user-ids
 * @param {{ title, body, data? }} payload
 */
async function sendPush(userIds, { title, body, data = {} }) {
  const ids = (Array.isArray(userIds) ? userIds : [userIds])
    .filter(id => id && typeof id === 'string' && id.trim());

  if (ids.length === 0) {
    console.warn('[pushService] no valid userIds supplied');
    return null;
  }

  const results = await Promise.all(
    ids.map(uid => sendPushToUser(uid, { title, body, data }).catch(err => {
      console.error(`[pushService] FCM error for user ${uid}:`, err.message);
      return null;
    }))
  );

  return results;
}

module.exports = { sendPush };
