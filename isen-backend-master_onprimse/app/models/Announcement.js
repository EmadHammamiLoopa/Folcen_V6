const mongoose = require('mongoose');

const AnnouncementSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    type: { type: String, enum: ['info', 'warning', 'success', 'danger'], default: 'info' },
    target: { type: String, enum: ['all', 'users', 'admins'], default: 'all' },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    expiresAt: { type: Date },
    seenBy: [{ type: String }] // stored as string IDs for consistent comparison across ObjectId / string contexts
}, { timestamps: true });

AnnouncementSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model('Announcement', AnnouncementSchema);
