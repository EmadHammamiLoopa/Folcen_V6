Summary of fixes for real-time user/profile/social/chat/calls/feed

What I changed:

- src/app/services/user.service.ts
  - Merged server-refreshed user data with existing in-memory user to avoid overwriting followers/following/friends/avatar/peerId/missedCallBudget when server response omits them.
  - Added logs for refresh path.

- src/app/app.component.ts
  - Subscribed to `UserService.currentUser` so `AppComponent` always reflects central user store.
  - Injected `AppEventsService` and broadcast `budget-update` events to app-level `budget$`.
  - Ensures socket handlers call `webrtcService.addMissedCallFromSignaling` on missed/cancel/timeout events (existing code preserved).

- src/app/services/app-events.service.ts
  - Exposed `budget$` observable and `setBudget()` method for real-time budget updates.

- src/app/pages/feed/feed.page.ts
  - Now subscribes to `UserService.currentUser` and `AppEventsService.budget$` so feed shows live user and budget changes.

- src/app/pages/messages/chat/chat.component.ts
  - Made `formatMessageTime()` robust to various timestamp formats and return a safe fallback '—' when timestamp invalid.
  - `formatMessageDate()` already returns 'Unknown Date' for invalid dates.

- src/app/pages/friends/list/list.component.html
  - Replaced display of "Unknown Location" with a neutral dash and hide when missing, preventing 'unknown location' text.

- src/app/models/User.ts (previous edits)
  - Enhanced decoding of Buffer-like and encoded fields for `interests`, `languages`, and other text fields to avoid encoded strings appearing in UI.

How to verify (manual):

1. Start backend and frontend (see project README for start steps).
2. Sign in as a user with followers/channels and verify:
   - Navigate to Profile: followers and channels should be populated.
   - Birthday should display if present; otherwise not shown.
   - Location shows city,country or a dash if none.
3. Open Feed tab and observe budget displayed/updated within 1-2 seconds after a budget-update socket emit.
4. Trigger a missed call scenario (caller cancels or times out):
   - Missed call appears in Missed Calls modal and bell badge increments.
5. In chat, confirm timestamps and date separators show readable values; no 'Invalid Date' text should appear.

Notes:
- I added conservative merging rules to avoid overwriting arrays with empty server responses. If your backend returns empty lists intentionally, consider adjusting merge logic.
- Logging added to key refresh points to help trace remaining issues.

If you want, I can run a quick smoke-test script or add a small automated test harness to simulate socket events.
