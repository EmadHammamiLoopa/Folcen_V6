/*********************************************************************
 * app/services/firebaseAdmin.js
 * -------------------------------------------------------------------
 * Initialises Firebase Admin SDK once and exports the admin instance.
 * Looks for config/firebase-service-account.json (relative to repo
 * root), or override with FIREBASE_SERVICE_ACCOUNT_PATH env var.
 *********************************************************************/

const admin = require('firebase-admin');
const path = require('path');

const SERVICE_ACCOUNT_PATH =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
  path.join(__dirname, '..', '..', 'config', 'firebase-service-account.json');

if (!admin.apps.length) {
  try {
    const serviceAccount = require(SERVICE_ACCOUNT_PATH);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('[firebaseAdmin] Firebase Admin SDK initialised successfully.');
  } catch (err) {
    // Non-fatal: push notifications will be silently skipped if Admin fails to init.
    console.error(
      '[firebaseAdmin] Failed to initialize Firebase Admin SDK.',
      'Set FIREBASE_SERVICE_ACCOUNT_PATH to the correct JSON path.',
      err.message
    );
  }
}

/**
 * Returns the firebase-admin instance (may be uninitialized if creds are missing).
 * Callers should guard with admin.apps.length > 0 before sending messages.
 */
function getAdmin() {
  return admin;
}

module.exports = { admin, getAdmin };
