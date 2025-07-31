import Address from "../../models/user/Address.js";

export const addOrUpdateAddress = async (req, res) => {
    try {
        const userId = req.user._id;
        const addressData = req.body;

        let address = await Address.findOne({ user: userId });

        if (address) {
            await Address.findOneAndUpdate({ user: userId }, addressData, { new: true });
        } else {
            address = await Address.create({ ...addressData, user: userId });
        }

        res.status(200).json({ message: "✅ Address saved", address });
    } catch (err) {
        res.status(500).json({ message: "❌ Failed to save address", error: err.message });
    }
};

export const getUserAddress = async (req, res) => {
    try {
        const address = await Address.findOne({ user: req.user._id });
        res.status(200).json({ address });
    } catch (err) {
        res.status(500).json({ message: "❌ Failed to fetch address", error: err.message });
    }
};
