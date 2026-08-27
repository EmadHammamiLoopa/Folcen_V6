'use strict';

const fs =
  require('fs');

const path =
  require('path');

const {
  assert
} = require('chai');


const ROOT =
  path.resolve(
    __dirname,
    '..'
  );


function read(relativePath) {

  return fs
    .readFileSync(
      path.join(
        ROOT,
        relativePath
      ),
      'utf8'
    )
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}


const helpers =
  read(
    'app/helpers.js'
  );


const mediaStore =
  read(
    'app/utils/mediaStore.js'
  );


const userController =
  read(
    'app/controllers/UserController.js'
  );


const purgeJob =
  read(
    'app/jobs/purgeDeletedUsers.js'
  );


const purgeStart =
  helpers.indexOf(
    'async function purgeUser'
  );


const purgeEnd =
  helpers.indexOf(
    'function buildCallInvitePayload',
    purgeStart
  );


assert.isAtLeast(
  purgeStart,
  0,
  'purgeUser must exist'
);


assert.isAbove(
  purgeEnd,
  purgeStart,
  'purgeUser boundary must be detectable'
);


const purge =
  helpers.slice(
    purgeStart,
    purgeEnd
  );


function containsAll(
  source,
  tokens
) {

  return tokens.every(
    token =>
      source.includes(token)
  );
}


describe(
  'LEGAL-C4 — erasure and purge contracts',
  function () {

    // ======================================================
    // PRESERVED GOOD BASELINE — 5 CONTRACTS
    // ======================================================

    it(
      'keeps normal account closure recoverable with purgeAt and restore support',
      function () {

        assert.include(
          userController,
          'exports.deleteAccount'
        );

        assert.include(
          userController,
          'purgeAt'
        );

        assert.include(
          userController,
          'revokeUser'
        );

        assert.include(
          userController,
          'exports.restoreAccount'
        );
      }
    );


    it(
      'runs scheduled permanent purge from purgeAt through purgeUser',
      function () {

        assert.include(
          purgeJob,
          'purgeAt: { $lte: now }'
        );

        assert.include(
          purgeJob,
          'await purgeUser(u._id)'
        );
      }
    );


    it(
      'already removes core account content communication and social records',
      function () {

        for (
          const token of [
            'User.deleteOne',
            'Post.deleteMany',
            'Comment.deleteMany',
            'Message.deleteMany',
            'Request.deleteMany',
            'Follow.deleteMany',
            'PushToken.deleteMany',
            'Notification.deleteMany',
            'AnalyticsEvent.deleteMany'
          ]
        ) {

          assert.include(
            purge,
            token,
            `missing existing core purge token: ${token}`
          );
        }
      }
    );


    it(
      'already removes Firebase Auth identity when a Firebase user exists',
      function () {

        assert.include(
          purge,
          'deleteUser(firebaseUid)'
        );
      }
    );


    it(
      'does not blindly delete security event and audit collections in the operational purge phase',
      function () {

        for (
          const forbidden of [
            'CallEvent.deleteMany',
            'MessageEvent.deleteMany',
            'AuthEvent.deleteMany',
            'AuditLog.deleteMany',
            'Blacklist.deleteMany'
          ]
        ) {

          assert.notInclude(
            purge,
            forbidden
          );
        }
      }
    );


    // ======================================================
    // 10 OPERATIONAL RECORD / REFERENCE DEFECTS
    // ======================================================

    it(
      'purges the deleted users Peer record',
      function () {

        assert.isTrue(
          containsAll(
            purge,
            [
              "require('./models/Peer')",
              'Peer.deleteMany'
            ]
          )
        );
      }
    );


    it(
      'purges user-specific Subscription records',
      function () {

        assert.isTrue(
          containsAll(
            purge,
            [
              "require('./models/Subscription')",
              'Subscription.deleteMany'
            ]
          )
        );
      }
    );


    it(
      'removes ChatOpeningLease state where the deleted user is sender or receiver',
      function () {

        assert.isTrue(
          containsAll(
            purge,
            [
              "require('./models/ChatOpeningLease')",
              'ChatOpeningLease.deleteMany',
              'ChatOpeningLease.updateMany',
              'leases',
              'receiver'
            ]
          )
        );
      }
    );


    it(
      'removes the deleted users vote references from surviving posts',
      function () {

        assert.isTrue(
          containsAll(
            purge,
            [
              'Post.updateMany',
              'votes',
              '$pull'
            ]
          )
        );
      }
    );


    it(
      'removes the deleted users vote references from surviving comments',
      function () {

        assert.isTrue(
          containsAll(
            purge,
            [
              'Comment.updateMany',
              'votes',
              '$pull'
            ]
          )
        );
      }
    );


    it(
      'removes the deleted user from Announcement seenBy arrays',
      function () {

        assert.isTrue(
          containsAll(
            purge,
            [
              "require('./models/Announcement')",
              'Announcement.updateMany',
              'seenBy'
            ]
          )
        );
      }
    );


    it(
      'removes the deleted users Announcement createdBy identity',
      function () {

        assert.isTrue(
          containsAll(
            purge,
            [
              'Announcement.updateMany',
              'createdBy'
            ]
          )
        );
      }
    );


    it(
      'clears Channel approvedBy when the approving user is erased',
      function () {

        assert.isTrue(
          containsAll(
            purge,
            [
              'Channel.updateMany',
              'approvedBy'
            ]
          )
        );
      }
    );


    it(
      'removes the deleted user from PlanRule targetUsers',
      function () {

        assert.isTrue(
          containsAll(
            purge,
            [
              "require('./models/PlanRule')",
              'PlanRule.updateMany',
              'targetUsers'
            ]
          )
        );
      }
    );


    it(
      'purges Content records owned by the deleted user',
      function () {

        assert.isTrue(
          containsAll(
            purge,
            [
              "require('./models/Content')",
              'Content.deleteMany'
            ]
          )
        );
      }
    );


    // ======================================================
    // GRIDFS DELETION CAPABILITY — 1 DEFECT
    // ======================================================

    it(
      'exports a public durable-media deletion API from mediaStore',
      function () {

        const exportsIndex =
          mediaStore.lastIndexOf(
            'module.exports'
          );


        assert.isAtLeast(
          exportsIndex,
          0
        );


        const exported =
          mediaStore.slice(
            exportsIndex
          );


        assert.match(
          exported,
          /\bremoveStored\b/
        );
      }
    );


    // ======================================================
    // 8 ACTIVE MEDIA ERASURE DEFECTS
    //
    // Desired implementation uses eraseStoredMedia(path):
    //   1. deletes local managed file if present
    //   2. deletes durable GridFS copy through mediaStore
    //
    // Product/Job/Service currently need local cleanup only,
    // but using the same safe helper keeps the purge path
    // storage-agnostic.
    // ======================================================

    it(
      'purges all stored avatar media for the deleted user',
      function () {

        assert.isTrue(
          containsAll(
            purge,
            [
              'eraseStoredMedia',
              'user.mainAvatar',
              'user.avatar'
            ]
          )
        );
      }
    );


    it(
      'purges local and durable Post media owned by the deleted user',
      function () {

        assert.isTrue(
          containsAll(
            purge,
            [
              'userPosts',
              'eraseStoredMedia',
              'p.media.url'
            ]
          )
        );
      }
    );


    it(
      'purges local and durable Comment media owned by the deleted user',
      function () {

        assert.isTrue(
          containsAll(
            purge,
            [
              'userComments',
              'eraseStoredMedia',
              'c.media.url'
            ]
          )
        );
      }
    );


    it(
      'purges uploaded chat and Message media belonging to the deleted user',
      function () {

        assert.isTrue(
          containsAll(
            purge,
            [
              'userMessages',
              'Message.find',
              'eraseStoredMedia'
            ]
          )
        );
      }
    );


    it(
      'purges owned Channel photos from managed storage',
      function () {

        assert.isTrue(
          containsAll(
            purge,
            [
              'userChannels',
              'photo',
              'eraseStoredMedia'
            ]
          )
        );
      }
    );


    it(
      'purges owned Product photos from managed storage',
      function () {

        assert.isTrue(
          containsAll(
            purge,
            [
              'userProducts',
              'Product.find',
              'photos',
              'eraseStoredMedia'
            ]
          )
        );
      }
    );


    it(
      'purges owned Job photos from managed storage',
      function () {

        assert.isTrue(
          containsAll(
            purge,
            [
              'userJobs',
              'Job.find',
              'photo',
              'eraseStoredMedia'
            ]
          )
        );
      }
    );


    it(
      'purges owned Service photos from managed storage',
      function () {

        assert.isTrue(
          containsAll(
            purge,
            [
              'userServices',
              'Service.find',
              'photo',
              'eraseStoredMedia'
            ]
          )
        );
      }
    );
  }
);
