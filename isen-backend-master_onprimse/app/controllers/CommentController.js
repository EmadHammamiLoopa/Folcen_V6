const { report, extractDashParams, sendNotification, emitToUser } = require("../helpers")
const User = require("../models/User")
const Channel = require("../models/Channel")
const Post = require("../models/Post")
const Comment = require("../models/Comment")
const Report = require("../models/Report")
const Activity = require('../models/Activity');
const Response = require("./Response")
const { generateAnonymName, withVotesInfo } = require(".././nameGenerator")

// excerpt helper
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


exports.showComment = async (req, res) => {
    try {
        // Find the comment by ID
        const comment = await Comment.findOne({ _id: req.comment._id }).populate('reports');;
        console.log('responseData in comment:', comment);

        if (!comment) {
            return Response.sendError(res, 400, 'Comment not found');
        }

        // Convert Mongoose document to plain object for modification
        let responseData = comment.toObject();
        console.log('responseData in responseData:', responseData);

        // 🛡️ Privacy Guard: Strip user info if anonymous
        if (responseData.anonyme) {
            delete responseData.user;
            if (!responseData.anonymName && comment.user && comment.post) {
                responseData.anonymName = generateAnonymName(comment.user._id || comment.user, comment.post._id || comment.post);
            }
        }

        // Check if media is attached and format URL if present
        if (comment.media && comment.media.url) {
            responseData.mediaUrl = `http://127.0.0.1:3300/${comment.media.url.replace(/\\/g, '/')}`; // Set mediaUrl field with formatted URL
            responseData.mediaExpiryDate = comment.media.expiryDate; // Set mediaExpiryDate field with expiry date
        } else {
            // No media attached
            responseData.mediaUrl = null;
            responseData.mediaExpiryDate = null;
        }

        // Remove the original media field (optional)
        delete responseData.media;

        // Return the full comment with media details (mediaUrl and mediaExpiryDate)
        return Response.sendResponse(res, responseData);
    } catch (err) {
        console.error('Error in showComment:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.showDashComment = async (req, res) => {
    try {
        const comment = await Comment.findById(req.comment._id)
            .populate('user', 'firstName lastName email mainAvatar avatarStyle avatarSeed avatarVariant avatarOverrides')
            .populate('post', 'title text')
            .populate({
                path: 'reports',
                populate: { path: 'userId', select: 'firstName lastName email' }
            });

        if (!comment) {
            return Response.sendError(res, 404, 'Comment not found');
        }

        return Response.sendResponse(res, comment);
    } catch (err) {
        console.error('Error in showDashComment:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.showCommentEditDash = async (req, res) => {
    try {
        const comment = await Comment.findById(req.comment._id).lean();
        if (!comment) return Response.sendError(res, 404, 'Comment not found');
        
        // Ensure ID is present for the form
        comment.id = comment._id.toString();
        
        return Response.sendResponse(res, comment);
    } catch (err) {
        console.error('Error in showCommentEditDash:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.updateComment = async (req, res) => {
    try {
        const comment = await Comment.findByIdAndUpdate(req.comment._id, req.body, { new: true });
        if (!comment) return Response.sendError(res, 404, 'Comment not found');
        return Response.sendResponse(res, comment, 'Comment updated successfully');
    } catch (err) {
        console.error('Error in updateComment:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};



exports.reportComment = async (req, res) => {
    try {
        const comment = req.comment;

        // Report the comment and return the full report details
        const reportData = await report(req, res, 'Comment', comment._id);
        if (!reportData || res.headersSent) return;

        await Comment.updateOne({ _id: comment._id }, { $push: { reports: reportData._id } });

        return Response.sendResponse(res, null, 'Thank you for reporting');
    } catch (error) {
        console.error('Error in reportComment:', error);
        if (!res.headersSent) {
            return Response.sendError(res, 500, 'Server error');
        }
    }
};


exports.postComments = async (req, res) => {
    try {
        const post = req.post;
        const dashParams = extractDashParams(req, ['text']);
        
        const comments = await Comment.aggregate()
            .match({ post: post._id, ...dashParams.filter })
            .project({
                _id: 1,
                text: 1,
                user: 1,
                post: 1,
                reports: 1 // Include full report details
            })
            .sort(dashParams.sort)
            .skip(dashParams.skip)
            .limit(dashParams.limit)
            .exec();

        if (!comments) return Response.sendError(res, 500, 'Server error, please try again later');

        const count = await Comment.find({ post: post._id, ...dashParams.filter }).countDocuments();

        return Response.sendResponse(res, {
            docs: comments,
            totalPages: Math.ceil(count / dashParams.limit)
        });
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error');
    }
};




exports.storeComment = async (req, res) => {
    try {
        upload.single('media')(req, res, async function (err) {
            try {
                if (err) {
                    console.error('Multer Error:', err);
                    return Response.sendError(res, 400, 'Error uploading media');
                }

                console.log('Multer processed request successfully');
                console.log('Request Body:', req.body);
                console.log('Uploaded File:', req.file);

                const post = req.post;
                const authorId = post.user.toString();
                const commenterId = req.auth._id.toString();

                const isBlockedByAuthor = await User.findOne({
                    _id: authorId,
                    blockedUsers: commenterId
                });
                
                const isBlockedByMe = req.authUser.blockedUsers && req.authUser.blockedUsers.some(id => id.toString() === authorId);

                if (isBlockedByAuthor || isBlockedByMe) {
                    return Response.sendError(res, 403, 'You cannot comment on this post');
                }

                // Visibility Check
                const isOwner = authorId === commenterId;
                const isFriend = req.authUser.friends && req.authUser.friends.some(id => id.toString() === authorId);

                if (!isOwner) {
                    if (post.visibility === 'private') {
                        return Response.sendError(res, 403, 'This post is private');
                    }
                    if (post.visibility === 'friends-only' && !isFriend) {
                        return Response.sendError(res, 403, 'This post is for friends only');
                    }
                }

                const commentText = req.body.text ? req.body.text.trim() : '';
                
                if (!commentText && !req.file) {
                    return Response.sendError(res, 400, 'Comment text or media is required');
                }

                let anonymName = null;

                if (req.body.anonyme === 'true') {
                    // Ensure that the user always gets the same anonymous name from the post
                    if (!post.anonymName) {
                        post.anonymName = generateAnonymName(req.auth._id, post._id);
                        await post.save();  // Ensure consistency across all comments
                    }
                    anonymName = post.anonymName;
                    console.log('Using post anonymName:', anonymName);
                }

                // Create a new comment
                const comment = new Comment({
                    text: commentText,
                    user: req.auth._id,
                    post: post._id,
                    anonymName: anonymName, // Use the same anonymous name as the post
                    anonyme: req.body.anonyme === 'true',
                    moderationStatus: req.body.moderationStatus || 'approved'
                });

                // If media is uploaded, attach it to the comment
                if (req.file) {
                    comment.media = {
                        url: req.file.path,
                        expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
                    };
                    console.log('Media attached to comment:', comment.media);
                }

                console.log('Saving Comment:', comment);
                const savedComment = await comment.save();
                console.log('Saved Comment:', savedComment);

                // Populate the user details immediately after saving
                const populatedComment = await Comment.populate(savedComment, { 
                    path: 'user', 
                    select: 'firstName lastName mainAvatar avatarStyle avatarSeed avatarVariant avatarOverrides' 
                });
                console.log('Populated Comment:', populatedComment);

                if (!populatedComment) {
                    return Response.sendError(res, 400, 'Error populating comment data');
                }

                // Add votes info to the comment
                const commentWithVotes = withVotesInfo(populatedComment, req.auth._id, post._id);
                console.log('Comment with Votes Info:', commentWithVotes);

                // Push the new comment into the post's comment list
                post.comments.push(commentWithVotes._id);
                await post.save();
                console.log('Updated Post with New Comment:', post);

                // Create an Activity record for this comment. For anonymous comments, create a private activity
                // so the comment author can see it, but do not notify followers or emit to the general feed.
                try {
                    if (!comment.anonyme) {
                        const activity = await Activity.create({
                            type: 'comment',
                            actor: req.auth._id,
                            targetType: 'post',
                            targetId: post._id,
                            channel: post.channel,
                            content: makeExcerpt ? makeExcerpt(commentText || commentWithVotes.text, 150) : (commentText || commentWithVotes.text),
                            visibility: post.visibility,
                            meta: { commentId: commentWithVotes._id }
                        });
                        try { const io = req.app && req.app.get('io'); if (io) io.emit('activity:created', activity); } catch (e) { console.warn('emit activity failed', e); }
                    } else {
                        // Anonymous comment: create a private activity visible only to the actor
                        try {
                            const activity = await Activity.create({
                                type: 'comment',
                                actor: req.auth._id,
                                targetType: 'post',
                                targetId: post._id,
                                channel: post.channel,
                                content: makeExcerpt ? makeExcerpt(commentText || commentWithVotes.text, 150) : (commentText || commentWithVotes.text),
                                visibility: 'private',
                                meta: { commentId: commentWithVotes._id, anonyme: true }
                            });
                            // Emit private activity only to the author so their UI updates
                            try { emitToUser(req.auth._id, 'activity:created', activity); } catch (e) {}
                        } catch (e) {
                            console.warn('Failed to create private activity for anonymous comment:', e.message || e);
                        }
                    }
                } catch (e) {
                    console.warn('Failed to create activity for comment:', e.message || e);
                }

                return Response.sendResponse(res, commentWithVotes, 'Comment created');
            } catch (innerErr) {
                console.error('Error in storeComment callback:', innerErr);
                return Response.sendError(res, 500, 'Server error');
            }
        });
    } catch (err) {
        console.log('Error in storeComment:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};




exports.voteOnComment = async (req, res) => {
    try {
        let comment = req.comment;
        const userVoteInd = comment.votes.findIndex(vote => vote.user == req.auth._id);

        if (userVoteInd != -1) {
            if (comment.votes[userVoteInd].vote != req.body.vote) {
                comment.votes.splice(userVoteInd, 1);
            }
        } else {
            comment.votes.push({ user: req.auth._id, vote: req.body.vote });
        }

        await comment.populate('post');
        await comment.save();

        // Create activity for the vote
        if (userVoteInd === -1) {
            try {
                await Activity.create({
                    type: 'like',
                    actor: req.auth._id,
                    targetType: 'comment',
                    targetId: comment.post ? (comment.post._id || comment.post) : null,
                    channel: comment.post ? comment.post.channel : null,
                    content: comment.text ? (comment.text.length > 100 ? comment.text.substring(0, 97) + '...' : comment.text) : 'Liked a comment',
                    visibility: 'private',
                    meta: { commentId: comment._id }
                });
            } catch (activityErr) {
                console.warn('Failed to create activity for comment vote:', activityErr.message);
            }
        }

        const post = await Post.findOne({ _id: comment.post });

        if (userVoteInd && comment.user != req.auth._id) {
            const channel = await Channel.findOne({ _id: post.channel });
            sendNotification(
                { en: channel.name },
                { en: (comment.anonyme ? 'Anonym' : req.authUser.firstName + ' ' + req.authUser.lastName) + ' has voted on your post' },
                { type: 'vote-channel-post', link: '/tabs/channels/post/' + post._id + '?commentId=' + comment._id },
                [],
                [comment.user]
            );
        }

        const commentWithVotes = withVotesInfo(comment, req.auth._id, comment.post._id);
        return Response.sendResponse(res, {
            votes: commentWithVotes.votes,
            voted: commentWithVotes.voted
        }, 'voted');
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.getComments = async (req, res) => {
    try {
        const limit = 8;
        const post = req.post;
        const page = parseInt(req.query.page) || 0;
        const requesterId = req.auth._id.toString();
        const authorId = post.user.toString();

        // Visibility Check (Comments inherit post visibility)
        const isOwner = authorId === requesterId;
        const isFriend = req.authUser.friends && req.authUser.friends.some(id => id.toString() === authorId);

        if (!isOwner) {
            if (post.visibility === 'private') {
                return Response.sendError(res, 403, 'Comments are private');
            }
            if (post.visibility === 'friends-only' && !isFriend) {
                return Response.sendError(res, 403, 'Comments are for friends only');
            }
        }

        // Get disabled, deleted, or banned users to hide their comments
        const disabledUsers = await User.find({ 
            $or: [
                { enabled: false },
                { isDeleted: true },
                { deletedAt: { $ne: null } },
                { banned: true }
            ]
        }).select('_id');
        const disabledUserIds = disabledUsers.map(u => u._id);

        // Find comments for the post with pagination and population
        const comments = await Comment.find({ 
            post: post._id,
            user: { $nin: disabledUserIds }
        })
            .populate('user', 'firstName lastName mainAvatar avatarStyle avatarSeed avatarVariant avatarOverrides', 'User')
            .sort({ createdAt: -1 })
            .skip(page * limit)
            .limit(limit)
            .exec();

        if (!comments) {
            return Response.sendError(res, 400, 'Failed to retrieve comments');
        }

        // Count the total number of comments (excluding disabled users)
        const count = await Comment.countDocuments({ 
            post: post._id,
            user: { $nin: disabledUserIds }
        }).exec();

        // Ensure the correct anonymous name is used for comments
        const commentsWithVotes = comments.map(comment => {
            if (comment.anonyme) {
                // ✅ If the user is the post author, force them to use the post's anonymous name
                if (comment.user.toString() === post.user.toString()) {
                    comment.anonymName = post.anonymName;
                } else {
                    // ✅ Otherwise, reuse the stored anonymName
                    comment.anonymName = comment.anonymName || post.anonymName;
                }
            }
            return withVotesInfo(comment, req.auth._id, post._id);
        });

        return Response.sendResponse(res, {
            comments: commentsWithVotes,
            more: (count - (limit * (page + 1))) > 0
        });

    } catch (err) {
        console.error('Error in getComments:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.deleteComment = (req, res) => {
    try {
        const comment = req.comment
        this.destroyComment(res, comment._id, (res) => Response.sendResponse(res, null, 'comment removed'))
    } catch (error) {
        console.log(error);
    }
}

exports.destroyComment = async (res, commentId, callback) => {
    try {
        // Delete the comment
        await Comment.deleteOne({ _id: commentId });

        // Remove any associated reports for the comment
        await Report.deleteMany({ 'entity.id': commentId, 'entity.name': 'comment' });

        // If a callback exists, call it
        if (callback) return callback(res);
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.getAllCommentsForAdmin = async (req, res) => {
    try {
        const dashParams = extractDashParams(req, ['text', 'user', 'post']);
        const limit = dashParams.limit || 20;

        const comments = await Comment.aggregate()
            .match(dashParams.filter)
            .lookup({
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                as: 'user'
            })
            .lookup({
                from: 'posts',
                localField: 'post',
                foreignField: '_id',
                as: 'post'
            })
            .lookup({
                from: 'reports',
                localField: 'reports',
                foreignField: '_id',
                as: 'reports'
            }) // Add report details
            .unwind({ path: '$user', preserveNullAndEmptyArrays: true })
            .unwind({ path: '$post', preserveNullAndEmptyArrays: true })
            .match({
                // Filter out comments from deleted users or disabled users
                user: { $ne: null },
                "user.enabled": { $ne: false }
            })
            .project({
                _id: 1,
                text: 1,
                user: {
                    _id: "$user._id",
                    firstName: "$user.firstName",
                    lastName: "$user.lastName",
                    email: "$user.email",
                    enabled: { $ifNull: ["$user.enabled", true] },
                    banned: { $ifNull: ["$user.banned", false] }
                },
                userStatus: {
                    $cond: {
                        if: { $eq: ["$user", null] },
                        then: "Deleted User",
                        else: {
                            $cond: {
                                if: { $eq: ["$user.enabled", false] },
                                then: "Inactive",
                                else: {
                                    $cond: {
                                        if: { $eq: ["$user.banned", true] },
                                        then: "Banned",
                                        else: "Active"
                                    }
                                }
                            }
                        }
                    }
                },
                post: "$post._id",
                anonyme: { $ifNull: ["$anonyme", false] },
                reportsCount: { $size: { $ifNull: ["$reports", []] } },
                mediaUrl: {
                    $cond: { if: { $ne: ["$media.url", null] }, then: { $concat: ["http://127.0.0.1:3300/", { $replaceAll: { input: "$media.url", find: "\\", replacement: "/" } }] }, else: null }
                },
                mediaExpiryDate: "$media.expiryDate",
                reports: 1, // Include full reports
                votes: 1,
                moderationStatus: 1,
                reactionCounts: 1,
                createdAt: 1,
                updatedAt: 1,
                flagged: { $gt: [{ $size: { $ifNull: ["$reports", []] } }, 0] }
            })
            .match({
                // If user is missing (deleted), we might want to filter it out if requested
                // For now, let's just ensure we don't crash and keep them visible but marked
            })
            .sort(dashParams.sort)
            .skip(dashParams.skip)
            .limit(limit)
            .exec();

        // Count total matching comments
        const countResult = await Comment.aggregate()
            .match(dashParams.filter)
            .lookup({
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                as: 'user'
            })
            .unwind({ path: '$user', preserveNullAndEmptyArrays: true })
            .count("total");

        const count = countResult.length > 0 ? countResult[0].total : 0;

        return Response.sendResponse(res, {
            docs: comments,
            totalPages: Math.ceil(count / limit),
            currentPage: dashParams.page
        });
    } catch (err) {
        console.error('Error in getAllCommentsForAdmin:', err);
        return Response.sendError(res, 500, 'Failed to retrieve comments for admin');
    }
};
