import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    rating: { type: Number, required: true },
    comment: { type: String }, // ✅ use comment here
    status: { type: String, enum: ['Active', 'Rejected'], default: 'Active' },
    featured: { type: Boolean, default: false }
}, { timestamps: true });


export default mongoose.model('Review', reviewSchema);
