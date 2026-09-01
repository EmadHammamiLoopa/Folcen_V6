const mongoose = require('mongoose');
const User = require('../app/models/User');

async function main(){
if (!process.env.MONGODB_URL) {
  throw new Error('MONGODB_URL is required');
}

  const mongo = process.env.MONGODB_URL;
  await mongoose.connect(mongo);
  const email = process.env.TEST_EMAIL || 'tester@example.com';
  const existing = await User.findOne({ email });
  if (existing) { console.log('User exists:', existing._id); process.exit(0); }
  const u = new User({ firstName: 'Test', lastName: 'User', email, gender: 'other', birthDate: '1990-01-01' });
  u.password = process.env.TEST_PASSWORD || '123456789';
  await u.save();
  console.log('Created user', u._id, 'email', u.email);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(2); });
