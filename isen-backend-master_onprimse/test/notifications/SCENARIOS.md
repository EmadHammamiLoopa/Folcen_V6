# Notification Test Scenarios

> **System under test**: Loopa (Onprimse) — backend notification pipeline  
> **Coverage**: N-01 through N-21 (all notification types)  
> **Transports covered**: FCM push · Socket.IO emit · MongoDB record

---

## Section A — Human-Readable Test Scenarios

### N-01 · Friend Request Sent

**Trigger**: User Alice sends a friend request to Bob.

| Field | Expected value |
|---|---|
| Transport | FCM push |
| Recipients | Bob only |
| Push title | `"Alice Smith"` (sender's full name) |
| Push body | `"sent you a friendship request"` |
| Socket event emitted | `emitNewFriendRequest(bobId, aliceId)` |
| DB Notification record | ❌ not created |

**Guard**: If either user does not exist the request is rejected before the notification fires.

---

### N-02 · Friend Request Accepted

**Trigger**: Bob accepts Alice's pending friend request.

| Field | Expected value |
|---|---|
| Transport | FCM push |
| Recipients | Alice (original requester) |
| Push title | `"Bob Jones"` (acceptor's full name) |
| Push body | `"accepted your friendship request"` |
| Socket events emitted | `emitFriendRequestAccepted`, `emitFriendRequestsUpdated` |
| DB Notification record | ❌ not created |

---

### N-03 · Friend Request Declined

**Trigger**: Bob declines Alice's pending friend request.

| Field | Expected value |
|---|---|
| Transport | Socket only |
| Socket event emitted | `emitFriendRequestDeclined` |
| FCM push | ❌ not sent |
| DB Notification record | ❌ not created |

---

### N-04 · Followed (Public User)

**Trigger**: Alice (public profile) starts following Bob.

| Field | Expected value |
|---|---|
| Transport | FCM push |
| Recipients | Bob |
| Push title | `{ en: "Alice Smith" }` |
| Push body | `{ en: "started following you" }` |
| Push data | `{ type: "follow-user", link: "/tabs/profile/display/<aliceId>" }` |
| DB Notification record | ❌ not created directly |

---

### N-05 · Follow Request Sent (Private User)

**Trigger**: Alice sends a follow request to Bob who has a private profile.

| Field | Expected value |
|---|---|
| Transport | FCM push |
| Recipients | Bob |
| Push title | `{ en: "Alice Smith" }` |
| Push body | `{ en: "sent you a follow request" }` |
| Push data | `{ type: "follow-request", link: "/tabs/profile/display/<aliceId>" }` |
| DB Notification record | ❌ not created directly |

---

### N-06 · Follow Request Accepted

**Trigger**: Bob accepts Alice's follow request.

| Field | Expected value |
|---|---|
| Transport | FCM push |
| Recipients | Alice |
| Push title | `{ en: "Bob Jones" }` |
| Push body | `{ en: "accepted your follow request" }` |
| Push data | `{ type: "follow-accepted", link: "/tabs/profile/display/<bobId>" }` |
| DB Notification record | ❌ not created directly |

---

### N-07 · Channel Followed

**Trigger**: Alice follows the channel "Tech News".

| Field | Expected value |
|---|---|
| Transport | FCM push |
| Recipients | Channel owner |
| Push title | Channel owner's name |
| Push body | `"Alice Smith started following the channel"` |
| DB Notification record | ❌ not created |

---

### N-08 · Post Published

**Trigger**: Alice (non-anonymous) publishes a post in channel "Tech News".

| Field | Expected value |
|---|---|
| Transport | FCM push |
| Recipients | Channel followers (excluding poster) |
| Push title | `"Alice Smith"` |
| Push body | `"shared a new post in Tech News"` |
| Guard | If post is anonymous (`anonyme: true`) → notification NOT sent |
| DB Notification record | ❌ not created |

---

### N-09 · Post Voted / Liked

**Trigger**: Alice votes on Bob's post in channel "Tech News".

| Field | Expected value |
|---|---|
| Transport | FCM push |
| Recipients | Post owner (Bob) |
| Push title | `"Tech News"` (channel name) |
| Push body (non-anon) | `"Alice Smith has voted on your post"` |
| Push body (anon) | `"Anonym has voted on your post"` |
| Self-vote guard | If voter === post owner → notification NOT sent |
| DB Notification record | ❌ not created |

---

### N-10 · Comment on Post

**Trigger**: Alice comments on Bob's post.

| Field | Expected value |
|---|---|
| Transport | DB + Socket |
| Recipients | Post owner (Bob) |
| Notification type | `"post_commented"` |
| Title | `"New comment"` |
| Body | `"Alice Smith commented on your post"` |
| Socket event | `notification-received` |
| FCM push | Via `createNotification` → `sendNotification` |

---

### N-11 · Reply to Comment

**Trigger**: Alice replies to Bob's comment.

| Field | Expected value |
|---|---|
| Transport | DB + Socket |
| Recipients | Original commenter (Bob) |
| Notification type | `"reply_to_my_comment"` |
| Title | `"New reply"` |
| Body | `"Alice Smith replied to your comment"` |
| Socket event | `notification-received` |

---

### N-12 · Mention in Comment

**Trigger**: Alice mentions Bob in a comment using `@Bob`.

| Field | Expected value |
|---|---|
| Transport | DB + Socket |
| Recipients | Mentioned user (Bob) |
| Notification type | `"mention_comment"` |
| Title | `"You were mentioned"` |
| Body | `"Alice Smith mentioned you in a comment"` |
| Guard (anonymous post) | Only participants (post author or comment authors) can be tagged |
| Guard (non-anonymous) | Must be a participant OR a friend of the commenter |
| Self-mention guard | No notification if you tag yourself |

---

### N-13 · Mention in Post

**Trigger**: Alice mentions Bob in a post body using `@Bob`.

| Field | Expected value |
|---|---|
| Transport | DB + Socket |
| Recipients | Mentioned user (Bob) |
| Notification type | `"mention_post"` |
| Title | `"You were mentioned"` |
| Body | `"Alice mentioned you in a post"` (first name only) |

---

### N-14 · Comment Voted

**Trigger**: Alice upvotes Bob's comment in channel "Tech News".

| Field | Expected value |
|---|---|
| Transport | FCM push |
| Recipients | Comment author (Bob) |
| Push title | `"Tech News"` (channel name) |
| Push body (non-anon) | `"Alice Smith has voted on your post"` |
| Self-vote guard | If voter === comment author → notification NOT sent |
| DB Notification record | ❌ not created |

---

### N-15 · New Product Listed

**Trigger**: Alice lists a new product "Vintage Lamp".

| Field | Expected value |
|---|---|
| Transport | FCM push |
| Recipients | Alice's followers |
| Push title | `"Alice Smith"` |
| Push body | `"listed a new product: Vintage Lamp"` |
| DB Notification record | ❌ not created |

---

### N-16 · New Service Offered

**Trigger**: Alice offers a new service "Photography".

| Field | Expected value |
|---|---|
| Transport | FCM push |
| Recipients | Alice's followers |
| Push title | `"Alice Smith"` |
| Push body | `"offered a new service: Photography"` |
| DB Notification record | ❌ not created |

---

### N-17 · New Job Posted

**Trigger**: Alice posts a job listing "Senior Developer".

| Field | Expected value |
|---|---|
| Transport | FCM push |
| Recipients | Alice's followers |
| Push title | `"Alice Smith"` |
| Push body | `"posted a new job: Senior Developer"` |
| DB Notification record | ❌ not created |

---

### N-18 · Welcome on Signup

**Trigger**: New user registers — system sends a welcome push.

| Field | Expected value |
|---|---|
| Transport | FCM push |
| Recipients | New user |
| Push title | System account sender name |
| Push body | `"Welcome to Folcen 👋"` |
| DB Notification record | ❌ not created (a welcome chat Message is created) |

---

### N-19 · Incoming Call

**Trigger**: Alice initiates a WebRTC call to Bob.

| Field | Expected value |
|---|---|
| Transport | FCM push only |
| Recipients | Bob (callee) |
| Push title | `"Incoming call"` |
| Push body | `"Tap to answer"` |
| DB Notification record | ❌ not created |
| Socket event | Separate `notifyPeerNeeded` socket event (not a notification) |

---

### N-20 · Account Deletion Scheduled

**Trigger**: User requests account deletion via `DELETE /api/v1/user/me`.

| Field | Expected value |
|---|---|
| Transport | FCM push |
| Recipients | Same user |
| Push body | Starts with `"Your account has been marked for deletion"` |
| Push title | `{ en: "System" }` |
| DB Notification record | ❌ not created |

---

### N-21 · Chat Message (Socket Only)

**Trigger**: Alice sends a direct message to Bob.

| Field | Expected value |
|---|---|
| Transport | Socket.IO only |
| Socket event name | `"new-message"` **(hyphen, NOT underscore)** |
| Payload fields | `_id, text, from, to, image, state, type, productId, createdAt` |
| FCM push | ❌ not sent from chat socket handler |
| DB Notification record | ❌ not created |

> ⚠️ **Known inconsistency**: `app/sockets/chat.js` emits `"new-message"` (hyphen),  
> while `app/helpers.js → realtime.emitNewMessage` and `AdminController` emit `"new_message"` (underscore).  
> The frontend must listen for **both** event names.

---

## Section B — Master Notification Matrix

| ID | Name | Trigger Route/Action | Transport | FCM Push | Socket Event | DB Record | Self-guard | Anon-guard |
|---|---|---|---|---|---|---|---|---|
| N-01 | Friend request sent | `POST /api/v1/request` | Push | ✅ | ✅ `emitNewFriendRequest` | ❌ | — | — |
| N-02 | Friend request accepted | `PUT /api/v1/request/:id/accept` | Push | ✅ | ✅ `emitFriendRequestAccepted` | ❌ | — | — |
| N-03 | Friend request declined | `PUT /api/v1/request/:id/decline` | Socket | ❌ | ✅ `emitFriendRequestDeclined` | ❌ | — | — |
| N-04 | Follow (public) | `POST /api/v1/follow` | Push | ✅ | ✅ | ❌ | — | — |
| N-05 | Follow request (private) | `POST /api/v1/follow` | Push | ✅ | ✅ | ❌ | — | — |
| N-06 | Follow request accepted | `PUT /api/v1/follow/:id/accept` | Push | ✅ | — | ❌ | — | — |
| N-07 | Channel followed | `POST /api/v1/channel/:id/follow` | Push | ✅ | — | ❌ | — | — |
| N-08 | Post published | `POST /api/v1/post` | Push | ✅ | — | ❌ | — | ✅ skip if anon |
| N-09 | Post voted | `PUT /api/v1/post/:id/vote` | Push | ✅ | — | ❌ | ✅ no self | ✅ "Anonym" |
| N-10 | Comment on post | `POST /api/v1/comment` | DB+Socket | ✅ (via createNotif) | ✅ `notification-received` | ✅ | — | — |
| N-11 | Reply to comment | `POST /api/v1/comment` (parent set) | DB+Socket | ✅ (via createNotif) | ✅ `notification-received` | ✅ | — | — |
| N-12 | Mention in comment | `POST /api/v1/comment` (@ tag) | DB+Socket | ✅ (via createNotif) | ✅ `notification-received` | ✅ | ✅ no self | ✅ participants only |
| N-13 | Mention in post | `POST /api/v1/post` (@ tag) | DB+Socket | ✅ (via createNotif) | ✅ `notification-received` | ✅ | — | — |
| N-14 | Comment voted | `PUT /api/v1/comment/:id/vote` | Push | ✅ | — | ❌ | ✅ no self | ✅ "Anonym" |
| N-15 | New product | `POST /api/v1/product` | Push | ✅ | — | ❌ | — | — |
| N-16 | New service | `POST /api/v1/service` | Push | ✅ | — | ❌ | — | — |
| N-17 | New job | `POST /api/v1/job` | Push | ✅ | — | ❌ | — | — |
| N-18 | Welcome on signup | `POST /api/v1/auth/register` | Push | ✅ | — | ❌ | — | — |
| N-19 | Incoming call | WebRTC signaling | FCM only | ✅ | ✅ `notifyPeerNeeded` (separate) | ❌ | — | — |
| N-20 | Account deletion scheduled | `DELETE /api/v1/user/me` | Push | ✅ | — | ❌ | — | — |
| N-21 | Chat message | Socket `send-message` | Socket only | ❌ | ✅ `new-message` (hyphen) | ❌ | — | — |

---

## Section C — Automated Test Coverage Requirements

| Test ID | File | What is verified |
|---|---|---|
| T-01 | `unit/text-formatting.test.js` | N-01 push body exact string |
| T-02 | `unit/text-formatting.test.js` | N-02 push body exact string |
| T-03 | `unit/text-formatting.test.js` | N-04/05/06 multilingual `{en: …}` wrapper |
| T-04 | `unit/text-formatting.test.js` | N-08 anon guard prevents push |
| T-05 | `unit/text-formatting.test.js` | N-09 self-vote guard |
| T-06 | `unit/text-formatting.test.js` | N-09 anon vote shows "Anonym" |
| T-07 | `unit/text-formatting.test.js` | N-10/11/12 exact DB notification body |
| T-08 | `unit/text-formatting.test.js` | N-12 anon mention guards |
| T-09 | `unit/text-formatting.test.js` | N-12 self-mention suppressed |
| T-10 | `unit/text-formatting.test.js` | N-13 uses firstName only |
| T-11 | `unit/text-formatting.test.js` | N-19 FCM title/body fixed strings |
| T-12 | `unit/text-formatting.test.js` | N-21 socket event name is "new-message" (hyphen) |
| T-13 | `integration/triggers.test.js` | sendPushToUser called for N-01 trigger |
| T-14 | `integration/triggers.test.js` | Notification DB record created for N-10 |
| T-15 | `integration/triggers.test.js` | N-18 welcome push body exact |
| T-16 | `integration/triggers.test.js` | N-20 deletion push body starts with expected text |
| T-17 | `integration/fcm-cleanup.test.js` | Invalid FCM token removed from DB |
| T-18 | `integration/fcm-cleanup.test.js` | Valid token NOT removed after success |

---

## Section D — Running the Tests

### 1 · Local run (full backend test suite)

```bash
cd isen-backend-master_onprimse

# Install dependencies (first time only)
npm install

# Run the entire backend test suite
FIREBASE_SERVICE_ACCOUNT_PATH=/dev/null NODE_ENV=test npx jest --forceExit --runInBand
```

`--runInBand` is required for integration tests: each file spins up its own
`MongoMemoryServer` instance and MongoMemoryServer's binary download is not
safe to parallelize on the first run.

---

### 2 · Run only the notification tests

```bash
FIREBASE_SERVICE_ACCOUNT_PATH=/dev/null NODE_ENV=test \
  npx jest --forceExit --runInBand \
  --testPathPattern="test/notifications"
```

---

### 3 · Unit only / integration only

```bash
# Unit tests only (no DB, instant)
FIREBASE_SERVICE_ACCOUNT_PATH=/dev/null NODE_ENV=test \
  npx jest --forceExit \
  --testPathPattern="test/notifications/unit"

# Integration tests only (requires MongoMemoryServer binary)
FIREBASE_SERVICE_ACCOUNT_PATH=/dev/null NODE_ENV=test \
  npx jest --forceExit --runInBand \
  --testPathPattern="test/notifications/integration"
```

---

### 4 · CI example (GitHub Actions)

```yaml
# .github/workflows/backend-tests.yml
name: Backend tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    env:
      NODE_ENV: test
      FIREBASE_SERVICE_ACCOUNT_PATH: /dev/null   # FCM mock intercepts before SDK
      MONGOMS_PREFER_GLOBAL_PATH: "true"         # cache MongoMemoryServer binary

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: "18"
          cache: npm
          cache-dependency-path: isen-backend-master_onprimse/package-lock.json

      # Cache the MongoMemoryServer binary so it is not re-downloaded on every run
      - name: Cache MongoMemoryServer binary
        uses: actions/cache@v4
        with:
          path: ~/.cache/mongodb-binaries
          key: mongoms-${{ runner.os }}-${{ hashFiles('isen-backend-master_onprimse/package-lock.json') }}
          restore-keys: mongoms-${{ runner.os }}-

      - name: Install dependencies
        working-directory: isen-backend-master_onprimse
        run: npm ci

      - name: Run notification tests
        working-directory: isen-backend-master_onprimse
        run: |
          npx jest --forceExit --runInBand \
            --testPathPattern="test/notifications" \
            --ci
```

> The `--ci` flag disables interactive watch mode and treats new snapshots as
> errors, which is the recommended practice for CI pipelines.

---

### 5 · Required environment variables

| Variable | Required? | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | ✅ yes | *(none)* | Set to `test` — gates certain initialisation paths (e.g. Redis fallback) |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | ✅ yes | *(none)* | Set to `/dev/null` — prevents Firebase Admin SDK from throwing when no real credentials exist; the FCM mock intercepts all calls before the SDK is reached |
| `MONGOMS_PREFER_GLOBAL_PATH` | optional | `false` | Set to `true` in CI to cache the MongoMemoryServer binary in `~/.cache/mongodb-binaries` |
| `MONGOMS_VERSION` | optional | from `mongodb-memory-server` package | Pin a specific MongoDB binary version if the default download fails in an air-gapped environment |

No real Firebase credentials are needed. The mock at
`test/notifications/mocks/fcm.js` is injected into the `require` cache before
any module under test loads `app/services/fcmPushService`, so `firebase-admin`
is never initialised during the test run.

---

### 6 · Troubleshooting

#### ❶ Missing Jest config — `No tests found` or `jest: command not found`

Jest must be listed in `devDependencies` and a config must exist or Jest must
be pointed at the right roots.

```bash
# Confirm jest is installed
npx jest --version

# If missing, install it
npm install --save-dev jest
```

Add a minimal config to `package.json` if none exists:

```json
"jest": {
  "testEnvironment": "node",
  "testMatch": ["**/test/**/*.test.js"],
  "testTimeout": 30000
}
```

Or create `jest.config.js` at the backend root:

```js
// jest.config.js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.js'],
  testTimeout: 30000,
  // Required when using require-cache injection in integration tests
  resetModules: false,
  restoreMocks: false,
};
```

> ⚠️ Do **not** set `resetModules: true` or `--clearCache` — the integration
> tests rely on manual `require.cache` injection to swap Firebase Admin and
> the FCM service before the modules under test are loaded.

---

#### ❷ MongoMemoryServer binary download fails

MongoMemoryServer downloads a MongoDB binary on the first run. This fails in
air-gapped environments or behind strict proxies.

**Option A — Pre-download and cache (recommended for CI)**

```yaml
# In GitHub Actions (see Section 4 above for full context)
- name: Cache MongoMemoryServer binary
  uses: actions/cache@v4
  with:
    path: ~/.cache/mongodb-binaries
    key: mongoms-${{ runner.os }}-...
```

**Option B — Pin to a version that is already available**

```bash
# In .env.test or as an environment variable
MONGOMS_VERSION=6.0.0
```

**Option C — Provide a pre-downloaded binary path**

```bash
MONGOMS_SYSTEM_BINARY=/usr/bin/mongod \
  NODE_ENV=test npx jest --forceExit --runInBand
```

**Option D — Allow download through the proxy**

```bash
MONGOMS_DOWNLOAD_URL=https://downloads.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-6.0.4.tgz \
  NODE_ENV=test npx jest --forceExit --runInBand
```

---

#### ❸ ESM / CommonJS import errors

All files in `test/notifications/` are plain CommonJS (`require`/`module.exports`).
If you see errors like `SyntaxError: Cannot use import statement in a module`
or `ERR_REQUIRE_ESM`, the cause is one of the following:

**a) `package.json` has `"type": "module"`**

The backend's `package.json` must not have `"type": "module"` (or must override
it for test files). Check and remove if present:

```json
// Remove or do not add this line in isen-backend-master_onprimse/package.json
"type": "module"   // ← remove this
```

**b) Babel or ts-jest transforming to ESM**

If a Babel config targets ESM output, add a Jest transform override:

```js
// jest.config.js
module.exports = {
  transform: {
    '^.+\\.js$': ['babel-jest', { presets: [['@babel/preset-env', { targets: { node: 'current' } }]] }],
  },
};
```

**c) An ESM-only dependency in the require chain**

Run Jest with `--verbose` to identify the offending module:

```bash
NODE_ENV=test npx jest --forceExit --runInBand --verbose \
  --testPathPattern="test/notifications" 2>&1 | grep "ERR_REQUIRE_ESM"
```

Then add that package to `transformIgnorePatterns` exclusions or pin it to its
last CJS release.
