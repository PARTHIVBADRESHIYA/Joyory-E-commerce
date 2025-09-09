import mongoose from "mongoose";

const walletConfigSchema = new mongoose.Schema({
    minAddAmount: { type: Number, default: 100 }, // min top-up
    pointsToCurrencyRate: { type: Number, default: 0.1}, // 1 point = ₹1 (admin can change)
    maxRedeemPercentage: { type: Number, default: 20 }, // max % of order that can be paid with points
    cashbackOnAddPercentage: { type: Number, default: 0 }, // optional cashback on add-money
    expiryInDays: { type: Number, default: 365 }, // expiry for points (optional)
    minRedeemPoints: { type: Number, default: 10 }, // min points to redeem
}, { timestamps: true });

export default mongoose.model("WalletConfig", walletConfigSchema);
