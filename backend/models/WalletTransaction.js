import mongoose from 'mongoose';

const walletTxSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    amount: { type: Number, required: true },
    source: { type: String, enum: ['referral', 'admin', 'refund', 'purchase'], default: 'referral' },
    meta: { type: mongoose.Schema.Types.Mixed }, // e.g. { referralId, orderId }
    expiresAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model('WalletTransaction', walletTxSchema);
