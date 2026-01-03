const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true // Ensures each channel name is unique across the database
    },
    description: {
        type: String,
        default: '' // Brief description of the channel's purpose or theme
    },
    approved: {
        type: Boolean,
        default: true // Moderation status, whether the channel has been approved by an admin
    },
    photo: {
        path: {
            type: String,
            default: '/channels/channel-default.png' // Path to the channel's display picture
        },
        format: {
            type: String,
            default: 'png' // Image format of the display picture
        }
    },
    country: {
        type: String,
        required: true // Primary country of the channel's target audience or origin
    },
    city: {
        type: String,
        required: true // Primary city of the channel's target audience or origin
    },
    reports: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Report' // References to reports filed against the channel
    }],
    followers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' // References to users who follow the channel
    }],
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true // The channel owner or creator's user ID
    },
    global: {
        type: Boolean,
        default: false // Whether the channel is visible globally or just locally
    },
    enabled: {
        type: Boolean,
        default: true // Whether the channel is active or has been disabled
    },
    content: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Content' // References to content published in the channel
    }],
    category: {
        type: String,
        required: true // General category of the channel
    },
    tags: [String], // Array of keywords associated with the channel for searchability
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Admin who approved the channel
        default: null
    },
    approvedAt: Date, // Timestamp when the channel was approved
    photos: [{
        path: String,
        format: {
            type: String,
            default: 'png' // Image format of additional photos
        }
    }],
    type: {
        type: String,
        enum: ['user', 'static', 'static_events', 'static_dating'], // Channel type: either user-created or static
        required: true // Ensure the type field is always set
    },
    calendar: {
        type: [Date], // A list of dates for event scheduling
        default: []
    },
    time: {
        type: String, // Time in any preferred format
        default: ''
    },
    location: {
        type: String, // Location of the event
        default: ''
    }
}, { timestamps: true }); // Schema options to add createdAt and updatedAt automatically

module.exports = mongoose.model('Channel', channelSchema);
