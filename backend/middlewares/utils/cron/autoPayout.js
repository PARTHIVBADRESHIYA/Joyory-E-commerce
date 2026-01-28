import "../../../config/env.js";

import mongoose from "mongoose";
import axios from "axios";
import cron from "node-cron";
import Seller from "../../../models/sellers/Seller.js";
import Order from "../../../models/Order.js";
import PayoutLedger from "../../../models/PayoutLedger.js";

const RAZORPAYX_ACCOUNT = process.env.RAZORPAYX_ACCOUNT;
const RAZORPAYX_KEY = process.env.RAZORPAYX_KEY;
const RAZORPAYX_SECRET = process.env.RAZORPAYX_SECRET;
const RAZORPAYX_FUND_ACCOUNT_ID = process.env.RAZORPAYX_FUND_ID; // ✅ fallback

// --- Keep one persistent MongoDB connection ---
async function connectDB() {
    if (!mongoose.connection.readyState) {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB connected");
    }
}

// --- Main payout processing function ---
async function processPayouts() {
    try {
        await connectDB();

        const sellers = await Seller.find();
        console.log(`\n🕒 Running payout check at ${new Date().toLocaleString()}`);
        console.log(`Found ${sellers.length} sellers`);

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        for (const seller of sellers) {
            console.log(`\n➡️ Processing seller ${seller._id} (${seller.businessName})`);

            const fundAccountId = seller.fundAccountId;
            if (!fundAccountId) {
                console.log(`⚠️ Seller ${seller.businessName} has no fundAccountId, skipping`);
                continue;
            }


            if (!fundAccountId) {
                console.log(`⚠️ No fundAccountId (not even fallback), skipping payout`);
                continue;
            }

            const existingLedger = await PayoutLedger.findOne({
                seller: seller._id,
                periodStart: startOfDay,
                periodEnd: endOfDay,
            });

            if (existingLedger) {
                console.log(`⏭️ Ledger already exists for today, skipping`);
                continue;
            }

            const orders = await Order.find({
                "splitOrders.seller": seller._id,
                paid: true,
                createdAt: { $gte: startOfDay, $lte: endOfDay },
            });

            if (!orders.length) {
                console.log(`No paid orders for today`);
                continue;
            }

            // --- Compute net payable dynamically ---
            let grossAmount = 0;
            let commissionAmount = 0;
            let refunds = 0;
            const entries = [];

            for (const order of orders) {
                const splitOrder = order.splitOrders.find(
                    so => so.seller?.toString() === seller._id.toString()
                );
                if (!splitOrder) continue;

                grossAmount += splitOrder.amount;
                commissionAmount += splitOrder.amount * 0.1; // 10% commission
                refunds += splitOrder.refundAmount || 0;

                entries.push({
                    orderId: order._id.toString(),
                    type: "order",
                    amount: splitOrder.amount,
                });
            }

            const netPayable = grossAmount - commissionAmount - refunds;
            if (netPayable <= 0) {
                console.log(`No net payable for seller, skipping`);
                continue;
            }

            // --- Save ledger ---
            const ledger = new PayoutLedger({
                seller: seller._id,
                periodStart: startOfDay,
                periodEnd: endOfDay,
                grossAmount,
                commissionAmount,
                refunds,
                fees: 0,
                netPayable,
                status: "pending",
                entries,
            });
            await ledger.save();
            console.log(`📒 Ledger created: ₹${netPayable}`);

            // --- RazorpayX Payout ---
            const narration = `Payout to ${seller.businessName}`.substring(0, 30);
            try {
                const payoutRes = await axios.post(
                    "https://api.razorpay.com/v1/payouts",
                    {
                        account_number: RAZORPAYX_ACCOUNT,
                        fund_account_id: fundAccountId, // ✅ now always valid
                        amount: Math.round(netPayable * 100), // paise
                        currency: "INR",
                        mode: "IMPS",
                        purpose: "payout",
                        queue_if_low_balance: true,
                        reference_id: ledger._id.toString(),
                        narration,
                    },
                    { auth: { username: RAZORPAYX_KEY, password: RAZORPAYX_SECRET } }
                );

                ledger.status = "paid";
                ledger.gatewayTransactionId = payoutRes.data.id;
                ledger.processedAt = new Date(); // ✅ add this
                await ledger.save();
                console.log(`💰 Payout SUCCESS, txn: ${payoutRes.data.id}`);
            } catch (err) {
                ledger.status = "failed";
                await ledger.save();
                console.error(`❌ Payout FAILED:`, err.response?.data || err.message);
            }
        }

        console.log("✅ Payout check finished");
    } catch (err) {
        console.error("❌ Error in payout processing:", err);
    }
}

// --- Schedule to run every minute ---
cron.schedule("0 0 * * *", () => {
    processPayouts();
});

console.log("🚀 RazorpayX Payout Scheduler started (runs every minute)");
