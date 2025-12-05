import mongoose from "mongoose";

const affiliateOrderSchema = new mongoose.Schema({
    affiliateUser: { type: mongoose.Schema.Types.ObjectId, ref: "AffiliateUser", required: true },
    affiliateLink: { type: mongoose.Schema.Types.ObjectId, ref: "AffiliateLink", default: null },

    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },
    commission: { type: Number, required: true }, // amount credited for this order
    orderValue: { type: Number, required: true },

    status: { type: String, enum: ["pending", "confirmed", "cancelled", "paid"], default: "pending" },
}, { timestamps: true });

export default mongoose.models.AffiliateOrder || mongoose.model("AffiliateOrder", affiliateOrderSchema);
