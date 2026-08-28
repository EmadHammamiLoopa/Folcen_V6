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

describe('Admin dashboard moderation lifecycle contract', () => {

  it('loads a live database actor for report admin routes', () => {
    const src = read('routes/report.js');

    assert.ok(
      src.includes(
        "router.get('/all', [requireSignin, withAuthUser, isAdmin]"
      )
    );

    assert.ok(
      src.includes(
        "router.post('/:reportId/action', [requireSignin, withAuthUser, isAdmin]"
      )
    );
  });

  it('does not expose Article 17 erasure as a report moderation action', () => {
    const src =
      read('app/controllers/ReportController.js');

    const start =
      src.indexOf(
        'exports.takeActionOnReport = async'
      );

    const end =
      src.indexOf(
        'exports.showReport = async',
        start
      );

    const block =
      src.slice(start, end);

    assert.ok(
      block.includes(
        "if (action === 'deleteUser')"
      )
    );

    assert.ok(
      block.includes(
        'Use the GDPR Erasure Centre'
      )
    );

    assert.ok(
      !block.includes(
        'await purgeUser(targetUserId)'
      )
    );
  });

  it('protects administrator targets from ordinary-admin report bans', () => {
    const src =
      read('app/controllers/ReportController.js');

    assert.ok(
      src.includes(
        'isAdminRole(targetUser.role)'
      )
    );

    assert.ok(
      src.includes(
        "actor.role !== 'SUPER ADMIN'"
      )
    );

    assert.ok(
      src.includes(
        'wouldRemoveLastActiveSuperAdmin'
      )
    );
  });

  it('treats an actively banned super admin as operationally inactive', () => {
    const src =
      read('app/utils/adminLifecycle.js');

    assert.ok(
      src.includes(
        'function hasActiveBan'
      )
    );

    assert.ok(
      src.includes(
        '!hasActiveBan(user)'
      )
    );

    assert.ok(
      src.includes(
        "{ banned: { $ne: true } }"
      )
    );
  });

  it('protects privileged targets in direct ban/unban flows', () => {
    const src =
      read('app/controllers/UserController.js');

    const banStart =
      src.indexOf(
        'exports.banUser = async'
      );

    const verifyStart =
      src.indexOf(
        'exports.verifyUser = async',
        banStart
      );

    const block =
      src.slice(
        banStart,
        verifyStart
      );

    assert.ok(
      block.includes(
        'isAdminRole(user.role)'
      )
    );

    assert.ok(
      block.includes(
        'wouldRemoveLastActiveSuperAdmin'
      )
    );

    assert.ok(
      block.includes(
        'tokenBlacklist.revokeUser'
      )
    );

    assert.ok(
      block.includes(
        'tokenBlacklist.unrevokeUser'
      )
    );

    assert.ok(
      !block.includes(
        'Blockingusers.txt'
      )
    );
  });

});
