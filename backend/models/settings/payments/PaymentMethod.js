import mongoose from "mongoose";

const PaymentMethodSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        key: { type: String, required: true, unique: true, index: true },
        type: { type: String, enum: ["online", "offline", "wallet"], required: true },
        description: { type: String },
        config: { type: mongoose.Schema.Types.Mixed, default: {} }, // e.g. { upiId: "xxx@upi" }
        isActive: { type: Boolean, default: true },
        order: { type: Number, default: 0 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    },
    { timestamps: true }
);

export default mongoose.model("PaymentMethod", PaymentMethodSchema);
