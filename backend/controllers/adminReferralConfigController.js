import ReferralConfig from "../models/ReferralConfig.js";
import ReferralCampaign from "../models/ReferralCampaign.js";
import crypto from "crypto";

const buildReferralLink = (promoCode) => {
    const baseUrl = (process.env.APP_URL || "https://joyory.com").replace(/\/+$/, "");
    return `${baseUrl}/signup?promo=${promoCode}`;
};


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

export const getReferralConfigCampaigns = async (req, res) => {
    try {
        const { search, page = 1, limit = 20 } = req.query;

        const filter = {};

        if (search) {
            filter.name = { $regex: search, $options: "i" };
        }

        const skip = (page - 1) * limit;

        const [campaignsRaw, total] = await Promise.all([
            ReferralCampaign.find(filter)
                .skip(skip)
                .limit(Number(limit))
                .sort({ createdAt: -1 })
                .lean(),

            ReferralCampaign.countDocuments(filter)
        ]);

        // Add referralLink to every record
        const campaigns = campaignsRaw.map(c => ({
            ...c,
            referralLink: buildReferralLink(c.promoCode)
        }));

        res.status(200).json({
            success: true,
            total,
            page: Number(page),
            limit: Number(limit),
            campaigns
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Failed to fetch referral campaigns",
            error: err.message
        });
    }
};

export const upsertReferralConfigCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            description,
            promoCode,
            referrerReward,
            refereeReward,
            minOrderAmount,
            isActive,
            expiresAt
        } = req.body;

        let campaign;

        if (id) {
            campaign = await ReferralCampaign.findByIdAndUpdate(
                id,
                {
                    name,
                    description,
                    promoCode,
                    referrerReward,
                    refereeReward,
                    minOrderAmount,
                    isActive,
                    expiresAt
                },
                { new: true }
            ).lean();
        } else {
            campaign = await ReferralCampaign.create({
                name,
                description,
                promoCode,
                referrerReward,
                refereeReward,
                minOrderAmount,
                isActive,
                expiresAt
            });
            campaign = campaign.toObject();
        }

        res.status(200).json({
            success: true,
            message: id ? "Campaign updated" : "Campaign created",
            campaign: {
                ...campaign,
                referralLink: buildReferralLink(campaign.promoCode)
            }
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Failed to upsert campaign",
            error: err.message
        });
    }
};

export const getReferralConfigCampaignById = async (req, res) => {
    try {
        const { id } = req.params;

        const campaign = await ReferralCampaign.findById(id).lean();

        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: "Campaign not found"
            });
        }

        res.json({
            success: true,
            campaign: {
                ...campaign,
                referralLink: buildReferralLink(campaign.promoCode)
            }
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Failed to fetch campaign",
            error: err.message
        });
    }
};

export const createReferralCampaign = async (req, res) => {
    try {
        const {
            name,
            description,
            promoCode,
            refereeReward,
            referrerReward,
            minOrderAmount,
            expiresAt
        } = req.body;

        const finalPromoCode = promoCode
            ? promoCode.toUpperCase().trim()
            : crypto.randomBytes(4).toString("hex").toUpperCase();

        const exists = await ReferralCampaign.findOne({ promoCode: finalPromoCode });
        if (exists) {
            return res.status(400).json({
                success: false,
                message: "Promo code already exists."
            });
        }

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

        res.status(201).json({
            success: true,
            message: "Referral campaign created",
            campaign: {
                ...campaign.toObject(),
                referralLink: buildReferralLink(finalPromoCode)
            }
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Failed to create campaign",
            error: err.message
        });
    }
};

export const deleteReferralCampaign = async (req, res) => {
    try {
        const { id } = req.params;

        const deleted = await ReferralCampaign.findByIdAndDelete(id);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: "Campaign not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Referral campaign deleted successfully"
        });

    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Failed to delete referral campaign",
            error: err.message
        });
    }
};
