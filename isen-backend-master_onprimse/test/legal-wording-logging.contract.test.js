const assert = require('assert');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..');

function read(rel) {
  return fs.readFileSync(
    path.join(repoRoot, rel),
    'utf8'
  );
}

describe(
  'D3 legal wording and acceptance logging contract',
  () => {
    it(
      'does not present the admin audit log as an Article 30 ROPA',
      () => {
        const auditHtml = read(
          'geloo-dashboard-master/src/app/modules/dashboard/gdpr/audit-log/audit-log.component.html'
        );

        const centreTs = read(
          'geloo-dashboard-master/src/app/modules/dashboard/gdpr/gdpr-centre/gdpr-centre.component.ts'
        );

        assert.ok(
          !/GDPR\s+Art\.?\s*30/i.test(
            auditHtml
          )
        );

        assert.ok(
          !/desc:\s*['"]Art\.?\s*30['"]/i.test(
            centreTs
          )
        );

        assert.ok(
          /Accountability/.test(
            centreTs
          )
        );
      }
    );

    it(
      'avoids blanket GDPR-compliant claims in active user-facing targets',
      () => {
        const files = [
          'geloo-dashboard-master/src/app/modules/dashboard/gdpr/gdpr-centre/gdpr-centre.component.html',
          'geloo-dashboard-master/src/app/modules/dashboard/user/display-user/display-user.component.ts',
          'src/app/components/report-modal/report-modal.component.ts',
          'src/app/pages/terms-of-service/terms-of-service.component.html',
        ];

        for (const rel of files) {
          const source = read(rel);

          assert.ok(
            !/GDPR[ -]Compliant/i.test(source),
            rel
          );

          assert.ok(
            !/GDPR\s+COMPLIANCE/i.test(source),
            rel
          );
        }
      }
    );

    it(
      'does not print legal acceptance identifiers, IPs, or full payloads to operational logs',
      () => {
        const legalAccept = read(
          'isen-backend-master_onprimse/app/utils/legalAccept.js'
        );

        const gdprRoute = read(
          'isen-backend-master_onprimse/routes/gdpr.js'
        );

        const authController = read(
          'isen-backend-master_onprimse/app/controllers/AuthController.js'
        );

        assert.ok(
          !legalAccept.includes(
            'DEBUG: recordAcceptance'
          )
        );

        assert.ok(
          !gdprRoute.includes(
            'DEBUG: GDPR acceptances for user'
          )
        );

        assert.ok(
          !authController.includes(
            'Legal acceptances recorded for user'
          )
        );
      }
    );

    it(
      'preserves persistent legal acceptance and audit evidence',
      () => {
        const legalAccept = read(
          'isen-backend-master_onprimse/app/utils/legalAccept.js'
        );

        const gdprRoute = read(
          'isen-backend-master_onprimse/routes/gdpr.js'
        );

        const authController = read(
          'isen-backend-master_onprimse/app/controllers/AuthController.js'
        );

        assert.ok(
          legalAccept.includes(
            'LegalAcceptance.create'
          )
        );

        assert.ok(
          legalAccept.includes(
            "action: 'LEGAL_ACCEPTANCE'"
          )
        );

        assert.ok(
          legalAccept.includes(
            'ip: enrichedMeta.ip'
          )
        );

        assert.ok(
          legalAccept.includes(
            'userAgent: enrichedMeta.userAgent'
          )
        );

        assert.ok(
          gdprRoute.includes(
            "action: 'DASHBOARD_VIEW_ACCEPTANCES'"
          )
        );

        assert.ok(
          authController.includes(
            'LegalAcceptance.insertMany(acceptances)'
          )
        );
      }
    );
  }
);

describe(
  'D3 data export audit migration contract',
  () => {
    it(
      'uses the structured audit store instead of extraction.log',
      () => {
        const userRoute = read(
          'isen-backend-master_onprimse/routes/user.js'
        );

        assert.ok(
          userRoute.includes(
            "const { recordAudit } = require('../app/utils/audit');"
          )
        );

        assert.ok(
          userRoute.includes(
            "action: 'EXPORT'"
          )
        );

        assert.ok(
          userRoute.includes(
            'targetUserId: userId'
          )
        );

        assert.ok(
          userRoute.includes(
            'const actor = req.authUser;'
          )
        );

        assert.ok(
          userRoute.includes(
            'actorId: actor && actor._id'
          )
        );

        assert.ok(
          userRoute.includes(
            'actorRole: actor && actor.role'
          )
        );

        assert.ok(
          !userRoute.includes(
            'extraction.log'
          )
        );

        assert.ok(
          !userRoute.includes(
            'fsp.appendFile'
          )
        );

        assert.ok(
          !userRoute.includes(
            "const fs = require('fs');"
          )
        );

        assert.ok(
          !userRoute.includes(
            'const fsp = fs.promises;'
          )
        );

        assert.ok(
          userRoute.includes(
            "const path = require('path');"
          )
        );
      }
    );

    it(
      'does not print target or actor identifiers from the export handler',
      () => {
        const userRoute = read(
          'isen-backend-master_onprimse/routes/user.js'
        );

        const start = userRoute.indexOf(
          "router.get('/extract/:userId'"
        );

        const end = userRoute.indexOf(
          "router.param('userId', userById);",
          start
        );

        assert.ok(start >= 0);
        assert.ok(end > start);

        const handler = userRoute.slice(
          start,
          end
        );

        const operationalLogs = handler
          .split(/\r?\n/)
          .filter(line =>
            /console\.(?:log|info)|logger\.(?:info|debug)/.test(line)
          );

        for (const line of operationalLogs) {
          assert.ok(
            !/\b(?:userId|adminId|logMessage)\b/.test(line),
            line
          );
        }
      }
    );

    it(
      'keeps export auditing non-blocking while retaining structured evidence',
      () => {
        const userRoute = read(
          'isen-backend-master_onprimse/routes/user.js'
        );

        assert.ok(
          userRoute.includes(
            "console.warn('Failed to record data export audit event');"
          )
        );

        assert.ok(
          userRoute.includes(
            'details: { format: exportFormat }'
          )
        );

        assert.ok(
          userRoute.includes(
            'ip: req.ip'
          )
        );

        assert.ok(
          userRoute.includes(
            "userAgent: req.get('User-Agent')"
          )
        );
      }
    );
  }
);

describe(
  'D3 runtime privacy log hygiene contract',
  () => {
    it(
      'does not expose authentication or push token fragments',
      () => {
        const authController = read(
          'isen-backend-master_onprimse/app/controllers/AuthController.js'
        );

        const pushRoute = read(
          'isen-backend-master_onprimse/routes/push.js'
        );

        assert.ok(
          !authController.includes(
            'idToken.substring(0, 10)'
          )
        );

        assert.ok(
          !authController.includes(
            'Verified UID:'
          )
        );

        assert.ok(
          !pushRoute.includes(
            'tokenTail='
          )
        );

        assert.ok(
          !pushRoute.includes(
            'deviceId=${'
          )
        );
      }
    );

    it(
      'keeps profile debug server-controlled and off disk',
      () => {
        const userController = read(
          'isen-backend-master_onprimse/app/controllers/UserController.js'
        );

        assert.ok(
          !userController.includes(
            'fs.appendFileSync'
          )
        );

        assert.ok(
          !userController.includes(
            'profile-debug-${'
          )
        );

        assert.ok(
          !userController.includes(
            "const fs = require('fs')"
          )
        );

        assert.ok(
          !userController.includes(
            'const fsp = fs.promises'
          )
        );

        assert.ok(
          !/req\.query[\s\S]{0,220}debug\s*===\s*['"](?:1|true)['"]/.test(
            userController
          )
        );

        assert.ok(
          userController.includes(
            'PROFILE_DEBUG_ID'
          )
        );

        assert.ok(
          userController.includes(
            "PROFILE_DEBUG: incoming payload keys/types"
          )
        );

        assert.ok(
          userController.includes(
            "PROFILE_DEBUG: saved field types"
          )
        );
      }
    );

    it(
      'does not print direct identities in sensitive auth and DSAR flows',
      () => {
        const userController = read(
          'isen-backend-master_onprimse/app/controllers/UserController.js'
        );

        const authMiddleware = read(
          'isen-backend-master_onprimse/app/middlewares/auth.js'
        );

        const validator = read(
          'isen-backend-master_onprimse/app/middlewares/validators/userValidator.js'
        );

        const userRoute = read(
          'isen-backend-master_onprimse/routes/user.js'
        );

        for (const marker of [
          'New email to be set:',
          'Email is already in use by another account:',
          'Comparing current password for user:',
          'Password updated successfully for user:'
        ]) {
          assert.ok(
            !userController.includes(marker)
          );
        }

        assert.ok(
          !authMiddleware.includes(
            'Decoded token present for user id:'
          )
        );

        assert.ok(
          !authMiddleware.includes(
            'User loaded id/email:'
          )
        );

        assert.ok(
          !authMiddleware.includes(
            'isAdmin check failed for user'
          )
        );

        assert.ok(
          !validator.includes(
            'Validating email for user:'
          )
        );

        assert.ok(
          !userRoute.includes(
            '${user.email})'
          )
        );
      }
    );

    it(
      'preserves credential push and authentication behavior',
      () => {
        const userController = read(
          'isen-backend-master_onprimse/app/controllers/UserController.js'
        );

        const authController = read(
          'isen-backend-master_onprimse/app/controllers/AuthController.js'
        );

        const pushRoute = read(
          'isen-backend-master_onprimse/routes/push.js'
        );

        const authMiddleware = read(
          'isen-backend-master_onprimse/app/middlewares/auth.js'
        );

        assert.ok(
          authController.includes(
            'admin.auth().verifyIdToken(idToken)'
          )
        );

        assert.ok(
          pushRoute.includes(
            'PushToken.findOneAndUpdate'
          )
        );

        assert.ok(
          pushRoute.includes(
            'PushToken.deleteOne'
          )
        );

        assert.ok(
          userController.includes(
            'authUser.email = email'
          )
        );

        assert.ok(
          userController.includes(
            'authUser.authenticate(current_password)'
          )
        );

        assert.ok(
          userController.includes(
            'bumpTokenVersion('
          )
        );

        assert.ok(
          authMiddleware.includes(
            'rejectIfTokenVersionStale'
          )
        );

        assert.ok(
          authMiddleware.includes(
            'req.authUser = user'
          )
        );
      }
    );
  }
);

describe(
  'D3 erasure wording retention alignment contract',
  () => {
    it(
      'does not promise deletion of all personal data when retention exceptions exist',
      () => {
        const html = read(
          'geloo-dashboard-master/src/app/modules/dashboard/gdpr/erase-user/erase-user.component.html'
        );

        const display = read(
          'geloo-dashboard-master/src/app/modules/dashboard/user/display-user/display-user.component.ts'
        );

        assert.ok(
          !html.includes(
            'Permanently delete a user and all their data'
          )
        );

        assert.ok(
          !html.includes(
            'All personal data has been permanently deleted'
          )
        );

        assert.ok(
          !display.includes(
            'all their data (files, posts, etc.) immediately'
          )
        );
      }
    );

    it(
      'explains that limited records may remain under the retention assessment',
      () => {
        const html = read(
          'geloo-dashboard-master/src/app/modules/dashboard/gdpr/erase-user/erase-user.component.html'
        );

        const display = read(
          'geloo-dashboard-master/src/app/modules/dashboard/user/display-user/display-user.component.ts'
        );

        assert.ok(
          html.includes(
            'Limited records may be retained temporarily'
          )
        );

        assert.ok(
          html.includes(
            'configured retention assessment'
          )
        );

        assert.ok(
          html.includes(
            'Retained identifiers are minimized where applicable'
          )
        );

        assert.ok(
          display.includes(
            'documented retention exception applies'
          )
        );
      }
    );

    it(
      'preserves Article 17 erasure functionality',
      () => {
        const html = read(
          'geloo-dashboard-master/src/app/modules/dashboard/gdpr/erase-user/erase-user.component.html'
        );

        const component = read(
          'geloo-dashboard-master/src/app/modules/dashboard/gdpr/erase-user/erase-user.component.ts'
        );

        const display = read(
          'geloo-dashboard-master/src/app/modules/dashboard/user/display-user/display-user.component.ts'
        );

        assert.ok(
          html.includes(
            'GDPR Art. 17 Right to Erasure'
          )
        );

        assert.ok(
          component.includes(
            'this.gdpr.erasePreview('
          )
        );

        assert.ok(
          component.includes(
            'this.gdpr.eraseUser('
          )
        );

        assert.ok(
          display.includes(
            "this.dataService.sendPostRequest('gdpr/erase'"
          )
        );
      }
    );

    it(
      'uses completion wording instead of absolute all-data deletion claims',
      () => {
        const component = read(
          'geloo-dashboard-master/src/app/modules/dashboard/gdpr/erase-user/erase-user.component.ts'
        );

        const html = read(
          'geloo-dashboard-master/src/app/modules/dashboard/gdpr/erase-user/erase-user.component.html'
        );

        assert.ok(
          component.includes(
            "'User erasure completed'"
          )
        );

        assert.ok(
          html.includes(
            'Erasure completed.'
          )
        );

        assert.ok(
          html.includes(
            'Confirm Erasure'
          )
        );
      }
    );
  }
);

describe(
  'D3 residual credential and push logging contract',
  () => {
    it(
      'preserves fs promises required by avatar deletion without restoring profile disk logging',
      () => {
        const userController = read(
          'isen-backend-master_onprimse/app/controllers/UserController.js'
        );

        assert.ok(
          userController.includes(
            "const fsp = require('fs').promises;"
          )
        );

        assert.ok(
          userController.includes(
            'fsp.access('
          )
        );

        assert.ok(
          userController.includes(
            'fsp.unlink('
          )
        );

        assert.ok(
          !userController.includes(
            'fs.appendFileSync'
          )
        );
      }
    );

    it(
      'does not dump signup request bodies that may contain credentials',
      () => {
        const authValidator = read(
          'isen-backend-master_onprimse/app/middlewares/validators/authValidator.js'
        );

        const authController = read(
          'isen-backend-master_onprimse/app/controllers/AuthController.js'
        );

        assert.ok(
          !authValidator.includes(
            'DEBUG: signupValidator req.body'
          )
        );

        assert.ok(
          !authValidator.includes(
            'JSON.stringify(req.body'
          )
        );

        assert.ok(
          !authController.includes(
            'DEBUG: AuthController.signup body'
          )
        );
      }
    );

    it(
      'does not print FCM registration-token fragments or target user identifiers',
      () => {
        const fcm = read(
          'isen-backend-master_onprimse/app/services/fcmPushService.js'
        );

        for (const marker of [
          'tokenTail=',
          'preparing push userId=',
          'userId=${userId} success=',
          'for user ${userId}',
          'no tokens for userId='
        ]) {
          assert.ok(
            !fcm.includes(marker)
          );
        }

        assert.ok(
          fcm.includes(
            'PushToken.deleteMany'
          )
        );
      }
    );

    it(
      'does not dump raw request bodies in audited runtime paths',
      () => {
        const files = [
          'isen-backend-master_onprimse/app/controllers/UserController.js',
          'isen-backend-master_onprimse/app/controllers/PostController.js',
          'isen-backend-master_onprimse/app/controllers/AdminController.js',
          'isen-backend-master_onprimse/app/middlewares/validators/CommentValidator.js'
        ];

        for (const file of files) {
          const source = read(file);

          assert.ok(
            !source.includes(
              "console.log('Request body:', req.body)"
            )
          );

          assert.ok(
            !source.includes(
              "console.log('Request Body:', req.body)"
            )
          );

          assert.ok(
            !source.includes(
              'Validating req.body:'
            )
          );

          assert.ok(
            !source.includes(
              '. Body:'
            )
          );
        }
      }
    );
  }
);
