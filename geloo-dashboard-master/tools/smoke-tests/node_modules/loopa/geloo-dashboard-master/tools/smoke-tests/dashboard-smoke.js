#!/usr/bin/env node
// Simple smoke test for backend endpoints used by the dashboard.
// Usage: API_URL=http://127.0.0.1:3300/api/v1 AUTH_TOKEN=Bearer__TOKEN__ node dashboard-smoke.js

const axios = require('axios');
const API_URL = process.env.API_URL || 'http://127.0.0.1:3300/api/v1';
let AUTH = process.env.AUTH_TOKEN || process.env.AUTH || '';
const TEST_EMAIL = process.env.TEST_EMAIL || 'admin@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const headers = () => AUTH ? { Authorization: AUTH } : {};

async function run(){
  try{
    console.log('Using API:', API_URL);
    // If no AUTH provided, try to sign in using TEST_EMAIL/TEST_PASSWORD
    if (!AUTH) {
      console.log('No AUTH_TOKEN provided — attempting signin with TEST_EMAIL/TEST_PASSWORD');
      try {
        const signinCandidates = [`${API_URL.replace(/\/api\/v1\/?$/,'')}/api/v1/auth/signin`, `${API_URL.replace(/\/api\/v1\/?$/,'')}/api/v1/signin`, `${API_URL}/auth/signin`, `${API_URL}/signin`];
        for (const url of signinCandidates) {
          try {
            const r = await axios.post(url, { email: TEST_EMAIL, password: TEST_PASSWORD });
            const token = (r.data && r.data.data && r.data.data.token) || r.data.token;
            if (token) { AUTH = `Bearer ${token}`; console.log('Signin succeeded, token obtained from', url); break; }
          } catch (e) { /* try next */ }
        }
      } catch (e) { /* ignore */ }
    }

    console.log('1) GET /user/all?page=1&limit=1');
    const all = await axios.get(`${API_URL}/user/all`, { headers: headers(), params: { page: 1, limit: 1 } });
    console.log('-> status', all.status);
    if(!all.data || !all.data.data || !all.data.data.docs || !all.data.data.docs.length){
      console.warn('No users found in /user/all response. Raw:', JSON.stringify(all.data).slice(0,400));
    } else {
      const user = all.data.data.docs[0];
      console.log('-> sample user id:', user._id || user.id);
      // extract id string from various shapes (Buffer/ObjectId-like)
      function extractId(v) {
        if (!v) return '';
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object') {
          if (v.$oid) return String(v.$oid);
          if (v.toHexString && typeof v.toHexString === 'function') return v.toHexString();
          if (v.buffer && (Array.isArray(v.buffer) || typeof v.buffer === 'object')) {
            // Buffer-like with numeric indexes
            const buf = v.buffer;
            const bytes = Object.keys(buf).map(k => Number(buf[k]));
            return bytes.map(b => b.toString(16).padStart(2,'0')).join('');
          }
          if (Array.isArray(v)) return v.map(x => extractId(x)).join('');
          if (v._id) return extractId(v._id);
          if (v.id) return extractId(v.id);
        }
        try { return JSON.stringify(v); } catch(e) { return '' }
      }

      const id = extractId(user._id || user.id || user);
      console.log(`2) GET /user/dash/${id}`);
      const dash = await axios.get(`${API_URL}/user/dash/${id}`, { headers: headers() });
      console.log('-> /user/dash status', dash.status);
      console.log('-> keys on dash payload:', Object.keys(dash.data || {}).slice(0,20));

      console.log(`3) GET /user/extract/${id}?format=json`);
      const extract = await axios.get(`${API_URL}/user/extract/${id}`, { headers: headers(), params: { format: 'json' } });
      console.log('-> /user/extract status', extract.status);
      console.log('-> extract keys:', Object.keys(extract.data || {}).slice(0,20));
    }

    // --- Create / Update / Delete flow (requires super-admin) ---
    console.log('\n4) CREATE user (POST /user)');
    const newUserPayload = {
      firstName: 'Smoke',
      lastName: 'Tester',
      email: `smoke+${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'USER'
    };
    let createdId = null;
    try {
      const created = await axios.post(`${API_URL}/user`, newUserPayload, { headers: headers() });
      console.log('-> create status', created.status);
      createdId = (created.data && created.data.data && created.data.data._id) || (created.data && created.data._id) || (created.data && created.data.user && created.data.user._id) || null;
      console.log('-> createdId', createdId);
    } catch (e) {
      console.warn('Create user failed (may require super-admin). Response:', e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0,200)}` : e.message);
    }

    if (createdId) {
      try {
        console.log('\n5) UPDATE user (PUT /user/dash/:id)');
        const upd = await axios.put(`${API_URL}/user/dash/${createdId}`, { firstName: 'SmokeUpdated' }, { headers: headers() });
        console.log('-> update status', upd.status);
        console.log('-> updated firstName:', (upd.data && upd.data.data && upd.data.data.firstName) || (upd.data && upd.data.firstName) || 'unknown');
      } catch (e) {
        console.warn('Update failed:', e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0,200)}` : e.message);
      }

      try {
        console.log('\n6) DELETE user (DELETE /user/:id)');
        const del = await axios.delete(`${API_URL}/user/${createdId}`, { headers: headers() });
        console.log('-> delete status', del.status);
      } catch (e) {
        console.warn('Delete failed:', e.response ? `${e.response.status} ${JSON.stringify(e.response.data).slice(0,200)}` : e.message);
      }
    }

    console.log('\nSmoke test done.');
  }catch(e){
    if(e.response){
      console.error('Request failed:', e.response.status, e.response.data ? JSON.stringify(e.response.data).slice(0,500) : e.response.statusText);
    } else {
      console.error('Error:', e.message);
    }
    process.exit(2);
  }
}

run();
