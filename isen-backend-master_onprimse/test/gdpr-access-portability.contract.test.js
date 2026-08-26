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
  'LEGAL-C2-A1 — Article 15 access and Article 20 portability',
  function () {

    // ========================================================
    // PRESERVED GOOD BEHAVIOR
    // ========================================================

    it(
      'preserves legal acceptance history in Article 15 access',
      function () {

        assert.match(
          access,
          /getAcceptancesForUser/
        );

        assert.match(
          access,
          /legalAcceptances/
        );
      }
    );


    it(
      'preserves core user-generated and social datasets in portability',
      function () {

        const required = [
          'const posts = await Post.find',
          'const comments = await Comment.find',
          'const messages = await Message.find',
          'const followers = await Follow.find',
          'const following = await Follow.find',
          'const products = await Product.find',
          'const jobs = await Job.find',
          'const services = await Service.find',
          'const channels = await Channel.find',
          'const notifications = await Notification.find'
        ];

        for (const marker of required) {
          assert.ok(
            portability.includes(marker),
            `Missing portability dataset: ${marker}`
          );
        }
      }
    );


    it(
      'preserves consent, legal history and analytics summary in portability',
      function () {

        assert.match(
          portability,
          /UserConsent/
        );

        assert.match(
          portability,
          /consentRecord/
        );

        assert.match(
          portability,
          /analyticsEventSummary/
        );

        assert.match(
          portability,
          /exportObj\.legalAcceptances/
        );
      }
    );


    it(
      'preserves a structured JSON portability response with bounded paging inputs',
      function () {

        assert.match(
          portability,
          /const page = Math\.max/
        );

        assert.match(
          portability,
          /const limit\s*=\s*Math\.min\(\s*100/
        );

        assert.match(
          portability,
          /Response\.sendResponse\(\s*res,\s*exportObj\s*\)/
        );
      }
    );


    it(
      'does not expose credential secrets in the Article 15 access response path',
      function () {

        assert.doesNotMatch(
          access,
          /\bhashed_password\b/
        );

        assert.doesNotMatch(
          access,
          /\btwoFAToken\b/
        );

        assert.doesNotMatch(
          access,
          /\brawPassword\b/
        );

        assert.doesNotMatch(
          access,
          /\bpassword_confirmation\b/
        );
      }
    );


    // ========================================================
    // ARTICLE 15 DEFECTS
    // ========================================================

    it(
      'includes DSAR account fields that the normal public profile serializer omits',
      function () {

        const requiredAccountFields = [
          'phone',
          'firebaseUid',
          'googleId',
          'acceptedTermsAt',
          'isDeleted',
          'deletedAt',
          'purgeAt'
        ];

        for (
          const field of requiredAccountFields
        ) {
          assert.match(
            access,
            new RegExp(
              `\\b${field}\\b`
            ),
            `Article 15 account copy is missing ${field}`
          );
        }
      }
    );


    it(
      'includes the user content and interaction copy in Article 15 access',
      function () {

        const required = [
          'posts',
          'comments',
          'messages',
          'followers',
          'following',
          'callEvents',
          'messageEvents',
          'notifications'
        ];

        for (const field of required) {
          assert.match(
            access,
            new RegExp(
              `\\b${field}\\b`
            ),
            `Article 15 access is missing ${field}`
          );
        }
      }
    );


    it(
      'includes consent, observed, derived and security-related personal data in Article 15 access',
      function () {

        const requiredModels = [
          'UserConsent',
          'UserInterestProfile',
          'AnalyticsEvent',
          'UserActivityDaily',
          'AuthEvent'
        ];

        for (
          const model of requiredModels
        ) {
          assert.match(
            access,
            new RegExp(
              `\\b${model}\\b`
            ),
            `Article 15 access does not account for ${model}`
          );
        }
      }
    );


    it(
      'includes Article 15 processing information with the data copy',
      function () {

        assert.match(
          access,
          /processingInformation/
        );

        const requiredInformation = [
          'purposes',
          'categories',
          'recipients',
          'retention',
          'rights',
          'source',
          'automatedDecisionMaking'
        ];

        for (
          const field of requiredInformation
        ) {
          assert.match(
            access,
            new RegExp(
              `\\b${field}\\b`
            ),
            `Article 15 processing information is missing ${field}`
          );
        }
      }
    );


    // ========================================================
    // ARTICLE 20 / EXPORT COMPLETENESS DEFECTS
    // ========================================================

    it(
      'includes user-created friend/request relationship history in portability',
      function () {

        assert.match(
          portability,
          /require\(['"]\.\.\/models\/Request['"]\)/
        );

        assert.match(
          portability,
          /requests\s*=\s*await\s+Request\.find/
        );

        assert.match(
          portability,
          /\brequests\b/
        );
      }
    );


    it(
      'reports totals for every paginated portability dataset',
      function () {

        assert.match(
          portability,
          /countDocuments/
        );

        assert.match(
          portability,
          /\btotals\b|\bpaginationManifest\b/
        );
      }
    );


    it(
      'makes pagination completeness explicit instead of silently truncating exports',
      function () {

        assert.match(
          portability,
          /\bhasMore\b/
        );

        assert.match(
          portability,
          /\bnextPage\b/
        );

        assert.match(
          portability,
          /\bcomplete\b|\bpaginationManifest\b/
        );
      }
    );

  }
);
