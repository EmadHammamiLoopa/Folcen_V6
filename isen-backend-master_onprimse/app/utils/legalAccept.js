const LegalAcceptance = require('../models/LegalAcceptance');
const { recordAudit } = require('./audit');

// Allowed document types to reduce accidental storage of arbitrary strings
const ALLOWED_DOCUMENT_TYPES = new Set([
  'terms',
  'privacy',
  'terms_and_privacy',
  'seller_disclaimer',
  'service_disclaimer',
  'channels_disclaimer',
  'products_disclaimer',
  'services_disclaimer',
  'jobs_disclaimer'
]);

/**
 * Record a legal acceptance event.
 * GDPR design notes:
 * - This function ALWAYS derives the `userId` from the authoritative server-side
 *   `user` object (i.e. `req.authUser`) and must never trust a client-supplied
 *   user identifier. This provides non-repudiable evidence that the authenticated
 *   user accepted a given document version.
 * - The record is append-only: callers must create new acceptance records when a
 *   document version changes. Prior records are preserved for audit and legal
 *   evidence. Records are not updated in-place.
 * - We only store `documentVersion` (identifier or content hash), not raw legal
 *   text. The canonical legal texts should be stored and versioned separately
 *   (e.g., in a docs repository or object storage) and mapped by `documentVersion`.
 * - Minimal `meta` can be stored but MUST avoid personal data (no tokens, no PII).
 */
async function recordAcceptance({ user, documentType, documentVersion, acceptanceContext='unknown', meta = {}, ip = null, userAgent = null }){
  if (!user || !user._id) throw new Error('Invalid user');
  if (!documentType || !documentVersion) throw new Error('documentType and documentVersion required');
  // allow future expansion but validate common known types
  if (typeof documentType === 'string' && !ALLOWED_DOCUMENT_TYPES.has(documentType)) {
    // Accept unknown types but trim to safe length
    documentType = String(documentType).slice(0,64);
  }

  // Enrich meta with technical context for GDPR evidence
  const enrichedMeta = {
    ...meta,
    ip: ip || meta.ip || 'unknown',
    userAgent: userAgent || meta.userAgent || 'unknown',
    recordedAt: new Date()
  };

  // Ensure acceptedAt is set explicitly to avoid N/A in dashboard
  const acceptedAt = new Date();


  const rec = await LegalAcceptance.create({
    userId: user._id,
    documentType,
    documentVersion: String(documentVersion).slice(0,256),
    acceptedAt: acceptedAt,
    acceptanceContext: String(acceptanceContext).slice(0,128),
    meta: enrichedMeta
  });


  // Audit the acceptance (append-only audit). Avoid logging PII or tokens.
  try {
    await recordAudit({ 
      actorId: user._id, 
      actorRole: user.role || null, 
      action: 'LEGAL_ACCEPTANCE', 
      targetUserId: user._id, 
      details: { documentType, documentVersion, acceptanceContext, ip: enrichedMeta.ip, userAgent: enrichedMeta.userAgent }, 
      ip: enrichedMeta.ip, 
      userAgent: enrichedMeta.userAgent 
    });
  } catch (e) { console.warn('recordAcceptance audit failed', e); }

  return rec;
}

async function getAcceptancesForUser(userId, { page=1, limit=100 } = {}){
  const skip = Math.max(0, page-1) * Math.min(1000, limit);
  return LegalAcceptance.find({ userId }).sort({ acceptedAt: -1 }).skip(skip).limit(Math.min(limit,1000)).lean();
}

module.exports = { recordAcceptance, getAcceptancesForUser };
