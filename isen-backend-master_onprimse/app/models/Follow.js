const mongoose = require('mongoose')

const followSchema = new mongoose.Schema({
    follower: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    followed: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'active', 'blocked'],
        default: 'active'
    },
    metadata: {
        type: Map,
        of: String
    }
}, { timestamps: true });

// Enforce uniqueness: one follow relationship per pair
followSchema.index({ follower: 1, followed: 1 }, { unique: true });
followSchema.index({ followed: 1, status: 1 });
followSchema.index({ follower: 1, status: 1 });

module.exports = mongoose.model('Follow', followSchema);
