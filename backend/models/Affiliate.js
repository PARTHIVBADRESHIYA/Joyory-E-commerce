// // models/Affiliate.js
// import mongoose from 'mongoose';
// const affiliateSchema = new mongoose.Schema({
//     user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
//     referralCode: { type: String, unique: true },
//     status: {
//         type: String,
//         enum: ['pending', 'approved', 'rejected'],
//         default: 'pending',
//     },
//     commissionRate: { type: Number, default: 0.15 }, // NEW: 15% default
//     generatedLinks: [
//         {
//             product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
//             shortLink: { type: String },
//             clicks: { type: Number, default: 0 },
//             viaUrl: { type: Boolean, default: false },
//             customUrl: String,
//         }
//     ],
//     totalClicks: { type: Number, default: 0 },
//     successfulOrders: { type: Number, default: 0 },
//     totalEarnings: { type: Number, default: 0 },
//     exclusions: [
//         {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: 'Product' // Optional: products with 0% commission
//         }
//     ]
// }, { timestamps: true });


// export default mongoose.model('Affiliate', affiliateSchema);



import mongoose from 'mongoose';
import {nanoid} from 'nanoid';

const generatedLinkSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    shortCode: { type: String, index: true },
    destination: { type: String, required: true },
    clicks: { type: Number, default: 0 },
    viaUrl: { type: Boolean, default: false },
    customUrl: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    expiresAt: Date
});


const affiliateSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    referralCode: { type: String, unique: true, index: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    application: {
        fullName: String,
        phone: String,
        bio: String,
        socials: {
            instagram: String,
            facebook: String,
            youtube: String,
            other: String
        }
    },
    commissionRate: { type: Number, default: parseFloat(process.env.DEFAULT_AFFILIATE_COMMISSION || 0.10) },
    generatedLinks: [generatedLinkSchema],
    totalClicks: { type: Number, default: 0 },
    successfulOrders: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    payoutBalance: { type: Number, default: 0 },
    exclusions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    createdAt: { type: Date, default: Date.now }
}, { timestamps: true });


// Generate referral code if not present
affiliateSchema.pre('validate', function (next) {
    if (!this.referralCode) {
        this.referralCode = 'AFF' + nanoid(6).toUpperCase();
    }
    next();
});


// Indexes to speed up lookups
affiliateSchema.index({ referralCode: 1 });
affiliateSchema.index({ user: 1 });


export default mongoose.model('Affiliate', affiliateSchema);
