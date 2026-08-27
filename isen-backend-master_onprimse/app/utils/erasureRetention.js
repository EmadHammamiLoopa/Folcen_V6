'use strict';

const AuditLog =
  require('../models/AuditLog');

const AuthEvent =
  require('../models/AuthEvent');

const CallEvent =
  require('../models/CallEvent');

const MessageEvent =
  require('../models/MessageEvent');

const Blacklist =
  require('../models/Blacklist');


async function safeCount(
  model,
  filter
) {

  try {

    return await model.countDocuments(
      filter
    );

  } catch (
    error
  ) {

    console.warn(
      '[GDPR Erasure] Retention assessment count failed:',
      model && model.modelName,
      error.message
    );

    return 0;
  }
}


/**
 * Build the current Article 17 retention/exception assessment.
 *
 * This is deliberately separate from ordinary account closure.
 *
 * The presence of a category here does NOT mean that Folcen may retain it
 * forever. It means the category survives operational purge because it may
 * still be required for a narrowly defined security, accountability,
 * abuse-prevention, or legal-claims purpose.
 *
 * Each category must still have:
 *   - a finite retention rule,
 *   - minimization where possible,
 *   - and later review under the B2 retention controls.
 *
 * Article 17 exceptions are assessed narrowly. In particular, Article
 * 17(3)(e) may permit retention only where necessary for the establishment,
 * exercise or defence of legal claims.
 */
async function buildErasureRetentionPlan(
  userId
) {

  const normalizedUserId =
    String(
      userId || ''
    );


  const [
    auditCount,
    authCount,
    callCount,
    messageCount,
    blacklistCount
  ] =
    await Promise.all([

      safeCount(
        AuditLog,
        {
          $or: [
            {
              actorId:
                userId
            },
            {
              targetUserId:
                userId
            }
          ]
        }
      ),

      safeCount(
        AuthEvent,
        {
          user:
            userId
        }
      ),

      safeCount(
        CallEvent,
        {
          $or: [
            {
              initiatedBy:
                userId
            },
            {
              participants:
                userId
            }
          ]
        }
      ),

      safeCount(
        MessageEvent,
        {
          $or: [
            {
              from:
                userId
            },
            {
              to:
                userId
            }
          ]
        }
      ),

      safeCount(
        Blacklist,
        {
          itemType:
            'user',

          itemValue:
            normalizedUserId,

          retainOnErasure:
            true,

          retentionDate: {
            $gt:
              new Date()
          },

          retentionReason: {
            $nin: [
              null,
              ''
            ]
          }
        }
      )
    ]);


  const retainedCategories = [];


  function addCategory({
    category,
    count,
    retentionReason,
    exception
  }) {

    if (
      !count
    ) {
      return;
    }


    retainedCategories.push({
      category,
      count,
      retentionReason,
      exception,
      requiresFiniteRetention:
        true,

      requiresReview:
        true
    });
  }


  addCategory({
    category:
      'audit_logs',

    count:
      auditCount,

    retentionReason:
      'Limited accountability, security and legal-claims evidence may remain temporarily subject to finite retention and identity minimization.',

    exception:
      'Article 17(3)(e) where retention is necessary for legal claims; other lawful obligations require case-specific assessment.'
  });


  addCategory({
    category:
      'authentication_security_events',

    count:
      authCount,

    retentionReason:
      'Minimal authentication-security evidence may remain temporarily for account security, abuse investigation and legal claims.',

    exception:
      'Article 17(3) exception only where the continued retention is necessary and proportionate.'
  });


  addCategory({
    category:
      'call_safety_events',

    count:
      callCount,

    retentionReason:
      'Minimal non-content call safety metadata may remain for its finite safety period or while required by an active report or legal claim.',

    exception:
      'Article 17(3)(e) where necessary for legal claims or protection of the rights of others.'
  });


  addCategory({
    category:
      'message_safety_events',

    count:
      messageCount,

    retentionReason:
      'Minimal non-content messaging safety metadata may remain for its finite safety period or while required by an active report or legal claim.',

    exception:
      'Article 17(3)(e) where necessary for legal claims or protection of the rights of others.'
  });


  addCategory({
    category:
      'security_blacklist_records',

    count:
      blacklistCount,

    retentionReason:
      'A narrowly scoped abuse-prevention record may remain only while necessary for platform and user security and must be reviewed.',

    exception:
      'Continued retention requires a case-specific necessity assessment and may not be indefinite.'
  });


  const retentionReason =
    retainedCategories.length
      ? 'Some minimal records are not part of ordinary account data and may be retained temporarily only where a GDPR Article 17(3) exception or another applicable legal requirement justifies continued processing.'
      : null;


  return {
    article17:
      true,

    exceptionAssessment:
      {
        performed:
          true,

        exceptionsConsidered: [
          'Article 17(3)(b) — compliance with a legal obligation where applicable',
          'Article 17(3)(e) — establishment, exercise or defence of legal claims'
        ],

        caseSpecific:
          true
      },

    retainedCategories,

    retentionReason
  };
}


/**
 * Minimize direct identifiers in retained audit evidence after permanent
 * Article 17 erasure.
 *
 * We intentionally use separate updates:
 * - actorId match: remove only the erased actor identity + that actor's
 *   technical IP/User-Agent metadata.
 * - targetUserId match: remove only the erased target identity.
 *
 * This prevents erasure of unrelated people's references from the same
 * audit record.
 */
async function minimizeRetainedErasureEvidence(
  userId
) {
  const minimizedAt =
    new Date();


  const normalizedUserId =
    String(
      userId || ''
    );


  const actorResult =
    await AuditLog.updateMany(
      {
        actorId:
          userId
      },
      {
        $set: {
          'meta.erasureMinimized':
            true,

          'meta.erasureMinimizedAt':
            minimizedAt
        },

        $unset: {
          actorId:
            1,

          ip:
            1,

          userAgent:
            1,

          'meta.ip':
            1,

          'meta.userAgent':
            1,

          'meta.userId':
            1,

          'meta.actorId':
            1
        }
      }
    );


  const targetResult =
    await AuditLog.updateMany(
      {
        targetUserId:
          userId
      },
      {
        $set: {
          'meta.erasureMinimized':
            true,

          'meta.erasureMinimizedAt':
            minimizedAt
        },

        $unset: {
          targetUserId:
            1,

          'meta.targetUserId':
            1
        }
      }
    );


  /*
   * User-identifying blacklist records are personal data too.
   *
   * Default Article 17 treatment:
   * - remove the erased user's creator reference from surviving rules;
   * - delete a direct user blacklist entry unless an explicit finite,
   *   documented retainOnErasure exception exists;
   * - retained exceptions are scheduled for a fresh necessity review.
   */
  const blacklistCreatorResult =
    await Blacklist.updateMany(
      {
        createdBy:
          userId
      },
      {
        $unset: {
          createdBy:
            1
        }
      }
    );


  const blacklistDeleteResult =
    await Blacklist.deleteMany(
      {
        itemType:
          'user',

        itemValue:
          normalizedUserId,

        $or: [
          {
            retainOnErasure: {
              $ne:
                true
            }
          },
          {
            retentionDate: {
              $exists:
                false
            }
          },
          {
            retentionDate: {
              $lte:
                minimizedAt
            }
          },
          {
            retentionReason: {
              $in: [
                null,
                ''
              ]
            }
          }
        ]
      }
    );


  const blacklistReviewDays =
    Math.max(
      1,
      Number(
        process.env.BLACKLIST_REVIEW_DAYS ||
        90
      )
    );


  const nextBlacklistReviewAt =
    new Date(
      minimizedAt.getTime() +
      blacklistReviewDays *
      24 *
      60 *
      60 *
      1000
    );


  const blacklistRetainedResult =
    await Blacklist.updateMany(
      {
        itemType:
          'user',

        itemValue:
          normalizedUserId,

        retainOnErasure:
          true,

        retentionDate: {
          $gt:
            minimizedAt
        },

        retentionReason: {
          $nin: [
            null,
            ''
          ]
        }
      },
      {
        $set: {
          reviewAt:
            nextBlacklistReviewAt
        }
      }
    );


  return {
    actorRecordsMinimized:
      actorResult.modifiedCount || 0,

    targetRecordsMinimized:
      targetResult.modifiedCount || 0,

    blacklistCreatorReferencesMinimized:
      blacklistCreatorResult.modifiedCount || 0,

    blacklistRecordsErased:
      blacklistDeleteResult.deletedCount || 0,

    blacklistRecordsRetainedForReview:
      blacklistRetainedResult.modifiedCount || 0
  };
}


module.exports = {
  buildErasureRetentionPlan,
  minimizeRetainedErasureEvidence
};
