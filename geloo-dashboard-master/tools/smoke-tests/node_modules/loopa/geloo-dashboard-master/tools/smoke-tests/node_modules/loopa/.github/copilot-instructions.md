# Loopa (Ionic/Angular) — Agent Guidance

This repo contains an Ionic/Angular mobile frontend and a Node/Express backend (folder: `isen-backend-master_onprimse`). Below are focused, actionable rules and pointers for AI coding agents working here.

1. Big picture
- Frontend: Ionic 5 + Angular 12 (Capacitor 6, Cordova plugins). Core runtime: `src/`.
- Backend: Node.js + Express + Mongoose. Entry: `isen-backend-master_onprimse/index.js`.
- Real-time: Socket.io (frontend: `src/app/services/socket.service.ts`; backend: `isen-backend-master_onprimse/app/sockets/`).
- WebRTC: PeerJS signaling (server `/peerjs`), implemented in frontend `webrtc.service.ts` and backend PeerJS setup.

2. Must-know developer workflows
- Install dependencies (frontend + backend): run `npm ci` at repository root. Postinstall runs `ngcc` and `patch-package` (see `patches/`).
- Frontend dev: `npm start` (runs `ionic serve`). If OpenSSL errors occur, set NODE_OPTIONS, e.g. in PowerShell:
```
$env:NODE_OPTIONS = "--openssl-legacy-provider"
npm start
```
- Build frontend: `npm run build` (or `npm run build:prod`). Android packaging uses Capacitor: `npx cap sync android` then open Android Studio.
- Backend: `cd isen-backend-master_onprimse && npm start`. Requires a `.env` (at minimum `MONGODB_URL`, `JWT_SECRET`, `PORT`).

3. Project-specific conventions (inspect these files for examples)
- Runtime Cordova checks: always guard native plugin calls with `(typeof window !== 'undefined' && 'cordova' in window)`.
- Provider wiring: browser mocks are provided and selected in `src/app/app.module.ts` — add mock implementations there when adding native plugins.
- Static singletons: `SocketService` and `WebrtcService` use static initialization and getters (use `SocketService.getSocket()` when static access is needed).
- Global lifecycle: `src/app/app.component.ts` centralizes socket initialization, reconnection logic, and background-mode handling — changes here can impact messaging and calls.
- Patches: Cordova plugin fixes live in `patches/` and are applied via `patch-package` during install — don't remove without checking compatibility.

4. Integration points to watch
- Socket auth: sockets use JWT in handshake (`socket.handshake.auth.token`) — backend validates this early in `isen-backend-master_onprimse` socket setup.
- PeerJS: signaling endpoint hosted at `/peerjs`; Peer IDs follow the pattern `${userId}-${random}`.
- File uploads: handled by UploadFileService and backend `uploads/` — review `isen-backend-master_onprimse/uploads/` for storage logic.
- Background jobs: `Agenda` and `BullMQ` are used; scheduled jobs live under `isen-backend-master_onprimse/tasks/`.

5. When editing code, prefer these priorities
- Preserve static singletons and provider wiring patterns; mirror mock/provider additions in `src/app/app.module.ts`.
- Avoid moving socket/init logic out of `app.component.ts` unless refactoring both frontend and backend event flow.
- If touching Cordova plugins, update `patches/` and run `npm ci` to verify `patch-package` rebuilds cleanly.

6. Quick file map (start points for common tasks)
- Frontend DI & mocks: src/app/app.module.ts
- App lifecycle & socket init: src/app/app.component.ts
- Socket wrapper: src/app/services/socket.service.ts
- WebRTC/Peer: src/app/services/webrtc.service.ts
- Backend entry & boot: isen-backend-master_onprimse/index.js

7. Examples for prompts to AI agents
- "Add a browser mock and provider entry in `src/app/app.module.ts` for a new native `FooService` following existing `*mock*` patterns." 
- "When changing reconnection logic, update `app.component.ts` and list all socket events in `src/app/services/socket.service.ts` that rely on it." 

If anything here is unclear or you'd like deeper examples (event names, exact env keys, or how PeerIDs are constructed), tell me which area to expand. 
