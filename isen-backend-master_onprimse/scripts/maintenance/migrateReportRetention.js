'use strict';

const mongoose = require('mongoose');

const DAY_MS =
  24 * 60 * 60 * 1000;

function asDate(value) {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

async function flush(
  collection,
  operations
) {
  if (!operations.length) {
    return 0;
  }

  const size =
    operations.length;

  await collection.bulkWrite(
    operations,
    { ordered: false }
  );

  operations.length = 0;

  return size;
}

/**
 * Migrate historical moderation reports from the former
 * creation-based retentionDate semantics.
 *
 * Idempotent rules:
 * - open / under_review:
 *     remove legacy retentionDate and resolvedAt
 * - resolved / dismissed:
 *     if lifecycle fields are incomplete, derive resolvedAt from
 *     updatedAt first, then createdAt as a fallback, and calculate
 *     finite retentionDate from that resolvedAt value.
 *
 * Existing closed records that already have both resolvedAt and
 * retentionDate are left unchanged.
 */
async function migrateReportRetention({
  collection,
  retentionDays =
    Math.max(
      1,
      Number(
        process.env.REPORT_RETENTION_DAYS ||
        365
      )
    ),
  apply = false
}) {
  if (!collection) {
    throw new Error(
      'reports collection is required'
    );
  }

  const days =
    Math.max(
      1,
      Number(retentionDays)
    );

  const openFilter = {
    status: {
      $in: [
        'open',
        'under_review'
      ]
    },
    $or: [
      {
        retentionDate: {
          $exists: true
        }
      },
      {
        resolvedAt: {
          $exists: true
        }
      }
    ]
  };

  const closedFilter = {
    status: {
      $in: [
        'resolved',
        'dismissed'
      ]
    },
    $or: [
      {
        resolvedAt: {
          $exists: false
        }
      },
      {
        resolvedAt: null
      },
      {
        retentionDate: {
          $exists: false
        }
      },
      {
        retentionDate: null
      }
    ]
  };

  const [
    openCandidates,
    closedCandidates
  ] =
    await Promise.all([
      collection.countDocuments(
        openFilter
      ),
      collection.countDocuments(
        closedFilter
      )
    ]);

  const summary = {
    apply,
    retentionDays: days,
    openCandidates,
    closedCandidates,
    openCorrected: 0,
    closedCorrected: 0,
    closedSkippedNoUsableDate: 0
  };

  if (!apply) {
    return summary;
  }

  const openResult =
    await collection.updateMany(
      openFilter,
      {
        $unset: {
          retentionDate: '',
          resolvedAt: ''
        }
      }
    );

  summary.openCorrected =
    openResult.modifiedCount || 0;

  const cursor =
    collection.find(
      closedFilter,
      {
        projection: {
          _id: 1,
          resolvedAt: 1,
          updatedAt: 1,
          createdAt: 1
        }
      }
    );

  const operations = [];

  for await (
    const doc
    of cursor
  ) {
    const resolvedAt =
      asDate(
        doc.resolvedAt
      ) ||
      asDate(
        doc.updatedAt
      ) ||
      asDate(
        doc.createdAt
      );

    if (!resolvedAt) {
      summary.closedSkippedNoUsableDate +=
        1;

      continue;
    }

    const retentionDate =
      new Date(
        resolvedAt.getTime() +
        days * DAY_MS
      );

    operations.push({
      updateOne: {
        filter: {
          _id:
            doc._id
        },
        update: {
          $set: {
            resolvedAt,
            retentionDate
          }
        }
      }
    });

    if (
      operations.length >=
      500
    ) {
      summary.closedCorrected +=
        await flush(
          collection,
          operations
        );
    }
  }

  summary.closedCorrected +=
    await flush(
      collection,
      operations
    );

  return summary;
}

async function runCli() {
  const args =
    process.argv.slice(2);

  const apply =
    args.includes(
      '--apply'
    );

  const uriArg =
    args.find(
      arg =>
        arg.startsWith(
          '--uri='
        )
    );

  const daysArg =
    args.find(
      arg =>
        arg.startsWith(
          '--retention-days='
        )
    );

  const uri =
    (
      uriArg
        ? uriArg.slice(
            '--uri='.length
          )
        : null
    ) ||
    process.env.MONGODB_URI ||
    process.env.MONGODB_URL ||
    process.env.MONGO_URI ||
    process.env.MONGO_URL ||
    process.env.MONGO_DB_URL;

  if (!uri) {
    throw new Error(
      'MongoDB URI required via --uri=... or MongoDB environment variable'
    );
  }

  const retentionDays =
    daysArg
      ? Number(
          daysArg.slice(
            '--retention-days='.length
          )
        )
      : undefined;

  await mongoose.connect(
    uri
  );

  try {
    const collection =
      mongoose.connection.collection(
        'reports'
      );

    const result =
      await migrateReportRetention({
        collection,
        retentionDays,
        apply
      });

    console.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );

    if (!apply) {
      console.log(
        'DRY RUN ONLY — rerun with --apply after review.'
      );
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (
  require.main === module
) {
  runCli().catch(
    error => {
      console.error(
        error &&
        error.stack
          ? error.stack
          : error
      );

      process.exitCode = 1;
    }
  );
}

module.exports = {
  migrateReportRetention
};
