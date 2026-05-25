/*
 * app/jobs/recomputeInterestProfiles.js
 * Runs nightly — recomputes UserInterestProfile for all consented users from AnalyticsEvent.
 */
const InterestAnalyticsCtrl = require('../controllers/InterestAnalyticsController');

module.exports = function (agenda) {
  agenda.define('recompute interest profiles', async (job) => {
    try {
      console.log('[Job] recompute interest profiles — start');
      const count = await InterestAnalyticsCtrl.recomputeInterestProfiles();
      console.log(`[Job] recompute interest profiles — done (${count} profiles updated)`);
    } catch (e) {
      console.error('[Job] recompute interest profiles — failed', e.message);
    }
  });

  // Run at 04:00 UTC daily (after purgeDeletedUsers at 03:00)
  const cron = process.env.INTEREST_RECOMPUTE_CRON || '0 4 * * *';
  agenda.every(cron, 'recompute interest profiles');
};
