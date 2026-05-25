# Dashboard GDPR Features — Folcen

---

## 1. New Dashboard Pages

| Route | Name | Access | Purpose |
|-------|------|--------|---------|
| `/dashboard/GDPR` | GDPR Centre | Admin only | Entry point with tabbed interface |
| `/dashboard/GDPR/dsar/:userId` | User Data Export | Admin only | DSAR export for a specific user |
| `/dashboard/GDPR/erase/:userId` | Erase User | Admin only | Schedule or perform user erasure |
| `/dashboard/GDPR/consent/:userId` | Consent Controls | Admin only | View and change consent/opt-out status |
| `/dashboard/GDPR/audit` | Audit Log | SUPER ADMIN only | View all admin actions |

---

## 2. DSAR Export Page (`/dashboard/GDPR/dsar/:userId`)

Calls: `GET /api/v1/gdpr/portability?userId=:id`

**Displays:**
- User profile summary (name, email, joined date, last seen)
- Counts for each exported collection (posts, comments, messages, follows, etc.)
- Downloads full JSON as `folcen-dsar-{userId}-{date}.json`
- Audit entry recorded for every export

**Controls:**
- `Export JSON` button → triggers download
- `Copy to clipboard` button for partial review

---

## 3. Erase User Page (`/dashboard/GDPR/erase/:userId`)

Calls: 
- `POST /api/v1/gdpr/erase-preview` (dry-run, no deletion)
- `POST /api/v1/gdpr/erase` with `{ userId, reason }`

**Displays:**
- Dry-run counts: "This will delete X posts, Y messages, Z notifications..."
- Erasure type selector: `soft delete (grace period)` vs `immediate hard purge`
- Reason field (required) for audit trail
- Confirmation modal with typed user email to proceed
- Result shows: success/failure + purge date if soft-delete

**Guards:**
- Requires `AdminGuard`
- Cannot self-erase via dashboard (prevent accidental lockout)

---

## 4. Consent Controls Page (`/dashboard/GDPR/consent/:userId`)

Calls: 
- `GET /api/v1/gdpr/consent-status?userId=:id`
- `PUT /api/v1/gdpr/consent` with `{ userId, key, value }`

**Displays per user:**
- `analytics_optin` — has the user consented to interest analytics?
- `personalization` — has the user consented to content personalization?
- Toggle switches (admin-controlled or shows user's self-reported status)
- Full consent history from `LegalAcceptance`
- "Opt-out all analytics" shortcut

---

## 5. Audit Log Page (`/dashboard/GDPR/audit`)

Calls: `GET /api/v1/gdpr/audit-logs?userId=:id&page=1&limit=50`

**Displays:**
- Table: `Timestamp | Admin | Action | Target User | IP | UserAgent | Result`
- Filter by action type: `ACCESS | EXPORT | ERASURE_SOFT | ERASURE_HARD | DSAR_RECTIFY | CONSENT_CHANGE`
- Filter by date range
- Filter by target user (search)
- Export audit trail as CSV

**Access:** SUPER ADMIN only

---

## 6. Role-Based Access Controls

| Role | Can view GDPR pages | Can export DSAR | Can erase user | Can view audit log |
|------|---------------------|-----------------|-----------------|-------------------|
| USER | ❌ | ❌ | Self only (mobile) | ❌ |
| ADMIN | ✅ | ✅ | ✅ | ❌ |
| SUPER ADMIN | ✅ | ✅ | ✅ | ✅ |

RBAC enforced:
- **Dashboard:** `AdminGuard` on GDPR routes
- **Backend:** Controller-level check on `actor.role`

---

## 7. Interest Analytics View (`/dashboard/activity-interests`)

Safe analytics dashboard for content optimization — GDPR compliant:

**Displays:**
- Top categories/channels by engagement (aggregated, not per-user)
- Opt-out rate (% of users who opted out of analytics)
- Interest breakdown per channel (anonymous aggregate distribution)
- For users with consent: "Why we recommend X" explainability panel

**Does NOT display:**
- Individual user behavioral trails
- Raw event streams
- User IDs in charts

**Data source:** `UserInterestProfile` (consented users only) + `Activity` aggregates

---

## 8. "Anonymize Author" Action

Available from the User detail page (existing display-user component):

Calls: `POST /api/v1/gdpr/anonymize-author` with `{ userId, reason }`

**Effect:**
- All user's posts: `user = ANONYMOUS_PLACEHOLDER_ID`, `anonyme = true`
- All user's comments: same
- User profile remains (not deleted) but author attribution removed
- Audit record written

Use case: User wants content to remain but identity removed (different from full erasure).

---

## 9. Backend Endpoints Summary

| Method | Path | Auth | Action |
|--------|------|------|--------|
| GET | `/api/v1/gdpr/access` | User/Admin | DSAR — profile + acceptance history |
| GET | `/api/v1/gdpr/portability` | User/Admin | Full data export |
| PUT | `/api/v1/gdpr/rectify` | User/Admin | Update allowed profile fields |
| POST | `/api/v1/gdpr/erase` | User/Admin | Schedule or hard purge |
| POST | `/api/v1/gdpr/erase-preview` | Admin only | Dry-run count of what would be deleted |
| POST | `/api/v1/gdpr/anonymize-author` | Admin only | Anonymize all posts/comments by user |
| GET | `/api/v1/gdpr/consent-status` | User/Admin | Current consent values |
| PUT | `/api/v1/gdpr/consent` | User/Admin | Update consent key/value |
| GET | `/api/v1/gdpr/consent-history` | User/Admin | LegalAcceptance history |
| GET | `/api/v1/gdpr/audit-logs` | Admin only | Admin action audit trail |
| GET | `/api/v1/analytics/interests` | Admin only | Aggregated interest profiles |
| GET | `/api/v1/analytics/interest-explainer/:userId` | Admin only | Per-user interest evidence |
