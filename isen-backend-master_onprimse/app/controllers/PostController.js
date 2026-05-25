const e = require("express");
const mongoose = require("mongoose");
const { report, extractDashParams, sendNotification, realtime, normalizeLeanDoc } = require("../helpers");
const Channel = require("../models/Channel");
const Comment = require("../models/Comment");
const Follow = require("../models/Follow");
const Post = require("../models/Post");
const Activity = require('../models/Activity');
const Report = require("../models/Report");
const User = require("../models/User");
const Product = require("../models/Product");
const Job = require("../models/Job");
const Service = require("../models/Service");
const { destroyComment } = require("./CommentController");
const Response = require("./Response");
const { generateAnonymName, withVotesInfo } = require(".././nameGenerator")
const logger = require('../utils/logger');

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


const multer = require('multer');

// Define storage for the uploaded files
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Set your upload directory here
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname); // Set the file name dynamically
    }
});

// Create an upload instance with the storage settings
const upload = multer({ storage: storage });




exports.reportPost = async (req, res) => {
    try {
        const post = req.post;

        // Log the request body to verify `reportType`
        console.log('Request body:', req.body);

        // Call the `report` function
        const reportInstance = await report(req, res, 'Post', post._id);
        if (!reportInstance || res.headersSent) return;

        // Update the post with the new report
        await Post.updateOne({ _id: post._id }, { $push: { reports: reportInstance._id } });

        return Response.sendResponse(res, null, 'Thank you for reporting');
    } catch (error) {
        console.error('Error reporting post:', error);
        if (!res.headersSent) {
            return Response.sendError(res, 500, 'Server error, please try again later');
        }
    }
};

exports.allPosts = async (req, res) => {
    try {
        // Extract parameters for filtering, sorting, and pagination
        const { filter, sort, skip, limit } = extractDashParams(req, ['text', 'channel', 'user', 'visibility']);

        // First, count the total number of posts matching the filter
        const totalPostsCount = await Post.countDocuments(filter);

        // Fetch all posts with full admin control, including anonymous information
        const posts = await Post.aggregate([
            { $match: filter },  // Apply filter from query params
            {
                $lookup: {
                    from: 'users',
                    localField: 'user',
                    foreignField: '_id',
                    as: 'userDetails'
                }
            },
            {
                $unwind: '$userDetails'  // Unwind the userDetails array
            },
            {
                $project: {
                    _id: 1,
                    text: 1,
                    media: 1,
                    visibility: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    anonymName: 1,
                    user: '$userDetails._id',
                    userStatus: {
                        $cond: {
                            if: { $eq: ["$userDetails.enabled", false] },
                            then: "Inactive",
                            else: {
                                $cond: {
                                    if: { $eq: ["$userDetails.banned", true] },
                                    then: "Banned",
                                    else: "Active"
                                }
                            }
                        }
                    },
                    realName: {
                        $cond: {
                            if: { $eq: ['$anonymName', null] },
                            then: {
                                $concat: [
                                    { $ifNull: ['$userDetails.firstName', ''] }, 
                                    ' ', 
                                    { $ifNull: ['$userDetails.lastName', ''] }
                                ]
                            },
                            else: '$anonymName'
                        }
                    },  // Show real name if not anonymous, otherwise show anonymous name
                    comments: { $size: { $ifNull: ['$comments', []] } },
                    reports: { $size: { $ifNull: ['$reports', []] } },
                    channel: 1,
                }
            },
            { $sort: sort },  // Apply sorting based on query params
            { $skip: skip },  // Apply pagination
            { $limit: limit }  // Limit the number of posts returned
        ]);

        // Return the response to the admin with full control over the posts
        return Response.sendResponse(res, {
            docs: posts,
            totalPages: Math.ceil(totalPostsCount / limit),
            currentPage: skip / limit + 1
        });
    } catch (err) {
        console.error('Error fetching posts for admin:', err);
        return Response.sendError(res, 500, 'Server error, please try again later.');
    }
};






exports.channelPosts = async (req, res) => {
    try{
        const channel = req.channel
        const dashParams = extractDashParams(req, ['text'])
        const posts = await Post.aggregate()
        .match({
            channel: channel._id,
            ...dashParams.filter
        })
        .project({
            _id: 1,
            text: 1,
            user: 1,
            channel: 1,
            reports: 1,
            backgroundColor: 1,
            color: 1,
            anonyme: 1,
            anonymName: 1,
            media: 1,
            eventDate: 1,
            eventLocation: 1,
            eventTime: 1,
            relationshipGoals: 1,
            ageRange: 1,
            interests: 1,
            hintAboutMe: 1,
            createdAt: 1,
            votes: 1,
            comments: {
                $size: "$comments"
            }
        })
        .sort(dashParams.sort)
        .skip(dashParams.skip)
        .limit(dashParams.limit)
        .exec();

    if (!posts) return Response.sendError(res, 500, 'Server error, please try again later');
    
    const count = await Post.find({
        channel: channel._id,
        ...dashParams.filter
    }).countDocuments();
    
    return Response.sendResponse(res, {
        docs: posts,
        totalPages: Math.ceil(count / dashParams.limit)
    });
} catch (err) {
    console.log(err);
    return Response.sendError(res, 500, 'Server error');
}
}

exports.getFeed = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.auth._id);
        const friendIds = (req.authUser.friends || []).map(f => {
            try { return new mongoose.Types.ObjectId((f && f._id) ? f._id : f); } catch (e) { return f; }
        });

        // 1. Get followed channels
        const followedChannels = await Channel.find({ followers: userId }).select('_id');
        const channelIds = followedChannels.map(c => c._id);

        // 2. Get followed users (include follow timestamp so we can show only posts/comments after the follow time)
        const following = await Follow.find({ follower: userId, status: 'active' }).select('followed createdAt');
        
        // build entries with id and follow timestamp
        const followedEntries = following.map(f => {
            let fid = null;
            try { fid = new mongoose.Types.ObjectId((f.followed && f.followed._id) ? f.followed._id : f.followed); } catch (e) { fid = f.followed; }
            return { id: fid, since: f.createdAt || null };
        });

        const followedUserIds = followedEntries.map(e => e.id);

        const dashParams = extractDashParams(req, ['text']);
        const limit = dashParams.limit || 20;
        const skip = dashParams.skip || 0;

        // 2.5 Get blocked users (both ways)
        const blockedByMe = (req.authUser.blockedUsers || []).map(b => {
            try { return new mongoose.Types.ObjectId((b && b._id) ? b._id : b); } catch (e) { return b; }
        });
        const blockedMe = await User.find({ blockedUsers: userId }).select('_id');
        const blockedMeIds = blockedMe.map(u => new mongoose.Types.ObjectId(u._id));
        
        // Get all disabled, soft-deleted, or banned users to exclude them from the feed
        const inactiveUsers = await User.find({ 
            $or: [
                { enabled: false },
                { isDeleted: true },
                { deletedAt: { $ne: null } },
                { banned: true }
            ] 
        }).select('_id');
        const inactiveUserIds = inactiveUsers.map(u => new mongoose.Types.ObjectId(u._id));

        const allBlockedIds = Array.from(new Set([...blockedByMe, ...blockedMeIds, ...inactiveUserIds]));

        // 3. Find posts I've commented on (to include them in feed even if not followed)
        const myComments = await Comment.find({ user: userId }).select('post');
        const postsICommentedOn = myComments.map(c => c.post);

        // 4. Fetch Posts
        // build a per-follow OR clause so we only include posts from followed users made after they were followed
        const feedCriteria = [];
        
        // Following or Friends
        followedEntries.forEach(fe => {
            if (fe.since) {
                feedCriteria.push({ $and: [{ user: fe.id }, { createdAt: { $gte: fe.since } }] });
            } else {
                feedCriteria.push({ user: fe.id });
            }
        });

        const followedSet = new Set(followedUserIds.map(id => id.toString()));
        friendIds.forEach(fid => {
            if (!followedSet.has(fid.toString())) {
                feedCriteria.push({ user: fid });
            }
        });

        // Mentioned in text
        feedCriteria.push({ text: { $regex: `@${req.authUser.firstName}`, $options: 'i' } });

        // Commented on
        if (postsICommentedOn.length > 0) {
            feedCriteria.push({ _id: { $in: postsICommentedOn } });
        }

        const postQuery = {
            moderationStatus: 'approved',
            deletedAt: null,
            user: { $nin: [...allBlockedIds, userId] }, // Exclude blocked, inactive, and self
            anonyme: { $ne: true }, // Strictly exclude anonymous posts from the feed
            $or: feedCriteria.length > 0 ? feedCriteria : [{ _id: null }] // Match nothing if no criteria
        };

        // Visibility constraints still apply unless it's a mention or my own comment? 
        // Usually, mentions/comments bypass 'friends-only' if you're the one tagged.
        const visibilityQuery = {
            $or: [
                { visibility: 'public' },
                { $and: [{ visibility: 'friends-only' }, { user: { $in: friendIds } }] },
                { text: { $regex: `@${req.authUser.firstName}`, $options: 'i' } },
                { _id: { $in: postsICommentedOn } }
            ]
        };

        const posts = await Post.find({
            $and: [postQuery, visibilityQuery]
        })
            .populate({
                path: 'user',
                select: 'firstName lastName mainAvatar avatarStyle avatarSeed avatarVariant avatarOverrides enabled isDeleted deletedAt',
                match: { enabled: { $ne: false }, isDeleted: { $ne: true }, deletedAt: null }
            })
            .populate('channel', 'name photo')
            .sort({ createdAt: -1 })
            .limit(limit + skip);

        // Filter out posts where the user was not populated (meaning they are inactive/deleted)
        const activePosts = posts.filter(p => p.user);

        // 4. Fetch Other Activities (Products, Jobs, Services, Comments)
        // filter for other activity; we'll post-filter by follow timestamp to respect per-follow start times
        const otherFilter = {
            user: { $in: [...followedUserIds, ...friendIds], $nin: allBlockedIds },
            deletedAt: null
        };

        const [products, jobs, services, comments] = await Promise.all([
            Product.find(otherFilter).populate({
                path: 'user',
                select: 'firstName lastName mainAvatar avatarStyle avatarSeed avatarVariant avatarOverrides enabled isDeleted deletedAt',
                match: { enabled: { $ne: false }, isDeleted: { $ne: true }, deletedAt: null }
            }).sort({ createdAt: -1 }).limit(limit),
            Job.find(otherFilter).populate({
                path: 'user',
                select: 'firstName lastName mainAvatar avatarStyle avatarSeed avatarVariant avatarOverrides enabled isDeleted deletedAt',
                match: { enabled: { $ne: false }, isDeleted: { $ne: true }, deletedAt: null }
            }).sort({ createdAt: -1 }).limit(limit),
            Service.find(otherFilter).populate({
                path: 'user',
                select: 'firstName lastName mainAvatar avatarStyle avatarSeed avatarVariant avatarOverrides enabled isDeleted deletedAt',
                match: { enabled: { $ne: false }, isDeleted: { $ne: true }, deletedAt: null }
            }).sort({ createdAt: -1 }).limit(limit),
            Comment.find({ ...otherFilter, moderationStatus: 'approved' }).populate({
                path: 'user',
                select: 'firstName lastName mainAvatar avatarStyle avatarSeed avatarVariant avatarOverrides enabled isDeleted deletedAt',
                match: { enabled: { $ne: false }, isDeleted: { $ne: true }, deletedAt: null }
            }).populate('post').sort({ createdAt: -1 }).limit(limit)
        ]);

        // 5. Post-process other activities: filter by follow timestamp and anonymity

        // Build a map of follow timestamps for quick checks
        const followSinceMap = new Map();
        followedEntries.forEach(fe => { if (fe.id) followSinceMap.set(String(fe.id), fe.since); });

        const filterByFollowAndAnon = item => {
            if (!item || !item.user) return false;
            if (item.anonyme) return false;
            const uid = String((item.user && item.user._id) ? item.user._id : item.user);
            const since = followSinceMap.get(uid);
            if (since && new Date(item.createdAt) < new Date(since)) return false;
            return true;
        };

        const filteredProducts = products.filter(filterByFollowAndAnon);
        const filteredJobs = jobs.filter(filterByFollowAndAnon);
        const filteredServices = services.filter(filterByFollowAndAnon);

        // 6. Combine and Map to Activity
        let activities = [];

        activePosts.forEach(p => {
            // Do not include anonymous posts in the public activity feed
            if (p.anonyme) return;
            const name = p.user ? `${p.user.firstName} ${p.user.lastName}` : 'Unknown User';
            const pw = withVotesInfo(p, userId, p._id);
            activities.push({
                ...pw,
                activityType: 'post',
                summary: `${name} shared a new post`,
                targetLink: `/tabs/channels/post/${p._id}`,
                text: makeExcerpt(p.text, 150)
            });
        });

        filteredProducts.forEach(p => {
            const name = p.user ? `${p.user.firstName} ${p.user.lastName}` : 'Unknown User';
            activities.push({
                ...p.toObject(),
                activityType: 'product',
                summary: `${name} listed a new product: ${p.label}`,
                targetLink: `/tabs/buy-and-sell/product/${p._id}`,
                text: makeExcerpt(p.description, 150)
            });
        });

        filteredJobs.forEach(j => {
            const name = j.user ? `${j.user.firstName} ${j.user.lastName}` : 'Unknown User';
            activities.push({
                ...j.toObject(),
                activityType: 'job',
                summary: `${name} posted a new job: ${j.title}`,
                targetLink: `/tabs/small-business/jobs/job/${j._id}`,
                text: makeExcerpt(j.description, 150)
            });
        });

        filteredServices.forEach(s => {
            const name = s.user ? `${s.user.firstName} ${s.user.lastName}` : 'Unknown User';
            activities.push({
                ...s.toObject(),
                activityType: 'service',
                summary: `${name} offered a new service: ${s.title}`,
                targetLink: `/tabs/small-business/services/service/${s._id}`,
                text: makeExcerpt(s.description, 150)
            });
        });

        comments.forEach(c => {
            // skip anonymous comments from appearing in the public feed
            if (c.anonyme || !c.user) return;
            if (c.post) {
                // if commenter is a followed user, ensure comment was created after follow time
                const uid = String((c.user && c.user._id) ? c.user._id : c.user);
                const since = followSinceMap.get(uid);
                if (since && new Date(c.createdAt) < new Date(since)) return;

                // Privacy Check for Comments: Only show if the post itself is visible to the requester
                const p = c.post;
                const isFriend = friendIds.some(id => String(id) === String(p.user));
                const isFollower = followedUserIds.some(id => String(id) === String(p.user));

                if (p.visibility === 'friends-only' && !isFriend) return;
                if (p.visibility === 'private' && String(p.user) !== String(userId)) return;

                const name = c.user ? `${c.user.firstName} ${c.user.lastName}` : 'Unknown User';
                activities.push({
                    ...c.toObject(),
                    activityType: 'comment',
                    summary: `${name} commented on a post`,
                    targetLink: `/tabs/channels/post/${c.post._id || c.post}?commentId=${c._id}`,
                    text: makeExcerpt(c.text, 150)
                });
            }
        });

        // Sort by createdAt
        activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Paginate
        const paginatedActivities = activities.slice(skip, skip + limit);

        return Response.sendResponse(res, {
            docs: paginatedActivities,
            total: activities.length,
            limit: limit,
            page: dashParams.page,
            totalPages: Math.ceil(activities.length / limit)
        });

    } catch (error) {
        console.error('Error getting feed:', error);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.updateVisibility = async (req, res) => {
    const { postId } = req.params;
    const { visibility } = req.body;

    if (!['public', 'private', 'friends-only'].includes(visibility)) {
        return Response.sendError(res, 400, 'Invalid visibility option');
    }

    try {
        const updatedPost = await Post.findByIdAndUpdate(postId, { visibility }, { new: true }).exec();
        if (!updatedPost) {
            return Response.sendError(res, 404, 'Could not update visibility');
        }
        return Response.sendResponse(res, updatedPost, 'Visibility updated successfully');
    } catch (err) {
        return Response.sendError(res, 500, err.message || 'Server error');
    }
};

exports.showPost = async (req, res) => {
    try {
        const post = await Post.findOne({ _id: req.post._id })
            .populate({
                path: 'comments',
                populate: {
                    path: 'user',
                    select: 'firstName lastName mainAvatar avatarStyle avatarSeed avatarVariant avatarOverrides'
                }
            })
            .populate('user', 'firstName lastName mainAvatar avatarStyle avatarSeed avatarVariant avatarOverrides enabled isDeleted banned deletedAt')
            .populate({ path: 'reports', model: 'Report' })
            .exec();

        if (!post) {
            return Response.sendError(res, 404, 'Post not found');
        }

        // Check if author is inactive
        const author = post.user;
        const requesterId = req.auth._id.toString();
        const isAdmin = req.auth && (req.auth.role === 'ADMIN' || req.auth.role === 'SUPER ADMIN');
        const isSelf = author && author._id.toString() === requesterId;

        if (author && (author.enabled === false || author.isDeleted || author.banned || author.deletedAt)) {
            if (!isAdmin && !isSelf) {
                return Response.sendError(res, 404, 'Post not found');
            }
        }

        // Check if author blocked requester or vice versa
        const authorId = author ? author._id.toString() : null;
        
        if (authorId) {
            const isBlockedByAuthor = await User.findOne({
                _id: authorId,
                blockedUsers: requesterId
            });
            
            const isBlockedByMe = req.authUser.blockedUsers && req.authUser.blockedUsers.some(id => id.toString() === authorId);

            if (isBlockedByAuthor || isBlockedByMe) {
                return Response.sendError(res, 403, 'You cannot view this post');
            }
        }

        // Visibility Check
        const isOwner = authorId === requesterId;
        const isFriend = req.authUser.friends && req.authUser.friends.some(id => id.toString() === authorId);
        const isFollower = req.authUser.following && req.authUser.following.some(id => id.toString() === authorId);

        if (!isOwner) {
            if (post.visibility === 'private') {
                return Response.sendError(res, 403, 'This post is private');
            }
            if (post.visibility === 'friends-only' && !isFriend) {
                return Response.sendError(res, 403, 'This post is for friends only');
            }
        }

        // ✅ Ensure the correct anonymous name is included in the response
        if (post.anonyme) {
            if (!post.anonymName) {
                post.anonymName = generateAnonymName(post.user, post._id);
                await post.save(); // Store it permanently
            }
        }

        const postWithVotes = withVotesInfo(post, req.auth._id, post._id);

        console.log("showPost response", postWithVotes);
        return Response.sendResponse(res, postWithVotes);

    } catch (err) {
        console.error('Error in showPost:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};





exports.showDashPost = async (req, res) => {
    try {
        // Fetch the post by its ID
        const post = await Post.findById(req.post._id)
            .populate({ path: 'reports', model: 'Report' })
            .populate({ path: 'user', select: 'firstName lastName mainAvatar avatarStyle avatarSeed avatarVariant avatarOverrides' })
            .populate({ path: 'channel', select: 'name' })
            .exec();

        // If post is not found, return an error
        if (!post) {
            return Response.sendError(res, 400, 'Post not found');
        }

        // Get comments for this post
        const comments = await Comment.find({ post: post._id })
            .populate({ path: 'user', select: 'firstName lastName mainAvatar avatarStyle avatarSeed avatarVariant avatarOverrides' })
            .limit(50);

        // Add vote information to the post
        const postWithVotes = withVotesInfo(post, req.auth._id);

        // Return the post with the additional vote information and comments
        return Response.sendResponse(res, {
            post: postWithVotes,
            comments: comments,
            counts: {
                reports: post.reports ? post.reports.length : 0,
                comments: comments.length
            }
        });

    } catch (err) {
        // Log the error and return a server error response
        console.error(err);
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.storePost = async (req, res) => {

    console.log('we are in storepost');

    try {
        // Process media upload first (use multer's single file upload)
        upload.single('media')(req, res, async function (err) {
            if (err) {
                console.error('Multer Error:', err);  // Handle multer errors
                return Response.sendError(res, 400, 'Error uploading media');
            }

            console.log('Multer processed request successfully');
            console.log('Request Body:', req.body);  // Log the text and anonymity status
            console.log('Uploaded File:', req.file);  // Log the file info if any
            console.log('Request headers:', req.headers);
            console.log('Content-Type:', req.get('content-type'));

            // Validate that text field is present
            if (!req.body.text || req.body.text.trim() === '') {
                logger.warn('Post creation failed: text field is missing or empty', {
                    body: req.body,
                    hasFile: !!req.file,
                    contentType: req.get('content-type')
                });
                return Response.sendError(res, 400, 'Post text is required. Please make sure you are sending the "text" field in your FormData.');
            }

            // Create a new post
            const post = new Post({
                ...req.body,
                channel: req.channel._id,
                user: req.auth._id,
                anonymName: req.body.anonyme ? generateAnonymName() : null,  // Generate anonymName if anonyme is true
                moderationStatus: req.body.moderationStatus || 'approved'
            });
            if (req.body.eventDate) {
                post.eventDate = req.body.eventDate;
            }
            if (req.body.eventLocation) {
                post.eventLocation = req.body.eventLocation;
            }
            if (req.body.eventTime) {
                post.eventTime = req.body.eventTime;
            }

            // Dating-specific fields
            if (req.body.relationshipGoals) {
                post.relationshipGoals = req.body.relationshipGoals;
            }
            if (req.body.ageRangeMin || req.body.ageRangeMax) {
                post.ageRange = {
                    min: req.body.ageRangeMin,
                    max: req.body.ageRangeMax
                };
            }
            if (req.body.interests) {
                post.interests = req.body.interests.split(',').map(interest => interest.trim());
            }
            if (req.body.hintAboutMe) {
                post.hintAboutMe = req.body.hintAboutMe;
            }
            
            // If media is uploaded, attach it to the post
            if (req.file) {
                post.media = {
                    url: req.file.path, // Store the file path
                    expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000) // Set a 24-hour expiry for the media
                };
                console.log('Media attached to post:', post.media);
            }

            console.log('Saving Post:', post);

            // Save the post to the database
            const savedPost = await post.save();
            console.log('Saved Post:', savedPost);

            // Populate the user details immediately after saving
            const populatedPost = await Post.populate(savedPost, { 
                path: 'user', 
                select: 'firstName lastName mainAvatar avatarStyle avatarSeed avatarVariant avatarOverrides' 
            });
            console.log('Populated Post:', populatedPost);

            if (!populatedPost) {
                return Response.sendError(res, 400, 'Error populating post data');
            }

            // Add votes info to the post
            const processedPost = withVotesInfo(populatedPost, req.auth._id, savedPost._id);
            console.log('Post with Votes Info:', processedPost);

            // Send notifications and create Activity only for non-anonymous posts
            if (!populatedPost.anonyme) {
                const notificationTitle = `${req.authUser.firstName} ${req.authUser.lastName}`;
                const notificationBody = `shared a new post in ${req.channel.name}`;

                let recipients = [];
                if (post.visibility === 'public') {
                    recipients = [...(req.authUser.followers || []), ...(req.authUser.friends || [])];
                } else if (post.visibility === 'friends-only') {
                    recipients = [...(req.authUser.friends || [])];
                }

                // Filter out duplicates and the author
                recipients = [...new Set(recipients.map(id => id.toString()))].filter(id => id !== req.auth._id.toString());

                if (recipients.length > 0) {
                    sendNotification(
                        { en: notificationTitle },
                        { en: notificationBody },
                        {
                            type: 'followed_user_posted',
                            link: `/tabs/channels/post/${populatedPost._id}`
                        },
                        [],
                        recipients
                    );
                }

                // Create an Activity record for this post (non-blocking)
                try {
                    const activity = await Activity.create({
                        type: 'post',
                        actor: req.auth._id,
                        targetType: 'post',
                        targetId: savedPost._id,
                        channel: req.channel._id,
                        content: makeExcerpt(savedPost.text || '', 150),
                        visibility: savedPost.visibility,
                        meta: { media: savedPost.media }
                    });

                    // --- Mentions Handling ---
                    const mentionRegex = /@([\w\s._-]+?)(?=\s|$|@)/g;
                    let match;
                    const mentionedUsers = new Set();
                    if (savedPost.text) {
                        while ((match = mentionRegex.exec(savedPost.text)) !== null) {
                            const name = match[1].trim();
                            const user = await User.findOne({ firstName: new RegExp(`^${name}$`, 'i') });
                            if (user && user._id.toString() !== req.auth._id.toString()) {
                                mentionedUsers.add(user._id.toString());
                            } else {
                                // Try first name + last name match if name has space
                                if (name.includes(' ')) {
                                    const parts = name.split(' ');
                                    const complexUser = await User.findOne({ 
                                        firstName: new RegExp(`^${parts[0]}$`, 'i'),
                                        lastName: new RegExp(`^${parts.slice(1).join(' ')}$`, 'i')
                                    });
                                    if (complexUser && complexUser._id.toString() !== req.auth._id.toString()) {
                                        mentionedUsers.add(complexUser._id.toString());
                                    }
                                }
                            }
                        }
                    }
                    
                    const { createNotification } = require('../helpers');
                    for (const userId of mentionedUsers) {
                        await createNotification({
                            recipientId: userId,
                            senderId: req.auth._id,
                            type: 'mention_post',
                            title: 'You were mentioned',
                            body: `${req.authUser.firstName} mentioned you in a post`,
                            data: { postId: savedPost._id, link: `/tabs/channels/post/${savedPost._id}` }
                        });
                        // 🔔 REAL-TIME: Immediate mention propagation — include sender name in payload
                        try {
                            const payload = JSON.stringify({ senderName: `${req.authUser.firstName} ${req.authUser.lastName}`, text: savedPost.text, anonymName: populatedPost.anonyme ? populatedPost.anonymName : null });
                            realtime.emitMention(userId, 'post', savedPost._id, payload);
                        } catch (e) { logger.warn('emitMention failed', e); }
                    }

                    // 🔥 REAL-TIME: Emit targeted feed activity
                    try { 
                        // Use the same refined recipients list as notifications
                        realtime.emitFeedPost(recipients, savedPost);
                        
                        // Emit activity to followers
                        const activityPayload = { ...activity.toObject(), type: activity.type };
                        const { emitToUsers } = require('../helpers');
                        emitToUsers(recipients, 'activity:created', activityPayload);
                    } catch(e) { console.warn('emit activity failed', e); }
                } catch (e) {
                    console.warn('Failed to create activity record:', e.message || e);
                }
            } else {
                // Anonymous post: create an owner-only activity (private) so the author can see it,
                // but do NOT notify followers or emit to the general activity stream.
                try {
                    const activity = await Activity.create({
                        type: 'post',
                        actor: req.auth._id,
                        targetType: 'post',
                        targetId: savedPost._id,
                        channel: req.channel._id,
                        content: makeExcerpt(savedPost.text || '', 150),
                        visibility: 'private',
                        meta: { media: savedPost.media, anonyme: true }
                    });
                    // Do not emit to followers. Optionally, emit only to the actor's personal socket room if implemented.
                } catch (e) {
                    console.warn('Failed to create private activity for anonymous post:', e.message || e);
                }
            }

                        // 🔥 PERFORMANCE: Respond immediately
                        return Response.sendResponse(res, processedPost, 'Post created');
        });
    } catch (err) {
        logger.error('Error in storePost:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.getPosts = async (req, res) => {
    try {
        const { channelId } = req.params;
        const { page = 0 } = req.query;
        const limit = 10;
        const userId = req.auth._id;

        // 1. Optimized Exclusion List (API Efficiency)
        // Combine multiple queries into a single focused lookup
        const excludedUsersRaw = await User.find({
            $or: [
                { blockedUsers: userId },            // People who blocked me
                { _id: { $in: req.authUser.blockedUsers || [] } }, // People I blocked
                { enabled: false },
                { isDeleted: true },
                { banned: true }
            ]
        }).select('_id').lean();
        
        // Normalize ObjectIds to strings
        const allExcludedIds = excludedUsersRaw.map(u => String(u._id));
        const friendIds = (req.authUser.friends || []).map(id => String(id));

        const visibilityQuery = {
            channel: channelId,
            moderationStatus: 'approved',
            deletedAt: null,
            user: { $nin: allExcludedIds },
            $or: [
                { user: userId }, // Always allow owner to see their own post
                { visibility: 'public' },
                { visibility: 'friends-only', user: { $in: friendIds } }
            ]
        };

        // 2. High-Throughput Fetch (Database Access)
        // Removed heavy 'comments' populate for feed performance. 
        // Feed only needs counts (handled below via projection/processing).
        let posts = await Post.find(visibilityQuery)
            .select('-reports -__v') // Explicit projection: exclude unwanted heavy fields
            .populate('user', '_id firstName lastName mainAvatar avatarStyle avatarSeed avatarVariant avatarOverrides')
            .sort({ createdAt: -1 })
            .skip(page * limit)
            .limit(limit)
            .lean() // Drastically faster than full Mongoose documents
            .exec();

        if (!posts) {
            return Response.sendError(res, 400, 'Could not get the posts');
        }

        // Normalize all ObjectIds to strings to prevent buffer serialization
        posts = normalizeLeanDoc(posts);

        // Filter out posts with missing users (due to deleted/invalid user references)
        // This prevents frontend errors when posts reference non-existent users
        const validPosts = posts.filter(post => {
            if (!post.user && !post.anonyme) {
                logger.warn('Filtering out post with missing user:', {
                    postId: post._id,
                    text: post.text?.substring(0, 50)
                });
                return false;
            }
            return true;
        });

        logger.info(`Posts filtered: ${posts.length} -> ${validPosts.length} (removed ${posts.length - validPosts.length} posts with missing users)`);

        // 3. Lean Post Processing
        const postsWithVotes = validPosts.map(post => {
            if (post.anonyme && !post.anonymName) {
                setImmediate(async () => {
                    const name = generateAnonymName(post.user, post._id);
                    await Post.updateOne({ _id: post._id }, { $set: { anonymName: name } });
                });
                post.anonymName = 'User'; // Immediate fallback string
            }

            const pw = withVotesInfo(post, userId, post._id);
            const ex = makeExcerpt(post.text, 150);
            pw.excerpt = ex;
            // Keep full text for frontend, send excerpt separately
            // Frontend can decide whether to show excerpt or full text
            
            // Add comment count manually if not in projection
            pw.commentCount = post.comments ? post.comments.length : 0;
            delete pw.comments; // Remove the full array to keep payload lean
            
            return pw;
        });

        // 4. Counts & Response
        const count = await Post.countDocuments(visibilityQuery).exec();

        return Response.sendResponse(res, {
            posts: postsWithVotes,
            more: (count - (limit * (parseInt(page) + 1))) > 0
        });
    } catch (err) {
        logger.error('getPosts critical error:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.voteOnPost = async (req, res) => {
    try {
        const postId = req.post._id;
        const userId = req.auth._id;
        const { vote } = req.body;

        // 1. Atomic State Commit (API Hardening)
        // Check if user already voted to determine push vs pull vs update
        const post = await Post.findById(postId).select('votes user channel text anonyme');
        if (!post) return Response.sendError(res, 404, 'Post not found');

        const existingVote = post.votes.find(v => v.user.toString() === userId.toString());
        let updatedPost;

        if (existingVote) {
            if (existingVote.vote !== vote) {
                // Change vote: Remove old one
                updatedPost = await Post.findOneAndUpdate(
                    { _id: postId },
                    { $pull: { votes: { user: userId } } },
                    { new: true, lean: true }
                );
            } else {
                // Same vote: No-op based on existing legacy logic
                const pw = withVotesInfo(post.toObject(), userId, postId);
                return Response.sendResponse(res, {
                    votes: pw.votes,
                    voted: pw.voted
                });
            }
        } else {
            // New vote: Push
            updatedPost = await Post.findOneAndUpdate(
                { _id: postId },
                { $push: { votes: { user: userId, vote } } },
                { new: true, lean: true }
            );
        }

        const postWithVotes = withVotesInfo(updatedPost, userId, postId);

        // 2. Background Tasks (Non-blocking Socket & Activity)
        setImmediate(async () => {
            try {
                if (!existingVote) {
                    // 🔥 REAL-TIME: Immediate propagation
                    realtime.emitPostInteraction(postId, post.user, userId, 'like');

                    // Secondary Writes (Activity Log)
                    Activity.create({
                        type: 'like',
                        actor: userId,
                        targetType: 'post',
                        targetId: postId,
                        channel: post.channel,
                        content: post.text ? (post.text.length > 100 ? post.text.substring(0, 97) + '...' : post.text) : 'Liked a post',
                        visibility: 'private'
                    }).catch(e => logger.warn('Background activity creation failed', e));

                    // Notifications
                    if (String(post.user) !== String(userId)) {
                        let channel = await Channel.findById(post.channel).select('name').lean();
                        if (channel) {
                            // Normalize ObjectIds to strings
                            channel = normalizeLeanDoc(channel);
                            
                            sendNotification(
                                { en: channel.name },
                                { en: (post.anonyme ? 'Anonym' : req.authUser.firstName + ' ' + req.authUser.lastName) + ' has voted on your post' },
                                {
                                    type: 'vote-channel-post',
                                    link: '/tabs/channels/post/' + postId
                                },
                                [],
                                [post.user]
                            );
                        }
                    }
                }
            } catch (bgErr) {
                logger.error('Background vote processing error:', bgErr);
            }
        });

        // 3. Lean Response (API Efficiency)
        return Response.sendResponse(res, {
            votes: postWithVotes.votes,
            voted: postWithVotes.voted
        }, 'voted');
    } catch (err) {
        logger.error('voteOnPost critical error:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.deletePost = (req, res) => {
    try {
        const post = req.post
        this.destroyPost(res, post._id, (res) => Response.sendResponse(res, null, 'post removed'))
        
    } catch (error) {
        console.log(error);
    }
}

exports.destroyPost = async (res, postId, callback) => {
    try {
        // Find related comments first
        const comments = await Comment.find({ post: postId });
        
        // Delete the post
        await Post.deleteOne({ _id: postId });
        
        // Delete related reports for the post
        await Report.deleteMany({ "entity.id": postId, "entity.name": 'post' });
        
        // Delete reports for comments
        if (comments.length > 0) {
            await Report.deleteMany({ "entity.id": { $in: comments.map(comment => comment._id) }, "entity.name": 'comment' });
        }

        // Delete related comments
        for (const comment of comments) {
            await exports.destroyComment(res, comment._id);
        }

        // If a callback is provided, call it after everything is deleted
        if (callback) {
            return callback(res);
        }

        return Response.sendResponse(res, null, 'Post and related data deleted successfully');

    } catch (err) {
        console.error('Error deleting post and related data:', err);
        if (!res.headersSent) {
            return Response.sendError(res, 500, 'Error deleting post');
        }
    }
};

