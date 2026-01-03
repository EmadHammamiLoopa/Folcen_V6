const mongoose = require('mongoose');
const User = require('../app/models/User');

async function main(){
  const mongo = process.env.MONGODB_URL || 'mongodb+srv://isenappnorway:S3WlOS8nf8EwWMmN@cluster0.gwb9wev.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0';
  await mongoose.connect(mongo, { useNewUrlParser: true, useUnifiedTopology: true });
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
