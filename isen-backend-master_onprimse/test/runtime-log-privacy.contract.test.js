'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

describe('runtime log privacy contract', function () {
  const backendRoot = path.resolve(__dirname, '..');

  function source(rel) {
    return fs.readFileSync(
      path.join(backendRoot, rel),
      'utf8'
    );
  }

  it('does not log forgot-password email addresses', function () {
    const text = source(
      'app/controllers/AuthController.js'
    );

    assert.doesNotMatch(
      text,
      /forgotPassword[^\n]*\$\{normalizedEmail\}/
    );
  });

  it('does not log avatar filesystem paths', function () {
    const text = source(
      'app/controllers/UserController.js'
    );

    const forbidden = [
      /Requested path to delete:\s*\$\{avatarPath\}/,
      /File found:\s*\$\{avatarPath\}/,
      /File not found or inaccessible:\s*\$\{avatarPath\}/,
      /Failed to unlink avatar:\s*\$\{avatarPath\}/,
      /Avatar directory:\s*\$\{avatarDir\}/,
      /Avatar path:\s*\$\{avatarPath\}/,
      /Writing new avatar file:\s*\$\{avatarPath\}/,
      /Removing old avatar file:\s*\$\{lastAvatarPath\}/,
      /Saving user data with new avatar path:\s*\$\{newAvatarPath\}/,
    ];

    for (const pattern of forbidden) {
      assert.doesNotMatch(
        text,
        pattern
      );
    }
  });

  it('does not log full showPost or storePost objects', function () {
    const text = source(
      'app/controllers/PostController.js'
    );

    const forbidden = [
      /showPost response/,
      /console\.log\(['"]Media attached to post:['"],\s*post\.media/,
      /console\.log\(['"]Saving Post:['"],\s*post/,
      /console\.log\(['"]Saved Post:['"],\s*savedPost/,
      /console\.log\(['"]Populated Post:['"],\s*populatedPost/,
      /console\.log\(['"]Post with Votes Info:['"],\s*processedPost/,
    ];

    for (const pattern of forbidden) {
      assert.doesNotMatch(
        text,
        pattern
      );
    }
  });

  it('does not log user IDs through socketManager', function () {
    const text = source(
      'app/utils/socketManager.js'
    );

    assert.doesNotMatch(
      text,
      /console\.log\([^;\n]*\$\{userId\}/
    );
  });

  it('does not log authenticated WebSocket user ID in socketAuth', function () {
    const text = source(
      'app/middlewares/socketAuth.js'
    );

    assert.doesNotMatch(
      text,
      /WebSocket authenticated for userId/
    );
  });

  it('does not emit request middleware user identifiers', function () {
    const text = source(
      'app/middlewares/request.js'
    );

    assert.doesNotMatch(
      text,
      /requestSender[^\n]*(?:req\.auth\._id|req\.params\.userId)/
    );

    assert.doesNotMatch(
      text,
      /requestReceiver[^\n]*(?:req\.auth\._id|req\.params\.userId)/
    );
  });

  it('does not log update-email wiring, upload user ID, or uploaded file object', function () {
    const text = source(
      'routes/user.js'
    );

    assert.doesNotMatch(
      text,
      /DEBUG:\s*updateEmail/
    );

    assert.doesNotMatch(
      text,
      /Request params userId/
    );

    assert.doesNotMatch(
      text,
      /Uploaded file info/
    );
  });

  it('does not log peer/user/socket identifiers or WebSocket argument payloads in index', function () {
    const text = source(
      'index.js'
    );

    const forbidden = [
      /Stored peerId:\s*\$\{client\.getId\(\)\}/,
      /connected with socket ID \$\{socket\.id\}/,
      /No heartbeat from \$\{socket\.id\}/,
      /Disconnected: User \$\{userId\}/,
      /User \$\{userId\} marked as offline/,
      /WebSocket Event Received:\s*\$\{event\}.*,\s*args/,
      /Presence updated for \$\{u\}, peerId:/,
    ];

    for (const pattern of forbidden) {
      assert.doesNotMatch(
        text,
        pattern
      );
    }
  });

  it('keeps legal/accountability audit mechanisms intact', function () {
    const userRoute = source(
      'routes/user.js'
    );

    const authController = source(
      'app/controllers/AuthController.js'
    );

    assert.match(
      userRoute,
      /\brecordAudit\b/
    );

    assert.match(
      authController,
      /legal acceptance|recordAcceptance|acceptedTerms/i
    );
  });
});
