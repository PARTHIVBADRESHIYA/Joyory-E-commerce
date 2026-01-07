import User from "../../../models/User.js";
import dayjs from "dayjs";
import { sendAbandonedCartEmail } from "../../utils/emailService.js";
import cron from "node-cron";

export const runAbandonedCartCron = async () => {
    const now = dayjs();

    const users = await User.find({
        "abandonedCart.isActive": true,
        cart: { $exists: true, $not: { $size: 0 } }
    }).select("email name cart abandonedCart");

    for (const user of users) {

        if (user.abandonedCart.checkoutStartedAt) continue;

        const lastUpdate = dayjs(user.abandonedCart.lastUpdatedAt);
        const diffHours = now.diff(lastUpdate, "hour");

        // 🟡 STAGE 1 — 1 hour
        if (diffHours >= 1 && !user.abandonedCart.emailStages?.stage1SentAt) {
            await sendAbandonedCartEmail(user, 1);
            user.abandonedCart.emailStages.stage1SentAt = new Date();
        }

        // 🟠 STAGE 2 — 24 hours
        else if (diffHours >= 24 && !user.abandonedCart.emailStages?.stage2SentAt) {
            await sendAbandonedCartEmail(user, 2);
            user.abandonedCart.emailStages.stage2SentAt = new Date();
        }

        // 🔴 STAGE 3 — 72 hours
        else if (diffHours >= 72 && !user.abandonedCart.emailStages?.stage3SentAt) {
            await sendAbandonedCartEmail(user, 3);
            user.abandonedCart.emailStages.stage3SentAt = new Date();
        }

        await user.save();
    }
};

cron.schedule("*/15 * * * *", async () => {
    await runAbandonedCartCron();
    console.log("✅ Abandoned Cart Cron Job Completed");
});