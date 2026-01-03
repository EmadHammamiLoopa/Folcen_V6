const { extractDashParams } = require("../helpers");
const Subscription = require("../models/Subscription")
const PlanRule = require("../models/PlanRule");
const Response = require("./Response")
const _ = require('lodash')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const User = require("../models/User");

// New method to get the effective plan for the current user
exports.getEffectivePlan = async (req, res) => {
    try {
        const userId = req.authUser._id;
        const userRole = req.authUser.role;
        const userCountry = req.authUser.country;
        const userCity = req.authUser.city;

        // 1. Get global subscription
        let plan = await Subscription.findOne({ userId: { $exists: false } }).lean();
        if (!plan) {
            // Fallback if no global plan exists
            plan = { dayPrice: 0, weekPrice: 0, monthPrice: 0, yearPrice: 0, currency: 'USD', offers: [] };
        }

        // 2. Find applicable rules
        const rules = await PlanRule.find({
            isActive: true,
            $or: [
                { targetUsers: userId },
                { targetRoles: userRole },
                { targetCountries: userCountry },
                { targetCities: userCity }
            ],
            $or: [
                { expiresAt: { $exists: false } },
                { expiresAt: null },
                { expiresAt: { $gt: new Date() } }
            ]
        }).sort({ priority: -1 });

        // 3. Apply rules
        plan.isFree = false;
        for (const rule of rules) {
            if (rule.type === 'FREE_PLAN') {
                plan.dayPrice = 0;
                plan.weekPrice = 0;
                plan.monthPrice = 0;
                plan.yearPrice = 0;
                plan.isFree = true;
                break; // FREE_PLAN is usually the ultimate override
            } else if (rule.type === 'PRICE_OVERRIDE') {
                if (rule.config.dayPrice !== undefined) plan.dayPrice = rule.config.dayPrice;
                if (rule.config.weekPrice !== undefined) plan.weekPrice = rule.config.weekPrice;
                if (rule.config.monthPrice !== undefined) plan.monthPrice = rule.config.monthPrice;
                if (rule.config.yearPrice !== undefined) plan.yearPrice = rule.config.yearPrice;
                if (rule.config.currency) plan.currency = rule.config.currency;
                if (rule.config.offers && rule.config.offers.length > 0) plan.offers = rule.config.offers;
            }
        }

        return Response.sendResponse(res, plan);
    } catch (error) {
        console.error('Error getting effective plan:', error);
        return Response.sendError(res, 500, 'Server error');
    }
};

// Dashboard CRUD for Plan Rules
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


exports.clientSecret = async(req, res) => {
    console.log("Ssssssssssss")
    const subscription = req.subscription
    const duration = req.body.duration
    const { amount } = subExpireDateAndAmount(subscription, duration)
    const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: subscription.currency,
        metadata: {integration_check: 'accept_a_payment'},
    });
    Response.sendResponse(res, {
        client_secret: paymentIntent.client_secret
    })
}

const subExpireDateAndAmount = (subscription, duration) => {

    const expireDate = new Date()
    let amount;

    if(duration == 'day'){
        amount = subscription.dayPrice
        expireDate.setDate(expireDate.getDate() + 1)
    }
    if(duration == 'week'){
        amount = subscription.weekPrice
        expireDate.setDate(expireDate.getDate() + 7)

    }
    if(duration == 'month'){
        amount = subscription.monthPrice
        expireDate.setMonth(expireDate.getMonth() + 1)
    }
    if(duration == 'year'){
        amount = subscription.yearPrice
        expireDate.setFullYear(expireDate.getFullYear() + 1)
    }

    return {
        amount,
        expireDate
    }
}

exports.subscribe = async (req, res) => {
    try {
        const subscription = req.subscription
        const duration = req.body.duration
        const authUser = req.authUser
        const { expireDate } = subExpireDateAndAmount(subscription, duration)
        
        authUser.subscription = {
            _id: subscription._id,
            expireDate
        }
        const user = await authUser.save();
        return Response.sendResponse(res, user.publicInfo(), 'Payment Successful');
    } catch (err) {
        console.error('Error in subscribe:', err);
        return Response.sendError(res, 500, 'Failed to subscribe');
    }
}

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
        const { userId, days, planId } = req.body;
        const user = await User.findById(userId);
        if (!user) return Response.sendError(res, 404, 'User not found');

        const now = new Date();
        const currentExpire = (user.subscription && user.subscription.expireDate) ? new Date(user.subscription.expireDate) : now;
        const baseDate = currentExpire > now ? currentExpire : now;
        
        const newExpire = new Date(baseDate);
        newExpire.setDate(newExpire.getDate() + parseInt(days));

        user.subscription = {
            _id: planId || (user.subscription ? user.subscription._id : null),
            expireDate: newExpire
        };

        // If no planId and no existing plan, try to find a global plan
        if (!user.subscription._id) {
            const globalPlan = await Subscription.findOne({ userId: { $exists: false } });
            if (globalPlan) user.subscription._id = globalPlan._id;
        }

        await user.save();
        return Response.sendResponse(res, user.subscription, `Gave ${days} days of free subscription`);
    } catch (err) {
        console.error('Error in giveFreeSubscription:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};