/*********************************************************************
 * app/helpers/pushService.js
 * -------------------------------------------------------------------
 * Light‑weight wrapper around OneSignal’s REST API.
 *   pushService.sendPush(userIds, { title:'…', body:'…', data:{…} })
 *
 *  –  userIds   : string | string[]   (external user‑ids in OneSignal)
 *  –  payload   : { title, body, data? }
 *
 * The function returns the JSON response from OneSignal.
 *********************************************************************/

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

// Put your real keys in .env and load with process.env
const ONE_SIGNAL_APP_ID  = process.env.ONESIGNAL_APP_ID  || '3b993591-823b-4f45-94b0-c2d0f7d0f6d8';
const ONE_SIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY || 'os_v2_app_homtlemchnhulffqylippuhw3auw4vp7fmtu4xfrujbvrgzb536ngtne6z7hsyjy6r7yjvqpvx26bmpi42pvgguhvzdycwvca6ik3bi';

async function sendPush(userIds, { title, body, data = {} }) {
  // normalise to array and remove empties
  const ids = (Array.isArray(userIds) ? userIds : [userIds])
    .filter(id => typeof id === 'string' && id.trim());

  if (ids.length === 0) {
    console.warn('[pushService] no valid userIds supplied');
    return null;
  }

  const payload = {
    app_id: ONE_SIGNAL_APP_ID,
    include_external_user_ids: ids,
    headings: { en: title || 'Notification' },
    contents: { en: body  || '' },
    data
  };

  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type' : 'application/json; charset=utf-8',
        Authorization  : `Basic ${ONE_SIGNAL_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    console.log('[pushService] push sent:', json.id || json.errors || json);
    return json;
  } catch (err) {
    console.error('[pushService] error sending push:', err);
    throw err;
  }
}

module.exports = { sendPush };
