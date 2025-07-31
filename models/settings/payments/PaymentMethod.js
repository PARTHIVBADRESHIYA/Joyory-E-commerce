import mongoose from 'mongoose';

const paymentMethodSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // UPI, Card, PayPal, etc.
    type: { type: String, enum: ['UPI', 'Card', 'PayPal', 'Bank', 'Other','Online','COD'], required: true },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model('PaymentMethod', paymentMethodSchema);
