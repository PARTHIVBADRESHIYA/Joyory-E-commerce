import mongoose from "mongoose";

const tierSchema = new mongoose.Schema({
    milestone: { type: Number, required: true }, // e.g. 1, 3, 5
    reward: { type: String, required: true }, // e.g. "Free Shipping Voucher"
});

const referralConfigSchema = new mongoose.Schema(
    {
        rewardForReferrer: { type: Number, default: 200 }, // points
        rewardForReferee: { type: Number, default: 200 }, // points
        minOrderAmount: { type: Number, default: 999 },
        tiers: [tierSchema],
    },
    { timestamps: true }
);

export default mongoose.model("ReferralConfig", referralConfigSchema);
