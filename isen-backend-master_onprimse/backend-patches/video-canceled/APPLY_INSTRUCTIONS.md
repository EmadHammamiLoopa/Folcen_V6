How to apply these patches to the backend repo
===============================================

Option A — Apply manually (recommended if you want to review changes before merging)
1. Copy the three patch files to the backend repository root.
2. Open `app/sockets/video.js` and `app/sockets/chat.js` and apply the changes described in the patch files under `backend-patches/video-canceled/*.patch`.
3. Run backend unit tests and start server.
4. Run the manual tests in `MANUAL_TESTS.md`.

Option B — Use `git apply` (if you have the backend repo locally and trust the patch)
1. From the backend repository root run:

   git apply /path/to/0001-add-canonical-video-canceled.patch
   git apply /path/to/0002-add-timeout-canonical.patch
   git apply /path/to/0003-chat-video-cancelled-patch.patch

2. Inspect `git status` and `git diff` to review changes.
3. Commit and push to a feature branch, open PR.

Testing and verification
------------------------
- Run the example Jest test (adapt path): `node example.test.js` (or integrate into your existing test runner).
- Follow Manual Test Checklist in `MANUAL_TESTS.md`.

Notes
-----
- The patch preserves backward-compatible `video-call-*` events. Frontend teams should update clients to listen for `video-canceled` and respect `notify`.
- If your backend uses TypeScript or different module exports, adapt the example Jest test to your test harness.
