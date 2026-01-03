const mongoose = require('mongoose')

const subscriptionSchema = new mongoose.Schema({
    offers: [String],
    dayPrice: {
        type: Number,
        maxLength: 12,
        default: 0,
    },
    weekPrice: {
        type: Number,
        maxLength: 12,
        default: 0,
    },
    monthPrice: {
        type: Number,
        maxLength: 12,
        default: 0,
    },
    yearPrice: {
        type: Number,
        maxLength: 12,
        default: 0,
    },
    currency: {
        type: String,
        maxLength: 4,
        required: true,
        default: 'USD'
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User'}, // Optional user-specific field

}, {timestamps: true})

module.exports = mongoose.model('Subscription', subscriptionSchema)