'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const tokenBlacklist = require('../utils/tokenBlacklist');

const AUTHENTICATION_ERROR = 'Authentication error';

function isAdminRole(user) {
  return user && (user.role === 'ADMIN' || user.role === 'SUPER ADMIN');
}

function isSocketAccountEligible(user) {
  if (!user) return false;
  if (user.deletedAt || user.isDeleted) return false;
  if (user.banned) return false;
  if (user.enabled === false) return false;
  if (!user.emailVerified && !isAdminRole(user)) return false;
  return true;
}

function createSocketAuthMiddleware({
  jwtService = jwt,
  userModel = User,
  blacklist = tokenBlacklist,
  logger = console,
} = {}) {
  return async function authenticateSocket(socket, next) {
    const token = socket.handshake && socket.handshake.auth
      ? socket.handshake.auth.token
      : null;

    if (!token) {
      logger.log('❌ No token provided in socket connection');
      return next(new Error(AUTHENTICATION_ERROR));
    }

    let decoded;
    try {
      decoded = jwtService.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error && error.name === 'TokenExpiredError') {
        logger.warn('❌ Authentication failed: token expired at', error.expiredAt);
      } else {
        logger.error('❌ Invalid token', error && error.message ? error.message : error);
      }
      return next(new Error(AUTHENTICATION_ERROR));
    }

    const jti = decoded && decoded.jti;
    const userId = decoded && decoded._id;
    if (!jti || !userId) return next(new Error(AUTHENTICATION_ERROR));

    try {
      const [jtiRevoked, userRevoked] = await Promise.all([
        blacklist.isRevokedByJti(jti),
        blacklist.isUserRevoked(userId),
      ]);

      if (jtiRevoked || userRevoked) {
        return next(new Error(AUTHENTICATION_ERROR));
      }

      const user = await userModel
        .findById(userId)
        .select('-password -tokens -refreshToken')
        .lean();

      if (!isSocketAccountEligible(user)) {
        return next(new Error(AUTHENTICATION_ERROR));
      }

      socket.authUser = user;
      socket.userId = String(user._id);
      logger.log(`✅ WebSocket authenticated for userId: ${socket.userId}`);
      return next();
    } catch (error) {
      logger.error('WebSocket authentication lookup failed', error);
      return next(new Error(AUTHENTICATION_ERROR));
    }
  };
}

module.exports = {
  AUTHENTICATION_ERROR,
  createSocketAuthMiddleware,
  isSocketAccountEligible,
};
