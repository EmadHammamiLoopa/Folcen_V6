const { extractDashParams } = require("../helpers");
const Subscription = require("../models/Subscription")
const PlanRule = require("../models/PlanRule");
const Response = require("./Response")
const _ = require('lodash')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const User = require("../models/User");
const mongoose = require('mongoose');
const SubscriptionPaymentReceipt = require("../models/SubscriptionPaymentReceipt");
const {
    getEffectivePlanForUser
} = require("../utils/subscriptionPolicy");

// New method to get the effective plan for the current user
exports.getEffectivePlan = async (req, res) => {
    try {
        const plan =
            await getEffectivePlanForUser(
                req.authUser
            );

        return Response.sendResponse(
            res,
            plan
        );

    } catch (error) {
        console.error(
            'Error getting effective plan:',
            error
        );

        return Response.sendError(
            res,
            500,
            'Server error'
        );
    }
};

exports.listPlanRules = async (req, res) => {
    try {
        const rules = await PlanRule.find().sort({ priority: -1 });
        const rulesWithId = rules.map(r => {
            const obj = r.toObject();
            obj.id = r._id;
            return obj;
        });
        return Response.sendResponse(res, rulesWithId);
    } catch (error) {
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.createPlanRule = async (req, res) => {
    try {
        const data = req.fields || req.body;

        // Parse JSON strings from FormData if necessary
        ['targetUsers', 'targetRoles', 'targetCountries', 'targetCities'].forEach(field => {
            if (typeof data[field] === 'string') {
                try {
                    data[field] = JSON.parse(data[field]);
                } catch (e) {
                    // If not valid JSON, keep as is or handle error
                }
            }
        });

        // Handle flattened config fields from dashboard
        if (data.dayPrice !== undefined || data.weekPrice !== undefined || data.monthPrice !== undefined || data.yearPrice !== undefined || data.currency) {
            data.config = {
                dayPrice: data.dayPrice,
                weekPrice: data.weekPrice,
                monthPrice: data.monthPrice,
                yearPrice: data.yearPrice,
                currency: data.currency
            };
        }
        const rule = new PlanRule(data);
        await rule.save();
        const obj = rule.toObject();
        obj.id = rule._id;
        return Response.sendResponse(res, obj, 'Plan rule created');
    } catch (error) {
        return Response.sendError(res, 400, error.message);
    }
};

exports.updatePlanRule = async (req, res) => {
    try {
        const data = req.fields || req.body;

        // Parse JSON strings from FormData if necessary
        ['targetUsers', 'targetRoles', 'targetCountries', 'targetCities'].forEach(field => {
            if (typeof data[field] === 'string') {
                try {
                    data[field] = JSON.parse(data[field]);
                } catch (e) {
                    // If not valid JSON, keep as is or handle error
                }
            }
        });

        // Handle flattened config fields from dashboard
        if (data.dayPrice !== undefined || data.weekPrice !== undefined || data.monthPrice !== undefined || data.yearPrice !== undefined || data.currency) {
            data.config = {
                dayPrice: data.dayPrice,
                weekPrice: data.weekPrice,
                monthPrice: data.monthPrice,
                yearPrice: data.yearPrice,
                currency: data.currency
            };
        }
        const rule = await PlanRule.findByIdAndUpdate(req.params.ruleId, data, { new: true });
        if (!rule) return Response.sendError(res, 404, 'Rule not found');
        const obj = rule.toObject();
        obj.id = rule._id;
        return Response.sendResponse(res, obj, 'Plan rule updated');
    } catch (error) {
        return Response.sendError(res, 400, error.message);
    }
};

exports.showPlanRule = async (req, res) => {
    try {
        const rule = await PlanRule.findById(req.params.ruleId);
        if (!rule) return Response.sendError(res, 404, 'Rule not found');
        const obj = rule.toObject();
        obj.id = rule._id;
        // Flatten config for dashboard form
        if (obj.config) {
            obj.dayPrice = obj.config.dayPrice;
            obj.weekPrice = obj.config.weekPrice;
            obj.monthPrice = obj.config.monthPrice;
            obj.yearPrice = obj.config.yearPrice;
            obj.currency = obj.config.currency;
        }
        return Response.sendResponse(res, obj);
    } catch (error) {
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.deletePlanRule = async (req, res) => {
    try {
        await PlanRule.findByIdAndDelete(req.params.ruleId);
        return Response.sendResponse(res, null, 'Plan rule deleted');
    } catch (error) {
        return Response.sendError(res, 500, 'Server error');
    }
};


// Existing controller methods...

// New method to update subscription prices from the dashboard
exports.updatePrices = async (req, res) => {
    try {
        const { dayPrice, weekPrice, monthPrice, yearPrice, currency, userId} = req.body;

        if (userId) {
            // Update prices only for this specific user
            let userSubscription = await Subscription.findOne({ _id: req.params.subscriptionId, userId });
            if (!userSubscription) {
                return Response.sendError(res, 404, 'User-specific subscription not found');
            }
            userSubscription.dayPrice = dayPrice;
            userSubscription.weekPrice = weekPrice;
            userSubscription.monthPrice = monthPrice;
            userSubscription.yearPrice = yearPrice;
            userSubscription.currency = currency;

            await userSubscription.save();
            return Response.sendResponse(res, userSubscription, 'Prices updated for the specific user');
        } else {
            // Update prices for the global subscription (applies to all users)
            let subscription = await Subscription.findOne({ _id: req.params.subscriptionId });
            if (!subscription) {
                return Response.sendError(res, 404, 'Subscription not found');
            }
            subscription.dayPrice = dayPrice;
            subscription.weekPrice = weekPrice;
            subscription.monthPrice = monthPrice;
            subscription.yearPrice = yearPrice;
            subscription.currency = currency;

            await subscription.save();
            return Response.sendResponse(res, subscription, 'Prices updated for all users');
        }
    } catch (error) {
        console.error('Error updating prices:', error);
        return Response.sendError(res, 500, 'Failed to update prices');
    }
};


// New method to manage offers for subscriptions from the dashboard
exports.manageOffers = async (req, res) => {
    try {
        const { offers } = req.body;
        let subscription = await Subscription.findOne({ _id: req.params.subscriptionId });

        if (!subscription) {
            return Response.sendError(res, 404, 'Subscription not found');
        }

        // Update the offers
        subscription.offers = offers;  // Expecting offers to be an array of strings

        await subscription.save();
        return Response.sendResponse(res, subscription, 'Offers updated successfully');
    } catch (error) {
        console.error('Error updating offers:', error);
        return Response.sendError(res, 500, 'Failed to update offers');
    }
};



exports.getSubscription = async (req, res) => {
    try {
        const subscription = await Subscription.findOne({});
        if (!subscription) {
            return Response.sendError(res, 400, 'Subscription not found');
        }
        return Response.sendResponse(res, subscription);
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.showSubscription = (req, res) => {
    return Response.sendResponse(res, req.subscription)
}

exports.showDashSubscription = async (req, res) => {
    try {
        const subscription = await Subscription.findById(req.subscription._id)
            .populate('userId', 'firstName lastName email mainAvatar');

        if (!subscription) {
            return Response.sendError(res, 404, 'Subscription not found');
        }

        return Response.sendResponse(res, subscription);
    } catch (err) {
        console.error('Error in showDashSubscription:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.storeSubscription = async (req, res) => {
    try {
        const { offers, dayPrice, weekPrice, monthPrice, yearPrice, currency, userId } = req.body;

        let newSubscription;
        if (userId) {
            // Create a user-specific subscription
            newSubscription = new Subscription({
                offers,
                dayPrice,
                weekPrice,
                monthPrice,
                yearPrice,
                currency,
                userId
            });
        } else {
            // Create a general subscription
            newSubscription = new Subscription({
                offers,
                dayPrice,
                weekPrice,
                monthPrice,
                yearPrice,
                currency
            });
        }

        await newSubscription.save();
        return Response.sendResponse(res, newSubscription, 'Subscription created successfully');
    } catch (error) {
        console.error('Error creating subscription:', error);
        return Response.sendError(res, 500, 'Server error, please try again later');
    }
};


exports.updateSubscription = async (req, res) => {
    try {
        // Retrieve the subscription based on a specific identifier (e.g., `req.params.subscriptionId` or another filter)
        const subscription = await Subscription.findOne({ _id: req.params.subscriptionId });

        // If no subscription is found, return an error
        if (!subscription) {
            return Response.sendError(res, 400, 'Subscription not found');
        }

        // Sanitize fields: remove any string "undefined" or "null" values
        if (req.fields) {
            Object.keys(req.fields).forEach(key => {
                if (req.fields[key] === 'undefined' || req.fields[key] === 'null') {
                    delete req.fields[key];
                }
            });
        }

        // Merge the updated fields into the subscription object
        Object.assign(subscription, req.fields);

        // Parse the 'offers' field if it's provided as a JSON string
        if (typeof req.fields.offers === 'string') {
            subscription.offers = JSON.parse(req.fields.offers);
        }

        // Save the updated subscription using async/await
        await subscription.save();

        // Send a success response after saving
        return Response.sendResponse(res, subscription, 'The subscription has been updated successfully');
    } catch (error) {
        console.error('Error updating subscription:', error);
        return Response.sendError(res, 500, 'Server error, please try again later');
    }
};

exports.allSubscriptions = async (req, res) => {
    try {
        const dashParams = extractDashParams(req, ['currency', 'offers']);

        // Fetch all users and populate their subscription plan
        const users = await User.find()
            .populate('subscription._id')
            .lean();

        // Combine users with their subscriptions
        const combinedData = users.map((user) => {
            const userSub = user.subscription || {};
            const plan = userSub._id || null;

            return {
                _id: user._id, // Added for dashboard table identification
                userId: user._id,
                firstName: user.firstName || 'N/A',
                lastName: user.lastName || 'N/A',
                email: user.email || 'N/A',
                subscriptionId: plan ? plan._id : 'N/A',
                dayPrice: plan ? plan.dayPrice : 'N/A',
                weekPrice: plan ? plan.weekPrice : 'N/A',
                monthPrice: plan ? plan.monthPrice : 'N/A',
                yearPrice: plan ? plan.yearPrice : 'N/A',
                currency: plan ? plan.currency : 'N/A',
                expireDate: userSub.expireDate || null,
                subscribed: userSub.expireDate && new Date(userSub.expireDate) > new Date(), // Valid subscription
            };
        });

        // Pagination logic
        const startIndex = dashParams.skip || 0;
        const endIndex = startIndex + (dashParams.limit || combinedData.length);
        const paginatedData = combinedData.slice(startIndex, endIndex);

        // Total count for pagination
        const totalCount = users.length;

        return Response.sendResponse(res, {
            docs: paginatedData,
            totalPages: Math.ceil(totalCount / (dashParams.limit || totalCount)),
            totalDocs: totalCount
        });
    } catch (error) {
        console.error('Error fetching all subscriptions:', error);
        return Response.sendError(res, 500, 'Server error, please try again later');
    }
};






exports.subscriptions = async (req, res) => {
    try {
        const subscriptions = await Subscription.find({});
        if (!subscriptions) return Response.sendError(res, 400);
        return Response.sendResponse(res, subscriptions);
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Internal server error');
    }
}

exports.destroySubscription = async (req, res) => {
    try {
        const subscription = await Subscription.findByIdAndDelete(req.subscription._id);

        if (!subscription) {
            return Response.sendError(res, 400, 'Subscription not found or already removed');
        }

        return Response.sendResponse(res, subscription, 'Subscription removed successfully');
    } catch (err) {
        console.error('Error removing subscription:', err);
        return Response.sendError(res, 500, 'Server error, failed to remove the subscription');
    }
};


exports.clientSecret = async (req, res) => {
    try {
        const subscription =
            req.subscription;

        const duration =
            normalizeSubscriptionDuration(
                req.body &&
                req.body.duration
            );

        const effectivePlan =
            await getEffectivePlanForUser(
                req.authUser,
                subscription
            );

        const {
            amount
        } =
            subExpireDateAndAmount(
                effectivePlan,
                duration
            );

        const amountCents =
            Math.round(
                Number(
                    amount
                ) *
                100
            );

        if (
            !Number.isSafeInteger(
                amountCents
            ) ||
            amountCents <=
                0
        ) {
            return Response.sendError(
                res,
                400,
                effectivePlan.isFree
                    ? 'No payment is required for this user'
                    : 'Subscription amount must be greater than zero'
            );
        }

        const currency =
            String(
                effectivePlan.currency ||
                subscription.currency ||
                ''
            )
                .trim()
                .toLowerCase();

        if (
            !/^[a-z]{3,4}$/.test(
                currency
            )
        ) {
            return Response.sendError(
                res,
                400,
                'Invalid subscription currency'
            );
        }

        const paymentIntent =
            await stripe.paymentIntents.create({
                amount:
                    amountCents,

                currency,

                metadata: {
                    integration_check:
                        'accept_a_payment',

                    folcenUserId:
                        String(
                            req.authUser._id
                        ),

                    folcenSubscriptionId:
                        String(
                            subscription._id
                        ),

                    folcenDuration:
                        duration,

                    folcenAmountCents:
                        String(
                            amountCents
                        ),

                    folcenCurrency:
                        currency
                }
            });

        return Response.sendResponse(
            res,
            {
                client_secret:
                    paymentIntent.client_secret,

                payment_intent_id:
                    paymentIntent.id
            }
        );

    } catch (error) {
        console.error(
            'Error creating subscription PaymentIntent:',
            error
        );

        return Response.sendError(
            res,
            error &&
            error.statusCode ===
                400
                ? 400
                : 500,
            error &&
            error.statusCode ===
                400
                ? error.message
                : 'Failed to create payment intent'
        );
    }
};

const VALID_SUBSCRIPTION_DURATIONS =
    new Set([
        'day',
        'week',
        'month',
        'year'
    ]);

const normalizeSubscriptionDuration = (value) => {
    const duration =
        String(
            value || ''
        )
            .trim()
            .toLowerCase();

    if (
        !VALID_SUBSCRIPTION_DURATIONS.has(
            duration
        )
    ) {
        const error =
            new Error(
                'Invalid subscription duration'
            );

        error.statusCode =
            400;

        throw error;
    }

    return duration;
};

const addSubscriptionDuration = (
    baseDate,
    duration
) => {
    const normalized =
        normalizeSubscriptionDuration(
            duration
        );

    const expireDate =
        new Date(
            baseDate
        );

    if (
        Number.isNaN(
            expireDate.getTime()
        )
    ) {
        const error =
            new Error(
                'Invalid subscription base date'
            );

        error.statusCode =
            400;

        throw error;
    }

    if (
        normalized ===
        'day'
    ) {
        expireDate.setDate(
            expireDate.getDate() +
            1
        );
    }

    if (
        normalized ===
        'week'
    ) {
        expireDate.setDate(
            expireDate.getDate() +
            7
        );
    }

    if (
        normalized ===
        'month'
    ) {
        expireDate.setMonth(
            expireDate.getMonth() +
            1
        );
    }

    if (
        normalized ===
        'year'
    ) {
        expireDate.setFullYear(
            expireDate.getFullYear() +
            1
        );
    }

    return expireDate;
};

const subExpireDateAndAmount = (
    subscription,
    duration
) => {
    const normalized =
        normalizeSubscriptionDuration(
            duration
        );

    const priceField = {
        day:
            'dayPrice',

        week:
            'weekPrice',

        month:
            'monthPrice',

        year:
            'yearPrice'
    }[normalized];

    const amount =
        Number(
            subscription &&
            subscription[
                priceField
            ]
        );

    if (
        !Number.isFinite(
            amount
        ) ||
        amount <
            0
    ) {
        const error =
            new Error(
                'Invalid subscription price'
            );

        error.statusCode =
            400;

        throw error;
    }

    return {
        amount,

        expireDate:
            addSubscriptionDuration(
                new Date(),
                normalized
            )
    };
};

const paymentClaimWindowMs = () => {
    const configured =
        Number(
            process.env.SUBSCRIPTION_PAYMENT_CLAIM_HOURS ||
            24
        );

    const hours =
        Number.isFinite(
            configured
        ) &&
        configured >
            0
            ? configured
            : 24;

    return hours *
        60 *
        60 *
        1000;
};

const paymentReceiptLifetimeMs = () => {
    const claimWindow =
        paymentClaimWindowMs();

    const configured =
        Number(
            process.env.SUBSCRIPTION_PAYMENT_RECEIPT_HOURS ||
            48
        );

    const configuredMs =
        (
            Number.isFinite(
                configured
            ) &&
            configured >
                0
                ? configured
                : 48
        ) *
        60 *
        60 *
        1000;

    return Math.max(
        configuredMs,
        claimWindow +
        60 *
        60 *
        1000
    );
};

const paymentReceiptMatches = (
    receipt,
    {
        userId,
        subscriptionId,
        duration
    }
) => (
    receipt &&
    String(
        receipt.userId
    ) ===
        String(
            userId
        ) &&
    String(
        receipt.subscriptionId
    ) ===
        String(
            subscriptionId
        ) &&
    receipt.duration ===
        duration
);

exports.subscribe = async (req, res) => {
    const subscription =
        req.subscription;

    const authUser =
        req.authUser;

    let receipt =
        null;

    let entitlementSaved =
        false;

    try {
        const duration =
            normalizeSubscriptionDuration(
                req.body &&
                req.body.duration
            );

        const paymentIntentId =
            String(
                (
                    req.body &&
                    req.body.paymentIntentId
                ) ||
                ''
            )
                .trim();

        if (
            !paymentIntentId.startsWith(
                'pi_'
            )
        ) {
            return Response.sendError(
                res,
                400,
                'Valid paymentIntentId is required'
            );
        }

        const paymentIntent =
            await stripe.paymentIntents.retrieve(
                paymentIntentId
            );

        if (
            !paymentIntent ||
            paymentIntent.status !==
                'succeeded'
        ) {
            return Response.sendError(
                res,
                402,
                'Payment has not completed successfully'
            );
        }

        const metadata =
            paymentIntent.metadata ||
            {};

        const userId =
            String(
                authUser._id
            );

        const subscriptionId =
            String(
                subscription._id
            );

        if (
            metadata.folcenUserId !==
                userId ||
            metadata.folcenSubscriptionId !==
                subscriptionId ||
            metadata.folcenDuration !==
                duration
        ) {
            return Response.sendError(
                res,
                403,
                'Payment intent does not match this subscription request'
            );
        }

        const expectedAmountCents =
            Number(
                metadata.folcenAmountCents
            );

        const expectedCurrency =
            String(
                metadata.folcenCurrency ||
                ''
            )
                .trim()
                .toLowerCase();

        if (
            !Number.isSafeInteger(
                expectedAmountCents
            ) ||
            expectedAmountCents <=
                0 ||
            Number(
                paymentIntent.amount
            ) !==
                expectedAmountCents ||
            Number(
                paymentIntent.amount_received ||
                0
            ) <
                expectedAmountCents ||
            String(
                paymentIntent.currency ||
                ''
            )
                .trim()
                .toLowerCase() !==
                expectedCurrency
        ) {
            return Response.sendError(
                res,
                402,
                'Payment amount or currency does not match the subscription'
            );
        }

        const createdMs =
            Number(
                paymentIntent.created
            ) *
            1000;

        const nowMs =
            Date.now();

        if (
            !Number.isFinite(
                createdMs
            ) ||
            createdMs >
                nowMs +
                5 *
                60 *
                1000 ||
            nowMs -
                createdMs >
                paymentClaimWindowMs()
        ) {
            return Response.sendError(
                res,
                409,
                'Payment intent is outside the subscription claim window'
            );
        }

        const existingReceipt =
            await SubscriptionPaymentReceipt.findById(
                paymentIntentId
            )
                .lean();

        if (
            existingReceipt
        ) {
            if (
                paymentReceiptMatches(
                    existingReceipt,
                    {
                        userId:
                            authUser._id,

                        subscriptionId:
                            subscription._id,

                        duration
                    }
                ) &&
                existingReceipt.status ===
                    'granted'
            ) {
                return Response.sendResponse(
                    res,
                    authUser.publicInfo(),
                    'Payment already applied'
                );
            }

            return Response.sendError(
                res,
                409,
                'Payment intent has already been claimed'
            );
        }

        try {
            receipt =
                await SubscriptionPaymentReceipt.create({
                    _id:
                        paymentIntentId,

                    userId:
                        authUser._id,

                    subscriptionId:
                        subscription._id,

                    duration,

                    amountCents:
                        expectedAmountCents,

                    currency:
                        expectedCurrency,

                    status:
                        'claimed',

                    deleteAfter:
                        new Date(
                            nowMs +
                            paymentReceiptLifetimeMs()
                        )
                });

        } catch (error) {
            if (
                error &&
                error.code ===
                    11000
            ) {
                const racedReceipt =
                    await SubscriptionPaymentReceipt.findById(
                        paymentIntentId
                    )
                        .lean();

                if (
                    paymentReceiptMatches(
                        racedReceipt,
                        {
                            userId:
                                authUser._id,

                            subscriptionId:
                                subscription._id,

                            duration
                        }
                    ) &&
                    racedReceipt &&
                    racedReceipt.status ===
                        'granted'
                ) {
                    return Response.sendResponse(
                        res,
                        authUser.publicInfo(),
                        'Payment already applied'
                    );
                }

                return Response.sendError(
                    res,
                    409,
                    'Payment intent has already been claimed'
                );
            }

            throw error;
        }

        const {
            expireDate
        } =
            subExpireDateAndAmount(
                subscription,
                duration
            );

        authUser.subscription = {
            _id:
                subscription._id,

            expireDate
        };

        await authUser.save();

        entitlementSaved =
            true;

        try {
            await SubscriptionPaymentReceipt.updateOne(
                {
                    _id:
                        paymentIntentId
                },
                {
                    $set: {
                        status:
                            'granted',

                        grantedAt:
                            new Date(),

                        entitlementExpireDate:
                            expireDate
                    }
                }
            );

        } catch (receiptError) {
            // The claimed receipt still blocks replay even when this
            // bookkeeping update fails after entitlement persistence.
            console.error(
                'Subscription receipt finalization failed:',
                receiptError
            );
        }

        return Response.sendResponse(
            res,
            authUser.publicInfo(),
            'Payment Successful'
        );

    } catch (err) {
        console.error(
            'Error in verified subscribe:',
            err
        );

        if (
            receipt &&
            !entitlementSaved
        ) {
            try {
                await SubscriptionPaymentReceipt.deleteOne({
                    _id:
                        receipt._id,

                    status:
                        'claimed'
                });
            } catch (cleanupError) {
                console.error(
                    'Failed to release unsuccessful payment claim:',
                    cleanupError
                );
            }
        }

        return Response.sendError(
            res,
            err &&
            err.statusCode ===
                400
                ? 400
                : 500,
            err &&
            err.statusCode ===
                400
                ? err.message
                : 'Failed to subscribe'
        );
    }
};

exports.payAndSubscribe = async (req, res) => {
    const subscription = req.subscription
    const token = req.body.token
    const duration = req.body.duration
    const authUser = req.authUser
    const { amount, expireDate } = subExpireDateAndAmount(subscription, duration)

    try {
        await stripe.charges.create({
            amount: Math.round(amount * 100),
            source: token,
            currency: subscription.currency
        });

        authUser.subscription = {
            _id: subscription._id,
            expireDate
        }
        const user = await authUser.save();
        return Response.sendResponse(res, user.publicInfo(), 'Payment Successful');
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, err.message || err);
    }
}

exports.giveFreeSubscription = async (req, res) => {
    try {
        const {
            userId,
            days,
            planId
        } =
            req.body ||
            {};

        const normalizedDays =
            Number(
                days
            );

        if (
            !Number.isSafeInteger(
                normalizedDays
            ) ||
            normalizedDays <=
                0
        ) {
            return Response.sendError(
                res,
                400,
                'days must be a positive integer'
            );
        }

        if (
            !userId ||
            !mongoose.Types.ObjectId.isValid(
                userId
            )
        ) {
            return Response.sendError(
                res,
                400,
                'Invalid userId'
            );
        }

        const user =
            await User.findById(
                userId
            );

        if (
            !user
        ) {
            return Response.sendError(
                res,
                404,
                'User not found'
            );
        }

        let selectedPlan =
            null;

        if (
            planId
        ) {
            if (
                !mongoose.Types.ObjectId.isValid(
                    planId
                )
            ) {
                return Response.sendError(
                    res,
                    400,
                    'Invalid planId'
                );
            }

            selectedPlan =
                await Subscription.findById(
                    planId
                );

            if (
                !selectedPlan
            ) {
                return Response.sendError(
                    res,
                    404,
                    'Subscription plan not found'
                );
            }
        }

        if (
            !selectedPlan &&
            user.subscription &&
            user.subscription._id
        ) {
            selectedPlan =
                await Subscription.findById(
                    user.subscription._id
                );
        }

        if (
            !selectedPlan
        ) {
            selectedPlan =
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
                });
        }

        if (
            !selectedPlan
        ) {
            return Response.sendError(
                res,
                409,
                'No subscription plan is available'
            );
        }

        const now =
            new Date();

        const currentExpire =
            (
                user.subscription &&
                user.subscription.expireDate
            )
                ? new Date(
                    user.subscription.expireDate
                )
                : now;

        const baseDate =
            (
                !Number.isNaN(
                    currentExpire.getTime()
                ) &&
                currentExpire >
                    now
            )
                ? currentExpire
                : now;

        const newExpire =
            new Date(
                baseDate
            );

        newExpire.setDate(
            newExpire.getDate() +
            normalizedDays
        );

        user.subscription = {
            _id:
                selectedPlan._id,

            expireDate:
                newExpire
        };

        await user.save();

        return Response.sendResponse(
            res,
            user.subscription,
            `Gave ${normalizedDays} days of free subscription`
        );

    } catch (err) {
        console.error(
            'Error in giveFreeSubscription:',
            err
        );

        return Response.sendError(
            res,
            500,
            'Server error'
        );
    }
};
