// Smoke test: issue a token, revoke it via signout endpoint, then ensure request fails
const axios = require('axios');
const WebSocket = require('ws');
require('dotenv').config();

const base = process.env.API_BASE || 'http://127.0.0.1:3300';
const testUser = { email: 'user25@example.com', password: '123456789' };

async function run(){
  try{
    console.log('Signing in');
    const r = await axios.post(`${base}/api/v1/auth/signin`, testUser);
    console.log('Signin response:', JSON.stringify(r.data).slice(0,200));
    const token = (r.data && (r.data.token || (r.data.data && r.data.data.token))) || null;
    if (!token) throw new Error('No token returned from signin');
    console.log('Got token length', token.length);

    // Use token to hit auth user
    const me = await axios.get(`${base}/api/v1/auth/user`, { headers: { Authorization: `Bearer ${token}` } });
    console.log('Auth user OK', me.data.success);

    // Sign out (revoke)
    await axios.post(`${base}/api/v1/auth/signout`, {}, { headers: { Authorization: `Bearer ${token}` } });
    console.log('Signed out (revoked)');

    // Try to call protected route again
    try{
      await axios.get(`${base}/api/v1/auth/user`, { headers: { Authorization: `Bearer ${token}` } });
      console.error('ERROR: revoked token still accepted (HTTP)');
    }catch(e){
      console.log('HTTP revoked token rejected as expected:', e.response && e.response.status);
    }

    // WebSocket (Socket.IO) connect using socket.io-client so Engine.IO handshake is performed correctly
    try {
      const { io } = require('socket.io-client');
      const socket = io(base, {
        path: '/socket.io',
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true
      });
      socket.on('connect', () => console.log('WS connected (unexpected)'));
      socket.on('connect_error', (err) => console.log('WS connection failed (expected):', err && err.message));
      socket.on('error', (err) => console.log('WS error (expected):', err && err.message));
    } catch (err) {
      console.log('socket.io-client not installed; skipping WS check. Install with `npm install socket.io-client`', err && err.message);
    }

  }catch(e){
    console.error('Smoke test failed', e && e.message);
  }
}

run();
