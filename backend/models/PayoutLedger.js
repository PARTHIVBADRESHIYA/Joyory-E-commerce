import mongoose from 'mongoose';

const LedgerSchema = new mongoose.Schema({
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    periodStart: Date,
    periodEnd: Date,
    grossAmount: { type: Number, default: 0 },
    commissionAmount: { type: Number, default: 0 },
    refunds: { type: Number, default: 0 },
    fees: { type: Number, default: 0 },
    netPayable: { type: Number, default: 0 },
    status: { type: String, enum: ['pending', 'processing', 'paid', 'failed'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    entries: [
        {
            orderId: { type: String },
            type: { type: String, enum: ['order', 'refund','payment'] },
            amount: { type: Number, default: 0 },
        }
    ],
    gatewayTransactionId: String,
});

export default mongoose.model('PayoutLedger', LedgerSchema);
