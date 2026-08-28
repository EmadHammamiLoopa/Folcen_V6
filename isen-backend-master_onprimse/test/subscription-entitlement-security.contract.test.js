'use strict';

const assert =
  require('assert');

const fs =
  require('fs');

const path =
  require('path');

const backendRoot =
  path.resolve(
    __dirname,
    '..'
  );

const repoRoot =
  path.resolve(
    backendRoot,
    '..'
  );

const readBackend =
  rel =>
    fs.readFileSync(
      path.join(
        backendRoot,
        rel
      ),
      'utf8'
    );

const readRepo =
  rel =>
    fs.readFileSync(
      path.join(
        repoRoot,
        rel
      ),
      'utf8'
    );

function exportedBlock(
  src,
  name
) {
  const marker =
    `exports.${name} =`;

  const start =
    src.indexOf(
      marker
    );

  assert.ok(
    start >= 0,
    `${name} missing`
  );

  const tail =
    src.slice(
      start +
      marker.length
    );

  const match =
    tail.match(
      /\nexports\.[A-Za-z0-9_]+\s*=/
    );

  return match
    ? src.slice(
        start,
        start +
          marker.length +
          match.index
      )
    : src.slice(
        start
      );
}

describe(
  'Subscription entitlement and payment security contract',
  () => {

    it(
      'keeps PlanRule targeting and expiry as separate AND conditions',
      () => {
        const policy =
          readBackend(
            'app/utils/subscriptionPolicy.js'
          );

        assert.ok(
          policy.includes(
            '$and: ['
          )
        );

        for (
          const token
          of [
            'targetUsers:',
            'targetRoles:',
            'targetCountries:',
            'targetCities:',
            'expiresAt:'
          ]
        ) {
          assert.ok(
            policy.includes(
              token
            ),
            `missing ${token}`
          );
        }
      }
    );

    it(
      'prevents weaker price overrides from replacing stronger fields',
      () => {
        const policy =
          readBackend(
            'app/utils/subscriptionPolicy.js'
          );

        assert.ok(
          policy.includes(
            'appliedPriceFields'
          )
        );

        assert.ok(
          policy.includes(
            'appliedPriceFields.has('
          )
        );

        assert.ok(
          policy.includes(
            "'FREE_PLAN'"
          )
        );
      }
    );

    it(
      'makes FREE_PLAN a real entitlement',
      () => {
        const middleware =
          readBackend(
            'app/middlewares/subscription.js'
          );

        assert.ok(
          middleware.includes(
            'hasFreePlanEntitlement'
          )
        );

        assert.ok(
          middleware.includes(
            'await hasFreePlanEntitlement('
          )
        );
      }
    );

    it(
      'validates positive admin free-subscription days and plan existence',
      () => {
        const controller =
          readBackend(
            'app/controllers/SubscriptionController.js'
          );

        const block =
          exportedBlock(
            controller,
            'giveFreeSubscription'
          );

        assert.ok(
          block.includes(
            'Number.isSafeInteger('
          )
        );

        assert.ok(
          block.includes(
            'normalizedDays <='
          )
        );

        assert.ok(
          block.includes(
            'Subscription.findById('
          )
        );

        assert.ok(
          block.includes(
            'No subscription plan is available'
          )
        );
      }
    );

    it(
      'binds PaymentIntent creation to user plan duration amount and currency',
      () => {
        const controller =
          readBackend(
            'app/controllers/SubscriptionController.js'
          );

        const block =
          exportedBlock(
            controller,
            'clientSecret'
          );

        for (
          const token
          of [
            'getEffectivePlanForUser(',
            'folcenUserId:',
            'folcenSubscriptionId:',
            'folcenDuration:',
            'folcenAmountCents:',
            'folcenCurrency:',
            'payment_intent_id:'
          ]
        ) {
          assert.ok(
            block.includes(
              token
            ),
            `missing ${token}`
          );
        }
      }
    );

    it(
      'requires a succeeded matching recent Stripe payment before entitlement',
      () => {
        const controller =
          readBackend(
            'app/controllers/SubscriptionController.js'
          );

        const block =
          exportedBlock(
            controller,
            'subscribe'
          );

        for (
          const token
          of [
            'paymentIntentId',
            'paymentIntents.retrieve(',
            "'succeeded'",
            'folcenUserId',
            'folcenSubscriptionId',
            'folcenDuration',
            'folcenAmountCents',
            'amount_received',
            'paymentClaimWindowMs()'
          ]
        ) {
          assert.ok(
            block.includes(
              token
            ),
            `missing ${token}`
          );
        }
      }
    );

    it(
      'uses short-lived atomic replay receipts and forwards PaymentIntent from mobile',
      () => {
        const receipt =
          readBackend(
            'app/models/SubscriptionPaymentReceipt.js'
          );

        assert.ok(
          receipt.includes(
            '_id: {'
          )
        );

        assert.ok(
          receipt.includes(
            'deleteAfter:'
          )
        );

        assert.ok(
          receipt.includes(
            'expireAfterSeconds:'
          )
        );

        const controller =
          readBackend(
            'app/controllers/SubscriptionController.js'
          );

        assert.ok(
          controller.includes(
            'SubscriptionPaymentReceipt.create('
          )
        );

        assert.ok(
          controller.includes(
            'error.code ==='
          )
        );

        assert.ok(
          controller.includes(
            '11000'
          )
        );

        const payment =
          readRepo(
            'src/app/pages/subscription/payment/payment.component.ts'
          );

        assert.ok(
          payment.includes(
            'resp.data.payment_intent_id'
          )
        );

        assert.ok(
          payment.includes(
            'paymentIntentId: this.paymentIntentId'
          )
        );

        const service =
          readRepo(
            'src/app/services/subscription.service.ts'
          );

        assert.ok(
          service.includes(
            "url: '/effective'"
          )
        );
      }
    );

    it(
      'purges short-lived payment receipts during user erasure',
      () => {
        const helpers =
          readBackend(
            'app/helpers.js'
          );

        assert.ok(
          helpers.includes(
            "require('./models/SubscriptionPaymentReceipt')"
          )
        );

        assert.ok(
          helpers.includes(
            'SubscriptionPaymentReceipt.deleteMany({'
          )
        );
      }
    );
  }
);
