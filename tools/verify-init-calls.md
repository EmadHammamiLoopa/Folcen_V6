# Verifying user/message init deduplication

## Quick counters (runtime)
- Open devtools console after a cold start and check:
  - `window.__sessionMetrics` from `SessionStoreService` (initAttempts/initCompleted/profileHits/profileMisses).
  - `window.__userProfileCounters` from `UserService` (profileRequests/profileHits/profileMisses, cacheSize).
  - `window.__messageMetrics` from `MessageService` (pageRequests/cacheHits/inflightHits).
- Expected: init/profile requests increment once per cold start and once per explicit refresh; subsequent navigations reuse cache (hits increase, requests stay flat).

## Manual navigation script
1) Cold start app (ionic serve or device) and load messages list, open a chat, navigate back, then reopen the same chat.
2) After each navigation, run in devtools:
   ```js
   window.__sessionMetrics;
   window.__userProfileCounters;
   window.__messageMetrics;
   ```
3) Assert that profileRequests does **not** grow after the first navigation to the same user, and message pageRequests only increments when a new page is fetched.

## Optional automated check (Cypress/Playwright skeleton)
- Add a smoke test that loads a chat thread twice and asserts `window.__userProfileCounters.profileRequests` remains constant on second load while `profileHits` increases.
- Keep token/session isolation to avoid cross-user cache reuse; clear caches by invoking `SessionStoreService.clear('test-reset')` between tests if you expose it via a test hook.
