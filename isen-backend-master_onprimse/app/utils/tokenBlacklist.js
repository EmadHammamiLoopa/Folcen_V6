/*
 * Token blacklist helper
 * - Uses Redis when available (recommended for multi-process deployments)
 * - Falls back to an in-memory Set when Redis is not configured (single-process only)
 * Purpose: allow logout / token revocation without keeping mutable "current user" globals.
 */
let redisClient = null;
let useRedis = false;
let redisErrorLogged = false;
const rawRedisUrl = process.env.REDIS_URL || process.env.REDIS || null;
let redisUrl = rawRedisUrl;
if (!redisUrl && process.env.REDIS_HOST) {
  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT || '6379';
  redisUrl = `redis://${host}:${port}`;
}
if (redisUrl) {
  try {
    const IORedis = require('ioredis');
    // support password and TLS options via env
    const redisOptions = {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 200, 3000)
    };
    if (process.env.REDIS_PASSWORD) redisOptions.password = process.env.REDIS_PASSWORD;
    if (String(process.env.REDIS_TLS || '').toLowerCase() === 'true') {
      redisOptions.tls = { rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false' };
    }
    redisClient = new IORedis(redisUrl, redisOptions);
    useRedis = true;
    redisClient.on('error', (e) => {
      if (!redisErrorLogged) {
        redisErrorLogged = true;
        console.error('TokenBlacklist: Redis unavailable; token revocation checks will fail fast until Redis config is fixed', e && e.message ? e.message : e);
      }
    });
    console.log('TokenBlacklist: using Redis');
  } catch (e) {
    console.error('TokenBlacklist: ioredis not available or failed to connect', e);
    // In production we must fail-fast (no silent fallback)
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
      throw new Error('TokenBlacklist: Redis not available in production');
    }
    console.warn('TokenBlacklist: falling back to in-memory store (dev only)');
    useRedis = false;
  }
} else {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('TokenBlacklist: Redis not configured in production');
  }
  console.log('TokenBlacklist: no Redis configured; using in-memory fallback (not shared across processes)');
}

const inMemorySet = new Set();
const inMemoryUserSet = new Set();
const APP_PREFIX = (process.env.APP_NAME || 'isen').replace(/[^a-zA-Z0-9_-]/g, '');
const ENV_TAG = (process.env.NODE_ENV || 'dev').replace(/[^a-zA-Z0-9_-]/g, '');
// Use a clear namespace for revoked JTIs: <app>:<env>:revoked:jti
const KEY_PREFIX = `${APP_PREFIX}:${ENV_TAG}:revoked:jti`;
const USER_KEY_PREFIX = `${APP_PREFIX}:${ENV_TAG}:revoked:user`;

/**
 * Blacklist by `jti` claim (preferred): store revoked JWT IDs with TTL matching token expiry.
 */
async function revokeByJti(jti, ttlSeconds = 3600) {
  if (!jti) return;
  if (useRedis && redisClient) {
    try {
      // setex ensures key expires automatically when token would naturally expire
      await redisClient.setex(`${KEY_PREFIX}:${jti}`, ttlSeconds, '1');
      return true;
    } catch (e) {
      console.error('TokenBlacklist.revokeByJti Redis error', e);
      inMemorySet.add(jti);
      return true;
    }
  }
  inMemorySet.add(jti);
  return true;
}

async function isRevokedByJti(jti) {
  if (!jti) return true; // treat missing jti as revoked/invalid
  if (useRedis && redisClient) {
    try {
      const v = await redisClient.get(`${KEY_PREFIX}:${jti}`);
      return v === '1';
    } catch (e) {
      console.error('TokenBlacklist.isRevokedByJti Redis error', e);
      return inMemorySet.has(jti);
    }
  }
  return inMemorySet.has(jti);
}

// Revoke all access for a specific user id. This sets a user-scoped revocation marker.
async function revokeUser(userId, ttlSeconds = null) {
  if (!userId) return;
  if (useRedis && redisClient) {
    try {
      const key = `${USER_KEY_PREFIX}:${userId}`;
      if (ttlSeconds && Number.isFinite(ttlSeconds)) {
        await redisClient.setex(key, ttlSeconds, '1');
      } else {
        await redisClient.set(key, '1');
      }
      return true;
    } catch (e) {
      console.error('TokenBlacklist.revokeUser Redis error', e);
      inMemoryUserSet.add(String(userId));
      return true;
    }
  }
  inMemoryUserSet.add(String(userId));
  return true;
}

async function isUserRevoked(userId) {
  if (!userId) return false;
  if (useRedis && redisClient) {
    try {
      const v = await redisClient.get(`${USER_KEY_PREFIX}:${userId}`);
      return v === '1';
    } catch (e) {
      console.error('TokenBlacklist.isUserRevoked Redis error', e);
      return inMemoryUserSet.has(String(userId));
    }
  }
  return inMemoryUserSet.has(String(userId));
}

async function unrevokeUser(userId) {
  if (!userId) return;
  if (useRedis && redisClient) {
    try {
      await redisClient.del(`${USER_KEY_PREFIX}:${userId}`);
      return true;
    } catch (e) {
      console.error('TokenBlacklist.unrevokeUser Redis error', e);
      inMemoryUserSet.delete(String(userId));
      return true;
    }
  }
  inMemoryUserSet.delete(String(userId));
  return true;
}

module.exports = {
  revokeByJti,
  isRevokedByJti,
  revokeUser,
  unrevokeUser,
  isUserRevoked
};




