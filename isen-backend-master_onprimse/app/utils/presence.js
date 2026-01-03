// Support either a full REDIS_URL or separate REDIS_HOST/REDIS_PORT env vars
const rawRedisUrl = process.env.REDIS_URL || process.env.REDIS || null;
let redisClient = null;
let useRedis = false;
let redisUrl = rawRedisUrl;

if (!redisUrl && process.env.REDIS_HOST) {
  const host = process.env.REDIS_HOST;
  const port = process.env.REDIS_PORT || '6379';
  redisUrl = `redis://${host}:${port}`;
}

if (redisUrl) {
  try {
    const IORedis = require('ioredis');
    redisClient = new IORedis(redisUrl);
    useRedis = true;
    redisClient.on('error', (e) => console.error('Redis error', e));
    console.log('Presence: using Redis at', redisUrl);
  } catch (err) {
    console.warn('Presence: ioredis not installed or failed to load, falling back to in-memory presence');
    useRedis = false;
  }
} else {
  console.log('Presence: no Redis configuration found; using in-memory fallback');
}

// In-memory fallback: Set of online userIds
const onlineSet = new Set();

const PRESENCE_KEY = 'online_users';

async function setUserOnline(userId) {
  if (useRedis && redisClient) {
    await redisClient.sadd(PRESENCE_KEY, userId);
    // set TTL to 24h as a safety (presence should be explicit removed on disconnect)
    await redisClient.expire(PRESENCE_KEY, 60 * 60 * 24);
    return true;
  }
  onlineSet.add(userId);
  return true;
}

async function setUserOffline(userId) {
  if (useRedis && redisClient) {
    await redisClient.srem(PRESENCE_KEY, userId);
    return true;
  }
  onlineSet.delete(userId);
  return true;
}

async function isUserOnline(userId) {
  if (useRedis && redisClient) {
    const isMember = await redisClient.sismember(PRESENCE_KEY, userId);
    return isMember === 1;
  }
  return onlineSet.has(userId);
}

// Accepts array of userIds and returns a Set of those who are online
async function getOnlineSet(userIds) {
  if (!Array.isArray(userIds) || !userIds.length) return new Set();
  if (useRedis && redisClient) {
    const pipeline = redisClient.pipeline();
    userIds.forEach(id => pipeline.sismember(PRESENCE_KEY, id));
    const res = await pipeline.exec();
    const set = new Set();
    for (let i = 0; i < res.length; i++) {
      const [err, val] = res[i];
      if (!err && val === 1) set.add(userIds[i]);
    }
    return set;
  }
  return new Set(userIds.filter(id => onlineSet.has(id)));
}

module.exports = {
  setUserOnline,
  setUserOffline,
  isUserOnline,
  getOnlineSet
};
