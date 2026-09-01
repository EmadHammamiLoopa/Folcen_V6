'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

describe('repository MongoDB secret contract', function () {
  const backendRoot =
    path.resolve(__dirname, '..');

  const repoRoot =
    path.resolve(backendRoot, '..');

  const credentialPattern =
    'mongodb(\\\\+srv)?://[^/[:space:]:@]+:[^/[:space:]@]+@';

  it('does not track credential-bearing MongoDB URIs anywhere in the repository', function () {
    const result =
      spawnSync(
        'git',
        [
          'grep',
          '-I',
          '-n',
          '-E',
          credentialPattern,
          '--'
        ],
        {
          cwd: repoRoot,
          encoding: 'utf8'
        }
      );

    assert.ok(
      result.status === 1,
      `credential-bearing MongoDB URI found in tracked repository files:\n${result.stdout || ''}`
    );
  });

  it('keeps the two historical utility owners environment-only and fail-closed', function () {
    const tempScript =
      fs.readFileSync(
        path.join(
          repoRoot,
          '.tmp_auth_test_run',
          'reset_friendship.js'
        ),
        'utf8'
      );

    const staticFollowScript =
      fs.readFileSync(
        path.join(
          repoRoot,
          'scripts',
          'check_persist_static_follows.js'
        ),
        'utf8'
      );

    assert.match(
      tempScript,
      /const MONGO_URI = process\.env\.MONGODB_URL;/
    );

    assert.match(
      tempScript,
      /if \(!MONGO_URI\)/
    );

    assert.match(
      tempScript,
      /mongoose\.connect\(MONGO_URI\)/
    );

    const deprecatedOptions = [
      'useNew' + 'UrlParser',
      'useUnified' + 'Topology'
    ];

    for (const option of deprecatedOptions) {
      assert.strictEqual(
        tempScript.includes(option),
        false
      );
    }

    assert.match(
      staticFollowScript,
      /const mongoUri = process\.env\.MONGODB_URL;/
    );

    assert.match(
      staticFollowScript,
      /if \(!mongoUri\)/
    );

    assert.match(
      staticFollowScript,
      /mongoose\.connect\(mongoUri\)/
    );
  });
});
