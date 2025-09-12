import mongoose from 'mongoose';

const BankSchema = new mongoose.Schema({
    accountHolderName: { type: String },
    accountNumberEncrypted: { type: String },
    ifsc: { type: String },
    bankName: { type: String },
});

const SellerSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    businessName: { type: String, required: true },
    sellerCode: { type: String, unique: true },
    gstNumber: { type: String },
    panNumber: { type: String },
    addresses: [
        {
            line1: String,
            city: String,
            state: String,
            pincode: String,
            country: String,
        },
    ],
    bankDetails: BankSchema,
    kycDocs: [
        { url: String, filename: String, uploadedAt: Date, public_id: String },
    ],
    status: {
        type: String,
        enum: ['pending', 'active', 'rejected', 'suspended'],
        default: 'pending',
    },
    commissionRate: { type: Number, default: 0.15 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date },
});

SellerSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    if (!this.sellerCode) {
        this.sellerCode = `SLR-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
    }
    next();
});

export default mongoose.model('Seller', SellerSchema);
