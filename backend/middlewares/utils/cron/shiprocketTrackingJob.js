
// // middlewares/utils/cron/shiprocketTrackingJob.js
// import cron from "node-cron";
// import axios from "axios";
// import Order from "../../../models/Order.js";
// import { getShiprocketToken } from "../../services/shiprocket.js";

// async function trackShipments() {
//     try {
//         const pendingOrders = await Order.find({
//             "shipment.awb_code": { $exists: true, $ne: null },
//             orderStatus: { $nin: ["Delivered", "Cancelled"] }
//         });

//         if (!pendingOrders.length) return;

//         const token = await getShiprocketToken();

//         await Promise.allSettled(
//             pendingOrders.map(async (order) => {
//                 try {
//                     const res = await axios.get(
//                         `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${order.shipment.awb_code}`,
//                         { headers: { Authorization: `Bearer ${token}` } }
//                     );

//                     if (res.data?.tracking_data?.track_url && !order.shipment.tracking_url) {
//                         order.shipment.tracking_url = res.data.tracking_data.track_url;
//                     }

//                     const trackingData = res.data.tracking_data;
//                     if (!trackingData) return;

//                     const currentStatus = trackingData.shipment_status;

//                     // ✅ update shipment info
//                     if (currentStatus) {
//                         order.shipment.status = currentStatus;
//                     }
//                     order.shipment.tracking_url = trackingData.track_url || order.shipment.tracking_url;

//                     // ✅ map orderStatus from shipment_status
//                     if (currentStatus) {
//                         const lower = String(currentStatus).toLowerCase();
//                         if (lower.includes("in transit") || lower.includes("shipped")) {
//                             order.orderStatus = "Shipped";
//                         } else if (lower.includes("out for delivery")) {
//                             order.orderStatus = "Out for Delivery";
//                         } else if (lower.includes("delivered")) {
//                             order.orderStatus = "Delivered";
//                         } else if (lower.includes("cancelled")) {
//                             order.orderStatus = "Cancelled";
//                         }
//                     }


//                     // ✅ update tracking history only if we have a valid new status
//                     if (currentStatus) {
//                         if (!order.trackingHistory) order.trackingHistory = [];

//                         const lastEntry = order.trackingHistory[order.trackingHistory.length - 1];

//                         // prevent duplicate spam: only push if status changed
//                         if (!lastEntry || lastEntry.status !== currentStatus) {
//                             order.trackingHistory.push({
//                                 status: currentStatus,
//                                 timestamp: new Date(),
//                                 location: trackingData.current_status_location || undefined
//                             });
//                         }
//                     }

//                     await order.save();
//                 } catch (err) {
//                     console.error(
//                         `❌ [Shiprocket] Error tracking order ${order._id}:`,
//                         err.response?.data || err.message
//                     );
//                 }
//             })
//         );
//     } catch (err) {
//         console.error("❌ [Shiprocket] Tracking job failed:", err.message);
//     }
// }

// // 🔹 Start cron job without blocking server
// export function startTrackingJob() {
//     cron.schedule(
//         "*/30 * * * *",
//         () => {
//             trackShipments().catch((err) =>
//                 console.error("❌ Tracking error:", err.message)
//             );
//         },
//         {
//             scheduled: true,
//             timezone: "Asia/Kolkata"
//         }
//     );

//     console.log("⏳ [Shiprocket] Tracking job scheduled (every 30 min, async)");
// }




// middlewares/utils/cron/shiprocketTrackingJob.js
import cron from "node-cron";
import axios from "axios";
import Order from "../../../models/Order.js";
import { getShiprocketToken } from "../../services/shiprocket.js";

async function trackShipments() {
    try {
        const pendingOrders = await Order.find({
            "shipment.awb_code": { $exists: true, $ne: null },
            orderStatus: { $nin: ["Delivered", "Cancelled"] }
        });

        if (!pendingOrders.length) return;

        const token = await getShiprocketToken();

        await Promise.allSettled(
            pendingOrders.map(async (order) => {
                try {
                    const res = await axios.get(
                        `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${order.shipment.awb_code}`,
                        { headers: { Authorization: `Bearer ${token}` } }
                    );

                    if (res.data?.tracking_data?.track_url && !order.shipment.tracking_url) {
                        order.shipment.tracking_url = res.data.tracking_data.track_url;
                    }

                    const trackingData = res.data.tracking_data;
                    if (!trackingData) return;

                    // -------------------------
                    // FIX #1: Read correct status
                    // -------------------------
                    let currentStatus =
                        trackingData.current_status ||
                        trackingData.shipment_status ||
                        trackingData.status ||
                        null;

                    // -------------------------
                    // FIX #3: Fallback status from events
                    // -------------------------
                    if (!currentStatus && trackingData.track_activities?.length) {
                        const lastEvent = trackingData.track_activities.slice(-1)[0];
                        currentStatus = lastEvent.activity || null;
                    }

                    // -------------------------
                    // FIX #2: Handle CANCELLED instantly
                    // -------------------------
                    if (currentStatus && String(currentStatus).toLowerCase().includes("cancel")) {
                        order.orderStatus = "Cancelled";
                        order.shipment.status = "Cancelled";
                        order.shipment.tracking_url = null; // remove tracking link
                        order.shipment.awb_code = null; // optional cleanup

                        if (!order.trackingHistory) order.trackingHistory = [];

                        order.trackingHistory.push({
                            status: "Cancelled",
                            timestamp: new Date(),
                            location: trackingData.current_status_location || "Courier Partner"
                        });

                        await order.save();
                        return; // STOP further processing for cancelled orders
                    }

                    // -------------------------
                    // Your existing logic (unchanged)
                    // -------------------------
                    if (currentStatus) {
                        order.shipment.status = currentStatus;
                    }

                    order.shipment.tracking_url =
                        trackingData.track_url || order.shipment.tracking_url;

                    if (currentStatus) {
                        const lower = String(currentStatus).toLowerCase();
                        if (lower.includes("in transit") || lower.includes("shipped")) {
                            order.orderStatus = "Shipped";
                        } else if (lower.includes("out for delivery")) {
                            order.orderStatus = "Out for Delivery";
                        } else if (lower.includes("delivered")) {
                            order.orderStatus = "Delivered";
                        } else if (lower.includes("cancelled")) {
                            order.orderStatus = "Cancelled";
                        }
                    }

                    if (currentStatus) {
                        if (!order.trackingHistory) order.trackingHistory = [];

                        const lastEntry = order.trackingHistory[order.trackingHistory.length - 1];

                        if (!lastEntry || lastEntry.status !== currentStatus) {
                            order.trackingHistory.push({
                                status: currentStatus,
                                timestamp: new Date(),
                                location: trackingData.current_status_location || undefined
                            });
                        }
                    }

                    await order.save();
                } catch (err) {
                    console.error(
                        `❌ [Shiprocket] Error tracking order ${order._id}:`,
                        err.response?.data || err.message
                    );
                }
            })
        );
    } catch (err) {
        console.error("❌ [Shiprocket] Tracking job failed:", err.message);
    }
}

// 🔹 Start cron job without blocking server
export function startTrackingJob() {
    cron.schedule(
        "*/30 * * * *",
        () => {
            trackShipments().catch((err) =>
                console.error("❌ Tracking error:", err.message)
            );
        },
        {
            scheduled: true,
            timezone: "Asia/Kolkata"
        }
    );

    console.log("⏳ [Shiprocket] Tracking job scheduled (every 30 min, async)");
}
