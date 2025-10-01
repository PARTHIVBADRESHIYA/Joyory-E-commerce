
import mongoose from "mongoose";

const PaymentMethodSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },         // Display name e.g. "Credit/Debit Card", "UPI", "Cash on Delivery"
        key: { type: String, required: true, unique: true }, // Unique key e.g. "card", "upi", "cod", "giftcard"
        type: { type: String, enum: ["online", "offline", "wallet"], required: true },
        description: { type: String },                  // Optional info for admin/frontend
        config: { type: mongoose.Schema.Types.Mixed, default: {} }, // Extra settings (like { allowSavedCards: true })
        isActive: { type: Boolean, default: true },     // Toggle availability
        order: { type: Number, default: 0 },            // For frontend sorting
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    },
    { timestamps: true }
);

export default mongoose.model("PaymentMethod", PaymentMethodSchema);

    