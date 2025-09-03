import mongoose from "mongoose";

const giftCardTemplateSchema = new mongoose.Schema({
    title: { type: String, required: true },   // Birthday, Friendship Day, etc.
    description: { type: String },
    image: { type: String, required: true },   // template image
    designs: [String],                         // optional multiple design URLs
    minAmount: { type: Number, default: 100 },
    maxAmount: { type: Number, default: 10000 },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model("GiftCardTemplate", giftCardTemplateSchema);
