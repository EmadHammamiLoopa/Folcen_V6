/**
 * privacy utilities
 * - anonymizeObject(obj): recursively replaces objects with `anonyme:true` and `user` fields
 *   by removing real `user` and adding a stable `anonId` for client display.
 * NOTE: The real author is retained in the DB; this function only affects outgoing responses.
 */
function anonymizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(anonymizeObject);
  try {
    if (obj.anonyme === true && obj.user) {
      const idStr = (obj._id || obj.id || '') + '';
      const anonId = 'anon-' + (idStr ? idStr.slice(-6) : Math.random().toString(36).slice(2,8));
      obj.user = { anonymous: true, anonId };
    }
  } catch (e) {}
  for (const k of Object.keys(obj)) if (obj[k] && typeof obj[k] === 'object') obj[k] = anonymizeObject(obj[k]);
  return obj;
}

module.exports = { anonymizeObject };
