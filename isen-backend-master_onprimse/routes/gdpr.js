const express = require('express');
const router = express.Router();
const GdprController = require('../app/controllers/GdprController');
const { rectifySchema } = require('../app/middlewares/validators');
const { requireSignin, withAuthUser, isAdmin } = require('../app/middlewares/auth');
const rateLimit = require('express-rate-limit');
const { recordAcceptance, getAcceptancesForUser } = require('../app/utils/legalAccept');
const { recordAudit } = require('../app/utils/audit');
const logger = require('../app/utils/logger');

// Get current versions of legal documents
router.get('/versions', (req, res) => {
	// In a production system, these might be fetched from a DB or CMS.
	// For now, we return the current active versions.
	return res.json({
		success: true,
		data: {
			terms: { version: process.env.TERMS_VERSION || '1.0.0', updatedAt: '2024-01-01T00:00:00Z' },
			privacy: { version: process.env.PRIVACY_VERSION || '1.0.0', updatedAt: '2024-01-01T00:00:00Z' },
			channels_disclaimer: { version: '1.0.0', updatedAt: '2024-01-01T00:00:00Z' },
			products_disclaimer: { version: '1.0.0', updatedAt: '2024-01-01T00:00:00Z' },
			services_disclaimer: { version: '1.0.0', updatedAt: '2024-01-01T00:00:00Z' },
			jobs_disclaimer: { version: '1.0.0', updatedAt: '2024-01-01T00:00:00Z' }
		}
	});
});

// Check if user has accepted latest versions
router.get('/acceptance/check', requireSignin, withAuthUser, async (req, res) => {
	try {
		const userId = req.authUser._id;
		const acceptances = await getAcceptancesForUser(userId, { page: 1, limit: 100 });
		
		const requirements = [
			{ type: 'terms', version: process.env.TERMS_VERSION || '1.0.0' },
			{ type: 'privacy', version: process.env.PRIVACY_VERSION || '1.0.0' }
		];

		const missing = requirements.filter(reqmt => 
			!acceptances.some(a => a.documentType === reqmt.type && a.documentVersion === reqmt.version)
		);

		return res.json({
			success: true,
			data: {
				accepted: missing.length === 0,
				missing: missing
			}
		});
	} catch (e) {
		logger.error('check acceptance error', e);
		return res.status(500).json({ success: false, message: 'Server error' });
	}
});

// User acceptance endpoint (append-only). Relies on req.authUser — never trust client userId.
router.post('/acceptance', requireSignin, withAuthUser, rateLimit({ windowMs: 60*1000, max: 20 }), async (req, res) => {
	try {
		const user = req.authUser;
		const { documentType, documentVersion, acceptanceContext, meta } = req.body || {};
		if (!documentType || !documentVersion) return res.status(400).json({ success: false, message: 'documentType and documentVersion required' });
		const rec = await recordAcceptance({ 
			user, 
			documentType, 
			documentVersion, 
			acceptanceContext, 
			meta,
			ip: req.ip,
			userAgent: req.get('User-Agent')
		});
		return res.json({ success: true, data: { id: rec._id, documentType: rec.documentType, documentVersion: rec.documentVersion, acceptedAt: rec.acceptedAt, acceptanceContext: rec.acceptanceContext } });
	} catch (e) {
		logger.error('acceptance endpoint error', e);
		return res.status(500).json({ success: false, message: 'Server error' });
	}
});

// Dashboard: admin can retrieve a user's acceptance history (read-only, sanitized)
router.get('/acceptances', requireSignin, withAuthUser, isAdmin, rateLimit({ windowMs: 60*1000, max: 30 }), async (req, res) => {
	try {
		const qUserId = req.query.userId;
		if (!qUserId) return res.status(400).json({ success: false, message: 'userId required' });
		const page = parseInt(req.query.page || '1');
		const limit = parseInt(req.query.limit || '100');
		const rows = await getAcceptancesForUser(qUserId, { page, limit });
		// Return only metadata fields
		const safe = rows.map(r => {
			// Fallback for date: acceptedAt -> createdAt -> updatedAt -> ObjectId timestamp
			let rawDate = r.acceptedAt || r.createdAt || r.updatedAt;
			
			// Robust ObjectId timestamp extraction
			if (!rawDate && r._id) {
				try {
					const idStr = r._id.toString();
					if (idStr.length === 24) {
						rawDate = new Date(parseInt(idStr.substring(0, 8), 16) * 1000);
					}
				} catch (e) {
					logger.warn('Failed to extract timestamp from _id', e);
				}
			}

			// Ensure we have a valid date string
			const acceptedAt = (rawDate instanceof Date ? rawDate : new Date(rawDate || Date.now())).toISOString();

			const meta = r.meta || {};
			return { 
				_id: r._id,
				documentType: r.documentType, 
				documentVersion: r.documentVersion, 
				acceptedAt: acceptedAt, 
				acceptanceContext: r.acceptanceContext || 'unknown',
				meta: {
					ip: meta.ip || 'Legacy Record (IP not captured)',
					userAgent: meta.userAgent || 'Legacy Record (UA not captured)',
					clientType: meta.clientType || 'mobile_app'
				}
			};
		});
		logger.info('DEBUG: GDPR acceptances for user', qUserId, JSON.stringify(safe, null, 2));

		// Audit the admin/dashboard retrieval (do not include PII in audit meta)
		try { await recordAudit({ actorId: req.auth && req.auth._id, actorRole: req.auth && req.auth.role, action: 'DASHBOARD_VIEW_ACCEPTANCES', targetUserId: qUserId, details: { reason: 'Admin viewed legal acceptance history', count: safe.length } }); } catch (e) {}
		return res.json({ success: true, data: safe });
	} catch (e) {
		logger.error('acceptances list error', e);
		return res.status(500).json({ success: false, message: 'Server error' });
	}
});

const dsarLimiter = rateLimit({ windowMs: 60*1000, max: 10, message: 'Too many DSAR requests, slow down' });

// Admin: list recent non-content events (calls/messages) for investigations
router.get('/events', requireSignin, withAuthUser, isAdmin, rateLimit({ windowMs: 60*1000, max: 60 }), async (req, res) => {
	try {
		const CallEvent = require('../app/models/CallEvent');
		const MessageEvent = require('../app/models/MessageEvent');
		const limit = Math.min(200, parseInt(req.query.limit || '100'));
		const calls = await CallEvent.find().sort({ createdAt: -1 }).limit(limit).lean();
		const msgs  = await MessageEvent.find().sort({ createdAt: -1 }).limit(limit).lean();
		await recordAudit({ actorId: req.auth && req.auth._id, actorRole: req.auth && req.auth.role, action: 'DASHBOARD_VIEW_EVENTS', targetUserId: null, details: { calls: calls.length, messageEvents: msgs.length } });
		return res.json({ success: true, data: { calls, messageEvents: msgs } });
	} catch (e) {
		logger.error('events list error', e);
		return res.status(500).json({ success: false, message: 'Server error' });
	}
});

// Record a new acceptance (delegates to the /acceptance POST route above)
// Note: GdprController.accept is not defined; use /acceptance instead.

// Right of access (self; admins may target another user after controller authorization)
router.get('/access', [requireSignin, withAuthUser, dsarLimiter], GdprController.access);

// Portability / data export (self; admins may target another user after controller authorization)
router.get('/portability', [requireSignin, withAuthUser, dsarLimiter], GdprController.portability);

// Right to erasure (self-service; cross-user erasure remains controller-authorized admin only)
router.post('/erase', [requireSignin, withAuthUser, dsarLimiter], GdprController.erase);

// Erase preview (admin only — counts data before erasure)
router.get('/erase-preview', [requireSignin, withAuthUser, isAdmin, dsarLimiter], GdprController.erasePreview);

// Rectification — accept both POST (legacy) and PUT (dashboard)
router.post('/rectify', [requireSignin, withAuthUser, rectifySchema, dsarLimiter], GdprController.rectify);
router.put('/rectify/:userId', [requireSignin, withAuthUser, isAdmin, dsarLimiter], GdprController.rectify);

// Anonymize author (admin only)
router.post('/anonymize-author', [requireSignin, withAuthUser, isAdmin, dsarLimiter], GdprController.anonymizeAuthor);

// Consent status (self-service; controller authorizes explicit cross-user admin lookup)
router.get('/consent-status', [requireSignin, withAuthUser, dsarLimiter], GdprController.consentStatus);

// Update optional consent choice (self-service; explicit cross-user targets remain controller-authorized)
router.put('/consent', [requireSignin, withAuthUser, dsarLimiter], GdprController.updateConsent);

// Consent history
router.get('/consents', requireSignin, withAuthUser, dsarLimiter, GdprController.consentHistory);

// Dashboard: admin can retrieve a user's audit log
router.get('/audit-logs', requireSignin, withAuthUser, isAdmin, rateLimit({ windowMs: 60*1000, max: 30 }), GdprController.auditLogs);

module.exports = router;
