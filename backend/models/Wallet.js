import mongoose from "mongoose";

const walletSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    joyoryCash: { type: Number, default: 0 }, // real money
    rewardPoints: { type: Number, default: 0 }, // from referrals/purchases
    transactions: [
        {
            type: {
                type: String,
                enum: ["ADD_MONEY", "REFUND", "PURCHASE", "REWARD", "REDEEM"],
                required: true,
            },
            amount: { type: Number, required: true },
            mode: { type: String, enum: ["ONLINE", "RAZORPAY", "POINTS"], default: "ONLINE" },
            description: { type: String },
            createdAt: { type: Date, default: Date.now },
        },
    ],
}, { timestamps: true });

export default mongoose.model("Wallet", walletSchema);
