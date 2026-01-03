let Queue;
let queue = null;
const queueName = process.env.BULLMQ_QUEUE || 'image-processing';
// Support either a full REDIS_URL or host/port env vars
let redisConfig = null;
if (process.env.REDIS_URL) {
  redisConfig = process.env.REDIS_URL; // allow passing a redis://... URL
} else {
  redisConfig = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
    // Do not force connect on construction; let first operation attempt connection.
    lazyConnect: true,
  };
}

try {
  ({ Queue } = require('bullmq'));
} catch (err) {
  console.warn('BullMQ not available; will use in-memory fallback for jobs. Install bullmq and ioredis to enable Redis-backed jobs.');
}

function ensureQueue() {
  if (!Queue) return null;
  if (queue) return queue;
  try {
    // BullMQ accepts either connection options or a connection string.
    queue = new Queue(queueName, { connection: redisConfig });
    console.info('BullMQ queue created (lazy):', queueName);
    return queue;
  } catch (e) {
    console.error('Failed to create BullMQ queue (lazy):', e && e.message ? e.message : e);
    queue = null;
    return null;
  }
}

/**
 * Enqueue an image processing job. If BullMQ is not available this is a noop and returns null.
 * The queue is created lazily on first enqueue attempt so requiring the module doesn't attempt a Redis connection.
 * @param {Object} data
 */
async function enqueueImageProcessing(data) {
  // Prefer BullMQ when available and REDIS_HOST is explicitly provided.
  const redisHostProvided = !!process.env.REDIS_HOST;
  if (Queue && redisHostProvided) {
    const q = ensureQueue();
    if (!q) {
      console.warn('enqueueImageProcessing skipped (queue not available). Payload:', data && data.srcPath ? data.srcPath : data);
      return null;
    }
    try {
      const job = await q.add('process-image', data);
      return job;
    } catch (e) {
      console.error('enqueueImageProcessing failed', e && e.message ? e.message : e);
      return null;
    }
  }

  // In-memory fallback for local dev / CI when Redis is not configured.
  // Simple FIFO queue stored in memory; not persistent and not for production.
  try {
    return InMemoryQueue.enqueue('process-image', data);
  } catch (e) {
    console.error('InMemory enqueue failed', e && e.message ? e.message : e);
    return null;
  }
}

// --- In-memory queue implementation ---
const InMemoryQueue = (function createInMemory() {
  const queues = new Map();

  function ensure(name) {
    if (!queues.has(name)) queues.set(name, []);
    return queues.get(name);
  }

  async function enqueue(name, payload) {
    const q = ensure(name);
    const job = { id: `${Date.now()}-${Math.random().toString(36).slice(2,9)}`, name, data: payload, timestamp: Date.now() };
    q.push(job);
    // If a processor is registered, run it asynchronously.
    const processor = processors.get(name);
    if (processor) {
      // run without awaiting to mimic background processing
      setImmediate(async () => {
        try {
          await processor(job);
        } catch (err) {
          console.error('InMemory job processor error for', name, err);
        }
      });
    }
    return job;
  }

  const processors = new Map();
  function process(name, fn) {
    processors.set(name, fn);
  }

  function getJobs(name) {
    return ensure(name).slice();
  }

  return { enqueue, process, getJobs };
})();

module.exports = { enqueueImageProcessing, getQueue: () => queue, inMemory: { process: InMemoryQueue.process, getJobs: InMemoryQueue.getJobs } };
