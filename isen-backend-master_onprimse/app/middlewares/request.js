const mongoose = require("mongoose");
const Response = require("../controllers/Response");
const { ERROR_CODES } = require("../helpers");
const Request = require("../models/Request");
const User = require("../models/User");
const { userSubscribed } = require("./subscription");

exports.requestById = async (req, res, next, id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return Response.sendError(res, 400, 'Invalid Request ID format');
    }
    try {
        const request = await Request.findOne({ _id: id });
        if (!request) return Response.sendError(res, 400, 'Request not found');
        console.log(request);
        req.request = request;
        next();
    } catch (err) {
        return Response.sendError(res, 500, 'Failed to retrieve request');
    }
};

exports.requestSender = async (req, res, next) => {
    try {
        console.log('[request.middleware] requestSender prepared:', !!req.request);
        const request = req.request;
        if (!req.auth || !req.auth._id) return Response.sendError(res, 401, 'Unauthorized');
        if (request.from != req.auth._id)
            return Response.sendError(res, 403, 'Access forbidden');

        const user = await User.findOne({ _id: request.from });
        if (!user) return Response.sendError(res, 403, 'User not found');
        
        req.user = user;
        next();
    } catch (err) {
        return Response.sendError(res, 500, 'Failed to retrieve user');
    }
};

exports.requestReceiver = async (req, res, next) => {
    try {
        console.log('[request.middleware] requestReceiver prepared:', !!req.request);
        const request = req.request;
        if (!req.auth || !req.auth._id) return Response.sendError(res, 401, 'Unauthorized');
        if (request.to != req.auth._id)
            return Response.sendError(res, 403, 'Access forbidden');

        const user = await User.findOne({ _id: request.to });
        if (!user) return Response.sendError(res, 403, 'User not found');
        
        req.user = user;
        next();
    } catch (err) {
        return Response.sendError(res, 500, 'Failed to retrieve user');
    }
};

exports.isFriend = async (req, res, next) => {
    try {
        const request = await Request.findOne({
            $or: [
                { from: new mongoose.Types.ObjectId(req.auth._id), to: new mongoose.Types.ObjectId(req.user._id) },
                { to: new mongoose.Types.ObjectId(req.auth._id), from: new mongoose.Types.ObjectId(req.user._id) }
            ],
            accepted: true
        });

        if (!request) return Response.sendError(res, 400, 'Not a friend');
        next();
    } catch (err) {
        return Response.sendError(res, 500, 'Failed to check friendship');
    }
};

exports.requestNotExist = async (req, res, next) => {
    try {
        let user = req.user;
        // If the param handler did not populate req.user, try to load from params
        if (!user && req.params && req.params.userId) {
            try {
                user = await User.findById(req.params.userId);
                if (user) req.user = user;
            } catch (e) {
                console.error('requestNotExist: failed to load user by param', e);
            }
        }
        console.log('[request.middleware] requestNotExist - auth:', req.auth && req.auth._id, 'targetUser:', user && user._id);

        if (!user) {
            return Response.sendError(res, 400, 'User not found');
        }

        // Check if the auth user already sent a request
        const existingRequest = await Request.findOne({ from: req.auth._id, to: user._id });
        if (existingRequest) {
            return Response.sendResponse(res, { request: 'requesting' }, 'Friend request already sent');
        }

        // Check if the auth user has received a request from the other user
        const incomingRequest = await Request.findOne({ from: user._id, to: req.auth._id });
        if (incomingRequest) {
            return Response.sendResponse(res, { request: 'requested' }, 'This user already sent you a request');
        }

        // If no request exists, move to the next middleware
        next();
    } catch (err) {
        return Response.sendError(res, 500, 'Failed to check request existence');
    }
};

exports.sendRequestPermission = async (req, res, next) => {
    try {
        console.log('[request.middleware] sendRequestPermission - auth:', req.auth && req.auth._id, 'path:', req.path);
        const now = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        if (!req.auth || !req.auth._id) return Response.sendError(res, 401, 'Unauthorized');
        const requests = await Request.countDocuments({
            from: req.auth._id,
            createdAt: { $lt: now.toISOString(), $gt: yesterday.toISOString() }
        });

        console.log('[request.middleware] recent requests count:', requests);

        // Restrict only the friend requests and not chat access
        if (!await userSubscribed(req.authUser) && requests > 2) {
            // This logic should only be triggered for sending friend requests
            if (req.path.includes('/request')) {
                return Response.sendError(res, 403, {
                    code: ERROR_CODES.SUBSCRIPTION_ERROR,
                    message: 'You have only 3 friend requests per day'
                });
            }
        }

        next();
    } catch (error) {
        return Response.sendError(res, 500, 'Failed to check request permission');
    }
};

