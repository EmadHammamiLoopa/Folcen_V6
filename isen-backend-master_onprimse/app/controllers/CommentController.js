const { report, extractDashParams, sendNotification, emitToUser, createNotification } = require("../helpers")
const User = require("../models/User")
const Channel = require("../models/Channel")
const Post = require("../models/Post")
const Comment = require("../models/Comment")
const Report = require("../models/Report")
const { dismissEntityReports, resolveEntityReports } = require('../utils/reportModeration');
const Activity = require('../models/Activity');
const Response = require("./Response")
const { removeManagedMedia } = require('../utils/contentMediaLifecycle');
const { generateAnonymName, withVotesInfo } = require(".././nameGenerator")
const logger = require('../utils/logger');
const mongoose = require('mongoose');
const mediaStore = require('../utils/mediaStore');

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

const publicUploadUrl = (file) => {
    if (!file) return '';
    if (file.filename) return `/uploads/${file.filename}`;
    const raw = String(file.path || '').replace(/\\/g, '/');
    const idx = raw.lastIndexOf('/uploads/');
    if (idx >= 0) return raw.slice(idx);
    if (raw.startsWith('uploads/')) return `/${raw}`;
    return raw;
};

const visibleCommentContentQuery = () => ({
    $or: [
        { text: { $regex: /\S/ } },
        {
            $and: [
                {
                    'media.url': {
                        $exists: true,
                        $regex: /\S/,
                        $nin: ['', null, 'undefined', 'null', '[object Object]']
                    }
                },
                {
                    $or: [
                        { 'media.expiryDate': { $exists: false } },
                        { 'media.expiryDate': null },
                        { 'media.expiryDate': { $gt: new Date() } }
                    ]
                }
            ]
        }
    ]
});


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

        // Expiry is an access boundary. Suppress the URL immediately
        // even if the physical cleanup sweep has not run yet.
        const mediaIsActive =
            comment.media &&
            comment.media.url &&
            (
                !comment.media.expiryDate ||
                new Date(comment.media.expiryDate).getTime() > Date.now()
            );

        if (mediaIsActive) {
            responseData.mediaUrl = `http://127.0.0.1:3300/${comment.media.url.replace(/\\/g, '/')}`;
            responseData.mediaExpiryDate = comment.media.expiryDate;
        } else {
            responseData.mediaUrl = null;
            responseData.mediaExpiryDate =
                comment.media && comment.media.expiryDate
                    ? comment.media.expiryDate
                    : null;
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
                populate: { path: 'reporter', select: 'firstName lastName email' }
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
        console.error('getComments error:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};

exports.getComments = async (req, res) => {
    try {
        const { postId } = req.params;
        const { page = 0 } = req.query;
        const limit = 20;

        const comments = await Comment.find({ post: postId, parentComment: null })
            .select('-reports -__v')
            .populate('user', 'firstName lastName mainAvatar avatarStyle avatarSeed avatarVariant avatarOverrides')
            .sort({ createdAt: -1 })
            .skip(page * limit)
            .limit(limit)
            .lean();

        return Response.sendResponse(res, comments);
    } catch (err) {
        logger.error('getComments critical error:', err);
        return Response.sendError(res, 500, 'Server error');
    }
}




exports.storeComment = async (req, res) => {
    try {
        upload.single('media')(req, res, async function (err) {
            try {
                if (err) {
                    console.error('Multer Error:', err);
                    return Response.sendError(res, 400, 'Error uploading media');
                }

                const post = req.post;
                const authorId = post.user.toString();
                const commenterId = req.auth._id.toString();

                // Block checks
                const isOwner = authorId === commenterId;
                const isBlockedByAuthor = isOwner
                    ? null
                    : await User.findOne({
                        _id: authorId,
                        blockedUsers: commenterId
                    });

                const isBlockedByMe =
                    !isOwner &&
                    req.authUser.blockedUsers &&
                    req.authUser.blockedUsers.some(
                        id => id.toString() === authorId
                    );

                if (isBlockedByAuthor || isBlockedByMe) {
                    return Response.sendError(
                        res,
                        403,
                        'You cannot comment on this post'
                    );
                }

                // Visibility Check
                const isFriend = req.authUser.friends && req.authUser.friends.some(id => id.toString() === authorId);
                if (!isOwner) {
                    if (post.visibility === 'private') return Response.sendError(res, 403, 'This post is private');
                    if (post.visibility === 'friends-only' && !isFriend) return Response.sendError(res, 403, 'This post is for friends only');
                }

                const commentText = req.body.text ? req.body.text.trim() : '';
                if (!commentText && !req.file) return Response.sendError(res, 400, 'Comment text or media is required');

                // Prepare anonym name if requested
                let anonymName = null;
                const isAnon = req.body.anonyme === 'true';
                if (isAnon) {
                    if (!post.anonymName) {
                        post.anonymName = generateAnonymName(req.auth._id, post._id);
                        await post.save();
                    }
                    anonymName = post.anonymName;
                }

                // Create & save comment
                const comment = new Comment({
                    text: commentText,
                    user: req.auth._id,
                    post: post._id,
                    parentComment: req.body.parentComment || null,
                    anonymName: anonymName,
                    anonyme: isAnon,
                    moderationStatus: req.body.moderationStatus || 'approved'
                });

                if (req.file) {
                    const mediaUrl = publicUploadUrl(req.file);
                    try {
                        await mediaStore.saveFile({
                            filePath: req.file.path,
                            publicPath: mediaUrl,
                            contentType: req.file.mimetype,
                            metadata: { type: 'comment', userId: String(req.auth._id), postId: String(post._id) }
                        });
                    } catch (error) {
                        logger.warn('Comment media durable save failed:', error);
                    }
                    comment.media = { url: mediaUrl, expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000) };
                }

                const savedComment = await comment.save();

                // Start the participant read early so its Mongo RTT overlaps
                // comment population, post persistence, and activity work.
                // Private posts skip notification processing entirely.
                const participantsPromise =
                    post.visibility === 'private'
                        ? null
                        : Comment.find({ post: post._id })
                            .distinct('user')
                            .exec()
                            .then(
                                participantsRaw => ({
                                    participantsRaw,
                                    error: null
                                }),
                                error => ({
                                    participantsRaw: null,
                                    error
                                })
                            );

                // Reuse the authenticated user already loaded for this request
                // instead of paying another Mongo RTT to populate comment.user.
                // Build the same narrow User document shape used by populate().
                const commentUserData = {
                    _id: req.authUser._id,
                    firstName: req.authUser.firstName,
                    lastName: req.authUser.lastName,
                    mainAvatar: req.authUser.mainAvatar,
                    avatarStyle: req.authUser.avatarStyle,
                    avatarSeed: req.authUser.avatarSeed,
                    avatarVariant: req.authUser.avatarVariant,
                    avatarOverrides: req.authUser.avatarOverrides
                };

                for (const key of Object.keys(commentUserData)) {
                    if (commentUserData[key] === undefined) {
                        delete commentUserData[key];
                    }
                }

                const commentUser = new User(
                    commentUserData,
                    null,
                    { defaults: false }
                );

                const commentForResponse = savedComment.toObject();
                commentForResponse.user = commentUser;

                const commentWithVotes = withVotesInfo(
                    commentForResponse,
                    req.auth._id,
                    post._id
                );

                // Push to post
                post.comments.push(commentWithVotes._id);
                await post.save();

                // Activity: private for anonymous, normal for non-anon
                try {
                    if (!isAnon) {
                        const activity = await Activity.create({ type: 'comment', actor: req.auth._id, targetType: 'post', targetId: post._id, channel: post.channel, content: makeExcerpt(commentText || commentWithVotes.text, 150), visibility: post.visibility, meta: { commentId: commentWithVotes._id } });
                        try {
                            realtime.emitPostInteraction(post._id, authorId, req.auth._id, 'comment', { comment: commentWithVotes });
                            const { emitToUsers } = require('../helpers');
                            const recipients = [...(req.authUser.followers || []), authorId].map(id => String(id));
                            emitToUsers(recipients, 'activity:created', activity);
                        } catch (e) { logger.warn('emit activity failed', e); }
                    } else {
                        const activity = await Activity.create({ type: 'comment', actor: req.auth._id, targetType: 'post', targetId: post._id, channel: post.channel, content: makeExcerpt(commentText || commentWithVotes.text, 150), visibility: 'private', meta: { commentId: commentWithVotes._id, anonyme: true } });
                        try { emitToUser(req.auth._id, 'activity:created', activity); } catch (e) {}
                    }
                } catch (e) { logger.warn('Failed to create activity for comment:', e.message || e); }

                // --- Notification Logic ---
                try {
                    // Scenario 7: Skip all notifications if post is "Only-Me"
                    if (post.visibility === 'private') return Response.sendResponse(res, commentWithVotes, 'Comment created (Private)');

                    const senderName = isAnon ? (anonymName || 'Anonymous') : (req.authUser.firstName + ' ' + req.authUser.lastName);
                    const postOwnerId = post.user.toString();

                    // Build participants and friends list
                    const participantRead =
                        await participantsPromise;

                    if (participantRead?.error) {
                        throw participantRead.error;
                    }

                    const participantsRaw =
                        participantRead?.participantsRaw || [];

                    const participants = new Set(
                        participantsRaw.map(
                            u => u.toString()
                        )
                    );
                    participants.add(postOwnerId);
                    const friends = (req.authUser.friends || []).map(f => f.toString());

                    // Mentions:
                    // Modern clients send authoritative Mongo user IDs from
                    // the picker. Name parsing is legacy-only.
                    const mentionRegex = /@([\w\s._-]+?)(?=\s|$|@)/g;
                    const mentionedUsers = new Set();
                    const structuredMentions =
                        req.body.mentionMode === 'structured';

                    const explicitIds = []
                        .concat(req.body['mentionedUserIds'] || [])
                        .concat(req.body['mentionedUserIds[]'] || []);

                    for (const rawId of explicitIds) {
                        try {
                            const id = String(rawId || '');
                            if (!mongoose.Types.ObjectId.isValid(id)) continue;
                            if (id === req.auth._id.toString()) continue;

                            if (isAnon) {
                                if (!participants.has(id)) continue;
                            } else {
                                if (!participants.has(id) && !friends.includes(id)) continue;
                            }

                            const candidate = await User.findOne({
                                _id: id,
                                enabled: { $ne: false },
                                isDeleted: { $ne: true },
                                banned: { $ne: true },
                                deletedAt: null
                            }).select('_id blockedUsers');

                            if (!candidate) continue;

                            const blockedByTarget =
                                (candidate.blockedUsers || [])
                                    .some(blockedId =>
                                        String(blockedId) ===
                                        req.auth._id.toString()
                                    );

                            const blockedByMe =
                                (req.authUser.blockedUsers || [])
                                    .some(blockedId =>
                                        String(blockedId) === id
                                    );

                            if (blockedByTarget || blockedByMe) continue;

                            mentionedUsers.add(id);
                        } catch (_) {}
                    }

                    // Backward compatibility only.
                    // Structured clients must never trigger a second,
                    // name-based recipient resolution pass.
                    if (!structuredMentions) {
                        let match;

                        while ((match = mentionRegex.exec(commentText)) !== null) {
                            const name = match[1].trim();

                            let user = await User.findOne({
                                firstName: new RegExp(`^${name}$`, 'i')
                            });

                            if (!user && name.includes(' ')) {
                                const parts = name.split(' ');
                                user = await User.findOne({
                                    firstName: new RegExp(`^${parts[0]}$`, 'i'),
                                    lastName: new RegExp(
                                        `^${parts.slice(1).join(' ')}$`,
                                        'i'
                                    )
                                });
                            }

                            if (!user) {
                                const anonComment = await Comment.findOne({
                                    post: post._id,
                                    anonymName: new RegExp(`^${name}$`, 'i')
                                });

                                if (anonComment) {
                                    user = await User.findById(anonComment.user);
                                }
                            }

                            if (!user) continue;

                            const uid = user._id.toString();

                            if (uid === req.auth._id.toString()) continue;

                            if (isAnon) {
                                if (!participants.has(uid)) continue;
                            } else {
                                if (!participants.has(uid) && !friends.includes(uid)) continue;
                            }

                            mentionedUsers.add(uid);
                        }
                    }

                    // Send notifications and realtime mentions
                    for (const userId of mentionedUsers) {
                        await createNotification({ recipientId: userId, senderId: req.auth._id, type: 'mention_comment', title: 'You were mentioned', body: `${senderName} mentioned you in a comment`, data: { postId: post._id, commentId: commentWithVotes._id, link: `/tabs/channels/post/${post._id}`, anonymName: isAnon ? anonymName : null } });
                        try {
                            const payload = JSON.stringify({ senderName, text: commentText, anonymName: isAnon ? anonymName : null });
                            realtime.emitMention(userId, 'comment', post._id, payload);
                        } catch (e) { logger.warn('emitMention failed', e); }
                    }

                    // Reply notification
                    if (comment.parentComment) {
                        const parent = await Comment.findById(comment.parentComment);
                        if (parent && parent.user.toString() !== req.auth._id.toString() && !mentionedUsers.has(parent.user.toString())) {
                            await createNotification({ recipientId: parent.user, senderId: req.auth._id, type: 'reply_to_my_comment', title: 'New reply', body: `${senderName} replied to your comment`, data: { postId: post._id, commentId: commentWithVotes._id, link: `/tabs/channels/post/${post._id}`, anonymName: isAnon ? anonymName : null } });
                        }
                    }

                    // Post owner notification
                    if (postOwnerId !== req.auth._id.toString() && !mentionedUsers.has(postOwnerId)) {
                        let alreadyNotified = false;
                        if (comment.parentComment) {
                            const parent = await Comment.findById(comment.parentComment);
                            if (parent && parent.user.toString() === postOwnerId) alreadyNotified = true;
                        }
                        if (!alreadyNotified) {
                            await createNotification({ recipientId: postOwnerId, senderId: req.auth._id, type: 'post_commented', title: 'New comment', body: `${senderName} commented on your post`, data: { postId: post._id, commentId: commentWithVotes._id, link: `/tabs/channels/post/${post._id}`, anonymName: isAnon ? anonymName : null } });
                        }
                    }

                    // Thread participant notifications: users who already commented on
                    // the post should know the discussion continued, even without a mention.
                    const excluded = new Set([
                        req.auth._id.toString(),
                        postOwnerId,
                        ...Array.from(mentionedUsers)
                    ]);
                    if (comment.parentComment) {
                        const parent = await Comment.findById(comment.parentComment).select('user').lean();
                        if (parent?.user) excluded.add(parent.user.toString());
                    }
                    const participantRecipients = Array.from(participants).filter(id => !excluded.has(id));
                    for (const userId of participantRecipients) {
                        await createNotification({
                            recipientId: userId,
                            senderId: req.auth._id,
                            type: 'comment_thread_activity',
                            title: 'New comment',
                            body: `${senderName} also commented on a post you joined`,
                            data: { postId: post._id, commentId: commentWithVotes._id, link: `/tabs/channels/post/${post._id}`, anonymName: isAnon ? anonymName : null }
                        });
                    }
                } catch (notifyErr) { logger.warn('Notification logic failed:', notifyErr); }

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

        if (userVoteInd !== -1 && comment.user != req.auth._id) {
            const channel = await Channel.findOne({ _id: post.channel });
            sendNotification(
                { en: channel.name },
                { en: (comment.anonyme ? 'Anonym' : req.authUser.firstName + ' ' + req.authUser.lastName) + ' has voted on your comment' },
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
            user: { $nin: disabledUserIds },
            deletedAt: null,
            ...visibleCommentContentQuery()
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
            user: { $nin: disabledUserIds },
            deletedAt: null,
            ...visibleCommentContentQuery()
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
            count,
            more: (count - (limit * (page + 1))) > 0
        });

    } catch (err) {
        console.error('Error in getComments:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.deleteComment = async (req, res) => {
    try {
        const comment =
            req.comment;

        return await exports.destroyComment(
            res,
            comment._id,
            response =>
                Response.sendResponse(
                    response,
                    null,
                    'comment removed'
                )
        );

    } catch (error) {
        console.log(error);

        if (!res.headersSent) {
            return Response.sendError(
                res,
                500,
                'Server error'
            );
        }
    }
};

exports.destroyComment = async (res, commentId, callback) => {
    try {
        const comment =
            await Comment.findById(
                commentId
            )
                .select(
                    'media.url'
                )
                .lean();

        if (
            comment &&
            comment.media &&
            comment.media.url
        ) {
            await removeManagedMedia(
                comment.media.url
            );
        }

        await resolveEntityReports({
            entityId:
                commentId,

            entityModel:
                'Comment',

            moderatorNote:
                'Comment removed'
        });

        await Activity.deleteMany({
            $or: [
                {
                    'meta.commentId':
                        commentId
                },
                {
                    targetType:
                        'comment',

                    targetId:
                        commentId
                }
            ]
        });

        await Comment.deleteOne({
            _id:
                commentId
        });

        if (callback) {
            return callback(
                res
            );
        }

        return Response.sendResponse(
            res,
            null,
            'Comment removed'
        );

    } catch (err) {
        console.log(err);

        if (!res.headersSent) {
            return Response.sendError(
                res,
                500,
                'Server error'
            );
        }
    }
};

exports.clearCommentReports = async (req, res) => {
    try {
        const result =
            await dismissEntityReports({
                entityId:
                    req.comment._id,
                entityModel:
                    'Comment'
            });

        await Comment.updateOne(
            {
                _id:
                    req.comment._id
            },
            {
                $set: {
                    reports: []
                }
            }
        );

        return Response.sendResponse(
            res,
            {
                dismissedReports:
                    result.dismissedReports,
                retentionDate:
                    result.retentionDate
            },
            'Reports cleared from active moderation queue'
        );
    } catch (err) {
        console.log(err);
        return Response.sendError(res, 400, 'Failed to clear reports');
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
