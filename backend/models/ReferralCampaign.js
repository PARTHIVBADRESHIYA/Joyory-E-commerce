import mongoose from "mongoose";

const referralCampaignSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,

    promoCode: { type: String, required: true, unique: true }, // short code for URL

    refereeReward: { type: Number, default: 0 },    // amount to give new user
    referrerReward: { type: Number, default: 0 },   // amount to give promoter
    minOrderAmount: { type: Number, default: 0 },   // min first order value

    isActive: { type: Boolean, default: true },
    expiresAt: Date,

    // optional: which admin created it
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" }
}, { timestamps: true });

export default mongoose.model("ReferralCampaign", referralCampaignSchema);
