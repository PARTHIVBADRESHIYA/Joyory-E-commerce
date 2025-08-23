// jobs/shiprocketTrackingJob.js
import cron from "node-cron";
import axios from "axios";
import Order from "../../../models/Order.js";
import { getShiprocketToken } from "../../../middlewares/services/shiprocket.js";

export function startTrackingJob() {
    // Runs every 30 minutes
    cron.schedule("*/30 * * * *", async () => {
        console.log("🚚 Running Shiprocket tracking job...");
        try {
            const pendingOrders = await Order.find({
                "shipment.awb_code": { $exists: true, $ne: null },
                orderStatus: { $nin: ["Delivered", "Cancelled"] }
            });

            if (!pendingOrders.length) {
                console.log("✅ No pending shipments to track");
                return;
            }

            const token = await getShiprocketToken();

            for (const order of pendingOrders) {
                try {
                    const res = await axios.get(
                        `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${order.shipment.awb_code}`,
                        { headers: { Authorization: `Bearer ${token}` } }
                    );

                    const trackingData = res.data.tracking_data;
                    if (trackingData) {
                        const currentStatus = trackingData.shipment_status;
                        order.shipment.status = currentStatus || order.shipment.status;
                        order.shipment.tracking_url =
                            trackingData.track_url || order.shipment.tracking_url;

                        // 🔹 Sync with order.orderStatus
                        if (currentStatus) {
                            const lower = currentStatus.toLowerCase();
                            if (lower.includes("in transit") || lower.includes("shipped")) {
                                order.orderStatus = "Shipped";
                            } else if (lower.includes("delivered")) {
                                order.orderStatus = "Delivered";
                            } else if (lower.includes("cancelled")) {
                                order.orderStatus = "Cancelled";
                            } else if (lower.includes("out for delivery")) {
                                order.orderStatus = "Out for Delivery";
                            }
                        }

                        // 🔹 Append to tracking history
                        if (!order.trackingHistory) order.trackingHistory = [];
                        order.trackingHistory.push({
                            status: currentStatus || "Unknown",
                            timestamp: new Date(),
                            location: trackingData.current_status_location || null
                        });

                        await order.save();
                        console.log(
                            `✅ Updated Order ${order.orderId} → ${order.orderStatus} (${order.shipment.status})`
                        );
                    }
                } catch (innerErr) {
                    console.error(
                        `❌ Error tracking order ${order.orderId}:`,
                        innerErr.response?.data || innerErr.message
                    );
                }
            }
        } catch (err) {
            console.error("❌ Tracking job failed:", err.message);
        }
    });
}
