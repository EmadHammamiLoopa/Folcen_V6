/**
 * eventLogger
 * Helper to write minimal, privacy-first events (call events, message events)
 * and to attach them to audit/report records when necessary.
 */
const CallEvent = require('../models/CallEvent');
const MessageEvent = require('../models/MessageEvent');
const Report = require('../models/Report');
const { recordAudit } = require('./audit');
const { v4: uuidv4 } = require('uuid');

async function createCallRequest({ initiatedBy, participants = [], initialEvent = 'requested' }) {
  const callId = `call_${uuidv4()}`;
  const evt = new CallEvent({ callId, initiatedBy, participants: participants.map(p => p), lifecycle: [{ event: initialEvent }] });
  await evt.save();
  // record audit linking the creation (append-only)
  try { await recordAudit({ action: 'call.request', actorId: initiatedBy, details: { callId } }); } catch (e) { }
  return evt;
}

async function appendCallLifecycle(callId, { event, at = new Date(), durationSeconds = null }) {
  const evt = await CallEvent.findOne({ callId });
  if (!evt) return null;
  evt.lifecycle.push({ event, at, durationSeconds });
  return await evt.save();
}

async function recordMessageEvent({ messageId = null, from, to, event, reason = null, linkedReport = null }) {
  const me = new MessageEvent({ messageId, from, to, event, reason, linkedReport });
  await me.save();
  try { await recordAudit({ action: `message.${event}`, actorId: from, targetUserId: to, details: { messageId } }); } catch (e) {}
  return me;
}

async function createReport({ reporter, targetType, targetId, reasonCode, reasonText = null, reportType = 'Other', severity = 'medium', consentGiven = false, isAnonymous = false, photoUrl = null }) {
  const entityModel = targetType.charAt(0).toUpperCase() + targetType.slice(1);
  const r = new Report({ 
    reporter, 
    entity: targetId, 
    entityModel: entityModel, 
    photoUrl,
    reasonCode, 
    message: reasonText,
    reportType,
    severity,
    consentGiven,
    isAnonymous,
    retentionDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  });
  await r.save();
  try { await recordAudit({ action: 'report.created', actorId: reporter, details: { targetType, targetId, reportId: r._id } }); } catch (e) {}

  // --- Automatic Banning Logic ---
  try {
    const mongoose = require('mongoose');
    const User = mongoose.model('User');
    let targetUserId = null;

    if (entityModel === 'User') {
      targetUserId = targetId;
    } else {
      const model = mongoose.model(entityModel);
      const entity = await model.findById(targetId);
      if (entity) {
        targetUserId = entity.user || entity.author || entity.owner || entity.creator || entity.userId;
      }
    }

    if (targetUserId) {
      // Count reports for this user in the last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      // We need to find all reports where the entity is the user OR the entity belongs to the user
      // This is a bit complex because we'd need to check every reported entity's owner.
      // For simplicity, let's just count reports where the entity is the User directly for now,
      // or we can store the targetUserId in the Report model to make this easier.
      
      // Better: Let's just count how many reports this user has received in total (open ones)
      const reportCount = await Report.countDocuments({ 
        $or: [
          { entity: targetUserId, entityModel: 'User' },
          // This part is hard without targetUserId in Report. 
          // Let's just stick to direct user reports for auto-ban or implement targetUserId in Report.
        ],
        status: 'open',
        createdAt: { $gte: oneDayAgo }
      });

      if (reportCount >= 5) { // Threshold for auto-ban
        await User.findByIdAndUpdate(targetUserId, {
          banned: true,
          banUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h auto-ban
          bannedReason: 'Automatic ban due to multiple reports within 24 hours.'
        });
        console.log(`[Auto-Ban] User ${targetUserId} banned due to ${reportCount} reports.`);
      }
    }
  } catch (err) {
    console.error('[Auto-Ban] Error:', err.message);
  }

  return r;
}

module.exports = { createCallRequest, appendCallLifecycle, recordMessageEvent, createReport };
