'use strict';

const Post = require('../models/Post');
const Comment = require('../models/Comment');
const {
  removeManagedMedia
} = require('../utils/contentMediaLifecycle');

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_SWEEP_INTERVAL = '15 minutes';

const nonEmptyMediaQuery = now => ({
  'media.url': {
    $exists: true,
    $nin: ['', null, 'undefined', 'null', '[object Object]']
  },
  'media.expiryDate': {
    $type: 'date',
    $lte: now
  }
});

async function purgeModelExpiredMedia(
  Model,
  {
    now = new Date(),
    batchSize = DEFAULT_BATCH_SIZE,
    removeMedia = removeManagedMedia,
    modelName = Model.modelName || 'Media'
  } = {}
) {
  let cleaned = 0;
  let failed = 0;

  while (true) {
    const expired = await Model.find(
      nonEmptyMediaQuery(now)
    )
      .select('_id media')
      .limit(batchSize)
      .lean();

    if (!expired.length) {
      break;
    }

    let progressed = false;

    for (const doc of expired) {
      const mediaUrl =
        doc &&
        doc.media &&
        typeof doc.media.url === 'string'
          ? doc.media.url
          : '';

      if (!mediaUrl) {
        continue;
      }

      try {
        /*
         * Re-check the exact URL + expiry immediately before physical
         * deletion. This prevents a stale batch item from deleting a
         * replacement media path that was saved after the batch read.
         */
        const stillExpired = await Model.findOne({
          _id: doc._id,
          'media.url': mediaUrl,
          'media.expiryDate': {
            $type: 'date',
            $lte: now
          }
        })
          .select('_id')
          .lean();

        if (!stillExpired) {
          progressed = true;
          continue;
        }

        /*
         * Physical lifecycle first. Only remove the DB reference after
         * durable/local cleanup succeeds so a failed cleanup remains
         * discoverable and retryable on the next sweep.
         */
        await removeMedia(mediaUrl);

        const result = await Model.updateOne(
          {
            _id: doc._id,
            'media.url': mediaUrl,
            'media.expiryDate': {
              $type: 'date',
              $lte: now
            }
          },
          {
            $unset: {
              'media.url': '',
              'media.expiryDate': ''
            }
          }
        );

        if (result.modifiedCount === 1) {
          cleaned += 1;
        }

        progressed = true;
      } catch (error) {
        failed += 1;

        console.error(
          `Failed to purge expired ${modelName} media`,
          doc._id,
          error
        );
      }
    }

    /*
     * Avoid an infinite loop if every row in the current batch fails.
     * Failed references are intentionally retained so a later scheduled
     * sweep can retry them.
     */
    if (!progressed) {
      break;
    }

    if (expired.length < batchSize) {
      break;
    }
  }

  return {
    cleaned,
    failed
  };
}

async function purgeExpiredMedia(options = {}) {
  const now =
    options.now instanceof Date
      ? options.now
      : new Date();

  const postResult =
    await purgeModelExpiredMedia(
      options.PostModel || Post,
      {
        now,
        batchSize:
          options.batchSize ||
          DEFAULT_BATCH_SIZE,
        removeMedia:
          options.removeMedia ||
          removeManagedMedia,
        modelName: 'Post'
      }
    );

  const commentResult =
    await purgeModelExpiredMedia(
      options.CommentModel || Comment,
      {
        now,
        batchSize:
          options.batchSize ||
          DEFAULT_BATCH_SIZE,
        removeMedia:
          options.removeMedia ||
          removeManagedMedia,
        modelName: 'Comment'
      }
    );

  return {
    posts: postResult,
    comments: commentResult
  };
}

function registerExpiredMediaJob(agenda) {
  agenda.define(
    'purge-expired-media',
    async () => {
      try {
        const result =
          await purgeExpiredMedia();

        if (
          result.posts.failed ||
          result.comments.failed
        ) {
          console.warn(
            'purge-expired-media completed with cleanup failures',
            result
          );
        }
      } catch (error) {
        console.error(
          'purge-expired-media job failed',
          error
        );
      }
    }
  );

  const interval =
    process.env.MEDIA_EXPIRY_SWEEP_INTERVAL ||
    DEFAULT_SWEEP_INTERVAL;

  /*
   * The existing purgeDeletedUsers job owns Agenda startup.
   * Registration here only schedules this job to avoid introducing
   * another independent Agenda.start() call.
   */
  Promise.resolve(
    agenda.every(
      interval,
      'purge-expired-media',
      {},
      {
        skipImmediate: true
      }
    )
  ).catch(
    error => {
      console.error(
        'Agenda expired-media scheduling failed',
        error
      );
    }
  );
}

module.exports =
  registerExpiredMediaJob;

module.exports.purgeExpiredMedia =
  purgeExpiredMedia;

module.exports.purgeModelExpiredMedia =
  purgeModelExpiredMedia;
