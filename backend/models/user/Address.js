import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fullName: String,
    phone: String,
    pincode: String,
    addressLine: String,
    city: String,
    state: String,
    landmark: String,
    type: { type: String, enum: ['Home', 'Work', 'Other'], default: 'Home' },
    isDefault: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model('Address', addressSchema);
