// models/SellerApplication.js
import mongoose from "mongoose";

const SellerApplicationSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
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

    licences: [
        {
            category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true }, // ✅ ref to Category
            docUrl: { type: String, required: true },
            approved: { type: Boolean, default: false }
        }
    ],

    marketingBudget: { type: Number, default: 0 },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("SellerApplication", SellerApplicationSchema);
