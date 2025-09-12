import mongoose from 'mongoose';

const LedgerSchema = new mongoose.Schema({
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    periodStart: Date,
    periodEnd: Date,
    grossAmount: Number,
    commissionAmount: Number,
    refunds: Number,
    fees: Number,
    netPayable: Number,
    status: { type: String, enum: ['pending', 'processing', 'paid', 'failed'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    entries: [{ orderId: String, type: String, amount: Number }],
    gatewayTransactionId: String,
});

export default mongoose.model('PayoutLedger', LedgerSchema);
