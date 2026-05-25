// Temporary diagnostic — delete after use
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../app/models/User');

const MONGO_URL = process.env.MONGODB_URL;
console.log('Connecting to:', MONGO_URL.replace(/:([^@]+)@/, ':****@'));

mongoose.connect(MONGO_URL).then(async () => {
  console.log('Connected to db:', mongoose.connection.db.databaseName);

  const email = 'emad.hmammy@gmail.com';
  const password = 'ADMIN_PASS';

  const user = await User.findOne({ email: email.toLowerCase() }).exec();
  if (!user) { console.log('❌ USER NOT FOUND'); process.exit(1); }
  console.log('✅ User found:', { email: user.email, enabled: user.enabled, banned: user.banned, hashLen: (user.hashed_password||'').length, salt: user.salt });

  if (user.banned) { console.log('❌ USER IS BANNED'); process.exit(1); }
  if (!user.enabled) { console.log('❌ USER IS DISABLED'); process.exit(1); }

  console.log('isOldFormat:', user.isOldPasswordFormat ? user.isOldPasswordFormat() : '(method not found)');

  const isAuth = await user.authenticate(password);
  console.log('authenticate() returned:', isAuth);

  await mongoose.connection.close();
}).catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
