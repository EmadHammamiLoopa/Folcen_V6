/**
 * One-time script: mark emailVerified=true for any account that already has
 * a firebaseUid set (meaning they authenticated via Firebase — email was
 * already verified at the Firebase layer).
 *
 * Usage:  node scripts/verify-dev-account.js
 *   OR    node scripts/verify-dev-account.js emad.hammami@outlook.com
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../app/models/User');

const target = process.argv[2]; // optional email filter

async function run() {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected to MongoDB');

    const filter = target
        ? { email: target, emailVerified: false }
        : { firebaseUid: { $exists: true, $ne: null }, emailVerified: false };

    const result = await User.updateMany(filter, { $set: { emailVerified: true } });
    console.log(`Updated ${result.modifiedCount} user(s) → emailVerified: true`);

    if (target) {
        const u = await User.findOne({ email: target }).select('email emailVerified firebaseUid').lean();
        console.log('Account state:', u);
    }

    await mongoose.disconnect();
    console.log('Done.');
}

run().catch(err => { console.error(err); process.exit(1); });
