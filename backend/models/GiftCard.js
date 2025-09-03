import mongoose from "mongoose";

const giftCardSchema = new mongoose.Schema({
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: "GiftCardTemplate", required: true },
    code: { type: String, required: true, unique: true },
    pin: { type: String, required: true },
    amount: { type: Number, required: true },
    balance: { type: Number, required: true },
    expiryDate: { type: Date, required: true },
    recipient: {
        name: String,
        email: String,
        phone: String
    },
    sender: {
        name: String,
        phone: String
    },
    message: String,
    status: { type: String, enum: ["active", "redeemed", "expired"], default: "active" }
}, { timestamps: true });

export default mongoose.model("GiftCard", giftCardSchema);
