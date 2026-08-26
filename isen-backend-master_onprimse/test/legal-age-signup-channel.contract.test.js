'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  signupValidator
} = require(
  '../app/middlewares/validators/authValidator'
);


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

  let end =
    text.length;

  if (endMarker) {
    const candidate =
      text.indexOf(
        endMarker,
        start + startMarker.length
      );

    if (candidate !== -1) {
      end = candidate;
    }
  }

  return text.slice(
    start,
    end
  );
}


function formatLocalDate(date) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, '0');

  const day =
    String(
      date.getDate()
    ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}


function birthDateExactlyYearsAgo(
  years,
  dayOffset = 0
) {
  const now = new Date();

  return new Date(
    now.getFullYear() - years,
    now.getMonth(),
    now.getDate() + dayOffset
  );
}


function validSignupBody(
  birthDate
) {
  return {
    firstName: 'Legal',
    lastName: 'Tester',
    email: 'legal-age-test@example.com',
    password: 'Strong!1x',
    password_confirmation: 'Strong!1x',
    gender: 'prefer not to say',
    birthDate,
    school: '',
    education: '',
    profession: '',
    aboutMe: ''
  };
}


function runSignupValidator(
  birthDate
) {
  const req = {
    body: validSignupBody(
      birthDate
    )
  };

  let nextCalled = false;

  const res = {
    statusCode: 200,
    body: null,

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(payload) {
      this.body = payload;
      return payload;
    }
  };

  signupValidator(
    req,
    res,
    () => {
      nextCalled = true;
    }
  );

  return {
    nextCalled,
    statusCode: res.statusCode,
    body: res.body
  };
}


const signupTs = read(
  'src/app/pages/auth/signup/signup.component.ts'
);

const signupHtml = read(
  'src/app/pages/auth/signup/signup.component.html'
);

const channelTs = read(
  'src/app/pages/channels/channel-form/channel-form.component.ts'
);

const channelHtml = read(
  'src/app/pages/channels/channel-form/channel-form.component.html'
);

const channelTermsHtml = read(
  'src/app/pages/channels/channel-form/terms-modal.component.html'
);

const channelRoute = read(
  'isen-backend-master_onprimse/routes/channel.js'
);

const legalMiddleware = read(
  'isen-backend-master_onprimse/app/middlewares/legal.js'
);


describe(
  'LEGAL-C1-A2 — age, signup and channel legal contract',
  function () {

    // ========================================================
    // AGE — EXISTING GOOD INTENT
    // ========================================================

    it(
      'preserves an exact-date 18-year maximum-date helper in the signup UI',
      function () {
        assert.match(
          signupTs,
          /currDate\.setFullYear\s*\(\s*currDate\.getFullYear\(\)\s*-\s*18\s*\)/
        );

        assert.match(
          signupTs,
          /return\s+currDate\.toJSON\(\)\.slice\(0,\s*10\)/
        );
      }
    );


    // ========================================================
    // AGE — DEFECT: PICKER USES YEAR ONLY
    // ========================================================

    it(
      'uses the exact 18-year cutoff when confirming a birthday in the picker',
      function () {
        const picker = section(
          signupTs,
          'async openBirthdayPicker()',
          'async openPrivacyPolicy()'
        );

        const usesPreciseCutoff =
          picker.includes(
            'this.getMaxDate()'
          ) ||
          /isAtLeast18\s*\(/.test(
            picker
          ) ||
          /validateAge\s*\(/.test(
            picker
          );

        assert.strictEqual(
          usesPreciseCutoff,
          true,
          'birthday picker currently limits the year but does not enforce the exact month/day 18-year boundary'
        );
      }
    );


    // ========================================================
    // AGE — DEFECT: BACKEND IS ~8+
    // ========================================================

    it(
      'rejects a signup that is one day younger than 18 on the authoritative backend',
      function () {
        const under18 =
          birthDateExactlyYearsAgo(
            18,
            1
          );

        const result =
          runSignupValidator(
            formatLocalDate(under18)
          );

        assert.strictEqual(
          result.nextCalled,
          false,
          'backend incorrectly allowed a user who is still 17'
        );

        assert.strictEqual(
          result.statusCode,
          400
        );
      }
    );


    it(
      'accepts a signup whose birthday is exactly 18 years ago today',
      function () {
        const exact18 =
          birthDateExactlyYearsAgo(
            18,
            0
          );

        const result =
          runSignupValidator(
            formatLocalDate(exact18)
          );

        assert.strictEqual(
          result.nextCalled,
          true,
          'exactly-18 signup should be accepted'
        );
      }
    );


    // ========================================================
    // GOOGLE SIGNUP
    // ========================================================

    it(
      'does not auto-check Terms merely because Google profile preparation succeeded',
      function () {
        const google = section(
          signupTs,
          'async googleSignUp()',
          'async loadCountries()'
        );

        assert.doesNotMatch(
          google,
          /acceptedTerms\s*:\s*true/
        );
      }
    );


    it(
      'does not force acceptedTerms=true in the final Google signup request',
      function () {
        const submit = section(
          signupTs,
          'async submit()',
          'async resendEmail()'
        );

        const googleCallStart =
          submit.indexOf(
            'completeGoogleSignUp'
          );

        assert.notStrictEqual(
          googleCallStart,
          -1,
          'Google completion call missing'
        );

        const googleCall =
          submit.slice(
            googleCallStart,
            submit.indexOf(
              ': await this.auth.firebaseSignup',
              googleCallStart
            )
          );

        assert.doesNotMatch(
          googleCall,
          /acceptedTerms\s*:\s*true/
        );
      }
    );


    it(
      'preserves affirmative manual Terms acceptance in the signup form',
      function () {
        assert.match(
          signupTs,
          /acceptedTerms:\s*\[\s*false,\s*\[\s*Validators\.requiredTrue\s*\]\s*\]/
        );

        assert.match(
          signupHtml,
          /formControlName="acceptedTerms"/
        );

        assert.match(
          signupHtml,
          /Terms of Service/
        );
      }
    );


    // ========================================================
    // CHANNEL UI — EXISTING GOOD BEHAVIOR
    // ========================================================

    it(
      'keeps channel creation disabled until Channel Rules are explicitly accepted',
      function () {
        const canCreate = section(
          channelTs,
          'get canCreateChannel()',
          'constructor('
        );

        assert.match(
          canCreate,
          /this\.termsAccepted/
        );

        assert.match(
          channelHtml,
          /\[disabled\]="!canCreateChannel"/
        );

        assert.match(
          channelHtml,
          /Read and accept the channel rules before creating your channel\./
        );
      }
    );


    it(
      'keeps explicit Reject and I Accept actions in the Channel Rules modal',
      function () {
        assert.match(
          channelTermsHtml,
          />Reject</
        );

        assert.match(
          channelTermsHtml,
          />I Accept</
        );

        assert.match(
          channelTermsHtml,
          /dismiss\(true\)/
        );
      }
    );


    it(
      'keeps backend enforcement of the versioned channels disclaimer before creation',
      function () {
        const createRoute = section(
          channelRoute,
          "router.post('/', [",
          "router.post('/follow/:channelId'"
        );

        assert.match(
          createRoute,
          /channels_disclaimer/
        );

        assert.match(
          createRoute,
          /CHANNELS_DISCLAIMER_VERSION/
        );

        assert.match(
          createRoute,
          /requireLegalAcceptance/
        );
      }
    );


    // ========================================================
    // CHANNEL LEGAL ACCEPTANCE — DEFECTS
    // ========================================================

    it(
      'sends a channel-specific acceptance signal instead of the generic acceptedTerms flag',
      function () {
        assert.match(
          channelTs,
          /acceptedChannelRules/
        );

        assert.doesNotMatch(
          channelTs,
          /form\.append\(\s*['"]acceptedTerms['"]/
        );
      }
    );


    it(
      'supports per-document acceptance fields instead of auto-recording every requirement from generic acceptedTerms',
      function () {
        assert.match(
          legalMiddleware,
          /acceptanceField/
        );

        const genericBlock =
          section(
            legalMiddleware,
            'const acceptedTerms =',
            '// Fetch recent acceptances for the user'
          );

        assert.doesNotMatch(
          genericBlock,
          /for\s*\(\s*const\s+reqmt\s+of\s+requirements\s*\)/
        );
      }
    );


    it(
      'does not describe accepting Channel Rules as privacy consent to data processing',
      function () {
        assert.doesNotMatch(
          channelTermsHtml,
          /consent to the collection and use of their data as described in the Folcen Privacy Policy/i
        );
      }
    );

  }
);
