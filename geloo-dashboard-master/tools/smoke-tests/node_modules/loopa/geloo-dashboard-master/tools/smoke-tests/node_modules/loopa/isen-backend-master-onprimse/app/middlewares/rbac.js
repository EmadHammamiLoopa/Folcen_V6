/**
 * RBAC middleware
 * - Use `requireRole(roleOrRoles)` to protect endpoints.
 * - Accepts a single role string or array of roles.
 * - Checks `req.authUser.roles` or `socket.authUser.roles` for matching roles.
 */
function hasRole(user, roles) {
  if (!user) return false;
  const userRoles = Array.isArray(user.roles) ? user.roles : (user.roles ? [user.roles] : []);
  const required = Array.isArray(roles) ? roles : [roles];
  return required.some(r => userRoles.includes(r));
}

function requireRole(requiredRoles) {
  return function (req, res, next) {
    try {
      const user = req.authUser;
      if (!user || !hasRole(user, requiredRoles)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      return next();
    } catch (err) {
      console.error('RBAC check failed', err);
      return res.status(403).json({ error: 'Forbidden' });
    }
  };
}

// Socket-level RBAC helper
function requireSocketRole(socket, requiredRoles) {
  const user = socket && socket.authUser;
  return !!user && hasRole(user, requiredRoles);
}

module.exports = {
  requireRole,
  requireSocketRole,
};
