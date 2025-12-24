# Loopa (Ionic/Angular) — Agent Guidance

Purpose: concise, actionable guidance for AI coding agents working across the Ionic/Angular frontend and Node/Express backend.

1) Big picture
- Frontend: Ionic 5 + Angular 12 (Capacitor 6 + Cordova plugins). App runtime lives under `src/`.
- Backend: Node.js + Express + Mongoose in `isen-backend-master_onprimse/` (entry: `index.js`).
- Realtime: Socket.IO for chat/presence (frontend: `src/app/services/socket.service.ts`, backend: `isen-backend-master_onprimse/app/sockets/`).
- WebRTC: PeerJS signaling served at `/peerjs` (server config in backend; client helpers in `src/app/services/webrtc.service.ts`).

2) Developer workflows (must-know)
- Install: run `npm ci` at repository root (postinstall runs `ngcc` and `patch-package`).
- Frontend dev: `npm start` (ionic serve). If OpenSSL errors on Windows, set:
```powershell
$env:NODE_OPTIONS = "--openssl-legacy-provider"
npm start
```
- Build: `npm run build` (or `npm run build:prod`). For Android: `npx cap sync android` then open Android Studio.
- Backend run: `cd isen-backend-master_onprimse && npm start`. Supply a `.env` with at least `MONGODB_URL`, `JWT_SECRET`, `PORT`.

3) Project-specific conventions & patterns
- Guard native plugin calls: `(typeof window !== 'undefined' && 'cordova' in window)`.
- Browser mocks: register mock providers in `src/app/app.module.ts` when adding native services.
- Static singletons: `SocketService` and `WebrtcService` use static initialization and getters (use `SocketService.getSocket()`).
- App lifecycle: `src/app/app.component.ts` centralizes socket init, reconnection logic and background-mode handling — changing it affects messaging and calls.
- Patches: Cordova plugin fixes live in `patches/`; `patch-package` applies them during install — update patches when changing plugin code.

4) Integration points to watch (quick checklist)
- Socket auth: clients pass JWT in `handshake.auth.token`; server validates early in backend `index.js` socket setup.
- PeerJS: endpoint `/peerjs`; Peer IDs use pattern `${userId}-${random}` and are managed via `app/utils/peerStorage.js`.
- File uploads: frontend UploadFileService → backend `isen-backend-master_onprimse/uploads/` storage handlers.
- Background jobs: `Agenda` and `node-schedule` used in backend; check `isen-backend-master_onprimse/tasks/` and `app/jobs/`.

5) Coding & integration rules (follow these)
- API route prefix: mount new routes under `/api/v1` and register them in backend `index.js` (or `routes/*`).
- Response helpers: controllers use `Response.sendResponse` / `Response.sendError` — follow this pattern.
- Socket messages: maintain existing event names and handler signatures in `app/sockets/*` to avoid breaking clients.
- Peer IDs: use `app/utils/peerStorage` for storing/reading peer IDs rather than ad-hoc persistence.

6) Key files to inspect (start here)
- Frontend DI & providers: src/app/app.module.ts
- App lifecycle & sockets: src/app/app.component.ts
- Socket wrapper: src/app/services/socket.service.ts
- WebRTC helpers: src/app/services/webrtc.service.ts
- Backend entry & boot: isen-backend-master_onprimse/index.js
- Backend sockets: isen-backend-master_onprimse/app/sockets/*
- Peer storage/utilities: isen-backend-master_onprimse/app/utils/peerStorage.js

7) Quick examples
- Socket client handshake: pass `{ auth: { token: '<JWT>' } }` on connect.
- Create API route: add `routes/myFeature.js`, export an Express Router, then `app.use('/api/v1/myFeature', require('./routes/myFeature'))` in `index.js`.

Next step: I can replace the original file with this updated content once you confirm. If you want, I can also add an `.env.example` file.
