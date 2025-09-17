import mongoose from "mongoose";
import Seller from "../../models/sellers/Seller.js";
import PayoutLedger from "../../models/PayoutLedger.js";
import { generatePayoutForSeller } from "../../middlewares/services/payoutService.js";

// ================= GET PAYOUTS =================
export const getPayouts = async (req, res) => {
    try {
        if (!req.seller || !req.seller._id) {
            return res.status(401).json({ message: "Unauthorized: Seller not found" });
        }

        // Directly use the seller ObjectId
        const payouts = await PayoutLedger.find({ seller: req.seller._id }).sort({ createdAt: -1 });

        if (!payouts.length) {
            return res.json({ message: "No payouts found for this seller", data: [] });
        }

        return res.json({ data: payouts });
    } catch (err) {
        console.error("Get payouts error:", err);
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};
// ================= REQUEST PAYOUT =================
export const requestPayout = async (req, res) => {
    try {
        const ledger = await generatePayoutForSeller(req.seller._id);
        return res.json({ message: "Payout ledger generated", ledger });
    } catch (err) {
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};
