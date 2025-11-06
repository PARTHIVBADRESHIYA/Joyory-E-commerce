import cron from "node-cron";
import { retryFailedShipments } from "../../services/shiprocket.js";

// Retry every 10 minutes
cron.schedule("*/10 * * * *", async () => {
    console.log("⏱ Running Shiprocket failed shipments retry...");
    try {
        await retryFailedShipments();
    } catch (err) {
        console.error("🚨 Error retrying shipments:", err.message);
    }
});
