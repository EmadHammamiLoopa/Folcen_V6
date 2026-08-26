'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot =
  path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs
    .readFileSync(
      path.join(repoRoot, relativePath),
      'utf8'
    )
    .replace(/\r\n/g, '\n');
}

const gdprRoute = read(
  'isen-backend-master_onprimse/routes/gdpr.js'
);

const gdprController = read(
  'isen-backend-master_onprimse/app/controllers/GdprController.js'
);

function routeLine(fragment) {
  return (
    gdprRoute
      .split('\n')
      .find(line => line.includes(fragment)) ||
    ''
  );
}

function exportedBody(
  name,
  nextName
) {
  const start =
    gdprController.indexOf(
      `exports.${name} =`
    );

  assert.notStrictEqual(
    start,
    -1,
    `Missing controller export ${name}`
  );

  let end =
    gdprController.length;

  if (nextName) {
    const next =
      gdprController.indexOf(
        `exports.${nextName} =`,
        start + 1
      );

    if (next !== -1) {
      end = next;
    }
  }

  return gdprController.slice(
    start,
    end
  );
}

describe(
  'LEGAL-C1 — GDPR rights authorization contract',
  function () {

    it(
      'defines one server-side self-or-admin authorization helper',
      function () {
        assert.match(
          gdprController,
          /function\s+canActOnUser\s*\(\s*actor\s*,\s*targetId\s*\)/
        );

        assert.match(
          gdprController,
          /actor\.role\s*===\s*['"]ADMIN['"]/
        );

        assert.match(
          gdprController,
          /actor\.role\s*===\s*['"]SUPER ADMIN['"]/
        );
      }
    );


    it(
      'allows authenticated users to exercise access rights without accepting a newer legal document first',
      function () {
        const line =
          routeLine(
            "router.get('/access'"
          );

        assert.ok(
          line.includes('requireSignin'),
          'access must remain authenticated'
        );

        assert.ok(
          line.includes('withAuthUser'),
          'access must retain authoritative user loading'
        );

        assert.ok(
          line.includes('dsarLimiter'),
          'access must remain rate limited'
        );

        assert.ok(
          !line.includes(
            'requireLatestTermsPrivacy'
          ),
          'GDPR access must not be conditioned on accepting latest Terms/Privacy'
        );
      }
    );


    it(
      'protects cross-user access requests with the server-side self-or-admin check',
      function () {
        const body =
          exportedBody(
            'access',
            'portability'
          );

        assert.ok(
          body.includes(
            'req.query.userId'
          ),
          'access still supports an explicit target for authorized admin use'
        );

        assert.match(
          body,
          /canActOnUser\s*\(\s*actor\s*,\s*req\.query\.userId\s*\)/
        );

        assert.match(
          body,
          /403/
        );
      }
    );


    it(
      'allows self-service portability while retaining authentication and rate limiting',
      function () {
        const line =
          routeLine(
            "router.get('/portability'"
          );

        assert.ok(
          line.includes('requireSignin')
        );

        assert.ok(
          line.includes('withAuthUser')
        );

        assert.ok(
          line.includes('dsarLimiter')
        );

        assert.ok(
          !line.includes('isAdmin'),
          'portability must not be admin-only'
        );
      }
    );


    it(
      'protects cross-user portability requests inside the controller',
      function () {
        const body =
          exportedBody(
            'portability',
            'rectify'
          );

        assert.ok(
          body.includes(
            'req.query.userId'
          )
        );

        assert.match(
          body,
          /canActOnUser\s*\(\s*actor\s*,\s*req\.query\.userId\s*\)/
        );

        assert.match(
          body,
          /403/
        );
      }
    );


    it(
      'allows the authenticated user to invoke the GDPR erasure endpoint for themselves',
      function () {
        const line =
          routeLine(
            "router.post('/erase'"
          );

        assert.ok(
          line.includes('requireSignin')
        );

        assert.ok(
          line.includes('withAuthUser')
        );

        assert.ok(
          line.includes('dsarLimiter')
        );

        assert.ok(
          !line.includes('isAdmin'),
          'self GDPR erasure must not be blocked by an admin-only route'
        );
      }
    );


    it(
      'allows users to read their own consent status',
      function () {
        const line =
          routeLine(
            "router.get('/consent-status'"
          );

        assert.ok(
          line.includes('requireSignin')
        );

        assert.ok(
          line.includes('withAuthUser')
        );

        assert.ok(
          line.includes('dsarLimiter')
        );

        assert.ok(
          !line.includes('isAdmin'),
          'own consent status must be self-service'
        );
      }
    );


    it(
      'allows users to update their own optional consent choices',
      function () {
        const line =
          routeLine(
            "router.put('/consent'"
          );

        assert.ok(
          line.includes('requireSignin')
        );

        assert.ok(
          line.includes('withAuthUser')
        );

        assert.ok(
          line.includes('dsarLimiter')
        );

        assert.ok(
          !line.includes('isAdmin'),
          'own consent withdrawal/update must be self-service'
        );
      }
    );


    it(
      'protects cross-user legal/consent history requests with the self-or-admin check',
      function () {
        const body =
          exportedBody(
            'consentHistory',
            'auditLogs'
          );

        assert.ok(
          body.includes(
            'req.query.userId'
          )
        );

        assert.match(
          body,
          /canActOnUser\s*\(\s*actor\s*,\s*req\.query\.userId\s*\)/
        );

        assert.match(
          body,
          /403/
        );
      }
    );


    it(
      'honours the documented field/newValue rectification request shape',
      function () {
        const body =
          exportedBody(
            'rectify',
            'erase'
          );

        assert.match(
          body,
          /const\s*\{\s*field\s*,\s*newValue\s*\}\s*=\s*req\.body/
        );

        assert.match(
          body,
          /updates\s*\[\s*field\s*\]\s*=\s*newValue/
        );
      }
    );


    it(
      'protects every cross-user rectification target with the self-or-admin check',
      function () {
        const body =
          exportedBody(
            'rectify',
            'erase'
          );

        assert.match(
          body,
          /canActOnUser\s*\(\s*actor\s*,\s*(?:requestedTargetId|req\.body\.userId|req\.params\.userId)\s*\)/
        );

        assert.match(
          body,
          /403/
        );
      }
    );

  }
);
