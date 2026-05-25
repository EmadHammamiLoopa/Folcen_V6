# GDPR Gap Analysis — Folcen

> Derived from `DATA_INVENTORY.md` and codebase analysis.

---

## Summary Score

| Category | Status | Risk |
|----------|--------|------|
| Data subject rights (access/export) | ✅ Implemented | Low |
| Data subject rights (erasure) | ✅ Implemented | Low |
| Data subject rights (rectification) | ✅ Implemented | Low |
| Data subject rights (portability) | ✅ Implemented | Low |
| Consent for analytics/personalization | ❌ Missing | **High** |
| Retention / TTL on notifications | ❌ Missing | **High** |
| Retention / TTL on activities | ❌ Missing | **High** |
| Retention / TTL on user_activity_daily | ❌ Missing | Medium |
| Media file cleanup on erasure | ❌ Missing | **High** |
| Interest profile model (GDPR-safe) | ❌ Missing | **High** |
| Dashboard GDPR controls | ⚠️ Partial | Medium |
| Audit log retention | ✅ Append-only | Low |
| Legal acceptances | ✅ Stored | Low |
| Legal acceptances – write-protection | ⚠️ App-level only | Medium |
| Push token revocation on deletion | ✅ PurgeUser covers | Low |
| Role-based access on GDPR endpoints | ⚠️ Partial | Medium |
| Dry-run erasure preview | ❌ Missing | Medium |

---

## 1. Rights

### 1.1 Right of Access (Art. 15) ✅
- `GET /api/v1/gdpr/access` — returns user public info + legal acceptance history.
- **Gap:** Does not include `interests` field or push token count. Portability endpoint covers more.

### 1.2 Right to Portability (Art. 20) ✅
- `GET /api/v1/gdpr/portability` — paginated export of posts, comments, messages, follows, call events, activities, products, jobs, services, channels, legal acceptances.
- **Gap:** Does not export `notifications` directed to the user, `UserActivityDaily` records, or `UserInterestProfile` (once implemented). Should be added.

### 1.3 Right to Erasure (Art. 17) ✅ with gaps
- `POST /api/v1/gdpr/erase` — soft delete (user) or hard purge (admin).
- **Gap 1:** Media files in `uploads/` are NOT deleted by `purgeUser`. Disk space leaks.
- **Gap 2:** `activities` records with `actor = userId` are NOT deleted.
- **Gap 3:** `notifications` where `sender = userId` are NOT deleted.
- **Gap 4:** `user_activity_daily` rows are NOT deleted.

### 1.4 Right to Rectification (Art. 16) ✅
- `PUT /api/v1/gdpr/rectify` — updates allowed fields only via `ALLOWED_RECTIFY_FIELDS` whitelist.

### 1.5 Right to Restriction (Art. 18) ❌
- No explicit "restrict processing" flag on user profile.
- **Gap:** Add `processingRestricted: Boolean` field + enforcement in controllers.

### 1.6 Right to Object (Art. 21) ❌
- No analytics opt-out mechanism.
- **Gap:** Add `consents.analyticsOptOut` field + enforcement in Activity/analytics pipeline.

---

## 2. Legal Basis / Consent

### 2.1 Analytics and Personalization
- `interests[]` field drives content recommendations but **no consent gate** exists.
- `Activity` model stores raw behavioral events per user with no consent check.
- `UserActivityDaily` tracks presence without consent.
- **Required action:** Add `UserConsent` model + enforce opt-out in Activity writes and analytics queries.

### 2.2 Push Notifications
- FCM push tokens stored; legal basis is contract performance (notifications are service-critical).
- Users can revoke by logging out (tokens deleted by purgeUser).
- **Gap:** No explicit notification consent record — relies on OS-level permission only.

### 2.3 Processing for Security (Auth Events, Call Events)
- `AuthEvent` and `CallEvent` rely on legitimate interest — acceptable with TTL.
- ✅ Both have configurable TTL.

### 2.4 Reports
- Report filing implies processing of reporter identity — consent field `consentGiven` exists on schema ✅.
- `reporterIp` / `reporterUserAgent` stored — anonymize after investigation closes.

---

## 3. Data Minimization

| Area | Issue | Action |
|------|-------|--------|
| `User.interests[]` | Raw interest strings, no expiry | Aggregate into `UserInterestProfile` |
| `Activity.content`, `Activity.meta` | Free-form content stored | Strip or limit to type+channel only |
| `Notification.data` (Mixed) | Arbitrary payload stored | Define schema, limit to required fields |
| `Report.evidence[]` | URLs to content snapshots | Set `retentionDate` and enforce cleanup |
| `Message.readBy[]` | Full historical read receipts | TTL after 90 days |
| `Post.votes[].user` | Voter identity stored | Consider aggregated count only |

---

## 4. Retention Gaps

| Collection | Current TTL | Required | Action |
|------------|------------|---------|--------|
| `notifications` | None | 90 days | Add TTL index |
| `activities` | None | 90 days | Add TTL index |
| `user_activity_daily` | None | 365 days | Add TTL index |
| `messages` (soft-deleted) | None | 30 days after deletion | Add cleanup to purge job |
| `audit_logs` | None (by design) | 2 years | Add scheduled archival at 2y |
| `legal_acceptances` | None (by design) | Lifetime or until withdrawal | ✅ Correct, keep |
| `reports` | `retentionDate` field but no TTL | Set TTL index on `retentionDate` | Add TTL index |
| `follows` | None | Until erasure | Covered by purgeUser ✅ |
| Media files (`uploads/`) | None | Until erasure | Add file deletion to purgeUser |

---

## 5. Security / Access Control

### 5.1 GDPR Endpoints
- `routes/gdpr.js` uses `require('../../middlewares/auth')` — authentication present ✅
- Admin-specific operations check `actor.role === 'ADMIN'` in controller — server-side ✅
- **Gap:** `auditLogs` endpoint requires `userId` param but any authenticated user can query any user's log. Should restrict to ADMIN+.

### 5.2 Dashboard Access
- Dashboard has `AuthGuard` ✅ and `SuperAdminGuard` ✅
- **Gap:** GDPR/DSAR pages in dashboard must require `AdminGuard` + log every view.
- **Gap:** No rate-limiting on GDPR export endpoints (DSAR can be abused to dump data).

### 5.3 Audit Trail
- `AuditLog` model exists and is used in `GdprController` ✅
- `AdminController` actions — need audit logging for ban/unban actions.
- **Gap:** Audit log `ip` stores raw IP — should store `ipHash` for non-GDPR-critical logs.

---

## 6. Special Risks

| Risk | Severity | Description |
|------|----------|-------------|
| Push token re-use | HIGH | FCM token persists after device reset — stale tokens not cleaned without explicit logout |
| Media file leakage | HIGH | `uploads/` files not deleted on user erasure |
| Raw interest profile | HIGH | `interests[]` treated as analytics target without consent |
| Broadcasting userId | MEDIUM | Socket events may broadcast userId to other clients |
| `userAgent` in audit logs | LOW | Redaction middleware exists but `AuditLog.userAgent` stores raw string |
| Mongo shell write-access | MEDIUM | No DB-level write protection on `legal_acceptances` |
| `twoFAToken` in User document | MEDIUM | Stored in plain text in DB — should be hashed or time-limited |

---

## 7. Implementation Priority

| Priority | Action |
|----------|--------|
| P0 | Add `UserConsent` model + enforce opt-out in Activity writes |
| P0 | Fix `purgeUser` to delete media files + activities + notifications |
| P1 | Add TTL indexes on `notifications`, `activities`, `user_activity_daily` |
| P1 | Add `UserInterestProfile` + `AnalyticsEvent` models |
| P1 | Add dry-run erasure preview endpoint |
| P2 | Dashboard GDPR pages (DSAR, erasure, consent, audit log) |
| P2 | Add `processingRestricted` flag |
| P3 | Rate-limit GDPR export endpoints |
| P3 | Archive audit logs after 2 years |
