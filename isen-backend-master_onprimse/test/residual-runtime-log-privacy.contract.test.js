'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

describe('residual runtime log privacy contract', function () {
  const root =
    path.resolve(__dirname, '..');

  function read(rel) {
    return fs.readFileSync(
      path.join(root, rel),
      'utf8'
    );
  }

  it('does not log default-runtime user identity or user documents', function () {
    const source =
      read('app/controllers/UserController.js');

    const forbidden = [
      /(?:console|logger)\.(?:log|info|warn|error|debug)\([^;\n]*showUserDash[^;\n]*userId/i,
      /(?:console|logger)\.(?:log|info|warn|error|debug)\([^;\n]*Authenticated user:[^;\n]*req\.authUser/i,
      /(?:console|logger)\.(?:log|info|warn|error|debug)\([^;\n]*User document:[^;\n]*\buser\b/i,
      /(?:console|logger)\.(?:log|info|warn|error|debug)\([^;\n]*removed friendship[^;\n]*authUser\._id/i,
      /(?:console|logger)\.(?:log|info|warn|error|debug)\([^;\n]*update(?:RandomVisibility|AgeVisibility|NonFriendVideoRequests|Privacy|GenderVisibility)[^;\n]*userId/i,
      /(?:console|logger)\.(?:log|info|warn|error|debug)\([^;\n]*AuthUser (?:before|after) update/i
    ];

    for (const pattern of forbidden) {
      assert.doesNotMatch(
        source,
        pattern
      );
    }
  });

  it('does not log admin message payload or auth objects', function () {
    const source =
      read('app/controllers/AdminController.js');

    const forbidden = [
      /console\.log\([^;\n]*sendAdminMessage: body/i,
      /console\.log\([^;\n]*sendAdminMessage: auth['"]\s*,\s*req\.auth/i,
      /console\.log\([^;\n]*decoded ID[^;\n]*->/i,
      /console\.warn\([^;\n]*invalid userId/i,
      /console\.error\([^;\n]*save message for user/i,
      /console\.error\([^;\n]*Validation errors:/i
    ];

    for (const pattern of forbidden) {
      assert.doesNotMatch(
        source,
        pattern
      );
    }

    assert.match(
      source,
      /AdminController\.sendAdminMessage: authenticated request/
    );
  });

  it('does not log product request payloads or product documents', function () {
    const source =
      read('app/controllers/ProductController.js');

    assert.doesNotMatch(
      source,
      /console\.log\([^;\n]*Parsed fields:[^;\n]*req\.fields/i
    );

    assert.doesNotMatch(
      source,
      /console\.log\([^;\n]*Parsed files:[^;\n]*req\.files/i
    );

    assert.doesNotMatch(
      source,
      /console\.log\([^;\n]*Product before saving:[^;\n]*product/i
    );

    assert.doesNotMatch(
      source,
      /console\.log\([^;\n]*Product saved successfully:[^;\n]*product\s*\)/i
    );

    assert.doesNotMatch(
      source,
      /console\.log\([^;\n]*Product photos stored:[^;\n]*,\s*product\.photos\s*\)/i
    );

    assert.match(
      source,
      /Product photos stored:', Array\.isArray\(product\.photos\) \? product\.photos\.length : 0/
    );
  });

  it('does not place account identifiers into generic operational logs', function () {
    const logging =
      read('app/middlewares/logging.js');

    const auth =
      read('app/middlewares/auth.js');

    const errors =
      read('app/middlewares/errors.js');

    const events =
      read('app/utils/eventLogger.js');

    const jobs =
      read('app/jobs.js');

    assert.doesNotMatch(
      logging,
      /\[INCOMING\][^;\n]*user:/i
    );

    assert.doesNotMatch(
      logging,
      /\[INCOMING\][^;\n]*req\.originalUrl/i
    );

    assert.doesNotMatch(
      auth,
      /requireEmailVerified:[^;\n]*req\.authUser\._id/i
    );

    assert.doesNotMatch(
      errors,
      /\[ERROR-MW\][^;\n]*req\.originalUrl/i
    );

    assert.doesNotMatch(
      events,
      /\[Auto-Ban\][^;\n]*targetUserId/i
    );

    assert.doesNotMatch(
      jobs,
      /console\.(?:log|warn|error)\([^;\n]*\$\{user\._id\}/i
    );
  });

  it('logs only error messages for targeted MessageController failures', function () {
    const source =
      read('app/controllers/MessageController.js');

    assert.match(
      source,
      /storeMessage error:', error\?\.message/
    );

    assert.match(
      source,
      /Error fetching users messages:', err\?\.message/
    );

    assert.match(
      source,
      /deleteMessage opener lease reconciliation failed:', leaseErr\?\.message/
    );

    assert.match(
      source,
      /Error deleting message:', error\?\.message/
    );

    assert.match(
      source,
      /sendMessagePermission error:', error\?\.message/
    );

    assert.doesNotMatch(
      source,
      /storeMessage error:',\s*error\);/
    );
  });

  it('preserves structured accountability hooks', function () {
    const user =
      read('app/controllers/UserController.js');

    const eventLogger =
      read('app/utils/eventLogger.js');

    const chat =
      read('app/sockets/chat.js');

    assert.match(
      user,
      /recordAudit/
    );

    assert.match(
      eventLogger,
      /async function recordMessageEvent/
    );

    assert.match(
      chat,
      /recordMessageEvent\(/
    );
  });
});
