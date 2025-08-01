// models/Product.js
import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    variant: String, // Shade / Type
    buyingPrice: { type: Number, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    thresholdValue: { type: Number, required: true },
    expiryDate: Date,
    brand: String,
    category: String,
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


export default mongoose.model('Product', productSchema);

