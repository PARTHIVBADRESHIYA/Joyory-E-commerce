import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const SellerSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    password: { type: String, required: true },
    businessName: String,
    gstNumber: String,
    panNumber: String,
    addresses: [{ line1: String, city: String, state: String, pincode: String, country: String }],
    bankDetails: {
        accountHolderName: String,
        accountNumberEncrypted: String,
        ifsc: String,
        bankName: String,
    },
    kycDocs: [{ url: String, filename: String, uploadedAt: Date, public_id: String }],
    status: { type: String, enum: ["active", "inactive", "suspended"], default: "active" },
    licences: [
        {
            category: { type: String, required: true },   // e.g. "Cosmetics", "Skincare"
            docUrl: { type: String, required: true },     // Cloudinary link
            approved: { type: Boolean, default: false },  // admin approval required
            uploadedAt: { type: Date, default: Date.now } // timestamp
        }
    ],

    // OTP flows
    otp: {
        code: String,
        expiresAt: Date,
        attemptsLeft: Number
    },
    otpRequests: [Date],

    createdAt: { type: Date, default: Date.now }
});

// Hash password before save
SellerSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

export default mongoose.model("Seller", SellerSchema);
