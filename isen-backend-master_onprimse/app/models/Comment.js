const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    text: {
        type: String,
        required: function() {
            return !this.media || !this.media.url;
        }
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true // Reference to the user who made the comment
    },
    anonyme: {
        type: Boolean,
        default: false // Whether the comment was posted anonymously
    },
    anonymName: {
        type: String,
        default: null // Stable anonymous display name for this post→commenter pair
    },
    media: {
        url: { type: String },  // URL to the uploaded image or video
        expiryDate: { type: Date } // Timestamp when the media expires
    },
    reports: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Report' // Reports filed against the comment
    }],
    votes: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User' // Reference to users who voted on the comment
        },
        vote: {
            type: Number,
            enum: [-1, 1] // -1 for downvote, 1 for upvote
        }
    }],
    post: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        required: true // Link to the post the comment is associated with
    },
    parentComment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
        default: null // Reference to a parent comment if this is a reply
    }
,    moderationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending' // Moderation status of the comment
}
,reactionCounts: {
    type: Map,
    of: Number,
    default: {} // Map reaction types to counts
},deletedAt: {
    type: Date,
    default: null // For soft deletion of comments
}


}, { timestamps: true }); // Automatically adds createdAt and updatedAt fields

module.exports = mongoose.model('Comment', commentSchema);
