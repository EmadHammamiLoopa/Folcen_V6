export const environment = {
  production: true,
  apiUrl: 'https://folcenv6-production.up.railway.app/api/v1',  // ⚠️ CHANGE THIS TO YOUR DEPLOYED BACKEND URL
  socketUrl: 'https://folcenv6-production.up.railway.app',
  socketPath: '/socket.io',
  SELLER_DISCLAIMER_VERSION: 'v1.0',
  firebase: {
    apiKey: 'AIzaSyDhsfCyHSsvwjhGLTSPP4lhMtgpFGv2lsI',
    authDomain: 'folcen-8fd1c.firebaseapp.com',
    projectId: 'folcen-8fd1c',
    storageBucket: 'folcen-8fd1c.firebasestorage.app',
    messagingSenderId: '309126815402',
    appId: '1:309126815402:android:825e97660fdf00e09fbad3',
    androidApiKey: 'AIzaSyCswx6wNkbKdJ9ZQlw7WyEjSIqaAR66y0g',
    androidClientId: '309126815402-una13j61s1q9t1saq9bss49b54ansfro.apps.googleusercontent.com',
    webClientId: '309126815402-vnscbcqta4nluub7mviotq9c3ahf4605.apps.googleusercontent.com'
  },

  // ── Feature flags ──────────────────────────────────────────────────────────
  // v1.0 public launch: calls, marketplace, jobs, services all hidden.
  // To release v1.1: set videoCalls=true and create a release/v1.1 branch.
  features: {
    randomVideoCall: false,   // unlock in v1.1 (Sep 2026) — stranger video from discovery screen
    friendVideoCall: true,    // enabled in v1.0 (friends only)
    marketplace:     false,   // unlock in v1.2 (Dec 2026)
    jobsBoard:       false,   // unlock in v1.2 (Dec 2026)
    servicesBoard:   false,   // unlock in v1.2 (Dec 2026)
    inviteRewards:   false,   // unlock in v1.0 launch
    publicPostLinks: false,   // unlock in v1.0 launch
    stories:         false,   // unlock in v1.1 (Sep 2026)
    premiumTier:     false,   // unlock in v2.0 (Mar 2027)
    groupVideoCalls: false,   // unlock in v2.0 (Mar 2027) — not yet built
  },
};
