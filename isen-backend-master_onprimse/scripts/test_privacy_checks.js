/**
 * Lightweight privacy smoke tests
 * - anonymization of post responses
 * - call event creation and purge behaviour (manual purge)
 * - message events do not contain content
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { anonymizeObject } = require('../app/utils/privacy');
const { createCallRequest } = require('../app/utils/eventLogger');
const CallEvent = require('../app/models/CallEvent');
const MessageEvent = require('../app/models/MessageEvent');
const User = require('../app/models/User');

async function main(){
  const mongo = process.env.MONGODB_URL || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/isen_test';
  await mongoose.connect(mongo, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to', mongo);

  // Create a fake user
  let user = await User.findOne({ email: 'privacy-test@example.com' });
  if (!user) user = await new User({ email: 'privacy-test@example.com', firstName: 'Privacy', lastName: 'Tester' }).save();

  // Test anonymization
  const post = { _id: 'post123456', anonyme: true, user: { _id: user._id, email: user.email } };
  const anon = anonymizeObject(post);
  if (anon.user && anon.user.anonymous) console.log('PASS: post anonymized'); else { console.error('FAIL: post not anonymized', anon); process.exit(2); }

  // Test call event creation and purge
  const created = await createCallRequest({ initiatedBy: user._id, participants: [user._id], initialEvent: 'requested' });
  console.log('Created call event', created.callId || created._id);

  // Force expiresAt to past for purge simulation
  await CallEvent.updateOne({ _id: created._id }, { $set: { expiresAt: new Date(Date.now() - 1000 * 60) } });
  const deleted = await CallEvent.deleteMany({ expiresAt: { $lte: new Date() }, linkedReport: null });
  if (deleted.deletedCount > 0) console.log('PASS: call event purge simulation removed records'); else console.error('WARN: purge simulation removed 0 records');

  // MessageEvent should not contain message content
  const me = new MessageEvent({ from: user._id, to: user._id, event: 'send_attempt' });
  await me.save();
  const found = await MessageEvent.findById(me._id).lean();
  if (!found.text && !found.body) console.log('PASS: message event saved without content'); else console.error('FAIL: message event contains content fields');

  await mongoose.disconnect();
  console.log('Tests completed');
}

main().catch(e=>{ console.error('Test error', e); process.exit(3); });
