import mongoose from "mongoose";

const affiliateEarningSchema = new mongoose.Schema({
    affiliateUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AffiliateUser",
        required: true
    },

    affiliateLink: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AffiliateLink",
        required: true
    },

    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        required: true
    },

    orderNumber: { type: String, required: true },

    orderAmount: { type: Number, required: true },
    commission: { type: Number, required: true },

    status: {
        type: String,
        enum: ["pending", "approved", "rejected", "paid"],
        default: "pending"
    },

    note: { type: String }, // optional admin note

}, { timestamps: true });

export default mongoose.model("AffiliateEarning", affiliateEarningSchema);
