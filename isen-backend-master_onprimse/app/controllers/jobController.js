const Response = require('./Response');
const fs = require('fs');
const fsp = fs.promises;
const _ = require('lodash');
const path = require('path');
const Job = require('../models/Job');
const mongoose = require('mongoose');
const { extractDashParams, report } = require('../helpers');
const Report = require('../models/Report');

// Create a short excerpt like Facebook: cut at word boundary and append ellipsis
const makeExcerpt = (text, max = 150) => {
    if (!text) return text;
    if (text.length <= max) return text;
    const truncated = text.slice(0, max);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > Math.floor(max * 0.6)) {
        return truncated.slice(0, lastSpace) + '...';
    }
    return truncated + '...';
}

exports.reportJob = async (req, res) => {
    try {
        const job = req.job;
        
        const newReport = await report(req, res, 'Job', job._id);
        if (!newReport || res.headersSent) return;

        await Job.updateOne({ _id: job._id }, { $push: { reports: newReport._id } });
        return Response.sendResponse(res, null, 'Thank you for reporting');
    } catch (error) {
        console.log(error);
        if (!res.headersSent) {
            return Response.sendError(res, 500, 'Failed to report job');
        }
    }
};

exports.clearJobReports = async (req, res) => {
    try {
        await Report.deleteMany({
            "entity._id": req.job._id,
            "entity.name": "job"
        });
        return Response.sendResponse(res, null, "Reports cleaned");
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to clear reports');
    }
};

exports.toggleJobStatus = async (req, res) => {
    try {
        const job = req.job;
        job.deletedAt = job.deletedAt ? null : new Date().toISOString();
        await job.save();
        return Response.sendResponse(res, job, 'Job ' + (job.deletedAt ? 'disabled' : 'enabled'));
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to update job status');
    }
};

exports.showJobDash = async (req, res) => {
    try {
        const job = await Job.findOne({ _id: req.job._id })
            .populate({
                path: 'user',
                select: 'firstName lastName email mainAvatar'
            })
            .populate({
                path: 'reports',
                populate: {
                    path: 'userId',
                    select: 'firstName lastName email'
                }
            });
        
        if (!job) return Response.sendError(res, 404, 'Job not found');

        // Transform photo for dashboard display if needed
        const jobData = job.toObject();
        if (jobData.photo && jobData.photo.path) {
            jobData.photo = jobData.photo.path;
        }

        return Response.sendResponse(res, jobData);
    } catch (error) {
        console.log(error);
        return Response.sendError(res, 500, 'Server error, please try again later');
    }
};

exports.allJobs = async (req, res) => {
    try {
        const dashParams = extractDashParams(req, ['title', 'description', 'company', 'location']);
        const jobs = await Job.aggregate()
            .match(dashParams.filter)
            .project({
                _id: 1,
                title: 1,
                description: 1,
                company: 1,
                photo: "$photo.path",
                country: 1,
                city: 1,
                jobType: 1,
                minSalary: 1,
                maxSalary: 1,
                experienceLevel: 1,
                jobCategory: 1,
                address:1,
                remoteOption: 1,
                applicationDeadline: 1,
                jobRequirements: 1,
                jobBenefits: 1,
                educationLevel: 1,
                industry: 1,
                website: 1,
                jobLocationType: 1,
                deletedAt: 1,
                reports: { $size: "$reports" }
            })
            .sort(dashParams.sort)
            .skip(dashParams.skip)
            .limit(dashParams.limit);

        const count = await Job.countDocuments(dashParams.filter);
        return Response.sendResponse(res, {
            docs: jobs,
            totalPages: Math.ceil(count / dashParams.limit)
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error, please try again later');
    }
};

exports.showJob = (req, res) => {
    return Response.sendResponse(res, req.job);
};

exports.postedJobs = async (req, res) => {
    try {
        const filter = {
            user: new mongoose.Types.ObjectId(req.auth._id),
            title: new RegExp('^' + req.query.search, 'i'),
            deletedAt: null
        };
        const page = parseInt(req.query.page) || 0;
        const limit = 20;

        const jobs = await Job.find(filter, {
            title: 1,
            photo: "$photo.path",
            country: 1,
            city: 1,
            address:1,
            company: 1,
            jobType: 1,
            minSalary: 1,
            maxSalary: 1,
            industry: 1,
            description: 1,
            createdAt: 1
        }).sort({ createdAt: -1 }).skip(limit * page).limit(limit);

        const count = await Job.countDocuments(filter);
        const jobsWithExcerpts = jobs.map(job => {
            const j = job.toObject();
            const ex = makeExcerpt(j.description, 150);
            j.excerpt = ex;
            j.description = ex; // shortened for list view
            return j;
        });
        return Response.sendResponse(res, {
            jobs: jobsWithExcerpts,
            more: (count - (limit * (page + 1))) > 0
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to retrieve jobs');
    }
};

exports.availableJobs = async (req, res) => {
    try {
        // Get disabled, deleted, or banned users to exclude their jobs
        const inactiveUsers = await User.find({ 
            $or: [
                { enabled: false },
                { isDeleted: true },
                { deletedAt: { $ne: null } },
                { banned: true }
            ]
        }).select('_id');
        const inactiveUserIds = inactiveUsers.map(u => u._id);

        const filter = {
            title: new RegExp('^' + req.query.search, 'i'),
            deletedAt: null,
            city: req.authUser.city,
            country: req.authUser.country,
            user: { $nin: inactiveUserIds },
            $or: [
                { visibility: 'public' },
                { visibility: 'friends-only', user: { $in: req.authUser.friends } },
                { user: req.auth._id }
            ]
        };
        const limit = 20;
        const page = parseInt(req.query.page) || 0;

        const jobs = await Job.find(filter, {
            title: 1,
            photo: "$photo.path",
            country: 1,
            city: 1,
            address:1,
            jobType: 1,
            minSalary: 1,
            maxSalary: 1,
            company: 1,
            industry: 1,

            description: 1,
            createdAt: 1
        }).sort({ createdAt: -1 }).skip(limit * page).limit(limit);

        const count = await Job.countDocuments(filter);
        const jobsWithExcerpts = jobs.map(job => {
            const j = job.toObject();
            const ex = makeExcerpt(j.description, 150);
            j.excerpt = ex;
            j.description = ex; // shortened for list view
            return j;
        });
        return Response.sendResponse(res, {
            jobs: jobsWithExcerpts,
            more: (count - (limit * (page + 1))) > 0
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to retrieve jobs');
    }
};

exports.storeJob = async (req, res) => {
    try {
        const job = new Job(req.fields);
        job.user = req.auth._id;
console.log("userrrrrrrrrrrrrid",job.user);
        if (req.files.photo) {
            await storeJobPhoto(req.files.photo, job);
        } else {
            return Response.sendError(res, 400, 'Photo is required');
        }

        await job.save();
        
        // Send notification to followers and friends
        const notificationTitle = `${req.authUser.firstName} ${req.authUser.lastName}`;
        const notificationBody = `posted a new job: ${job.title}`;
        
        let recipients = [];
        if (job.visibility === 'public') {
            recipients = [...(req.authUser.followers || []), ...(req.authUser.friends || [])];
        } else if (job.visibility === 'friends-only') {
            recipients = [...(req.authUser.friends || [])];
        }
        
        recipients = [...new Set(recipients.map(id => id.toString()))].filter(id => id !== req.auth._id.toString());

        if (recipients.length > 0) {
            sendNotification(
                { en: notificationTitle },
                { en: notificationBody },
                { type: 'followed_user_created_job', link: `/tabs/jobs/details/${job._id}` },
                [],
                recipients
            );

            // Emit socket event for real-time badges
            try {
                const io = req.app && req.app.get('io');
                if (io) io.emit('new-business-post', { jobId: job._id });
            } catch (e) {}
        }

        job.photo.path = (res.locals && res.locals.BASEURL ? res.locals.BASEURL : process.env.BASEURL) + job.photo.path;
        return Response.sendResponse(res, job);
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to create job');
    }
};

const storeJobPhoto = async (photo, job) => {
    try {
        const photoName = `${job._id}.${fileExtension(photo.name)}`;
        const photoPath = path.join(__dirname, `./../../public/jobs/${photoName}`);
        const dir = path.dirname(photoPath);

        await fsp.mkdir(dir, { recursive: true });
        const data = await fsp.readFile(photo.path);
        await fsp.writeFile(photoPath, data);
        job.photo.path = `/jobs/${photoName}`;
        job.photo.type = photo.type;
    } catch (err) {
        console.log(err);
    }
};


exports.updateJob = async (req, res) => {
    try {
        let job = req.job;
        const fields = _.omit(req.fields, ['photo']);
        job = _.extend(job, fields);

        if (req.files.photo) {
            await storeJobPhoto(req.files.photo, job);
        }

        await job.save();
        return Response.sendResponse(res, job, 'Job updated successfully');
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to update job');
    }
};

exports.deleteJob = async (req, res) => {
    try {
        const job = req.job;
        job.deletedAt = new Date().toISOString();
        await job.save();
        return Response.sendResponse(res, null, 'Job removed');
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to remove job');
    }
};

exports.destroyJob = async (req, res) => {
    try {
        const job = req.job;

        if (!job) {
            return Response.sendError(res, 404, 'Job not found');
        }

        const photoPath = path.join(__dirname, `./../../public/${job.photo.path}`);

        // Use deleteOne instead of remove()
        await Job.deleteOne({ _id: job._id });

        try {
            await fsp.access(photoPath);
            await fsp.unlink(photoPath);
        } catch (e) {
            // ignore if not exists
        }

        return Response.sendResponse(res, null, 'Job successfully removed');
    } catch (err) {
        console.error(err);
        return Response.sendError(res, 400, 'Failed to remove job');
    }
};
