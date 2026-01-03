Manual Test Checklist — video-canceled
======================================

Prerequisites
-------------
- Backend running locally or in a test environment.
- Two test clients (e.g., two browser tabs) connected with different user IDs (A and B).
- Ability to emit socket events from a client console or from a small test script.

Test 1 — Caller cancels before answer
-------------------------------------
1. Client A: emit 'video-call-request' to B with a real messageId returned by the server.
2. Immediately after, Client A: emit 'cancel-video' with payload { to: B, messageId }.

Expectations
- Client B receives 'video-canceled' with notify:true. B's UI stops ringing and navigates away.
- Client A receives 'video-canceled' with notify:false. A's UI also cleans up.
- Both clients receive 'video-call-cancelled' DB events for message status update.

Test 2 — Call times out
-----------------------
1. Client A: emit 'video-call-request' to B with messageId.
2. Do not answer on B. Wait for RING_TIMEOUT_MS.

Expectations
- Client B receives 'video-canceled' with notify:true and records a missed call.
- Client A receives 'video-canceled' with notify:false.
- Both receive 'video-call-timeout' DB events.

Test 3 — Chat-level cancellation fallback
-----------------------------------------
1. Trigger server-side path that calls the chat-level 'video-call-cancelled' handler (e.g., simulate DB cancellation).

Expectations
- After Message status updated to 'cancelled', both parties receive 'video-canceled' as above.

Edge cases
----------
- Offline callee: emitToUser will likely fail to deliver; ensure no unhandled exceptions and that DB message state is updated.
- Invalid messageId: fallback cancels last pending request between the two users.

Troubleshooting
---------------
- If receiver still remains on call screen after `cancel-video`, verify that the server emitted `video-canceled` to the callee socket and that the front-end listens for `video-canceled` and stops the ringer.
- Check ringTimers map and activeVideoCalls entries are cleared by `forceEndCall`.
