import mongoose from "mongoose";

const affiliatePayoutSchema = new mongoose.Schema({
    affiliateUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AffiliateUser",
        required: true
    },

    amount: { type: Number, required: true },

    method: { type: String, default: "manual" },   // UPI / Bank / cash / etc

    note: { type: String },

    earnings: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AffiliateEarning"
        }
    ] // 🔥 List of commission records included in this payout

}, { timestamps: true });

export default mongoose.model("AffiliatePayout", affiliatePayoutSchema);
