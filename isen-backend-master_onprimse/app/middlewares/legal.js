const { getAcceptancesForUser } = require('../utils/legalAccept');
const Response = require('../controllers/Response');

/**
 * Middleware to enforce legal document acceptance.
 * @param {Array<{type: string, versionEnvVar: string, acceptanceField?: string}>} requirements
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

            // Explicit feature-specific legal acceptance must be tied to the
            // document the user actually reviewed. A generic acceptedTerms
            // signal is preserved only for legacy routes that have no
            // per-document acceptance fields configured.
            const readAcceptanceValue = (field) => {
                let value;

                if (
                    req.body &&
                    Object.prototype.hasOwnProperty.call(req.body, field)
                ) {
                    value = req.body[field];
                } else if (
                    req.fields &&
                    Object.prototype.hasOwnProperty.call(req.fields, field)
                ) {
                    value = req.fields[field];
                }

                return Array.isArray(value)
                    ? value[0]
                    : value;
            };

            const isAffirmativeAcceptance = (value) => (
                value === true ||
                value === 'true' ||
                value === 'on'
            );

            const acceptedTerms =
                readAcceptanceValue('acceptedTerms');

            const explicitRequirements =
                requirements.filter(
                    reqmt => !!reqmt.acceptanceField
                );

            const requirementsToRecord =
                explicitRequirements.length > 0
                    ? explicitRequirements.filter(
                        reqmt =>
                            isAffirmativeAcceptance(
                                readAcceptanceValue(
                                    reqmt.acceptanceField
                                )
                            )
                    )
                    : (
                        isAffirmativeAcceptance(
                            acceptedTerms
                        )
                            ? requirements
                            : []
                    );

            if (requirementsToRecord.length > 0) {
                try {
                    const {
                        recordAcceptance
                    } = require('../utils/legalAccept');

                    for (
                        const reqmt of requirementsToRecord
                    ) {
                        const requiredVersion =
                            process.env[
                                reqmt.versionEnvVar
                            ] || '1.0.0';

                        await recordAcceptance({
                            user:
                                req.authUser ||
                                req.auth,
                            documentType:
                                reqmt.type,
                            documentVersion:
                                requiredVersion,
                            acceptanceContext:
                                reqmt.acceptanceField
                                    ? 'explicit_feature_acceptance'
                                    : 'legacy_middleware_auto_record',
                            meta: {
                                clientType:
                                    'mobile_app',
                                route:
                                    req.originalUrl,
                                method:
                                    req.method,
                                acceptanceField:
                                    reqmt.acceptanceField ||
                                    'acceptedTerms'
                            },
                            ip:
                                req.ip,
                            userAgent:
                                req.get('User-Agent')
                        });
                    }
                } catch (recordErr) {
                    console.error(
                        'Failed to record legal acceptance in middleware:',
                        recordErr
                    );
                    // Continue to existing-acceptance verification.
                }
            }

            // Fetch recent acceptances for the user
            const acceptances = await getAcceptancesForUser(userId, { page: 1, limit: 100 });
            const missing = [];
            const versions = {};

            for (const reqmt of requirements) {
                const requiredVersion = process.env[reqmt.versionEnvVar] || '1.0.0';
                versions[reqmt.type] = requiredVersion;

                const directAccepted = acceptances.some(a =>
                    a.documentType === reqmt.type &&
                    a.documentVersion === requiredVersion
                );

                // Compatibility bridge for users whose signup recorded the
                // historical combined terms_and_privacy document. This does
                // not create a new acceptance; it only recognizes the old
                // evidence when its version matches the current Terms version.
                const legacyCombinedVersion =
                    process.env.TERMS_VERSION ||
                    '1.0.0';

                const legacyCombinedAccepted = (
                    (
                        reqmt.type === 'terms_and_conditions' ||
                        reqmt.type === 'privacy_policy'
                    ) &&
                    requiredVersion === legacyCombinedVersion &&
                    acceptances.some(a =>
                        a.documentType === 'terms_and_privacy' &&
                        a.documentVersion === legacyCombinedVersion
                    )
                );

                const hasAccepted =
                    directAccepted ||
                    legacyCombinedAccepted;

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
