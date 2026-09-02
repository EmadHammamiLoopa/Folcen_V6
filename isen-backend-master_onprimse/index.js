try {
  require('dotenv').config();
} catch (e) {
  console.warn('Optional dependency dotenv not found — continuing without .env');
}

// ── Firebase Admin — initialize once at startup ───────────────────────────────
try {
  const {
    initializeApp,
    cert,
    getApps,
  } = require('firebase-admin/app');

  if (getApps().length === 0) {
    let credential;

    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      credential = cert(serviceAccount);
      console.log('[Firebase Admin] Initialized from service account file.');
    } else if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    ) {
      credential = cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      });
      console.log('[Firebase Admin] Initialized from environment variables (project:', process.env.FIREBASE_PROJECT_ID + ').');
    } else {
      console.warn('[Firebase Admin] No credentials found — Firebase Admin features disabled. Set FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.');
    }

    if (credential) {
      initializeApp({ credential });
    }
  }
} catch (e) {
  console.error('[Firebase Admin] Startup init failed:', e.message);
}

const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const cors = require('cors');
let Agenda;
try {
  Agenda = require('agenda');
} catch (e) {
  console.warn('Agenda package failed to load — using no-op fallback. Jobs will be disabled.', e && e.message);
  // Minimal no-op Agenda-compatible stub used when the real package fails to load.
  Agenda = class {
    constructor() { }
    define(name, fn) { /* store if needed */ }
    async start() { return; }
    async every(interval, jobName) { return; }
    // allow `.on` and other event methods to be called safely
    on() { }
  };
}
const path = require('path');
const session = require('express-session');
const passport = require('./routes/passport');  // Adjust the path to your passport configuration
const schedule = require('node-schedule');
const Comment = require("./app/models/Comment")
const peerStore = require('./app/utils/peerStorage'); // ✅ Use shared storage
// import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const productRoutes = require('./routes/product');
const jobRoutes = require('./routes/job');
const serviceRoutes = require('./routes/service');
const requestRoutes = require('./routes/request');
const messageRoutes = require('./routes/message');
const channelRoutes = require('./routes/channel');
const postRoutes = require('./routes/post');
const commentRoutes = require('./routes/comment');
const subscriptionRoutes = require('./routes/subscription');
const reportRoutes = require('./routes/report');
const followRoutes = require('./routes/follow');
const { createSocketAuthMiddleware } = require('./app/middlewares/socketAuth');

// import middlewares
const { notFoundError, invalidTokenError } = require('./app/middlewares/errors');
const { setUrlInfo, updateUserInfo, allowAccess, checkVersion } = require('./app/middlewares/others');
const Subscription = require('./app/models/Subscription');
const Product = require('./app/models/Product');
const Report = require('./app/models/Report');
const User = require('./app/models/User');
const Follow = require('./app/models/Follow');
const Channel = require('./app/models/Channel');
const Service = require('./app/models/Service');
const Job = require('./app/models/Job');
// Bootstrap helpers with a live Socket.IO reference
const { userConnected, userDisconnected } = require('./app/utils/socketManager');



const helpers = require('./app/helpers');

const Message = require('./app/models/Message');
const Post = require('./app/models/Post');
const { deleteUser } = require('./app/controllers/UserController');

try {
  require('dotenv').config();
} catch (e) {
  /* already warned above, continue */
}
const app = express();
app.set('trust proxy', true);
const DEBUG_SOCKET_EVENTS = process.env.DEBUG_SOCKET_EVENTS === '1';
// Security: restrict CORS in production to explicit origins.
// CORS_ORIGIN env var: set to '*' (allow-all) or comma-separated list of origins.
// e.g. CORS_ORIGIN=https://folcen-dashboard.pages.dev,https://8cd4a0ac.folcen-dashboard.pages.dev
const _corsOriginEnv = process.env.CORS_ORIGIN || '*';
// Parse into an array; '*' means allow-all wildcard.
const _corsOrigins = _corsOriginEnv.split(',').map(s => s.trim()).filter(Boolean);

// Explicit CORS config: allow local dashboard origins and support credentials
const allowedOrigins = [
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://localhost:8100',
  'http://127.0.0.1:8100',
  'http://localhost:2302'
];

function _isOriginAllowed(origin) {
  if (!origin) return true; // native / curl / server-side
  if (_corsOrigins.includes('*')) return true; // wildcard allow-all
  if (_corsOrigins.includes(origin)) return true;
  if (allowedOrigins.includes(origin)) return true;
  return false;
}

app.use(cors({ origin: (origin, cb) => {
  if (_isOriginAllowed(origin)) return cb(null, true);
  console.warn('[CORS] Blocked origin:', origin);
  return cb(new Error('Origin not allowed by CORS policy'), false);
}, credentials: true }));
app.use(allowAccess);

// Replace noisy global logger with a redacting logger that avoids tokens and PII
const { redactRequestLog } = require('./app/middlewares/logging');
app.use(redactRequestLog);


const removeExpiredMedia = async () => {
  const now = new Date();
  try {
      // Cleanup Comments
      const commentResult = await Comment.updateMany(
          { 'media.expiryDate': { $lte: now } },
          { $unset: { 'media.url': '' } }
      );
      
      // Cleanup Posts
      const postResult = await Post.updateMany(
          { 'media.expiryDate': { $lte: now } },
          { $unset: { 'media.url': '' } }
      );
      
      if (commentResult.nModified > 0 || postResult.nModified > 0) {
        console.log('Expired media removed:', { 
          comments: commentResult.nModified, 
          posts: postResult.nModified 
        });
      }
  } catch (err) {
      console.error('Error removing expired media:', err);
  }
};



const http = require('http').Server(app);

const io = require('socket.io')(http, {
  path: '/socket.io',
  cors: {
    origin: (origin, cb) => {
      if (_isOriginAllowed(origin)) return cb(null, true);
      console.warn('[CORS/Socket.IO] Blocked origin:', origin);
      return cb(new Error('Origin not allowed by CORS policy'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }
});

helpers.initSocket(io);

io.use(createSocketAuthMiddleware());


app.set('io', io);
module.exports.io = io;   
const { sendNotification, notifyPeerNeeded } = helpers;   // now both are defined

const { ExpressPeerServer } = require('peer');
const peerServer = ExpressPeerServer(http, {
    debug: true
});


peerServer.on("connection", (client) => {
  console.log(`✅ New peer connected with ID: ${client.getId()}`);

  const userId = client.getId().split('-')[0]; // Extract userId from PeerJS ID
// Push peerId + refresh ttl (expiresAt = now + 5 min)
  peerStore.set(userId, client.getId());
  console.log('Peer connection mapping stored');
});




schedule.scheduleJob('0 * * * *', removeExpiredMedia);  // Runs every hour

// Purge unverified accounts older than 24 hours (runs daily at 03:00)
async function purgeUnverifiedAccounts() {
    try {
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const result = await User.deleteMany({
            emailVerified: false,

            // Platform administrators are provisioned/trusted accounts and
            // must never be removed by the ordinary unverified-user cleanup.
            role: { $nin: ['ADMIN', 'SUPER ADMIN'] },

            // Soft-deleted accounts have their own purgeAt/retention
            // lifecycle and must not be hard-deleted by this cleanup.
            isDeleted: { $ne: true },

            createdAt: { $lt: cutoff }
        });
        if (result.deletedCount > 0) {
            console.log(`[Cleanup] Purged ${result.deletedCount} unverified account(s) older than 24h`);
        }
    } catch (err) {
        console.error('[Cleanup] Failed to purge unverified accounts:', err.message);
    }
}
schedule.scheduleJob('0 3 * * *', purgeUnverifiedAccounts);  // Runs daily at 03:00

const port = process.env.PORT || 3300;
http.listen(port, () => console.log("server connected at 127.0.0.1:" + port + " ..."));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// Centralized response sanitization to strip tokens/passwords/internal flags
// Inline sanitizer to avoid module resolution issues during bootstrap.
function _sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const SENSITIVE_KEYS = ['password', 'pwd', 'tokens', 'authToken', 'refreshToken', 'jwt', 'secret', 'internal', 'isAdminSecret'];
  if (Array.isArray(obj)) return obj.map(_sanitizeObject);
  const out = {};
  for (const k of Object.keys(obj)) {
    if (SENSITIVE_KEYS.includes(k)) continue;
    const v = obj[k];
    if (v && typeof v === 'object') out[k] = _sanitizeObject(v);
    else out[k] = v;
  }
  return out;
}
app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function (body) {
    try {
      // Debug signin responses (temporary)
      if (req.path && req.path.includes('/auth/signin')) {
        try { console.log('DEBUG: original response body for signin:', JSON.stringify(body).slice(0,400)); } catch (e) { }
      }
      // Allow signin/signup/firebase-login responses to include `token` (auth flow).
      // Check multiple URL forms (`originalUrl` when mounted under `/api/v1`, and `path` fallback)
      const allowToken = (req.originalUrl && (req.originalUrl.includes('/api/v1/auth/signin') || req.originalUrl.includes('/api/v1/auth/signup') || req.originalUrl.includes('/api/v1/auth/firebase-login'))) ||
                         (req.path && (req.path.includes('/auth/signin') || req.path.includes('/auth/signup') || req.path.includes('/auth/firebase-login')));
      if (allowToken && body && typeof body === 'object') {
        // Support several possible nesting shapes for the token (generic + legacy):
        // - body.data.token
        // - body.token
        // - body.data.data.token (rare double-wrapped)
        const token = (body.data && body.data.token) || body.token || (body.data && body.data.data && body.data.data.token) || null;
        if (token) {
          const sanitized = _sanitizeObject(body);
          try { if (sanitized && sanitized.data) sanitized.data.token = token; else if (sanitized) sanitized.token = token; } catch (e) { }
          return originalJson.call(this, sanitized);
        }
      }
      let sanitized = _sanitizeObject(body);

      // Privacy-by-design: enforce anonymity for posts/comments in responses.
      // If an object contains `anonyme: true` and a `user` field, remove the
      // real `user` and replace with a minimal anonymized author token. The
      // real author remains stored in DB for moderation and DSAR but is not
      // returned to clients.
      const { anonymizeObject } = require('./app/utils/privacy');
      sanitized = anonymizeObject(sanitized);
      return originalJson.call(this, sanitized);
    } catch (err) {
      console.error('responseSanitizer failed', err);
      return originalJson.call(this, { error: 'Internal server error' });
    }
  };
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use('/products', express.static(path.join(__dirname, 'products')));

// Hardening headers via helmet with stricter options for production
app.use(helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: []
      }
    } : false,
    hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : undefined
  }));
app.use(morgan('tiny'));
app.use(cookieParser());
app.use('/peerjs', peerServer);

if (!process.env.MONGODB_URL) {
  console.error('FATAL: MONGODB_URL environment variable is not set. Exiting.');
  process.exit(1);
}

mongoose.connect(process.env.MONGODB_URL, {
  socketTimeoutMS: 600000,
  connectTimeoutMS: 600000,
  serverSelectionTimeoutMS: 600000,
  maxPoolSize: 10,
  retryWrites: true,
})
.then(async () => {
  console.log("Database connected successfully...");
})
.catch((err) => console.log("Could not connect to database...", err));



const agenda = new Agenda({ db: { address: process.env.MONGODB_URL } });
require('./app/jobs')(agenda);

const routePrefix = '/api/v1';
app.get('/', (req, res) => res.json({ status: 'ok', service: 'Folcen API', version: process.env.npm_package_version || '1.0.0', db: mongoose.connection.db ? mongoose.connection.db.databaseName : 'not-connected' }));
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.use(checkVersion);
app.use(setUrlInfo);
app.use(updateUserInfo);
// legacy direct mounts removed to avoid duplicate route registration
// app.use('/api/v1/auth', authRoutes);
// app.use('/api/v1/message', messageRoutes);
// NOTE: avoid mounting `reportRoutes` at both `/api/v1` and `${routePrefix}/report`.
// The duplicate mount caused ambiguous matching and unexpected 404s. Keep the
// explicit mount below under `${routePrefix}/report`.

// NOTE: this app uses JWT-based authentication for API requests.
// Avoid enabling `passport.session()` / global `express-session` for API routes
// to prevent session-based `req.user` being populated and mixing auth state
// across requests. OAuth routes that require sessions should use a
// dedicated, isolated session middleware or handle the OAuth callback
// explicitly. We still initialize passport for OAuth strategies.
app.use(passport.initialize());


app.get(`${routePrefix}/`, (req, res) => res.send('api is working'));
app.use(`${routePrefix}/auth`, authRoutes);
app.use(`${routePrefix}/user`, userRoutes);
app.use(`${routePrefix}/request`, requestRoutes);
app.use(`${routePrefix}/product`, productRoutes);
app.use(`${routePrefix}/job`, jobRoutes);
app.use(`${routePrefix}/service`, serviceRoutes);
app.use(`${routePrefix}/message`, messageRoutes);
app.use(`${routePrefix}/channel`, postRoutes);
app.use(`${routePrefix}/channel`, channelRoutes);
app.use(`${routePrefix}/channel`, commentRoutes);
app.use(`${routePrefix}/post`, postRoutes);
app.use(`${routePrefix}/comment`, commentRoutes);
app.use(`${routePrefix}/subscription`, subscriptionRoutes);
app.use(`${routePrefix}/report`, reportRoutes);
app.use(`${routePrefix}/follow`, followRoutes);
app.use(`${routePrefix}/activity`, require('./routes/activity'));
app.use(`${routePrefix}/notifications`, require('./routes/notification'));
app.use(`${routePrefix}/push`, require('./routes/push'));
// GDPR / DSAR endpoints
try {
  app.use(`${routePrefix}/gdpr`, require('./routes/gdpr'));
} catch (e) {
  console.warn('GDPR routes failed to mount', e && e.message);
}
// Interest analytics endpoints (GDPR-consented)
try {
  app.use(`${routePrefix}/analytics`, require('./routes/analytics-interests'));
} catch (e) {
  console.warn('Analytics-interests routes failed to mount', e && e.message);
}
try {
  app.use(`${routePrefix}/admin`, require('./routes/admin'));
} catch (e) {
  console.warn('Admin routes failed to mount', e && e.message);
}
// Serve uploads from both modern and legacy locations.
// New avatar uploads are written under public/uploads, while older post media can still be in uploads/.
const mediaStore = require('./app/utils/mediaStore');
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads', mediaStore.serveFallback());
app.use('/public/uploads', mediaStore.serveFallback());
app.use('/public/images/avatars', express.static(path.join(__dirname, 'public/images/avatars')));
app.use('/channels', express.static(path.join(__dirname, 'public/channels')));
app.use('/channels', mediaStore.serveFallback());
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/upload_chat', express.static(path.join(__dirname, 'public/upload_chat')));
app.use('/upload_chat', mediaStore.serveFallback());



function listRoutes(app) {
    app._router.stack.forEach(middleware => {
      if (middleware.name === 'router') {
        middleware.handle.stack.forEach(handler => {
          if (handler.route) {
            console.log(`Method: ${handler.route.stack[0].method.toUpperCase()}, Path: ${routePrefix}${handler.route.path}`);
          }
        });
      }
    });
  }
  

// Log routes
listRoutes(app);
app.use(invalidTokenError);
app.use((err, req, res, next) => {
    console.error('[GLOBAL-ERROR]', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ success: false, message: 'Internal server error', error: err.message });
});
app.use(notFoundError);
const { connectedUsers, socketUserMap } = require('./app/utils/socketManager');

app.set('connectedUsers', connectedUsers);

io.on('connection', async (socket) => {
  console.log('New WebSocket connection');

  const userId = socket.userId;
  console.log('Authenticated WebSocket user connected');

  // Register this connection
  userConnected(userId, socket.id);

  // Optionally attach the missed-calls broadcast helper if present in the repo root
  // This helper will rebroadcast client 'missed-calls-cleared' and 'missed-call-removed'
  // events to all sockets belonging to the same user. It's optional and loaded
  // from ../server-snippets/missed-calls-broadcast.js (created by the frontend helper).
  try {
    const { attachMissedCallHandlers } = require('./server-snippets/missed-calls-broadcast');
    if (typeof attachMissedCallHandlers === 'function') {
      attachMissedCallHandlers(io, socket, connectedUsers, {
        updateClearedAtInDb: async (userId, clearedAt) => {
          try {
            // persist clearedAt for the user so new sessions honor the clear
            await User.findByIdAndUpdate(userId, { missedCallsClearedAt: new Date(clearedAt) });
          } catch (err) {
            console.error('Failed to persist missedCallsClearedAt:', err?.message || 'unknown error');
          }
        }
      });
      console.log('Missed-call handlers attached');
    }
  } catch (e) {
    // helper not present or failed to load — ignore silently
  }
  // Broadcast presence
  io.emit('user-status-changed', { userId, online: true });

  // 📡 Presence tracking after PeerJS.init()
  // Do NOT trust frontend-supplied userId. Use authenticated `socket.authUser`.
  socket.on('online', async ({ peerId }) => {
    if (!peerId) return;
    const authUser = socket.authUser;
    if (!authUser) return;

    const u = String(authUser._id);
    userConnected(u, socket.id);
    try { await peerStore.set(u, peerId); } catch (e) { console.error('peerStore.set failed', e); }

    io.to(socket.id).emit('online-confirmed', { peerId });
    console.log('Socket presence updated');
  });

  // 📢 Debug all events
  if (DEBUG_SOCKET_EVENTS) socket.onAny((event, ...args) => {
    console.log(`WebSocket event received: ${event}`);
  });

  // Heartbeat mechanism
  let isAlive = true;
  const heartbeatInterval = setInterval(() => {
    if (!isAlive) {
      console.log('WebSocket heartbeat missed; terminating socket');
      socket.disconnect(true);
      return;
    }
    isAlive = false;
    socket.emit('ping');
  }, 30000);

  socket.on('pong', () => {
    isAlive = true;
  });

  // 🔌 Disconnect handler
  socket.on('disconnect', async () => {
    clearInterval(heartbeatInterval);

    console.log('WebSocket disconnected');

    const wentOffline = userDisconnected(socket.id);

    if (wentOffline) {
      try {
        await User.findByIdAndUpdate(userId, { lastSeen: new Date() });
        console.log('Disconnected account marked offline');
        io.emit('user-status-changed', { userId, online: false });
      } catch (err) {
        console.error('❌ Error during user disconnect cleanup:', err);
      }
    }
  });

  // 🔗 Attach chat & video handlers
  require('./app/sockets/chat')(io, socket);
  require('./app/sockets/video')(io, socket);
});



// Serve the Cordova application for the browser platform
app.use(express.static(path.join(__dirname, 'platforms/browser/www')));

// Handle all other routes and return the index file
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'platforms/browser/www', 'index.html'));
});

(async () => {
    const subscription = new Subscription();
    subscription.offers = [];
    subscription.dayPrice = 120;
    subscription.weekPrice = 6;
    subscription.monthPrice = 20;
    subscription.yearPrice = 120;
    subscription.currency = 'usd';
    await subscription.save();
    console.log('done');
})();
