const Response = require("../controllers/Response")
const { adminCheck } = require("../helpers")
const Comment = require("../models/Comment")


const mongoose = require('mongoose');

exports.commentById = async (req, res, next, id) => {
    console.log("id:", id); // Log the comment ID being searched for

    // Handle Base64 encoded IDs from frontend
    if (id && !mongoose.Types.ObjectId.isValid(id)) {
        try {
            // Revert URL-safe base64
            const safe = id.replace(/-/g, '+').replace(/_/g, '/');
            // Add padding if missing
            const padded = safe.padEnd(safe.length + (4 - safe.length % 4) % 4, '=');
            const decoded = Buffer.from(padded, 'base64').toString('utf8');
            if (mongoose.Types.ObjectId.isValid(decoded)) {
                console.log(`Decoded Base64 Comment ID: ${id} -> ${decoded}`);
                id = decoded;
            }
        } catch (e) {
            console.warn('Failed to decode potential Base64 Comment ID:', id);
        }
    }

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return Response.sendError(res, 400, 'Invalid Comment ID format');
    }

    try {
        const comment = await Comment.findOne({ _id: id }); // Use 'comment' instead of 'Comment'

        if (!comment) {
            return Response.sendError(res, 400, 'Comment not found');
        }

        req.comment = comment; // Store the comment in the request object
        next(); // Pass control to the next middleware or route handler
    } catch (err) {
        console.error('Error finding comment:', err);
        return Response.sendError(res, 500, 'Server error');
    }
};



exports.commentOwner = (req, res, next) => {
    if(adminCheck(req)){
        return next()
    }
    if(req.auth._id != req.comment.user){
        return Response.sendError(res, 403, 'Access denied')
    }
    next();
}