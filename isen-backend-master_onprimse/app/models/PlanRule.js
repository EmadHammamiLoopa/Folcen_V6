const mongoose = require('mongoose');

const planRuleSchema = new mongoose.Schema({
    name: { type: String, required: true },
    // FREE_PLAN: User gets everything for free
    // PRICE_OVERRIDE: User gets specific prices
    type: { type: String, enum: ['FREE_PLAN', 'PRICE_OVERRIDE'], required: true },
    
    // Who this rule applies to
    targetUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    targetRoles: [{ type: String }], // e.g. ['ADMIN', 'VIP']
    targetCountries: [{ type: String }],
    targetCities: [{ type: String }],
    
    // Higher priority rules override lower ones
    priority: { type: Number, default: 0 },
    
    // Configuration for PRICE_OVERRIDE
    config: {
        dayPrice: Number,
        weekPrice: Number,
        monthPrice: Number,
        yearPrice: Number,
        currency: String,
        offers: [String]
    },
    
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('PlanRule', planRuleSchema);
