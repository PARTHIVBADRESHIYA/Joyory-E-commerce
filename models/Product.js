// models/Product.js
import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    buyingPrice: { type: Number, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    thresholdValue: { type: Number, required: true },
    expiryDate: { type: Date, required: false },
    brand: String,
    category: String,
    variant: String,
    description: String,
    image: String,
    sales: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    affiliateEarnings: { type: Number, default: 0 }, // optional
    affiliateClicks: { type: Number, default: 0 },   // optional
    status: {
        type: String,
        enum: ['In-stock', 'Low stock', 'Out of stock'],
        default: 'In-stock'
    }
}, { timestamps: true });

export default mongoose.model('Product', productSchema);

