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
    generatedLinks: [
        {
            product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
            shortLink: { type: String }, // Optional short URL
            clicks: { type: Number, default: 0 },
            viaUrl: { type: Boolean, default: false },
            customUrl: String,
        }
    ],
    totalClicks: { type: Number, default: 0 },
    successfulOrders: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model('Affiliate', affiliateSchema);