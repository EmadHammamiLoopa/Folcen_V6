/**
 * seed-prod.js — Production seed for Folcen
 *
 * Creates essential system accounts in folcen_prod.
 * Safe to run multiple times — skips accounts that already exist.
 *
 * Usage:
 *   ADMIN_PASS=<yourPassword> SYSTEM_PASS=<yourPassword> TESTER_PASS=<yourPassword> \
 *     node scripts/seed-prod.js
 *
 * Or set in .env then: node scripts/seed-prod.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

// ─── Config ──────────────────────────────────────────────────────────────────

// Always seed into folcen_prod
const MONGO_URL = (process.env.MONGODB_URL || '')
  .replace(/\/\?/, '/folcen_prod?')           // insert db name if missing
  .replace(/mongodb\.net\/$/, 'mongodb.net/folcen_prod');

if (!MONGO_URL || !MONGO_URL.startsWith('mongodb')) {
  console.error('ERROR: MONGODB_URL is not set. Run: MONGODB_URL=... node scripts/seed-prod.js');
  process.exit(1);
}

const ADMIN_PASS   = process.env.ADMIN_PASS   || process.env.SEED_ADMIN_PASS;
const SYSTEM_PASS  = process.env.SYSTEM_PASS  || process.env.SEED_SYSTEM_PASS;
const TESTER_PASS  = process.env.TESTER_PASS  || process.env.SEED_TESTER_PASS;

if (!ADMIN_PASS || !SYSTEM_PASS || !TESTER_PASS) {
  console.error(`
ERROR: Passwords not set. Run with:
  ADMIN_PASS=... SYSTEM_PASS=... TESTER_PASS=... node scripts/seed-prod.js
`);
  process.exit(1);
}

// ─── Accounts ────────────────────────────────────────────────────────────────

const accounts = [
  {
    // The Folcen Team system user — sends welcome messages to new users.
    // AuthController hardcodes ID 66c7ba8cb077a84040bd9ee6 to find this user.
    _id: new mongoose.Types.ObjectId('66c7ba8cb077a84040bd9ee6'),
    firstName:     'Folcen',
    lastName:      'Team',
    email:         'folcenteam@gmail.com',
    password:      SYSTEM_PASS,
    gender:        'male',
    role:          'ADMIN',
    emailVerified: true,
    enabled:       true,
  },
  {
    // Super Admin — used to access the dashboard
    firstName:     'Emad',
    lastName:      'Hammami',
    email:         'emad.hmammy@gmail.com',
    password:      ADMIN_PASS,
    gender:        'male',
    role:          'SUPER ADMIN',
    emailVerified: true,
    enabled:       true,
  },
  {
    // Google Play tester account — add this email in Play Console → Internal Testing
    firstName:     'Folcen',
    lastName:      'Tester',
    email:         'folcen.tester@gmail.com',
    password:      TESTER_PASS,
    gender:        'male',
    role:          'USER',
    country:       'Norway',
    city:          'Oslo',
    emailVerified: true,
    enabled:       true,
  },
];

// ─── Seed ────────────────────────────────────────────────────────────────────

async function seed() {
  console.log(`\nConnecting to: ${MONGO_URL.replace(/:([^@]+)@/, ':****@')}\n`);

  await mongoose.connect(MONGO_URL, {
    useNewUrlParser:    true,
    useUnifiedTopology: true,
  });

  // Load model AFTER connection so mongoose is ready
  const User = require('../app/models/User');

  for (const account of accounts) {
    const existing = await User.findOne({
      $or: [
        { email: account.email },
        ...(account._id ? [{ _id: account._id }] : []),
      ]
    });

    if (existing) {
      // Never silently resurrect an account that entered the explicit
      // deletion lifecycle. Restoration remains an explicit admin action.
      if (existing.isDeleted) {
        console.warn(
          `⚠️  DELETED ${account.email} — explicit restore required`
        );
        continue;
      }

      const repair = {};

      if (existing.role !== account.role) {
        repair.role = account.role;
      }

      if (existing.emailVerified !== true) {
        repair.emailVerified = true;
      }

      if (existing.enabled !== true) {
        repair.enabled = true;
      }

      if (Object.keys(repair).length > 0) {
        await User.updateOne(
          { _id: existing._id },
          { $set: repair }
        );

        console.log(
          `🔧 REPAIRED ${account.email} — ${Object.keys(repair).join(', ')}`
        );
      } else {
        console.log(
          `⏭  SKIP  ${account.email} — already healthy (id: ${existing._id})`
        );
      }

      continue;
    }

    const user = new User(account);
    await user.save();
    console.log(`✅ CREATED ${account.email} (id: ${user._id}, role: ${user.role})`);
  }

  console.log('\nDone.\n');
  await mongoose.connection.close();
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  mongoose.connection.close();
  process.exit(1);
});
