import cron from "node-cron";
import Product from "../../../models/Product.js";

cron.schedule("* * * * *", async () => {
    const now = new Date();
    console.log("⏰ Cron job triggered at:", now.toISOString(), "| Local:", now.toLocaleString());
    try {
        const products = await Product.find({
            isPublished: false,
            scheduledAt: { $lte: now }
        });

        console.log("🔍 Scheduler check:", {
            now,
            totalChecked: products.length
        });

        if (products.length > 0) {
            console.log("⏰ Found products to publish:", products.map(p => ({
                name: p.name,
                scheduledAt: p.scheduledAt,
                now
            })));

            const result = await Product.updateMany(
                { isPublished: false, scheduledAt: { $lte: now } },
                { $set: { isPublished: true, scheduledAt: null } }
            );

            console.log(`✅ Published ${result.modifiedCount} scheduled products`);
        } else {
            console.log("⚠️ No products to publish this minute.");
        }
    } catch (err) {
        console.error("❌ Error in scheduler:", err);
    }
});
