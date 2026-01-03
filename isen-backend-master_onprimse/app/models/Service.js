const mongoose = require('mongoose')

const serviceSchema = new mongoose.Schema({
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
    phone: {
        type: String,
        maxLength: 20,
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
            required: true
        },
        type: {
            type: String,
            required: true
        }
    },
    user: {
        type: mongoose.Types.ObjectId,
        ref: 'User',
        required: true
    },
    visibility: {
        type: String,
        enum: ['public', 'private', 'friends-only'],
        default: 'public'
    },
    deletedAt: {
        type: Date,
        default: null
    },
    reports: [{
        type: mongoose.Types.ObjectId,
        ref: 'Report'
    }],

    // New Fields:
    serviceCategory: {
        type: String,
        enum: ['Cleaning', 'Plumbing', 'Consulting', 'Electrical', 'Painting', 'Other'], // You can add more categories
        required: true
    },
    serviceRate: {
        type: String, // Can be hourly rate or fixed price
        required: true
    },
    availability: {
        type: String, // Description of available hours or days
        required: true
    },
    Experience: {
        type: String, // e.g., '5km radius', 'Specific neighborhoods'
        required: true
    },
    serviceDuration: {
        type: String, // e.g., '2 hours', '1 day'
        required: true
    },
    paymentMethods: {
        type: [String], // Array of accepted payment types
        enum: ['Cash', 'Card', 'Online Payment'],
        required: true
    },
    licenseCertification: {
        type: String, // License or certification (if applicable)
        default: null
    },
    websitePortfolio: {
        type: String, // URL for website or portfolio
        default: null
    },
    address: {
        type: String, // Address where the service is provided
        required: true
    }

}, { timestamps: true });

module.exports = mongoose.model('Service', serviceSchema);
