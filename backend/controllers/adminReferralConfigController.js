import ReferralConfig from "../models/ReferralConfig.js";

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
