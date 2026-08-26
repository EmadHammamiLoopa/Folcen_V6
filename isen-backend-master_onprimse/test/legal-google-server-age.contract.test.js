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

function section(
  text,
  startMarker,
  endMarker
) {
  const start =
    text.indexOf(startMarker);

  assert.notStrictEqual(
    start,
    -1,
    `Missing section start: ${startMarker}`
  );

  const end =
    endMarker
      ? text.indexOf(
          endMarker,
          start + startMarker.length
        )
      : text.length;

  assert.notStrictEqual(
    end,
    -1,
    `Missing section end: ${endMarker}`
  );

  return text.slice(
    start,
    end
  );
}

const authService = read(
  'src/app/services/auth.service.ts'
);

const authController = read(
  'isen-backend-master_onprimse/app/controllers/AuthController.js'
);


describe(
  'LEGAL-C1-A2.1 — Google acceptance and server age bypasses',
  function () {

    it(
      'does not inject acceptedTerms=true into the shared Google profile builder',
      function () {
        const builder = section(
          authService,
          'private buildGoogleProfile(',
          'async firebaseSignup('
        );

        assert.doesNotMatch(
          builder,
          /acceptedTerms\s*:\s*true/
        );
      }
    );


    it(
      'enforces authoritative 18+ validation inside Firebase/Google account completion',
      function () {
        const firebaseLogin = section(
          authController,
          'exports.firebaseLogin = async',
          'exports.firebaseProfile = async'
        );

        assert.match(
          firebaseLogin,
          /isAtLeast18\s*\(\s*socialProfile\.birthDate\s*\)/
        );

        const creationIndex =
          firebaseLogin.indexOf(
            'user = new User({'
          );

        const ageCheckIndex =
          firebaseLogin.indexOf(
            'isAtLeast18(socialProfile.birthDate)'
          );

        assert.notStrictEqual(
          creationIndex,
          -1,
          'Firebase user creation block missing'
        );

        assert.notStrictEqual(
          ageCheckIndex,
          -1,
          'authoritative age check missing'
        );

        assert.ok(
          ageCheckIndex < creationIndex,
          '18+ validation must happen before a new MongoDB user is created'
        );
      }
    );

  }
);
