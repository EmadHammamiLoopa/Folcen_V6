// Quick audit: sign in, ensure token contains `jti`, and attempt a Socket.IO handshake
const io = require('socket.io-client');
const jwt = require('jsonwebtoken');

const fetch = global.fetch || (async (...args) => {
  const mod = await import('node-fetch');
  return mod.default(...args);
});

const SERVER = process.env.SERVER_URL || 'http://127.0.0.1:3300';
const TEST_EMAIL = process.env.TEST_EMAIL || 'admin@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'admin123';

async function signin(email, password) {
  const candidates = [`${SERVER}/api/v1/auth/signin`, `${SERVER}/api/v1/signin`];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const text = await res.text();
      try { return JSON.parse(text); } catch (e) { console.error('Signin response not JSON from', url, ':', text.slice(0,400)); }
    } catch (e) {
      console.warn('Signin HTTP failed for', url, e && e.message);
    }
  }
  return null;
}

async function httpGet(path, token) {
  try {
    const res = await fetch(`${SERVER}${path}`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
    const text = await res.text();
    try { return { status: res.status, body: JSON.parse(text) }; } catch (e) { return { status: res.status, body: text }; }
  } catch (e) {
    return { error: e.message };
  }
}

(async () => {
  console.log('Signing in...');
  const j = await signin(TEST_EMAIL, TEST_PASSWORD);
  const token = (j && j.data && j.data.token) || j.token;
  if (!token) return console.error('No token returned', j);
  console.log('Token length', token.length);
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.jti) {
      console.error('Token missing jti claim', decoded);
      process.exit(2);
    }
    console.log('Found jti:', decoded.jti);
  } catch (e) {
    console.error('Failed to decode token', e);
    process.exit(3);
  }

  // --- connect socket and verify authenticated HTTP request works ---
  console.log('Testing Socket.IO handshake (initial) ...');
  const socket = io(SERVER, { auth: { token }, path: '/socket.io', timeout: 5000, reconnection: false, forceNew: true });

  const connected = await new Promise((resolve) => {
    let resolved = false;
    socket.on('connect', () => { if (!resolved) { resolved = true; resolve(true); } });
    socket.on('connect_error', (err) => { if (!resolved) { resolved = true; resolve({ error: err && err.message ? err.message : String(err), raw: err }); } });
    setTimeout(() => { if (!resolved) { resolved = true; resolve({ error: 'timeout' }); } }, 6000);
  });

  if (connected && connected.error) {
    console.error('Initial socket handshake failed:', connected.error);
    process.exit(11);
  }
  console.log('Socket connected successfully (initial)');

  // Verify an authenticated HTTP endpoint works
  const userResp = await httpGet('/api/v1/auth/user', token);
  console.log('Authenticated HTTP /api/v1/user status:', userResp && userResp.status);
  if (!userResp || userResp.status !== 200) {
    console.error('Authenticated HTTP call failed before revocation:', userResp);
    socket.close();
    process.exit(12);
  }

  // --- revoke token via signout ---
  console.log('Calling signout to revoke token...');
  try {
    const r = await fetch(`${SERVER}/api/v1/auth/signout`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const txt = await r.text();
    console.log('Signout response:', r.status, txt.slice(0,200));
  } catch (e) { console.error('Signout call failed', e && e.message); }

  // Allow a short window for revocation to take effect and for server to possibly disconnect sockets
  await new Promise(s => setTimeout(s, 1000));

  // Existing socket: check if disconnected
  const wasDisconnected = await new Promise((resolve) => {
    let resolved = false;
    socket.on('disconnect', (reason) => { if (!resolved) { resolved = true; resolve({ disconnected: true, reason }); } });
    setTimeout(() => { if (!resolved) { resolved = true; resolve({ disconnected: false }); } }, 2000);
  });

  if (wasDisconnected && wasDisconnected.disconnected) console.log('Existing socket was disconnected by server after signout:', wasDisconnected.reason);
  else console.log('Existing socket remained connected after signout (server did not forcibly disconnect)');

  // Verify HTTP call now fails with 401
  const userRespAfter = await httpGet('/api/v1/auth/user', token);
  console.log('Authenticated HTTP /api/v1/user after signout status:', userRespAfter && userRespAfter.status);

  // Attempt a NEW socket connection with the revoked token (should be rejected)
  console.log('Attempting new socket connection with revoked token (should fail)...');
  const newSocketResult = await new Promise((resolve) => {
    const s2 = io(SERVER, { auth: { token }, path: '/socket.io', timeout: 5000, reconnection: false, forceNew: true });
    let done = false;
    s2.on('connect', () => { if (!done) { done = true; s2.close(); resolve({ connected: true }); } });
    s2.on('connect_error', (err) => { if (!done) { done = true; resolve({ error: err && err.message ? err.message : String(err), raw: err }); } });
    setTimeout(() => { if (!done) { done = true; resolve({ error: 'timeout' }); } }, 6000);
  });

  console.log('New socket attempt result:', newSocketResult);

  socket.close();

  // Evaluate outcomes
  const revokedHttp = userRespAfter && userRespAfter.status === 401;
  const newSocketRejected = newSocketResult && newSocketResult.error;

  if (revokedHttp && newSocketRejected) {
    console.log('Full revocation flow validated: HTTP revoked and new socket connections rejected.');
    process.exit(0);
  }

  console.error('Revocation flow partial/failure. revokedHttp=', revokedHttp, 'newSocketRejected=', newSocketRejected);
  process.exit(20);

})();
