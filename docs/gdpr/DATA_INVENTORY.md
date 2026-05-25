# GDPR Data Inventory — Folcen

> Auto-derived from codebase scan (backend: `isen-backend-master_onprimse`).  
> Last updated: 2026-03-07

---

## 1. Collections Containing Personal Data

### 1.1 `users`
**Model:** `app/models/User.js` | **Legal basis:** Contract performance (Art. 6(1)(b))

| Field | Category | Purpose | Written by | Read by | Retention | Necessary? |
|-------|----------|---------|-----------|---------|-----------|-----------|
| `firstName`, `lastName` | Identity | Display name, profile | `AuthController` (signup), `UserController` (update) | All authenticated routes | Until erasure | Yes |
| `email` | Contact | Authentication, login | `AuthController` signup | Auth flows, DSAR | Until erasure | Yes |
| `hashed_password`, `salt` | Identity | Authentication credential | `AuthController` | Auth only | Until erasure | Yes |
| `phone` | Contact | Profile display | `UserController` | Profile views | Until erasure | Optional |
| `gender`, `genderVisible` | Identity | Profile | User settings | Profile views | Until erasure | Optional |
| `birthDate` | Identity | Age verification / profile | User settings | Profile views | Until erasure | Optional |
| `country`, `city` | Identity | Profile / location | User settings | Profile views | Until erasure | Optional |
| `school`, `education`, `profession` | Identity | Profile | User settings | Profile views | Until erasure | Optional |
| `aboutMe` | Content | Profile bio | User settings | Public profile | Until erasure | Optional |
| `mainAvatar`, `avatar[]` | Identity | Profile photo | Upload endpoint | Profile views | Until erasure | Optional |
| `interests[]` | Behavior | Interest profile, content recommendation | User settings, interest sync | Recommendation logic | Until erasure | Optional/Consent |
| `lastSeen` | Usage | "Last online" display, analytics DAU/WAU/MAU | Socket events | Analytics, profile | Until erasure | Legitimate interest |
| `is2FAEnabled`, `twoFAToken` | Identity | Security | Auth | Auth | Session | Yes (security) |
| `role` | Identity | Access control | Admin | RBAC | Until erasure | Yes |
| `banned`, `bannedReason` | Identity | Moderation record | Admin/moderators | Admin dashboard | Until erasure | Legitimate interest |
| `isDeleted`, `deletedAt`, `purgeAt`, `deletedBy` | Identity | GDPR erasure lifecycle | GDPR controller | Purge job | 30 days post-deletion | Yes (legal) |
| `consents` (embedded, to be added) | Behavior | Analytics opt-in/out | Consent endpoint | Analytics pipeline | Until erasure | Yes (lawful basis) |

---

### 1.2 `pushtokens`
**Model:** `app/models/PushToken.js` | **Legal basis:** Contract performance (notifications)

| Field | Category | Purpose | Retention | Necessary? |
|-------|----------|---------|-----------|-----------|
| `userId` | Identity | Link token to user | Until user deletion or token refresh | Yes |
| `token` | Device | FCM push notification | Until user deletion or revocation | Yes |
| `platform` | Device | Platform targeting | Same | Yes |
| `deviceId` | Device | Multi-device dedup | Same | Yes |
| `lastSeenAt` | Usage | Stale token cleanup | Same | Yes |

---

### 1.3 `messages`
**Model:** `app/models/Message.js` | **Legal basis:** Contract performance (messaging feature)

| Field | Category | Purpose | Retention | Necessary? |
|-------|----------|---------|-----------|-----------|
| `text` | Content | Message body | Until erasure / message deletion | Yes |
| `from`, `to` | Identity | Participants | Same | Yes |
| `image`, `media[]` | Content | Media attachments | Until media expiry | Yes |
| `state` | Usage | Read receipts | Same | Yes |
| `readBy[]` | Behavior | Read receipts | Same | Yes |

---

### 1.4 `posts`
**Model:** `app/models/Post.js` | **Legal basis:** Contract performance

| Field | Category | Purpose | Retention | Necessary? |
|-------|----------|---------|-----------|-----------|
| `text` | Content | Post content | Until erasure or anonymization | Yes |
| `user` | Identity | Author reference | Until erasure | Yes |
| `media.url` | Content | Media URL | Until `media.expiryDate` | Yes |
| `votes[].user` | Behavior | Voting record | Until erasure | Yes |
| `anonyme` | Identity | Anonymous flag | Same | Yes |
| `deletedAt` | Identity | Soft-delete GDPR | Same | Yes |
| `eventLocation` | Identity/Content | Location data | Until erasure | Optional |

---

### 1.5 `comments`
**Model:** `app/models/Comment.js` | **Legal basis:** Contract performance

| Field | Category | Purpose | Retention | Necessary? |
|-------|----------|---------|-----------|-----------|
| `text`, `media` | Content | Comment content | Until erasure | Yes |
| `user` | Identity | Author reference | Until erasure | Yes |
| `votes[].user` | Behavior | Vote tracking | Until erasure | Yes |

---

### 1.6 `notifications`
**Model:** `app/models/Notification.js` | **Legal basis:** Contract performance

| Field | Category | Purpose | Retention | Necessary? |
|-------|----------|---------|-----------|-----------|
| `recipient`, `sender` | Identity | Routing | Until read + 30d (no TTL set) | Yes |
| `body`, `data` | Content | Notification payload | Same | Yes |

> ⚠️ **GAP:** No TTL index — notifications accumulate indefinitely.

---

### 1.7 `activities`
**Model:** `app/models/Activity.js` | **Legal basis:** Legitimate interest (engagement tracking)

| Field | Category | Purpose | Retention | Necessary? |
|-------|----------|---------|-----------|-----------|
| `actor` | Identity | Which user acted | Until erasure (no TTL) | Legitimate interest |
| `type`, `targetType`, `targetId` | Behavior | Action log | Same | Legitimate interest |
| `content`, `meta` | Content/Behavior | Extra context | Same | Optional |

> ⚠️ **GAP:** No TTL index. Raw behavioral data linked to user ID.

---

### 1.8 `audit_logs`
**Model:** `app/models/AuditLog.js` | **Legal basis:** Legal obligation (Art. 6(1)(c))

| Field | Category | Purpose | Retention | Necessary? |
|-------|----------|---------|-----------|-----------|
| `actorId`, `actorRole` | Identity | Who performed action | 2 years minimum | Yes (legal) |
| `action`, `meta` | Behavior | What was done | Same | Yes |
| `ip`, `userAgent` | Device | Forensic trail | Same | Yes |
| `targetUserId` | Identity | Subject of action | Same | Yes |

> ✅ **No TTL by design** — audit logs must be retained per legal obligation.

---

### 1.9 `authevents`
**Model:** `app/models/AuthEvent.js` | **Legal basis:** Legitimate interest (security)

| Field | Category | Purpose | Retention |
|-------|----------|---------|-----------|
| `type`, `user`, `ipHash` | Identity/Security | Security log | Env-configurable TTL (default 30d) |

> ✅ TTL index is conditionally applied via env `AUTH_EVENT_RETENTION_DAYS`.

---

### 1.10 `call_events`
**Model:** `app/models/CallEvent.js` | **Legal basis:** Legitimate interest (abuse prevention)

| Field | Category | Purpose | Retention |
|-------|----------|---------|-----------|
| `initiatedBy`, `participants[]` | Identity | Call participants | TTL via `expiresAt` (default 90d) |
| `lifecycle[]` | Usage | Call lifecycle events | Same |

> ✅ TTL index present on `expiresAt`.

---

### 1.11 `legal_acceptances`
**Model:** `app/models/LegalAcceptance.js` | **Legal basis:** Legal obligation (Art. 7)

| Field | Category | Purpose | Retention |
|-------|----------|---------|-----------|
| `userId` | Identity | Consent subject | Lifetime (legal obligation) |
| `documentType`, `documentVersion` | Identity | Which terms were accepted | Lifetime |
| `acceptedAt` | Usage | Timestamp of consent | Lifetime |
| `meta.ip`, `meta.userAgent` | Device | Consent context | Lifetime |

> ⚠️ **GAP:** Append-only by design but no mechanism prevents UPDATE or DELETE via Mongo shell.

---

### 1.12 `reports`
**Model:** `app/models/Report.js` | **Legal basis:** Legal obligation / Legitimate interest

| Field | Category | Purpose | Retention |
|-------|----------|---------|-----------|
| `reporter` | Identity | Who filed the report | Until `retentionDate` |
| `message` | Content | Free-text report | Same |
| `reporterIp`, `reporterUserAgent` | Device | Anti-abuse | Same |
| `evidence[]` | Content | Screenshots | Same |

---

### 1.13 `follows`
**Model:** `app/models/Follow.js` | **Legal basis:** Contract performance

| Field | Category | Purpose | Retention |
|-------|----------|---------|-----------|
| `follower`, `followed` | Identity | Social graph | Until erasure |

---

### 1.14 `user_activity_daily` (aggregated)
**Model:** `app/models/UserActivityDaily.js` | **Legal basis:** Legitimate interest

| Field | Category | Purpose | Retention |
|-------|----------|---------|-----------|
| `userId` | Identity | DAU tracking | No TTL set |
| `date` | Usage | Activity date | Same |

> ⚠️ **GAP:** No retention / TTL policy.

---

### 1.15 `messageevent` (collection)
**Model:** `app/models/MessageEvent.js` | **Legal basis:** Legitimate interest (delivery/abuse)

> Read minimally. Purge job handles TTL via `expiresAt`. ✅

---

## 2. Data Sinks

| Sink | Where | Data Exposed | Risk |
|------|-------|-------------|------|
| FCM push tokens | `pushtokens` collection | Device token ↔ userId | HIGH: tokens can fingerprint devices |
| Chat messages | `messages` collection + media files on disk | Message content, sender/recipient | HIGH: sensitive content |
| Media files | `uploads/` on disk | Photos, videos linked to users | HIGH: not cleaned on erasure |
| Notification payloads | `notifications` collection | Display name, content excerpts | MEDIUM |
| Activity feed | `activities` collection | Behavioral profile per user | MEDIUM |
| Audit logs | `audit_logs` collection | IP, userAgent, actions | LOW (internal only) |
| Analytics aggregates | `AnalyticsController` queries | Aggregated counts only | LOW |
| Redis presence | `socketManager.js` | userId ↔ socket presence | MEDIUM (in-memory, not persisted) |
| Server logs | `logs/` + `logging.js` middleware | Redacted via pino-redact | LOW (redaction applied) |

---

## 3. Mobile App (Read-Only Analysis)

The mobile app (`src/`) does **not** send any additional analytics or tracking beyond:
- REST API calls to backend (`/api/v1/*`)
- Socket.IO events (presence, chat, calls)
- Firebase Cloud Messaging token registration

No third-party analytics SDKs (Google Analytics, Mixpanel, etc.) detected in `src/app/`.

---

## 4. Data Flow Summary

```
Mobile App ──REST/WS──► Backend (Express)
                           ├── MongoDB (all persistent data)
                           ├── Redis (socket presence, token blacklist)
                           ├── FCM (push via firebase-admin)
                           └── uploads/ (media files)
```
