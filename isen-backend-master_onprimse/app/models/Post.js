const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    text: {
        type: String,
        required: true
    },
    backgroundColor: {
        type: String,
        default: '#fff' // Allows customization of post background color
    },
    color: {
        type: String,
        default: '#000' // Allows customization of post text color
    },
    reports: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Report' // Tracks reports made against this post
    }],
    votes: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User' // Reference to users who voted on the post
        },
        vote: {
            type: Number,
            enum: [-1, 1] // -1 for downvote, 1 for upvote
        }
    }],
    comments: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment' // References to comments made on the post
    }],
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true // The post creator
    },
    channel: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Channel',
        required: true // The channel where the post is published
    },
    anonyme: {
        type: Boolean,
        default: false // Whether the post was made anonymously
    },
    media: {
        url: { type: String },  // URL to the uploaded image or video
        expiryDate: { type: Date } // Timestamp when the media expires
    },
    deletedAt: {
        type: Date,
        default: null // For soft deletion of posts
    },
    visibility: {
        type: String,
        enum: ['public', 'private', 'friends-only'],
        default: 'public'
    },
    views: {
        type: Number,
        default: 0
    },
    reactions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Reaction' // Assuming a Reaction model that includes types of reactions
    }]
    ,moderationStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    eventDate: { type: Date },  // Date of the event
    eventLocation: { type: String },  // Location of the event
    eventTime: { type: String },  // Time of the event (could be a string like "14:00")
    relationshipGoals: {
        type: [String], // e.g., 'casual', 'long-term', 'friendship'
        default: []
    },
    ageRange: {
        min: { type: Number },
        max: { type: Number }
    },
    interests: {
        type: [String], // List of interests or hobbies
        default: []
    },
    hintAboutMe: {
        type: String, // Short description or hint about the user
        default: ''
    }
    
    
}, { timestamps: true }); // Automatically adds createdAt and updatedAt fields

module.exports = mongoose.model('Post', postSchema);
