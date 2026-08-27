'use strict';

const fs =
  require('fs');

const path =
  require('path');

const {
  assert
} =
  require('chai');


const ROOT =
  path.resolve(
    __dirname,
    '..'
  );


function read(
  relativePath
) {

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


function readOptional(
  relativePath
) {

  try {

    return read(
      relativePath
    );

  } catch (_) {

    return '';
  }
}


const gdpr =
  read(
    'app/controllers/GdprController.js'
  );


const userController =
  read(
    'app/controllers/UserController.js'
  );


const helpers =
  read(
    'app/helpers.js'
  );


const purgeJob =
  read(
    'app/jobs/purgeDeletedUsers.js'
  );


const retentionDoc =
  read(
    '../docs/gdpr/RETENTION_AND_ERASURE.md'
  );


const auditLog =
  read(
    'app/models/AuditLog.js'
  );


const authEvent =
  read(
    'app/models/AuthEvent.js'
  );


const callEvent =
  read(
    'app/models/CallEvent.js'
  );


const messageEvent =
  read(
    'app/models/MessageEvent.js'
  );


const legalAcceptance =
  read(
    'app/models/LegalAcceptance.js'
  );


const report =
  read(
    'app/models/Report.js'
  );


const reportController =
  read(
    'app/controllers/ReportController.js'
  );


const eventLogger =
  read(
    'app/utils/eventLogger.js'
  );


const blacklist =
  read(
    'app/models/Blacklist.js'
  );


const erasureRetention =
  readOptional(
    'app/utils/erasureRetention.js'
  );


const eraseStart =
  gdpr.indexOf(
    'exports.erase = async'
  );


const eraseEnd =
  gdpr.indexOf(
    'exports.consentHistory',
    eraseStart
  );


assert.isAtLeast(
  eraseStart,
  0,
  'GDPR erase controller must exist'
);


assert.isAbove(
  eraseEnd,
  eraseStart,
  'GDPR erase boundary must be detectable'
);


const erase =
  gdpr.slice(
    eraseStart,
    eraseEnd
  );


const purgeStart =
  helpers.indexOf(
    'async function purgeUser(userId) {'
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


describe(
  'LEGAL-C4-B2 — Article 17 and retention contracts',
  function () {

    // ======================================================
    // 5 PRESERVED-GOOD CONTRACTS
    // ======================================================

    it(
      'preserves ordinary account closure as a recoverable grace-period flow',
      function () {

        assert.include(
          userController,
          'purgeAt'
        );

        assert.include(
          userController,
          'You can restore it before then'
        );

        assert.include(
          userController,
          'exports.restoreUser'
        );
      }
    );


    it(
      'preserves admin-only cross-user hard erasure authorization',
      function () {

        assert.include(
          erase,
          "actor.role === 'ADMIN'"
        );

        assert.include(
          erase,
          "actor.role === 'SUPER ADMIN'"
        );

        assert.include(
          erase,
          'String(actor._id) !== String(target._id)'
        );

        assert.include(
          erase,
          'ERASURE_HARD'
        );

        assert.include(
          erase,
          'await purgeUser(target._id)'
        );
      }
    );


    it(
      'does not blindly delete security-retention collections in purgeUser',
      function () {

        for (
          const forbidden
          of [
            'AuditLog.deleteMany',
            'AuthEvent.deleteMany',
            'CallEvent.deleteMany',
            'MessageEvent.deleteMany',
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


    it(
      'keeps CallEvent and MessageEvent minimal non-content records linked to reports',
      function () {

        assert.include(
          callEvent,
          'Do NOT store audio/video or any user content'
        );

        assert.include(
          callEvent,
          'linkedReport'
        );

        assert.include(
          messageEvent,
          'Do NOT store message content'
        );

        assert.include(
          messageEvent,
          'linkedReport'
        );
      }
    );


    it(
      'keeps an explicit retentionDate field on moderation reports',
      function () {

        assert.include(
          report,
          'retentionDate'
        );

        assert.include(
          report,
          'linkedEvents'
        );

        assert.include(
          report,
          'status'
        );
      }
    );


    // ======================================================
    // 13 CHARACTERIZED RED CONTRACTS
    // ======================================================

    it(
      'separates Article 17 self-erasure from recoverable account closure',
      function () {

        assert.notInclude(
          erase,
          'target.purgeAt'
        );

        assert.notInclude(
          erase,
          'Account scheduled for deletion'
        );

        assert.notInclude(
          erase,
          'ERASURE_SOFT'
        );
      }
    );


    it(
      'performs an explicit Article 17 exception and retention assessment',
      function () {

        assert.include(
          erase,
          'buildErasureRetentionPlan'
        );

        assert.match(
          erase,
          /Article\s*17|art17/i
        );

        assert.match(
          erase,
          /exception/i
        );
      }
    );


    it(
      'discloses partially retained categories and reasons in an erasure response',
      function () {

        assert.include(
          erase,
          'retainedCategories'
        );

        assert.include(
          erase,
          'retentionReason'
        );
      }
    );


    it(
      'provides supervisory-authority and judicial-remedy information when erasure is limited',
      function () {

        assert.include(
          erase,
          'supervisoryAuthority'
        );

        assert.include(
          erase,
          'judicialRemedy'
        );
      }
    );


    it(
      'uses one bounded AuditLog retention source of truth in code and retention documentation',
      function () {

        assert.include(
          auditLog,
          'AUDIT_LOG_RETENTION_DAYS'
        );

        assert.include(
          retentionDoc,
          'AUDIT_LOG_RETENTION_DAYS'
        );

        assert.notMatch(
          retentionDoc,
          /audit_logs.*2 years/i
        );

        assert.notInclude(
          retentionDoc,
          'AUDIT_LOG_ARCHIVE_DAYS'
        );
      }
    );


    it(
      'minimizes erased-user identity and raw technical identifiers in retained audit evidence',
      function () {

        assert.include(
          erasureRetention,
          'AuditLog.updateMany'
        );

        assert.include(
          erasureRetention,
          'actorId'
        );

        assert.include(
          erasureRetention,
          'targetUserId'
        );

        assert.include(
          erasureRetention,
          'ip'
        );

        assert.include(
          erasureRetention,
          'userAgent'
        );

        assert.match(
          erasureRetention,
          /\$(unset|set)/
        );
      }
    );


    it(
      'gives AuthEvent a bounded default TTL even when the environment variable is absent',
      function () {

        assert.notInclude(
          authEvent,
          'if (process.env.AUTH_EVENT_RETENTION_DAYS)'
        );

        assert.match(
          authEvent,
          /AUTH_EVENT_RETENTION_DAYS\s*\|\|\s*['"]?30['"]?/
        );

        assert.include(
          authEvent,
          'expireAfterSeconds'
        );
      }
    );


    it(
      'prevents Mongo TTL from deleting report-linked CallEvent evidence',
      function () {

        assert.notInclude(
          callEvent,
          'expireAfterSeconds: 0'
        );

        assert.include(
          purgeJob,
          'linkedReport: null'
        );

        assert.include(
          purgeJob,
          'expiresAt: { $lte: now }'
        );
      }
    );


    it(
      'prevents Mongo TTL from deleting report-linked MessageEvent evidence',
      function () {

        assert.notInclude(
          messageEvent,
          'expireAfterSeconds: 0'
        );

        assert.include(
          purgeJob,
          'linkedReport: null'
        );

        assert.include(
          purgeJob,
          'expiresAt: { $lte: now }'
        );
      }
    );


    it(
      'defines finite retained LegalAcceptance evidence instead of lifetime-or-delete semantics',
      function () {

        assert.notMatch(
          retentionDoc,
          /legal_acceptances.*Lifetime/i
        );

        assert.include(
          retentionDoc,
          'LEGAL_ACCEPTANCE_RETENTION_DAYS'
        );

        assert.include(
          legalAcceptance,
          'retentionDate'
        );

        assert.include(
          legalAcceptance,
          'LEGAL_ACCEPTANCE_RETENTION_DAYS'
        );
      }
    );


    it(
      'defines report retention from case resolution rather than a fixed 365 days from creation',
      function () {

        assert.include(
          report,
          'resolvedAt'
        );

        assert.include(
          reportController,
          'REPORT_RETENTION_DAYS'
        );

        assert.include(
          reportController,
          'retentionDate'
        );

        assert.notInclude(
          eventLogger,
          '365 * 24 * 60 * 60 * 1000'
        );
      }
    );


    it(
      'enforces report retentionDate with a Mongo TTL index',
      function () {

        assert.match(
          report,
          /ReportSchema\.index\(\s*\{\s*retentionDate:\s*1\s*\}[\s\S]*expireAfterSeconds:\s*0/
        );
      }
    );


    it(
      'defines review and erasure treatment for user-identifying blacklist records',
      function () {

        assert.include(
          blacklist,
          'reviewAt'
        );

        assert.include(
          erasureRetention,
          'Blacklist.updateMany'
        );

        assert.include(
          erasureRetention,
          'createdBy'
        );

        assert.match(
          erasureRetention,
          /itemValue|subject/i
        );
      }
    );
  }
);
