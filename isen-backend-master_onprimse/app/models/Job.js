const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
    title: {
        type: String,
        maxLength: 50,
        required: true
    },
    company: {
        type: String,
        maxLength: 50,
        required: true
    },
    country: {
        type: String,
        required: true
    },
    city: {
        type: String,
        required: true
    },
    email: {
        type: String,
        maxLength: 50,
        required: true
    },
    description: {
        type: String,
        maxLength: 255,
        required: true
    },
    photo: {
        path: {
            type: String,
            required: function () { return !this.deletedAt; } // Only required if not deleted
        },
        type: {
            type: String,
            required: function () { return !this.deletedAt; } // Only required if not deleted
        }
    },
    user: {
        type: mongoose.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reports: [{
        type: mongoose.Types.ObjectId,
        ref: 'Report'
    }],
    visibility: {
        type: String,
        enum: ['public', 'private', 'friends-only'],
        default: 'public'
    },
    deletedAt: {
        type: Date,
        default: null
    },
    jobType: {
        type: String,
        enum: ['Full-time', 'Part-time', 'Contract', 'Internship'],
        required: true
    },
    minSalary: {
        type: Number,
        required: false,
        default: 0
    },
    maxSalary: {
        type: Number,
        required: false,
        default: 0
    },
    experienceLevel: {
        type: String,
        enum: ['Entry-level', 'Mid-level', 'Senior'],
        required: true
    },
    jobCategory: {
        type: String,
        required: true
    },
    remoteOption: {
        type: String,
        enum: ['Remote', 'Onsite', 'Hybrid'],
        required: true
    },
    applicationDeadline: {
        type: Date,
        required: false
    },
    jobRequirements: {
        type: String, // Can be changed to an array of skills if preferred
        maxLength: 500,
        required: true
    },

    address: {
        type: String, // Address where the service is provided
        required: true
    },
    jobBenefits: {
        type: String,
        maxLength: 255,
        required: false
    },
    educationLevel: {
        type: String,
        enum: ['High School', "Bachelor's", "Master's", 'PhD', 'Other'],
        required: true
    },
    industry: {
        type: String,
        required: false
    },
    website: {
        type: String,
        required: false
    },
    jobLocationType: {
        type: String,
        enum: ['Headquarters', 'Branch Office'],
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Job', jobSchema);
