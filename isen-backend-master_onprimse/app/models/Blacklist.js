const mongoose = require('mongoose');

const blacklistSchema = new mongoose.Schema({
    itemType: {
        type: String,
        required: true, // Type of item being blacklisted (e.g., 'word', 'user', 'IP address')
    },
    itemValue: {
        type: String,
        required: true, // Value of the blacklisted item (e.g., the banned word, blocked user ID)
        unique: true, // Ensure uniqueness of blacklisted items
    },
    reason: {
        type: String,
        required: true, // Reason for blacklisting
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // Reference to the user who added the item to the blacklist
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now, // Date and time when the item was added to the blacklist
    },
});

module.exports = mongoose.model('Blacklist', blacklistSchema);
