// Simple smoke test for GDPR acceptance flows
// Usage: set SERVER_URL and TEST_EMAIL/TEST_PASSWORD in env or defaults will be used
const fetch = global.fetch || require('node-fetch');
const SERVER = process.env.SERVER_URL || 'http://127.0.0.1:3300';
const signin = async (email, password) => {
  const res = await fetch(`${SERVER}/api/v1/auth/signin`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
  });
  return res.json();
};

const readBody = async (res) => {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
};

const postAcceptance = async (token, payload) => {
  const res = await fetch(`${SERVER}/api/v1/gdpr/acceptance`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(payload)
  });
  return readBody(res);
};

const portability = async (token) => {
  const res = await fetch(`${SERVER}/api/v1/gdpr/portability`, { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } });
  return readBody(res);
};

(async function(){
  const email = process.env.TEST_EMAIL || 'tester@example.com';
  const password = process.env.TEST_PASSWORD || '123456789';
  console.log('Signing in as', email);
  let j;
  try { j = await signin(email, password); } catch (e) { console.error('Signin failed', e); process.exit(2); }
  if (!j || !(j.data && j.data.token) && !j.token) { console.error('Signin did not return token', j); process.exit(3); }
  const token = (j.data && j.data.token) || j.token;
  console.log('Got token length', token.length);

  const payload = { documentType: 'terms', documentVersion: 'v1.0', acceptanceContext: 'signup', meta: { client: 'smoke-test' } };
  let a;
  try { a = await postAcceptance(token, payload); console.log('Acceptance response:', a); } catch (e) { console.error('Acceptance request failed', e); process.exit(4); }

  // Validate acceptance response shape
  if (!a || !(a.success || a.data)) {
    console.error('Acceptance response not successful', a);
    process.exit(5);
  }

  try {
    const p = await portability(token);
    const count = Array.isArray(p.data && p.data.legalAcceptances) ? p.data.legalAcceptances.length : 0;
    console.log('Portability response includes legalAcceptances:', count);
    if (count === 0) {
      console.error('Portability export missing legal acceptances');
      process.exit(6);
    }
  } catch (e) { console.error('Portability request failed', e); process.exit(7); }

  console.log('GDPR acceptance smoke test completed successfully');
  process.exit(0);
})();
