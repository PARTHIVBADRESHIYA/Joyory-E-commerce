import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    method: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMethod', required: true },
    status: { type: String, enum: ['Pending', 'Completed', 'Failed'], default: 'Pending' },
    transactionId: { type: String },
    amount: { type: Number, required: true },
    cardHolderName: { type: String },
    cardNumber: { type: String }, // Encrypted
    expiryDate: { type: String },
    isActive: { type: Boolean, default: true },
    revenue: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model('Payment', paymentSchema);
