# USER_VISIBLE_SUMMARY — What the User Gets & When

> **Source of truth**
> - Text strings: `test/notifications/fixtures.js` → `EXPECTED` constants
> - Scenarios & matrix: `test/notifications/SCENARIOS.md`
> - Trigger routes / guards: `app/controllers/` + `app/sockets/` (research only, no code changed)
>
> **Legend**
> - ✅ Present  ·  ❌ Absent  ·  ⚠️ Bug / caveat noted
> - Push title/body shown in quotes **exactly** as they appear in `fixtures.js` `EXPECTED.*`.
>   Where `fixtures.js` has no entry, the value is sourced from `SCENARIOS.md` or the
>   controller and is flagged with `[NOT IN fixtures.js EXPECTED]`.

---

## N-01 — Friend Request Sent

```
Trigger:   POST /api/v1/request/:userId  →  RequestController.storeRequest
Recipient: Target user (Bob)
When:      Immediate (inline, after request record is saved)
```

**Delivery**
| Channel | Status |
|---|---|
| In-app DB record | ❌ not created |
| Push (FCM) | ✅ yes |
| Socket-only | ✅ `new-friend-request` emitted to recipient |

**Exact text** (source: `EXPECTED.friendRequestSent`)
```
Push title: "Alice Smith"
Push body:  "sent you a friendship request"
```

**Extra**
- Guards: both users must exist; blocked in either direction → 403; already friends → 409; duplicate pending request → 409
- FCM data payload: `{ type: "message", link: "/messages/chat/<sortedId>" }`  
  *(4-arg sendNotification path — deep-link goes to chat, not the friend request)*

---

## N-02 — Friend Request Accepted

```
Trigger:   POST /api/v1/request/accept/:requestId  →  RequestController.acceptRequest
Recipient: Original requester (Alice)
When:      Immediate (inline)
```

**Delivery**
| Channel | Status |
|---|---|
| In-app DB record | ❌ not created |
| Push (FCM) | ✅ yes |
| Socket-only | ✅ `friend-requests-updated` (type: accepted) emitted to both parties via `emitFriendRequestAccepted` + `emitFriendRequestsUpdated` |

**Exact text** (source: `EXPECTED.friendRequestAccepted`)
```
Push title: "Bob Jones"
Push body:  "accepted your friendship request"
```

**Extra**
- Guards: blocked in either direction → 403; request document must exist
- FCM data payload: `{ type: "message", link: "/messages/chat/<sortedId>" }`

---

## N-03 — Friend Request Declined

```
Trigger:   PUT /api/v1/request/:id/decline  →  RequestController (decline handler)
Recipient: Original requester (Alice)
When:      Online-only (socket event only — no push, no offline delivery)
```

**Delivery**
| Channel | Status |
|---|---|
| In-app DB record | ❌ not created |
| Push (FCM) | ❌ not sent |
| Socket-only | ✅ `emitFriendRequestDeclined` emitted to requester |

**Exact text**
```
Push title: N/A — no push
Push body:  N/A — no push
```
*(No entry in `fixtures.js` EXPECTED — correct, there is nothing to assert on)*

**Extra**
- Payload: none beyond the socket event itself

---

## N-04 — Followed (Public User)

```
Trigger:   POST /api/v1/follow/:userId  (when target profile isPrivate === false)
           →  FollowController.followUser
           Also: POST /api/v1/user/follow/:userId  →  UserController.follow  [legacy path]
Recipient: Followed user (Bob)
When:      Immediate (inline)
```

**Delivery**
| Channel | Status |
|---|---|
| In-app DB record | ❌ not created |
| Push (FCM) | ✅ yes |
| Socket-only | ✅ `follow-update` broadcast via `io.emit` (all-clients broadcast, not targeted) |

**Exact text** (source: `EXPECTED.followPublic`)
```
Push title: { en: "Alice Smith" }
Push body:  { en: "started following you" }
```

**Extra**
- Guards: can't follow self → 400; blocked either way → 403; already active follow → 200 no-op
- FCM data payload: `{ type: "follow-user", link: "/tabs/profile/display/<followerId>" }`

---

## N-05 — Follow Request Sent (Private User)

```
Trigger:   POST /api/v1/follow/:userId  (when target profile isPrivate === true)
           →  FollowController.followUser
Recipient: Target user (Bob, private profile)
When:      Immediate (inline)
```

**Delivery**
| Channel | Status |
|---|---|
| In-app DB record | ❌ not created |
| Push (FCM) | ✅ yes |
| Socket-only | ✅ `follow-update` (status: pending) broadcast via `io.emit` |

**Exact text** (source: `EXPECTED.followRequest`)
```
Push title: { en: "Alice Smith" }
Push body:  { en: "sent you a follow request" }
```

**Extra**
- Guards: same as N-04; fires only when target `isPrivate === true`
- FCM data payload: `{ type: "follow-request", link: "/tabs/profile/display/<followerId>" }`

---

## N-06 — Follow Request Accepted

```
Trigger:   PUT /api/v1/follow/request/:userId  (body: { status: "active" })
           →  FollowController.handleFollowRequest
Recipient: Original follower (Alice)
When:      Immediate (inline)
```

**Delivery**
| Channel | Status |
|---|---|
| In-app DB record | ❌ not created |
| Push (FCM) | ✅ yes |
| Socket-only | ✅ `follow-update` (status: active) broadcast via `io.emit` |

**Exact text** (source: `EXPECTED.followAccepted`)
```
Push title: { en: "Bob Jones" }
Push body:  { en: "accepted your follow request" }
```

**Extra**
- Guards: pending follow record must exist; request body `status` must be `"active"`
- FCM data payload: `{ type: "follow-accepted", link: "/tabs/profile/display/<followedId>" }`

---

## N-07 — Channel Followed

```
Trigger:   POST /api/v1/channel/follow/:channelId  →  ChannelController.followChannel
Recipient: Channel owner
When:      Immediate (inline)
```

**Delivery**
| Channel | Status |
|---|---|
| In-app DB record | ❌ not created |
| Push (FCM) | ✅ yes |
| Socket-only | ❌ no socket event |

**Exact text**
```
Push title: <channel.name>   [NOT IN fixtures.js EXPECTED — dynamic, source: ChannelController]
Push body:  "<firstName> <lastName> started following the channel"
            [NOT IN fixtures.js EXPECTED — dynamic string; SCENARIOS.md example: "Alice Smith started following the channel"]
```

**Extra**
- Guards: if currently following → switches to unfollow instead; channel owner cannot unfollow own channel → 400
- FCM data payload: `{ type: "follow-channel", link: "/tabs/channels/channel/<channelId>" }`

---

## N-08 — Post Published

```
Trigger:   POST /api/v1/channel/:channelId/post  →  PostController.storePost
Recipient: Channel followers (excluding the poster)
When:      Immediate (inline, after post is saved)
```

**Delivery**
| Channel | Status |
|---|---|
| In-app DB record | ❌ not created |
| Push (FCM) | ✅ yes (skipped for anonymous posts) |
| Socket-only | ✅ `new_feed_post` via `realtime.emitFeedPost` |

**Exact text** (source: `EXPECTED.postPublished`)
```
Push title: "Alice Smith"
Push body:  "shared a new post in Tech News"
```

**Extra**
- Guards: `anonyme: true` → notification NOT sent; `visibility: "private"` → NOT sent; empty recipients list → NOT sent
- FCM data payload: `{ type: "followed_user_posted", link: "/tabs/channels/post/<postId>" }`

---

## N-09 — Post Voted / Liked

```
Trigger:   POST /api/v1/channel/post/:postId/vote  →  PostController.voteOnPost
           (executes inside setImmediate — fire-and-forget after response)
Recipient: Post owner (Bob)
When:      Immediate (fire-and-forget, does NOT block the vote response)
```

**Delivery**
| Channel | Status |
|---|---|
| In-app DB record | ❌ not created |
| Push (FCM) | ✅ yes |
| Socket-only | ✅ `post-interaction` emitted to post owner via `realtime.emitPostInteraction` (**Fix 1** — previously silently threw) |

**Exact text** (source: `EXPECTED.postVoted` / `EXPECTED.postVotedAnon`)
```
Push title:               "Tech News"
Push body (non-anon voter): "Alice Smith has voted on your post"
Push body (anon voter):     "Anonym has voted on your post"
```

**Extra**
- Guards: self-vote → notification NOT sent; vote must be new (`!existingVote`); channel must exist
- FCM data payload: `{ type: "vote-channel-post", link: "/tabs/channels/post/<postId>" }`

---

## N-10 — Comment on Post

```
Trigger:   POST /api/v1/comment/post/:postId/comment  →  CommentController.storeComment
Recipient: Post owner (Bob)
When:      Immediate (inline); socket delivers instantly if Bob is online;
           FCM push reaches Bob on next app open if offline
```

**Delivery**
| Channel | Status |
|---|---|
| In-app DB record | ✅ yes — `type: "post_commented"`, fields: `{ postId, commentId, link, anonymName }` |
| Push (FCM) | ✅ yes (via `createNotification → sendNotification`) |
| Socket-only | ✅ `notification-received` emitted to recipient |

**Exact text** (source: `EXPECTED.commentOnPost`)
```
DB type:    "post_commented"
Push title: "New comment"
Push body:  "Alice Smith commented on your post"
```

**Extra**
- Guards: `post.visibility === "private"` → no notification; commenter === post owner → skip; post owner already in `mentionedUsers` for this comment → skip
- FCM data payload: `{ type: "post_commented", link: "/tabs/channels/post/<postId>" }` (**Fix 6** — previously `{ type: "message", link: "/messages/chat/..." }`)

---

## N-11 — Reply to Comment

```
Trigger:   POST /api/v1/comment/post/:postId/comment  (body includes parentComment)
           →  CommentController.storeComment (parentComment block)
Recipient: Original commenter whose comment was replied to (Bob)
When:      Immediate (inline); socket if online / FCM push if offline
```

**Delivery**
| Channel | Status |
|---|---|
| In-app DB record | ✅ yes — `type: "reply_to_my_comment"`, fields: `{ postId, commentId, link, anonymName }` |
| Push (FCM) | ✅ yes (via `createNotification`) |
| Socket-only | ✅ `notification-received` |

**Exact text** (source: `EXPECTED.replyToComment`)
```
DB type:    "reply_to_my_comment"
Push title: "New reply"
Push body:  "Alice Smith replied to your comment"
```

**Extra**
- Guards: parent comment must exist; parent author must differ from current commenter; parent author must not already be in `mentionedUsers` for this comment
- FCM data payload: `{ type: "reply_to_my_comment", link: "/tabs/channels/post/<postId>" }` (**Fix 6** — previously `/messages/chat/...`)

---

## N-12 — Mention in Comment

```
Trigger:   POST /api/v1/comment/post/:postId/comment  (@username tag in comment text)
           →  CommentController.storeComment (mention loop)
Recipient: Mentioned user (Bob)
When:      Immediate (inline); socket if online / FCM push if offline
```

**Delivery**
| Channel | Status |
|---|---|
| In-app DB record | ✅ yes — `type: "mention_comment"`, fields: `{ postId, commentId, link, anonymName }` |
| Push (FCM) | ✅ yes (via `createNotification`) |
| Socket-only | ✅ `notification-received` + `mention-received` (via `realtime.emitMention`) |

**Exact text** (source: `EXPECTED.mentionInComment`)
```
DB type:    "mention_comment"
Push title: "You were mentioned"
Push body:  "Alice Smith mentioned you in a comment"
```

**Extra**
- Guards: self-mention → suppressed; anonymous commenter → can only tag participants (post author or existing comment authors); non-anonymous commenter → must tag a participant OR a friend; `post.visibility === "private"` → no notification
- FCM data payload: `{ type: "mention_comment", link: "/tabs/channels/post/<postId>" }` (**Fix 6** — previously `/messages/chat/...`)

---

## N-13 — Mention in Post

```
Trigger:   POST /api/v1/channel/:channelId/post  (@firstName tag in post body)
           →  PostController.storePost (mention parsing loop)
Recipient: Mentioned user (Bob)
When:      Immediate (inline); socket if online / FCM push if offline
```

**Delivery**
| Channel | Status |
|---|---|
| In-app DB record | ✅ yes — `type: "mention_post"`, fields: `{ postId, link: "/tabs/channels/post/<id>" }` |
| Push (FCM) | ✅ yes (via `createNotification`) |
| Socket-only | ✅ `notification-received` + `mention-received` |

**Exact text** (source: `EXPECTED.mentionInPost`)
```
DB type:    "mention_post"
Push title: "You were mentioned"
Push body:  "Alice mentioned you in a post"   ← first name only (not full name)
```

**Extra**
- Guards: anonymous post → mention NOT sent; self-mention → suppressed; `@firstName` regex must resolve to an existing user
- FCM data payload: `{ type: "mention_post", link: "/tabs/channels/post/<postId>" }` (**Fix 6** — previously `/messages/chat/...`)

---

## N-14 — Comment Voted

```
Trigger:   POST /api/v1/comment/:commentId/vote  →  CommentController.voteOnComment
Recipient: Comment author (Bob)
When:      Immediate (inline) — but see bug note below
```

**Delivery**
| Channel | Status |
|---|---|
| In-app DB record | ❌ not created |
| Push (FCM) | ✅ yes — but only on vote-flip (see bug) |
| Socket-only | ❌ no socket event |

**Exact text** (source: `EXPECTED.commentVoted`)
```
Push title: "Tech News"
Push body:  "Alice Smith has voted on your post"
```
*(Same body text as N-09 post vote — no distinct "voted on your comment" wording)*

**Extra**
- Guards: ~~**Bug** — condition was `if (userVoteInd && ...)` (falsy for -1) causing first-vote notifications to be skipped.~~ **Fixed (Fix 4)**: condition is now `if (userVoteInd !== -1 && ...)` — notification fires correctly on all vote state changes, including on a vote flip.
- FCM data payload: `{ type: "vote-channel-post", link: "/tabs/channels/post/<postId>?commentId=<commentId>" }`

---

## N-15 — New Product Listed

```
Trigger:   POST /api/v1/product  →  ProductController.storeProduct
Recipient: Seller's followers
When:      Immediate (inline)
```

**Delivery**
| Channel | Status |
|---|---|
| In-app DB record | ❌ not created |
| Push (FCM) | ✅ yes |
| Socket-only | ✅ `new-buy-sell-update` broadcast via `io.emit` (all-clients broadcast) |

**Exact text** (source: `EXPECTED.newProduct`)
```
Push title: "Alice Smith"
Push body:  "listed a new product: Vintage Lamp"   ← product.label is dynamic
```

**Extra**
- Guards: `visibility` not `"public"` or `"friends-only"` → recipients empty → no push; legal acceptance middleware (`seller_disclaimer`) must be present
- FCM data payload: `{ type: "followed_user_created_product", link: "/tabs/products/details/<productId>" }`

---

## N-16 — New Service Offered

```
Trigger:   POST /api/v1/service  →  ServiceController.storeService
Recipient: Provider's followers
When:      Immediate (inline)
```

**Delivery**
| Channel | Status |
|---|---|
| In-app DB record | ❌ not created |
| Push (FCM) | ✅ yes |
| Socket-only | ✅ `new-business-post` broadcast via `io.emit` (all-clients broadcast) |

**Exact text** (source: `EXPECTED.newService`)
```
Push title: "Alice Smith"
Push body:  "offered a new service: Photography"   ← service.title is dynamic
```

**Extra**
- Guards: same visibility / recipient guard as N-15; legal acceptance middleware (`service_disclaimer`) required
- FCM data payload: `{ type: "followed_user_created_service", link: "/tabs/services/details/<serviceId>" }`

---

## N-17 — New Job Posted

```
Trigger:   POST /api/v1/job  →  jobController.storeJob
Recipient: Poster's followers
When:      Immediate (inline)
```

**Delivery**
| Channel | Status |
|---|---|
| In-app DB record | ❌ not created |
| Push (FCM) | ✅ yes |
| Socket-only | ✅ `new-business-post` broadcast via `io.emit` (all-clients broadcast) |

**Exact text** (source: `EXPECTED.newJob`)
```
Push title: "Alice Smith"
Push body:  "posted a new job: Senior Developer"   ← job.title is dynamic
```

**Extra**
- Guards: same visibility / recipient guard as N-15 / N-16; legal acceptance middleware (`jobs_disclaimer`) required
- FCM data payload: `{ type: "followed_user_created_job", link: "/tabs/jobs/details/<jobId>" }`

---

## N-18 — Welcome on Signup

```
Trigger:   POST /api/v1/auth/signup  →  AuthController.signup
Recipient: The newly registered user (same device)
When:      Immediate (inline, after account creation)
```

**Delivery**
| Channel | Status |
|---|---|
| In-app DB record | ❌ not created (a `Message` model welcome chat record IS created) |
| Push (FCM) | ✅ yes |
| Socket-only | ✅ `friend-suggestion` broadcast via `io.emit` (all-clients; announces new user to everyone) |

**Exact text** (source: `EXPECTED.welcomePush`)
```
Push title: <system account firstName — "Folcen">   [NOT IN fixtures.js EXPECTED — dynamic from system user]
Push body:  "Welcome to Folcen 👋"
```

**Extra**
- Guards: rate-limited by `authLimiter`; email uniqueness enforced; password strength validated
- FCM data payload: `{ type: "message", link: "/messages/chat/<sortedId>" }` (4-arg path — links to welcome chat thread)

---

## N-19 — Incoming Call

```
Trigger:   GET /api/v1/user/:userId/peer  (caller looks up callee peer ID → notifyPeerNeeded)
           +  Socket event "video-call-request"  →  sockets/video.js
Recipient: Callee (Bob)
When:      Immediate (FCM push) + socket ring if online; ring times out after 30 s
```

**Delivery**
| Channel | Status |
|---|---|
| In-app DB record | ❌ not created (`CallEvent` model record is created separately) |
| Push (FCM) | ✅ yes — **bare payload only, no `data` object** |
| Socket-only | ✅ `incoming-video-call` emitted to callee; `incoming-call` via `notifyPeerNeeded`; `video-canceled` + `video-call-timeout` to both parties after 30 s |

**Exact text** (source: `EXPECTED.incomingCall`)
```
Push title: "Incoming call"
Push body:  "Tap to answer"
```

**Extra**
- Guards: if either party is already in an active call → `video-call-busy` sent to caller, no ring fired
- FCM data payload: **none** — payload is `{ title, body }` only (no `data` object)

---

## N-20 — Account Deletion Scheduled

```
Trigger:   DELETE /api/v1/user/  or  POST /api/v1/user/me/delete
           →  UserController.deleteAccount
Recipient: The requesting user (self)
When:      Immediate (inline)
```

**Delivery**
| Channel | Status |
|---|---|
| In-app DB record | ❌ not created |
| Push (FCM) | ✅ yes — ⚠️ title renders as "[object Object]" due to a bug (see Extra) |
| Socket-only | ✅ `force-logout` emitted to all sockets owned by this user |

**Exact text** (source: `EXPECTED.accountDeletion`)
```
Push title: "System"  (Fix 5 — previously "[object Object]" due to { en: "System" } not being normalized)
Push body:  starts with "Your account has been marked for deletion"  (full string is dynamic,
            includes the configured retention-days window)
```

**Extra**
- Guards: `requireSignin` + `withAuthUser` middleware only
- FCM data payload: `{ type: "message", link: "/messages/chat/<sortedId>" }` (4-arg path)
- ~~**Bug**: `sendNotification(String(user._id), msg, { en: "System" }, String(user._id))` — 3rd arg is the title in 4-arg mode; `String({ en: "System" })` serialises to `"[object Object]"`.**~~ **Fixed (Fix 5)**: `sendNotification` now normalizes `{ en: x }` objects to plain strings.

---

## N-21 — Chat Message (Socket Only)

```
Trigger:   Socket event "send-message"  →  sockets/chat.js handler
Recipient: Message recipient (Bob)
When:      Online-only — delivered instantly over socket; NO push for offline users
```

**Delivery**
| Channel | Status |
|---|---|
| In-app DB record | ❌ not created (`Message` model record IS saved) |
| Push (FCM) | ❌ **none** — offline users do NOT receive a push notification |
| Socket-only | ✅ `new-message` (hyphen) emitted to recipient; `message-sent` emitted back to sender |

**Exact text** (source: `EXPECTED.chatSocketEvent`)
```
Socket event name: "new-message"   ← hyphen, NOT underscore
Payload fields:    _id, text, from, to, image, state, type, productId, createdAt
```

**Extra**
- Guards: socket must be authenticated (JWT in `socket.handshake.auth.token`); blocked-user check; private-profile visibility check; per-socket rate limit (default 60 msg/min, configurable via `MSG_RATE_LIMIT_PER_MIN`)
- ~~**Known inconsistency**: `app/helpers.js → realtime.emitNewMessage` and `AdminController` emit `"new_message"` (underscore). Frontend must listen for **both** `"new-message"` and `"new_message"`.~~ **Fixed (Fix 3)**: `helpers.emitNewMessage` and `AdminController` now emit `"new-message"` (hyphen). All paths are consistent. Frontend only needs to listen for `"new-message"`.
- N/A for offline delivery.

---

---

## One-Page Delivery Summary

### Always immediate (inline, fires synchronously before or right after response)

| N# | Name |
|---|---|
| N-01 | Friend Request Sent |
| N-02 | Friend Request Accepted |
| N-04 | Followed (Public User) |
| N-05 | Follow Request Sent (Private) |
| N-06 | Follow Request Accepted |
| N-07 | Channel Followed |
| N-08 | Post Published |
| N-09 | Post Voted *(fire-and-forget in setImmediate)* |
| N-10 | Comment on Post |
| N-11 | Reply to Comment |
| N-12 | Mention in Comment |
| N-13 | Mention in Post |
| N-14 | Comment Voted *(only on vote-flip — see bug)* |
| N-15 | New Product Listed |
| N-16 | New Service Offered |
| N-17 | New Job Posted |
| N-18 | Welcome on Signup |
| N-19 | Incoming Call |
| N-20 | Account Deletion Scheduled |

### Online-only (socket event only — no push, no offline fallback)

| N# | Name | Socket event |
|---|---|---|
| N-03 | Friend Request Declined | `emitFriendRequestDeclined` |
| N-21 | Chat Message | `new-message` |

### Offline push required (FCM carries the notification when recipient is offline)

All notifications that send FCM (N-01, N-02, N-04, N-05, N-06, N-07, N-08, N-09, N-10, N-11, N-12, N-13, N-14, N-15, N-16, N-17, N-18, N-19, N-20) use FCM as the offline delivery path.

**N-21 (chat) is the only notification with NO offline delivery at all.**

### Flags & known issues

| ~~⚠️ Socket event silently broken~~ ✅ Fixed | N-09 (`realtime.emitPostInteraction` added — Fix 1) |
| ~~⚠️ Guard bug (misses first vote)~~ ✅ Fixed | N-14 (`userVoteInd !== -1` explicit check — Fix 4) |
| ~~⚠️ FCM title serialisation bug~~ ✅ Fixed | N-20 (`{ en: 'x' }` normalised to string — Fix 5) |
| ~~⚠️ FCM deep-link wrong~~ ✅ Fixed | N-10, N-11, N-12, N-13 (5-arg path used when `data.link` present — Fix 6) |
| ~~⚠️ broadcast to all clients~~ ✅ Fixed | N-04, N-05, N-15, N-16, N-17 (`emitToUser` per recipient — Fix 2) |
| ~~⚠️ Dual event names~~ ✅ Fixed | N-21 (`new-message` hyphen used everywhere — Fix 3) |
| NOT IN fixtures.js EXPECTED | N-07 push title and body (dynamic — no fixture constant defined) |
