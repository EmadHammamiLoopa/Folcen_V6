/* Full journey test
 - Signin A and B
 - Verify profiles
 - A -> send friend request to B
 - B -> accept request
 - Verify friends lists
 - B -> remove friendship
 - Verify removal
 - B -> follow/unfollow A
 - Signout tokens and verify revocation

 Usage: set BASE_URL if not http://127.0.0.1:3300, then run
 */

const axios = require('axios');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3300';
const SIGNIN = BASE + '/api/v1/auth/signin';
const AUTH_USER = BASE + '/api/v1/auth/user';
const SIGNOUT = BASE + '/api/v1/auth/signout';
const REQUEST_SEND = BASE + '/api/v1/request'; // POST /:userId
const REQUEST_LIST = BASE + '/api/v1/request/requests';
const REQUEST_ACCEPT = BASE + '/api/v1/request/accept'; // POST /:requestId
const FRIENDS_GET = BASE + '/api/v1/user/friends';
const FRIENDS_REMOVE = BASE + '/api/v1/user/friends/remove'; // POST /:userId
const FOLLOW = BASE + '/api/v1/user/follow'; // POST /:userId

async function post(url, data, token){
  return axios.post(url, data, token ? { headers:{ Authorization: `Bearer ${token}` } } : {}).catch(e=>e.response||e);
}
async function get(url, token){
  return axios.get(url, token ? { headers:{ Authorization: `Bearer ${token}` } } : {}).catch(e=>e.response||e);
}

(async ()=>{
  try{
    console.log('Starting full journey test');
    const userA = { email: process.env.TEST_USER_A_EMAIL || 'user25@example.com', password: process.env.TEST_USER_A_PASS || '123456789' };
    const userB = { email: process.env.TEST_USER_B_EMAIL || 'user5@example.com', password: process.env.TEST_USER_B_PASS || '123456789' };

    const rA = await post(SIGNIN, userA);
    const rB = await post(SIGNIN, userB);
    // Support multiple response shapes: { token } or { data: { token } }
    const tokenA = (rA && rA.data && (rA.data.token || (rA.data.data && rA.data.data.token))) || (rA && rA.token);
    const tokenB = (rB && rB.data && (rB.data.token || (rB.data.data && rB.data.data.token))) || (rB && rB.token);
    if(!tokenA) return console.error('Signin A failed', rA && rA.data || rA);
    if(!tokenB) return console.error('Signin B failed', rB && rB.data || rB);
    console.log('Signin OK — tokens lengths:', tokenA.length, tokenB.length);

    // Helper to handle response wrapper { success: true, data: ... }
    const unwrap = (res) => (res && res.data && (res.data.data || res.data));

    const meAraw = await get(AUTH_USER, tokenA);
    const meBraw = await get(AUTH_USER, tokenB);
    const meA = unwrap(meAraw);
    const meB = unwrap(meBraw);
    console.log('A id:', meA && meA._id);
    console.log('B id:', meB && meB._id);
    const idA = meA && meA._id; const idB = meB && meB._id;
    if(!idA || !idB) return console.error('Could not fetch user ids');

    // Ensure no existing friendship: try removing first (ignore errors)
    await post(`${FRIENDS_REMOVE}/${idA}`, {}, tokenB);

    // A sends request to B
    const send = await post(`${REQUEST_SEND}/${idB}`, {}, tokenA);
    console.log('Send request response status:', send && send.status);
    const requestId = send && send.data && send.data.request && send.data.request._id;
    if(!requestId) return console.error('Failed to create request', send && send.data);
    console.log('Request created:', requestId);

    // B lists requests
    const reqsRaw = await get(REQUEST_LIST, tokenB);
    const reqs = unwrap(reqsRaw) || [];
    console.log('Requests for B count:', Array.isArray(reqs) ? reqs.length : (reqs && reqs.length));

    // B accepts request
    const acc = await post(`${REQUEST_ACCEPT}/${requestId}`, {}, tokenB);
    console.log('Accept status:', acc && acc.status, acc && acc.data);

    // Verify friends lists
    const friendsA1Raw = await get(FRIENDS_GET, tokenA);
    const friendsB1Raw = await get(FRIENDS_GET, tokenB);
    const friendsA1 = unwrap(friendsA1Raw) || [];
    const friendsB1 = unwrap(friendsB1Raw) || [];
    console.log('Friends A count after accept:', friendsA1.length);
    console.log('Friends B count after accept:', friendsB1.length);
    const aHasB = (friendsA1||[]).some(f=>String(f._id||f)===String(idB));
    const bHasA = (friendsB1||[]).some(f=>String(f._id||f)===String(idA));
    console.log('Mutual friendship present?', aHasB && bHasA);

    // B removes friendship with A
    const rem = await post(`${FRIENDS_REMOVE}/${idA}`, {}, tokenB);
    console.log('Remove friendship status:', rem && rem.status, rem && rem.data);

    // Verify removal
    const friendsB2Raw = await get(FRIENDS_GET, tokenB);
    const friendsB2 = unwrap(friendsB2Raw) || [];
    console.log('Friends B count after remove:', friendsB2.length);
    const bHasA2 = (friendsB2||[]).some(f=>String(f._id||f)===String(idA));
    console.log('Friend removed?', !bHasA2);

    // B follows A (toggle)
    const fol1 = await post(`${FOLLOW}/${idA}`, {}, tokenB);
    console.log('Follow toggle result:', fol1 && fol1.data, 'status:', fol1 && fol1.status);
    const fol2 = await post(`${FOLLOW}/${idA}`, {}, tokenB);
    console.log('Follow toggle 2 result (should undo):', fol2 && fol2.data, 'status:', fol2 && fol2.status);

    // Signout tokenA
    const soA = await post(SIGNOUT, {}, tokenA);
    console.log('Signout A status:', soA && soA.status);
    const afterA = await get(AUTH_USER, tokenA);
    console.log('Auth with tokenA after signout status:', afterA && afterA.status, afterA && afterA.data);

    // Ensure tokenB still works
    const afterB = await get(AUTH_USER, tokenB);
    console.log('Auth with tokenB status:', afterB && afterB.status);

    console.log('Full journey test complete');
  }catch(err){
    console.error('Test error', err && err.response && err.response.data || err && err.stack || err);
  }
})();
