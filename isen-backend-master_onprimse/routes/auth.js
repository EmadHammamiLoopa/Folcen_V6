const express = require('express');
const passport = require('passport');
const { signup, signin, signout, checkEmail, authUser, traitor } = require('../app/controllers/AuthController');
const { requireSignin, withAuthUser } = require('../app/middlewares/auth');
const { signupValidator, signinValidator, checkEmailValidator } = require('../app/middlewares/validators/authValidator');
const { authLimiter } = require('../app/middlewares/rateLimiter');
const router = express.Router();

// Regular routes
router.post('/checkEmail', checkEmailValidator, checkEmail);
router.get('/user', [requireSignin, withAuthUser], authUser);
// Rate-limit auth endpoints to mitigate brute-force attacks
router.post('/signin', authLimiter, signinValidator, signin);
router.post('/signup', authLimiter, signupValidator, signup);
router.post('/signout', requireSignin, signout);
router.post('/traitor', traitor);

// Google OAuth routes
// OAuth routes: use `session: false` to avoid creating a long-lived server session
 const session = require('express-session');
 // Dedicated OAuth session middleware: uses RedisStore if available, otherwise falls back
 let oauthSessionMiddleware;
 try {
   const IORedis = require('ioredis');
   const redisClient = new IORedis(process.env.REDIS_URL || process.env.REDIS_HOST && `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`);
   const connectRedis = require('connect-redis');
   const RedisStore = connectRedis(session);
   oauthSessionMiddleware = session({
     store: new RedisStore({ client: redisClient }),
     secret: process.env.OAUTH_SESSION_SECRET || process.env.SESSION_SECRET || 'oauth_secret',
     resave: false,
     saveUninitialized: false,
     name: process.env.OAUTH_SESSION_COOKIE_NAME || 'oauth_session',
     cookie: { maxAge: 10 * 60 * 1000, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' }
   });
   console.log('OAuth session: RedisStore configured');
 } catch (e) {
   // Fallback to in-memory session for OAuth only (not recommended in multi-process)
   oauthSessionMiddleware = session({
     secret: process.env.OAUTH_SESSION_SECRET || process.env.SESSION_SECRET || 'oauth_secret',
     resave: false,
     saveUninitialized: false,
     name: process.env.OAUTH_SESSION_COOKIE_NAME || 'oauth_session',
     cookie: { maxAge: 10 * 60 * 1000, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' }
   });
   console.warn('OAuth session: using in-memory session store (install ioredis + connect-redis for production)');
 }
 // OAuth routes: apply the dedicated oauthSessionMiddleware to these routes only
 router.get('/google', oauthSessionMiddleware, passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback',
  oauthSessionMiddleware,
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    // Successful authentication; the passport strategy should produce a JWT
    // and pass it to the client. Redirect to frontend landing page where
    // the client will complete local login flow.
    res.redirect('/');
  }
);

module.exports = router;
