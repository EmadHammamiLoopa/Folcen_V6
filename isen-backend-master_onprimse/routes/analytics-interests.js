/*
 * routes/analytics-interests.js
 * Mounts under /api/v1/analytics
 */
const express = require('express');
const router = express.Router();
const { requireSignin, withAuthUser, isAdmin } = require('../app/middlewares/auth');
const rateLimit = require('express-rate-limit');
const ctrl = require('../app/controllers/InterestAnalyticsController');

const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many analytics requests',
});

/* GET /api/v1/analytics/interests  — aggregated dashboard view (admin) */
router.get('/interests', [requireSignin, withAuthUser, isAdmin], analyticsLimiter, ctrl.aggregatedInterests);

/* GET /api/v1/analytics/interest-explainer/:userId — per-user explainability (admin) */
router.get('/interest-explainer/:userId', [requireSignin, withAuthUser, isAdmin], analyticsLimiter, ctrl.interestExplainer);

/* POST /api/v1/analytics/record-event — client-side event recording (self, consent-gated) */
router.post('/record-event', [requireSignin], analyticsLimiter, ctrl.recordEvent);

module.exports = router;
