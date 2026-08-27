const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(
    path.join(ROOT, rel),
    'utf8'
  );
}

describe(
  'Admin persistence and critical security contract',
  () => {

    it('removes the catastrophic traitor endpoint', () => {
      const routes =
        read('routes/auth.js');

      const controller =
        read('app/controllers/AuthController.js');

      assert.ok(
        !routes.includes('/traitor')
      );

      assert.ok(
        !controller.includes('exports.traitor')
      );

      assert.ok(
        !controller.includes(
          'User.deleteMany({})'
        )
      );
    });

    it('excludes admins and soft-deleted accounts from unverified cleanup', () => {
      const source =
        read('index.js');

      const start =
        source.indexOf(
          'async function purgeUnverifiedAccounts'
        );

      assert.ok(start >= 0);

      const block =
        source.slice(
          start,
          start + 2000
        );

      assert.ok(
        block.includes(
          "$nin: ['ADMIN', 'SUPER ADMIN']"
        )
      );

      assert.ok(
        block.includes(
          'isDeleted: { $ne: true }'
        )
      );
    });

    it('uses live database-backed actor state for admin authorization', () => {
      const source =
        read('app/middlewares/auth.js');

      assert.ok(
        source.includes(
          'const actor = req.authUser || req.auth;'
        )
      );

      assert.ok(
        source.includes(
          "actor.role !== 'SUPER ADMIN'"
        )
      );

      assert.ok(
        source.includes(
          'user.enabled === false'
        )
      );
    });

    it('loads withAuthUser on sensitive dashboard user routes', () => {
      const source =
        read('routes/user.js');

      assert.ok(
        source.includes(
          "router.post('/role/:userId', [requireSignin, withAuthUser, isSuperAdmin]"
        )
      );

      assert.ok(
        source.includes(
          "router.post('/status/:userId', [requireSignin, withAuthUser, isAdmin]"
        )
      );

      assert.ok(
        source.includes(
          "router.put('/dash/:userId', [requireSignin, withAuthUser, isSuperAdmin"
        )
      );
    });

    it('implements final active SUPER ADMIN protection', () => {
      const source =
        read('app/utils/adminLifecycle.js');

      assert.ok(
        source.includes(
          'wouldRemoveLastActiveSuperAdmin'
        )
      );

      assert.ok(
        source.includes(
          "role: 'SUPER ADMIN'"
        )
      );

      assert.ok(
        source.includes(
          "enabled: { $ne: false }"
        )
      );

      assert.ok(
        source.includes(
          "isDeleted: { $ne: true }"
        )
      );
    });

    it('protects role and account status transitions', () => {
      const source =
        read('app/controllers/UserController.js');

      assert.ok(
        source.includes(
          'Cannot remove the final active SUPER ADMIN'
        )
      );

      assert.ok(
        source.includes(
          'Cannot disable the final active SUPER ADMIN'
        )
      );

      assert.ok(
        source.includes(
          'Cannot delete the final active SUPER ADMIN'
        )
      );
    });

    it('audits administrative security changes', () => {
      const source =
        read('app/controllers/UserController.js');

      assert.ok(
        source.includes(
          'ADMIN_ROLE_CHANGE'
        )
      );

      assert.ok(
        source.includes(
          'ADMIN_ACCOUNT_STATUS_CHANGE'
        )
      );

      assert.ok(
        source.includes(
          'ADMIN_SECURITY_STATE_CHANGE'
        )
      );

      assert.ok(
        source.includes(
          'ADMIN_USER_CREATE'
        )
      );
    });

    it('protects permanent delete and administrative GDPR erasure', () => {
      const admin =
        read(
          'app/controllers/AdminController.js'
        );

      const gdpr =
        read(
          'app/controllers/GdprController.js'
        );

      assert.ok(
        admin.includes(
          'Cannot permanently delete the final active SUPER ADMIN'
        )
      );

      assert.ok(
        gdpr.includes(
          'Only SUPER ADMIN can erase another administrator'
        )
      );

      assert.ok(
        gdpr.includes(
          'Cannot administratively erase the final active SUPER ADMIN'
        )
      );
    });

    it('creates dashboard administrators verified and enabled', () => {
      const source =
        read(
          'app/controllers/UserController.js'
        );

      assert.ok(
        source.includes(
          'cleanFields.emailVerified = true'
        )
      );

      assert.ok(
        source.includes(
          'cleanFields.enabled = true'
        )
      );
    });

    it('has no embedded MongoDB Atlas URI in the legacy seed', () => {
      const source =
        read('app/seed.js');

      assert.ok(
        !source.includes(
          'mongodb+srv://'
        )
      );

      assert.ok(
        source.includes(
          'const db = process.env.MONGODB_URL;'
        )
      );
    });

    it('disables the legacy sample seed in production', () => {
      const source =
        read('app/seed.js');

      assert.ok(
        source.includes(
          "process.env.NODE_ENV === 'production'"
        )
      );

      assert.ok(
        source.includes(
          'Use scripts/seed-prod.js instead'
        )
      );
    });

    it('marks all legacy seeded administrator accounts verified and enabled', () => {
      const source =
        read('app/seed.js');

      assert.strictEqual(
        (
          source.match(
            /emailVerified:\s*true/g
          ) || []
        ).length,
        3
      );

      assert.strictEqual(
        (
          source.match(
            /enabled:\s*true/g
          ) || []
        ).length,
        3
      );
    });

    it('repairs existing active production bootstrap accounts', () => {
      const source =
        read(
          'scripts/seed-prod.js'
        );

      assert.ok(
        source.includes(
          'existing.isDeleted'
        )
      );

      assert.ok(
        source.includes(
          'repair.emailVerified = true'
        )
      );

      assert.ok(
        source.includes(
          'repair.enabled = true'
        )
      );

      assert.ok(
        source.includes(
          'REPAIRED'
        )
      );
    });

    it('dashboard creation tolerates an empty subscription collection', () => {
      const source =
        read('app/controllers/UserController.js');

      assert.ok(
        source.includes(
          'if (!subscription)'
        )
      );

      assert.ok(
        source.includes(
          'dashboard user created without free subscription'
        )
      );

      assert.ok(
        source.includes(
          'Persist subscription and any channel-array mutations'
        )
      );
    });


    it('live auth-user loading includes enabled and cannot bypass lifecycle checks', () => {
      const source =
        read('app/middlewares/auth.js');

      assert.ok(
        source.includes(
          "'_id email role enabled banned"
        )
      );

      const fastStart =
        source.indexOf(
          'if (\n            req._userLoaded'
        );

      const lifecycleStart =
        source.indexOf(
          '// A disabled account must stop working immediately'
        );

      assert.ok(fastStart >= 0);
      assert.ok(lifecycleStart > fastStart);

      const fastBlock =
        source.slice(
          fastStart,
          lifecycleStart
        );

      assert.ok(
        fastBlock.includes(
          'user = req.user;'
        )
      );

      assert.ok(
        !fastBlock.includes(
          'return next();'
        )
      );

      assert.ok(
        source.includes(
          'if (user.enabled === false)'
        )
      );
    });


    it('uses account revocation only for account lifecycle state, not role-only changes', () => {
      const source =
        read('app/controllers/UserController.js');

      const roleStart =
        source.indexOf(
          'exports.changeRole = async'
        );

      const roleEnd =
        source.indexOf(
          '\nexports.',
          roleStart + 1
        );

      const roleBlock =
        source.slice(
          roleStart,
          roleEnd
        );

      assert.ok(
        !roleBlock.includes(
          'tokenBlacklist.revokeUser('
        )
      );

      const dashStart =
        source.indexOf(
          'exports.updateUserDash = async'
        );

      const dashEnd =
        source.indexOf(
          '\nexports.',
          dashStart + 1
        );

      const dashBlock =
        source.slice(
          dashStart,
          dashEnd
        );

      assert.ok(
        dashBlock.includes(
          'const statusDisabled ='
        )
      );

      assert.ok(
        dashBlock.includes(
          'const statusEnabled ='
        )
      );

      assert.ok(
        dashBlock.includes(
          'tokenBlacklist.unrevokeUser('
        )
      );

      const toggleStart =
        source.indexOf(
          'exports.toggleUserStatus = async'
        );

      const toggleEnd =
        source.indexOf(
          '\nexports.',
          toggleStart + 1
        );

      const toggleBlock =
        source.slice(
          toggleStart,
          toggleEnd
        );

      assert.ok(
        toggleBlock.includes(
          'tokenBlacklist.revokeUser('
        )
      );

      assert.ok(
        toggleBlock.includes(
          'tokenBlacklist.unrevokeUser('
        )
      );
    });


  }
);
