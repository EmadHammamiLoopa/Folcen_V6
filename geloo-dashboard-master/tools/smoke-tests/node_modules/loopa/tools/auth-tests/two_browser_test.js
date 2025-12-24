/*
 Simple test script to verify:
 1) Two different users can sign in and receive different JWTs.
 2) Using token A yields user A profile; token B yields user B profile.
 3) Signing out token A revokes it and subsequent calls with token A fail.

 Usage:
  - Ensure server is running (node index.js)
  - Optionally set REDIS_URL in env to test Redis-backed blacklist
  - Install dependencies: `npm i axios`
  - Run: `node tools/auth-tests/two_browser_test.js`
*/

const axios = require('axios');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3300';
const SIGNIN = BASE + '/api/v1/auth/signin';
const AUTH_USER = BASE + '/api/v1/auth/user';
const SIGNOUT = BASE + '/api/v1/auth/signout';

async function signin(email, password) {
  const res = await axios.post(SIGNIN, { email, password }).catch(e => e.response || e);
  return res;
}

async function authUser(token) {
  const res = await axios.get(AUTH_USER, { headers: { Authorization: `Bearer ${token}` } }).catch(e => e.response || e);
  return res;
}

async function signout(token) {
  const res = await axios.post(SIGNOUT, {}, { headers: { Authorization: `Bearer ${token}` } }).catch(e => e.response || e);
  return res;
}

(async () => {
  try {
    console.log('Starting two-browser auth isolation test');

    // Replace these with two test accounts in your DB
    const userA = { email: process.env.TEST_USER_A_EMAIL || 'usera@example.com', password: process.env.TEST_USER_A_PASS || 'passwordA' };
    const userB = { email: process.env.TEST_USER_B_EMAIL || 'userb@example.com', password: process.env.TEST_USER_B_PASS || 'passwordB' };

    const rA = await signin(userA.email, userA.password);
    const rB = await signin(userB.email, userB.password);

    if (!rA || !rA.data || !rA.data.token) return console.error('Signin A failed', rA && rA.data);
    if (!rB || !rB.data || !rB.data.token) return console.error('Signin B failed', rB && rB.data);

    const tokenA = rA.data.token;
    const tokenB = rB.data.token;

    console.log('Token A length:', tokenA.length, 'Token B length:', tokenB.length);

    const pA = await authUser(tokenA);
    const pB = await authUser(tokenB);

    console.log('Profile A id:', pA && pA.data && pA.data._id);
    console.log('Profile B id:', pB && pB.data && pB.data._id);

    if (pA && pB && pA.data && pB.data && pA.data._id !== pB.data._id) {
      console.log('✅ Isolation verified: different tokens yield different profiles');
    } else {
      console.error('❌ Isolation FAILED: profiles match or missing');
    }

    // Now revoke tokenA
    const so = await signout(tokenA);
    console.log('Signout A status:', so && so.status);

    const afterA = await authUser(tokenA);
    if (afterA && afterA.status && afterA.status === 401) {
      console.log('✅ Revocation verified: token A rejected after signout');
    } else {
      console.error('❌ Revocation FAILED: token A still accepted', afterA && (afterA.data || afterA.status));
    }

    // Ensure tokenB still works
    const afterB = await authUser(tokenB);
    if (afterB && afterB.status && afterB.status === 200) {
      console.log('✅ Token B still valid after token A signout');
    } else {
      console.error('❌ Unexpected: token B invalid after token A signout', afterB && afterB.data);
    }

    console.log('Test complete');
  } catch (err) {
    console.error('Test script error', err && err.stack || err);
  }
})();
