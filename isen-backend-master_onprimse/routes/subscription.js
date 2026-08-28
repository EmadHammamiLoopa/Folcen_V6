const express = require('express');
const {
    subscriptions,
    allSubscriptions,
    showSubscription,
    showDashSubscription,
    storeSubscription,
    updatePrices,
    manageOffers,
    updateSubscription,
    destroySubscription,
    getSubscription,
    clientSecret,
    subscribe,
    getEffectivePlan,
    listPlanRules,
    createPlanRule,
    showPlanRule,
    updatePlanRule,
    deletePlanRule,
    giveFreeSubscription
} = require('../app/controllers/SubscriptionController');
const { requireSignin, isAdmin, isSuperAdmin, withAuthUser } = require('../app/middlewares/auth');
const { requireLatestTermsPrivacy } = require('../app/middlewares/legal');
const form = require('../app/middlewares/form');
const { subscriptionById } = require('../app/middlewares/subscription');
const { updateServiceValidator } = require('../app/middlewares/validators/serviceValidator');
const { storeSubscriptionValidator } = require('../app/middlewares/validators/subscription');
const router = express.Router()

router.get('/all', [requireSignin, withAuthUser, isAdmin], allSubscriptions)
router.post('/free', [requireSignin, withAuthUser, isAdmin], giveFreeSubscription)
router.post('/', [form, requireSignin, withAuthUser, storeSubscriptionValidator, isAdmin], storeSubscription)

router.get('/prices', [requireSignin, withAuthUser], getSubscription)
router.get('/effective', [requireSignin, withAuthUser], getEffectivePlan)

// Plan Rules (Admin only)
router.get('/rules', [requireSignin, withAuthUser, isAdmin], listPlanRules)
router.post('/rules', [form, requireSignin, withAuthUser, isAdmin], createPlanRule)
router.get('/rules/:ruleId', [requireSignin, withAuthUser, isAdmin], showPlanRule)
router.put('/rules/:ruleId', [form, requireSignin, withAuthUser, isAdmin], updatePlanRule)
router.delete('/rules/:ruleId', [requireSignin, withAuthUser, isAdmin], deletePlanRule)

router.get('/', [requireSignin], subscriptions)

router.put('/:subscriptionId', [form, requireSignin, withAuthUser, updateServiceValidator, isAdmin], updateSubscription)
router.delete('/:subscriptionId', [requireSignin, withAuthUser, isAdmin], destroySubscription)
router.get('/:subscriptionId', [requireSignin, withAuthUser, isAdmin], showSubscription)
router.get('/dash/:subscriptionId', [requireSignin, withAuthUser, isAdmin], showDashSubscription)


// New routes to update prices and manage offers
router.put('/:subscriptionId/prices', [requireSignin, withAuthUser, isAdmin], updatePrices);  // Update prices
router.put('/:subscriptionId/offers', [requireSignin, withAuthUser, isAdmin], manageOffers);  // Update offers


// router.post('/:subscriptionId/pay', [requireSignin, withAuthUser], payAndSubscribeV2)

router.post('/:subscriptionId/client-secret', [requireSignin, withAuthUser, requireLatestTermsPrivacy], clientSecret)
router.post('/:subscriptionId/subscribe', [requireSignin, withAuthUser, requireLatestTermsPrivacy], subscribe)

router.param('subscriptionId', subscriptionById)

module.exports = router