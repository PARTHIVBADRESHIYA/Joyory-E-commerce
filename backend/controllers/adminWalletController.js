// import WalletConfig from "../models/WalletConfig.js";

// // GET /api/admin/wallet-config
// export const getWalletConfig = async (req, res) => {
//     try {
//         const config = await WalletConfig.findOne();
//         return res.json(config || {});
//     } catch (err) {
//         return res.status(500).json({ message: "Error reading config", error: err.message });
//     }
// };

// // PUT /api/admin/wallet-config
// export const upsertWalletConfig = async (req, res) => {
//     try {
//         const {
//             minAddAmount,
//             pointsToCurrencyRate,
//             maxRedeemPercentage,
//             cashbackOnAddPercentage,
//             expiryInDays,
//             minRedeemPoints,
//         } = req.body;

//         const config = await WalletConfig.findOneAndUpdate(
//             {},
//             {
//                 minAddAmount,
//                 pointsToCurrencyRate,
//                 maxRedeemPercentage,
//                 cashbackOnAddPercentage,
//                 expiryInDays,
//                 minRedeemPoints,
//             },
//             { upsert: true, new: true, setDefaultsOnInsert: true }
//         );

//         return res.json({ message: "Wallet config saved", config });
//     } catch (err) {
//         return res.status(500).json({ message: "Error saving config", error: err.message });
//     }
// };





import WalletConfig from "../models/WalletConfig.js";

// GET /api/admin/wallet-config
export const getWalletConfig = async (req, res) => {
    try {
        const config = await WalletConfig.findOne();
        return res.json(config || {});
    } catch (err) {
        return res.status(500).json({ message: "Error reading config", error: err.message });
    }
};

// PUT /api/admin/wallet-config
export const upsertWalletConfig = async (req, res) => {
    try {
        const {
            minAddAmount,
            pointsToCurrencyRate,
            maxRedeemPercentage,
            cashbackOnAddPercentage,
            expiryInDays,
            minRedeemPoints,
            addMoneyOptions, // ✅ new field: array of options [200, 400, ...]
        } = req.body;

        const config = await WalletConfig.findOneAndUpdate(
            {},
            {
                minAddAmount,
                pointsToCurrencyRate,
                maxRedeemPercentage,
                cashbackOnAddPercentage,
                expiryInDays,
                minRedeemPoints,
                addMoneyOptions, // ✅ save in DB
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        return res.json({ message: "Wallet config saved", config });
    } catch (err) {
        return res.status(500).json({ message: "Error saving config", error: err.message });
    }
};
