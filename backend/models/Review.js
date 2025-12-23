// models/Review.js
import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    // ✅ VARIANT LEVEL
    variantSku: { type: String, required: true },      // exact SKU reviewed
    shadeName: { type: String },                        // for filtering / UI
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String },
    comment: { type: String, required: true },
    images: [{ type: String }],
    videos: [{ type: String }], // optional product demo
    verifiedPurchase: { type: Boolean, default: false },

    // Engagement
    helpfulVotes: { type: Number, default: 0 },
    helpfulVoters: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    reactions: {
        like: { type: Number, default: 0 },
        love: { type: Number, default: 0 },
        funny: { type: Number, default: 0 },
        angry: { type: Number, default: 0 }
    },
    reports: [{ userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, reason: String }],

    // Admin
    featured: { type: Boolean, default: false },
    status: { type: String, enum: ['Active', 'deleted'], default: 'Active' }
}, { timestamps: true });

export default mongoose.model('Review', reviewSchema);
