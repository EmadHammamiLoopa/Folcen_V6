'use strict';

const Subscription =
  require('../models/Subscription');

const PlanRule =
  require('../models/PlanRule');

function cleanString(
  value
) {
  return String(
    value || ''
  ).trim();
}

function buildApplicablePlanRuleQuery(
  user,
  now = new Date()
) {
  if (
    !user ||
    !user._id
  ) {
    return {
      _id: null
    };
  }

  const targets = [
    {
      targetUsers:
        user._id
    }
  ];

  const role =
    cleanString(
      user.role
    );

  const country =
    cleanString(
      user.country
    );

  const city =
    cleanString(
      user.city
    );

  if (
    role
  ) {
    targets.push({
      targetRoles:
        role
    });
  }

  if (
    country
  ) {
    targets.push({
      targetCountries:
        country
    });
  }

  if (
    city
  ) {
    targets.push({
      targetCities:
        city
    });
  }

  return {
    isActive:
      true,

    // IMPORTANT:
    // Targeting and expiry are separate conditions.
    // Using two sibling "$or" keys in one JS object would cause the
    // second one to overwrite the first.
    $and: [
      {
        $or:
          targets
      },
      {
        $or: [
          {
            expiresAt: {
              $exists:
                false
            }
          },
          {
            expiresAt:
              null
          },
          {
            expiresAt: {
              $gt:
                now
            }
          }
        ]
      }
    ]
  };
}

async function findApplicablePlanRules(
  user,
  now = new Date()
) {
  return PlanRule.find(
    buildApplicablePlanRuleQuery(
      user,
      now
    )
  )
    .sort({
      priority:
        -1
    })
    .lean();
}

function plainPlan(
  value
) {
  if (
    value &&
    typeof value.toObject ===
      'function'
  ) {
    return value.toObject();
  }

  return {
    ...(
      value ||
      {}
    )
  };
}

/**
 * Higher priority rules are processed first.
 *
 * For PRICE_OVERRIDE, a lower-priority rule may fill a field not specified
 * by a higher-priority rule, but it cannot overwrite a field already set by
 * the stronger rule.
 *
 * FREE_PLAN remains the ultimate entitlement override.
 */
function applyPlanRules(
  basePlan,
  rules
) {
  const plan =
    plainPlan(
      basePlan
    );

  plan.offers =
    Array.isArray(
      plan.offers
    )
      ? [
          ...plan.offers
        ]
      : [];

  plan.isFree =
    false;

  plan.appliedRuleIds =
    [];

  const appliedPriceFields =
    new Set();

  for (
    const rule
    of (
      Array.isArray(
        rules
      )
        ? rules
        : []
    )
  ) {
    if (
      rule &&
      rule._id
    ) {
      plan.appliedRuleIds.push(
        String(
          rule._id
        )
      );
    }

    if (
      rule &&
      rule.type ===
        'FREE_PLAN'
    ) {
      plan.dayPrice =
        0;

      plan.weekPrice =
        0;

      plan.monthPrice =
        0;

      plan.yearPrice =
        0;

      plan.isFree =
        true;

      break;
    }

    if (
      !rule ||
      rule.type !==
        'PRICE_OVERRIDE'
    ) {
      continue;
    }

    const config =
      rule.config ||
      {};

    for (
      const field
      of [
        'dayPrice',
        'weekPrice',
        'monthPrice',
        'yearPrice',
        'currency'
      ]
    ) {
      if (
        appliedPriceFields.has(
          field
        )
      ) {
        continue;
      }

      if (
        config[field] !==
          undefined &&
        config[field] !==
          null &&
        config[field] !==
          ''
      ) {
        plan[field] =
          config[field];

        appliedPriceFields.add(
          field
        );
      }
    }

    if (
      !appliedPriceFields.has(
        'offers'
      ) &&
      Array.isArray(
        config.offers
      ) &&
      config.offers.length >
        0
    ) {
      plan.offers =
        [
          ...config.offers
        ];

      appliedPriceFields.add(
        'offers'
      );
    }
  }

  return plan;
}

async function getEffectivePlanForUser(
  user,
  basePlan = null,
  now = new Date()
) {
  let sourcePlan =
    basePlan;

  if (
    !sourcePlan
  ) {
    sourcePlan =
      await Subscription.findOne({
        $or: [
          {
            userId: {
              $exists:
                false
            }
          },
          {
            userId:
              null
          }
        ]
      })
        .lean();
  }

  if (
    !sourcePlan
  ) {
    sourcePlan = {
      dayPrice:
        0,

      weekPrice:
        0,

      monthPrice:
        0,

      yearPrice:
        0,

      currency:
        'USD',

      offers: []
    };
  }

  const rules =
    await findApplicablePlanRules(
      user,
      now
    );

  return applyPlanRules(
    sourcePlan,
    rules
  );
}

async function hasFreePlanEntitlement(
  user,
  now = new Date()
) {
  if (
    !user ||
    !user._id
  ) {
    return false;
  }

  const query =
    buildApplicablePlanRuleQuery(
      user,
      now
    );

  const rule =
    await PlanRule.findOne({
      ...query,
      type:
        'FREE_PLAN'
    })
      .select(
        '_id'
      )
      .lean();

  return !!rule;
}

module.exports = {
  buildApplicablePlanRuleQuery,
  findApplicablePlanRules,
  applyPlanRules,
  getEffectivePlanForUser,
  hasFreePlanEntitlement
};
