const fs = require('fs');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

const BUCKET_NAME = 'mediaFiles';

function getDb() {
  const db = mongoose.connection && mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');
  return db;
}

function bucket() {
  return new GridFSBucket(getDb(), { bucketName: BUCKET_NAME });
}

function normalizePublicPath(value) {
  if (!value) return '';
  let publicPath = String(value).replace(/\\/g, '/').split('?')[0].split('#')[0].trim();
  if (!publicPath) return '';
  if (/^https?:\/\//i.test(publicPath)) {
    try {
      publicPath = new URL(publicPath).pathname;
    } catch (_) {}
  }
  if (!publicPath.startsWith('/')) publicPath = `/${publicPath}`;
  return publicPath;
}

function pathVariants(publicPath) {
  const normalized = normalizePublicPath(publicPath);
  if (!normalized) return [];

  const variants = new Set([normalized]);
  if (normalized.startsWith('/public/uploads/')) {
    variants.add(normalized.replace('/public/uploads/', '/uploads/'));
  }
  if (normalized.startsWith('/uploads/')) {
    variants.add(normalized.replace('/uploads/', '/public/uploads/'));
  }
  return [...variants];
}

async function removeExisting(publicPath) {
  const b = bucket();
  const variants = pathVariants(publicPath);
  if (!variants.length) return;

  const existing = await b.find({
    $or: [
      { filename: { $in: variants } },
      { 'metadata.publicPath': { $in: variants } }
    ]
  }).toArray();

  await Promise.all(existing.map(file => b.delete(file._id).catch(() => {})));
}

// GDPR/permanent-purge deletion path.
//
// Unlike removeExisting(), this deliberately does not swallow GridFS
// deletion failures. A permanent erasure must not report completion while
// a durable copy is still present.
async function removeStored(publicPath) {
  const b = bucket();
  const variants = pathVariants(publicPath);

  if (!variants.length) {
    return 0;
  }

  const existing = await b.find({
    $or: [
      { filename: { $in: variants } },
      { 'metadata.publicPath': { $in: variants } },
      { 'metadata.aliases': { $in: variants } }
    ]
  }).toArray();

  await Promise.all(
    existing.map(file =>
      b.delete(file._id)
    )
  );

  return existing.length;
}

// Uploaded avatar/chat media carries metadata.userId. Cleaning by metadata
// also covers abandoned uploads that were stored durably but never attached
// to a later Message/User record.
async function removeStoredByUser(userId) {
  const normalizedUserId =
    String(userId || '').trim();

  if (!normalizedUserId) {
    return 0;
  }

  const b = bucket();

  const existing = await b.find({
    'metadata.userId': normalizedUserId
  }).toArray();

  const publicPaths = existing
    .map(file =>
      (file.metadata && file.metadata.publicPath) ||
      file.filename ||
      ''
    )
    .map(normalizePublicPath)
    .filter(Boolean);

  await Promise.all(
    existing.map(file =>
      b.delete(file._id)
    )
  );

  return publicPaths;
}

function saveStream(readable, publicPath, contentType, metadata = {}) {
  return new Promise((resolve, reject) => {
    const normalized = normalizePublicPath(publicPath);
    if (!normalized) return resolve(null);

    const upload = bucket().openUploadStream(normalized, {
      contentType: contentType || 'application/octet-stream',
      metadata: {
        ...metadata,
        publicPath: normalized,
        aliases: pathVariants(normalized),
        savedAt: new Date()
      }
    });

    readable
      .on('error', reject)
      .pipe(upload)
      .on('error', reject)
      .on('finish', resolve);
  });
}

async function saveFile({ filePath, publicPath, contentType, metadata } = {}) {
  const normalized = normalizePublicPath(publicPath);
  if (!filePath || !normalized) return null;

  await removeExisting(normalized);
  return saveStream(fs.createReadStream(filePath), normalized, contentType, metadata);
}

async function saveBuffer({ buffer, publicPath, contentType, metadata } = {}) {
  const normalized = normalizePublicPath(publicPath);
  if (!buffer || !normalized) return null;

  const { Readable } = require('stream');
  await removeExisting(normalized);
  return saveStream(Readable.from(buffer), normalized, contentType, metadata);
}

async function findStoredFile(publicPath) {
  const variants = pathVariants(publicPath);
  if (!variants.length) return null;

  const matches = await bucket().find({
    $or: [
      { filename: { $in: variants } },
      { 'metadata.publicPath': { $in: variants } },
      { 'metadata.aliases': { $in: variants } }
    ]
  }).sort({ uploadDate: -1 }).limit(1).toArray();

  return matches[0] || null;
}

function serveFallback() {
  return async (req, res, next) => {
    try {
      const publicPath = normalizePublicPath(req.originalUrl || req.url);
      const file = await findStoredFile(publicPath);
      if (!file) return next();

      res.setHeader('Content-Type', file.contentType || 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      bucket()
        .openDownloadStream(file._id)
        .on('error', next)
        .pipe(res);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  normalizePublicPath,
  saveFile,
  saveBuffer,
  removeStored,
  removeStoredByUser,
  serveFallback
};
