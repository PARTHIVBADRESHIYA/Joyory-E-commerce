// cronJob.js
import cron from "node-cron";
import { deleteDraftOrders } from "../cleaunUpordersUtils.js";

// Runs every 24 hours → 00:00 midnight
cron.schedule("0 0 * * *", async () => {
    console.log("⏳ Running Daily Cleanup Job...");
    await deleteDraftOrders();
    console.log("✅ Cleanup Completed!");
});
