export const environment = {
  production: false,
  apiUrl: 'http://127.0.0.1:3300/api/v1',
  socketUrl: 'http://127.0.0.1:3300', // Browser on same machine
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
  // Set these per release branch. Never delete code — just toggle here.
  // v0.9 (beta): all false  |  v1.0: calls=false  |  v1.1+: all true
  features: {
    randomVideoCall: false,   // v1.1 — Video call a stranger from the new-friends discovery/swipe screen
    friendVideoCall: true,    // enabled in v1.0 (friends only)
    marketplace:     false,   // v1.2 — Buy & Sell listings
    jobsBoard:       false,   // v1.2 — Jobs board
    servicesBoard:   false,   // v1.2 — Services / small-business board
    inviteRewards:   false,   // v1.0 — Invite-a-friend reward system
    publicPostLinks: false,   // v1.0 — Shareable public links for posts/channels
    stories:         false,   // v1.1 — 24h disappearing status / story feature
    premiumTier:     false,   // v2.0 — Paid subscription UI
    groupVideoCalls: false,   // v2.0 — Group video calls (up to 8 people, not yet built)
  },
};
