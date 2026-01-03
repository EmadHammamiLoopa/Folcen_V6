/**
 * Minimal BullMQ worker to process image tasks.
 * Requires Redis running and BULLMQ_QUEUE env set (default: 'image-processing')
 */
const { Worker } = require('bullmq');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const sharp = require('sharp');

const queueName = process.env.BULLMQ_QUEUE || 'image-processing';
const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
};

console.log('Worker starting for queue:', queueName);

const worker = new Worker(queueName, async job => {
  console.log('Processing job', job.id, job.name, job.data);
  // job.data expected: { srcPath, destPath, width?, height?, quality? }
  const { srcPath, destPath, width = 1024, height = null, quality = 80 } = job.data;

  try {
    const dir = path.dirname(destPath);
    await fsp.mkdir(dir, { recursive: true });

    // Use sharp to resize and optimize
    let pipeline = sharp(srcPath).rotate(); // auto-rotate based on EXIF
    if (width || height) pipeline = pipeline.resize(width, height, { fit: 'inside', withoutEnlargement: true });
    pipeline = pipeline.jpeg({ quality, mozjpeg: true }).withMetadata();

    await pipeline.toFile(destPath);

    console.log('Job completed:', job.id, '->', destPath);
    return { success: true };
  } catch (err) {
    console.error('Job failed:', err);
    throw err;
  }
}, { connection });

worker.on('completed', job => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err);
});

process.on('SIGINT', async () => {
  console.log('Shutting down worker...');
  await worker.close();
  process.exit(0);
});
