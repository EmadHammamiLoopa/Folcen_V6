/**
 * Rate limiter middleware
 * - Uses Redis-backed store when available for shared counters across instances
 * - Falls back to in-memory store when Redis not available (single-process only)
 *
 * Purpose: protect auth endpoints (signin/signup/password-reset) from brute-force
 * and credential-stuffing attacks. Keys are namespaced and do NOT contain any
 * user-sensitive data.
 */
const rateLimit = require('express-rate-limit');
const Response = require('../controllers/Response');

let RedisStore;
let redisClient;
try {
  RedisStore = require('rate-limit-redis');
  const IORedis = require('ioredis');
  const redisUrl = process.env.REDIS_URL || (process.env.REDIS_HOST && `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`) || null;
  if (redisUrl) {
    redisClient = new IORedis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 200, 3000)
    });
    redisClient.on('error', (e) => {
      console.error('rateLimiter: Redis error', e && e.message ? e.message : e);
    });
    console.log('rateLimiter: using Redis at', redisUrl);
  }
} catch (e) {
  // optional dependency not installed or Redis not configured — fall back to memory limiter
}

function createLimiter({ windowMs = 15 * 60 * 1000, max = 100, message }) {
  const store = redisClient && RedisStore ? new RedisStore({ client: redisClient, expiry: Math.ceil(windowMs / 1000) }) : undefined;
  const ipKeyGenerator = rateLimit && typeof rateLimit.ipKeyGenerator === 'function' ? rateLimit.ipKeyGenerator : undefined;

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: message || 'Too many requests, please try again later.',
    handler: (req, res, next, options) => {
      const retryAfter = res.getHeader('Retry-After');
      let customMessage = options.message;
      if (retryAfter) {
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) {
          if (seconds < 60) {
            customMessage = `Too many attempts. Please try again in ${seconds} seconds.`;
          } else {
            const minutes = Math.ceil(seconds / 60);
            customMessage = `Too many attempts. Please try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`;
          }
        }
      }
      return Response.sendError(res, options.statusCode, customMessage);
    },
    // Use an IPv6-safe key generator that always returns a normalized string.
    // Some rate-limit stores or key builders can error when the key contains
    // unexpected characters or when undefined is returned. Normalize to a
    // stable string by taking the first IP (X-Forwarded-For support) and
    // replacing characters that could interfere with redis keys.
    keyGenerator: function ipv6SafeKeyGenerator(req /*, res */) {
      try {
        const xf = req.headers && req.headers['x-forwarded-for'];
        let ip = '';
        if (xf && typeof xf === 'string') ip = xf.split(',')[0].trim();
        if (!ip) ip = (req.ip || (req.connection && req.connection.remoteAddress) || '').toString();
        ip = ip || 'unknown';
        if (ipKeyGenerator) {
          // Use the library helper for IPv6-safe key generation (may apply subnet normalization)
          try {
            return ipKeyGenerator(ip);
          } catch (e) {
            // Fall back to safe normalization if helper throws
            return String(ip).replace(/[:%.]/g, '_');
          }
        }
        // Fallback: normalize characters that could interfere with redis keys
        return String(ip).replace(/[:%.]/g, '_');
      } catch (err) {
        return 'unknown';
      }
    },
    store
  });
}

// stricter limits for signin/signup endpoints
const authLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many auth attempts, try again later.' });

module.exports = {
  createLimiter,
  authLimiter
};
