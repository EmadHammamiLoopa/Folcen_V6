'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');


const repoRoot =
  path.resolve(
    __dirname,
    '..',
    '..'
  );


function read(relativePath) {

  return fs
    .readFileSync(
      path.join(
        repoRoot,
        relativePath
      ),
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
    text.indexOf(
      startMarker
    );

  assert.notStrictEqual(
    start,
    -1,
    `Missing section start: ${startMarker}`
  );


  const end =
    text.indexOf(
      endMarker,
      start +
        startMarker.length
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


function walkTextFiles(root) {

  const out = [];


  function walk(current) {

    if (!fs.existsSync(current)) {
      return;
    }


    for (
      const entry
      of fs.readdirSync(
        current,
        {
          withFileTypes: true
        }
      )
    ) {

      const full =
        path.join(
          current,
          entry.name
        );


      if (entry.isDirectory()) {

        if (
          [
            'node_modules',
            'dist',
            'build',
            '.git'
          ].includes(
            entry.name
          )
        ) {
          continue;
        }

        walk(full);
        continue;
      }


      if (
        /\.(ts|html|js)$/.test(
          entry.name
        )
      ) {

        out.push(
          fs.readFileSync(
            full,
            'utf8'
          )
          .replace(
            /\r\n/g,
            '\n'
          )
        );
      }
    }
  }


  walk(root);

  return out.join('\n');
}


const controller =
  read(
    'isen-backend-master_onprimse/app/controllers/GdprController.js'
  );


const consentModel =
  read(
    'isen-backend-master_onprimse/app/models/UserConsent.js'
  );


const analyticsController =
  read(
    'isen-backend-master_onprimse/app/controllers/InterestAnalyticsController.js'
  );


const routes =
  read(
    'isen-backend-master_onprimse/routes/gdpr.js'
  );


const adminConsent =
  read(
    'geloo-dashboard-master/src/app/modules/dashboard/gdpr/consent-controls/consent-controls.component.ts'
  );


const updateConsent =
  section(
    controller,
    'exports.updateConsent = async',
    '\n};'
  );


const consentStatus =
  section(
    controller,
    'exports.consentStatus = async',
    'const ALLOWED_CONSENT_KEYS'
  );


const recordEvent =
  section(
    analyticsController,
    'exports.recordEvent = async',
    'exports.recomputeInterestProfiles = async'
  );


const interestExplainer =
  section(
    analyticsController,
    'exports.interestExplainer = async',
    'exports.recordEvent = async'
  );


const mainAppSource =
  walkTextFiles(
    path.join(
      repoRoot,
      'src',
      'app'
    )
  );


describe(
  'LEGAL-C3-A1 — optional consent management',
  function () {

    // ========================================================
    // PRESERVED GOOD BEHAVIOURS
    // ========================================================

    it(
      'keeps optional analytics consent default-off',
      function () {

        assert.match(
          consentModel,
          /analytics_optin\s*:\s*\{[\s\S]*?default\s*:\s*false/
        );
      }
    );


    it(
      'keeps consent status and update available as authenticated self-service backend rights',
      function () {

        assert.match(
          routes,
          /router\.get\(\s*['"]\/consent-status['"][\s\S]{0,250}requireSignin[\s\S]{0,250}withAuthUser[\s\S]{0,250}GdprController\.consentStatus/
        );


        assert.match(
          routes,
          /router\.put\(\s*['"]\/consent['"][\s\S]{0,250}requireSignin[\s\S]{0,250}withAuthUser[\s\S]{0,250}GdprController\.updateConsent/
        );
      }
    );


    it(
      'prevents a normal user from updating another users consent',
      function () {

        assert.match(
          updateConsent,
          /req\.body\.userId[\s\S]{0,300}!isAdmin[\s\S]{0,200}403/
        );
      }
    );


    it(
      'keeps an explicit consent-key allowlist and boolean value validation',
      function () {

        assert.match(
          controller,
          /const\s+ALLOWED_CONSENT_KEYS\s*=\s*\[/
        );


        assert.match(
          controller,
          /ALLOWED_CONSENT_KEYS[\s\S]{0,120}['"]analytics_optin['"]/
        );


        assert.match(
          updateConsent,
          /typeof\s+value\s*!==\s*['"]boolean['"]/
        );
      }
    );


    it(
      'records consent changes with old value new value actor and source',
      function () {

        for (
          const marker of [
            'oldValue',
            'newValue',
            'changedAt',
            'changedBy',
            'source'
          ]
        ) {

          assert.match(
            updateConsent,
            new RegExp(
              `\\b${marker}\\b`
            )
          );
        }


        assert.match(
          updateConsent,
          /\$push\s*:\s*\{\s*history\s*:\s*historyEntry/
        );
      }
    );


    it(
      'deletes the derived interest profile when analytics consent is withdrawn',
      function () {

        assert.match(
          updateConsent,
          /key\s*===\s*['"]analytics_optin['"][\s\S]{0,150}value\s*===\s*false/
        );


        assert.match(
          updateConsent,
          /UserInterestProfile[\s\S]{0,150}deleteOne/
        );
      }
    );


    it(
      'does not record analytics events unless the user currently opted in',
      function () {

        assert.match(
          recordEvent,
          /UserConsent\.findOne/
        );


        assert.match(
          recordEvent,
          /!consent\s*\|\|\s*!consent\.analytics_optin/
        );


        assert.match(
          recordEvent,
          /recorded\s*:\s*false/
        );
      }
    );


    it(
      'does not expose the interest explainer when analytics consent is absent',
      function () {

        assert.match(
          interestExplainer,
          /UserConsent\.findOne/
        );


        assert.match(
          interestExplainer,
          /!consent\s*\|\|\s*!consent\.analytics_optin/
        );


        assert.match(
          interestExplainer,
          /hasConsented\s*:\s*false/
        );
      }
    );


    // ========================================================
    // EXPECTED C3 DEFECTS
    // ========================================================

    it(
      'prevents an administrator from granting affirmative optional consent for another user',
      function () {

        // A controller/admin may record or enforce a withdrawal/disable
        // where appropriate, but must not fabricate the data subject's
        // affirmative GDPR consent.

        assert.match(
          updateConsent,
          /value\s*===\s*true[\s\S]{0,500}Response\.sendError/
        );
      }
    );


    it(
      'does not give the admin dashboard a bidirectional toggle that can turn another users consent on',
      function () {

        assert.doesNotMatch(
          adminConsent,
          /updateConsent\(\s*this\.userId\.trim\(\)\s*,\s*key\s*,\s*!current\s*\)/
        );
      }
    );


    it(
      'exposes end-user analytics consent status and withdrawal controls in the main application',
      function () {

        assert.match(
          mainAppSource,
          /gdpr\/consent-status/
        );


        assert.match(
          mainAppSource,
          /['"]gdpr\/consent['"]/
        );


        assert.match(
          mainAppSource,
          /analytics_optin/
        );
      }
    );


    it(
      'does not expose dormant personalization as an active consent purpose',
      function () {

        const consentKeyDeclaration =
          section(
            controller,
            'const ALLOWED_CONSENT_KEYS',
            'exports.updateConsent = async'
          );


        assert.doesNotMatch(
          consentKeyDeclaration,
          /['"]personalization['"]/
        );


        assert.doesNotMatch(
          consentStatus,
          /\bpersonalization\s*:/
        );


        assert.doesNotMatch(
          adminConsent,
          /key\s*:\s*['"]personalization['"]/
        );
      }
    );

  }
);
