## Project snapshot

This is the backend for the Onprimse mobile/web app (Node.js, Express, Mongoose). The entrypoint is `index.js`. The app exposes a REST API under `/api/v1/*`, uses Socket.IO for realtime chat/presence, and PeerJS for WebRTC signaling at `/peerjs`.

## What an agent should know first

- Start point: read `index.js` to understand bootstrapping (Express, Socket.IO, PeerJS, DB connect, scheduled jobs).
- MVC layout: controllers in `app/controllers/*`, models in `app/models/*`, Express routes in `routes/*.js`, socket handlers in `app/sockets/*`.
- Configuration: environment variables (e.g. `JWT_SECRET`, `MONGODB_URL`, `PORT`) are used directly; `config/default.json` is present but empty in this copy — prefer env vars.

## Important architecture & data flow notes

- REST + WebSocket hybrid: HTTP endpoints handle typical CRUD and auth (see `routes/auth.js`, `app/controllers/AuthController.js`). Real-time chat and presence flows are implemented in `app/sockets/chat.js` and `app/sockets/video.js`; Socket.IO authenticates with a JWT token from the client handshake (see socket auth middleware in `index.js`).
- PeerJS usage: Peer signaling runs on `/peerjs`. Peer IDs are stored via `app/utils/peerStorage` and set on PeerJS "connection" events — many controllers read/write peerStore (e.g. in `app/controllers/AuthController.js`).
- Job scheduling: Agenda and node-schedule are used. `app/jobs` registers Agenda jobs; `schedule.scheduleJob` is used directly in `index.js` for hourly cleanup tasks.

## Conventions and patterns the agent should follow

- Route prefix: API routes are mounted under `/api/v1`. When adding routes, use that prefix and update `listRoutes(app)` if necessary.
- Error handling: controllers typically use `Response.sendResponse` and `Response.sendError` helpers. Preserve this pattern when returning API results.
- Authentication: APIs expect JWT in `Authorization: Bearer <token>` or cookies (`token`). Socket connections require `handshake.auth.token` and are verified in `index.js` using `process.env.JWT_SECRET`.
- Peer IDs: Peer IDs follow the pattern `${user._id}-${random}`. When creating or reading peer IDs prefer `app/utils/peerStorage` instead of ad-hoc persistence.

## Files to inspect when implementing features

- `index.js` — bootstrapping, middlewares, Socket.IO auth, PeerJS, MongoDB connection string.
- `app/controllers/AuthController.js` — signup/signin flow, peer id creation, follow/channel seeding.
- `app/sockets/*` — chat & video socket handlers and event names.
- `routes/*.js` — route to controller mapping; follow existing style.
- `app/utils/socketManager.js` and `app/utils/peerStorage.js` — presence and peer id helpers.

## Developer workflows & commands

- Run locally: `npm install` then `npm start` (runs `node index.js`). The app expects env vars; use a local `.env` with `PORT`, `JWT_SECRET`, `MONGODB_URL`, `SESSION_SECRET`.
- Tests: there are no automated tests in this snapshot.

## Safety and trust boundaries

- The repo contains a hard-coded MongoDB connection string in `index.js` — do not leak or reuse it. Prefer to replace with `process.env.MONGODB_URL` for local/dev.

## Quick examples to copy/paste

- Authenticate a socket client: include { auth: { token: '<JWT>' } } in the socket.io client handshake.
- Create API route: add a `routes/myFeature.js` file, export an Express Router, add `app.use('/api/v1/myFeature', require('./routes/myFeature'))` in `index.js`.

If anything above is unclear or you want the instructions to include additional patterns (e.g., testing, CI, or deploy steps), tell me what to add and I'll iterate.
