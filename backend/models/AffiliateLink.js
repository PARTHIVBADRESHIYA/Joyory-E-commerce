import mongoose from "mongoose";

const affiliateLinkSchema = new mongoose.Schema({
    affiliateUser: { type: mongoose.Schema.Types.ObjectId, ref: "AffiliateUser", required: true },
    linkName: { type: String, default: "" },
    shareUrl: { type: String }, // <-- auto-generated real URL

    // either productId OR externalUrl (one of them)
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    externalUrl: { type: String, default: null },

    slug: { type: String, required: true, unique: true, index: true }, // e.g. AFF_abc123
    clickCount: { type: Number, default: 0 },
    ordersGenerated: { type: Number, default: 0 },
    commissionEarned: { type: Number, default: 0 },

    meta: { type: Object, default: {} }, // store product snapshot (price/title) at creation
}, { timestamps: true });

export default mongoose.models.AffiliateLink || mongoose.model("AffiliateLink", affiliateLinkSchema);
