const Response = require('../controllers/Response')
const { adminCheck } = require('../helpers')
const Post = require('../models/Post')
const mongoose = require('mongoose');

const normalizePostId = (rawId) => {
    let id = rawId;

    // Preserve the existing Base64 compatibility behavior.
    if (id && !mongoose.Types.ObjectId.isValid(id)) {
        try {
            const safe = id.replace(/-/g, '+').replace(/_/g, '/');
            const padded = safe.padEnd(
                safe.length + (4 - safe.length % 4) % 4,
                '='
            );
            const decoded = Buffer.from(
                padded,
                'base64'
            ).toString('utf8');

            if (mongoose.Types.ObjectId.isValid(decoded)) {
                id = decoded;
            }
        } catch (_) {}
    }

    return id;
};


// Start the comment-post Mongo read without awaiting it so the route can
// overlap that RTT with token revocation and authenticated-user loading.
exports.startCommentPostPrefetch = (req, res, next) => {
    const id = normalizePostId(
        req.params && req.params.postId
    );

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return Response.sendError(
            res,
            400,
            'Invalid Post ID format'
        );
    }

    req._commentPostPrefetchPromise =
        Post.findOne({
            _id: id
        })
        .exec()
        .then(
            post => ({
                post,
                error: null
            }),
            error => ({
                post: null,
                error
            })
        );

    next();
};

// Consume the route-scoped post read after authentication has completed.
// The promise always resolves to an object, so an auth rejection cannot
// leave an unhandled Mongo promise behind.
exports.finishCommentPostPrefetch = async (req, res, next) => {
    try {
        const pending =
            req._commentPostPrefetchPromise;

        delete req._commentPostPrefetchPromise;

        if (!pending) {
            return Response.sendError(
                res,
                500,
                'Server error'
            );
        }

        const result = await pending;

        if (result.error) {
            return Response.sendError(
                res,
                500,
                'Server error'
            );
        }

        if (!result.post) {
            return Response.sendError(
                res,
                400,
                'Post not found'
            );
        }

        req.post = result.post;
        next();
    } catch (_) {
        return Response.sendError(
            res,
            500,
            'Server error'
        );
    }
};

exports.commentPostById = async (req, res, next, rawId) => {
    try {
        const id = normalizePostId(rawId);

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return Response.sendError(
                res,
                400,
                'Invalid Post ID format'
            );
        }

        // Comment flows only require the Post document itself.
        // Avoid the additional Channel populate round trip.
        const post = await Post.findOne({
            _id: id
        }).exec();

        if (!post) {
            return Response.sendError(
                res,
                400,
                'Post not found'
            );
        }

        req.post = post;
        next();
    } catch (err) {
        return Response.sendError(
            res,
            500,
            'Server error'
        );
    }
};

exports.postById = async (req, res, next, id) => {
    try {
        // Handle Base64 encoded IDs from frontend
        if (id && !mongoose.Types.ObjectId.isValid(id)) {
            try {
                // Revert URL-safe base64
                const safe = id.replace(/-/g, '+').replace(/_/g, '/');
                // Add padding if missing
                const padded = safe.padEnd(safe.length + (4 - safe.length % 4) % 4, '=');
                const decoded = Buffer.from(padded, 'base64').toString('utf8');
                if (mongoose.Types.ObjectId.isValid(decoded)) {
                    console.log(`Decoded Base64 Post ID: ${id} -> ${decoded}`);
                    id = decoded;
                }
            } catch (e) {
                console.warn('Failed to decode potential Base64 Post ID:', id);
            }
        }

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return Response.sendError(res, 400, 'Invalid Post ID format');
        }
        const post = await Post.findOne({ _id: id })
            .populate('channel')
            .exec();

        if (!post) {
            return Response.sendError(res, 404, 'Post not found');
        }

        req.post = post;
        next();
    } catch (err) {
        return Response.sendError(res, 500, 'Server error');
    }
};


exports.postOwner = (req, res, next) => {
    if(adminCheck(req)){
        return next()
    }
    if(req.auth._id != req.post.user){
        return Response.sendError(res, 403, 'Access denied')
    }
    next();
}

exports.isFollowedChannelPost = (req, res, next) => {
    try{
        const post = req.post
        const userId = req.auth._id
        if(!post.channel.followers.includes(userId) && channel.user != req.auth._id){
            return Response.sendError(res, 400, 'access denied on this channel')
        }
        next()
    }catch(err){
        console.log(err);
    }
}
