import mongoose from 'mongoose';
import Product from './Product.js';

const reviewSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String }, // Optional: "Love it", "Not for oily skin"
    comment: { type: String },
    images: [{ type: String }], // Optional customer-uploaded images
    verifiedPurchase: { type: Boolean, default: false }, // Comes from your order model
    helpfulVotes: { type: Number, default: 0 }, // User clicks "Helpful"
    featured: { type: Boolean, default: false },
    status: { type: String, enum: ['Active', 'Rejected'], default: 'Active' }
}, { timestamps: true });

async function updateAverageRating(productId) {
    const result = await mongoose.model('Review').aggregate([
        { $match: { product: productId, status: 'Active' } },
        {
            $group: {
                _id: '$product',
                avgRating: { $avg: '$rating' },
                totalRatings: { $sum: 1 }
            }
        }
    ]);

    const product = await Product.findById(productId);
    if (product) {
        product.averageRating = result[0]?.avgRating || 0;
        product.totalRatings = result[0]?.totalRatings || 0;
        await product.save();
    }
}

// Recalculate rating after review added/updated/deleted
reviewSchema.post('save', function () {
    updateAverageRating(this.product);
});
reviewSchema.post('findOneAndDelete', function (doc) {
    if (doc) updateAverageRating(doc.product);
});

export default mongoose.model('Review', reviewSchema);
