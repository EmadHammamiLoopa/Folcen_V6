const { getAcceptancesForUser } = require('../utils/legalAccept');
const Response = require('../controllers/Response');

/**
 * Middleware to enforce legal document acceptance.
 * @param {Array<{type: string, versionEnvVar: string}>} requirements 
 */
exports.requireLegalAcceptance = (requirements) => {
    return async (req, res, next) => {
        try {
            // Bypass check for development or if explicitly disabled
            if (process.env.DISABLE_LEGAL_CHECK === 'true') {
                return next();
            }

            // Bypass for admins (often seeded or system users)
            if (req.auth && (req.auth.role === 'ADMIN' || req.auth.role === 'SUPER ADMIN' || req.auth.role === 'SUPER_ADMIN')) {
                return next();
            }

            const userId = req.auth && req.auth._id;
            if (!userId) return Response.sendError(res, 401, 'Unauthorized');

            // If the user is providing acceptance in the request body or fields (formidable), record it and proceed
            const acceptedTerms = (req.body && req.body.acceptedTerms) || (req.fields && req.fields.acceptedTerms);
            console.log(`DEBUG: Legal check for user ${userId}. acceptedTerms in body/fields:`, acceptedTerms);
            
            if (acceptedTerms === 'true' || acceptedTerms === true || (req.body && req.body.acceptedTerms === 'on')) {
                try {
                    const { recordAcceptance } = require('../utils/legalAccept');
                    console.log(`DEBUG: Recording ${requirements.length} requirements for user ${userId}`);
                    for (const reqmt of requirements) {
                        const requiredVersion = process.env[reqmt.versionEnvVar] || '1.0.0';
                        await recordAcceptance({
                            user: req.authUser || req.auth,
                            documentType: reqmt.type,
                            documentVersion: requiredVersion,
                            acceptanceContext: 'middleware_auto_record',
                            meta: { clientType: 'mobile_app', route: req.originalUrl, method: req.method },
                            ip: req.ip,
                            userAgent: req.get('User-Agent')
                        });
                    }
                    console.log(`✅ Legal acceptances auto-recorded for user ${userId} via request body/fields`);
                    return next();
                } catch (recordErr) {
                    console.error('Failed to auto-record legal acceptance in middleware:', recordErr);
                    // Continue to check existing acceptances if recording fails
                }
            }

            // Fetch recent acceptances for the user
            const acceptances = await getAcceptancesForUser(userId, { page: 1, limit: 100 });
            const missing = [];
            const versions = {};

            for (const reqmt of requirements) {
                const requiredVersion = process.env[reqmt.versionEnvVar] || '1.0.0';
                versions[reqmt.type] = requiredVersion;

                const hasAccepted = acceptances.some(a => 
                    a.documentType === reqmt.type && 
                    a.documentVersion === requiredVersion
                );

                if (!hasAccepted) {
                    missing.push({
                        type: reqmt.type,
                        version: requiredVersion
                    });
                }
            }

            if (missing.length > 0) {
                // Return 403 with the specific structure requested
                return res.status(403).json({
                    success: false,
                    errorCode: 'LEGAL_ACCEPTANCE_REQUIRED',
                    message: `Legal acceptance required for: ${missing.map(m => m.type).join(', ')}`,
                    required: missing,
                    versions: versions
                });
            }

            next();
        } catch (error) {
            console.error('Legal acceptance check failed:', error);
            // Fallback to a generic error if something goes wrong
            return Response.sendError(res, 500, 'Internal server error during legal check');
        }
    };
};

/**
 * Global middleware for basic Terms and Privacy check.
 */
exports.requireLatestTermsPrivacy = exports.requireLegalAcceptance([
    { type: 'terms_and_conditions', versionEnvVar: 'TERMS_VERSION' },
    { type: 'privacy_policy', versionEnvVar: 'PRIVACY_VERSION' }
]);
