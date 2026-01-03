const Response = require("../controllers/Response");
const { adminCheck } = require("../helpers");
const Job = require("../models/Job");
const { userSubscribed } = require("./subscription");

const mongoose = require('mongoose');

// Refactor jobById to use async/await and include new fields
exports.jobById = async (req, res, next, id) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return Response.sendError(res, 400, 'Invalid Job ID format');
        }
        const job = await Job.findOne(
            { _id: id },
            {
                title: 1,
                company: 1,
                country: 1,
                city: 1,
                email: 1,
                description: 1,
                photo: "$photo.path",
                user: 1,
                deletedAt: 1,
                createdAt: 1,
                jobType: 1,
                minSalary: 1,
                maxSalary: 1,
                experienceLevel: 1,
                jobCategory: 1,
                remoteOption: 1,
                applicationDeadline: 1,
                jobRequirements: 1,
                jobBenefits: 1,
                educationLevel: 1,
                industry: 1,
                website: 1,
                jobLocationType: 1,
                address:1,
            }
        ).populate('user', 'enabled isDeleted banned deletedAt');

        if (!job) return Response.sendError(res, 404, 'Job not found');

        // Check if author is inactive
        const author = job.user;
        const requesterId = req.auth && req.auth._id ? req.auth._id.toString() : null;
        const isAdmin = req.auth && (req.auth.role === 'ADMIN' || req.auth.role === 'SUPER ADMIN');
        const isSelf = author && author._id.toString() === requesterId;

        if (author && (author.enabled === false || author.isDeleted || author.banned || author.deletedAt)) {
            if (!isAdmin && !isSelf) {
                return Response.sendError(res, 404, 'Job not found');
            }
        }
        
        req.job = job;
        next();
    } catch (err) {
        console.error('Error finding job by ID:', err);
        return Response.sendError(res, 500, 'Internal server error');
    }
};

exports.jobOwner = (req, res, next) => {
    if (adminCheck(req)) {
        return next();
    }

    if (req.auth._id != req.job.user) {
        return Response.sendError(res, 403, 'Access denied');
    }

    next();
};

// Refactor jobStorePermission to use async/await
exports.jobStorePermission = async (req, res, next) => {

    console.log("userhereeeeeeeeeeeeeeeeeeeeeeee");
    try {
        if (await userSubscribed(req.authUser)) {
            return next();
        }
        console.log("reqreqreqreqreqreqreq",req);

        const jobs = await Job.find({ user: req.auth._id })
            .sort({ createdAt: -1 })
            .limit(1)
            .exec();  // Use exec() to run the query and return a promise

        const currDate = new Date();
        if (jobs.length > 0 && currDate.getTime() - new Date(jobs[0].createdAt).getTime() < 24 * 60 * 60 * 1000) {
            return Response.sendResponse(res, { date: jobs[0].createdAt });
        } else {
            next();
        }
    } catch (err) {
        console.error('Error in jobStorePermission:', err);
        return Response.sendError(res, 500, 'An error has occurred, please try again later');
    }
};
