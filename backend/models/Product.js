// models/Product.js
import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    variant: String, // Shade / Type
    buyingPrice: { type: Number, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    thresholdValue: { type: Number, required: true },
    expiryDate: Date,
    // in Product model
    brand: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Brand",
        required: true
    },
    // backward-compatible single category (optional)
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true }, // final category (e.g. Eyeliner)
    categoryHierarchy: [ // full path
        { type: mongoose.Schema.Types.ObjectId, ref: 'Category' }
    ],
    description: String,
    summary: String, // for card preview
    features: String, // optional   
    howToUse: String, // optional
    image: String, // keep for primary
    images: [{ type: String }],// 🔁 Add this for multi-images
    productTags: [String], // for product tag select
    shadeOptions: [{ type: String }],
    colorOptions: [{ type: String }],
    status: { type: String, enum: ['In-stock', 'Low stock', 'Out of stock'], default: 'In-stock' },
    sales: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    affiliateEarnings: { type: Number, default: 0 },
    affiliateClicks: { type: Number, default: 0 },
    // models/Product.js
    avgRating: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },

    ratingsBreakdown: {
        Excellent: { type: Number, default: 0 },
        VeryGood: { type: Number, default: 0 },
        Average: { type: Number, default: 0 },
        Good: { type: Number, default: 0 },
        Poor: { type: Number, default: 0 }
    }

}, { timestamps: true });


// models/Product.js (add after schema definition)
productSchema.index({ brand: 1 });
productSchema.index({ brand: 1, category: 1 });
productSchema.index({ createdAt: -1 });


export default mongoose.model('Product', productSchema);

