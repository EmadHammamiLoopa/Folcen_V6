const { extractDashParams } = require("../helpers");
const Report = require("../models/Report");
const User = require("../models/User"); // Assuming a User model exists
const Content = require("../models/Content"); // Assuming a Content model for managing content
const Response = require("./Response");
const mongoose = require('mongoose'); // ✅ Add this import

const REPORT_RETENTION_DAYS =
    Math.max(
        1,
        Number(
            process.env.REPORT_RETENTION_DAYS ||
            365
        )
    );


const Post = require("../models/Post");
const Comment = require("../models/Comment");
const Channel = require("../models/Channel");
const Product = require("../models/Product");
const Job = require("../models/Job");
const Service = require("../models/Service");
const { createReport } = require('../utils/eventLogger');

exports.allReports = async (req, res) => {
    try {
        const dashParams = extractDashParams(req, ['entityModel']);

        // Fetch all reports with pagination and sorting
        const reports = await Report.find(dashParams.filter)
            .sort(dashParams.sort)
            .skip(dashParams.skip)
            .limit(dashParams.limit);

        const reportDetails = await Promise.all(
            reports.map(async (report) => {
                let referenceDetails;
                let referenceName;

                // Perform different lookups based on the entityModel field
                switch (report.entityModel) {
                    case 'Post':
                        referenceDetails = await Post.findById(report.entity).select('title');
                        referenceName = referenceDetails?.title || 'Unknown Post';
                        break;
                    case 'Comment':
                        referenceDetails = await Comment.findById(report.entity).select('text');
                        referenceName = referenceDetails?.text || 'Unknown Comment';
                        break;
                    case 'Channel':
                        referenceDetails = await Channel.findById(report.entity).select('name');
                        referenceName = referenceDetails?.name || 'Unknown Channel';
                        break;
                    case 'User':
                        referenceDetails = await User.findById(report.entity).select('email');
                        referenceName = referenceDetails?.email || 'Unknown User';
                        break;
                    case 'Product':
                        referenceDetails = await Product.findById(report.entity).select('name');
                        referenceName = referenceDetails?.name || 'Unknown Product';
                        break;
                    case 'Job':
                        referenceDetails = await Job.findById(report.entity).select('title');
                        referenceName = referenceDetails?.title || 'Unknown Job';
                        break;
                    case 'Service':
                        referenceDetails = await Service.findById(report.entity).select('title');
                        referenceName = referenceDetails?.title || 'Unknown Service';
                        break;
                    case 'Photo':
                        referenceDetails = await User.findById(report.entity).select('email');
                        referenceName = `Photo of ${referenceDetails?.email || 'Unknown User'}`;
                        break;
                    default:
                        referenceName = 'Unknown Entity';
                }

                return {
                    _id: report._id,
                    message: report.message,
                    referenceId: report.entity,
                    referenceType: report.entityModel,
                    entityId: report.entity, // For dashboard compatibility
                    entityModel: report.entityModel, // For dashboard compatibility
                    referenceName,
                    userId: report.isAnonymous ? 'Anonymous' : report.reporter,
                    isAnonymous: report.isAnonymous,
                    status: report.status,
                    category: report.reportType,
                    severity: report.severity,
                    solved: report.solved,
                    createdAt: report.createdAt,
                    reportType:report.reportType,
                    photoUrl: report.photoUrl,
                };
            })
        );

        // Count the total number of reports
        const count = await Report.find(dashParams.filter).countDocuments();

        // Send the result
        return Response.sendResponse(res, {
            docs: reportDetails,
            totalPages: Math.ceil(count / dashParams.limit)
        });
    } catch (error) {
        console.error("Error fetching reports:", error);
        return Response.sendError(res, 500, "Server error");
    }
};
exports.takeActionOnReport = async (req, res) => {
    console.log("Processing action:", req.body.action, "for report ID:", req.params.reportId);

    const { reportId } = req.params;
    const { action, notes, banDuration } = req.body;

    try {
        let report = await Report.findById(reportId);
        if (!report) return Response.sendError(res, 404, 'Report not found');

        // Perform the action
        switch (action) {
            case 'ignore':
            case 'dismiss':
                report.status = "dismissed";
                report.resolutionAction = "No Action";
                report.moderatorNotes = notes || 'No additional notes';
                break;

            case 'resolve':
                report.status = "resolved";
                report.resolutionAction = "Resolved";
                report.moderatorNotes = notes || 'Resolved by moderator';
                break;

            case 'removeContent':
                if (report.entity && report.entityModel) {
                    try {
                        if (report.entityModel === 'Photo') {
                            // For Photo reports, the entity is the User
                            const user = await User.findById(report.entity);
                            if (!user) {
                                return Response.sendError(res, 404, 'User not found');
                            }
                            
                            // If it's a photo report, we might want to remove the specific photoUrl from user's gallery
                            // For now, we'll just mark the report as resolved and maybe the moderator can manually remove it
                            // or we can implement a helper to remove the avatar.
                            console.log(`Moderator requested removal of photo: ${report.photoUrl} for user: ${report.entity}`);
                        } else {
                            const model = mongoose.model(report.entityModel);

                            // Check if the content exists before deletion
                            const contentExists = await model.findById(report.entity);
                            if (!contentExists) {
                                console.warn(`Content with ID ${report.entity} not found. Marking report as resolved.`);
                                report.status = "resolved";
                                report.resolutionAction = "Content Removed";
                                await report.save();
                                return Response.sendResponse(res, { message: 'Report resolved: Content was already removed' });
                            }

                            // Delete the content
                            const deleted = await model.findByIdAndDelete(report.entity);
                            if (!deleted) {
                                console.error(`Failed to delete content: ${report.entity}`);
                                return Response.sendError(res, 400, 'Failed to delete content');
                            }

                            console.log(`Deleted content: ${report.entity}`);
                        }
                    } catch (error) {
                        console.error("Error deleting content:", error);
                        return Response.sendError(res, 500, 'Server error deleting content');
                    }
                }

                report.status = "resolved";
                report.resolutionAction = "Content Removed";
                report.moderatorNotes = notes || 'Content removed by moderator';
                break;

            case 'banUser':
            case 'ban_1h':
            case 'ban_24h':
            case 'ban_7d':
            case 'ban_permanent':
            case 'deleteUser':
                let banUntil = null;
                const now = new Date();
                
                if (action === 'ban_1h') {
                    banUntil = new Date(now.getTime() + 60 * 60 * 1000);
                } else if (action === 'ban_24h') {
                    banUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                } else if (action === 'ban_7d') {
                    banUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                } else if (action === 'banUser' && banDuration && !isNaN(banDuration)) {
                    banUntil = new Date(now.getTime() + parseInt(banDuration) * 24 * 60 * 60 * 1000);
                }
                // ban_permanent and deleteUser leave banUntil as null

                let targetUserId = null;
                if (report.entityModel === 'User') {
                    targetUserId = report.entity;
                } else {
                    // Try to find the author of the reported entity
                    try {
                        const model = mongoose.model(report.entityModel);
                        const entity = await model.findById(report.entity);
                        if (entity) {
                            // Check common fields for user reference
                            targetUserId = entity.user || entity.author || entity.owner || entity.creator || entity.userId;
                        }
                    } catch (e) {
                        console.error("Error finding author for ban:", e);
                    }
                }

                if (targetUserId) {
                    if (action === 'deleteUser') {
                        const { purgeUser } = require('../helpers');
                        await purgeUser(targetUserId);
                        report.resolutionAction = "User Deleted (GDPR)";

                        // Record Audit Log
                        const { recordAudit } = require('../utils/audit');
                        await recordAudit({
                            actorId: req.authUser._id,
                            actorRole: req.authUser.role,
                            action: 'DELETE',
                            targetUserId: targetUserId,
                            details: { reason: notes || 'Moderation action: deleteUser', type: 'HARD_DELETE_MODERATION' },
                            ip: req.ip,
                            userAgent: req.get('User-Agent')
                        });
                    } else {
                        const user = await User.findByIdAndUpdate(targetUserId, { 
                            banned: true, 
                            banUntil: banUntil,
                            bannedReason: notes || 'Banned via report action'
                        });
                        if (!user) {
                            return Response.sendError(res, 400, 'Failed to ban user');
                        }
                        report.resolutionAction = "User Banned";

                        // Record Audit Log
                        const { recordAudit } = require('../utils/audit');
                        await recordAudit({
                            actorId: req.authUser._id,
                            actorRole: req.authUser.role,
                            action: 'UPDATE',
                            targetUserId: targetUserId,
                            details: { reason: notes || 'Moderation action: ban', banUntil, action },
                            ip: req.ip,
                            userAgent: req.get('User-Agent')
                        });
                    }
                } else {
                    return Response.sendError(res, 400, 'Could not identify user to ban');
                }

                report.status = "resolved";
                report.moderatorNotes = notes || (action === 'deleteUser' ? 'User account deleted per GDPR request/moderation' : (banUntil ? `User banned until ${banUntil}` : 'User banned permanently'));
                break;

            default:
                return Response.sendError(res, 400, 'Invalid action');
        }

        /*
         * GDPR storage-limitation lifecycle:
         * retention starts when the moderation case closes, not when
         * the report was originally created.
         *
         * Report.js enforces the same invariant as defence-in-depth.
         */
        if (
            report.status === 'resolved' ||
            report.status === 'dismissed'
        ) {
            if (!report.resolvedAt) {
                report.resolvedAt = new Date();
            }

            if (!report.retentionDate) {
                report.retentionDate =
                    new Date(
                        report.resolvedAt.getTime() +
                        REPORT_RETENTION_DAYS *
                        24 *
                        60 *
                        60 *
                        1000
                    );
            }
        }

        await report.save();
        console.log("Updated report:", report);

        return Response.sendResponse(res, {
            message: 'Action taken successfully',
            report
        });

    } catch (error) {
        console.error('Error taking action on report:', error);
        return Response.sendError(res, 500, 'Server error');
    }
};




exports.showReport = async (req, res) => {
    try {
        const report = await Report.findOne({ _id: req.report._id })
            .populate({
                path: 'reporter',
                select: 'email firstName lastName mainAvatar _id',
            });

        if (!report) {
            return Response.sendError(res, 404, 'Report not found');
        }

        // Fetch the full entity details based on the model
        let entityDetails = null;
        try {
            const modelName = report.entityModel === 'Photo' ? 'User' : report.entityModel;
            const model = mongoose.model(modelName);
            entityDetails = await model.findById(report.entity).lean();
        } catch (e) {
            console.error("Error fetching entity details for report:", e);
        }

        // Determine the reference name
        let referenceName = 'Unknown';
        if (entityDetails) {
            referenceName = entityDetails.name || entityDetails.email || entityDetails.title || entityDetails.text || entityDetails.label || 'Unknown';
            if (report.entityModel === 'Photo') {
                referenceName = `Photo of ${referenceName}`;
            }
        }

        const referenceId = report.entity;
        const referenceType = report.entityModel || 'Unknown';

        // Prepare the final report object
        const finalReport = {
            _id: report._id,
            message: report.message,
            reference: `${referenceType}: ${referenceName}`,
            referenceName: referenceName,
            referenceId: referenceId,
            referenceType: referenceType,
            entityId: referenceId,
            entityModel: referenceType,
            entity: entityDetails, // Include full entity details for media display
            user: report.isAnonymous ? { email: 'Anonymous', firstName: 'Anonymous', lastName: '', _id: null } : report.reporter, // For dashboard compatibility
            userId: report.isAnonymous ? 'Anonymous' : (report.reporter?._id || null),
            userEmail: report.isAnonymous ? 'Anonymous' : (report.reporter?.email || 'Unknown'),
            status: report.status,
            reportType: report.reportType,
            severity: report.severity,
            reporterIp: report.reporterIp,
            reporterUserAgent: report.reporterUserAgent,
            consentGiven: report.consentGiven,
            isAnonymous: report.isAnonymous,
            retentionDate: report.retentionDate,
            resolutionAction: report.resolutionAction,
            photoUrl: report.photoUrl,
            createdAt: report.createdAt,
            updatedAt: report.updatedAt
        };

        return Response.sendResponse(res, finalReport);
    } catch (error) {
        console.error('Error in showReport:', error);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.reportUser = async (req, res) => {
    try {
        const { reportedUserId, reason, details, reportType, severity, consentGiven, isAnonymous } = req.body;
        const reporterUserId = req.auth && req.auth._id;
        if (!reporterUserId) return Response.sendError(res, 401, 'Unauthorized');
        // Create minimal report record via eventLogger (privacy-first)
        await createReport({ 
            reporter: reporterUserId, 
            targetType: 'User', 
            targetId: reportedUserId, 
            reasonCode: reason || 'unspecified', 
            reasonText: details || null,
            reportType: reportType || 'Other',
            severity: severity || 'medium',
            consentGiven,
            isAnonymous
        });
        return Response.sendResponse(res, { message: 'User reported successfully' });
    } catch (error) {
        return Response.sendError(res, 500, 'Internal server error');
    }
};

// New functionality to report content
exports.reportContent = async (req, res) => {
    try {
        const { contentId, contentType, reason, details, reportType, severity, consentGiven, isAnonymous, photoUrl } = req.body;
        const reporterUserId = req.auth && req.auth._id;
        if (!reporterUserId) return Response.sendError(res, 401, 'Unauthorized');
        await createReport({ 
            reporter: reporterUserId, 
            targetType: contentType || 'Content', 
            targetId: contentId, 
            photoUrl: photoUrl || null,
            reasonCode: reason || 'unspecified', 
            reasonText: details || null,
            reportType: reportType || 'Other',
            severity: severity || 'medium',
            consentGiven,
            isAnonymous
        });
        return Response.sendResponse(res, { message: 'Content reported successfully' });
    } catch (error) {
        return Response.sendError(res, 500, 'Internal server error');
    }
};

// New functionality to block a user
exports.blockUser = async (req, res) => {
    try {
        const { blockedUserId } = req.body;
        const requesterId = req.user.id;

        // Assuming User model has a method to block users
        await User.blockUser(requesterId, blockedUserId);

        return Response.sendResponse(res, { message: 'User blocked successfully' });
    } catch (error) {
        return Response.sendError(res, 500, 'Internal server error');
    }
};

exports.reviewReports = async (req, res) => {
    try {
        const unresolvedReports = await Report.find({ solved: false })
            .populate('user', 'username') // Assuming you want to show user info
            .populate('entity', 'name') // Populate based on entity type if possible
            .sort({ createdAt: -1 }); // Most recent first

        return Response.sendResponse(res, unresolvedReports);
    } catch (error) {
        return Response.sendError(res, 500, 'Internal server error');
    }
};





