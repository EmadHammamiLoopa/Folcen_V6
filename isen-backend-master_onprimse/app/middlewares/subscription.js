const Response = require("../controllers/Response")
const Subscription = require("../models/Subscription")
const User = require("../models/User")
const mongoose = require('mongoose');

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
    if (user.subscription && user.subscription._id) {
        if (new Date(user.subscription.expireDate).getTime() > new Date().getTime()) {
            return true;
        }

        try {
            // Use await to handle promises and remove callback
            const result = await User.updateOne(
                { _id: user._id }, 
                { $set: { subscription: null } }
            );
            console.log('Update result:', result);
        } catch (err) {
            console.error('Error updating user subscription:', err);
        }
    }
    return false;
};
