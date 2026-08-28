'use strict';

const assert =
  require('assert');
const fs =
  require('fs');
const path =
  require('path');

const {
  normalizeTokenVersion,
  bumpTokenVersion,
  tokenVersionMatches,
} =
  require('../app/utils/tokenVersion');

const root =
  path.resolve(__dirname, '..');

const read = rel =>
  fs.readFileSync(
    path.join(root, rel),
    'utf8'
  );

const exportedBlock = (
  source,
  name
) => {
  const marker =
    `exports.${name} =`;

  const start =
    source.indexOf(marker);

  assert.ok(
    start >= 0,
    `${name} not found`
  );

  const tail =
    source.slice(
      start + marker.length
    );

  const match =
    tail.match(
      /\nexports\.[A-Za-z0-9_]+\s*=/
    );

  return source.slice(
    start,
    match
      ? start +
        marker.length +
        match.index
      : source.length
  );
};

describe(
  'D2-G6 persistent JWT generation security contract',
  () => {
    const userModel =
      read('app/models/User.js');

    const authController =
      read('app/controllers/AuthController.js');

    const userController =
      read('app/controllers/UserController.js');

    const authMiddleware =
      read('app/middlewares/auth.js');

    const socketAuth =
      read('app/middlewares/socketAuth.js');

    it(
      'defines a persistent generation with legacy generation zero',
      () => {
        assert.match(
          userModel,
          /tokenVersion\s*:\s*\{[\s\S]*default\s*:\s*0/
        );

        assert.strictEqual(
          normalizeTokenVersion(undefined),
          0
        );

        assert.strictEqual(
          normalizeTokenVersion(0),
          0
        );

        assert.strictEqual(
          bumpTokenVersion(0),
          1
        );

        assert.ok(
          tokenVersionMatches(
            undefined,
            0
          )
        );

        assert.ok(
          !tokenVersionMatches(
            undefined,
            1
          )
        );
      }
    );

    it(
      'binds both local JWT creation paths to the current generation',
      () => {
        const matches =
          authController.match(
            /tokenVersion:\s*normalizeTokenVersion\(user\.tokenVersion\)/g
          ) || [];

        assert.strictEqual(
          matches.length,
          2
        );
      }
    );

    it(
      'loads a real User document for password mutation instead of mutating the lean auth actor',
      () => {
        const block =
          exportedBlock(
            userController,
            'updatePassword'
          );

        assert.match(
          block,
          /await\s+User\.findById\(\s*authUserId\s*\)/
        );

        assert.doesNotMatch(
          block,
          /const\s+authUser\s*=\s*req\.authUser/
        );

        assert.match(
          block,
          /authUser\.authenticate\(/
        );

        assert.match(
          block,
          /await\s+authUser\.save\(\)/
        );
      }
    );

    it(
      'separates password generation invalidation from lifecycle account revocation',
      () => {
        const selfBlock =
          exportedBlock(
            userController,
            'updatePassword'
          );

        const dashboardBlock =
          exportedBlock(
            userController,
            'updateUserDash'
          );

        assert.match(
          selfBlock,
          /bumpTokenVersion/
        );

        assert.doesNotMatch(
          selfBlock,
          /tokenBlacklist\.revokeUser/
        );

        assert.match(
          dashboardBlock,
          /if\s*\(\s*statusDisabled\s*\)\s*\{[\s\S]*?tokenBlacklist\.revokeUser/
        );

        assert.doesNotMatch(
          dashboardBlock,
          /statusDisabled\s*\|\|[\s\S]{0,120}passwordChanged/
        );

        assert.match(
          dashboardBlock,
          /tokenBlacklist\.unrevokeUser/
        );

        assert.match(
          dashboardBlock,
          /bumpTokenVersion/
        );
      }
    );

    it(
      'treats only a genuinely missing token version as legacy zero and rejects explicit malformed values',
      () => {
        const {
          normalizeTokenVersion,
          bumpTokenVersion,
          tokenVersionMatches
        } = require(
          '../app/utils/tokenVersion'
        );

        assert.strictEqual(
          normalizeTokenVersion(undefined),
          0
        );

        assert.strictEqual(
          normalizeTokenVersion(0),
          0
        );

        assert.strictEqual(
          normalizeTokenVersion(7),
          7
        );

        for (
          const invalid of [
            null,
            '0',
            'garbage',
            -1,
            1.5,
            NaN,
            Infinity
          ]
        ) {
          assert.strictEqual(
            normalizeTokenVersion(invalid),
            null
          );
        }

        assert.strictEqual(
          tokenVersionMatches(
            undefined,
            undefined
          ),
          true
        );

        assert.strictEqual(
          tokenVersionMatches(
            undefined,
            0
          ),
          true
        );

        assert.strictEqual(
          tokenVersionMatches(
            0,
            undefined
          ),
          true
        );

        assert.strictEqual(
          tokenVersionMatches(
            'garbage',
            0
          ),
          false
        );

        assert.strictEqual(
          tokenVersionMatches(
            null,
            0
          ),
          false
        );

        assert.strictEqual(
          tokenVersionMatches(
            -1,
            0
          ),
          false
        );

        assert.strictEqual(
          tokenVersionMatches(
            1.5,
            0
          ),
          false
        );

        assert.strictEqual(
          tokenVersionMatches(
            0,
            'garbage'
          ),
          false
        );

        assert.strictEqual(
          bumpTokenVersion(undefined),
          1
        );

        assert.strictEqual(
          bumpTokenVersion(0),
          1
        );

        assert.throws(
          () =>
            bumpTokenVersion(
              'garbage'
            ),
          /Invalid token version/
        );

        assert.throws(
          () =>
            bumpTokenVersion(
              null
            ),
          /Invalid token version/
        );

        assert.throws(
          () =>
            bumpTokenVersion(
              -1
            ),
          /Invalid token version/
        );
      }
    );

    it(
      'persists a generation bump on administrative disable before account revocation can later be cleared',
      () => {
        const dashboardBlock =
          exportedBlock(
            userController,
            'updateUserDash'
          );

        const statusIndex =
          dashboardBlock.indexOf(
            'const statusDisabled'
          );

        const disableGenerationIndex =
          dashboardBlock.indexOf(
            'if (statusDisabled)'
          );

        const generationBumpIndex =
          dashboardBlock.indexOf(
            'bumpTokenVersion',
            disableGenerationIndex
          );

        const saveIndex =
          dashboardBlock.indexOf(
            'await user.save()',
            statusIndex
          );

        const revokeIndex =
          dashboardBlock.indexOf(
            'tokenBlacklist.revokeUser',
            statusIndex
          );

        const unrevokeIndex =
          dashboardBlock.indexOf(
            'tokenBlacklist.unrevokeUser',
            statusIndex
          );

        assert.ok(
          statusIndex >= 0
        );

        assert.ok(
          disableGenerationIndex >
          statusIndex
        );

        assert.ok(
          generationBumpIndex >
          disableGenerationIndex
        );

        assert.ok(
          saveIndex >
          generationBumpIndex
        );

        assert.ok(
          revokeIndex >
          saveIndex
        );

        assert.ok(
          unrevokeIndex >
          revokeIndex
        );

        const disableGenerationRegion =
          dashboardBlock.slice(
            disableGenerationIndex,
            saveIndex
          );

        assert.match(
          disableGenerationRegion,
          /user\.tokenVersion\s*=\s*[\s\S]*?bumpTokenVersion\s*\(/
        );
      }
    );

    it(
      'rejects JWT query-string transport while preserving bearer and existing cookie token sources',
      () => {
        assert.ok(
          !authMiddleware.includes(
            'req.query.token'
          )
        );

        assert.ok(
          authMiddleware.includes(
            'req.headers.authorization'
          )
        );

        assert.ok(
          authMiddleware.includes(
            'req.cookies.token'
          )
        );

        assert.ok(
          authMiddleware.includes(
            "authHeader.split(' ')[0] === 'Bearer'"
          )
        );
      }
    );

    it(
      'increments generation before self-service password save',
      () => {
        const block =
          exportedBlock(
            userController,
            'updatePassword'
          );

        const assign =
          block.indexOf(
            'authUser.password = password'
          );

        const bump =
          block.indexOf(
            'bumpTokenVersion('
          );

        const save =
          block.indexOf(
            'await authUser.save()'
          );

        assert.ok(
          assign >= 0 &&
          bump > assign &&
          save > bump
        );
      }
    );

    it(
      'never logs the supplied current password or stored password hash',
      () => {
        assert.doesNotMatch(
          userController,
          /Provided current password:/
        );

        assert.doesNotMatch(
          userController,
          /Stored hashed password in the database:/
        );

        assert.doesNotMatch(
          exportedBlock(
            userController,
            'updatePassword'
          ),
          /logger\.[a-z]+\([^)]*current_password/
        );
      }
    );

    it(
      'increments generation on dashboard password replacement and blocks direct version assignment',
      () => {
        const block =
          exportedBlock(
            userController,
            'updateUserDash'
          );

        assert.match(
          block,
          /user\.tokenVersion\s*=\s*bumpTokenVersion\(\s*user\.tokenVersion\s*\)/
        );

        assert.match(
          block,
          /['"]tokenVersion['"]/
        );
      }
    );

    it(
      'only bumps Firebase generation when an existing Mongo credential actually changed',
      () => {
        const block =
          exportedBlock(
            authController,
            'firebaseLogin'
          );

        assert.match(
          block,
          /bcrypt\.compare\(\s*rawPassword,\s*user\.hashed_password\s*\)/
        );

        assert.match(
          block,
          /if\s*\(!passwordMatchesMongo\)/
        );

        assert.match(
          block,
          /if\s*\(hadMongoPassword\)[\s\S]*bumpTokenVersion/
        );
      }
    );

    it(
      'does not invalidate sessions merely because a password-reset email was requested',
      () => {
        const block =
          exportedBlock(
            authController,
            'forgotPassword'
          );

        assert.doesNotMatch(
          block,
          /bumpTokenVersion/
        );

        assert.doesNotMatch(
          block,
          /revokeUser\(/
        );
      }
    );

    it(
      'checks token generation centrally in requireSignin using live user state',
      () => {
        assert.match(
          authMiddleware,
          /AUTH_USER_BASE_FIELDS[\s\S]*tokenVersion/
        );

        assert.match(
          authMiddleware,
          /startAuthUserPrefetch\(\s*req,\s*userId,\s*true\s*\)/
        );

        const block =
          exportedBlock(
            authMiddleware,
            'requireSignin'
          );

        const checks =
          block.match(
            /rejectIfTokenVersionStale\(req,\s*res\)/g
          ) || [];

        assert.strictEqual(
          checks.length,
          2
        );
      }
    );

    it(
      'keeps legacy missing token claims valid only while the live account remains generation zero',
      () => {
        assert.ok(
          tokenVersionMatches(
            undefined,
            undefined
          )
        );

        assert.ok(
          tokenVersionMatches(
            undefined,
            0
          )
        );

        assert.ok(
          !tokenVersionMatches(
            undefined,
            1
          )
        );

        assert.ok(
          !tokenVersionMatches(
            1,
            2
          )
        );
      }
    );

    it(
      'enforces the same generation boundary for WebSocket authentication',
      () => {
        assert.match(
          socketAuth,
          /tokenVersionMatches\(\s*decoded\s*&&\s*decoded\.tokenVersion,\s*user\s*&&\s*user\.tokenVersion\s*\)/
        );

        assert.ok(
          socketAuth.indexOf(
            'tokenVersionMatches('
          ) <
          socketAuth.indexOf(
            'socket.authUser = user'
          )
        );
      }
    );
  }
);
