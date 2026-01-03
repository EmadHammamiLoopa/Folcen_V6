const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    label: {
        type: String,
        maxLength: 50,
        required: true
    },
    description: {
        type: String,
        maxLength: 255,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        maxLength: 5,
        required: true
    },
    stock: {
        type: Number,
        required: true,
        min: 0
    },
    brand: {
        type: String
    },
    condition: {
        type: String
    },
    weight: {
        type: String
    },
    dimensions: {
        length: {
            type: String
        },
        width: {
            type: String
        },
        height: {
            type: String
        }
    },
    tags: [String],
    sold: {
        type: Boolean,
        default: false
    },
    country: {
        type: String,
        required: true
    },
    city: {
        type: String,
        required: true
    },
    reports: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Report'
    }],
    photos: [{
        path: {
            type: String,
            required: true
        },
        type: {
            type: String,
            required: true
        }
    }],
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    deletedAt: {
        type: Date,
        default: null
    },
    category: {
        type: String,
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
