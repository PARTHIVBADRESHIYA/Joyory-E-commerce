// middlewares/scripts/migrateReviews.js
import mongoose from "mongoose";
import Review from "../../models/Review.js";
import dotenv from "dotenv";

dotenv.config();

const migrateReviews = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected to DB");

        const reviews = await Review.find();
        console.log(`🔍 Found ${reviews.length} reviews to migrate`);

        const dummyUserId = new mongoose.Types.ObjectId("000000000000000000000000");

        let migrated = 0;
        for (const r of reviews) {
            // Skip invalid reviews without productId
            if (!r.productId) {
                console.warn(`⏩ Skipping review ${r._id} (no productId)`);
                continue;
            }

            // Patch missing customer
            if (!r.customer) {
                console.warn(`⚠️ Review ${r._id} missing customer → assigning Anonymous`);
                r.customer = dummyUserId;
            }

            // Patch missing comment
            if (!r.comment || r.comment.trim() === "") {
                console.warn(`⚠️ Review ${r._id} missing comment → assigning placeholder`);
                r.comment = "No comment provided.";
            }

            // Ensure defaults
            r.status = "Active";
            if (typeof r.helpfulVotes !== "number") r.helpfulVotes = 0;
            if (!r.reactions) {
                r.reactions = { like: 0, love: 0, funny: 0, angry: 0 };
            }
            if (!r.reports) r.reports = [];

            await r.save();
            migrated++;
        }

        console.log(`✅ Migration complete. Migrated ${migrated} reviews`);
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration failed:", err);
        process.exit(1);
    }
};

migrateReviews();
