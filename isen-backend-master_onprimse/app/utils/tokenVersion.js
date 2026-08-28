'use strict';

/**
 * Persistent JWT generation helper.
 *
 * Compatibility rule:
 * - legacy users with a missing tokenVersion field => generation 0
 * - legacy JWTs with a missing tokenVersion claim => generation 0
 * - explicit malformed values fail closed and never become generation 0
 *
 * After the first credential change, the user's generation becomes > 0,
 * permanently preventing pre-change JWTs from becoming valid again.
 */

function normalizeTokenVersion(value) {
  // Backward compatibility is intentionally narrow:
  // only an actually missing legacy field maps to generation 0.
  if (value === undefined) {
    return 0;
  }

  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    return null;
  }

  return value;
}

function bumpTokenVersion(value) {
  const current =
    normalizeTokenVersion(value);

  if (current === null) {
    throw new Error(
      'Invalid token version'
    );
  }

  if (current >= Number.MAX_SAFE_INTEGER) {
    throw new Error(
      'Token version has reached the maximum safe integer'
    );
  }

  return current + 1;
}

function tokenVersionMatches(
  tokenValue,
  userValue
) {
  const tokenVersion =
    normalizeTokenVersion(tokenValue);

  const userVersion =
    normalizeTokenVersion(userValue);

  if (
    tokenVersion === null ||
    userVersion === null
  ) {
    return false;
  }

  return tokenVersion === userVersion;
}

module.exports = {
  normalizeTokenVersion,
  bumpTokenVersion,
  tokenVersionMatches,
};
