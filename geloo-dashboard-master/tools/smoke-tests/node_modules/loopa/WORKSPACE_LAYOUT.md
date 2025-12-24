Workspace layout and rules

This project contains both a frontend (Ionic/Angular) app and a Node.js backend. Keep the following mapping and rules in mind so files stay in the right place and you don't accidentally mix UI code with server logic.

Frontend (Ionic + Angular)
- Path: src/
- Key files: src/app/** (pages, services, components), angular.json, tsconfig.json, package.json (root)
- Tools: TypeScript, Angular CLI / Ionic CLI
- How to run: from workspace root (where package.json is for the frontend), run the usual frontend dev script (for example: npm start / ionic serve)
- Responsibilities: UI, templates, Angular services, client-side Socket.IO & PeerJS usage, mobile platform wrappers (Cordova/Capacitor mocks)
- Do NOT: add server-side files (Express routes, Socket.IO server code, Mongoose models) here.

Backend (Node.js + Socket.IO)
- Path: isen-backend-master_onprimse/
- Key files: isen-backend-master_onprimse/index.js, isen-backend-master_onprimse/package.json, isen-backend-master_onprimse/app/**
- Tools: Node.js, Express, Socket.IO, Mongoose
- How to run: cd isen-backend-master_onprimse && npm install && node index.js (or npm run start depending on backend package.json)
- Responsibilities: server listeners, persistence (MongoDB), broadcasting events to clients, server-side security validation
- Do NOT: add Angular components, templates, or TypeScript-only client code here unless you intentionally copy a small, backend-usable helper.

Guidelines & Best Practices
1. Always confirm which package.json you are editing:
   - Frontend changes: edit workspace root package.json
   - Backend changes: edit isen-backend-master_onprimse/package.json
2. When adding shared semantics (events, payload keys) prefer duplication with clear documentation rather than importing frontend files into the backend.
3. For socket helper files intended for the server, place them under isen-backend-master_onprimse/server-snippets/ and require them from within backend code using relative paths (e.g. require('./server-snippets/missed-calls-broadcast')).
4. Keep runtime expectations clear:
   - Frontend targets browsers and must compile with TypeScript/Angular
   - Backend targets Node.js and may use CommonJS require() or the backend's configured module system
5. If you need to debug end-to-end, run backend first (so sockets are available), then run frontend; verify login flows and peer/socket connections in the browser devtools console.

Quick commands (PowerShell on Windows)
- Start frontend dev server (from workspace root):
  npm ci; npm start

- Start backend server (from backend folder):
  cd isen-backend-master_onprimse; npm ci; node index.js

- Run frontend TypeScript checks:
  npx tsc --noEmit -p tsconfig.json

Notes
- Some helpers or patches may exist under backend-patches/ or server-snippets/ — these should live inside the backend folder for the backend to require them safely.
- If you want to create a truly shared module, create a top-level shared/ folder and publish it or import it explicitly into both sides with an agreed build process.

If you want, I can also add a short smoke-test script under the backend to simulate two Socket.IO clients for `missed-calls-cleared` and `missed-call-removed` events.