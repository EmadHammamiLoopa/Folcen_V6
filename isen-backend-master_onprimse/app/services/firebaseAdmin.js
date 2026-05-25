/*********************************************************************
 * app/services/firebaseAdmin.js
 * -------------------------------------------------------------------
 * Initialises Firebase Admin SDK once and exports the admin instance.
 *
 * Credential resolution order:
 *  1. FIREBASE_SERVICE_ACCOUNT_PATH — path to a service-account JSON file
 *  2. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *     — individual env vars (used on Railway / cloud deployments where
 *       uploading a JSON file is not possible)
 *********************************************************************/

const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    let credential;

    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      // Local dev: load from JSON file
      const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      credential = admin.credential.cert(serviceAccount);
    } else if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    ) {
      // Cloud deployment: use individual env vars
      // Railway stores the private key with literal \n — replace them
      credential = admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      });
    } else {
      throw new Error('No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.');
    }

    admin.initializeApp({ credential });
    console.log('[firebaseAdmin] Firebase Admin SDK initialised successfully.');
  } catch (err) {
    // Non-fatal: push notifications will be silently skipped if Admin fails to init.
    console.error(
      '[firebaseAdmin] Failed to initialize Firebase Admin SDK:',
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

