'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

describe('realtime runtime log privacy contract', function () {
  const root = path.resolve(__dirname, '..');

  function source(rel) {
    return fs.readFileSync(
      path.join(root, rel),
      'utf8'
    );
  }

  function logStatements(rel) {
    const lines = source(rel).split(/\r?\n/);

    const startRe =
      /\b(?:console|logger)\.(?:log|info|warn|error|debug)\s*\(/;

    const result = [];

    for (let i = 0; i < lines.length; i += 1) {
      const match = startRe.exec(lines[i]);

      if (!match) {
        continue;
      }

      /*
       * Start at console/logger itself.
       *
       * This prevents application operations earlier on the same line,
       * such as recordMessageEvent({ from, to }), from being mistaken
       * for data emitted by a following catch() logger.
       */
      const first =
        lines[i].slice(match.index);

      const statement = [first];

      let balance =
        first.split('(').length
        - first.split(')').length;

      while (
        balance > 0
        && i + 1 < lines.length
        && statement.length < 40
      ) {
        i += 1;
        statement.push(lines[i]);

        balance +=
          lines[i].split('(').length
          - lines[i].split(')').length;
      }

      result.push(
        statement.join('\n')
      );
    }

    return result;
  }

  function logs(rel) {
    return logStatements(rel)
      .join('\n---LOG---\n');
  }

  it('does not emit chat sender, recipient, socket, message-id, raw-message, or push-target values', function () {
    const text = logs(
      'app/sockets/chat.js'
    );

    const forbidden = [
      /\$\{\s*socket\.userId\s*\}/,
      /\$\{\s*socket\.id\s*\}/,
      /\$\{\s*senderId\s*\}/,
      /\$\{\s*receiverId\s*\}/,
      /\$\{\s*msg\.to\s*\}/,
      /\$\{\s*savedMessage\._id\s*\}/,
      /\$\{\s*pushTarget\s*\}/,

      /,\s*msg\s*\)/,
      /,\s*msg\.to\s*\)/,
      /,\s*savedMessage\._id\s*\)/,
    ];

    for (const pattern of forbidden) {
      assert.doesNotMatch(
        text,
        pattern
      );
    }
  });

  it('permits fixed video role wording but not caller, callee, user, or call identifier values', function () {
    const text = logs(
      'app/sockets/video.js'
    );

    const forbidden = [
      /\$\{\s*caller\s*\}/,
      /\$\{\s*callee\s*\}/,
      /\$\{\s*callerId\s*\}/,
      /\$\{\s*calleeId\s*\}/,
      /\$\{\s*callId\s*\}/,
      /\$\{\s*userId\s*\}/,

      /\bcaller\s*:\s*caller\b/,
      /\bcallee\s*:\s*callee\b/,
      /\bcallerId\s*:\s*callerId\b/,
      /\bcalleeId\s*:\s*calleeId\b/,

      /\bcallId\s*:\s*(?:callId|payload\.callId|currentCallId)\b/,
      /\buserId\s*:\s*(?:userId|me|socket\.userId)\b/,
    ];

    for (const pattern of forbidden) {
      assert.doesNotMatch(
        text,
        pattern
      );
    }

    /*
     * "callee" below is a fixed role label, not a value.
     */
    assert.match(
      text,
      /preserving ringing call after callee socket disconnect/
    );
  });

  it('does not emit helper user/socket IDs or callPush caller/callee/call IDs', function () {
    const text = logs(
      'app/helpers.js'
    );

    const forbidden = [
      /\[STASHED\][^\n]*\$\{\s*userId\s*\}/,
      /\[REPLAY\][^\n]*\$\{\s*userId\s*\}/,
      /\[REPLAY\][^\n]*\$\{\s*socket\.id\s*\}/,
      /Error computing stats for \$\{\s*userId\s*\}/,

      /\[callPush\][^\n]*(?:callId|callerId|calleeId)=/,
      /\$\{\s*payload\.callId\s*\}/,
      /\$\{\s*callerId\s*\}/,
      /\$\{\s*calleeId\s*\}/,
    ];

    for (const pattern of forbidden) {
      assert.doesNotMatch(
        text,
        pattern
      );
    }
  });

  it('does not emit peer-wake call or target identifiers', function () {
    const text = logs(
      'routes/user.js'
    );

    const forbidden = [
      /\bcallId\s*:\s*(?:callId|payload\.callId|activeCallId)\b/,
      /\bactiveCallId\s*:\s*activeCallId\b/,
      /\bto\s*:\s*to\b/,

      /DEBUG:\s*withAuthUser/,
      /Authenticated user from middleware/,
      /Saved Chat Path/,
    ];

    for (const pattern of forbidden) {
      assert.doesNotMatch(
        text,
        pattern
      );
    }
  });

  it('does not emit CallEvent call IDs on persistence failures', function () {
    const text = logs(
      'app/utils/eventLogger.js'
    );

    assert.doesNotMatch(
      text,
      /\bcallId\s*:\s*callId\b/
    );
  });

  it('preserves identity-bearing realtime persistence and delivery operations', function () {
    const chat = source(
      'app/sockets/chat.js'
    );

    const video = source(
      'app/sockets/video.js'
    );

    const eventLogger = source(
      'app/utils/eventLogger.js'
    );

    assert.match(
      chat,
      /\brecordMessageEvent\s*\(/
    );

    assert.match(
      chat,
      /messageId:\s*savedMessage\._id/
    );

    assert.match(
      chat,
      /from:\s*senderId/
    );

    assert.match(
      chat,
      /to:\s*msg\.to/
    );

    assert.match(
      video,
      /\bemitToUser\s*\(/
    );

    assert.match(
      eventLogger,
      /\bCallEvent\b/
    );
  });
});
