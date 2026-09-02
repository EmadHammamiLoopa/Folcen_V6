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

const {
  initializeApp,
  cert,
  getApps,
} = require('firebase-admin/app');

const {
  getAuth,
} = require('firebase-admin/auth');

const {
  getMessaging,
} = require('firebase-admin/messaging');

if (!getApps().length) {
  try {
    let credential;

      // Local dev: load from JSON file
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      credential = cert(serviceAccount);
    } else if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    ) {
      credential = cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      });
    } else {
      throw new Error('No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.');
    }

    initializeApp({ credential });
    console.log('[firebaseAdmin] Firebase Admin SDK initialised successfully.');
    // Non-fatal: push notifications will be silently skipped if Admin fails to init.
  } catch (err) {
    console.error(
      '[firebaseAdmin] Failed to initialize Firebase Admin SDK:',
      err.message
    );
  }
}

/*
 * Firebase Admin v14 removed the legacy namespaced root API.
 * Preserve Folcen's local admin.apps/auth()/messaging() contract
 * while using supported modular SDK entrypoints internally.
 */
const admin = {
  get apps() {
    return getApps();
  },

  auth() {
    return getAuth();
  },

  messaging() {
    return getMessaging();
  },
};

function getAdmin() {
  return admin;
}


module.exports = { admin, getAdmin };
