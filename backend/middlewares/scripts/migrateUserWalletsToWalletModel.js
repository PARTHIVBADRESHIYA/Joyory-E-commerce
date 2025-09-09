import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../../models/User.js";
import Wallet from "../../models/Wallet.js";

dotenv.config();

(async () => {
    await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log("Connected");

    const users = await User.find({ $or: [{ walletBalance: { $exists: true } }, { walletBalance: { $gt: 0 } }] });
    console.log("Found", users.length);

    for (const u of users) {
        const existing = await Wallet.findOne({ user: u._id });
        if (!existing) {
            const w = await Wallet.create({
                user: u._id,
                joyoryCash: u.walletBalance || 0,
                rewardPoints: u.rewardPoints || 0,
                transactions: u.walletBalance ? [{
                    type: "MIGRATION",
                    amount: u.walletBalance,
                    mode: "ONLINE",
                    description: "Migrated from user.walletBalance"
                }] : []
            });
            console.log("Migrated", u.email, w._id);
        } else {
            console.log("Wallet exists for", u.email);
        }
    }

    process.exit(0);
})();
