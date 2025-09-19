// schedulers/promotionScheduler.js
import cron from "node-cron";
import Promotion from "../../../models/Promotion.js";

cron.schedule("* * * * *", async () => {
    const now = new Date();
    console.log("⏰ Promotion scheduler running:", now.toISOString());

    try {
        const promotions = await Promotion.find({ isScheduled: true });

        for (const promo of promotions) {
            const newStatus =
                now < promo.startDate ? "upcoming" :
                    now > promo.endDate ? "expired" :
                        "active";

            if (promo.status !== newStatus) {
                promo.status = newStatus;
                await promo.save();
                console.log(`✅ Promotion "${promo.campaignName}" updated to ${newStatus}`);
            }
        }
    } catch (err) {
        console.error("❌ Error in promotion scheduler:", err);
    }
});
