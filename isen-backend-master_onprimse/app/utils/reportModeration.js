'use strict';

const Report =
  require('../models/Report');

const REPORT_RETENTION_DAYS =
  Math.max(
    1,
    Number(
      process.env.REPORT_RETENTION_DAYS ||
      365
    )
  );

/**
 * Close active reports for one entity without destroying moderation evidence.
 *
 * "Clear reports" in the dashboard means:
 *   - remove the reports from the entity's active moderation queue;
 *   - dismiss still-open cases;
 *   - start the configured finite retention period.
 *
 * Closed reports remain in the Report collection until their normal TTL.
 */
async function dismissEntityReports({
  entityId,
  entityModel,
  moderatorNote =
    'Cleared from entity moderation queue'
}) {
  if (
    !entityId ||
    !entityModel
  ) {
    throw new Error(
      'entityId and entityModel are required'
    );
  }

  const now =
    new Date();

  const retentionDate =
    new Date(
      now.getTime() +
      REPORT_RETENTION_DAYS *
      24 *
      60 *
      60 *
      1000
    );

  const result =
    await Report.updateMany(
      {
        entity:
          entityId,

        entityModel,

        status: {
          $in: [
            'open',
            'under_review'
          ]
        }
      },
      {
        $set: {
          status:
            'dismissed',

          resolutionAction:
            'No Action',

          moderatorNotes:
            moderatorNote,

          resolvedAt:
            now,

          retentionDate,

          updatedAt:
            now
        }
      }
    );

  const matchedReports =
    result.matchedCount !== undefined
      ? result.matchedCount
      : (
          result.n !== undefined
            ? result.n
            : 0
        );

  const dismissedReports =
    result.modifiedCount !== undefined
      ? result.modifiedCount
      : (
          result.nModified !== undefined
            ? result.nModified
            : 0
        );

  return {
    matchedReports,
    dismissedReports,
    resolvedAt:
      now,
    retentionDate
  };
}

/**
 * Resolve active moderation reports when the referenced content is actually
 * removed. Historical closed cases are intentionally left unchanged so their
 * original resolution and retention schedule remain authoritative.
 */
async function resolveEntityReports({
  entityId,
  entityIds,
  entityModel,
  moderatorNote =
    'Referenced content removed'
}) {
  const ids =
    [
      ...(
        Array.isArray(entityIds)
          ? entityIds
          : []
      ),
      ...(
        entityId
          ? [entityId]
          : []
      )
    ]
      .filter(Boolean);

  if (
    ids.length === 0 ||
    !entityModel
  ) {
    return {
      matchedReports: 0,
      resolvedReports: 0,
      resolvedAt: null,
      retentionDate: null
    };
  }

  const now =
    new Date();

  const retentionDate =
    new Date(
      now.getTime() +
      REPORT_RETENTION_DAYS *
      24 *
      60 *
      60 *
      1000
    );

  const result =
    await Report.updateMany(
      {
        entity:
          ids.length === 1
            ? ids[0]
            : {
                $in: ids
              },

        entityModel,

        status: {
          $in: [
            'open',
            'under_review'
          ]
        }
      },
      {
        $set: {
          status:
            'resolved',

          resolutionAction:
            'Content Removed',

          moderatorNotes:
            moderatorNote,

          resolvedAt:
            now,

          retentionDate,

          updatedAt:
            now
        }
      }
    );

  const matchedReports =
    result.matchedCount !== undefined
      ? result.matchedCount
      : (
          result.n !== undefined
            ? result.n
            : 0
        );

  const resolvedReports =
    result.modifiedCount !== undefined
      ? result.modifiedCount
      : (
          result.nModified !== undefined
            ? result.nModified
            : 0
        );

  return {
    matchedReports,
    resolvedReports,
    resolvedAt:
      now,
    retentionDate
  };
}

module.exports = {
  dismissEntityReports,
  resolveEntityReports
};
