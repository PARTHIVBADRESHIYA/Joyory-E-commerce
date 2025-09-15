import cron from "node-cron";
import Product from "../../../models/Product.js";

cron.schedule("* * * * *", async () => {
    const now = new Date();
    try {
        const products = await Product.find({
            isPublished: false,
            scheduledAt: { $lte: now }
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
        }
    } catch (err) {
        console.error("❌ Error in scheduler:", err);
    }
});
