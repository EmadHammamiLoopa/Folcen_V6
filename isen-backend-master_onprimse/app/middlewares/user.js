const Response = require("../controllers/Response");
const User = require("../models/User");
const mongoose = require('mongoose');

exports.userById = async (req, res, next, id) => {
    try {
        if (id) id = id.trim();
        console.log(`Looking for user with ID: ${id}`);

        // Handle Base64 encoded IDs from frontend
        if (id && !mongoose.Types.ObjectId.isValid(id)) {
            try {
                // Revert URL-safe base64
                const safe = id.replace(/-/g, '+').replace(/_/g, '/');
                // Add padding if missing
                const padded = safe.padEnd(safe.length + (4 - safe.length % 4) % 4, '=');
                const decoded = Buffer.from(padded, 'base64').toString('utf8');
                if (mongoose.Types.ObjectId.isValid(decoded)) {
                    console.log(`Decoded Base64 ID: ${id} -> ${decoded}`);
                    id = decoded;
                    // Also update req.params if it exists to ensure controllers get the normalized ID
                    if (req.params && req.params.userId) {
                        req.params.userId = decoded;
                    }
                }
            } catch (e) {
                console.warn('Failed to decode potential Base64 ID:', id);
            }
        }

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            console.error(`Invalid User ID format: ${id}`);
            return Response.sendError(res, 400, 'Invalid User ID format');
        }

        // Fetch user by ID
        const user = await User.findById(id);

        if (!user) {
            console.error(`User not found with ID: ${id}`); // Log if user is not found
            return Response.sendError(res, 400, 'User not found');
        }

        // Ensure mainAvatar and avatar are set
        if (!user.mainAvatar) {
            console.log(`mainAvatarmainAvatarmainAvatar`); // Log if mainAvatar is missing
            user.mainAvatar = user.getDefaultAvatar();
        }

        if (!user.avatar || user.avatar.length === 0) {
            user.avatar = [user.mainAvatar];
            console.log(`mainAvatarmainAvatarmainAvaeeeeeeeeeeetar`); // Log if avatar is missing
        }

        if (user.subscription && user.subscription._id) {
            user.subscription._id = user.subscription._id.toString();
          }
          

        console.log(`User found: ${user}`); // Log the found user
        req.user = user;
        next();
    } catch (err) {
        console.error(`Error finding user with ID ${id}:`, err); // Log any error during the lookup
        return Response.sendError(res, 400, 'User not found');
    }
};


exports.isNotFriend = async (req, res, next) => {
    try {
        let user = req.user;
        // If param handler didn't populate req.user, try to load it here
        if (!user && req.params && req.params.userId) {
            user = await awaitUserFallback(req.params.userId);
            if (user) req.user = user;
        }
        console.log('[user.middleware] isNotFriend - auth:', req.auth && req.auth._id, 'targetUser:', user && user._id);
        if (!user || !user.friends) return next();
        if (!req.auth || !req.auth._id) return Response.sendError(res, 401, 'Unauthorized');
        if (user.friends.includes(req.auth._id))
            return Response.sendError(res, 400, 'user already friend');
        next();
    } catch (err) {
        console.error('isNotFriend error:', err);
        return Response.sendError(res, 500, 'Server error');
    }
}

async function awaitUserFallback(id) {
    try {
        const User = require('../models/User');
        return await User.findById(id);
    } catch (e) {
        console.error('awaitUserFallback error', e);
        return null;
    }
}

exports.isNotBlocked = async (req, res, next) => {
    try {
        const user = req.user;

        // Find the authenticated user using async/await
        const authUser = await User.findOne({ _id: req.auth._id });

        // Check if either user has blocked the other
        if (authUser.blockedUsers.includes(user._id) || user.blockedUsers.includes(authUser._id)) {
            return Response.sendError(res, 404, 'Not found');
        }

        // Proceed to the next middleware
        next();
    } catch (err) {
        // Log any error that occurs and respond with a server error message
        console.error('Error in isNotBlocked middleware:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};

