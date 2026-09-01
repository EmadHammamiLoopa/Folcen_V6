'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

describe('password crypto fail-closed contract', function () {
  const backendRoot = path.resolve(__dirname, '..');
  const userModelPath = path.join(
    backendRoot,
    'app',
    'models',
    'User.js'
  );

  it('contains no devhash SHA-256 password fallback', function () {
    const source = fs.readFileSync(
      userModelPath,
      'utf8'
    );

    assert.strictEqual(
      source.includes('devhash:'),
      false,
      'User model must not contain the former devhash password fallback'
    );

    assert.match(
      source,
      /Password hashing unavailable: failed to load both bcrypt and bcryptjs/
    );
  });

  it('fails closed when both bcrypt implementations are unavailable', function () {
    const script = `
      const Module = require('module');
      const originalLoad = Module._load;

      Module._load = function(request, parent, isMain) {
        if (request === 'bcrypt' || request === 'bcryptjs') {
          const err = new Error('simulated missing ' + request);
          err.code = 'MODULE_NOT_FOUND';
          throw err;
        }

        return originalLoad.call(this, request, parent, isMain);
      };

      try {
        require('./app/models/User');
        console.error('USER_MODEL_UNEXPECTEDLY_LOADED');
        process.exit(41);
      } catch (err) {
        const message = String(err && err.message || '');

        if (!message.includes(
          'Password hashing unavailable: failed to load both bcrypt and bcryptjs'
        )) {
          console.error(message);
          process.exit(42);
        }

        console.log('PASSWORD_CRYPTO_FAIL_CLOSED');
        process.exit(0);
      }
    `;

    const result = spawnSync(
      process.execPath,
      ['-e', script],
      {
        cwd: backendRoot,
        env: {
          ...process.env,
          NODE_ENV: 'production'
        },
        encoding: 'utf8',
        timeout: 15000
      }
    );

    assert.strictEqual(
      result.error,
      undefined,
      result.error && result.error.message
    );

    assert.strictEqual(
      result.status,
      0,
      `child failed\nstdout=${result.stdout}\nstderr=${result.stderr}`
    );

    assert.match(
      result.stdout,
      /PASSWORD_CRYPTO_FAIL_CLOSED/
    );

    assert.doesNotMatch(
      result.stdout + result.stderr,
      /devhash:/
    );
  });

  it('uses bcryptjs when only native bcrypt is unavailable', function () {
    const script = `
      const Module = require('module');
      const originalLoad = Module._load;

      Module._load = function(request, parent, isMain) {
        if (request === 'bcrypt') {
          const err = new Error('simulated missing bcrypt');
          err.code = 'MODULE_NOT_FOUND';
          throw err;
        }

        return originalLoad.call(this, request, parent, isMain);
      };

      (async () => {
        const User = require('./app/models/User');
        const user = new User();

        user.password = 'Folcen-P21C-Fallback-Password!';

        const hash = String(user.hashed_password || '');

        if (!/^\\$2[aby]\\$10\\$/.test(hash)) {
          console.error('unexpected hash format: ' + hash.slice(0, 16));
          process.exit(51);
        }

        if (!await user.comparePassword(
          'Folcen-P21C-Fallback-Password!'
        )) {
          console.error('bcryptjs comparison failed');
          process.exit(52);
        }

        if (await user.comparePassword(
          'Folcen-P21C-Wrong-Password!'
        )) {
          console.error('wrong password accepted');
          process.exit(53);
        }

        console.log('BCRYPTJS_FALLBACK_SECURE');
      })().catch(err => {
        console.error(err);
        process.exit(54);
      });
    `;

    const result = spawnSync(
      process.execPath,
      ['-e', script],
      {
        cwd: backendRoot,
        env: {
          ...process.env,
          NODE_ENV: 'production'
        },
        encoding: 'utf8',
        timeout: 15000
      }
    );

    assert.strictEqual(
      result.error,
      undefined,
      result.error && result.error.message
    );

    assert.strictEqual(
      result.status,
      0,
      `child failed\nstdout=${result.stdout}\nstderr=${result.stderr}`
    );

    assert.match(
      result.stdout,
      /BCRYPTJS_FALLBACK_SECURE/
    );
  });

  it('keeps the normal native bcrypt password path operational', async function () {
    const bcrypt = require('bcrypt');

    const password =
      'Folcen-P21C-Native-Bcrypt!';

    const hash =
      await bcrypt.hash(
        password,
        10
      );

    assert.match(
      hash,
      /^\$2[aby]\$10\$/
    );

    assert.strictEqual(
      await bcrypt.compare(
        password,
        hash
      ),
      true
    );

    assert.strictEqual(
      await bcrypt.compare(
        password + '-wrong',
        hash
      ),
      false
    );
  });
});
