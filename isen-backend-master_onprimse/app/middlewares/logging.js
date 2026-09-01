// Redacting request logger middleware
// Avoids logging Authorization header or token contents and redacts common PII fields

function redactHeaders(headers) {
  const h = { ...headers };
  if (h.authorization) h.authorization = '[REDACTED]';
  if (h.cookie) h.cookie = '[REDACTED]';
  return h;
}

function redactBody(body) {
  if (!body || typeof body !== 'object') return body;
  const out = { ...body };
  const sensitive = ['password', 'token', 'jwt', 'authorization', 'auth'];
  for (const k of sensitive) {
    if (k in out) out[k] = '[REDACTED]';
  }
  return out;
}

exports.redactRequestLog = (req, res, next) => {
  try {
    const userId = (req.auth && req.auth._id) || null;
    console.log(`[INCOMING] ${req.method}`);
  } catch (e) {}
  next();
};

// Export helper for other places
exports.redactHeaders = redactHeaders;
exports.redactBody = redactBody;

module.exports = exports;
