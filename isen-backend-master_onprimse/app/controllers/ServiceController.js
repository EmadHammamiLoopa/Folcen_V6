const Response = require('./Response');
const fs = require('fs');
const fsp = fs.promises;
const _ = require('lodash');
const path = require('path');
const Service = require('../models/Service');
const User = require('../models/User');
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

exports.reportService = async (req, res) => {
    try {
        const service = req.service;
        
        const newReport = await report(req, res, 'Service', service._id);
        if (!newReport || res.headersSent) return;

        await Service.updateOne({ _id: service._id }, { $push: { reports: newReport._id } });
        return Response.sendResponse(res, null, 'Thank you for reporting');
    } catch (error) {
        console.log(error);
        if (!res.headersSent) {
            return Response.sendError(res, 500, 'Failed to report service');
        }
    }
};

exports.clearServiceReports = async (req, res) => {
    try {
        await Report.deleteMany({
            "entity._id": req.service._id,
            "entity.name": "service"
        });
        return Response.sendResponse(res, null, "Reports cleaned");
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to clear reports');
    }
};

exports.toggleServiceStatus = async (req, res) => {
    try {
        const service = req.service;
        service.deletedAt = service.deletedAt ? null : new Date().toISOString();
        await service.save();
        return Response.sendResponse(res, service, 'Service ' + (service.deletedAt ? 'disabled' : 'enabled'));
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to update service status');
    }
};

exports.showServiceDash = async (req, res) => {
    try {
        const service = await Service.findOne({ _id: req.service._id })
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
        
        if (!service) return Response.sendError(res, 404, 'Service not found');

        // Transform photo for dashboard display if needed
        const serviceData = service.toObject();
        serviceData.id = service._id;
        if (serviceData.photo && serviceData.photo.path) {
            serviceData.photo = serviceData.photo.path;
        }

        return Response.sendResponse(res, serviceData);
    } catch (error) {
        console.log(error);
        return Response.sendError(res, 500, 'Server error, please try again later');
    }
};

exports.showService = (req, res) => {
    return Response.sendResponse(res, req.service); // Includes all new fields if attached by serviceById
};


exports.allServices = async (req, res) => {
    try {
        const dashParams = extractDashParams(req, ['title', 'description', 'company', 'country', 'city']);
        const services = await Service.aggregate()
            .match(dashParams.filter)
            .project({
                _id: 1,
                title: 1,
                description: 1,
                company: 1,
                photo: "$photo.path",
                country: 1,
                city: 1,
                deletedAt: 1,
                reports: { $size: { $ifNull: ["$reports", []] } }
            })
            .sort(dashParams.sort)
            .skip(dashParams.skip)
            .limit(dashParams.limit);

        const count = await Service.countDocuments(dashParams.filter);
        return Response.sendResponse(res, {
            docs: services,
            totalPages: Math.ceil(count / dashParams.limit)
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error, please try again later');
    }
};



exports.postedServices = async (req, res) => {
    try {
        const filter = {
            user: new mongoose.Types.ObjectId(req.auth._id),
            title: new RegExp('^' + req.query.search, 'i'),
            deletedAt: null
        };
        const limit = 20;
        const page = parseInt(req.query.page) || 0;

        const services = await Service.find(filter, {
            title: 1,
            photo: "$photo.path",
            company: 1,
            country: 1,
            city: 1,
            createdAt: 1
        }).sort({ createdAt: -1 }).skip(limit * page).limit(limit);

        const count = await Service.countDocuments(filter);
        const servicesWithExcerpts = services.map(service => {
            const s = service.toObject();
            const ex = makeExcerpt(s.description, 150);
            s.excerpt = ex;
            s.description = ex; // shortened for list view
            return s;
        });

        return Response.sendResponse(res, {
            services: servicesWithExcerpts,
            more: (count - (limit * (page + 1))) > 0
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to retrieve services');
    }
};

exports.availableServices = async (req, res) => {
    try {
        // Get disabled, deleted, or banned users to exclude their services
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

        const services = await Service.find(filter, {
            title: 1,
            photo: "$photo.path",
            company: 1,
            country: 1,
            city: 1,
            createdAt: 1
        }).sort({ createdAt: -1 }).skip(limit * page).limit(limit);

        const count = await Service.countDocuments(filter);

        const servicesWithExcerpts = services.map(service => {
            const s = service.toObject();
            const ex = makeExcerpt(s.description, 150);
            s.excerpt = ex;
            s.description = ex; // shortened for list view
            return s;
        });

        // Return an empty array if no services found instead of throwing an error
        return Response.sendResponse(res, {
            services: servicesWithExcerpts || [],
            more: (count - (limit * (page + 1))) > 0
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to retrieve services');
    }
};

exports.storeService = async (req, res) => {
    try {
        // Parse paymentMethods field if it's a string
        if (typeof req.fields.paymentMethods === 'string') {
            req.fields.paymentMethods = JSON.parse(req.fields.paymentMethods);
        }

        // Create the service object with all fields
        const postingUserId = req.authUser && req.authUser._id ? req.authUser._id : null;
        const service = new Service({
            title: req.fields.title,
            company: req.fields.company,
            country: req.fields.country,
            city: req.fields.city,
            phone: req.fields.phone,
            description: req.fields.description,
            serviceCategory: req.fields.serviceCategory,
            serviceRate: req.fields.serviceRate,
            availability: req.fields.availability,
            Experience: req.fields.Experience,
            serviceDuration: req.fields.serviceDuration,
            paymentMethods: req.fields.paymentMethods, // Expecting an array
            licenseCertification: req.fields.licenseCertification,
            websitePortfolio: req.fields.websitePortfolio,
            address: req.fields.address,
                        user: postingUserId
        });

        // Store the photo
        if (req.files.photo) {
            await storeServicePhoto(req.files.photo, service);
        } else {
            return Response.sendError(res, 400, 'Photo is required');
        }

        await service.save();

        // Send notification to followers and friends
        const notificationTitle = `${req.authUser.firstName} ${req.authUser.lastName}`;
        const notificationBody = `offered a new service: ${service.title}`;
        
        let recipients = [];
        if (service.visibility === 'public') {
            recipients = [...(req.authUser.followers || []), ...(req.authUser.friends || [])];
        } else if (service.visibility === 'friends-only') {
            recipients = [...(req.authUser.friends || [])];
        }
        
        recipients = [...new Set(recipients.map(id => id.toString()))].filter(id => id !== req.auth._id.toString());

        if (recipients.length > 0) {
            const { sendNotification } = require('../helpers');
            sendNotification(
                { en: notificationTitle },
                { en: notificationBody },
                { type: 'followed_user_created_service', link: `/tabs/services/details/${service._id}` },
                [],
                recipients
            );

            // Emit socket event for real-time badges (targeted to recipients only)
            try {
                const { emitToUser: _emit } = require('../helpers');
                recipients.forEach(uid => _emit(uid, 'new-business-post', { serviceId: service._id }));
            } catch (e) {}
        }

        service.photo.path = (res.locals && res.locals.BASEURL ? res.locals.BASEURL : process.env.BASEURL) + service.photo.path;
        return Response.sendResponse(res, service, 'The service has been created successfully');
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to create service');
    }
};



const storeServicePhoto = async (photo, service) => {
    try {
        const fileExt = path.extname(photo.name);
        const photoName = `${service._id}${fileExt}`;
        const photoPath = path.join(__dirname, `../../public/services/${photoName}`);
        const dir = path.dirname(photoPath);

        await fsp.mkdir(dir, { recursive: true });
        const data = await fsp.readFile(photo.path);
        await fsp.writeFile(photoPath, data);
        service.photo.path = `/services/${photoName}`;
        service.photo.type = photo.type;
    } catch (err) {
        console.log("Error storing service photo:", err);
    }
};


exports.updateService = async (req, res) => {
    try {
        let service = req.service;
        const fields = _.omit(req.fields, ['photo']);
        
        // Include the new fields to be updated
        service = _.extend(service, fields, {
            serviceCategory: req.fields.serviceCategory,  // New field
            serviceRate: req.fields.serviceRate,          // New field
            availability: req.fields.availability,        // New field
            Experience: req.fields.Experience,          // New field
            serviceDuration: req.fields.serviceDuration,  // New field
            paymentMethods: req.fields.paymentMethods,    // New field
            licenseCertification: req.fields.licenseCertification,  // New field
            websitePortfolio: req.fields.websitePortfolio,          // New field
            address: req.fields.address                  // New field
        });

        if (req.files.photo) {
            await storeServicePhoto(req.files.photo, service);
        }

        await service.save();
        return Response.sendResponse(res, service, 'The service has been updated successfully');
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to update service');
    }
};

exports.deleteService = async (req, res) => {
    try {
        const service = req.service;
        service.deletedAt = new Date().toISOString();
        await service.save();
        return Response.sendResponse(res, null, 'Service removed');
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to remove service');
    }
};

exports.destroyService = async (req, res) => {
    try {
        const service = req.service;
        const photoPath = path.join(__dirname, `./../../public/${service.photo.path}`);

        // Use deleteOne() to delete the service
        await Service.deleteOne({ _id: service._id });

        // Check if the photo exists and delete it if necessary
        try {
            await fsp.access(photoPath);
            await fsp.unlink(photoPath);
        } catch (e) {
            // ignore if file does not exist
        }

        return Response.sendResponse(res, null, 'Service removed');
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to remove service');
    }
};
