import mongoose from "mongoose";
import dotenv from "dotenv";
import Seller from "../models/Seller.js"; // adjust path if needed

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const TEST_FUND_ACCOUNT_ID = "00000000000001"; // your test fund account

async function migrateFundAccounts() {
    try {
        await mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ MongoDB connected");

        // Find all sellers without a fundAccountId
        const sellersToUpdate = await Seller.find({ fundAccountId: { $exists: false } });

        console.log(`Found ${sellersToUpdate.length} sellers without fundAccountId`);

        for (const seller of sellersToUpdate) {
            seller.fundAccountId = TEST_FUND_ACCOUNT_ID;
            await seller.save();
            console.log(`Updated seller ${seller._id} with fundAccountId`);
        }

        console.log("✅ Migration completed");
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration failed:", err);
        process.exit(1);
    }
}

migrateFundAccounts();
