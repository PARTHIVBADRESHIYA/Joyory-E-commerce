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
// export const getWallet = async (req, res) => {
//     try {
//         const wallet = await getOrCreateWallet(req.user._id);

//         // Fetch config for conversion rate
//         const config = (await WalletConfig.findOne()) || {};
//         const pointsRate = config.pointsToCurrencyRate ?? 0.1;

//         const pointsValue = wallet.rewardPoints * pointsRate;

//         return res.json({
//             joyoryCash: wallet.joyoryCash,
//             rewardPoints: wallet.rewardPoints,
//             pointsValue,
//             walletBalance: wallet.joyoryCash + pointsValue,
//             transactions: wallet.transactions
//                 .slice()
//                 .reverse()
//                 .slice(0, 50),
//         });
//     } catch (err) {
//         return res.status(500).json({ message: "Error fetching wallet", error: err.message });
//     }
// };

// // GET /api/wallet/options
// export const getWalletOptions = async (req, res) => {
//     try {
//         // You can also load this from DB config if you want it dynamic
//         const options = [200, 400, 500, 1000];
//         return res.json({ options });
//     } catch (err) {
//         return res.status(500).json({ message: "Error fetching wallet options", error: err.message });
//     }
// };



// GET /api/wallet
export const getWallet = async (req, res) => {
    try {
        const wallet = await getOrCreateWallet(req.user._id);

        // Fetch config (admin controls this)
        const config = (await WalletConfig.findOne()) || {};
        const pointsRate = config.pointsToCurrencyRate ?? 0.1;

        const pointsValue = wallet.rewardPoints * pointsRate;

        return res.json({
            joyoryCash: wallet.joyoryCash,
            rewardPoints: wallet.rewardPoints,
            pointsValue,
            walletBalance: wallet.joyoryCash + pointsValue,
            transactions: wallet.transactions
                .slice()
                .reverse()
                .slice(0, 50),
            addMoneyOptions: config.addMoneyOptions || [200, 400, 500, 100], // ✅ dynamic from admin
        });
    } catch (err) {
        return res.status(500).json({ message: "Error fetching wallet", error: err.message });
    }
};

// GET /api/wallet/options
export const getWalletOptions = async (req, res) => {
    try {
        const config = (await WalletConfig.findOne()) || {};
        return res.json({
            options: config.addMoneyOptions || [200, 400, 500, 100], // ✅ fallback if admin not set
        });
    } catch (err) {
        return res.status(500).json({ message: "Error fetching wallet options", error: err.message });
    }
};


// POST /api/wallet/create-order
export const createWalletOrder = async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: "Invalid amount" });
        }

        const config = (await WalletConfig.findOne()) || {};
        if (config.minAddAmount && amount < config.minAddAmount) {
            return res
                .status(400)
                .json({ message: `Minimum add amount is ${config.minAddAmount}` });
        }

        const userId = req.user?._id?.toString() || "guest_user";

        // Shorten receipt id
        const receipt = `wallet_${userId.slice(-6)}_${Date.now().toString().slice(-6)}`;

        const options = {
            amount: amount * 100, // ✅ Razorpay requires paise
            currency: "INR",
            receipt,
            notes: {
                purpose: "Wallet Top-up",
                userId,
            },
        };

        const order = await razorpay.orders.create(options);

        return res.json({ order });
    } catch (err) {
        return res.status(500).json({ message: "Error creating Razorpay order", error: err.message });
    }
};

// POST /api/wallet/verify-payment
export const verifyWalletPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !amount) {
            return res.status(400).json({ message: "Invalid Razorpay payload" });
        }

        // ✅ Verify signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ message: "Payment verification failed" });
        }

        const wallet = await getOrCreateWallet(req.user._id);

        // ✅ Credit actual ₹ amount (not paise)
        const creditedAmount = amount / 100;

        wallet.joyoryCash += creditedAmount;
        wallet.transactions.push({
            type: "ADD_MONEY",
            amount: creditedAmount,
            mode: "RAZORPAY",
            description: `Wallet Top-up - paymentId:${razorpay_payment_id}`,
        });

        // Cashback if configured
        const config = (await WalletConfig.findOne()) || {};
        if (config.cashbackOnAddPercentage) {
            const cashbackAmount = Math.floor((creditedAmount * config.cashbackOnAddPercentage) / 100);
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

        return res.json({ message: "Wallet top-up successful", wallet });
    } catch (err) {
        return res.status(500).json({ message: "Error verifying payment", error: err.message });
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
