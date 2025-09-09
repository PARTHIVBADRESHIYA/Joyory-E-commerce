// import Wallet from "../../models/Wallet.js";
// import WalletConfig from "../../models/WalletConfig.js";
// import { getOrCreateWallet } from "../../middlewares/utils/walletHelpers.js";

// // GET /api/wallet
// export const getWallet = async (req, res) => {
//     try {
//         const wallet = await getOrCreateWallet(req.user._id);
//         const config = await WalletConfig.findOne() || {};
//         const pointsRate = config.pointsToCurrencyRate ?? 1;
//         const pointsValue = wallet.rewardPoints * pointsRate;
//         return res.json({
//             joyoryCash: wallet.joyoryCash,
//             rewardPoints: wallet.rewardPoints,
//             pointsValue,
//             walletBalance: wallet.joyoryCash + pointsValue,
//             transactions: wallet.transactions.slice().reverse().slice(0, 50), // latest 50
//         });
//     } catch (err) {
//         return res.status(500).json({ message: "Error fetching wallet", error: err.message });
//     }
// };

// // POST /api/wallet/add-money
// // NOTE: call this after payment success; provide amount and paymentMeta (id).
// export const addMoney = async (req, res) => {
//     try {
//         const { amount, paymentMeta } = req.body;
//         if (!amount || amount <= 0) return res.status(400).json({ message: "Invalid amount" });

//         const config = await WalletConfig.findOne() || {};
//         if (config.minAddAmount && amount < config.minAddAmount) {
//             return res.status(400).json({ message: `Minimum add amount is ${config.minAddAmount}` });
//         }

//         const wallet = await getOrCreateWallet(req.user._id);
//         wallet.joyoryCash += amount;
//         wallet.transactions.push({
//             type: "ADD_MONEY",
//             amount,
//             mode: paymentMeta?.provider || "ONLINE",
//             description: `Add money - paymentId:${paymentMeta?.paymentId || "N/A"}`,
//         });

//         // cashback on add-money (as points or cash, choose policy). I'll add cashback as points.
//         if (config.cashbackOnAddPercentage) {
//             const cashbackAmount = Math.floor((amount * config.cashbackOnAddPercentage) / 100);
//             if (cashbackAmount > 0) {
//                 wallet.rewardPoints += cashbackAmount; // admin may prefer cashback to cash; here it's points
//                 wallet.transactions.push({
//                     type: "REWARD",
//                     amount: cashbackAmount,
//                     mode: "ONLINE",
//                     description: `Cashback on add-money (${config.cashbackOnAddPercentage}%)`,
//                 });
//             }
//         }

//         await wallet.save();
//         return res.json({ message: "Money added to wallet", wallet });
//     } catch (err) {
//         return res.status(500).json({ message: "Error adding money", error: err.message });
//     }
// };

// // POST /api/wallet/redeem
// // body: { points, orderId, orderAmount } -> returns { appliedAmount } to be deducted from order
// export const redeemPoints = async (req, res) => {
//     try {
//         const { points, orderId, orderAmount } = req.body;
//         if (!points || points <= 0) return res.status(400).json({ message: "Invalid points" });

//         const config = await WalletConfig.findOne() || {};
//         if (points < (config.minRedeemPoints || 0)) {
//             return res.status(400).json({ message: `Minimum redeem points: ${config.minRedeemPoints}` });
//         }

//         const wallet = await getOrCreateWallet(req.user._id);
//         if (wallet.rewardPoints < points) return res.status(400).json({ message: "Insufficient points" });

//         const pointsRate = config.pointsToCurrencyRate ?? 1;
//         const currencyValue = points * pointsRate;

//         // enforce max redeem percentage of order
//         if (orderAmount && config.maxRedeemPercentage) {
//             const maxAllowed = (orderAmount * config.maxRedeemPercentage) / 100;
//             if (currencyValue > maxAllowed) {
//                 return res.status(400).json({
//                     message: `You can redeem up to ${config.maxRedeemPercentage}% of order (${maxAllowed} ₹).`,
//                 });
//             }
//         }

//         // deduct points
//         wallet.rewardPoints -= points;
//         wallet.transactions.push({
//             type: "REDEEM",
//             amount: points,
//             mode: "POINTS",
//             description: `Redeemed for order ${orderId || "N/A"} -> ₹${currencyValue}`,
//         });

//         await wallet.save();

//         return res.json({ message: "Points redeemed", appliedAmount: currencyValue, wallet });
//     } catch (err) {
//         return res.status(500).json({ message: "Error redeeming points", error: err.message });
//     }
// };

// // POST /api/wallet/refund-to-wallet
// // Admin or orders refund logic calls this to put money into wallet
// export const refundToWallet = async (req, res) => {
//     try {
//         const { userId, amount, reason } = req.body;
//         if (!userId || !amount || amount <= 0) return res.status(400).json({ message: "Invalid input" });

//         const wallet = await getOrCreateWallet(userId);
//         wallet.joyoryCash += amount;
//         wallet.transactions.push({
//             type: "REFUND",
//             amount,
//             mode: "ONLINE",
//             description: reason || "Order refund to wallet",
//         });

//         await wallet.save();
//         return res.json({ message: "Refund credited to wallet", wallet });
//     } catch (err) {
//         return res.status(500).json({ message: "Error refunding", error: err.message });
//     }
// };

// // Utility: add reward points (used by verifyEmailOtp or other reward triggers)
// export const addRewardPoints = async ({ userId, points = 0, description = "Reward" }) => {
//     if (!userId || !points) return null;
//     const wallet = await getOrCreateWallet(userId);
//     wallet.rewardPoints += points;
//     wallet.transactions.push({
//         type: "REWARD",
//         amount: points,
//         mode: "POINTS",
//         description,
//     });
//     await wallet.save();
//     return wallet;
// };
































import Wallet from "../../models/Wallet.js";
import WalletConfig from "../../models/WalletConfig.js";
import { getOrCreateWallet } from "../../middlewares/utils/walletHelpers.js";
import Razorpay from "razorpay";
import crypto from "crypto";

// 🔑 initialize razorpay instance
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ========================== USER SIDE ========================== //

// GET /api/wallet
export const getWallet = async (req, res) => {
    try {
        const wallet = await getOrCreateWallet(req.user._id);

        // Fetch config for conversion rate
        const config = (await WalletConfig.findOne()) || {};
        const pointsRate = config.pointsToCurrencyRate ?? 0.1; // example: 1 point = 0.1 ₹

        // Convert reward points to currency
        const pointsValue = wallet.rewardPoints * pointsRate;

        return res.json({
            joyoryCash: wallet.joyoryCash,              // actual wallet money
            rewardPoints: wallet.rewardPoints,          // raw points
            pointsValue: pointsValue,                   // points in ₹
            walletBalance: wallet.joyoryCash + pointsValue, // total usable balance
            transactions: wallet.transactions
                .slice()
                .reverse()
                .slice(0, 50), // latest 50 transactions
        });
    } catch (err) {
        return res.status(500).json({ message: "Error fetching wallet", error: err.message });
    }
};


export const createWalletOrder = async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            console.warn("Invalid amount:", amount);
            return res.status(400).json({ message: "Invalid amount" });
        }

        const config = (await WalletConfig.findOne()) || {};
        if (config.minAddAmount && amount < config.minAddAmount) {
            console.warn("Amount below minimum:", amount);
            return res
                .status(400)
                .json({ message: `Minimum add amount is ${config.minAddAmount}` });
        }

        // Use req.user if available, else fallback for Postman
        const userId = req.user?._id?.toString() || "dummy_user";

        // Shorten receipt to <= 40 chars
        const shortUserId = userId.slice(-10);
        const shortTimestamp = Date.now().toString().slice(-6);
        const receipt = `wallet_${shortUserId}_${shortTimestamp}`;

        const options = {
            amount: amount * 1,
            currency: "INR",
            receipt: receipt,
            notes: {
                purpose: "Wallet Top-up",
                userId: userId,
            },
        };

        const order = await razorpay.orders.create(options);
        console.info("Razorpay order created:", order.id);

        return res.json({ order });
    } catch (err) {
        console.error("Razorpay order creation failed:", err);
        return res
            .status(500)
            .json({ message: "Error creating Razorpay order", error: err.message });
    }
};

// -------------------------
// STEP 2: Verify Payment & Credit Wallet
// POST /api/wallet/verify-payment { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount }
// -------------------------
export const verifyWalletPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !amount) {
            console.warn("Invalid Razorpay payload:", req.body);
            return res.status(400).json({ message: "Invalid Razorpay payload" });
        }

        // Verify signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            console.warn("Payment verification failed:", { razorpay_order_id, razorpay_payment_id });
            return res.status(400).json({ message: "Payment verification failed" });
        }

        // Get or create wallet
        const wallet = await getOrCreateWallet(req.user._id);

        // Credit wallet
        wallet.joyoryCash += amount;
        wallet.transactions.push({
            type: "ADD_MONEY",
            amount,
            mode: "RAZORPAY",
            description: `Wallet Top-up - paymentId:${razorpay_payment_id}`,
        });

        // Add cashback if configured
        const config = (await WalletConfig.findOne()) || {};
        if (config.cashbackOnAddPercentage) {
            const cashbackAmount = Math.floor((amount * config.cashbackOnAddPercentage) / 100);
            if (cashbackAmount > 0) {
                wallet.rewardPoints += cashbackAmount;
                wallet.transactions.push({
                    type: "REWARD",
                    amount: cashbackAmount,
                    mode: "POINTS",
                    description: `Cashback on wallet top-up (${config.cashbackOnAddPercentage}%)`,
                });
            }
        }

        await wallet.save();
        console.info("Wallet top-up successful for user:", req.user._id);

        return res.json({ message: "Wallet top-up successful", wallet });
    } catch (err) {
        console.error("Error verifying wallet payment:", err);
        return res
            .status(500)
            .json({ message: "Error verifying payment", error: err.message });
    }
};
// ========================== EXISTING FEATURES ========================== //

// POST /api/wallet/redeem
export const redeemPoints = async (req, res) => {
    try {
        const { points, orderId, orderAmount } = req.body;
        if (!points || points <= 0)
            return res.status(400).json({ message: "Invalid points" });

        const config = (await WalletConfig.findOne()) || {};
        if (points < (config.minRedeemPoints || 0)) {
            return res
                .status(400)
                .json({ message: `Minimum redeem points: ${config.minRedeemPoints}` });
        }

        const wallet = await getOrCreateWallet(req.user._id);
        if (wallet.rewardPoints < points)
            return res.status(400).json({ message: "Insufficient points" });

        const pointsRate = config.pointsToCurrencyRate ?? 1;
        const currencyValue = points * pointsRate;

        if (orderAmount && config.maxRedeemPercentage) {
            const maxAllowed = (orderAmount * config.maxRedeemPercentage) / 100;
            if (currencyValue > maxAllowed) {
                return res.status(400).json({
                    message: `You can redeem up to ${config.maxRedeemPercentage}% of order (${maxAllowed} ₹).`,
                });
            }
        }

        wallet.rewardPoints -= points;
        wallet.transactions.push({
            type: "REDEEM",
            amount: points,
            mode: "POINTS",
            description: `Redeemed for order ${orderId || "N/A"} -> ₹${currencyValue}`,
        });

        await wallet.save();
        return res.json({
            message: "Points redeemed",
            appliedAmount: currencyValue,
            wallet,
        });
    } catch (err) {
        return res
            .status(500)
            .json({ message: "Error redeeming points", error: err.message });
    }
};

// POST /api/wallet/refund-to-wallet
export const refundToWallet = async (req, res) => {
    try {
        const { userId, amount, reason } = req.body;
        if (!userId || !amount || amount <= 0)
            return res.status(400).json({ message: "Invalid input" });

        const wallet = await getOrCreateWallet(userId);
        wallet.joyoryCash += amount;
        wallet.transactions.push({
            type: "REFUND",
            amount,
            mode: "ONLINE",
            description: reason || "Order refund to wallet",
        });

        await wallet.save();
        return res.json({ message: "Refund credited to wallet", wallet });
    } catch (err) {
        return res
            .status(500)
            .json({ message: "Error refunding", error: err.message });
    }
};

// // Utility: add reward points
// export const addRewardPoints = async ({
//     userId,
//     points = 0,
//     description = "Reward",
// }) => {
//     if (!userId || !points) return null;
//     const wallet = await getOrCreateWallet(userId);
//     wallet.rewardPoints += points;
//     wallet.transactions.push({
//         type: "REWARD",
//         amount: points,
//         mode: "POINTS",
//         description,
//     });
//     await wallet.save();
//     return wallet;
// };


export const addRewardPoints = async ({
    userId,
    points = 0,
    description = "Reward",
}) => {
    if (!userId || !points) return null;

    // get or create wallet
    const wallet = await getOrCreateWallet(userId);
    wallet.rewardPoints += points;
    wallet.transactions.push({
        type: "REWARD",
        amount: points,
        mode: "POINTS",
        description,
    });
    await wallet.save();

    // update User document too
    const user = await User.findById(userId);
    if (user) {
        user.rewardPoints = wallet.rewardPoints;
        user.joyoryCash = wallet.joyoryCash;
        await user.save();
    }

    return wallet;
};
