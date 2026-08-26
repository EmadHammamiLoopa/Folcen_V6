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
    text.indexOf(
      endMarker,
      start + startMarker.length
    );

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


const controller = read(
  'isen-backend-master_onprimse/app/controllers/GdprController.js'
);


const access = section(
  controller,
  'exports.access = async',
  'exports.portability = async'
);


const portability = section(
  controller,
  'exports.portability = async',
  'exports.rectify = async'
);


describe(
  'LEGAL-C2-A1.1 — extended personal-data inventory',
  function () {

    // ========================================================
    // PRESERVED ARTICLE 15 / ARTICLE 20 DISTINCTION
    // ========================================================

    it(
      'does not put the inferred UserInterestProfile into the portability payload',
      function () {

        assert.doesNotMatch(
          portability,
          /\bUserInterestProfile\b/
        );
      }
    );


    it(
      'does not put authentication/security AuthEvent records into the portability payload',
      function () {

        assert.doesNotMatch(
          portability,
          /\bAuthEvent\b/
        );
      }
    );


    // ========================================================
    // ARTICLE 15 — APPLICATION DATA INVENTORY
    // ========================================================

    it(
      'accounts for the remaining application and business records in Article 15 access',
      function () {

        const required = [
          'Activity',
          'Report',
          'Product',
          'Job',
          'Service',
          'Channel',
          'Request'
        ];

        for (const model of required) {
          assert.match(
            access,
            new RegExp(
              `\\b${model}\\b`
            ),
            `Article 15 access does not account for ${model}`
          );
        }

        const responseFields = [
          'activities',
          'reports',
          'products',
          'jobs',
          'services',
          'channels',
          'requests'
        ];

        for (const field of responseFields) {
          assert.match(
            access,
            new RegExp(
              `\\b${field}\\b`
            ),
            `Article 15 access response is missing ${field}`
          );
        }
      }
    );


    it(
      'accounts for device, subscription and peer identifiers in Article 15 access',
      function () {

        const required = [
          'PushToken',
          'Subscription',
          'Peer'
        ];

        for (const model of required) {
          assert.match(
            access,
            new RegExp(
              `\\b${model}\\b`
            ),
            `Article 15 access does not account for ${model}`
          );
        }

        assert.match(
          access,
          /\bpushTokens\b/
        );

        assert.match(
          access,
          /\bsubscriptions\b/
        );

        assert.match(
          access,
          /\bpeerIdentifiers\b/
        );
      }
    );


    it(
      'accounts for subject-related audit records in Article 15 access',
      function () {

        assert.match(
          access,
          /\bAuditLog\b/
        );

        assert.match(
          access,
          /\bactorId\b/
        );

        assert.match(
          access,
          /\btargetUserId\b/
        );

        assert.match(
          access,
          /\bauditLogs\b/
        );
      }
    );


    // ========================================================
    // ARTICLE 20 — SCHEMA ACCURACY / DATA CLASSIFICATION
    // ========================================================

    it(
      'exports the real notification schema fields instead of a nonexistent message field',
      function () {

        assert.match(
          portability,
          /\.select\(\s*['"]type title body data read createdAt['"]\s*\)/
        );

        assert.doesNotMatch(
          portability,
          /\.select\(\s*['"]type message createdAt['"]\s*\)/
        );
      }
    );


    it(
      'separates observed analytics from derived analytics in portability',
      function () {

        // Raw consent-based activity observations may belong to Article 20.
        assert.match(
          portability,
          /AnalyticsEvent\.find/
        );

        assert.match(
          portability,
          /\banalyticsEvents\b/
        );

        // Derived/aggregate information may still be supplied as helpful
        // supplementary information, but must not be silently represented as
        // the core Article 20 portable dataset.
        assert.match(
          portability,
          /\bportableData\b/
        );

        assert.match(
          portability,
          /\bsupplementary\b/
        );

        assert.match(
          portability,
          /\bderived\b/
        );

        assert.match(
          portability,
          /\banalyticsEventSummary\b/
        );
      }
    );

  }
);
