'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

describe('logger error privacy contract', function () {
  const logger =
    require('../app/utils/logger');

  const root =
    path.resolve(__dirname, '..');

  function read(rel) {
    return fs.readFileSync(
      path.join(root, rel),
      'utf8'
    );
  }

  function captureConsole(method, fn) {
    const original =
      console[method];

    const calls = [];

    console[method] = (...args) => {
      calls.push(args);
    };

    try {
      fn();
    } finally {
      console[method] =
        original;
    }

    return calls;
  }

  function restoreEnv(name, value) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] =
        value;
    }
  }

  it('omits Error stack traces by default', function () {
    const previous =
      process.env.DEBUG_ERROR_STACKS;

    delete process.env.DEBUG_ERROR_STACKS;

    try {
      const calls =
        captureConsole(
          'error',
          () => {
            logger.error(
              'synthetic failure',
              new Error('synthetic boom')
            );
          }
        );

      assert.strictEqual(
        calls.length,
        1
      );

      const payload =
        JSON.parse(
          calls[0][1]
        );

      assert.strictEqual(
        payload.error.message,
        'synthetic boom'
      );

      assert.strictEqual(
        Object.prototype.hasOwnProperty.call(
          payload.error,
          'stack'
        ),
        false
      );
    } finally {
      restoreEnv(
        'DEBUG_ERROR_STACKS',
        previous
      );
    }
  });

  it('permits stack traces only through explicit diagnostic opt-in', function () {
    const previous =
      process.env.DEBUG_ERROR_STACKS;

    process.env.DEBUG_ERROR_STACKS =
      '1';

    try {
      const calls =
        captureConsole(
          'error',
          () => {
            logger.error(
              'synthetic failure',
              new Error('synthetic boom')
            );
          }
        );

      const payload =
        JSON.parse(
          calls[0][1]
        );

      assert.strictEqual(
        typeof payload.error.stack,
        'string'
      );

      assert.match(
        payload.error.stack,
        /synthetic boom/
      );
    } finally {
      restoreEnv(
        'DEBUG_ERROR_STACKS',
        previous
      );
    }
  });

  it('reduces Error metadata passed to warn logs to its message', function () {
    const calls =
      captureConsole(
        'warn',
        () => {
          logger.warn(
            'synthetic warning',
            new Error('warning boom')
          );
        }
      );

    assert.strictEqual(
      calls.length,
      1
    );

    const payload =
      JSON.parse(
        calls[0][1]
      );

    assert.deepStrictEqual(
      payload,
      {
        message: 'warning boom'
      }
    );
  });

  it('keeps identity-bearing accountability in persistent audit storage', function () {
    const source =
      read('app/utils/logger.js');

    assert.match(
      source,
      /this\.info\(`Audit Event: \$\{action\}`\);/
    );

    assert.match(
      source,
      /recordAudit\(\{ actorId, action, targetUserId, details \}\)/
    );

    assert.match(
      source,
      /Audit Persistence Failed', err, \{ action \}/
    );

    assert.doesNotMatch(
      source,
      /this\.info\(`Audit Event: \$\{action\}`,\s*\{\s*actorId/
    );

    assert.doesNotMatch(
      source,
      /Audit Persistence Failed', err, \{ action, actorId \}/
    );
  });

  it('does not emit residual user, location, channel, or socket identifiers in the focused operational logs', function () {
    const channel =
      read('app/controllers/ChannelController.js');

    const interest =
      read('app/controllers/InterestAnalyticsController.js');

    const auth =
      read('app/controllers/AuthController.js');

    const user =
      read('app/controllers/UserController.js');

    assert.doesNotMatch(
      channel,
      /console\.log\([^;\n]*user\._id/
    );

    assert.doesNotMatch(
      channel,
      /console\.log\([^;\n]*user\.city/
    );

    assert.doesNotMatch(
      channel,
      /console\.log\([^;\n]*channel\.name/
    );

    assert.doesNotMatch(
      interest,
      /console\.error\([^;\n]*Failed to recompute[^;\n]*userId/
    );

    assert.doesNotMatch(
      auth,
      /console\.warn\([^;\n]*Failed to disconnect socket[^;\n]*socketId/
    );

    assert.doesNotMatch(
      user,
      /logger\.warn\([^;\n]*Error forcing socket logout[^;\n]*\bsid\b/
    );
  });

  it('does not fall back to emitting full Error objects in sensitive runtime paths', function () {
    const auth =
      read('app/controllers/AuthController.js');

    const socketAuth =
      read('app/middlewares/socketAuth.js');

    const helpers =
      read('app/helpers.js');

    const index =
      read('index.js');

    assert.match(
      auth,
      /SignIn Error:', error\?\.message \|\| 'unknown error'/
    );

    assert.match(
      socketAuth,
      /Invalid token', error\?\.message \|\| 'unknown error'/
    );

    assert.match(
      helpers,
      /\[callPush\] failed:', err\?\.message \|\| 'unknown error'/
    );

    assert.match(
      index,
      /Failed to persist missedCallsClearedAt:', err\?\.message \|\| 'unknown error'/
    );

    assert.doesNotMatch(
      auth,
      /error && error\.message \? error\.message : error/
    );

    assert.doesNotMatch(
      socketAuth,
      /error && error\.message \? error\.message : error/
    );

    assert.doesNotMatch(
      helpers,
      /err && err\.message \? err\.message : err/
    );

    assert.doesNotMatch(
      index,
      /err && err\.message \? err\.message : err/
    );
  });

  it('preserves explicitly gated diagnostics separately from default logs', function () {
    const user =
      read('app/controllers/UserController.js');

    const errors =
      read('app/middlewares/errors.js');

    assert.match(
      user,
      /process\.env\.DEBUG_PROFILE === '1'/
    );

    assert.match(
      user,
      /process\.env\.DEBUG_USER_SEARCH === '1'/
    );

    assert.match(
      errors,
      /Object\.keys\(req\.headers/
    );
  });
});
