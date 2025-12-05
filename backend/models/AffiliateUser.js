import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const affiliateUserSchema = new mongoose.Schema({
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    password: { type: String, required: true },
    mobile: { type: String, default: null },

    affiliateId: { type: String, unique: true, index: true },   // used in query param ?aff=affiliateId
    referralCode: { type: String, unique: true, index: true },  // human-readable code like JOY123456

    totalCommission: { type: Number, default: 0 }, // currency minor units or main (choose consistently)
    clicks: { type: Number, default: 0 },
    orders: { type: Number, default: 0 },
    sales: { type: Number, default: 0 },
    payoutDetails: {
        upi: { type: String, default: null },
        bankName: { type: String, default: null },
        accountNumber: { type: String, default: null },
        ifsc: { type: String, default: null },
    }
    ,
    walletBalance: { type: Number, default: 0 },       // 🔥 NEW - unpaid commission
    lifetimeEarnings: { type: Number, default: 0 },    // 🔥 NEW - paid + unpaid
    isActive: { type: Boolean, default: true },
    isApproved: { type: Boolean, default: true }, // set false if you want admin approval flow

}, { timestamps: true });

// Hash before save (only if password modified)
affiliateUserSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        return next();
    } catch (err) {
        return next(err);
    }
});

affiliateUserSchema.methods.comparePassword = function (candidate) {
    return bcrypt.compare(candidate, this.password);
};

export default mongoose.models.AffiliateUser || mongoose.model("AffiliateUser", affiliateUserSchema);
