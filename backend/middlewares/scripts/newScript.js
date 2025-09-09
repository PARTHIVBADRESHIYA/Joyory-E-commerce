// scripts/backfillReferralCodes.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import crypto from "crypto";
import User from "../../models/User.js"; // adjust relative path

dotenv.config();

// ✅ Generate unique referral code
async function generateUniqueReferralCode() {
    let code, exists;
    do {
        code = crypto.randomBytes(4).toString("hex").toUpperCase(); // e.g. A1B2C3D4
        exists = await User.exists({ referralCode: code });
    } while (exists);
    return code;
}

// ✅ Backfill script
async function backfillReferralCodes() {
    try {
        // 1. Connect DB
        await mongoose.connect(process.env.MONGO_URI, { 
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ MongoDB connected");

        // 2. Find users without referral code (null or missing)
        const users = await User.find({
            $or: [
                { referralCode: { $exists: false } },
                { referralCode: null },
            ],
        });

        console.log(`Found ${users.length} users without referral code`);

        // 3. Assign codes
        for (const user of users) {
            user.referralCode = await generateUniqueReferralCode();
            await user.save();
            console.log(`✔ Assigned ${user.referralCode} to ${user.email}`);
        }

        console.log("🎉 Referral backfill completed successfully");
        process.exit(0);
    } catch (err) {
        console.error("❌ Referral backfill failed:", err);
        process.exit(1);
    }
}

backfillReferralCodes();
