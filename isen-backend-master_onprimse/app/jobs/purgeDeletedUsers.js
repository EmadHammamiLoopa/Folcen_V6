module.exports = function(agenda){
  const DATA_RETENTION_DAYS = parseInt(process.env.DATA_RETENTION_DAYS || '30');
  const ACCEPTANCE_RETENTION_DAYS = parseInt(process.env.ACCEPTANCE_RETENTION_DAYS || String(DATA_RETENTION_DAYS));
  const mongoose = require('mongoose');
  const User = require('../models/User');
  const LegalAcceptance = require('../models/LegalAcceptance');
  const { recordAudit } = require('../utils/audit');

  agenda.define('purge-deleted-users', async job => {
    const now = new Date();
    const DATA_RETENTION_DAYS = parseInt(process.env.DATA_RETENTION_DAYS || '30');
    const cutoff = new Date(now.getTime() - DATA_RETENTION_DAYS * 24 * 3600 * 1000);
    
    try {
      // Find users where purgeAt is reached, or deletedAt is older than retention window
      const toPurge = await User.find({ 
        isDeleted: true, 
        $or: [
          { purgeAt: { $lte: now } },
          { purgeAt: null, deletedAt: { $lte: cutoff } }
        ]
      }).select('_id').lean();

      const { purgeUser } = require('../helpers');

      for (const u of toPurge) {
        try {
          await purgeUser(u._id);
          await recordAudit({ actorId: null, actorRole: null, action: 'PURGE_USER', targetUserId: u._id, details: { reason: 'retention_expired' }, ip: null, userAgent: null });
        } catch (e) {
          console.error('Failed to purge user', u._id, e);
        }
      }
    } catch (e) {
      console.error('purge-deleted-users job failed', e);
    }
    try {
      // Purge call events and message events that expired and are not linked to reports
      const CallEvent = require('../models/CallEvent');
      const MessageEvent = require('../models/MessageEvent');
      const deletedCalls = await CallEvent.deleteMany({
        expiresAt: { $lte: now },
        linkedReport: null
      });

      const deletedMsgEvents = await MessageEvent.deleteMany({
        expiresAt: { $lte: now },
        linkedReport: null
      });
      if ((deletedCalls && deletedCalls.deletedCount) || (deletedMsgEvents && deletedMsgEvents.deletedCount)) {
        await recordAudit({ actorId: null, actorRole: null, action: 'PURGE_EVENTS', targetUserId: null, details: { deletedCalls: deletedCalls.deletedCount, deletedMsgEvents: deletedMsgEvents.deletedCount }, ip: null, userAgent: null });
      }
    } catch (e) {
      console.error('Failed to purge event logs', e);
    }
  });

  // Run daily at 03:00 UTC
  (async function(){
    try {
      await agenda.start();
      await agenda.every('24 hours', 'purge-deleted-users', {}, { skipImmediate: true });
    } catch (e) {
      console.error('Agenda purge job scheduling failed', e);
    }
  })();
};
