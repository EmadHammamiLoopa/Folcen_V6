const { recordAudit } = require('./audit');

/**
 * Folcen Internal Logger
 * Enforces structured logging, redaction of sensitive data, and environment compliance.
 */
const logger = {
  /**
   * Redacts sensitive keys from metadata.
   */
  redact(data) {
    if (!data || typeof data !== 'object') return data;
    const sensitiveKeys = /token|password|jwt|secret|auth|cookie|ssn/i;
    const redacted = Array.isArray(data) ? [] : {};
    
    for (const [key, value] of Object.entries(data)) {
      if (typeof key === 'string' && sensitiveKeys.test(key)) {
        redacted[key] = '[REDACTED]';
      } else if (value && typeof value === 'object') {
        redacted[key] = this.redact(value);
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
  },

  info(message, meta = {}) {
    console.info(`[INFO] ${message}`, JSON.stringify(this.redact(meta)));
  },

  warn(message, meta = {}) {
    console.warn(`[WARN] ${message}`, JSON.stringify(this.redact(meta)));
  },

  error(message, error = null, meta = {}) {
    const errorDetails = error instanceof Error ? { message: error.message, stack: error.stack } : error;
    console.error(`[ERROR] ${message}`, JSON.stringify(this.redact({ ...meta, error: errorDetails })));
  },

  /**
   * GDPR-compliant Audit Logger
   * Persists record to DB via audit utility
   */
  async audit(action, { actorId, targetUserId, details } = {}) {
    this.info(`Audit Event: ${action}`, { actorId, targetUserId, details });
    try {
      await recordAudit({ actorId, action, targetUserId, details });
    } catch (err) {
      // Fallback if DB audit fails
      this.error('Audit Persistence Failed', err, { action, actorId });
    }
  }
};

module.exports = logger;
