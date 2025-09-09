import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import User from "../../models/User.js";
import Wallet from "../../models/Wallet.js";

const MONGO_URI = process.env.MONGO_URI || "your_mongo_connection_string";

const syncWalletToUser = async () => {
    try {
        await mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("Connected to MongoDB");

        const users = await User.find({});
        console.log(`Found ${users.length} users`);

        let updatedCount = 0;

        for (const user of users) {
            const wallet = await Wallet.findOne({ user: user._id });
            if (wallet) {
                user.rewardPoints = wallet.rewardPoints;
                user.joyoryCash = wallet.joyoryCash;
                await user.save();
                updatedCount++;
                console.log(`Updated user ${user.email}: points=${wallet.rewardPoints}, cash=${wallet.joyoryCash}`);
            }
        }

        console.log(`Migration complete. Updated ${updatedCount} users.`);
        mongoose.disconnect();
    } catch (err) {
        console.error("Migration failed:", err);
        mongoose.disconnect();
    }
};

syncWalletToUser();
