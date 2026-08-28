const User = require('../models/User');

const ADMIN_ROLES = new Set([
  'ADMIN',
  'SUPER ADMIN'
]);

function isAdminRole(role) {
  return ADMIN_ROLES.has(String(role || ''));
}

function hasActiveBan(user, now = new Date()) {
  if (!user || user.banned !== true) {
    return false;
  }

  // Permanent ban.
  if (!user.banUntil) {
    return true;
  }

  const until =
    user.banUntil instanceof Date
      ? user.banUntil
      : new Date(user.banUntil);

  // Invalid banUntil is treated conservatively as an active ban.
  if (Number.isNaN(until.getTime())) {
    return true;
  }

  return until > now;
}

function isActiveSuperAdmin(user) {
  return Boolean(
    user &&
    user.role === 'SUPER ADMIN' &&
    user.enabled !== false &&
    user.isDeleted !== true &&
    !hasActiveBan(user)
  );
}

async function countOtherActiveSuperAdmins(userId) {
  const now = new Date();

  const query = {
    role: 'SUPER ADMIN',
    enabled: { $ne: false },
    isDeleted: { $ne: true },
    $or: [
      { banned: { $ne: true } },
      {
        banned: true,
        banUntil: { $lte: now }
      }
    ]
  };

  if (userId) {
    query._id = { $ne: userId };
  }

  return User.countDocuments(query);
}

/**
 * Return true only when the requested state transition would remove the
 * final operationally active SUPER ADMIN from Folcen.
 *
 * Active means:
 * - SUPER ADMIN role
 * - enabled
 * - not soft-deleted
 * - not under an active permanent/temporary ban
 *
 * This protects operational access from ordinary dashboard/admin actions.
 * Explicit Article 17 erasure remains a separate legal workflow.
 */
async function wouldRemoveLastActiveSuperAdmin(target, nextState = {}) {
  if (!isActiveSuperAdmin(target)) {
    return false;
  }

  const nextRole =
    nextState.role !== undefined
      ? nextState.role
      : target.role;

  const nextEnabled =
    nextState.enabled !== undefined
      ? nextState.enabled
      : target.enabled;

  const nextDeleted =
    nextState.isDeleted !== undefined
      ? nextState.isDeleted
      : target.isDeleted;

  const nextBanned =
    nextState.banned !== undefined
      ? nextState.banned
      : target.banned;

  const nextBanUntil =
    nextState.banUntil !== undefined
      ? nextState.banUntil
      : target.banUntil;

  const remainsActiveSuperAdmin =
    isActiveSuperAdmin({
      role: nextRole,
      enabled: nextEnabled,
      isDeleted: nextDeleted,
      banned: nextBanned,
      banUntil: nextBanUntil
    });

  if (remainsActiveSuperAdmin) {
    return false;
  }

  const others =
    await countOtherActiveSuperAdmins(target._id);

  return others === 0;
}

module.exports = {
  ADMIN_ROLES,
  isAdminRole,
  hasActiveBan,
  isActiveSuperAdmin,
  countOtherActiveSuperAdmins,
  wouldRemoveLastActiveSuperAdmin
};
