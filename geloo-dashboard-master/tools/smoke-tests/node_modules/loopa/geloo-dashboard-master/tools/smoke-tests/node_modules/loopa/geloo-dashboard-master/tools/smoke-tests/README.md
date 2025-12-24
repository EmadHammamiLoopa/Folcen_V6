Dashboard smoke tests

Quick smoke tests to validate backend endpoints used by the dashboard.

Requirements:
- Node 14+
- `npm install axios` in this folder (or run with global axios)

Usage:

```
cd tools/smoke-tests
npm install axios
API_URL=http://127.0.0.1:3300/api/v1 AUTH_TOKEN="Bearer <token>" node dashboard-smoke.js
```

Notes:
- Provide `AUTH_TOKEN` if your backend requires JWT auth for these endpoints.
- The script performs read-only GET requests and will not modify backend data.
