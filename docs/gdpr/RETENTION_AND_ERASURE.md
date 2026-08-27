# Retention and Erasure Policy — Folcen

---

## 1. Retention Rules Per Collection

| Collection | Default Retention | TTL Mechanism | Notes |
|------------|------------------|---------------|-------|
| `users` (active) | Until erasure | Purge job | Soft-delete → purge after `DATA_RETENTION_DAYS` |
| `users` (deleted) | 30 days after `deletedAt` | Agenda job (`purge-deleted-users`) | Configurable via `DATA_RETENTION_DAYS` env |
| `pushtokens` | Until user deletion or explicit revocation | Purge job cascade | Deleted in `purgeUser()` |
| `messages` | Until user erasure | Purge job cascade | Hard delete on user purge |
| `posts` | 30 days (soft-delete window) → then anonymized | Purge job + anonymization | `deletedAt` set; author replaced with placeholder |
| `comments` | Same as posts | Same | `deletedAt` set; anonymized |
| `notifications` | 90 days | TTL index on `createdAt` | New: requires index addition (see §3) |
| `activities` | 90 days | TTL index on `createdAt` | New: requires index addition (see §3) |
| `user_activity_daily` | 365 days | TTL index on `date` | New: requires index addition (see §3) |
| `follows` | Until user erasure | Purge job cascade | |
| `reports` | Until resolved + 180 days | TTL on `retentionDate` | Set `retentionDate = resolvedAt + 180d` |
| `call_events` | 90 days | Agenda purge on `expiresAt` | Configurable via `CALL_EVENT_RETENTION_DAYS`; report-linked events are protected until their case lifecycle releases them |
| `messageevent` | 60 days | Agenda purge on `expiresAt` | Configurable via `MESSAGE_EVENT_RETENTION_DAYS`; report-linked events are protected until their case lifecycle releases them |
| `authevents` | 30 days | TTL index on `createdAt` | Bounded default 30 days; configurable via `AUTH_EVENT_RETENTION_DAYS` |
| `audit_logs` | `AUDIT_LOG_RETENTION_DAYS` (default 1095 days; minimum 365) | TTL index on `timestamp` | Finite accountability/security evidence; direct erased-user identifiers are minimized during Article 17 erasure |
| `legal_acceptances` | Finite — `LEGAL_ACCEPTANCE_RETENTION_DAYS` (default 1095 days), subject to purpose/legal-basis review | TTL index on `retentionDate` | Finite acceptance evidence; Article 17 erasure may delete it earlier where no independent lawful retention basis applies |
| `analyticsevents` | 30 days | TTL index on `createdAt` | New model |
| `userinterestprofiles` | Until erasure / opt-out | Purge job cascade | |
| `userconsents` | Until erasure | Purge job cascade | |

---

## 2. Environment Variables

```env
# Retention periods (days)
DATA_RETENTION_DAYS=30           # User soft-delete grace period
ACCEPTANCE_RETENTION_DAYS=30     # LegalAcceptance cleanup (if ever)
CALL_EVENT_RETENTION_DAYS=90     # CallEvent TTL
MESSAGE_EVENT_RETENTION_DAYS=60  # MessageEvent TTL
AUTH_EVENT_RETENTION_DAYS=30     # AuthEvent TTL
NOTIFICATION_RETENTION_DAYS=90   # Notifications TTL
ACTIVITY_RETENTION_DAYS=90       # Activity TTL
ANALYTICS_EVENT_RETENTION_DAYS=30 # AnalyticsEvent TTL
AUDIT_LOG_RETENTION_DAYS=1095    # AuditLog TTL; model enforces minimum 365 days
```

---

## 3. TTL Indexes to Add (Migration)

Run once against the production MongoDB:

```javascript
// notifications
db.notifications.createIndex({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90d

// activities
db.activities.createIndex({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90d

// user_activity_daily
db.user_activity_daily.createIndex({ date: 1 }, { expireAfterSeconds: 31536000 }); // 365d

// reports (on retentionDate, after it is set by resolution handler)
db.reports.createIndex({ retentionDate: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { resolvedAt: { $type: "date" } } });

// analytic_events (managed in model, 30d default)
db.analyticsevents.createIndex({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // 30d
```

> **Note:** MongoDB TTL indexes fire approximately every 60 seconds — not second-precise. Use the purge Agenda job for exact enforcement.

---

## 4. `purgeUser(userId)` — What Gets Deleted

Located in `isen-backend-master_onprimse/app/helpers/index.js`.

### 4.1 Current cascade
- ✅ `Post.deleteMany({ user })`
- ✅ `Comment.deleteMany({ user })`
- ✅ `Message.deleteMany({ $or: [{ from }, { to }] })`
- ✅ `PushToken.deleteMany({ userId })`
- ✅ `Follow.deleteMany({ $or: [{ follower }, { followed }] })`
- ✅ `Notification.deleteMany({ $or: [{ recipient }, { sender }] })`
- ✅ `User.deleteOne({ _id })`

### 4.2 Gaps — added by this implementation
- ✅ `Activity.deleteMany({ actor: userId })`
- ✅ `UserActivityDaily.deleteMany({ userId })`
- ✅ `UserInterestProfile.deleteOne({ userId })`
- ✅ `UserConsent.deleteOne({ userId })`
- ✅ Media files: `rmdirSync(uploadsPath/userId, { recursive: true })`

---

## 5. Anonymization vs. Deletion

For posts/comments where content must be retained (channel history), the "Anonymize Author" option:
- Sets `post.user` / `comment.user` to special placeholder ID `000000000000000000000000`
- Sets `post.anonyme = true`
- Audit record is written

This is presented as an alternative to full erasure in the dashboard.

---

## 6. Agenda Job Schedule

| Job name | Schedule | Action |
|----------|----------|--------|
| `purge-deleted-users` | Daily at 03:00 UTC | Purge users past `purgeAt`, clean call/message events |
| `cleanup-ttl-notifications` | Daily at 03:30 UTC | Backup cleanup for notifications without TTL index |
| `cleanup-analytics-events` | Daily at 04:00 UTC | Clean expired `AnalyticsEvent` docs |

---

## 7. Dry-Run Mode

`POST /api/v1/gdpr/erase-preview` (admin only) returns:

```json
{
  "userId": "...",
  "wouldDelete": {
    "posts": 12,
    "comments": 34,
    "messages": 156,
    "notifications": 78,
    "activities": 45,
    "pushTokens": 2,
    "follows": 8,
    "interestProfile": true,
    "consents": true,
    "mediaFiles": 3
  }
}
```

No data is modified.

---

## 8. Consistent & Idempotent Deletion

`purgeUser` is idempotent:
- Each `deleteMany`/`deleteOne` is safe to run multiple times.
- If `userId` is already absent, operations return `{ deletedCount: 0 }` — no error.
- Audit record is written per run, timestamped.
- Partial failures are caught per-operation and logged, not swallowed.


## C4-B2 lifecycle controls

### Legal acceptance evidence

`legal_acceptances` are subject to a defined finite retention period.
Each record receives a finite `retentionDate`, enforced by a MongoDB TTL
index. The configurable policy is `LEGAL_ACCEPTANCE_RETENTION_DAYS`
(default: 1095 days). This is a Folcen policy default and must be shortened
or overridden where the applicable purpose or legal basis does not justify
that period. Article 17 erasure may remove the record earlier.

### Moderation reports

Open and under-review reports do not expire based merely on their creation
date. When a case becomes `resolved` or `dismissed`, the model records
`resolvedAt` and calculates `retentionDate` from that resolution time using
`REPORT_RETENTION_DAYS` (default: 365 days). A MongoDB TTL index on
`retentionDate` performs final deletion.

### User-identifying blacklist records

Blacklist entries that identify a user, IP address or email require both
finite retention and periodic necessity review. `BLACKLIST_REVIEW_DAYS`
defaults to 90 days and `BLACKLIST_RETENTION_DAYS` defaults to 365 days.

For Article 17, a direct `itemType=user` blacklist record is erased by
default. Retention after erasure is allowed only when `retainOnErasure=true`
has been explicitly set together with a non-empty `retentionReason` and a
future finite `retentionDate`. Any such exception receives a new `reviewAt`
date. Creator references belonging to the erased user are removed from
otherwise surviving blacklist rules.

### Legacy moderation-report migration

Older report records may contain a `retentionDate` calculated from report
creation time. The current lifecycle instead starts finite retention when the
moderation case is resolved or dismissed.

The `reports.retentionDate` TTL index is therefore partial: a report is
TTL-eligible only when `resolvedAt` is a BSON date. This prevents legacy open
reports from being deleted merely because an old creation-based
`retentionDate` has elapsed.

Before treating legacy report retention as migrated:

1. Run `scripts/maintenance/migrateReportRetention.js` without `--apply` and
   review the candidate counts.
2. Run it with `--apply` against the intended database.
3. Open and under-review reports have legacy lifecycle dates removed.
4. Resolved and dismissed legacy reports use `updatedAt` as the preferred
   resolution-time approximation, with `createdAt` only as a fallback.
5. The migration is idempotent; already-complete closed lifecycle records are
   left unchanged.
