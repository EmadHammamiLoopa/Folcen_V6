const User = require('../models/User');

const ADMIN_ROLES = new Set([
  'ADMIN',
  'SUPER ADMIN'
]);

function isAdminRole(role) {
  return ADMIN_ROLES.has(String(role || ''));
}

function isActiveSuperAdmin(user) {
  return Boolean(
    user &&
    user.role === 'SUPER ADMIN' &&
    user.enabled !== false &&
    user.isDeleted !== true
  );
}

async function countOtherActiveSuperAdmins(userId) {
  const query = {
    role: 'SUPER ADMIN',
    enabled: { $ne: false },
    isDeleted: { $ne: true }
  };

  if (userId) {
    query._id = { $ne: userId };
  }

  return User.countDocuments(query);
}

/**
 * Return true only when the requested state transition would remove the
 * final active SUPER ADMIN from Folcen.
 *
 * This protects operational access from accidental dashboard/admin actions.
 * It is not used to silently override an explicit data-subject erasure flow.
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

  const remainsActiveSuperAdmin =
    nextRole === 'SUPER ADMIN' &&
    nextEnabled !== false &&
    nextDeleted !== true;

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
  isActiveSuperAdmin,
  countOtherActiveSuperAdmins,
  wouldRemoveLastActiveSuperAdmin
};
