import Wallet from "../../models/Wallet.js";

export const getOrCreateWallet = async (userId) => {
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
        wallet = await Wallet.create({ user: userId });
    }
    return wallet;
};
