Title: Emit canonical `video-canceled` on cancel/timeout and keep backward-compatible DB events

Summary
-------
This patch adds a canonical real-time signaling event `video-canceled` emitted by the server when a caller cancels a call or when the ringing times out. The payload is structured and includes a `notify` boolean to express whether the client should record a missed call (notify=true for callee) or just perform local cleanup (notify=false for caller).

Why
---
- Frontend clients need a single, canonical event to reliably tear down the incoming call UI and to register missed calls only on the callee.
- Previously some code paths only emitted `video-call-cancelled` or `video-call-timeout`, which frontend clients used inconsistently — causing the receiver to still be on the call screen or missing missed-call registration when the caller canceled before answer.
- This patch preserves all existing DB/message update events (`video-call-cancelled`, `video-call-timeout`) for backward compatibility while adding the new canonical `video-canceled` event for real-time UI behavior.

Changes
-------
- app/sockets/video.js
  - `cancel-video` handler: emit `video-canceled` to callee (notify:true) and caller (notify:false), keep `video-call-cancelled` emits for DB consumers, and call `forceEndCall`.
  - On ring timeout: emit `video-canceled` to callee (notify:true) and caller (notify:false), keep `video-call-timeout` emits, and call `forceEndCall`.
- app/sockets/chat.js
  - After updating the Message status to `cancelled`, emit the canonical `video-canceled` to callee (notify:true) and caller (notify:false) in addition to `video-call-cancelled`.

Payload contract (recommended)
-----------------------------
// video-canceled
{
  from: "<callerId>",
  to: "<calleeId>",
  reason: "cancel" | "timeout",
  at: 1670000000000,
  messageId?: "<message id>",
  callerName?: "Friendly name",
  notify: true | false
}

Compatibility
-------------
- Existing clients that listen only for `video-call-cancelled` or `video-call-timeout` will continue to receive those events.
- Updated clients should listen for `video-canceled` for immediate UI teardown and missed-call logic.

Acceptance criteria / Manual test steps
--------------------------------------
1) Caller cancels before the callee answers
- Steps:
  - Start a call from A → B
  - Immediately from A, emit `cancel-video` with payload { to: B, messageId }
- Expected:
  - B receives `video-canceled` with notify:true and the UI tears down; the ringer stops.
  - A receives `video-canceled` with notify:false and no missed-call entry is created for A.
  - Both A and B also receive `video-call-cancelled` for DB sync.

2) Call times out (no answer)
- Steps:
  - Start a call from A → B
  - Wait for RING_TIMEOUT_MS to expire
- Expected:
  - B receives `video-canceled` with notify:true and registers a missed call and tears down UI.
  - A receives `video-canceled` with notify:false and no missed call recorded for A.
  - Both also receive `video-call-timeout` for DB sync.

3) DB route cancel (chat-level cancellation)
- Steps:
  - Trigger the chat-level `video-call-cancelled` path (e.g., via admin or fallback)
- Expected:
  - After the Message status is updated to `cancelled`, server emits `video-canceled` as above to both parties.

Testing notes
-------------
- The front-end should rely primarily on `video-canceled` for UI behavior. The `notify` flag must be respected: only when `notify:true` should clients register a missed call.
- Ensure `forceEndCall` clears active pair and ring timers to avoid stale active call state.

Rollout
-------
- Backward compatible: safe to merge.
- Frontend clients should be updated to listen for `video-canceled` and to honor the `notify` flag for missed call creation.

Example: quick smoke test (manual)
---------------------------------
- Use two browser tabs with Socket.IO connected as user A and B.
- Emit `video-call-request` from A to B (with messageId).
- From A, emit `cancel-video` → observe `video-canceled` on both and UI teardown.


Notes
-----
- If you prefer a different event name (e.g., `video-cancelled`), update both backend and frontend consistently. This patch uses `video-canceled` to match existing client references.
- Consider adding unit/integration tests below and a short frontend README snippet to document the contract.
