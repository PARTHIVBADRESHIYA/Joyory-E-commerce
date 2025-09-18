// import mongoose from 'mongoose';

// const LedgerSchema = new mongoose.Schema({
//     seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
//     periodStart: Date,
//     periodEnd: Date,
//     grossAmount: { type: Number, default: 0 },
//     commissionAmount: { type: Number, default: 0 },
//     refunds: { type: Number, default: 0 },
//     fees: { type: Number, default: 0 },
//     netPayable: { type: Number, default: 0 },
//     status: { type: String, enum: ['pending', 'processing', 'paid', 'failed'], default: 'pending' },
//     createdAt: { type: Date, default: Date.now },
//     entries: [
//         {
//             orderId: { type: String },
//             type: { type: String, enum: ['order', 'refund','payment'] },
//             amount: { type: Number, default: 0 },
//         }
//     ],
//     gatewayTransactionId: String,
// });

// export default mongoose.model('PayoutLedger', LedgerSchema);





import mongoose from 'mongoose';

const LedgerSchema = new mongoose.Schema({
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },

    // Period of payout
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },

    // Financials
    grossAmount: { type: Number, default: 0 },          // Total order value
    commissionAmount: { type: Number, default: 0 },     // Marketplace commission
    refunds: { type: Number, default: 0 },              // Refunds
    fees: { type: Number, default: 0 },                 // Payment gateway + logistic fees
    adjustments: { type: Number, default: 0 },          // Manual admin adjustments
    taxDeducted: { type: Number, default: 0 },          // TDS/GST withheld
    netPayable: { type: Number, default: 0 },           // Final amount payable to seller

    // Payout metadata
    status: {
        type: String,
        enum: ['pending', 'processing', 'approved', 'paid', 'failed', 'on_hold'],
        default: 'pending'
    },
    settlementCycle: { type: String, enum: ['daily','weekly', 'biweekly', 'monthly'], default: 'weekly' },
    currency: { type: String, default: 'INR' },
    payoutMethod: { type: String, enum: ['bank_transfer', 'upi', 'wallet'], default: 'bank_transfer' },
    gatewayTransactionId: { type: String },
    processedAt: { type: Date },

    // Detailed breakdown per transaction
    entries: [
        {
            orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
            type: { type: String, enum: ['order', 'refund', 'commission', 'fee', 'adjustment', 'tax'] },
            description: { type: String },
            amount: { type: Number, default: 0 },
            createdAt: { type: Date, default: Date.now }
        }
    ],

    // Support/Audit
    remarks: { type: String },
    supportTicketId: { type: String },   // in case seller raises dispute
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

LedgerSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

export default mongoose.model('PayoutLedger', LedgerSchema);
