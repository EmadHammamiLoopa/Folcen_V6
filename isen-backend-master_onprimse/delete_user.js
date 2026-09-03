/**
 * delete_user.js — One-time cleanup script
 * Deletes a user from BOTH Firebase Auth and MongoDB.
 *
 * Usage (run from the isen-backend-master_onprimse/ directory):
 *   node delete_user.js emad.hammami@outlook.com
 *
 * Required env vars (same as the main backend):
 *   MONGODB_URL
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 *
 * On Railway: open the service shell and run the command above.
 */

'use strict';

try { require('dotenv').config(); } catch (e) { /* no .env locally */ }

const email = (process.argv[2] || '').toLowerCase().trim();
if (!email) {
  console.error('Usage: node delete_user.js <email>');
  process.exit(1);
}

const {
  initializeApp,
  cert,
  getApps,
} = require('firebase-admin/app');

const {
  getAuth,
} = require('firebase-admin/auth');
const mongoose = require('mongoose');

// ── Firebase Admin ────────────────────────────────────────────────────────────
if (getApps().length === 0) {
  const {
    FIREBASE_PROJECT_ID: projectId,
    FIREBASE_CLIENT_EMAIL: clientEmail,
    FIREBASE_PRIVATE_KEY: rawKey,
    FIREBASE_SERVICE_ACCOUNT_PATH: saPath
  } = process.env;

  let credential;
  if (saPath) {
    credential = cert(require(saPath));
  } else if (projectId && clientEmail && rawKey) {
    credential = cert({
      projectId,
      clientEmail,
      privateKey: rawKey.replace(/\\n/g, '\n'),
    });
  } else {
    console.error('[Firebase] Missing credentials. Set FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.');
    process.exit(1);
  }
  initializeApp({ credential });
}

// ── MongoDB User model (minimal) ──────────────────────────────────────────────
const MONGODB_URL = process.env.MONGODB_URL;
if (!MONGODB_URL) {
  console.error('[MongoDB] MONGODB_URL env var is not set.');
  process.exit(1);
}

const userSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.models.User || mongoose.model('User', userSchema, 'users');

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nDeleting user: ${email}\n`);

  // 1. Firebase
  try {
    const auth = getAuth();
    const fbUser = await auth.getUserByEmail(email);
    await auth.deleteUser(fbUser.uid);
    console.log(`✅  Firebase: deleted (uid=${fbUser.uid})`);
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      console.log('ℹ️   Firebase: user not found (already clean)');
    } else {
      console.error('❌  Firebase error:', e.message);
    }
  }

  // 2. MongoDB
  await mongoose.connect(MONGODB_URL, { serverSelectionTimeoutMS: 10000 });
  const result = await User.deleteMany({ email });
  if (result.deletedCount > 0) {
    console.log(`✅  MongoDB: deleted ${result.deletedCount} document(s)`);
  } else {
    console.log('ℹ️   MongoDB: user not found (already clean)');
  }

  await mongoose.disconnect();
  console.log('\nDone.\n');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
