# Loopa (Onprimse) — Agent Guidance

This repository is a multi-component system: an Ionic/Angular mobile frontend, a Node/Express backend, and an Angular admin dashboard.

## Big Picture Architecture
- **Frontend (Root)**: Ionic 5 + Angular 12 mobile app. Entry point: [src/app/app.component.ts](src/app/app.component.ts).
- **Backend (`isen-backend-master_onprimse/`)**: Node.js/Express service. Entry point: [isen-backend-master_onprimse/index.js](isen-backend-master_onprimse/index.js).
- **Dashboard (`geloo-dashboard-master/`)**: Angular-based admin dashboard.
- **Real-time/Signaling**: Uses Socket.IO for chat/presence and PeerJS for WebRTC signaling.
- **Data Flow**: Frontend communicates with Backend via REST APIs (prefixed with `/api/v1/*`) and WebSockets. Peer signaling is hosted at `/peerjs` on the backend.

## Critical Developer Workflows
- **Installation**: Run `npm ci` at the root. This triggers `postinstall` which runs `ngcc` and `patch-package`.
- **Frontend Dev**: `npm start` (requires `NODE_OPTIONS=--openssl-legacy-provider` for Node 17+).
- **Backend Dev**: `cd isen-backend-master_onprimse && npm start`. Requires `.env` with `MONGODB_URL`, `JWT_SECRET`, `PORT`.
- **Native Android**: Capacitor integration in `android/`. Use `npx cap sync android` after builds.

## Project-Specific Conventions
### Frontend (Ionic/Angular)
- **Cordova/Native Guards**: Always check `(typeof window !== 'undefined' && 'cordova' in window)` before using native plugins.
- **Browser Mocks**: Native plugins must have mock providers in [src/app/app.module.ts](src/app/app.module.ts) to support `ionic serve`.
- **Static Singletons**: `SocketService` and `WebrtcService` use static methods and properties for global state. Use `SocketService.getSocket()` and `WebrtcService.peer`.
- **Lazy Loading**: Most pages are lazy-loaded via `*routing.module.ts`.
- **ID Normalization**: Use `IdService.normalizeId()` to handle Base64 encoded IDs from the backend.

### Backend (Node/Express)
- **Response Helpers**: Controllers MUST use `Response.sendResponse(res, data, message)` and `Response.sendError(res, error)` from [isen-backend-master_onprimse/app/controllers/Response.js](isen-backend-master_onprimse/app/controllers/Response.js).
- **ID Normalization**: Use `normalizeId(id)` (often found in controllers like `UserController.js`) to handle Base64 encoded IDs sent from the frontend.
- **Peer IDs**: Follow the pattern `${userId}-${random}` and use `app/utils/peerStorage` for persistence.
- **Socket Auth**: JWT is passed in `socket.handshake.auth.token` and validated in the backend entry point.
- **Mongoose Sanitization**: `Response.sendResponse` automatically sanitizes Mongoose documents (converts to plain objects, handles ObjectIds).

## Key Files & Directories
- **Frontend DI & Mocks**: [src/app/app.module.ts](src/app/app.module.ts)
- **Socket Wrapper**: [src/app/services/socket.service.ts](src/app/services/socket.service.ts)
- **WebRTC Logic**: [src/app/services/webrtc.service.ts](src/app/services/webrtc.service.ts)
- **Backend Entry**: [isen-backend-master_onprimse/index.js](isen-backend-master_onprimse/index.js)
- **Backend Sockets**: `isen-backend-master_onprimse/app/sockets/`
- **Backend Models**: `isen-backend-master_onprimse/app/models/`

## Integration Patterns
- **Real-time Presence**: Managed via `app/utils/socketManager.js` and a Redis-backed presence layer.
- **File Uploads**: Frontend `UploadFileService` pairs with backend `multer` configuration.
- **Environment**: Frontend config is in `src/environments/environment.ts`. Default API is `http://127.0.0.1:3300/api/v1`.
- **Background Jobs**: Backend uses `Agenda` (for persistent jobs in `app/jobs/`) and `node-schedule` (for simple hourly tasks in `index.js`).

## Safety and Trust Boundaries
- **MongoDB Connection**: The backend `index.js` may contain hard-coded connection strings. Always prefer `process.env.MONGODB_URL` and do not leak credentials.
- **Redacting Logger**: The backend uses a redacting logger in `app/middlewares/logging.js` to avoid logging tokens or PII.

## Quick Examples
- **Backend API Route**:
  ```javascript
  // routes/myFeature.js
  const router = require('express').Router();
  const MyController = require('../app/controllers/MyController');
  router.get('/', MyController.getData);
  module.exports = router;
  // In index.js: app.use('/api/v1/myFeature', require('./routes/myFeature'));
  ```
- **Frontend Native Guard**:
  ```typescript
  if (typeof window !== 'undefined' && 'cordova' in window) {
    this.nativePlugin.doSomething();
  } else {
    this.mockPlugin.doSomething();
  }
  ```
