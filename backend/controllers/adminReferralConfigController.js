import ReferralConfig from "../models/ReferralConfig.js";
import ReferralCampaign from "../models/ReferralCampaign.js";
import crypto from "crypto";

// GET current config
export const getReferralConfig = async (req, res) => {
    const config = await ReferralConfig.findOne();
    if (!config) return res.status(404).json({ message: "Referral config not found" });
    res.json(config);
};

// UPDATE or CREATE config
export const upsertReferralConfig = async (req, res) => {
    const { rewardForReferrer, rewardForReferee, minOrderAmount, tiers } = req.body;

    const config = await ReferralConfig.findOneAndUpdate(
        {},
        {
            rewardForReferrer,
            rewardForReferee,
            minOrderAmount,
            tiers,
        },
        { new: true, upsert: true }
    );

    res.json({ message: "Referral config updated", config });
};


// export const createReferralCampaign = async (req, res) => {
//     try {
//         const {
//             name,
//             description,
//             refereeReward,
//             referrerReward,
//             minOrderAmount,
//             expiresAt
//         } = req.body;

//         const promoCode = crypto.randomBytes(4).toString("hex").toUpperCase();

//         const campaign = await ReferralCampaign.create({
//             name,
//             description,
//             promoCode,
//             refereeReward,
//             referrerReward,
//             minOrderAmount,
//             expiresAt,
//             createdBy: req.user._id
//         });

//         return res.status(201).json({
//             success: true,
//             message: "Referral campaign created",
//             campaign,
//             referralLink: `${process.env.APP_URL}/signup?promo=${promoCode}`
//         });

//     } catch (err) {
//         console.error("Campaign create error:", err);
//         res.status(500).json({ success: false, message: "Failed to create campaign" });
//     }
// };

export const createReferralCampaign = async (req, res) => {
    try {
        const {
            name,
            description,
            promoCode,        // ✅ allow manual promoCode
            refereeReward,
            referrerReward,
            minOrderAmount,
            expiresAt
        } = req.body;

        // ✅ Use provided promoCode OR auto-generate one
        const finalPromoCode = promoCode
            ? promoCode.toUpperCase().trim()
            : crypto.randomBytes(4).toString("hex").toUpperCase();

        // ✅ Check if promoCode already exists
        const exists = await ReferralCampaign.findOne({ promoCode: finalPromoCode });
        if (exists) {
            return res.status(400).json({
                success: false,
                message: "Promo code already exists. Please choose a different one."
            });
        }

        // ✅ Create campaign
        const campaign = await ReferralCampaign.create({
            name,
            description,
            promoCode: finalPromoCode,
            refereeReward,
            referrerReward,
            minOrderAmount,
            expiresAt,
            createdBy: req.user?._id || null
        });

        // ✅ Generate referral link
        const referralLink = `${process.env.APP_URL || "https://joyory.com"}/signup?promo=${finalPromoCode}`;

        return res.status(201).json({
            success: true,
            message: "Referral campaign created",
            campaign,
            referralLink
        });

    } catch (err) {
        console.error("🔥 Campaign create error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to create campaign",
            error: err.message
        });
    }
};