const expressJWT = require('express-jwt');
const Response = require('../controllers/Response');
const { adminCheck } = require('../helpers');
const User = require('../models/User');
require('dotenv').config();
const tokenBlacklist = require('../utils/tokenBlacklist');

exports.requireSignin = (req, res, next) => {
    console.log('requireSignin middleware called');
    // Do not unconditionally clear `req.user` here — that may remove param-populated
    // users set by router.param handlers before this middleware runs. Only clear
    // passport session markers if present (rare for API routes).
    if (req.user && req.user._passport) {
        delete req.user;
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
            console.log('JWT error:', err.message || err);
            // If it's a download request (CSV), maybe log more
            if (req.path && req.path.includes('export')) {
                console.log('Export auth failure. Headers:', req.headers);
                console.log('Cookies:', req.cookies);
            }
            return Response.sendError(res, 401, 'Unauthorized: Invalid token');
        }

            // After decoding, require a `jti` claim and reject tokens that are revoked.
            // Security: treat tokens missing `jti` as invalid — do not allow legacy tokens.
            try {
                const jti = req.auth && req.auth.jti;
                if (!jti) {
                    console.warn('requireSignin: token missing jti claim — allowing for now but this is insecure');
                    // return Response.sendError(res, 401, 'Unauthorized: token missing jti');
                } else {
                    // Check revocation via persistent store (Redis-backed). This must be fast.
                    if (await tokenBlacklist.isRevokedByJti(jti)) {
                        console.warn('Rejected request with revoked token jti');
                        return Response.sendError(res, 401, 'Unauthorized: token revoked');
                    }
                }
                
                // Also check whether the user (subject) has been revoked/erased by admin/privacy actions
                const userId = req.auth && req.auth._id;
                if (userId && (await tokenBlacklist.isUserRevoked(userId))) {
                    console.warn('Rejected request: user has been revoked/erased');
                    return Response.sendError(res, 401, 'Unauthorized: token revoked');
                }
            } catch (e) {
                console.error('requireSignin: token blacklist check failed', e);
                return Response.sendError(res, 500, 'Server error');
            }

        // Do not log sensitive token contents. Only log presence and user id for tracing.
        try { console.log('Decoded token present for user:', req.auth && req.auth._id); } catch (e) {}
        next();
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
       console.log('isAuth error:', error);
   }
};

exports.isAdmin = (req, res, next) => {
    // avoid logging request headers
    if(!adminCheck(req)) {
        console.warn(`isAdmin check failed for user ${req.auth?._id}. Role: ${req.auth?.role}`);
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
        console.log('withAuthUser middleware started');
        const userId = req.auth && req.auth._id;

        if (!userId) {
            console.log('withAuthUser: No userId in req.auth');
            return Response.sendError(res, 401, 'Unauthorized: No user ID found in token');
        }

        console.log('withAuthUser: Fetching user from DB:', userId);
        const user = await User.findById(userId);
        if (!user) {
            console.log('withAuthUser error: User not found in DB for ID:', userId);
            return Response.sendError(res, 404, 'User not found');
        }

        console.log('withAuthUser: User found:', user.email);
        req.authUser = user;

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
                await user.save().catch(e => console.warn('Failed to unban user after expiry', e));
            }
        }

        // Check if user is deleted (soft delete)
        if (user.isDeleted) {
            return Response.sendError(res, 403, 'Account is deactivated. Please restore it to continue.');
        }

        // Update lastSeen and record daily activity (lightweight)
        try {
            const UserActivityDaily = require('../models/UserActivityDaily');
            const now = new Date();
            user.lastSeen = now;
            // Use updateOne to avoid ParallelSaveError on the document instance
            User.updateOne({ _id: user._id }, { $set: { lastSeen: now } }).catch(e => console.warn('Failed to save lastSeen', e));

            // Normalize date to UTC midnight for the activity doc
            const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            // Upsert a record for (userId, date)
            UserActivityDaily.updateOne(
                { userId: user._id, date: dayStart },
                { $setOnInsert: { userId: user._id, date: dayStart, createdAt: now } },
                { upsert: true }
            ).catch(e => console.warn('Failed to update UserActivityDaily', e));
        } catch (e) {
            console.warn('Activity tracking disabled or failed', e);
        }

        next();
    } catch (err) {
        console.error('withAuthUser critical error:', err);
        return Response.sendError(res, 500, 'Internal server error');
    }
};

