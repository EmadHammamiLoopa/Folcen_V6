'use strict';

const fs =
  require('fs').promises;

const path =
  require('path');

const mediaStore =
  require('./mediaStore');

const BACKEND_ROOT =
  path.resolve(
    __dirname,
    '..',
    '..'
  );

const PUBLIC_ROOT =
  path.resolve(
    BACKEND_ROOT,
    'public'
  );

const LEGACY_UPLOAD_ROOT =
  path.resolve(
    BACKEND_ROOT,
    'uploads'
  );

const SHARED_MEDIA =
  new Set([
    '/channels/channel-default.png'
  ]);

function insideRoot(
  root,
  candidate
) {
  const relative =
    path.relative(
      root,
      candidate
    );

  return (
    relative === '' ||
    (
      !relative.startsWith('..') &&
      !path.isAbsolute(relative)
    )
  );
}

function safeResolve(
  root,
  relative
) {
  const candidate =
    path.resolve(
      root,
      relative
    );

  if (
    !insideRoot(
      root,
      candidate
    )
  ) {
    throw new Error(
      'Refusing to remove media outside managed storage'
    );
  }

  return candidate;
}

function managedLocalCandidates(
  normalized
) {
  const paths =
    [];

  if (
    normalized.startsWith(
      '/public/uploads/'
    )
  ) {
    const tail =
      normalized.slice(
        '/public/uploads/'.length
      );

    paths.push(
      safeResolve(
        path.join(
          PUBLIC_ROOT,
          'uploads'
        ),
        tail
      )
    );

    paths.push(
      safeResolve(
        LEGACY_UPLOAD_ROOT,
        tail
      )
    );

    return paths;
  }

  if (
    normalized.startsWith(
      '/uploads/'
    )
  ) {
    const tail =
      normalized.slice(
        '/uploads/'.length
      );

    paths.push(
      safeResolve(
        path.join(
          PUBLIC_ROOT,
          'uploads'
        ),
        tail
      )
    );

    paths.push(
      safeResolve(
        LEGACY_UPLOAD_ROOT,
        tail
      )
    );

    return paths;
  }

  const publicPrefixes = [
    '/channels/',
    '/products/',
    '/services/',
    '/jobs/'
  ];

  const prefix =
    publicPrefixes.find(
      value =>
        normalized.startsWith(
          value
        )
    );

  if (
    prefix
  ) {
    paths.push(
      safeResolve(
        PUBLIC_ROOT,
        normalized.replace(
          /^\/+/,
          ''
        )
      )
    );
  }

  return paths;
}

function isManagedContentPath(
  normalized
) {
  return [
    '/uploads/',
    '/public/uploads/',
    '/channels/',
    '/products/',
    '/services/',
    '/jobs/'
  ].some(
    prefix =>
      normalized.startsWith(
        prefix
      )
  );
}

async function removeLocalFile(
  filePath
) {
  try {
    await fs.unlink(
      filePath
    );

    return true;

  } catch (error) {

    if (
      error &&
      error.code ===
        'ENOENT'
    ) {
      return false;
    }

    throw error;
  }
}

/**
 * Remove one managed content-media path from both durable GridFS storage
 * and any supported local storage location.
 *
 * Durable deletion is strict: GridFS failures propagate so a destructive
 * moderation action cannot claim success while a durable copy remains.
 */
async function removeManagedMedia(
  value
) {
  const normalized =
    mediaStore.normalizePublicPath(
      value
    );

  if (
    !normalized ||
    SHARED_MEDIA.has(
      normalized
    )
  ) {
    return {
      normalized,
      durableDeleted: 0,
      localDeleted: 0,
      skipped:
        true
    };
  }

  if (
    !isManagedContentPath(
      normalized
    )
  ) {
    return {
      normalized,
      durableDeleted: 0,
      localDeleted: 0,
      skipped:
        true
    };
  }

  // Build/validate every local candidate before mutating durable storage.
  const localCandidates =
    [
      ...new Set(
        managedLocalCandidates(
          normalized
        )
      )
    ];

  const durableDeleted =
    await mediaStore.removeStored(
      normalized
    );

  let localDeleted =
    0;

  for (
    const candidate
    of localCandidates
  ) {
    if (
      await removeLocalFile(
        candidate
      )
    ) {
      localDeleted += 1;
    }
  }

  return {
    normalized,
    durableDeleted,
    localDeleted,
    skipped:
      false
  };
}

module.exports = {
  removeManagedMedia
};
