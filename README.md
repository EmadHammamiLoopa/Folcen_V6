# Folcen (Onprimse) — Ionic / Angular mobile app

This repository contains the Ionic/Angular frontend for the Folcen (Onprimse) mobile application.

Backend
- The backend for this project lives in a separate repository: https://github.com/EmadHammamiFolcen/Onprimse_backend.git

Quickstart (Windows / PowerShell)
1. Install dependencies
```powershell
npm ci
```

2. Start the browser dev server (uses `proxy.conf.json` to forward API requests)
```powershell
npm start
```

3. Build
```powershell
npm run build        # dev build
npm run build:prod   # production build
```

4. Run unit tests
```powershell
npm test
```

Notes
- After `npm ci`, `postinstall` runs Angular compatibility compilation (`ngcc`) and `patch-package` (see `package.json`).
- Environment variables and endpoints are configured in `src/environments/environment.ts` and `src/environments/environment.prod.ts`. Default `apiUrl` points to `http://127.0.0.1:3300/api/v1`.

Architecture and important files
- Framework: Ionic + Angular v12. Project name in `angular.json` is `loopa`.
- App entry: `src/app/app.component.ts` — global socket initialization, background handling, notification hooks, and reconnection logic.
- Dependency injection and runtime plugin toggles: `src/app/app.module.ts` — many native providers are swapped with mocks when `cordova` is not available.
- Socket & real-time: `src/app/services/socket.service.ts` and `socket.io-client` usage across pages. Use `SocketService.initializeSocket()` and `SocketService.getSocket()`.
- WebRTC: `src/app/services/webrtc.service.ts` and video UI in `src/app/pages/messages/chat/video/`.
- Pages & routes: `src/app/pages/**` — many pages are lazy-loaded via `*routing.module.ts`.
- Uploads/camera: `src/app/services/upload-file.service.ts`, `src/app/services/camera.service.ts`, and native plugin fallbacks are used in templates (file inputs in `display.component.html`).
- Cordova plugins: `plugins/` directory contains plugin metadata. `package.json` also lists used Cordova plugins.

Native builds and signing
- Android native project files under `android/` and `app/`. Use the Android Gradle wrapper (`gradlew.bat`) for local builds. Cordova/Capacitor packaging and signing happens in those native folders — coordinate with the native project when changing plugin versions or Android config (`android/gradle.properties`, `android/local.properties`).

Developer patterns and conventions
- Runtime Cordova detection: always guard native usage with `(typeof window !== 'undefined' && 'cordova' in window)`.
- Add browser mocks for any new native wrappers and register them in `app.module.ts`.
- Prefer using shared singletons for socket and WebRTC (do not construct sockets/peers directly in components).

Troubleshooting
- If runtime errors reference native plugins while running in browser, ensure mock services exist (look for `mock-*` in `src/app/services/`).
- If you run into Angular compatibility errors after `npm ci`, re-run `ngcc` or inspect `postinstall` steps in `package.json`.

Where to look next
- `src/app/app.component.ts` — lifecycle, reconnection, LocalNotifications hooks.
- `src/app/app.module.ts` — provider registration and plugin toggles.
- `src/environments/environment.ts` — API/socket endpoints.
- `src/app/services/socket.service.ts` and `src/app/services/webrtc.service.ts` — critical real-time code.

If you want, I can:
- Add a small CONTRIBUTING.md with platform-specific build steps (Android signing, building with Capacitor) or
- Generate a more detailed developer quickstart that includes emulator/device steps.
