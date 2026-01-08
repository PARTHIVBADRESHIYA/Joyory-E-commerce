// cronJob.js
import cron from "node-cron";
import { deleteDraftOrders, deleteAbandonedPaymentOrders } from "../cleaunUpordersUtils.js";

// Runs every 24 hours → 00:00 midnight
cron.schedule("0 0 * * *", async () => {
    console.log("⏳ Running Daily Cleanup Job...");
    await deleteDraftOrders();
    console.log("✅ Cleanup Completed!");
});

// Every 30 minutes
cron.schedule("*/30 * * * *", async () => {
    console.log("⏳ Running Abandoned Payment Cleanup...");
    await deleteAbandonedPaymentOrders();
});
