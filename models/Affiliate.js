// models/Affiliate.js
import mongoose from 'mongoose';
const affiliateSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    referralCode: { type: String, unique: true },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
    },
    commissionRate: { type: Number, default: 0.15 }, // NEW: 15% default
    generatedLinks: [
        {
            product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
            shortLink: { type: String },
            clicks: { type: Number, default: 0 },
            viaUrl: { type: Boolean, default: false },
            customUrl: String,
        }
    ],
    totalClicks: { type: Number, default: 0 },
    successfulOrders: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    exclusions: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product' // Optional: products with 0% commission
        }
    ]
}, { timestamps: true });


export default mongoose.model('Affiliate', affiliateSchema);