// models/AffiliateTransaction.js
import mongoose from 'mongoose';

const affiliateTransactionSchema = new mongoose.Schema({
    affiliate: { type: mongoose.Schema.Types.ObjectId, ref: 'Affiliate', required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    commissionAmount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('AffiliateTransaction', affiliateTransactionSchema);