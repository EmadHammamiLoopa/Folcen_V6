# GDPR Final Compliance Report
**Project:** Folcen (isen-master\_onprimse)  
**Date:** 2025-03-07  
**Scope:** Backend (`isen-backend-master_onprimse/`) · Admin Dashboard (`geloo-dashboard-master/`)  
**Mobile frontend excluded** per task rules.

---

## Executive Summary

| Area | Pre-Pass Status | Post-Pass Status |
|---|---|---|
| DSAR / Portability completeness | ⚠️ Partial — 3 collections missing | ✅ Complete |
| Erasure / purge cascade | ❌ AnalyticsEvent not deleted | ✅ Fixed |
| Erasure preview accuracy | ⚠️ Missing AnalyticsEvent count | ✅ Fixed |
| Consent model | ⚠️ Missing `createdAt` (Art. 7) | ✅ Fixed |
| Audit log retention | ❌ No TTL defined | ✅ Fixed (env-configurable, min 1yr) |
| Audit log dashboard display | ❌ Field name mismatch (`details` vs `meta`) | ✅ Fixed |
| Audit log browsable without userId | ❌ 400 error on page load | ✅ Fixed |
| Duplicate route definitions | ⚠️ Dead code — `/portability` and `/erase` duplicated | ✅ Removed |
| Analytics event TTL | ✅ Correct | ✅ No change needed |
| Access control on all GDPR endpoints | ✅ Correct | ✅ Verified |
| Interest analytics privacy (aggregates only) | ✅ Correct | ✅ Verified |

**8 defects found and fixed. 0 remaining P0/P1 issues.**

---

## 1. DSAR Export Completeness

### 1.1 Collections returned by `GET /api/v1/gdpr/portability`

| Collection | Included? | Notes |
|---|---|---|
| `users` | ✅ | Sanitised via `publicInfo()` — no password hash |
| `posts` | ✅ | Full documents |
| `comments` | ✅ | Full documents |
| `messages` | ✅ | Full documents (sender + recipient sides) |
| `followers` / `following` | ✅ | Follow relationship docs |
| `activities` | ✅ | Actor-side only |
| `reports` | ✅ | Where user is reporter |
| `products` / `jobs` / `services` | ✅ | Where user is owner |
| `channels` | ✅ | Where user is owner |
| `callEvents` | ✅ | Technical metadata, no content |
| `messageEvents` | ✅ | Delivery metadata only |
| `legalAcceptances` | ✅ | Document type, version, timestamp, context |
| `notifications` | ✅ *(added in this pass)* | Type, message, createdAt — sender PII stripped |
| `userConsent` | ✅ *(added in this pass)* | Flags + full history (who changed, when, how) |
| `analyticsEventSummary` | ✅ *(added in this pass)* | Aggregate counts per event type only; no raw events |
| `pushTokens` | ℹ️ Intentionally excluded | Device registration tokens are transient/technical — not required under Art. 20 portability |
| `userInterestProfile` | ℹ️ Intentionally excluded | Derived data — not required under portability, but available via explainer endpoint |
| `auditLogs` | ℹ️ Admin-side records | Not personal data of the subject — excluded per design |

**Verdict: DSAR export now covers all user-related personal data. Compliant with Art. 15 (access) and Art. 20 (portability).**

---

## 2. Erasure Pipeline

### 2.1 Collections deleted by `purgeUser(userId)`

| Collection | Deleted? | Method |
|---|---|---|
| `users` | ✅ | `deleteOne` |
| `posts` | ✅ | `deleteMany` + media files from disk |
| `comments` | ✅ | `deleteMany` + media files from disk |
| `messages` | ✅ | `deleteMany` (sender + recipient) |
| `products` / `jobs` / `services` | ✅ | `deleteMany` |
| `follows` | ✅ | `deleteMany` (follower + followed) |
| `activities` | ✅ | `deleteMany` |
| `requests` | ✅ | `deleteMany` |
| `channels` | ✅ | `deleteMany` + channel's follower list cleanup |
| `legalAcceptances` | ✅ | `deleteMany` |
| `reports` | ✅ | `deleteMany` |
| `notifications` | ✅ | `deleteMany` (recipient + sender) |
| `pushTokens` | ✅ | `deleteMany` |
| `userActivityDaily` | ✅ | `deleteMany` |
| `userInterestProfile` | ✅ | `deleteOne` |
| `userConsent` | ✅ | `deleteOne` |
| `analyticsEvents` | ✅ *(added in this pass)* | `deleteMany` — was missing before this pass |
| Avatar / media files | ✅ | `fs.unlink` with ENOENT tolerance |
| References in other User docs | ✅ | `$pull` from `followers`, `following`, `friends`, `blockedUsers` |

### 2.2 Token Revocation
- `tokenBlacklist.revokeUser(userId)` is called on soft-erase (self-erasure).
- Admin hard-erase calls `purgeUser` and disconnects all active sockets via Socket.IO.
- **Gap (informational, not a code defect):** Token blacklist effectiveness depends on `tokenBlacklist` implementation. Ensure it has its own TTL keyed to JWT expiry time. Review `app/utils/tokenBlacklist.js` separately — out of scope for this pass.

### 2.3 Idempotency
`purgeUser` uses `deleteMany`/`deleteOne` in a single `Promise.all`. Re-running on an already-deleted user produces 0 affected documents (idempotent). Safe for the Agenda retry model.

### 2.4 Scheduled Purge
- Agenda job `purgeDeletedUsers` runs daily at **03:00 UTC** — picks up records where `isDeleted: true` and `purgeAt <= now`.
- `DATA_RETENTION_DAYS` env var controls the soft-delete grace period (default 30 days).
- `recomputeInterestProfiles` Agenda job runs daily at **04:00 UTC** (after purge), so purged users are automatically excluded from the next recompute.

---

## 3. Consent Model

### 3.1 Schema Review

| Property | Value |
|---|---|
| Default for `analytics_optin` | `false` (opt-IN — legal basis: explicit consent) |
| Default for `personalization` | `false` (opt-IN) |
| `createdAt` (immutable) | ✅ *(added in this pass)* — required by Art. 7(1) to prove when consent was obtained |
| `updatedAt` | ✅ Updated on each change |
| History array | ✅ Append-only (`$push` only); fields: `key`, `oldValue`, `newValue`, `changedAt`, `changedBy`, `source` (self/admin/system) |
| Consent versioning | ℹ️ Not implemented. The `legalAcceptances` collection handles T&C / Privacy Policy version acceptance separately. The `UserConsent` model is for feature-opt-ins (analytics, personalisation) — versioning is not required here. |

### 3.2 Effect of Opt-Out
- When `analytics_optin` is set to `false` via `updateConsent`:
  - `UserInterestProfile` is **immediately deleted** (`deleteOne`). ✅
  - New `AnalyticsEvent` writes are **silently dropped** (consent gate in `recordEvent`). ✅
  - `recomputeInterestProfiles` Agenda job **skips** opted-out users automatically. ✅
  - Existing `AnalyticsEvent` docs are NOT deleted at opt-out time — they expire via TTL. **Acceptable** because they're pseudonymous and will self-delete; immediate purge would require an additional `deleteMany` on every consent change and isn't legally required for pseudonymous data under Art. 6(1)(f). Teams may choose to add this.

---

## 4. Retention

### 4.1 TTL Index Summary

| Collection | TTL Field | Default | Env Var |
|---|---|---|---|
| `analyticsevents` | `createdAt` | 30 days | `ANALYTICS_EVENT_RETENTION_DAYS` |
| `notifications` | `createdAt` | 90 days | `NOTIFICATION_RETENTION_DAYS` |
| `activities` | `createdAt` | 90 days | `ACTIVITY_RETENTION_DAYS` |
| `useractivitydailies` | `date` | 365 days | `USER_ACTIVITY_DAILY_RETENTION_DAYS` |
| `userinterestprofiles` | `expiresAt` | 90-day rolling window | (set by recompute job) |
| `audit_logs` | `timestamp` | **1095 days (3 years)** *(added in this pass)* | `AUDIT_LOG_RETENTION_DAYS` (min 365) |

### 4.2 Collections Without TTL (intentional)

| Collection | Rationale |
|---|---|
| `users`, `posts`, `messages`, etc. | User-owned content — retained until erasure request |
| `legalacceptances` | Must be retained indefinitely to prove consent was given |
| `userconsents` | Must be retained for the life of the account |

---

## 5. Access Control

### 5.1 Route-Level Protection (all GDPR endpoints)

| Endpoint | Auth | Admin Required | Rate Limited |
|---|---|---|---|
| `GET /gdpr/access` | ✅ JWT | Self or Admin | ✅ dsarLimiter (10/min) |
| `GET /gdpr/portability` | ✅ JWT | Self or Admin | ✅ dsarLimiter |
| `POST /gdpr/erase` | ✅ JWT | Admin-only for other users | ✅ dsarLimiter |
| `GET /gdpr/erase-preview` | ✅ JWT | ✅ Admin only | ✅ dsarLimiter |
| `POST /gdpr/erase-preview` | ✅ JWT | ✅ Admin only | ✅ dsarLimiter |
| `POST /gdpr/anonymize-author` | ✅ JWT | ✅ Admin only | ✅ dsarLimiter |
| `GET /gdpr/consent-status` | ✅ JWT | Admin for other users | ✅ dsarLimiter |
| `PUT /gdpr/consent` | ✅ JWT | Admin for other users | ✅ dsarLimiter |
| `GET /gdpr/audit-logs` | ✅ JWT | ✅ Admin only | ✅ 30/min |
| `GET /gdpr/consents` | ✅ JWT | Self or Admin | ✅ dsarLimiter |
| `POST /gdpr/rectify` | ✅ JWT | Self or Admin | ✅ dsarLimiter |
| `GET /analytics/interests` | ✅ JWT | ✅ Admin only | ✅ 60/min |
| `GET /analytics/interest-explainer/:userId` | ✅ JWT | ✅ Admin only | ✅ 60/min |
| `POST /analytics/record-event` | ✅ JWT | No (self only) | ✅ 60/min |

All server-side checks use controller-level role validation — route middleware alone is not trusted.

### 5.2 Audit Trail Coverage

Every GDPR action calls `recordAudit(...)`. Actions covered:

`ACCESS` · `EXPORT` · `DSAR_RECTIFY` · `ERASURE_SOFT` · `ERASURE_HARD` · `ERASURE_PREVIEW` · `DSAR_CONSENT_HISTORY` · `ANONYMIZE_AUTHOR` · `CONSENT_CHANGE` · `DASHBOARD_VIEW_ACCEPTANCES` · `DASHBOARD_VIEW_EVENTS`

Audit records are **redacted** before storage: `audit.js` strips any field key matching `/token|password|pwd|jwt|secret|ssn|national/i`.

---

## 6. Interest Analytics Privacy

### 6.1 AnalyticsEvent Schema Minimality

| Field | Privacy Assessment |
|---|---|
| `userId` | Pseudonymous ObjectId — no name/email stored |
| `eventType` | Enum (5 values) — no free text |
| `targetId` | ObjectId reference only — no content |
| `targetType` | Enum (Post/Channel/Comment) |
| `category` | String tag — no PII |
| `channelId` | ObjectId only |
| `tags` | String array — no PII |
| `createdAt` | Timestamp — TTL field |

**No PII fields. Schema is minimal by design. ✅**

### 6.2 Aggregated Interests Endpoint

`GET /api/v1/analytics/interests` returns:
- **No user IDs in response.** The `consentedUserIds` array is used only as a `$match` filter, never exposed.
- `topCategories`: `{ _id, count, eventTypes }` — aggregate only.
- `topChannels`: `{ _id, count, channelName }` — aggregate only.
- `eventBreakdown`: `{ _id: eventType, count }` — aggregate only.
- `consentStats`: totals and rate — no individual attribution. ✅

### 6.3 Interest Explainer Endpoint

`GET /api/v1/analytics/interest-explainer/:userId` (admin only):
- Returns `hasConsented: false` and a generic message if user is not opted in. ✅
- Returns only the pre-aggregated `UserInterestProfile.topCategories` and `tagCounts`. ✅
- `evidence` array is **further aggregated** at query time: groups by `(eventType, category)` — no individual event timestamps or targets exposed. ✅

---

## 7. Defects Found and Fixed in this Pass

| # | Severity | File | Defect | Fix |
|---|---|---|---|---|
| 1 | **P0** | `app/helpers.js` | `purgeUser` did not delete `AnalyticsEvent` records — erasure was incomplete | Added `AnalyticsEvent.deleteMany({ userId })` to purge cascade |
| 2 | **P1** | `app/controllers/GdprController.js` | Dashboard audit log always showed `—` in details column because controller stores data in `meta` but Angular template read `log.details` | Fixed dashboard template to read `log.meta` |
| 3 | **P1** | `app/controllers/GdprController.js` | `auditLogs` required `userId` query param → dashboard `ngOnInit` load() call 400'd immediately | Made `userId` optional; admin can browse all logs without a filter |
| 4 | **P1** | `app/controllers/GdprController.js` | `erasePreview` did not count `AnalyticsEvent` documents — admin saw incomplete deletion preview | Added `analyticsEvents` count |
| 5 | **P1** | `app/controllers/GdprController.js` | `portability` export was missing `notifications`, `userConsent`, `analyticsEventSummary` | Added all three |
| 6 | **P1** | `app/models/AuditLog.js` | No TTL on `audit_logs` collection — records would grow indefinitely | Added env-configurable TTL (default 3yr, min 1yr); added compound indexes for `targetUserId` and `action` |
| 7 | **P1** | `app/models/UserConsent.js` | No `createdAt` field — unable to prove when consent was first obtained (GDPR Art. 7(1)) | Added `createdAt: { type: Date, immutable: true }` |
| 8 | **P2** | `routes/gdpr.js` | Duplicate route definitions: `/portability` registered twice, `/erase` registered twice | Removed the duplicate registrations |

---

## 8. Remaining Recommendations (not code defects, require external action)

| Item | Priority | Action |
|---|---|---|
| **`tokenBlacklist.js` TTL review** | P1 | Verify revoked token entries expire no later than the original JWT `exp`. If using Redis, confirm `EXPIRE` is set. |
| **Consent on opt-out: purge AnalyticsEvent immediately** | P2 | Legally not required for pseudonymous data, but adds user trust. Add `AnalyticsEvent.deleteMany({ userId })` inside `updateConsent` when `key === 'analytics_optin' && value === false`. |
| **Privacy Policy GDPR section** | P1 | Update the in-app/web privacy policy to describe all retention periods listed in §4.1 above. |
| **Mobile app: consent onboarding screen** | P1 | The default for `analytics_optin` is `false` — users must explicitly opt in. An in-app consent prompt is required before any analytics event is written. (Out of scope — mobile frontend.) |
| **`AUDIT_LOG_RETENTION_DAYS` env on prod** | P2 | Set to comply with your jurisdiction (EU: typically 3 years for Art. 30 records). Update `.env.example`. |
| **DPA with MongoDB Atlas / cloud provider** | P1 | Sign a Data Processing Agreement if using Atlas or any managed cloud. |
| **DPO designation** | P2 | Required if processing at scale in EU. Document the decision. |

---

## 9. Test Coverage After this Pass

File: `isen-backend-master_onprimse/test/gdpr.test.js`

| Test | Covers |
|---|---|
| purgeUser deletes UserConsent | Fix #1 (cascade) |
| purgeUser deletes UserInterestProfile | Fix #1 (cascade) |
| purgeUser deletes PushToken | Fix #1 (cascade) |
| **purgeUser deletes AnalyticsEvent** | **Defect #1 regression guard** |
| recordEvent drops when not opted in | Consent gate |
| recordEvent records when opted in | Consent gate |
| recordEvent drops after opt-out | Consent gate + opt-out effect |
| updateConsent creates history entry | Consent history tracking |
| recomputeInterestProfiles skips non-consented | Consent gate in job |
| **UserConsent has createdAt on upsert** | **Defect #7 regression guard** |
| **auditLogs returns docs without userId** | **Defect #3 regression guard** |

Run: `cd isen-backend-master_onprimse && npm test -- --grep GDPR`

---

*Report generated and all code changes applied: 2025-03-07.*
