const User = require("../models/User")
const mongoose = require('mongoose')

const Response = require("./Response")
const fs = require('fs')
const fsp = fs.promises;
const path = require('path')
const _ = require('lodash')
const Request = require("../models/Request")
const { manAvatarPath, womenAvatarPath, normalizeId, normalizeLeanDoc, setOnlineUsers, extractDashParams, report, sendNotification, emitFriendRequestsUpdated, emitToUsers, validatePassword, realtime } = require("../helpers")
const Report = require("../models/Report")
const Channel = require("../models/Channel")
const Product = require("../models/Product")
const Job = require("../models/Job")
const Service = require("../models/Service")
const Post = require("../models/Post")
const Follow = require("../models/Follow")
const Comment = require("../models/Comment")
const Subscription = require("../models/Subscription")
const Announcement = require("../models/Announcement")
const multer = require('multer');
const upload = multer().array('avatar', 10); // Adjust the field name and limit as necessary
const defaultMaleAvatarUrl = '/public/images/avatars/male.webp';
const defaultFemaleAvatarUrl = '/public/images/avatars/female.webp';
const defaultOtherAvatarUrl = '/public/images/avatars/other.webp';
const { isUserOnline, connectedUsers } = require("../utils/socketManager");
const tokenBlacklist = require('../utils/tokenBlacklist');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

exports.resetBudget = async (req, res) => {
    try {
        const userId = req.authUser._id;
        const updatedUser = await User.findByIdAndUpdate(userId, { missedCallBudget: 0 }, { new: true });
        
        // Emit budget update to the user
        const { emitToUser } = require("../helpers");
        emitToUser(userId, 'budget-update', { missedCallBudget: 0 });

        return Response.sendResponse(res, { missedCallBudget: 0 }, 'Budget reset successfully');
    } catch (error) {
        logger.error('Error resetting budget:', error);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.reportUser = async (req, res) => {
    try {
        const userId = normalizeId(req.params.userId); // Get the user ID from the request parameters

        logger.info('Request body:', req.body); // Debugging log

        // Find the user being reported
        const reportedUser = await User.findById(userId);
        if (!reportedUser) {
            return Response.sendError(res, 404, 'User not found');
        }

        // Call the `report` function
        const entityType = req.body.entityType || 'User';
        const reportInstance = await report(req, res, entityType, reportedUser._id);
        if (!reportInstance || res.headersSent) return; // report helper handles error response if it fails

        // Update the reported user with the new report
        await User.updateOne({ _id: reportedUser._id }, { $push: { reports: reportInstance._id } });

        return Response.sendResponse(res, null, 'Thank you for reporting');
    } catch (error) {
        console.error('Error reporting user:', error);
        if (!res.headersSent) {
            return Response.sendError(res, 500, 'Server error, please try again later');
        }
    }
};


exports.removeAvatar = async (req, res) => {
    try {
        const actor = req.authUser;
        const isAdmin = actor && (actor.role === 'ADMIN' || actor.role === 'SUPER ADMIN');
        const targetId = req.params.userId || req.params.id;

        // 🔥 SECURITY: Only admins or owner can remove avatar
        if (targetId && String(targetId) !== String(actor._id)) {
            if (!isAdmin) return Response.sendError(res, 403, 'Unauthorized');
        }

        const user = await User.findById(targetId || actor._id);
        if (!user) return res.status(404).send('User not found');

        let avatarUrl = req.params.avatarUrl;

        // Extract the relative path from the full URL or handle relative paths
        let filename;
        try {
            // If it's a full URL, parse it
            if (avatarUrl.startsWith('http')) {
                const url = new URL(avatarUrl);
                filename = path.basename(url.pathname);
            } else {
                // If it's a relative path like /uploads/..., just get the basename
                filename = path.basename(avatarUrl);
            }
        } catch (e) {
            filename = path.basename(avatarUrl);
        }

        const avatarPath = path.join(__dirname, '..', '..', 'public', 'uploads', filename); // Adjusted to include 'uploads' directory

        logger.info(`Requested path to delete: ${avatarPath}`);

        // Check if the avatar is a default avatar
        const isDefaultAvatar = [
            path.basename(defaultMaleAvatarUrl),
            path.basename(defaultFemaleAvatarUrl),
            path.basename(defaultOtherAvatarUrl)
        ].includes(avatarUrl);

        if (isDefaultAvatar) {
            return res.status(400).send({ message: 'Cannot remove the default avatar' });
        }

        try {
            // Ensure file exists (throws if not)
            await fsp.access(avatarPath);
        } catch (e) {
            logger.info(`File not found or inaccessible: ${avatarPath}`);
            return res.status(404).send('Avatar file not found');
        }

        try {
            logger.info(`File found: ${avatarPath}`);
            await fsp.unlink(avatarPath);
        } catch (e) {
            logger.info(`Failed to unlink avatar: ${avatarPath}`, e);
            // continue to attempt cleanup of user record
        }

        // Remove avatar URL from user's avatar array
        user.avatar = user.avatar.filter(url => path.basename(url) !== avatarUrl);

        // Ensure the mainAvatar is updated if necessary
        if (path.basename(user.mainAvatar || '') === avatarUrl) {
            user.mainAvatar = user.avatar.length > 0 ? user.avatar[0] : null;
        }

        // Log cleaned avatars for consistency (async checks)
        const cleanedAvatars = [];
        for (const url of user.avatar) {
            const candidatePath = path.join(__dirname, '..', '..', 'public', 'uploads', path.basename(url));
            try {
                await fsp.access(candidatePath);
                cleanedAvatars.push(url);
            } catch (err) {
                logger.info(`File not found: ${candidatePath}`);
            }
        }

        user.avatar = cleanedAvatars;

        // Update mainAvatar if necessary
        if (user.mainAvatar === avatarUrl) {
            user.mainAvatar = user.avatar.length > 0 ? user.avatar[0] : null;
        }

        // Update mainAvatar if it no longer exists in the cleaned avatars
        if (user.mainAvatar && !cleanedAvatars.includes(user.mainAvatar)) {
            user.mainAvatar = cleanedAvatars.length > 0 ? cleanedAvatars[0] : null;
        }

        // If there are no user avatars left, clear mainAvatar so the frontend
        // falls back to the user's customized avatar (avatarStyle/avatarSeed/
        // avatarOverrides) rather than generating a brand-new default.
        if (cleanedAvatars.length === 0) {
            user.mainAvatar = null;
        }

        await user.save();

        // 🔥 REAL-TIME: Emit targeted profile update
        realtime.emitProfileUpdate(user);

        // Return the updated user object to update the UI (public view only)
        return res.status(200).send({ message: 'Avatar removed successfully', user: user.publicInfo() });
    } catch (err) {
        logger.error('Error removing avatar:', err);
        return res.status(500).send('Server error');
    }
};
exports.clearUserReports = async (req, res) => {
    try {
        await Report.deleteMany({
            "entity._id": req.user._id,
            "entity.name": "user"
        }).exec();
        return Response.sendResponse(res, null, "reports cleaned");
    } catch (err) {
        return Response.sendError(res, 400, 'failed to clear reports');
    }
};

// Export helpers for unit tests and external usage
exports.parseAgeRange = parseAgeRange;
exports.buildBaseFilter = buildBaseFilter;


exports.banUser = async (req, res) => {
    try {
        const user = req.user;
        const { message, duration } = req.body;
        
        // Update user properties
        user.banned = true;
        user.bannedReason = message;

        if (duration && !isNaN(duration)) {
            const banUntil = new Date();
            banUntil.setDate(banUntil.getDate() + parseInt(duration));
            user.banUntil = banUntil;
        } else {
            user.banUntil = null; // Permanent if no duration
        }

        // Save user to the database
        await user.save();

        // Create log entry
        const logMessage = `User ID: ${user._id}\nBanned Reason: ${message}\nBan Until: ${user.banUntil ? user.banUntil.toISOString() : 'Permanent'}\nDate: ${new Date().toISOString()}\n\n`;

        // Define the log path for Blockingusers.txt
        const logPath = path.join(process.cwd(), 'Blockingusers.txt');
        
        // Write log to the Blockingusers.txt file
        fs.appendFile(logPath, logMessage, (err) => {
            if (err) {
                logger.error('Failed to write to log file', err);
            }
        });

    return Response.sendResponse(res, user.publicInfo(), 'User has been banned');
    } catch (error) {
        logger.info(error);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.unbanUser = async (req, res) => {
    try {
        const user = req.user;

        // Update user's banned status
        user.banned = false;
        user.bannedReason = '';

        // Save the updated user object using async/await
        await user.save();

    return Response.sendResponse(res, user.publicInfo(), 'User unbanned successfully');
    } catch (err) {
        logger.error(err);
        return Response.sendError(res, 500, 'Server error, unable to unban the user');
    }
};

exports.verifyUser = async (req, res) => {
    try {
        const user = req.user;
        user.verified = req.body.verified !== undefined ? req.body.verified : true;
        await user.save();
        return Response.sendResponse(res, user.publicInfo(), `User verification status updated to ${user.verified}`);
    } catch (err) {
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.changeRole = async (req, res) => {
    try {
        const user = req.user;
        let { role } = req.body;
        
        // Map numeric roles to strings if necessary
        const roleMap = {
            0: 'USER',
            1: 'ADMIN',
            2: 'SUPER ADMIN'
        };
        
        if (roleMap[role] !== undefined) {
            role = roleMap[role];
        }

        if (!['USER', 'ADMIN', 'SUPER ADMIN'].includes(role)) {
            return Response.sendError(res, 400, 'Invalid role');
        }
        
        user.role = role;
        await user.save();
        return Response.sendResponse(res, user.publicInfo(), `User role updated to ${role}`);
    } catch (err) {
        logger.error('Error changing role:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.allUsers = async (req, res) => {
    try {
        const dashParams = extractDashParams(req, ['_id', 'firstName', 'lastName', 'email', 'role']);
        
        // Build aggregation pipeline
        const pipeline = [];
        
        // Always filter out deleted users and apply other filters,
        // unless the admin explicitly requests them via ?includeDeleted=1.
        const filter = { ...dashParams.filter };
        const includeDeleted = String(req.query.includeDeleted || '').toLowerCase();
        const wantDeleted = includeDeleted === '1' || includeDeleted === 'true' || includeDeleted === 'only';
        if (!wantDeleted && filter.deletedAt === undefined) {
            filter.deletedAt = null;
        }
        if (includeDeleted === 'only') {
            filter.isDeleted = true;
        }
        pipeline.push({ $match: filter });

        // Add reports size and ensure createdAt exists (fallback to ObjectId timestamp)
        pipeline.push({
            $addFields: {
                reportsCount: { 
                    $cond: {
                        if: { $isArray: "$reports" },
                        then: { $size: "$reports" },
                        else: 0
                    }
                },
                createdAt: { $ifNull: ["$createdAt", { $toDate: "$_id" }] }
            }
        });

        // Handle minReports filter
        const minReports = parseInt(req.query.minReports);
        if (!isNaN(minReports)) {
            pipeline.push({
                $match: { reportsCount: { $gte: minReports } }
            });
        }

        // Projection
        pipeline.push({
            $project: {
                _id: 1,
                firstName: 1,
                lastName: 1,
                email: 1,
                role: 1,
                avatar: 1,
                mainAvatar: 1,
                avatarStyle: 1,
                avatarSeed: 1,
                avatarVariant: 1,
                avatarOverrides: 1,
                enabled: 1,
                reports: "$reportsCount",
                subscription: 1,
                createdAt: 1,
                lastSeen: 1,
                updatedAt: 1
            }
        });

        // Sort, Skip, Limit
        pipeline.push({ $sort: dashParams.sort });
        pipeline.push({ $skip: dashParams.skip });
        pipeline.push({ $limit: dashParams.limit });

        // Execute aggregation
        const users = await User.aggregate(pipeline).exec();

        // Populate subscription for each user
        const populatedUsers = await User.populate(users, {
            path: 'subscription._id',
            model: 'Subscription',
            select: 'dayPrice weekPrice monthPrice yearPrice currency offers',
        });

        // Count total documents for pagination (considering filters)
        const countPipeline = [];
        countPipeline.push({ $match: filter });
        
        countPipeline.push({
            $addFields: {
                reportsCount: { 
                    $cond: {
                        if: { $isArray: "$reports" },
                        then: { $size: "$reports" },
                        else: 0
                    }
                }
            }
        });
        if (!isNaN(minReports)) {
            countPipeline.push({
                $match: { reportsCount: { $gte: minReports } }
            });
        }
        countPipeline.push({ $count: "total" });
        
        const countResult = await User.aggregate(countPipeline).exec();
        const count = countResult.length > 0 ? countResult[0].total : 0;

        // Send response
        return Response.sendResponse(res, {
            docs: populatedUsers,
            totalPages: Math.ceil(count / dashParams.limit),
            totalDocs: count
        });
        
    } catch (err) {
        logger.info(err);
        return Response.sendError(res, 500, 'Server error, please try again later');
    }
};

exports.getMyAnnouncements = async (req, res) => {
    try {
        const userId = req.auth ? req.auth._id : (req.user ? req.user._id : null);
        const user = req.authUser; // Populated by withAuthUser middleware
        
        if (!userId || !user) return Response.sendError(res, 401, 'Unauthorized');

        let announcements = [];
        try {
            const now = new Date();
            // Filter: active, not seen by user, not expired, AND created on/after user joined
            const userIdStr = String(userId);
            announcements = await Announcement.find({ 
                isActive: true, 
                seenBy: { $nin: [userIdStr] },
                createdAt: { $gte: user.createdAt },
                $or: [
                    { expiresAt: { $exists: false } },
                    { expiresAt: { $gt: now } },
                    { expiresAt: null }
                ]
            }).sort({ createdAt: -1 }).lean();
            
            // Normalize ObjectIds to strings
            announcements = normalizeLeanDoc(announcements);
            
            // Dedupe by _id in case of accidental duplicates
            const map = new Map();
            announcements.forEach(a => { if (a && a._id) map.set(String(a._id), a); });
            announcements = Array.from(map.values()).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
        } catch (qErr) {
            logger.error('Announcement.find failed:', qErr);
            // Return empty result instead of failing the client with 400/500
            return Response.sendResponse(res, []);
        }

        return Response.sendResponse(res, announcements);
    } catch (err) {
        logger.error('getMyAnnouncements error:', err);
        return Response.sendError(res, 500, 'Failed to load announcements');
    }
};

exports.markAnnouncementSeen = async (req, res) => {
    try {
        const userId = req.auth ? req.auth._id : (req.user ? req.user._id : null);
        if (!userId) return Response.sendError(res, 401, 'Unauthorized');

        await Announcement.updateOne(
            { _id: req.params.id, seenBy: { $nin: [String(userId)] } }, // idempotent: no-op if already seen
            { $addToSet: { seenBy: String(userId) } }
        );
        return Response.sendResponse(res, null, 'Marked as seen');
    } catch (err) {
        logger.error('markAnnouncementSeen error:', err);
        return Response.sendError(res, 500, 'Failed to mark announcement as seen');
    }
};




exports.storeUser = async (req, res) => {
    try {
        const fields = req.fields || req.body;

        // Strip empty-string fields and fields that don't belong on a new User document
        const STRIP_KEYS = ['id', 'createdAt', 'lastSeen', 'avatar', 'password_confirmation'];
        const cleanFields = Object.fromEntries(
            Object.entries(fields).filter(([k, v]) => !STRIP_KEYS.includes(k) && v !== '' && v != null)
        );

        // Normalize email to lowercase to match signin behavior
        if (cleanFields.email && typeof cleanFields.email === 'string') {
            cleanFields.email = cleanFields.email.trim().toLowerCase();
        }

        let user = await User.findOne({ email: cleanFields.email });
        if (user) return Response.sendError(res, 400, 'email already used in another account');

        user = new User(cleanFields);

        const files = req.files || {};
        if (files.avatar) {
            await this.storeAvatar(files.avatar, user);
        } else {
            const avatarPath = user.getDefaultAvatar();
            user.mainAvatar = avatarPath;
            user.avatar = [avatarPath];
        }

        await user.save();
        await addGlobalChannels(user);
        await addFreeSubscription(user);

        return Response.sendResponse(res, user.publicInfo(), 'User created successfully');
    } catch (err) {
        logger.error('Error in storeUser:', err);
        return Response.sendError(res, 500, 'Internal server error');
    }
};

addFreeSubscription = async(user) => {
    //assign one month subscription free
    subscription = await Subscription.findOne({})
    const expireDate = new Date()
    expireDate.setMonth(expireDate.getMonth() + 1)

    user.subscription = {
        _id: subscription._id,
        expireDate
    }
}

addLocalChannels = async (user) => {
    try{
        let channel = await Channel.findOne({name: user.city})
        if(!channel){
            const admin = await User.findOne({role: 'SUPER ADMIN'})
            channel = new Channel({
                name: user.city,
                description: 'local channel',
                city: user.city,
                country: user.country,
                user: admin._id,
                followers: [],
                approved: true
            })
        }
        user.followedChannels.push(channel._id)
        channel.followers.push(user._id)
        await channel.save()
    } catch(err){
        logger.info(err);
    }
}

addGlobalChannels = async(user) => {
    try { 
        const channels = await Channel.find({global: true})
        channels.forEach((channel) => {
            user.followedChannels.push(channel._id)
        })
        await Channel.updateMany({global: true}, {$push: {followers: user._id}})
    } catch(err){
        logger.info(err);
    }
}

exports.updateUserDash = async (req, res) => {
    try {
        let user = req.user;
        const fields = _.omit(req.fields, ['password', 'avatar']);

        // Sanitize fields: remove any string "undefined" or "null" values
        Object.keys(fields).forEach(key => {
            if (fields[key] === 'undefined' || fields[key] === 'null') {
                delete fields[key];
            }
        });

        // Convert interests from comma-separated string to an array
        if (fields.interests) {
            fields.interests = Array.isArray(fields.interests) ? fields.interests : fields.interests.split(',');
        }

        // Convert languages from comma-separated string to an array
        if (fields.languages) {
            fields.languages = Array.isArray(fields.languages) ? fields.languages : fields.languages.split(',');
        }

        // Update the user object
        Object.assign(user, fields);

        // If password is provided, update it
        if (req.fields.password && req.fields.password !== 'undefined') {
            if (!validatePassword(req.fields.password)) {
                return Response.sendError(res, 400, 'Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character.');
            }
            user.password = req.fields.password;
        }

        // If avatar is provided, store it
        if (req.files && req.files.avatar) {
            await this.storeAvatar(req.files.avatar, user);
        }

        // ✅ Save using `await` (without a callback)
        await user.save();

        // 🔥 SECURITY: If password was changed, revoke tokens
        if (req.fields.password && req.fields.password !== 'undefined') {
            try {
                const tokenBlacklist = require('../utils/tokenBlacklist');
                await tokenBlacklist.revokeUser(String(user._id));
            } catch (e) { logger.warn('Failed to revoke tokens on Dash password change', e); }
        }

        // Emit socket event for real-time updates
        realtime.emitProfileUpdate(user);

        // Remove sensitive data before sending response
        const updatedUser = user.publicInfo();
        return Response.sendResponse(res, updatedUser, 'The user has been updated successfully');
    } catch (err) {
        logger.error('Error updating user dashboard:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.uploadChatMedia = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        // File uploaded successfully
        const chatFileUrl = `${req.protocol}://${req.get('host')}${req.savedChatPath}`;

        return res.status(200).json({
            success: true,
            message: 'File uploaded successfully',
            fileUrl: chatFileUrl
        });
    } catch (err) {
        logger.error('Error uploading chat media:', err);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.showUserDash = async (req, res) => {
    try {
        const userId = normalizeId(req.params.userId);
        logger.info(`[showUserDash] userId: ${userId}, original: ${req.params.userId}`);
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            logger.error(`[showUserDash] Invalid User ID: ${userId}`);
            return Response.sendError(res, 400, 'Invalid User ID');
        }

        const user = await User.findById(userId);
        if (!user) {
            return Response.sendError(res, 404, 'User not found');
        }

        // Fetch related data counts and recent items
        const [posts, comments, reports, products, jobs, services, channels] = await Promise.all([
            Post.find({ user: userId }).sort({ createdAt: -1 }).limit(10).populate('channel'),
            Comment.find({ user: userId }).sort({ createdAt: -1 }).limit(10).populate('post'),
            Report.find({ entity: userId, entityModel: 'User' }).sort({ createdAt: -1 }).limit(10).populate('reporter'),
            Product.find({ user: userId }).sort({ createdAt: -1 }).limit(10),
            Job.find({ user: userId }).sort({ createdAt: -1 }).limit(10),
            Service.find({ user: userId }).sort({ createdAt: -1 }).limit(10),
            Channel.find({ user: userId }).sort({ createdAt: -1 }).limit(10)
        ]);

        // Mask anonymous reports
        const processedReports = reports.map(r => {
            const reportObj = normalizeLeanDoc(r.toObject());
            if (reportObj.isAnonymous) {
                reportObj.reporter = { firstName: 'Anonymous', lastName: '', email: 'Anonymous', _id: null };
            }
            return reportObj;
        });

        const counts = {
            posts: await Post.countDocuments({ user: userId }),
            comments: await Comment.countDocuments({ user: userId }),
            reports: await Report.countDocuments({ entity: userId, entityModel: 'User' }),
            products: await Product.countDocuments({ user: userId }),
            jobs: await Job.countDocuments({ user: userId }),
            services: await Service.countDocuments({ user: userId }),
            channels: await Channel.countDocuments({ user: userId }),
            friends: user.friends ? user.friends.length : 0,
            followers: user.followers ? user.followers.length : 0,
            following: user.following ? user.following.length : 0,
            blocked: user.blockedUsers ? user.blockedUsers.length : 0,
            followedChannels: user.followedChannels ? user.followedChannels.length : 0,
            messages: user.messages ? user.messages.length : 0,
            requests: await Request.countDocuments({ $or: [{ sender: userId }, { receiver: userId }] }),
            blockedBy: await User.countDocuments({ blockedUsers: userId }),
            reportsMade: await Report.countDocuments({ reporter: userId })
        };

        return Response.sendResponse(res, {
            user: user.publicInfo(true),
            counts,
            posts,
            comments,
            reports: processedReports,
            products,
            jobs,
            services,
            channels
        });
    } catch (error) {
        logger.error('Error in showUserDash:', error);
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.showUserEditDash = async (req, res) => {
    try {
        const userId = normalizeId(req.params.userId);
        let user = await User.findById(userId).lean();
        if (!user) return Response.sendError(res, 404, 'User not found');
        
        // Normalize ObjectIds to strings
        user = normalizeLeanDoc(user);
        
        // Wrap in a user object to match FormComponent's expectation for 'users' plurarName
        return Response.sendResponse(res, { user: user });
    } catch (error) {
        logger.error('Error in showUserEditDash:', error);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.showUser = (req, res) => {
    try {
        return Response.sendResponse(res, req.user.publicInfo())
    } catch (error) {
        logger.info(error);
    }
}

exports.updateUser = async (req, res) => {
    try {
        const actor = req.authUser;
        const isAdmin = actor && (actor.role === 'ADMIN' || actor.role === 'SUPER ADMIN');
        
        // Determine which user to update: param userId (admin) or authenticated user
        let targetId = actor ? actor._id : null;
        const requestedId = req.params.userId || req.body._id || req.body.id;

        // 🔥 SECURITY: Only admins can update other users
        if (requestedId && String(requestedId) !== String(targetId)) {
            if (!isAdmin) return Response.sendError(res, 403, 'Unauthorized to update this profile');
            targetId = requestedId;
        }

        if (!targetId) return Response.sendError(res, 400, 'No user id specified');

        let user = await User.findById(targetId);
        if (!user) return Response.sendError(res, 404, 'User not found');

        // Guarded debug logging: activate when env PROFILE_DEBUG_ID matches targetId or ?debug=1
        const debugActive = (process.env.PROFILE_DEBUG_ID && String(process.env.PROFILE_DEBUG_ID) === String(targetId)) || (req.query && (req.query.debug === '1' || req.query.debug === 'true'));
        if (debugActive) {
            try {
                const incoming = Object.keys(req.body || {}).map(k => ({ key: k, type: Array.isArray(req.body[k]) ? 'array' : typeof req.body[k], empty: req.body[k] === '' || req.body[k] === null || req.body[k] === undefined }));
                logger.info('PROFILE_DEBUG: incoming payload keys/types for', String(targetId), incoming);
                // append to debug file
                try {
                    const dbg = { at: new Date().toISOString(), userId: String(targetId), incoming };
                    const logPath = path.join(process.cwd(), `profile-debug-${String(targetId)}.log`);
                    fs.appendFileSync(logPath, JSON.stringify(dbg) + '\n');
                } catch (e) { logger.warn('PROFILE_DEBUG: failed to write debug file', e); }
            } catch (e) { logger.warn('PROFILE_DEBUG: failed to stringify incoming payload', e); }
        }

        // Normalize some frontend field names and formats
        if (req.body.birthDate && !req.body.birthdate) {
            req.body.birthdate = req.body.birthDate;
        }

        // Normalize and validate interests. Accept:
        // - Array of strings (keep as-is after validation)
        // - Comma-separated string -> split
        // - Single base64-encoded string -> decode -> split
        if (req.body.interests) {
            const normalizeInterests = (raw) => {
                if (!raw) return [];
                // If already array
                if (Array.isArray(raw)) {
                    if (raw.length === 1 && typeof raw[0] === 'string') {
                        const candidate = raw[0].trim();
                        const looksBase64Single = /^[A-Za-z0-9+/=]+$/.test(candidate) && candidate.length > 4;
                        if (looksBase64Single) {
                            try {
                                const decoded = Buffer.from(candidate, 'base64').toString('utf-8');
                                if (decoded && /[A-Za-z]/.test(decoded)) {
                                    return decoded.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
                                }
                            } catch (e) {}
                        }
                    }
                    return raw.map(r => (typeof r === 'string' ? r.trim() : '')).filter(Boolean);
                }
                // coerce to string
                let s = typeof raw === 'string' ? raw.trim() : String(raw);
                if (!s) return [];
                // looks like base64
                const looksBase64 = /^[A-Za-z0-9+/=]+$/.test(s) && s.length > 4;
                if (looksBase64) {
                    try {
                        const decoded = Buffer.from(s, 'base64').toString('utf-8');
                        if (decoded && /[A-Za-z]/.test(decoded)) {
                            // Try parse as JSON array first (some middleware encodes JSON arrays)
                            try {
                                const parsed = JSON.parse(decoded);
                                if (Array.isArray(parsed)) return parsed.map(x => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
                            } catch (e) {
                                // not JSON, continue
                            }
                            return decoded.split(/[,;|]/).map(x => x.trim()).filter(Boolean);
                        }
                    } catch (e) {
                        // fallthrough to splitting
                    }
                }
                // fallback: split by separators
                if (s.indexOf(',') !== -1 || s.indexOf('|') !== -1 || s.indexOf(';') !== -1) {
                    return s.split(/[,;|]/).map(x => x.trim()).filter(Boolean);
                }
                return [s];
            };

            try {
                const normalized = normalizeInterests(req.body.interests);

                // Validation: whitelist characters and length limits
                const itemPattern = /^[A-Za-z0-9\s\-_.]{1,50}$/; // allow letters, numbers, spaces, dash, underscore, dot
                if (normalized.length > 20) return Response.sendError(res, 400, 'Too many interests (max 20)');
                for (const it of normalized) {
                    if (!itemPattern.test(it)) return Response.sendError(res, 400, 'Invalid interest value');
                }

                req.body.interests = normalized;
            } catch (e) {
                return Response.sendError(res, 400, 'Invalid interests format');
            }
        }

        // Normalize languages input similarly to interests: accept array, comma-separated string, or base64-encoded JSON/string
        if (req.body.languages) {
            const normalizeLanguages = (raw) => {
                if (!raw) return [];
                // If already array
                if (Array.isArray(raw)) {
                    if (raw.length === 1 && typeof raw[0] === 'string') {
                        const candidate = raw[0].trim();
                        const looksBase64Single = /^[A-Za-z0-9+/=]+$/.test(candidate) && candidate.length > 4;
                        if (looksBase64Single) {
                            try {
                                const decoded = Buffer.from(candidate, 'base64').toString('utf-8');
                                if (decoded && /[A-Za-z]/.test(decoded)) {
                                    return decoded.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
                                }
                            } catch (e) {}
                        }
                    }
                    return raw.map(r => (typeof r === 'string' ? r.trim() : '')).filter(Boolean);
                }
                // coerce to string
                let s = typeof raw === 'string' ? raw.trim() : String(raw);
                if (!s) return [];

                // handle base64-encoded payloads (like interests)
                const looksBase64 = /^[A-Za-z0-9+/=]+$/.test(s) && s.length > 4;
                if (looksBase64) {
                    try {
                        const decoded = Buffer.from(s, 'base64').toString('utf-8');
                        if (decoded && /[A-Za-z]/.test(decoded)) {
                            try {
                                const parsed = JSON.parse(decoded);
                                if (Array.isArray(parsed)) return parsed.map(x => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
                            } catch (e) {
                                // not JSON, fallthrough
                            }
                            return decoded.split(/[,;|]/).map(x => x.trim()).filter(Boolean);
                        }
                    } catch (e) {
                        // fallthrough to splitting below
                    }
                }

                if (s.indexOf(',') !== -1 || s.indexOf('|') !== -1 || s.indexOf(';') !== -1) {
                    return s.split(/[,;|]/).map(x => x.trim()).filter(Boolean);
                }
                return [s];
            };

            // Debug log to help diagnose malformed client payloads (remove or gate in production)
            try {
                logger.info('Debug: raw languages payload:', req.body.languages);
                const normalizedLangs = normalizeLanguages(req.body.languages);
                // Validate language names: allow letters (including common Latin accents), digits, spaces,
                // dashes, apostrophes, periods and parentheses — avoid `\p{L}` for older Node regex engines
                const langPattern = /^[A-Za-z0-9\u00C0-\u024F\s\-\.\'()]{1,50}$/;
                if (normalizedLangs.length > 10) return Response.sendError(res, 400, 'Too many languages');
                for (const lg of normalizedLangs) {
                    if (!langPattern.test(lg)) {
                        logger.info('Invalid language rejected by pattern:', lg);
                        return Response.sendError(res, 400, 'Invalid language value');
                    }
                }
                req.body.languages = normalizedLangs;
            } catch (e) {
                logger.error('Error normalizing languages:', e);
                return Response.sendError(res, 400, 'Invalid languages format');
            }
        }

        // Whitelist allowed fields to prevent accidental/privilege updates
        const allowed = [
            'firstName','lastName','phone','city','country','gender','birthDate',
            'education','profession','interests','languages','bio','aboutMe','website','socialLinks',
            'studyCountry','isPrivate', 'settings', 'school', 'genderVisible', 'ageVisible', 'randomVisible', 'allowVideoRequestsFromNonFriends',
            'avatarStyle', 'avatarSeed', 'avatarVariant', 'avatarOverrides', 'fcmToken', 'themePreference'
        ];

        let changed = false;
        const changedFields = [];
        for (const key of allowed) {
            if (!Object.prototype.hasOwnProperty.call(req.body, key)) continue;

            let val = req.body[key];

            // Sanitize literal "undefined" string from some clients
            if (val === 'undefined') val = undefined;

            // Explicit clear: client must send `null` to clear a value
            if (val === null) {
                user[key] = null;
                if (!changedFields.includes(key)) changedFields.push(key);
                changed = true;
                continue;
            }

            // Arrays: allow empty arrays (explicit clear)
            if (Array.isArray(val)) {
                user[key] = val;
                if (!changedFields.includes(key)) changedFields.push(key);
                changed = true;
                continue;
            }

            // Strings: do NOT overwrite existing value with empty string.
            // Only set non-empty strings (after trimming) to avoid accidental blanks.
            if (typeof val === 'string') {
                const trimmed = val.trim();
                if (trimmed.length === 0) {
                    // Skip empty string — treat as "no-op". To clear, client should send null.
                    continue;
                }
                user[key] = trimmed;
                if (!changedFields.includes(key)) changedFields.push(key);
                changed = true;
                continue;
            }

            // Numbers/booleans/objects: set as provided
            if (typeof val !== 'undefined') {
                user[key] = val;
                if (!changedFields.includes(key)) changedFields.push(key);
                changed = true;
            }
        }

        if (!changed) return Response.sendError(res, 400, 'No valid profile fields to update');

        await user.save();

        // Audit log changes (redact details in audit util). Only store field names to avoid PII.
        try {
            if (changedFields.length) {
                const audit = require('../utils/audit');
                const actorId = (req.authUser && req.authUser._id) || (req.user && req.user._id) || null;
                await audit.recordAudit({
                    actorId,
                    action: 'PROFILE_UPDATED',
                    targetUserId: user._id,
                    details: { changedFields },
                    ip: req.ip,
                    userAgent: req.get && req.get('User-Agent')
                });
            }
        } catch (e) {
            logger.warn('Audit record failed (non-fatal):', e);
        }

        // If debug was active for this update, record a post-save snapshot of changed fields (types only)
        try {
            const debugActiveAfter = (process.env.PROFILE_DEBUG_ID && String(process.env.PROFILE_DEBUG_ID) === String(targetId)) || (req.query && (req.query.debug === '1' || req.query.debug === 'true'));
            if (debugActiveAfter) {
                try {
                    const saved = changedFields.map(k => ({ key: k, type: Array.isArray(user[k]) ? 'array' : typeof user[k], empty: user[k] === '' || user[k] === null || user[k] === undefined }));
                    logger.info('PROFILE_DEBUG: saved snapshot for', String(targetId), saved);
                    const dbg2 = { at: new Date().toISOString(), userId: String(targetId), saved };
                    const logPath2 = path.join(process.cwd(), `profile-debug-${String(targetId)}.log`);
                    fs.appendFileSync(logPath2, JSON.stringify(dbg2) + '\n');
                } catch (e) { logger.warn('PROFILE_DEBUG: failed to write post-save debug file', e); }
            }
        } catch (e) { /* non-fatal */ }

        // 🔥 REAL-TIME: Emit targeted profile update
        realtime.emitProfileUpdate(user);

        return Response.sendResponse(res, user.publicInfo(true), 'Profile updated successfully');
    } catch (err) {
        logger.error('Server error:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.updateEmail = async (req, res) => {
    try {
        const { email, current_password } = req.body;
        const authUser = req.authUser;

        logger.info('Attempting to update email for user:', authUser._id);
        logger.info('New email to be set:', email);

        // Verify password before allowing email change
        const isPasswordValid = await authUser.authenticate(current_password);
        if (!isPasswordValid) {
            logger.info('Password verification failed for email change');
            return Response.sendError(res, 401, 'Invalid current password');
        }

        // Find if the email is already being used
        const user = await User.findOne({ email });
        if (user) {
            logger.info('Email is already in use by another account:', email);
            return Response.sendError(res, 400, 'email already used in another account');
        }

        // Update the authenticated user's email
        authUser.email = email;

        // Save the updated user information
        const updatedUser = await authUser.save();
        if (!updatedUser) {
            logger.error('Error saving updated user');
            return Response.sendError(res, 400, 'failed');
        }

        logger.info('Email updated successfully for user:', updatedUser._id);
        return Response.sendResponse(res, updatedUser.publicInfo(), 'email changed');
    } catch (err) {
        logger.error('Unexpected error in updateEmail:', err);
        return Response.sendError(res, 500, 'Internal server error');
    }
};
exports.updatePassword = async (req, res) => {
    try {
        const { current_password, password } = req.body;
        const authUser = req.authUser;

        logger.info('Comparing current password for user:', authUser._id);
        logger.info('Provided current password:', current_password);
        logger.info('Stored hashed password in the database:', authUser.hashed_password);

        // Compare provided current password with the stored hashed password
        const isMatch = await authUser.authenticate(current_password);

        if (!isMatch) {
            logger.info('Password comparison result: Password does not match');
            return Response.sendError(res, 400, 'Current password is incorrect');
        }

        logger.info('Password comparison result: Password matches');

        // Update to the new password
        if (!validatePassword(password)) {
            return Response.sendError(res, 400, 'New password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character.');
        }
        authUser.password = password; // This will trigger the setter to hash the new password
        await authUser.save();

        // 🔥 SECURITY: Revoke all existing sessions on password change
        try {
            const tokenBlacklist = require('../utils/tokenBlacklist');
            await tokenBlacklist.revokeUser(String(authUser._id));
        } catch (e) {
            logger.error('Failed to revoke tokens on password change', e);
        }

        logger.info('Password updated successfully for user:', authUser._id);
        return Response.sendResponse(res, authUser.publicInfo(), 'Password updated successfully');
    } catch (err) {
        logger.error('Error updating password:', err);
        return Response.sendError(res, 500, 'Failed to update password');
    }
};



exports.storeAvatar = async (avatar, user) => {
    try {
        const avatarName = `${user._id}_${new Date().getTime()}.png`;
        const avatarDir = path.join(process.cwd(), 'public/uploads');
        const avatarPath = path.join(avatarDir, avatarName);

        logger.info(`Avatar directory: ${avatarDir}`);
        logger.info(`Avatar path: ${avatarPath}`);

        // Ensure the uploads directory exists
        try {
            await fsp.access(avatarDir);
        } catch (e) {
            logger.info(`Creating directory: ${avatarDir}`);
            await fsp.mkdir(avatarDir, { recursive: true });
        }

        // Write the new avatar file (async)
        logger.info(`Writing new avatar file: ${avatarPath}`);
        try {
            const data = await fsp.readFile(avatar.path);
            await fsp.writeFile(avatarPath, data);
        } catch (e) {
            logger.error('Error writing avatar file:', e);
        }

        // Remove the old avatar file if it exists and is not the default (async)
        const isOldDefault = (p) => p && (['male.webp', 'female.webp', 'other.webp'].some(d => p.includes(d)) || p.includes('dicebear.com'));
        
        if (user.mainAvatar && !user.mainAvatar.startsWith('http') && !isOldDefault(user.mainAvatar)) {
            const lastAvatarPath = path.join(__dirname, `./../../public${user.mainAvatar}`);
            try {
                await fsp.access(lastAvatarPath);
                logger.info(`Removing old avatar file: ${lastAvatarPath}`);
                await fsp.unlink(lastAvatarPath);
            } catch (e) {
                // ignore if not exists
            }
        }

        // Update the user object with the new avatar path
        const newAvatarPath = `/public/uploads/${avatarName}`;
        user.mainAvatar = newAvatarPath;
        if (!user.avatar.includes(newAvatarPath)) {
            user.avatar.push(newAvatarPath);
        }
        user.avatar.type = avatar.type;

        // Save the user object to the database
        logger.info(`Saving user data with new avatar path: ${newAvatarPath}`);
        await user.save();

        // 🔥 REAL-TIME: Emit targeted profile update
        realtime.emitProfileUpdate(user);
    } catch (error) {
        logger.info('Error storing avatar:', error);
    }
};

exports.updateMainAvatar = async (req, res) => {
    try {
      const userId = req.params.userId;
      const { avatarUrl } = req.body;
  
      if (!userId || !avatarUrl) {
        return Response.sendError(res, 400, 'Missing userId or avatarUrl.');
      }
  
      const user = await User.findById(userId)
        .populate('subscription._id', 'dayPrice weekPrice monthPrice yearPrice currency offers');
  
      if (!user) return res.status(404).send('User not found');
  
      // Convert absolute to relative
      const relativeAvatarUrl = avatarUrl.replace(`${req.protocol}://${req.get('host')}`, '');
  
      if (!user.avatar.includes(relativeAvatarUrl)) {
        return res.status(400).send('Avatar URL not found in user avatars.');
      }
  
            // ✅ Update and persist
            // NOTE: intentionally keep avatarStyle/avatarSeed/avatarOverrides intact so
            // the customized avatar can be restored if this photo is later removed.
            user.mainAvatar = relativeAvatarUrl;
            await user.save();

            // Emit socket event for real-time updates
            try {
                    const io = req.app.get('io');
                    if (io) io.emit('user-profile-updated', { userId: user._id, at: new Date() });
            } catch (e) { logger.warn('Failed to emit socket event in updateMainAvatar', e); }

            return res.status(200).send({
                message: 'Main avatar updated successfully',
                user: user.publicInfo()
            });
    } catch (err) {
      logger.error('Error updating main avatar:', err);
      return res.status(500).send('Server error');
    }
  };
  
  

  
exports.updateAvatar = async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).send('User not found');

        if (req.file) {
            await module.exports.storeAvatar(req.file, user);

            return res.status(200).send({
                message: 'Avatar updated successfully',
                avatarUrl: user.mainAvatar,
                user: user.publicInfo()
            });
        } else {
            return res.status(400).send('No avatar file uploaded');
        }
    } catch (err) {
        logger.error('Error updating avatar:', err);
        return res.status(500).send('Server error');
    }
};





exports.deleteAccount = async(req, res) => {
    try {
    const user = req.authUser
    if (!user) return Response.sendError(res, 401, 'User not found');
    const days = parseInt(process.env.DATA_RETENTION_DAYS || '30');
    const now = new Date();
    const purgeAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    // req.authUser is a lean (plain) object, so it has no .save(). Use a direct update.
    await User.updateOne({ _id: user._id }, { $set: { deletedAt: now, isDeleted: true, purgeAt } });
    user.deletedAt = now;
    user.isDeleted = true;
    user.purgeAt = purgeAt;
    try {
        // Notify user that their account is scheduled for deletion per retention policy
        try {
            const msg = `Your account has been marked for deletion and will be permanently removed in ${days} days. Contact support if you wish to restore it.`;
            const helpers = require('../helpers');
            // sendNotification expects (userIds, message, senderName, fromUserId)
            if (helpers && typeof helpers.sendNotification === 'function') {
                helpers.sendNotification(String(user._id), msg, { en: 'System' }, String(user._id)).catch(() => {});
            }
        } catch (e) { logger.warn('Failed to send deletion notification', e); }
        // Revoke any tokens for this user (user-scoped revocation)
        try { await tokenBlacklist.revokeUser(String(user._id)); } catch (e) { logger.warn('Failed to revoke user tokens', e); }

        // If an Authorization header / cookie token was used for this request, try to revoke that specific JTI too
        try {
            const authHeader = req.headers && (req.headers.authorization || req.headers.Authorization) ? (req.headers.authorization || req.headers.Authorization) : (req.cookies && req.cookies.token ? req.cookies.token : null);
            let rawToken = null;
            if (authHeader) {
                rawToken = String(authHeader).startsWith('Bearer ') ? String(authHeader).slice(7) : authHeader;
            }
            if (rawToken) {
                try {
                    const decoded = jwt.decode(rawToken) || {};
                    const jti = decoded.jti || decoded.jti_id || decoded.jtiId || null;
                    if (jti) {
                        const ttl = decoded.exp ? Math.max(0, decoded.exp - Math.floor(Date.now() / 1000)) : undefined;
                        await tokenBlacklist.revokeByJti(jti, ttl);
                    }
                } catch (e) { logger.warn('Failed to decode token for jti revocation', e); }
            }
        } catch (e) { logger.warn('Failed to revoke jti for current token', e); }

        // Notify and disconnect any active sockets for this user
        try {
            const io = req.app && req.app.get ? req.app.get('io') : null;
            const sockets = connectedUsers.get(String(user._id));
            if (io && sockets && sockets.size) {
                for (const sid of Array.from(sockets)) {
                    try {
                        io.to(sid).emit('force-logout', { reason: 'account_deleted' });
                        const sock = io.sockets && io.sockets.sockets ? io.sockets.sockets.get(sid) : null;
                        if (sock && typeof sock.disconnect === 'function') {
                            sock.disconnect(true);
                        }
                    } catch (e) { logger.warn('Error forcing socket logout for', sid, e); }
                }
            }
        } catch (e) { logger.warn('Failed to notify sockets on account delete', e); }

        // record audit for self-delete
        try {
            const { recordAudit } = require('../utils/audit');
            await recordAudit({ actorId: user._id, actorRole: user.role || null, action: 'USER_SELF_DELETE', targetUserId: user._id, details: { retentionDays: process.env.DATA_RETENTION_DAYS || 30 }, ip: req.ip, userAgent: req.get('User-Agent') });
        } catch (e) { logger.warn('Failed to record audit for self-delete', e); }

    } catch (e) { logger.warn('deleteAccount post-delete hooks failed', e); }

    return Response.sendResponse(res, { retentionDays: days }, 'account deleted')
    } catch (err) {
        logger.error('UserController.deleteAccount error', err);
        return Response.sendError(res, 500, 'Failed to delete account');
    }
}

exports.restoreAccount = async (req, res) => {
    try {
        // Route runs without withAuthUser so soft-deleted users can reach it.
        let user = req.authUser;
        if (!user) {
            const uid = req.auth && req.auth._id;
            if (!uid) return Response.sendError(res, 401, 'Unauthorized');
            user = await User.findById(uid).lean();
        }
        if (!user) return Response.sendError(res, 404, 'User not found');
        if (!user.isDeleted) {
            return Response.sendError(res, 400, 'Account is not deleted');
        }

        await User.updateOne({ _id: user._id }, { $set: { isDeleted: false, deletedAt: null, purgeAt: null } });
        user.isDeleted = false;
        user.deletedAt = null;
        user.purgeAt = null;

        // Unrevoke user in blacklist
        try { await tokenBlacklist.unrevokeUser(String(user._id)); } catch (e) { logger.warn('Failed to unrevoke user', e); }

        return Response.sendResponse(res, user, 'Account restored successfully');
    } catch (err) {
        logger.error('UserController.restoreAccount error', err);
        return Response.sendError(res, 500, 'Failed to restore account');
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const user = req.user;
        if (!user) return Response.sendError(res, 404, 'User not found');

        const actorId = String(req.auth?._id || req.authUser?._id);
        const actorRole = (req.auth && req.auth.role) || (req.authUser && req.authUser.role);
        const isAdmin = actorRole === 'ADMIN' || actorRole === 'SUPER ADMIN';
        const isSelf = actorId === String(user._id);
        const reason = req.query.reason || 'No reason provided';

        // GDPR Logic: Admin delete is permanent (Hard Delete), User delete is retention (Soft Delete)
        if (isAdmin && !isSelf) {
            // Admin is deleting another user -> Permanent Purge
            try {
                const { purgeUser } = require('../helpers');
                const { recordAudit } = require('../utils/audit');
                
                await purgeUser(user._id);
                
                // Record Audit Log
                await recordAudit({
                    actorId: req.auth?._id || req.authUser?._id,
                    actorRole: actorRole,
                    action: 'DELETE',
                    targetUserId: user._id,
                    details: { reason, type: 'HARD_DELETE' },
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                });

                // Revoke tokens for the purged user
                try { await tokenBlacklist.revokeUser(String(user._id)); } catch (e) {}
                
                // Disconnect sockets for this user
                try {
                    const io = req.app.get('io');
                    const sockets = connectedUsers.get(String(user._id));
                    if (sockets && io && io.sockets) {
                        for (const sid of Array.from(sockets)) {
                            try {
                                const s = io.sockets.sockets.get(sid);
                                if (s) {
                                    s.emit('force-logout', { reason: 'account_deleted_by_admin' });
                                    s.disconnect(true);
                                }
                            } catch (e) {}
                        }
                    }
                } catch (e) { logger.warn('Failed to disconnect sockets on delete', e); }

                return Response.sendResponse(res, null, 'User permanently deleted by administrator (GDPR Hard Delete)');
            } catch (e) {
                logger.error('Permanent delete failed', e);
                return Response.sendError(res, 500, 'Could not permanently delete user');
            }
        } else {
            // User is deleting themselves OR non-admin request -> Soft Delete (30 days)
            const days = parseInt(process.env.DATA_RETENTION_DAYS || '30');
            const now = new Date();
            user.deletedAt = now;
            user.isDeleted = true;
            user.purgeAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
            await user.save();

            // Record Audit Log
            const { recordAudit } = require('../utils/audit');
            await recordAudit({
                actorId: req.auth?._id || req.authUser?._id,
                actorRole: actorRole,
                action: 'DELETE',
                targetUserId: user._id,
                details: { reason: isSelf ? 'User self-deletion' : reason, type: 'SOFT_DELETE' },
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
            
            // Revoke tokens so they can't keep using the app during the 30 days
            try { await tokenBlacklist.revokeUser(String(user._id)); } catch (e) {}
            
            // Disconnect sockets for this user
            try {
                const io = req.app.get('io');
                const sockets = connectedUsers.get(String(user._id));
                if (sockets && io && io.sockets) {
                    for (const sid of Array.from(sockets)) {
                        try {
                            const s = io.sockets.sockets.get(sid);
                            if (s) {
                                s.emit('force-logout', { reason: 'account_deleted' });
                                s.disconnect(true);
                            }
                        } catch (e) {}
                    }
                }
            } catch (e) { logger.warn('Failed to disconnect sockets on soft-delete', e); }

            return Response.sendResponse(res, null, `Account scheduled for deletion in ${days} days. You can restore it before then.`);
        }
    } catch (err) {
        logger.error('UserController.deleteUser error', err);
        return Response.sendError(res, 500, 'Failed to process deletion');
    }
};

// Admin: restore a soft-deleted user within retention window
exports.restoreUser = async (req, res) => {
    try {
        const userId = req.params.userId;
        const user = await User.findById(userId);
        if (!user) return Response.sendError(res, 404, 'User not found');

        user.isDeleted = false;
        user.deletedAt = null;
        user.purgeAt = null;
        await user.save();

        // Unrevoke user in blacklist
        try { await tokenBlacklist.unrevokeUser(String(user._id)); } catch (e) { logger.warn('Failed to unrevoke user', e); }

        try {
            const { recordAudit } = require('../utils/audit');
            await recordAudit({ actorId: req.auth && req.auth._id, actorRole: req.auth && req.auth.role, action: 'USER_RESTORE', targetUserId: user._id, details: null, ip: req.ip, userAgent: req.get('User-Agent') });
        } catch (e) { logger.warn('Failed to record audit for restore', e); }

        return Response.sendResponse(res, user.publicInfo(), 'user restored');
    } catch (err) {
        logger.error('Error restoring user:', err);
        return Response.sendError(res, 500, 'Could not restore the user');
    }
};

exports.toggleUserStatus = async (req, res) => {
    try {
        const user = req.user;
        if (!user) return Response.sendError(res, 404, 'User not found');

        user.enabled = !user.enabled;
        await user.save();

        return Response.sendResponse(res, user.enabled, 'The user account has been ' + (user.enabled ? 'enabled' : 'disabled'));
    } catch (err) {
        logger.error('Error toggling user status:', err);
        return Response.sendError(res, 500, 'Server error, please try again later');
    }
};

exports.follow = async(req, res) => {
    const authUser = req.authUser
    const user = req.user
    let followed = false

    if(!authUser.following.includes(user._id)){
        // Ensure they are NOT friends if they are following
        authUser.friends = authUser.friends.filter(id => id.toString() !== user._id.toString());
        user.friends = user.friends.filter(id => id.toString() !== authUser._id.toString());

        authUser.following.push(user._id)
        if(!user.followers.includes(authUser._id))
            user.followers.push(authUser._id)
        followed = true
    }
    else{
        authUser.following = authUser.following.filter(id => id.toString() !== user._id.toString());
        user.followers = user.followers.filter(id => id.toString() !== authUser._id.toString());
    }

    await user.save()
    await authUser.save()

    // Emit real-time follow update to both parties so follower/following counts refresh instantly
    realtime.emitFollowUpdate(authUser._id, user._id, followed ? 'followed' : 'unfollowed');

    if(followed)
        sendNotification({en: req.authUser.firstName + ' ' + req.authUser.lastName}, {en: 'started following you'}, {
            type: 'follow-user',
            link: '/tabs/profile/display/' + user._id
        }, [], [user._id])

    return Response.sendResponse(res, followed, followed ? 'followed' : 'unfollowed')
}

exports.getUsers = async (req, res) => {
    try {
        // Helper: convert Mongoose documents to plain objects and ensure _id is a string
        const plainifyUsers = (usersArray) => {
            if (!Array.isArray(usersArray)) return [];
            return usersArray.map(u => {
                try {
                    let obj = (u && typeof u.toObject === 'function') ? u.toObject() : (u && u._doc ? u._doc : u);
                    return normalizeLeanDoc(obj);
                } catch (e) {
                    return u;
                }
            });
        };
        const page = req.query.page ? +req.query.page : 0;
        const limit = 20;
        const skip = page * limit;
        const type = req.query.type || 'near';

        // Build the base filter (gender, age, interests, etc.)
        const filter = buildBaseFilter(req);

        if (type === 'near') {
            // 1. Search in City
            let cityUsers = await findUsersInCity(req, filter, skip, limit);
            
            // If we found enough city users, or we are paginating deep into city results
            if (cityUsers.length >= 10 || (page > 0 && cityUsers.length > 0)) {
                return Response.sendResponse(res, { 
                    users: setOnlineUsers(plainifyUsers(cityUsers)), 
                    more: hasMoreUsers(cityUsers, limit, page), 
                    isGlobalSearch: false,
                    scope: 'city'
                });
            }

            // 2. Expand to Country if city results are low (< 10)
            let countryUsers = await findUsersInCountry(req, filter, skip, limit);
            
            // Filter out users already in cityUsers to avoid duplicates on page 0
            const cityIds = new Set(cityUsers.map(u => u._id.toString()));
            countryUsers = countryUsers.filter(u => !cityIds.has(String(u._id)));

            // If page 0, and combined city+country results are still small, append global results below
            if (page === 0) {
                const combinedCount = (cityUsers.length || 0) + (countryUsers.length || 0);
                if (combinedCount >= 10) {
                    // Enough local results — show city then country divider
                    const allUsers = cityUsers.concat(countryUsers.length ? [{ isDivider: true, scope: 'country' }, ...countryUsers] : []);
                    return Response.sendResponse(res, { 
                        users: setOnlineUsers(plainifyUsers(allUsers)), 
                        more: hasMoreUsers(countryUsers, limit, page), 
                        isGlobalSearch: false,
                        scope: 'country'
                    });
                }
                // Not enough local results: fetch global and append as needed
                let globalUsers = await findUsersGlobally(req, filter, 0, limit);
                // remove duplicates
                const seen = new Set([...cityUsers.map(u=>String(u._id)), ...countryUsers.map(u=>String(u._id))]);
                globalUsers = globalUsers.filter(u => !seen.has(String(u._id)));

                // Build combined list: city, country divider+country, global divider+global
                const allUsers = [];
                if (cityUsers.length) allUsers.push(...cityUsers);
                if (countryUsers.length) {
                    allUsers.push({ isDivider: true, scope: 'country' });
                    allUsers.push(...countryUsers);
                }
                if (globalUsers.length) {
                    allUsers.push({ isDivider: true, scope: 'global' });
                    allUsers.push(...globalUsers);
                }

                return Response.sendResponse(res, { 
                    users: setOnlineUsers(plainifyUsers(allUsers)), 
                    more: hasMoreUsers(globalUsers, limit, page), 
                    isGlobalSearch: true,
                    scope: 'global'
                });
            } else {
                // non-zero pages: return countryUsers if any, else fallthrough to global
                if (countryUsers.length > 0) {
                    return Response.sendResponse(res, { 
                        users: setOnlineUsers(plainifyUsers(countryUsers)), 
                        more: hasMoreUsers(countryUsers, limit, page), 
                        isGlobalSearch: false,
                        scope: 'country'
                    });
                }
            }

            // 3. Expand to Global if still no results
            let globalUsers = await findUsersGlobally(req, filter, skip, limit);
            if (page === 0) {
                // On first page, we might have some city/country users to show before global
                const seenIds = new Set([...cityIds, ...countryUsers.map(u => u._id.toString())]);
                globalUsers = globalUsers.filter(u => !seenIds.has(u._id.toString()));
                
                let allUsers = [...cityUsers];
                if (countryUsers.length) {
                    allUsers.push({ isDivider: true, scope: 'country' });
                    allUsers.push(...countryUsers);
                }
                if (globalUsers.length) {
                    allUsers.push({ isDivider: true, scope: 'global' });
                    allUsers.push(...globalUsers);
                }
                
                return Response.sendResponse(res, { 
                    users: setOnlineUsers(plainifyUsers(allUsers)), 
                    more: hasMoreUsers(globalUsers, limit, page), 
                    isGlobalSearch: true,
                    scope: 'global'
                });
            } else {
                // On subsequent pages, just return global results
                return Response.sendResponse(res, { 
                    users: setOnlineUsers(plainifyUsers(globalUsers)), 
                    more: hasMoreUsers(globalUsers, limit, page), 
                    isGlobalSearch: true,
                    scope: 'global'
                });
            }

        } else {
            // Handle random user fetching (Always Global, Online Only)
            // Ensure randomVisible is true for random mode
            const randomFilter = { ...filter, randomVisible: true };
            let randomUsers = await findRandomUsers(req, randomFilter, limit);
            
            return Response.sendResponse(res, { 
                users: setOnlineUsers(plainifyUsers(randomUsers)), 
                more: false, 
                isGlobalSearch: true,
                scope: 'global'
            });
        }

    } catch (err) {
        logger.info("Server error:", err);
        return Response.sendError(res, 500, 'Server error!');
    }
};

// Helper function to build the base filter
function buildBaseFilter(req) {
    // Use string IDs directly - MongoDB handles string to ObjectId comparison automatically
    // This prevents buffer serialization issues when logging or serializing filters
    const authUserId = String(req.auth._id);
    const authUserBlockedIds = (req.authUser.blockedUsers || []).map(id => String(id));

    // normalize query helpers: treat empty strings, literal 'null'/'undefined' and placeholder '0' as absent
    const isEmptyParam = (v) => v === undefined || v === null || String(v).trim() === '' || String(v).toLowerCase() === 'null' || String(v).toLowerCase() === 'undefined';
    const isPlaceholderZero = (v) => String(v) === '0';
    
    const filter = {
        _id: { $ne: authUserId, $nin: authUserBlockedIds },  // Exclude the auth user and blocked users
        blockedUsers: { $ne: authUserId },  // Ensure the current user is not in blockedUsers
        friends: { $ne: authUserId },  // Ensure the current user is not in friends
        role: { $nin: ['ADMIN', 'SUPER ADMIN'] },  // Exclude admin roles
        enabled: { $ne: false },  // Only include enabled users
        isDeleted: { $ne: true }, // Only include non-deleted users
        banned: { $ne: true },    // Only include non-banned users
        deletedAt: { $eq: null }  // Only include non-deleted users
    };

    // Apply additional filters based on the query
    // profession/education/school: use case-insensitive regex for better matching
    if (!isEmptyParam(req.query.profession) && !isPlaceholderZero(req.query.profession)) {
        let val = req.query.profession === '1' ? req.authUser.profession : req.query.profession;
        if (isEmptyParam(val)) val = null;
        if (val) filter['profession'] = new RegExp(String(val).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
    if (!isEmptyParam(req.query.education) && !isPlaceholderZero(req.query.education)) {
        let val = req.query.education === '1' ? req.authUser.education : req.query.education;
        if (isEmptyParam(val)) val = null;
        if (val) filter['education'] = new RegExp(String(val).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
    if (!isEmptyParam(req.query.school) && !isPlaceholderZero(req.query.school)) {
        let val = req.query.school === '1' ? req.authUser.school : req.query.school;
        if (isEmptyParam(val)) val = null;
        if (val) filter['school'] = new RegExp(String(val).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
    // interests: allow comma separated list or a special '1' to match auth user's interests
    if (!isEmptyParam(req.query.interests) && !isPlaceholderZero(req.query.interests)) {
        if (req.query.interests === '1') {
            // Use the auth user's interests when requested; allow empty array fallback
            const authInterests = Array.isArray(req.authUser.interests) ? req.authUser.interests : [];
            filter['interests'] = { $in: authInterests };
        } else {
            const interests = String(req.query.interests).split(',').map(s => s.trim()).filter(Boolean);
            if (interests.length) filter['interests'] = { $in: interests };
        }
    }
    // languages: comma separated
    if (!isEmptyParam(req.query.languages) && !isPlaceholderZero(req.query.languages)) {
        const langs = String(req.query.languages).split(',').map(s => s.trim()).filter(Boolean);
        if (langs.length) filter['languages'] = { $in: langs };
    }
    // gender (default both)
    if (typeof req.query.gender !== 'undefined' && req.query.gender !== 'both') {
        if (req.query.gender === 'prefer not to say') {
            filter['$or'] = [
                { gender: 'prefer not to say' },
                { genderVisible: false }
            ];
        } else {
            filter['gender'] = req.query.gender;
            filter['genderVisible'] = { $ne: false };
        }
    }

    // Age range (minAge/maxAge) -> convert to birthDate range
    if ((!isEmptyParam(req.query.minAge) && !isPlaceholderZero(req.query.minAge)) || (!isEmptyParam(req.query.maxAge) && !isPlaceholderZero(req.query.maxAge))) {
        const { minBirth, maxBirth } = parseAgeRange(req.query.minAge, req.query.maxAge);
        if (minBirth || maxBirth) {
            filter['birthDate'] = {};
            if (minBirth) filter['birthDate'].$lte = minBirth; // born before or equal => older than minAge
            if (maxBirth) filter['birthDate'].$gte = maxBirth; // born after or equal => younger than maxAge
        }
    } else {
        // If no age filter is provided, ensure we don't have a stale birthDate filter
        delete filter['birthDate'];
    }

    // Text query (q) - simple regex search against names and aboutMe
    if (!isEmptyParam(req.query.q)) {
        const q = String(req.query.q).trim();
        if (q.length) {
            const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            const qFilter = [ { firstName: re }, { lastName: re }, { aboutMe: re } ];
            if (filter['$or']) {
                // We already have an $or (likely from gender), so we must wrap in $and to avoid overwriting
                const existingOr = filter['$or'];
                delete filter['$or'];
                filter['$and'] = [
                    { $or: existingOr },
                    { $or: qFilter }
                ];
            } else {
                filter['$or'] = qFilter;
            }
        }
    }

    if (process.env.DEBUG_USER_SEARCH === '1') logger.info("Generated MongoDB Filter:", JSON.stringify(filter, null, 2));
    return filter;
}

// Build a relaxed filter used when strict filters return zero results
function buildMinimalFilter(req) {
    // Use string IDs directly - MongoDB handles string to ObjectId comparison automatically
    const authUserId = String(req.auth._id);
    const authUserBlockedIds = (req.authUser.blockedUsers || []).map(id => String(id));

    const minimal = {
        _id: { $ne: authUserId, $nin: authUserBlockedIds },
        blockedUsers: { $ne: authUserId },
        friends: { $ne: authUserId },
        role: { $nin: ['ADMIN', 'SUPER ADMIN'] },
        deletedAt: { $eq: null }
    };

    // Keep gender preference if set, and avoid strict lists
    if (typeof req.query.gender !== 'undefined' && req.query.gender !== 'both') {
        if (req.query.gender === 'prefer not to say') {
            minimal['$or'] = [
                { gender: 'prefer not to say' },
                { genderVisible: false }
            ];
        } else {
            minimal['gender'] = req.query.gender;
            minimal['genderVisible'] = { $ne: false };
        }
    }

    return minimal;
}

// Convert age range (minAge/maxAge) to birthDate bounds
function parseAgeRange(minAgeRaw, maxAgeRaw) {
    const today = new Date();
    const normalize = (v) => {
        if (v === undefined || v === null) return null;
        const s = String(v).trim().toLowerCase();
        if (s === '' || s === 'null' || s === 'undefined' || s === '0') return null;
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
    };
    const minAge = normalize(minAgeRaw);
    const maxAge = normalize(maxAgeRaw);
    let minBirth = null; // latest birthdate (youngest)
    let maxBirth = null; // earliest birthdate (oldest)
    if (minAge) {
        // minAge means user should be at least minAge years old -> born on or before (today - minAge years)
        const d = new Date(today.getFullYear() - minAge, today.getMonth(), today.getDate());
        minBirth = d; // Date object: born on or before this date
    }
    if (maxAge) {
        // maxAge means user should be at most maxAge years old -> born on or after (today - maxAge years)
        const d = new Date(today.getFullYear() - maxAge, today.getMonth(), today.getDate());
        maxBirth = d; // Date object: born on or after this date
    }
    return { minBirth, maxBirth };
}

// Fetch users from DB then filter by online status if needed (caps to avoid huge scans)
async function fetchUsersThenFilterOnline(req, baseFilter, skip, limit) {
    // cap fetch to reasonable maximum to avoid scanning entire collection
    const FETCH_CAP = 1000; // upper bound
    const fetchLimit = Math.min(Math.max(limit * 10, 100), FETCH_CAP);

    const candidates = await User.find(baseFilter)
        .populate('requests', '', 'Request', getRequestPopulationQuery(req))
        .select(getUserSelectFields(req))
        .sort({ createdAt: -1 })
        .limit(fetchLimit)
        .lean();

    // Normalize all ObjectIds to strings
    const normalizedCandidates = normalizeLeanDoc(candidates);

    // batch-check online status using presence module (Redis-backed if available)
    const presence = require('../utils/presence');
    const ids = normalizedCandidates.map(c => c._id.toString());
    const onlineSet = await presence.getOnlineSet(ids);
    const onlineFiltered = normalizedCandidates.filter(u => onlineSet.has(u._id.toString()));

    // apply skip/limit on filtered results
    const sliced = onlineFiltered.slice(skip, skip + limit);
    return sliced;
}


// Helper function to find users in a specific city
async function findUsersInCity(req, filter, skip, limit) {
    if (!req.authUser || !req.authUser.city) {
        if (process.env.DEBUG_USER_SEARCH === '1') logger.info("findUsersInCity: No city found for auth user", {
            hasAuthUser: !!req.authUser,
            authUserId: req.authUser?._id,
            city: req.authUser?.city,
            country: req.authUser?.country
        });
        return [];
    }
    // Use case-insensitive regex for city matching
    const cityRegex = new RegExp('^' + req.authUser.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
    const cityFilter = { ...filter, city: cityRegex };
    if (process.env.DEBUG_USER_SEARCH === '1') logger.info("Filter being used for city search:", cityFilter);

    if (req.query.online === '1' || req.query.online === 'true') {
        return await fetchUsersThenFilterOnline(req, cityFilter, skip, limit);
    }

    const sort = parseSortParam(req.query.sort);
    return await User.find(cityFilter)
        .populate('requests', '', 'Request', getRequestPopulationQuery(req))
        .select(getUserSelectFields(req))
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec();
}

// Helper function to find users in a specific country
async function findUsersInCountry(req, filter, skip, limit) {
    if (!req.authUser || !req.authUser.country) {
        if (process.env.DEBUG_USER_SEARCH === '1') logger.info("findUsersInCountry: No country found for auth user", {
            hasAuthUser: !!req.authUser,
            authUserId: req.authUser?._id,
            city: req.authUser?.city,
            country: req.authUser?.country
        });
        return [];
    }
    // Use case-insensitive regex for country matching
    const countryRegex = new RegExp('^' + req.authUser.country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
    const countryFilter = { ...filter, country: countryRegex };
    delete countryFilter['city'];
    if (process.env.DEBUG_USER_SEARCH === '1') logger.info("Filter being used for country search:", countryFilter);

    if (req.query.online === '1' || req.query.online === 'true') {
        return await fetchUsersThenFilterOnline(req, countryFilter, skip, limit);
    }

    const sort = parseSortParam(req.query.sort);
    return await User.find(countryFilter)
        .populate('requests', '', 'Request', getRequestPopulationQuery(req))
        .select(getUserSelectFields(req))
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec();
}

// Helper function to find users globally
async function findUsersGlobally(req, filter, skip, limit) {
    const globalFilter = { ...filter };
    delete globalFilter['city'];
    delete globalFilter['country'];
    if (process.env.DEBUG_USER_SEARCH === '1') logger.info("Filter being used for global search:", globalFilter);

    if (req.query.online === '1' || req.query.online === 'true') {
        return await fetchUsersThenFilterOnline(req, globalFilter, skip, limit);
    }

    const sort = parseSortParam(req.query.sort);
    return await User.find(globalFilter)
        .populate('requests', '', 'Request', getRequestPopulationQuery(req))
        .select(getUserSelectFields(req))
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec();
}

function parseSortParam(sortParam) {
    // Allow a few safe sorts; default to createdAt desc
    switch (sortParam) {
        case 'lastActive':
            return { lastActive: -1 };
        case 'followers':
            return { followersCount: -1 };
        case 'distance':
            // distance sorting requires geo query; fall back to createdAt
            return { createdAt: -1 };
        default:
            return { createdAt: -1 };
    }
}

// Helper function to find random users
async function findRandomUsers(req, filter, limit) {
  // Ensure we only show users who want to be visible in random discovery
  filter['randomVisible'] = true;

  if (process.env.DEBUG_USER_SEARCH === '1') logger.info("Random Discovery filter:", JSON.stringify(filter));

  // Fetch candidates matching the filters (gender, age, interests, etc.)
  const candidates = await User.find(filter)
    .populate('requests', '', 'Request', getRequestPopulationQuery(req))
    .select(getUserSelectFields(req))
    .sort({ createdAt: -1 })
    .lean();

  // Normalize all ObjectIds to strings
  const normalizedCandidates = normalizeLeanDoc(candidates);

  if (process.env.DEBUG_USER_SEARCH === '1') logger.info(`Candidates before online filter: ${normalizedCandidates.length}`);

  // Apply online filter in Node.js
  const onlineUsers = normalizedCandidates.filter(u => isUserOnline(u._id.toString()));

  if (process.env.DEBUG_USER_SEARCH === '1') logger.info(`Online candidates after filter: ${onlineUsers.length}`);

  // Random slice
  const count = onlineUsers.length;
  const skip = count > limit ? Math.floor(Math.random() * (count - limit)) : 0;
  const users = onlineUsers.slice(skip, skip + limit);

  return users;
}
// Helper function to determine if more users exist for pagination
function hasMoreUsers(users, limit, page) {
    // If we returned exactly 'limit' users, there's a high chance more exist
    return users && users.length === limit;
}

// Helper function to build the request population query
function getRequestPopulationQuery(req) {
    const authUserId = String(req.auth._id);
    return {
        $or: [
            { from: authUserId },
            { to: authUserId }
        ]
    };
}

// Helper function to select fields for users
function getUserSelectFields(req) {
    const authUserId = String(req.auth._id);
    return {
        firstName: 1,
        lastName: 1,
        email: 1,
        country: 1,
        city: 1,
        gender: 1,
        avatar: 1,
        mainAvatar: 1,
        birthDate: { $cond: [{ $eq: ["$ageVisible", true] }, "$birthDate", null] },
        followed: { $in: [authUserId, "$followers"] },
        friend: { $in: [authUserId, "$friends"] },
        requests: 1,
        profession: 1,
        interests: 1,
        education: 1,
        school: 1,
        avatarStyle: 1,
        avatarSeed: 1,
        avatarVariant: 1,
        avatarOverrides: 1,
        themePreference: 1,
        updatedAt: 1,
        enabled: 1,
        is2FAEnabled: 1,
        twoFAToken: 1,
        role: 1,
        banned: 1,
        reports: 1,
        followers: 1,
        following: 1,
        friends: 1,
        blockedUsers: 1,
        followedChannels: 1,
        messagedUsers: 1,
        randomVisible: 1,
        ageVisible: 1,
        isPrivate: 1,
        loggedIn: 1,
        online: 1,
        visitProfile: 1,
        salt: 1,
        hashed_password: 1,
        createdAt: 1,
        updatedAt: 1,
        aboutMe: 1,
        lastSeen:1,
    };
}



const isFriend = (authUser, user) => {
    if (!authUser || !user) {
        return {
            isLoggedInUser: false,
            isFriend: false,
            friend: false,
        };
    }
    const isLoggedInUser = authUser._id.toString() === user._id.toString();
    const isFriendResult = user.friends.some(friendId => friendId.toString() === authUser._id.toString());
    return {
        isLoggedInUser,
        isFriend: isFriendResult,
        friend: isFriendResult,
    };
};

function formatLastSeen(lastSeenDate) {
    const now = new Date();
    const lastSeen = new Date(lastSeenDate);
    const diffMs = now - lastSeen;
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes} minute(s) ago`;
    if (diffHours < 24) return `${diffHours} hour(s) ago`;
    return `${diffDays} day(s) ago`;
}

exports.getUserProfile = async (req, res) => {
    if (process.env.DEBUG_PROFILE === '1') logger.info(`Fetching user profile for ID: ${req.params.userId}`);
  
    try {
      const userId = normalizeId(req.params.userId);
      const authUserId = req.auth._id.toString();
  
      if (process.env.DEBUG_PROFILE === '1') logger.info(`Authenticated user ID: ${authUserId}`);
  
      // Find the user by ID and populate subscription details
      const userDoc = await User.findOne({ _id: userId })
        .select({
          firstName: 1,
          lastName: 1,
          email: 1,
          emailVerified: 1,
          country: 1,
          city: 1,
          gender: 1,
          avatar: 1,
          mainAvatar: 1,
          birthDate: 1,
          profession: 1,
          interests: 1,
          languages: 1,
          education: 1,
          school: 1,
          loggedIn: 1,
          enabled: 1,
          is2FAEnabled: 1,
          twoFAToken: 1,
          role: 1,
          banned: 1,
          followers: 1,
          following: 1,
          friends: 1,
          missedCallBudget: 1,
          blockedUsers: 1,
          followedChannels: 1,
          messagedUsers: 1,
          randomVisible: 1,
          ageVisible: 1,
          genderVisible: 1,
          visitProfile: 1,
          isPrivate: 1,
          lastSeen: 1,
          aboutMe: 1,
          avatarStyle: 1,
          avatarSeed: 1,
          avatarVariant: 1,
          avatarOverrides: 1,
          subscription: 1,
          themePreference: 1,
          createdAt: 1,
          updatedAt: 1,
          deletedAt: 1
        })
        .populate({
          path: "subscription._id",
          model: "Subscription",
          select: "dayPrice weekPrice monthPrice yearPrice currency offers",
        })
        .populate({
          path: "followedChannels",
          select: "name title image photo description type"
        });
  
      if (!userDoc) {
        return Response.sendError(res, 404, "User not found");
      }
      
      // If user is deleted, disabled, or banned, hide profile from others
      const isAdmin = req.auth && (req.auth.role === 'ADMIN' || req.auth.role === 'SUPER ADMIN');
      const isSelf = userDoc._id.toString() === authUserId;
      
      if ((userDoc.deletedAt || userDoc.isDeleted || !userDoc.enabled || userDoc.banned) && !isAdmin && !isSelf) {
        return Response.sendError(res, 404, "User not found");
      }

      if (userDoc.deletedAt) {
        return Response.sendError(res, 404, "User not found"); // Use 404 instead of 204 to avoid frontend parsing errors
      }

      // Check if the authenticated user is blocked by the profile owner
      if (userDoc.blockedUsers && userDoc.blockedUsers.some(id => id.toString() === authUserId)) {
        return res.status(403).send("You are blocked by this user");
      }
  
      // 🚫 Defensive: if backend tries to return self when requesting another profile
      if (userDoc._id.toString() === authUserId && userId !== authUserId) {
        return res.status(404).send("User not found");
      }
  
      // Convert to plain object and normalize all ObjectIds to strings
      const user = normalizeLeanDoc(userDoc.toObject());
      const isMe = authUserId === userId;

      // Add pending counts for self
      if (isMe) {
          user.pendingFollowRequestsCount = await Follow.countDocuments({ followed: authUserId, status: 'pending' });
          user.pendingFriendRequestsCount = await Request.countDocuments({ to: authUserId, accepted: false });
      }
  
      // Default avatar if missing
      if (!user.mainAvatar && typeof userDoc.getDefaultAvatar === "function") {
        user.mainAvatar = userDoc.getDefaultAvatar();
      }
  
      // Relationship status — bidirectional check:
      // The viewed user may have the auth user in their friends, OR the auth user may have the
      // viewed user in their friends (DB can be inconsistent if one side was updated first).
      // Fetch auth user's own friends to cross-check.
      const authUserFriends = await User.findById(authUserId).select('friends').lean();
      const authFriendIds = (authUserFriends?.friends || []).map(id => String(id));
      const isFriendBidirectional = (doc, friendIdStr) => {
        const inViewedSide = doc.friends && doc.friends.some(id => String(id) === friendIdStr);
        const inAuthSide   = authFriendIds.includes(String(doc._id));
        return inViewedSide || inAuthSide;
      };
      const isLoggedInUser = authUserId === userId;
      const isFriendResult = isLoggedInUser ? false : isFriendBidirectional(userDoc, authUserId);
      const relationshipStatus = {
        isLoggedInUser,
        isFriend: isFriendResult,
        friend:   isFriendResult,
      };

      // Add follow status
      const followRecord = await Follow.findOne({
        follower: authUserId,
        followed: userId
      });

      const isFollowerRecord = await Follow.findOne({
        follower: userId,
        followed: authUserId
      });

      relationshipStatus.followStatus = followRecord ? followRecord.status : null;
      relationshipStatus.isFollowing = !!(followRecord && followRecord.status === 'active');
      relationshipStatus.isFollower = !!(isFollowerRecord && isFollowerRecord.status === 'active');

      // Friend request status: 'requested' = auth user sent request, 'requesting' = profile owner sent request to auth user
      if (!isFriendResult && !isMe) {
        const outgoingRequest = await Request.findOne({ from: authUserId, to: userId, accepted: false });
        const incomingRequest = await Request.findOne({ from: userId, to: authUserId, accepted: false });
        if (outgoingRequest) relationshipStatus.request = 'requested';
        else if (incomingRequest) relationshipStatus.request = 'requesting';
        else relationshipStatus.request = null;
      }

      // If profile is private and not a friend/self, restrict exposed data.
      // - Active followers can see aboutMe only (bio revealed, rest stays hidden).
      // - Everyone else (strangers) sees the locked placeholder for aboutMe too.
      if (userDoc.isPrivate && !relationshipStatus.isFriend && !isMe) {
          user.email = undefined;
          user.birthDate = undefined;
          user.interests = [];
          user.languages = [];
          user.education = undefined;
          user.profession = undefined;
          user.school = undefined;
          user.avatar = []; // Hide gallery
          user.followedChannels = [];
          if (!relationshipStatus.isFollowing) {
              // Stranger — hide bio too
              user.aboutMe = "This profile is private. Follow to see their bio.";
          }
          // Active followers keep the real aboutMe but nothing else
      }

            // Defensive: decode legacy/base64-encoded interests or languages if present
            const decodeIfNeeded = (raw) => {
                if (!raw) return [];
                if (Array.isArray(raw)) {
                    if (raw.length === 1 && typeof raw[0] === 'string') {
                        const candidate = raw[0].trim();
                        const looksBase64Single = /^[A-Za-z0-9+/=]+$/.test(candidate) && candidate.length > 4;
                        if (looksBase64Single) {
                            try {
                                const decoded = Buffer.from(candidate, 'base64').toString('utf-8');
                                if (decoded && /[A-Za-z]/.test(decoded)) return decoded.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
                            } catch (e) {}
                        }
                    }
                    return raw.map(r => (typeof r === 'string' ? r.trim() : '')).filter(Boolean);
                }
                if (typeof raw !== 'string') raw = String(raw || '');
                raw = raw.trim();
                if (!raw) return [];
                const looksBase64 = /^[A-Za-z0-9+/=]+$/.test(raw) && raw.length > 4;
                if (looksBase64) {
                    try {
                        const decoded = Buffer.from(raw, 'base64').toString('utf-8');
                        if (decoded && /[A-Za-z]/.test(decoded)) return decoded.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
                    } catch (e) {}
                }
                if (raw.indexOf(',') !== -1 || raw.indexOf('|') !== -1 || raw.indexOf(';') !== -1) {
                    return raw.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
                }
                return [raw];
            };

            user.interests = decodeIfNeeded(user.interests || []);
            user.languages = decodeIfNeeded(user.languages || []);

      // Real-time online status
      const response = {
        ...user,
        ...relationshipStatus,
        subscription: user.subscription?._id
          ? {
              ...user.subscription._id,
              expireDate: user.subscription.expireDate,
            }
          : null,
        ...relationshipStatus,
        loggedIn: user.loggedIn,
        online: user.online,            // use virtual
        lastSeenText: user.lastSeenText // use virtual
      };
      
  
            if (process.env.DEBUG_PROFILE === '1') logger.info("Sending user profile:", {
                _id: response._id,
                isLoggedInUser: response.isLoggedInUser,
                isFriend: response.isFriend,
                online: response.online,
                lastSeenText: response.lastSeenText,
            });

            // Disable caching for user profile responses so clients always receive full, fresh data
            try {
                res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                res.set('Pragma', 'no-cache');
                res.set('Expires', '0');
            } catch (e) { /* ignore header errors */ }

            // Use centralized response helper to ensure consistent shape and sanitization
            const Response = require('./Response');
            return Response.sendResponse(res, response);
    } catch (err) {
      logger.error("Error fetching user profile:", err);
      return res.status(500).send("Server error");
    }
  };
  




exports.getFriends = async (req, res) => {
    try {
        const limit = 20;
        const page = parseInt(req.query.page, 10);

        if (isNaN(page) || page < 0) {
            logger.error('Invalid page parameter:', req.query.page);
            return res.status(400).json({ error: 'Invalid page parameter' });
        }

        logger.info('Authenticated user:', req.authUser);

        if (!req.authUser || !req.authUser._id) {
            logger.error('req.authUser is undefined or does not have _id');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const userId = String(req.authUser._id);

        const user = await User.findById(userId);
        if (!user) {
            logger.error('User not found:', userId);
            return res.status(404).json({ error: 'User not found' });
        }

        logger.info('User document:', user);

        // If the user has no friends, return empty result immediately to avoid
        // querying with an empty $in array which will always return no documents.
        if (!user.friends || user.friends.length === 0) {
            logger.warn('User has no friends, returning empty list for:', userId);
            return res.status(200).json({ friends: [], more: false });
        }

        const filter = { 
            _id: { $in: user.friends },
            enabled: { $ne: false },
            isDeleted: { $ne: true },
            banned: { $ne: true },
            deletedAt: { $eq: null }
        };

        logger.info('Filter being used:', filter);

        const friends = await User.find(filter, {
            firstName: 1,
            lastName: 1,
            birthDate: { $cond: [{ $eq: ['$ageVisible', true] }, '$birthDate', null] },
            avatar: 1,
            mainAvatar: 1,
            avatarStyle: 1,
            avatarSeed: 1,
            avatarVariant: 1,
            avatarOverrides: 1,
            city: 1,
        })
        .skip(limit * page)
        .limit(limit)
        .exec();

        if (!friends || friends.length === 0) {
            logger.warn('No friends found for user:', userId);
            return res.status(200).json({ friends: [], more: false });
        }

        const count = await User.find(filter).countDocuments();

        const friendsWithOnlineStatus = friends.map(friend => ({
            ...friend._doc, // Spread the existing friend fields
            isFriend: true // Indicate this user is a friend
        }));

        return res.status(200).json({
            friends: friendsWithOnlineStatus,
            more: (count - (limit * (page + 1))) > 0
        });

    } catch (err) {
        logger.error('Error in getFriends:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};



exports.removeFriendship = async(req, res) => {
    try{
        const authUser = req.authUser;
        const user = req.user;

        if (!authUser || !authUser._id || !user || !user._id) {
            logger.warn('removeFriendship: missing authUser or user', { authUser: !!authUser, user: !!user });
            return Response.sendError(res, 400, 'Invalid users');
        }

        // perform idempotent removal
        await User.updateOne({ _id: user._id }, { $pull: { friends: authUser._id } });
        await User.updateOne({ _id: authUser._id }, { $pull: { friends: user._id } });
        
        // Also remove any pending friendship requests between these two
        await Request.deleteMany({
            $or: [
                { from: authUser._id, to: user._id },
                { from: user._id, to: authUser._id }
            ]
        });

        logger.info('removeFriendship: removed friendship and requests between', String(authUser._id), 'and', String(user._id));

        // 🔁 Notify both sides to refresh friends list
        emitFriendRequestsUpdated(authUser._id, user._id);
        try {
            emitToUsers([authUser._id, user._id], 'friend-requests-updated', {
                type: 'removed',
                action: 'unfriend',
                friend: false,
                userIds: [String(authUser._id), String(user._id)],
                at: Date.now()
            });
        } catch (e) {}

        return Response.sendResponse(res, true, 'Friendship is removed');
    }catch(err){
        logger.info(err);
        return Response.sendError(res, 400, 'failed')
    }
}

exports.blockUser = async (req, res) => {
    try {
      const user = req.user;
      const authUser = req.authUser;
  
      // Remove user from the lists of friends, followers, and following
      user.friends = user.friends.filter(friend => !friend.equals(authUser._id));
      user.followers = user.followers.filter(follower => !follower.equals(authUser._id));
      user.following = user.following.filter(following => !following.equals(authUser._id));
  
      // Block the user and update authUser's lists
      authUser.blockedUsers.push(user._id);
      authUser.friends = authUser.friends.filter(friend => !friend.equals(user._id));
      authUser.followers = authUser.followers.filter(follower => !follower.equals(user._id));
      authUser.following = authUser.following.filter(following => !following.equals(user._id));
  
      // Save both authUser and user (use async/await for both saves)
      await authUser.save();
      await user.save();

      // 🔁 Notify both sides to refresh friends list
    emitFriendRequestsUpdated(authUser._id, user._id);
    // Notify clients to refresh profiles for both users
    try { emitToUsers([authUser._id, user._id], 'user-profile-updated', { userId: user._id }); } catch (e) {}
  
      // Remove any requests between the two users
      const authUserId = String(req.auth._id);
      const targetUserId = String(req.user._id);
      
      await Request.deleteMany({
        $or: [
          {
            $and: [
              { from: authUserId },
              { to: targetUserId }
            ]
          },
          {
            $and: [
              { to: authUserId },
              { from: targetUserId }
            ]
          }
        ]
      });
  
      // Send a successful response
      return Response.sendResponse(res, true, 'User blocked');
      
    } catch (err) {
      logger.error(err);
      return Response.sendError(res, 500, 'Internal Server Error');
    }
  };
exports.unblockUser = async (req, res) => {
    try {
        const authId = req.auth && req.auth._id;
        const targetId = req.user && req.user._id;
        if (!authId || !targetId) return Response.sendError(res, 400, 'Invalid users');

        const result = await User.updateOne(
            { _id: authId },
            { $pull: { blockedUsers: targetId } }
        );

        // result may contain modifiedCount or nModified depending on driver/mongoose version
        const modified = (result && (result.modifiedCount || result.nModified || 0));
        if (!modified) {
            // nothing changed — still return success for idempotency
            return Response.sendResponse(res, true, 'user unblocked');
        }

        // Notify friends/followers refresh if needed
        emitFriendRequestsUpdated(authId, targetId);
        // Also notify clients to refresh these profiles immediately
        try { emitToUsers([authId, targetId], 'user-profile-updated', { userId: targetId }); } catch (e) {}

        return Response.sendResponse(res, true, 'user unblocked');
    } catch (err) {
        logger.error('unblockUser error:', err);
        return Response.sendError(res, 500, 'Internal Server Error');
    }
}

exports.updateRandomVisibility = async (req, res) => {
    try {
        const { visible } = req.body;
        const userId = req.authUser ? req.authUser._id : req.auth._id;
        logger.info(`[UserController] updateRandomVisibility: visible=${visible}, userId=${userId}`);
        
        const user = await User.findByIdAndUpdate(userId, { $set: { randomVisible: visible } }, { new: true });

        if (!user) {
            logger.warn(`[UserController] updateRandomVisibility: User not found for ID ${userId}`);
            return Response.sendError(res, 404, 'User not found');
        }

        return Response.sendResponse(res, user.publicInfo(true), 'Updated');
    } catch (error) {
        logger.error('[UserController] updateRandomVisibility error:', error);
        return Response.sendError(res, 500, 'Internal Server Error');
    }
};

exports.updateAgeVisibility = async (req, res) => {
    try {
        const { visible } = req.body;
        const userId = req.authUser ? req.authUser._id : req.auth._id;
        logger.info(`[UserController] updateAgeVisibility: visible=${visible}, userId=${userId}`);

        const user = await User.findByIdAndUpdate(userId, { $set: { ageVisible: visible } }, { new: true });

        if (!user) {
            logger.warn(`[UserController] updateAgeVisibility: User not found for ID ${userId}`);
            return Response.sendError(res, 404, 'User not found');
        }
        
        return Response.sendResponse(res, user.publicInfo(true), 'Age visibility updated');
    } catch (error) {
        logger.error('[UserController] updateAgeVisibility error:', error);
        return Response.sendError(res, 500, 'Internal server error');
    }
};

exports.updateNonFriendVideoRequests = async (req, res) => {
    try {
        const { allowed } = req.body;
        const userId = req.authUser ? req.authUser._id : req.auth._id;
        const value = !(allowed === false || allowed === 'false' || allowed === 0 || allowed === '0');
        logger.info(`[UserController] updateNonFriendVideoRequests: allowed=${value}, userId=${userId}`);

        const user = await User.findByIdAndUpdate(
            userId,
            { $set: { allowVideoRequestsFromNonFriends: value } },
            { new: true }
        );

        if (!user) {
            logger.warn(`[UserController] updateNonFriendVideoRequests: User not found for ID ${userId}`);
            return Response.sendError(res, 404, 'User not found');
        }

        try {
            realtime.emitProfileUpdate(user);
        } catch (e) {}

        return Response.sendResponse(res, user.publicInfo(true), 'Video request setting updated');
    } catch (error) {
        logger.error('[UserController] updateNonFriendVideoRequests error:', error);
        return Response.sendError(res, 500, 'Internal server error');
    }
};

exports.updatePrivacy = async (req, res) => {
    try {
        const { isPrivate } = req.body;
        const userId = req.authUser ? req.authUser._id : req.auth._id;
        logger.info(`[UserController] updatePrivacy: isPrivate=${isPrivate}, userId=${userId}`);

        const user = await User.findByIdAndUpdate(userId, { $set: { isPrivate: isPrivate } }, { new: true });

        if (!user) {
            logger.warn(`[UserController] updatePrivacy: User not found for ID ${userId}`);
            return Response.sendError(res, 404, 'User not found');
        }
        
        return Response.sendResponse(res, user.publicInfo(true), 'Privacy settings updated');
    } catch (error) {
        logger.error('[UserController] updatePrivacy error:', error);
        return Response.sendError(res, 500, 'Internal server error');
    }
};

exports.updateGenderVisibility = async (req, res) => {
    try {
        const { visible } = req.body;
        const userId = req.authUser ? req.authUser._id : req.auth._id;
        logger.info(`[UserController] updateGenderVisibility: visible=${visible}, userId=${userId}`);

        const user = await User.findByIdAndUpdate(userId, { $set: { genderVisible: visible } }, { new: true });

        if (!user) {
            logger.warn(`[UserController] updateGenderVisibility: User not found for ID ${userId}`);
            return Response.sendError(res, 404, 'User not found');
        }
        
        return Response.sendResponse(res, user.publicInfo(true), 'Gender visibility updated');
    } catch (error) {
        consoleee.error('[UserController] updateGenderVisibility error:', error);
        return Response.sendError(res, 500, 'Internal server error');
    }
};

fileExtension = (fileName) => {
    nameParts = fileName.split('.')
    return nameParts[nameParts.length - 1]
}

exports.profileVisited = async(req, res) => {
    try {
        const authUser = req.authUser;
        if (!authUser) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        console.log('AuthUser before update:', authUser); // Log authUser before update
        console.log('before Avatar URLs:', authUser.avatar);
        console.log('before Main Avatar URL:', authUser.mainAvatar);

        authUser.visitProfile = true;
        await authUser.save();
        console.log('AuthUser after update:', authUser); // Log updated authUser
        console.log('after  Avatar URLs:', authUser.avatar);
        console.log('after Main Avatar URL:', authUser.mainAvatar);

        // Add headers to prevent caching
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        res.set('Surrogate-Control', 'no-store');

        return res.status(200).json({ message: 'Profile visited' });
    } catch (error) {
        console.error('Error visiting profile:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}
