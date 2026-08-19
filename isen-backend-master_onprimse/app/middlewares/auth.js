const expressJWT = require('express-jwt');
const Response = require('../controllers/Response');
const { adminCheck, normalizeLeanDoc } = require('../helpers');
const User = require('../models/User');
require('dotenv').config();
const tokenBlacklist = require('../utils/tokenBlacklist');
const logger = require('../utils/logger');

exports.requireSignin = (req, res, next) => {
    // Short-circuit if we've already processed auth for this request
    if (req._requireSigninRun) return next();
    req._requireSigninRun = true;

    // Do not unconditionally clear `req.user` here — that may remove param-populated
    // users set by router.param handlers before this middleware runs. Only clear
    // passport session markers if present (rare for API routes).
    if (req.user && req.user._passport) {
        delete req.user;
    }

    // If another middleware already decoded the JWT and set `req.auth`, reuse it
    if (req.auth) {
        (async () => {
            try {
                const jti = req.auth && req.auth.jti;
                const userId = req.auth && req.auth._id;

                const [jtiRevoked, userRevoked] = await Promise.all([
                    jti
                        ? tokenBlacklist.isRevokedByJti(jti)
                        : Promise.resolve(false),
                    userId
                        ? tokenBlacklist.isUserRevoked(userId)
                        : Promise.resolve(false)
                ]);

                if (jtiRevoked) {
                    logger.warn('Rejected request with revoked token jti');
                    return Response.sendError(res, 401, 'Unauthorized: token revoked');
                }

                if (userRevoked) {
                    logger.warn('Rejected request: user has been revoked/erased');
                    return Response.sendError(res, 401, 'Unauthorized: token revoked');
                }
            } catch (e) {
                logger.error('requireSignin: token blacklist check failed', e);
                return Response.sendError(res, 500, 'Server error');
            }

            if (process.env.DEBUG_AUTH === '1') {
                try { logger.info('Decoded token present for user id:', req.auth && req.auth._id); } catch (e) {}
            }
            return next();
        })();
        return;
    }

    // Fast-path: if there's no token in common places, return immediately
    const _hasToken = (() => {
        const h = req.headers && (req.headers.authorization || req.headers.Authorization);
        if (h && String(h).split(' ')[0] === 'Bearer') return true;
        if (req.cookies && req.cookies.token) return true;
        if (req.query && req.query.token) return true;
        return false;
    })();

    // If this is an admin endpoint and there's no token, reject quickly (avoid heavy processing)
    if (! _hasToken && req.path && req.path.startsWith('/api/v1/admin')) {
        logger.warn('Fast reject admin endpoint without token:', req.path);
        return Response.sendError(res, 403, 'Access forbidden');
    }

    // If there's no token at all, respond with 401 quickly instead of invoking express-jwt
    if (! _hasToken) {
        return Response.sendError(res, 401, 'Unauthorized: No authorization token provided');
    }

    expressJWT({
        secret: process.env.JWT_SECRET || 'fallback_secret_for_dev_only',
        algorithms: ['HS256'],
        userProperty: 'auth',
        credentialsRequired: true,
        getToken: (req) => {
            // Only allow Authorization: Bearer by default (strict per-request JWT)
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.split(' ')[0] === 'Bearer') {
                return authHeader.split(' ')[1];
            }

            // Cookie-based auth may be explicitly enabled; keep behavior controlled by env
            // For dashboard downloads, we often need to allow cookies or query params
            if (req.cookies && req.cookies.token) {
                return req.cookies.token;
            }

            if (req.query && req.query.token) {
                return req.query.token;
            }

            return null;
        }
    })(req, res, async (err) => {
        if (err) {
            logger.info('JWT error:', err.message || err);
            // If it's a download request (CSV), maybe log more
            if (req.path && req.path.includes('export')) {
                logger.info('Export auth failure. Headers:', req.headers);
                logger.info('Cookies:', req.cookies);
            }
            return Response.sendError(res, 401, 'Unauthorized: Invalid token');
        }
        // After decoding, require a `jti` claim and reject tokens that are revoked.
        try {
            const jti = req.auth && req.auth.jti;
            const userId = req.auth && req.auth._id;

            if (!jti) {
                logger.warn('requireSignin: token missing jti claim');
            }

            const [jtiRevoked, userRevoked] = await Promise.all([
                jti
                    ? tokenBlacklist.isRevokedByJti(jti)
                    : Promise.resolve(false),
                userId
                    ? tokenBlacklist.isUserRevoked(userId)
                    : Promise.resolve(false)
            ]);

            if (jtiRevoked) {
                logger.warn('Rejected request with revoked token jti');
                return Response.sendError(res, 401, 'Unauthorized: token revoked');
            }

            if (userRevoked) {
                logger.warn('Rejected request: user has been revoked/erased');
                return Response.sendError(res, 401, 'Unauthorized: token revoked');
            }
        } catch (e) {
            logger.error('requireSignin: token blacklist check failed', e);
            return Response.sendError(res, 500, 'Server error');
        }

        // Only log non-sensitive identifiers
        if (process.env.DEBUG_AUTH === '1') {
            try { logger.info('Decoded token present for user id:', req.auth && req.auth._id); } catch (e) {}
        }
        return next();
    });
};



exports.isAuth = (req, res, next) => {
   try {
        // Avoid logging headers (may contain Authorization). Only log that check ran.
        if(adminCheck(req)) return next();
        if(!req.user || !req.auth || String(req.auth._id) !== String(req.user._id))
            return Response.sendError(res, 403, 'Access denied');
        return next();
   } catch (error) {
       logger.info('isAuth error:', error);
   }
};

exports.isAdmin = (req, res, next) => {
    // avoid logging request headers
    if(!adminCheck(req)) {
        logger.warn(`isAdmin check failed for user ${req.auth?._id}. Role: ${req.auth?.role}`);
        return Response.sendError(res, 403, 'Access forbidden');
    }
    next();
};

exports.isSuperAdmin = (req, res, next) => {
    // avoid logging request headers
    if(req.auth.role != 'SUPER ADMIN')
        return Response.sendError(res, 403, 'Access forbidden');
    next();
};

exports.withAuthUser = async (req, res, next) => {
    try {
        const userId = req.auth && req.auth._id;

        if (!userId) {
            logger.info('withAuthUser: No userId in req.auth');
            return Response.sendError(res, 401, 'Unauthorized: No user ID found in token');
        }
        // Avoid refetching if we've already loaded the user for this request
        if (req._userLoaded && req.user && String(req.user._id) === String(userId)) {
            req.authUser = req.user;
            return next();
        }

        // Only select the minimal necessary fields to avoid transferring/storing full docs
        let user = await User.findById(userId)
            .select('_id email role banned banUntil isDeleted emailVerified bannedReason lastSeen friends followers city country createdAt')
            .lean();
        if (!user) {
            logger.info('withAuthUser error: User not found in DB for ID:', userId);
            return Response.sendError(res, 404, 'User not found');
        }

        // Normalize all ObjectIds to strings to prevent buffer serialization
        user = normalizeLeanDoc(user);

        if (process.env.DEBUG_AUTH === '1') {
            logger.info('withAuthUser: User loaded id/email:', user._id, user.email);
        }
        // Attach to `req.authUser` always. Only attach to `req.user` if not already set 
        // (to avoid overwriting param-loaded target users).
        req.authUser = user;
        if (!req.user) {
            req.user = user;
        }
        req._userLoaded = true;

        // Check if user is banned
        if (user.banned) {
            if (user.banUntil && user.banUntil > new Date()) {
                return Response.sendError(res, 403, `Your account is banned until ${user.banUntil.toDateString()}. Reason: ${user.bannedReason || 'No reason provided'}`);
            } else if (!user.banUntil) {
                return Response.sendError(res, 403, `Your account is permanently banned. Reason: ${user.bannedReason || 'No reason provided'}`);
            } else {
                // Ban expired
                user.banned = false;
                user.banUntil = null;
                await user.save().catch(e => logger.warn('Failed to unban user after expiry', e));
            }
        }

        // Check if user is deleted (soft delete)
        if (user.isDeleted) {
            return Response.sendError(res, 403, 'Account is deactivated. Please restore it to continue.');
        }

        // Block access if the user has not verified their email yet.
        // Admins and super admins bypass this — they are trusted platform users.
        // The frontend catches this error code and redirects to the verify-email step.
        const isAdminRole = user.role === 'ADMIN' || user.role === 'SUPER ADMIN';
        if (!user.emailVerified && !isAdminRole) {
            return Response.sendError(
                res,
                403,
                'Please verify your email address to access the app.',
                'EMAIL_NOT_VERIFIED'
            );
        }

        // Update lastSeen and record daily activity (lightweight)
        try {
            const UserActivityDaily = require('../models/UserActivityDaily');
            const now = new Date();
            // Update lastSeen without modifying the in-memory `user` object
            User.updateOne({ _id: user._id }, { $set: { lastSeen: now } }).catch(e => logger.warn('Failed to save lastSeen', e));

            // Normalize date to UTC midnight for the activity doc
            const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            // Upsert a record for (userId, date)
            UserActivityDaily.updateOne(
                { userId: user._id, date: dayStart },
                { $setOnInsert: { userId: user._id, date: dayStart, createdAt: now } },
                { upsert: true }
            ).catch(e => logger.warn('Failed to update UserActivityDaily', e));
        } catch (e) {
            logger.warn('Activity tracking disabled or failed', e);
        }

        next();
    } catch (err) {
        logger.error('withAuthUser critical error:', err);
        return Response.sendError(res, 500, 'Internal server error');
    }
};

exports.requireEmailVerified = (req, res, next) => {
    if (req.authUser && !req.authUser.emailVerified) {
        logger.warn(`requireEmailVerified: User ${req.authUser._id} attempted to access ${req.originalUrl} without verification`);
        return Response.sendError(res, 403, 'Please verify your email to access this feature.');
    }
    next();
};
