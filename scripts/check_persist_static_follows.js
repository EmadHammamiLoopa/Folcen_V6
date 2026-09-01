(async () => {
  try {
    const API = process.env.API_BASE || 'http://localhost:3300';
    // Support passing credentials as CLI args: node script.js email password
    const argv = process.argv.slice(2);
    const email = argv[0] || process.env.EMAIL;
    const password = argv[1] || process.env.PASSWORD;
    if (!email || !password) {
      console.error('EMAIL and PASSWORD must be provided as environment variables');
      process.exit(1);
    }

    // Sign in
    const signinResp = await fetch(`${API}/api/v1/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!signinResp.ok) {
      const text = await signinResp.text();
      console.error('Signin failed:', signinResp.status, text);
      process.exit(2);
    }

    const signinJson = await signinResp.json();
    // token may be in different shapes
    const token = (signinJson.data && signinJson.data.token) || signinJson.token || (signinJson.data && signinJson.data.data && signinJson.data.data.token);
    if (!token) {
      console.error('Signin succeeded but no token found in response');
      console.error('Response sample (sanitized):', JSON.stringify(Object.keys(signinJson).reduce((acc,k)=>{acc[k]=typeof signinJson[k];return acc},{})));
      process.exit(3);
    }

    console.log('✅ Signed in successfully (token obtained).');

      // Get authenticated user info to check city/country
      const userResp = await fetch(`${API}/api/v1/auth/user`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      let authUser = null;
      if (userResp.ok) {
        const userJson = await userResp.json();
        authUser = userJson.data || userJson.user || userJson;
        console.log('Authenticated user:', { id: authUser._id || authUser.id, city: authUser.city || null, country: authUser.country || null });
      } else {
        console.warn('Could not fetch auth user info:', userResp.status, await userResp.text());
      }

      // Call followed channels endpoint which ensures static channels are created and followed server-side
      const followedResp = await fetch(`${API}/api/v1/channel/followed`, {
        headers: { Authorization: `Bearer ${token}` },
      });

    if (!followedResp.ok) {
      const t = await followedResp.text();
      console.error('Failed to fetch followed channels:', followedResp.status, t);
      process.exit(4);
    }

    const followedJson = await followedResp.json();
    const channels = followedJson.channels || (followedJson.data && followedJson.data.channels) || [];

    console.log(`Found ${channels.length} followed channels for the authenticated user.`);
    const staticChannels = channels.filter(c => c.type && (c.type.startsWith('static') || c.static));
    if (staticChannels.length > 0) {
      console.log('Static channels persisted server-side:');
      staticChannels.forEach(c => console.log(`- ${c.name || c._id} (type:${c.type || c.static ? 'static' : 'n/a'})`));
      process.exit(0);
    } else {
      console.log('No static channels found in followed channels response.');
      console.log('Full channels sample (first 5):', channels.slice(0,5).map(c => ({ name: c.name, type: c.type, city: c.city })));
      // As a next step, connect directly to MongoDB and list static channels in the user's city
      try {
        const mongoose = require('mongoose');
        const mongoUri = process.env.MONGODB_URL;
        if (!mongoUri) {
          console.error('MONGODB_URL is required for the direct database check');
          process.exit(7);
        }
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB to inspect static channels');

        const Channel = mongoose.model('Channel', new mongoose.Schema({}, { strict: false }), 'channels');
        const city = (authUser && (authUser.city || authUser.cityName)) || argv[2] || process.env.CITY;
        if (!city) {
          console.warn('City not available to query static channels. Skipping DB check.');
          process.exit(6);
        }

        const staticTypes = ['static', 'static_events', 'static_dating'];
        const dbChannels = await Channel.find({ city: city, type: { $in: staticTypes } }).lean().limit(50);
        console.log(`Found ${dbChannels.length} static channels in city ${city}`);
        const userIdFromToken = (function() {
          try {
            const parts = token.split('.');
            const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
            return payload._id || payload.id || payload.sub || null;
          } catch (e) { return null; }
        })();

        dbChannels.forEach(c => {
          const followerIds = (c.followers || []).map(f => (f && f.toString) ? f.toString() : String(f));
          const includesUser = userIdFromToken ? followerIds.includes(userIdFromToken.toString()) : false;
          console.log(`- ${c.name || c._id} (type:${c.type}) followers:${followerIds.length} includesUser:${includesUser}`);
        });

        await mongoose.disconnect();
        process.exit(0);
      } catch (dbErr) {
        console.error('DB inspection failed:', dbErr && dbErr.message ? dbErr.message : dbErr);
        process.exit(7);
      }
    }
  } catch (err) {
    console.error('Script error:', err && err.message ? err.message : err);
    process.exit(10);
  }
})();
