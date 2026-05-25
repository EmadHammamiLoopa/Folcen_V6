# GDPR Production Rollout Checklist

Last updated: 2025  
Scope: Folcen backend (`isen-backend-master_onprimse/`) + admin dashboard (`geloo-dashboard-master/`)

---

## 1. Environment Variables (required before deployment)

| Variable | Default | Purpose |
|---|---|---|
| `NOTIFICATION_RETENTION_DAYS` | 90 | TTL for Notification collection |
| `ACTIVITY_RETENTION_DAYS` | 90 | TTL for Activity collection |
| `USER_ACTIVITY_DAILY_RETENTION_DAYS` | 365 | TTL for UserActivityDaily collection |
| `ANALYTICS_EVENT_RETENTION_DAYS` | 30 | TTL for AnalyticsEvent collection |
| `INTEREST_RECOMPUTE_CRON` | `0 4 * * *` | Cron for interest profile recompute job |
| `JWT_SECRET` | — | Must be set |
| `MONGODB_URL` | — | Must be set |

---

## 2. Database Migration Steps

Run once on the production MongoDB instance (or use Mongoose's TTL auto-creation on restart):

```bash
# TTL indexes are created automatically by Mongoose when the app first boots.
# To verify them on a running instance:
db.notifications.getIndexes()
db.activities.getIndexes()
db.useractivitydailies.getIndexes()
db.analyticsevents.getIndexes()
db.userinterestprofiles.getIndexes()
```

Confirm each has a TTL index (`expireAfterSeconds > 0`).

---

## 3. Backend Validation Steps

### A. Right to Access / Portability (Art. 15/20)
- [ ] `GET /api/v1/gdpr/portability/:userId` returns 200 with all user data
- [ ] Response includes: profile, posts, comments, messages (count), notifications
- [ ] Response does NOT include other users' data
- [ ] Admin role required for non-self access

### B. Right to Erasure (Art. 17)
- [ ] `GET /api/v1/gdpr/erase-preview?userId=...` returns deletion counts (dry-run, no actual deletion)
- [ ] `POST /api/v1/gdpr/erase` deletes user + all cascades: posts, comments, messages, activity, notifications, pushTokens, consent, interestProfile, userActivityDaily
- [ ] Media files (avatar) are deleted from disk
- [ ] User document is soft-deleted (`isDeleted: true`) then scheduled for hard purge
- [ ] AuditLog entry is written with actor, reason, timestamp
- [ ] Admin role required

### C. Right to Rectification (Art. 16)
- [ ] `PUT /api/v1/gdpr/rectify/:userId` updates allowed fields only (name, email, etc.)
- [ ] Password changes rejected (separate endpoint)
- [ ] AuditLog entry is written

### D. Consent Management
- [ ] `GET /api/v1/gdpr/consent-status?userId=...` returns current flags for self or admin
- [ ] `PUT /api/v1/gdpr/consent` updates flag + writes history entry
- [ ] Opt-out from analytics purges UserInterestProfile immediately
- [ ] New UserConsent defaults: `analytics_optin: false`, `personalization: false`
- [ ] `POST /api/v1/analytics/record-event` silently drops events if no consent

### E. Interest Analytics
- [ ] `GET /api/v1/analytics/interests` returns aggregated stats (no individual user IDs)
- [ ] `GET /api/v1/analytics/interest-explainer/:userId` returns per-user evidence only for consented users
- [ ] Returns `hasConsented: false` message if user is not opted in
- [ ] Admin role required for both endpoints

### F. Audit Log
- [ ] `GET /api/v1/gdpr/audit-logs` returns paginated AuditLog records
- [ ] Admin role required (verified: non-admins get 403)
- [ ] Each GDPR action (erase, rectify, export, consent change) writes a log entry

---

## 4. Dashboard Validation Steps

- [ ] "GDPR Centre" menu item visible only to ADMIN / SUPER ADMIN roles
- [ ] DSAR tab: enter user ID → receive JSON → download button works
- [ ] Erase tab: preview shows correct counts → confirm erasure → success message
- [ ] Consent tab: load user consent → toggle flags → verify backend updated
- [ ] Audit Log tab: loads paginated entries, filter by userId / action works

---

## 5. Security Checks

- [ ] All GDPR endpoints require JWT authentication (`authMiddleware`)
- [ ] Admin-only endpoints check `role === ADMIN || SUPER ADMIN` via `roleMiddleware`
- [ ] `dsarLimiter` rate limiter applied to export + erasure endpoints (max 30 req/min)
- [ ] Consent history is append-only — no DELETE endpoint exposed
- [ ] Interest profile data never exposes raw event details to non-admin users

---

## 6. Tests

Run the GDPR test suite:

```bash
cd isen-backend-master_onprimse
npm test -- --grep GDPR
```

Expected: all 7 tests in `test/gdpr.test.js` pass.

---

## 7. Privacy Policy / User-Facing Requirements (out of scope for code, track separately)

- [ ] Privacy Policy updated to reflect analytics opt-in model
- [ ] In-app consent screen added to onboarding (frontend mobile app)
- [ ] Data retention periods published in Privacy Policy
- [ ] DPA (Data Processing Agreement) signed with MongoDB Atlas / hosting provider
- [ ] DPO (Data Protection Officer) designated if required by jurisdiction

---

## 8. Post-Deployment Monitoring

- [ ] Verify `purgeDeletedUsers` Agenda job runs at 03:00 UTC without errors
- [ ] Verify `recompute interest profiles` Agenda job runs at 04:00 UTC without errors
- [ ] Monitor AuditLog collection growth (index on `createdAt`)
- [ ] Alert if TTL deletes fail (monitor MongoDB logs for TTL errors)
