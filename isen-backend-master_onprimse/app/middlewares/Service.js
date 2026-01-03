const Response = require('../controllers/Response');
const { adminCheck } = require('../helpers');
const Service = require('./../models/Service');
const { userSubscribed } = require('./subscription');

const mongoose = require('mongoose');

// Fetch service by ID
exports.serviceById = async (req, res, next, id) => {
    
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return Response.sendError(res, 400, 'Invalid Service ID format');
        }
        const service = await Service.findOne({ _id: id }, {
            title: 1,
            company: 1,
            country: 1,
            city: 1,
            phone: 1,
            description: 1,
            photo: "$photo.path",
            user: 1,
            deletedAt: 1,
            serviceCategory: 1,       // New field
            serviceRate: 1,           // New field
            availability: 1,          // New field
            Experience: 1,           // New field
            serviceDuration: 1,       // New field
            paymentMethods: 1,        // New field
            licenseCertification: 1,  // New field
            websitePortfolio: 1,      // New field
            address: 1,               // New field
            createdAt: 1

        }).populate('user', 'enabled isDeleted banned deletedAt');

        if (!service) {
            return Response.sendError(res, 404, 'Service not found');
        }

        // Check if author is inactive
        const author = service.user;
        const requesterId = req.auth && req.auth._id ? req.auth._id.toString() : null;
        const isAdmin = req.auth && (req.auth.role === 'ADMIN' || req.auth.role === 'SUPER ADMIN');
        const isSelf = author && author._id.toString() === requesterId;

        if (author && (author.enabled === false || author.isDeleted || author.banned || author.deletedAt)) {
            if (!isAdmin && !isSelf) {
                return Response.sendError(res, 404, 'Service not found');
            }
        }

        req.service = service; // Attach service to request object
        next(); // Proceed to the next middleware or controller
    } catch (err) {
        console.error(err);
        return Response.sendError(res, 500, 'An error occurred while fetching the service');
    }
};


// Middleware to check if the user is the owner of the service or admin
exports.serviceOwner = (req, res, next) => {
    if (adminCheck(req)) {
        return next(); // Admin users can proceed
    }

    if (req.auth._id !== String(req.service.user)) {
        return Response.sendError(res, 403, 'Access denied');
    }

    next(); // Proceed if the user is the owner
};

// Middleware to check if the user has permission to store a new service
exports.serviceStorePermission = async (req, res, next) => {
    try {
        // Check if the user is subscribed
        if (await userSubscribed(req.authUser)) {
            return next(); // Proceed if the user is subscribed
        }

        // Find the last service created by the user
        const services = await Service.find(
            { user: req.auth._id },
            {},
            { sort: { createdAt: -1 }, limit: 1 }
        );

        const currDate = new Date();

        // Check if the last service was created less than 24 hours ago
        if (services[0] && (currDate.getTime() - new Date(services[0].createdAt).getTime()) < (24 * 60 * 60 * 1000)) {
            return Response.sendResponse(res, { date: services[0].createdAt });
        }

        next(); // Proceed if no restrictions
    } catch (error) {
        console.error(error);
        return Response.sendError(res, 400, 'An error has occurred, please try again later');
    }
};
