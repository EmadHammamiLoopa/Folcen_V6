'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

describe('hardcoded MongoDB secret contract', function () {
  this.timeout(10000);
  const root =
    path.resolve(__dirname, '..');

  const excluded =
    new Set([
      'node_modules',
      '.git',
      'coverage',
      'dist',
      'build'
    ]);

  function walk(dir, result = []) {
    for (
      const entry
      of fs.readdirSync(
        dir,
        {
          withFileTypes: true
        }
      )
    ) {
      if (
        excluded.has(entry.name)
      ) {
        continue;
      }

      const full =
        path.join(
          dir,
          entry.name
        );

      if (entry.isDirectory()) {
        walk(
          full,
          result
        );
      } else if (entry.isFile()) {
        result.push(full);
      }
    }

    return result;
  }

  it('contains no credential-bearing MongoDB URI in current source', function () {
    const credentialUri =
      /mongodb(?:\+srv)?:\/\/[^/\s:@]+:[^/\s@]+@/i;

    const hits = [];

    for (
      const file
      of walk(root)
    ) {
      let text;

      try {
        text =
          fs.readFileSync(
            file,
            'utf8'
          );
      } catch (_) {
        continue;
      }

      if (
        credentialUri.test(text)
      ) {
        hits.push(
          path.relative(
            root,
            file
          )
        );
      }
    }

    assert.deepStrictEqual(
      hits,
      []
    );
  });

  it('keeps the known maintenance scripts environment-driven', function () {
    const files = [
      'deleterepport.js',
      'testw.js',
      'test.js',
      'updateChannelType.js',
      'subusertest.js',
      'messagesrest.js',
      'deletepeer.js',
      'tools/reset_friendship.js',
      'scripts/reset_friendship.js',
      'scripts/create_test_user.js',
      'mongodb-cleanup/removeBlobs.js'
    ];

    for (
      const rel
      of files
    ) {
      const text =
        fs.readFileSync(
          path.join(
            root,
            rel
          ),
          'utf8'
        );

      assert.match(
        text,
        /process\.env\.MONGODB_URL/
      );

      assert.match(
        text,
        /MONGODB_URL is required/
      );
    }
  });

  it('does not reintroduce a hardcoded MongoDB fallback', function () {
    const files = [
      'deleterepport.js',
      'testw.js',
      'test.js',
      'updateChannelType.js',
      'subusertest.js',
      'messagesrest.js',
      'deletepeer.js',
      'tools/reset_friendship.js',
      'scripts/reset_friendship.js',
      'scripts/create_test_user.js',
      'mongodb-cleanup/removeBlobs.js'
    ];

    for (
      const rel
      of files
    ) {
      const text =
        fs.readFileSync(
          path.join(
            root,
            rel
          ),
          'utf8'
        );

      assert.doesNotMatch(
        text,
        /process\.env\.MONGODB_URL\s*\|\|\s*['"`]mongodb/i
      );
    }
  });
});
