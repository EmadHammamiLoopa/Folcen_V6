export const environment = {
  production: true,
  apiUrl: 'https://folcenv6-production.up.railway.app/api/v1',  // ⚠️ CHANGE THIS TO YOUR DEPLOYED BACKEND URL
  socketUrl: 'https://folcenv6-production.up.railway.app',
  socketPath: '/socket.io',
  SELLER_DISCLAIMER_VERSION: 'v1.0',

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
