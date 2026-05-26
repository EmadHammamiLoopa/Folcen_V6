export const environment = {
  production: false,
  // Release/v0.9 debug APKs should hit production backend when installed on physical devices.
  apiUrl: 'https://folcenv6-production.up.railway.app/api/v1',
  socketUrl: 'https://folcenv6-production.up.railway.app',
  socketPath: '/socket.io',
  SELLER_DISCLAIMER_VERSION: 'v1.0',

  // ── Feature flags ──────────────────────────────────────────────────────────
  // Set these per release branch. Never delete code — just toggle here.
  // v0.9 (beta): all false  |  v1.0: calls=false  |  v1.1+: all true
  features: {
    randomVideoCall: false,   // v1.1 — Video call a stranger from the new-friends discovery/swipe screen
    friendVideoCall: false,   // v1.1 — Video call an existing friend/contact from chat or profile
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
