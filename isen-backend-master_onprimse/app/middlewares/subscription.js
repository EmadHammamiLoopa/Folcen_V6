const Response = require("../controllers/Response")
const Subscription = require("../models/Subscription")
const User = require("../models/User")
const mongoose = require('mongoose');
const { hasFreePlanEntitlement } = require('../utils/subscriptionPolicy');

exports.subscriptionById = async (req, res, next, subscriptionId) => {
    try {
      // Validate the ID
      if (!subscriptionId || subscriptionId === 'null' || subscriptionId === 'undefined') {
        return Response.sendError(res, 400, 'Invalid Subscription ID');
      }

      if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
        return Response.sendError(res, 400, 'Invalid Subscription ID format');
      }

      const subscription = await Subscription.findById(subscriptionId);
      if (!subscription) {
        return Response.sendError(res, 404, 'Subscription not found');
      }

      req.subscription = subscription; // Attach subscription to request
      next();
    } catch (err) {
      console.error('Error finding subscription:', err);
      return Response.sendError(res, 500, 'Server error');
    }
  };



exports.userSubscribed = async (user) => {
    if (
        !user ||
        !user._id
    ) {
        return false;
    }

    if (
        user.subscription &&
        user.subscription._id
    ) {
        const expireDate =
            new Date(
                user.subscription.expireDate
            );

        if (
            !Number.isNaN(
                expireDate.getTime()
            ) &&
            expireDate.getTime() >
                Date.now()
        ) {
            return true;
        }

        try {
            await User.updateOne(
                {
                    _id:
                        user._id
                },
                {
                    $set: {
                        subscription:
                            null
                    }
                }
            );

            user.subscription =
                null;

        } catch (err) {
            console.error(
                'Error cleaning expired user subscription:',
                err
            );
        }
    }

    try {
        if (
            await hasFreePlanEntitlement(
                user
            )
        ) {
            return true;
        }

    } catch (err) {
        console.error(
            'Error evaluating FREE_PLAN entitlement:',
            err
        );
    }

    return false;
};
