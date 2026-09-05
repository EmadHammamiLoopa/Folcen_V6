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
const tokenBlacklist = require('../utils/tokenBlacklist');
const {
    isAdminRole,
    wouldRemoveLastActiveSuperAdmin
} = require('../utils/adminLifecycle');

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
    console.log(
        'Processing action:',
        req.body.action,
        'for report ID:',
        req.params.reportId
    );

    const { reportId } = req.params;
    const {
        action,
        notes,
        banDuration
    } = req.body || {};

    const actor =
        req.authUser || req.auth;

    try {
        const report =
            await Report.findById(reportId);

        if (!report) {
            return Response.sendError(
                res,
                404,
                'Report not found'
            );
        }

        // Account erasure is a legal/data-subject workflow, not a
        // moderation shortcut. It must go through GDPR Centre so the
        // Article 17 exception assessment, purge ordering and retained
        // evidence minimization are applied.
        if (action === 'deleteUser') {
            return Response.sendError(
                res,
                409,
                'Account erasure cannot be performed from report moderation. Use the GDPR Erasure Centre.'
            );
        }

        switch (action) {
            case 'ignore':
            case 'dismiss':
                report.status = 'dismissed';
                report.resolutionAction = 'No Action';
                report.moderatorNotes =
                    notes || 'No additional notes';
                break;

            case 'resolve':
                report.status = 'resolved';
                report.resolutionAction = 'Resolved';
                report.moderatorNotes =
                    notes || 'Resolved by moderator';
                break;

            case 'removeContent': {
                if (
                    report.entity &&
                    report.entityModel
                ) {
                    try {
                        if (report.entityModel === 'Photo') {
                            // Photo removal requires a specific media lifecycle
                            // operation; do not claim deletion when we only
                            // have an owner reference.
                            return Response.sendError(
                                res,
                                409,
                                'Photo removal requires the dedicated user/media moderation action'
                            );
                        }

                        const model =
                            mongoose.model(
                                report.entityModel
                            );

                        const contentExists =
                            await model.findById(
                                report.entity
                            );

                        if (!contentExists) {
                            report.status = 'resolved';
                            report.resolutionAction =
                                'Content Already Removed';
                            report.moderatorNotes =
                                notes ||
                                'Content was already absent';
                            break;
                        }

                        const deleted =
                            await model.findByIdAndDelete(
                                report.entity
                            );

                        if (!deleted) {
                            return Response.sendError(
                                res,
                                400,
                                'Failed to delete content'
                            );
                        }
                    } catch (error) {
                        console.error(
                            'Error deleting content:',
                            error
                        );

                        return Response.sendError(
                            res,
                            500,
                            'Server error deleting content'
                        );
                    }
                }

                report.status = 'resolved';
                report.resolutionAction =
                    'Content Removed';
                report.moderatorNotes =
                    notes ||
                    'Content removed by moderator';
                break;
            }

            case 'banUser':
            case 'ban_1h':
            case 'ban_24h':
            case 'ban_7d':
            case 'ban_permanent': {
                let banUntil = null;
                let ttlSeconds = null;
                const now = new Date();

                if (action === 'ban_1h') {
                    ttlSeconds = 60 * 60;
                } else if (action === 'ban_24h') {
                    ttlSeconds = 24 * 60 * 60;
                } else if (action === 'ban_7d') {
                    ttlSeconds = 7 * 24 * 60 * 60;
                } else if (
                    action === 'banUser' &&
                    banDuration !== undefined &&
                    banDuration !== null &&
                    String(banDuration).trim() !== ''
                ) {
                    const days =
                        Number(banDuration);

                    if (
                        !Number.isFinite(days) ||
                        days <= 0
                    ) {
                        return Response.sendError(
                            res,
                            400,
                            'Ban duration must be a positive number of days'
                        );
                    }

                    ttlSeconds =
                        Math.max(
                            1,
                            Math.ceil(
                                days *
                                24 *
                                60 *
                                60
                            )
                        );
                }

                if (ttlSeconds !== null) {
                    banUntil =
                        new Date(
                            now.getTime() +
                            ttlSeconds * 1000
                        );
                }

                let targetUserId = null;

                if (
                    report.entityModel === 'User' ||
                    report.entityModel === 'Photo'
                ) {
                    targetUserId =
                        report.entity;
                } else {
                    try {
                        const model =
                            mongoose.model(
                                report.entityModel
                            );

                        const entity =
                            await model.findById(
                                report.entity
                            );

                        if (entity) {
                            targetUserId =
                                entity.user ||
                                entity.author ||
                                entity.owner ||
                                entity.creator ||
                                entity.userId;
                        }
                    } catch (e) {
                        console.error(
                            'Error finding author for ban:',
                            e
                        );
                    }
                }

                if (!targetUserId) {
                    return Response.sendError(
                        res,
                        400,
                        'Could not identify user to ban'
                    );
                }

                const targetUser =
                    await User.findById(
                        targetUserId
                    );

                if (!targetUser) {
                    return Response.sendError(
                        res,
                        404,
                        'Target user not found'
                    );
                }

                if (
                    isAdminRole(targetUser.role) &&
                    (!actor || actor.role !== 'SUPER ADMIN')
                ) {
                    return Response.sendError(
                        res,
                        403,
                        'Only SUPER ADMIN can ban another administrator'
                    );
                }

                if (
                    targetUser.role === 'SUPER ADMIN' &&
                    await wouldRemoveLastActiveSuperAdmin(
                        targetUser,
                        {
                            banned: true,
                            banUntil
                        }
                    )
                ) {
                    return Response.sendError(
                        res,
                        409,
                        'Cannot ban the final active SUPER ADMIN'
                    );
                }

                targetUser.banned = true;
                targetUser.banUntil = banUntil;
                targetUser.bannedReason =
                    notes ||
                    'Banned via report moderation';

                await targetUser.save();

                try {
                    await tokenBlacklist.revokeUser(
                        String(targetUser._id),
                        ttlSeconds
                    );
                } catch (e) {
                    console.warn(
                        'Failed to revoke report-banned user',
                        e
                    );
                }

                try {
                    const { recordAudit } =
                        require('../utils/audit');

                    await recordAudit({
                        actorId:
                            actor && actor._id,
                        actorRole:
                            actor && actor.role,
                        action:
                            'ADMIN_ACCOUNT_BAN_CHANGE',
                        targetUserId:
                            targetUser._id,
                        details: {
                            source: 'REPORT_MODERATION',
                            reportId:
                                report._id,
                            banUntil,
                            moderationAction:
                                action,
                            reason:
                                notes ||
                                'Banned via report moderation'
                        },
                        ip:
                            req.ip,
                        userAgent:
                            req.get('User-Agent')
                    });
                } catch (e) {
                    console.warn(
                        'Failed to audit report moderation ban',
                        e
                    );
                }

                report.status = 'resolved';
                report.resolutionAction =
                    'User Banned';
                report.moderatorNotes =
                    notes ||
                    (
                        banUntil
                            ? `User banned until ${banUntil.toISOString()}`
                            : 'User banned permanently'
                    );
                break;
            }

            default:
                return Response.sendError(
                    res,
                    400,
                    'Invalid action'
                );
        }

        /*
         * GDPR storage-limitation lifecycle:
         * retention starts when the moderation case closes.
         */
        if (
            report.status === 'resolved' ||
            report.status === 'dismissed'
        ) {
            if (!report.resolvedAt) {
                report.resolvedAt =
                    new Date();
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

        report.markModified('status');
        report.markModified('resolutionAction');
        report.markModified('moderatorNotes');
        await report.save();

        return Response.sendResponse(
            res,
            {
                message:
                    'Action taken successfully',
                report
            }
        );

    } catch (error) {
        console.error(
            'Error taking action on report:',
            error
        );

        return Response.sendError(
            res,
            500,
            'Server error'
        );
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





