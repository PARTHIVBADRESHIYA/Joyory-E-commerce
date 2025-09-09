// import User from "../models/User.js";

// // ✅ Get current user's referral code
// // ✅ Get current user's referral code
// export const getReferralCode = async (req, res) => {
//     try {
//         // you already have user in req.user from protect()
//         const user = req.user;

//         if (!user) {
//             return res.status(404).json({ message: "User not found" });
//         }

//         if (!user.referralCode) {
//             return res.status(404).json({ message: "Referral code not generated yet" });
//         }

//         res.json({ referralCode: user.referralCode });
//     } catch (err) {
//         res.status(500).json({ message: "Error fetching referral code", error: err.message });
//     }
// };

// // ✅ Get history of people I referred
// export const getReferralHistory = async (req, res) => {
//     try {
//         const referredUsers = await User.find({ referredBy: req.user.id })
//             .select("name email createdAt walletBalance isVerified");

//         res.json({
//             count: referredUsers.length,
//             users: referredUsers,
//         });
//     } catch (err) {
//         res.status(500).json({ message: "Error fetching referral history", error: err.message });
//     }
// };





import User from "../models/User.js";
import ReferralConfig from "../models/ReferralConfig.js";

// ✅ Get current user's referral code + referral config

export const getReferralCode = async (req, res) => {
    try {
        const user = req.user;
        if (!user) return res.status(404).json({ message: "User not found" });

        if (!user.referralCode)
            return res.status(404).json({ message: "Referral code not generated yet" });

        const config = await ReferralConfig.findOne();
        if (!config) return res.status(500).json({ message: "Referral config missing" });

        res.json({
            referralCode: user.referralCode,
            rewards: {
                yourReward: `${config.rewardForReferrer} points for first purchase`,
                friendReward: `${config.rewardForReferee} points for first purchase`,
                minOrderAmount: config.minOrderAmount,
            },
            tiers: config.tiers.map((t) => ({
                milestone: t.milestone,
                reward: t.reward,
            })),
        });
    } catch (err) {
        res.status(500).json({
            message: "Error fetching referral code",
            error: err.message,
        });
    }
};
// ✅ Get history of people I referred + referral config
export const getReferralHistory = async (req, res) => {
    try {
        const referredUsers = await User.find({ referredBy: req.user.id })
            .select("name email createdAt walletBalance isVerified");

        // Fetch referral config
        const config = await ReferralConfig.findOne();

        res.json({
            count: referredUsers.length,
            users: referredUsers,
            config: config || {},
        });
    } catch (err) {
        res.status(500).json({
            message: "Error fetching referral history",
            error: err.message,
        });
    }
};
