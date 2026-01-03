````instructions
# Loopa (Ionic/Angular) — Agent Guidance (concise)

This repository is a mobile frontend (Ionic/Angular) paired with a Node/Express backend. This file highlights the minimal, actionable knowledge an AI agent needs to be productive here.

Big picture
- Frontend: Ionic 5 + Angular 12 (Capacitor 6). App runtime: `src/`.
- Backend: Node/Express + Mongoose under `isen-backend-master_onprimse/` (entry: `isen-backend-master_onprimse/index.js`).
- Real-time: Socket.io for messaging (`src/app/services/socket.service.ts` and `isen-backend-master_onprimse/app/sockets/`).
- WebRTC: PeerJS signaling endpoint at `/peerjs` (frontend `webrtc.service.ts`, backend PeerJS server in `peer_server/`).

Essential developer workflows
- Install dependencies (root): `npm ci` — postinstall runs `ngcc` and `patch-package` (see `patches/`).
- Frontend dev: `npm start` (runs `ionic serve`). If OpenSSL errors occur, set in PowerShell:
  ```powershell
  $env:NODE_OPTIONS = "--openssl-legacy-provider"
  npm start
  ```
- Build: `npm run build` (or `npm run build:prod`). To package Android: `npx cap sync android` then open Android Studio.
- Backend dev: `cd isen-backend-master_onprimse && npm start`. Ensure `.env` contains at least: `MONGODB_URL`, `JWT_SECRET`, `PORT`.

Project-specific conventions
- Guard Cordova plugin calls: always check `(typeof window !== 'undefined' && 'cordova' in window)`.
- Browser provider mocks live and are wired in `src/app/app.module.ts` — add mocks there for native plugin replacements.
- Static-singleton services: `SocketService` and `WebrtcService` use static getters (use `SocketService.getSocket()` when needed).
- App lifecycle: `src/app/app.component.ts` centralizes socket init, reconnection, background handling — avoid moving this logic without reviewing backend socket handlers.
- Cordova patches are tracked in `patches/` and applied via `patch-package`; update patches when modifying plugin code.

Integration & risky touchpoints
- Socket auth: frontend passes JWT in `socket.handshake.auth.token`; backend validates at socket handshake — inspect `isen-backend-master_onprimse/app/sockets/*`.
- PeerJS IDs: pattern is `${userId}-${random}`; signaling served at `/peerjs` (see `peer_server/peerjs-server`).
- File uploads: handled by frontend UploadFileService and backend `isen-backend-master_onprimse/uploads/` — validate storage paths and permissions.
- Background jobs: `Agenda` and `BullMQ` are used; check `isen-backend-master_onprimse/tasks/` for scheduled job definitions.

Quick file map (start points)
- `src/app/app.module.ts` — DI & browser mocks
- `src/app/app.component.ts` — lifecycle, socket init
- `src/app/services/socket.service.ts` — socket event wrappers
- `src/app/services/webrtc.service.ts` — PeerJS client usage
- `isen-backend-master_onprimse/index.js` — backend boot
- `isen-backend-master_onprimse/app/sockets/` — socket handlers
- `peer_server/peerjs-server/` — PeerJS signaling server

Editing priorities
- Preserve static singletons and provider wiring; mirror changes in `app.module.ts` when adding/removing providers.
- Avoid refactoring socket/app lifecycle without a paired backend change; list dependent socket events before edits.
- When changing Cordova plugins, update `patches/` and run `npm ci` to reapply `patch-package`.

Prompt examples for agents
- "Add a browser mock and provider entry in `src/app/app.module.ts` for a new native `FooService` following existing `*mock*` patterns."
- "When changing reconnection logic, update `src/app/app.component.ts` and enumerate socket events in `src/app/services/socket.service.ts` and `isen-backend-master_onprimse/app/sockets/` that rely on it."

If anything here is unclear or missing (specific event names, exact env keys for services, or PeerID generation details), tell me which area to expand.

````