/**
 * Response sanitizer middleware
 * - Wraps `res.json` to remove sensitive fields from outgoing responses
 * - Ensures tokens, passwords, internal flags, and other PII are not leaked
 * - Keeps an audit-friendly copy in logs if needed (avoid logging PII)
 */
function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const SENSITIVE_KEYS = ['password', 'pwd', 'token', 'tokens', 'authToken', 'refreshToken', 'jwt', 'secret', 'internal', 'isAdminSecret'];
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  const out = {};
  for (const k of Object.keys(obj)) {
    if (SENSITIVE_KEYS.includes(k)) continue;
    const v = obj[k];
    if (v && typeof v === 'object') out[k] = sanitizeObject(v);
    else out[k] = v;
  }
  return out;
}

module.exports = function responseSanitizer(req, res, next) {
  const originalJson = res.json;
  res.json = function (body) {
    try {
      const sanitized = sanitizeObject(body);
      return originalJson.call(this, sanitized);
    } catch (err) {
      // If sanitization fails, send a generic error to avoid leaking internals
      console.error('responseSanitizer failed', err);
      return originalJson.call(this, { error: 'Internal server error' });
    }
  };
  next();
};
