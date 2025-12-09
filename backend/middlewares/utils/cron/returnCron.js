// import cron from "node-cron";
// import axios from "axios";
// import Order from "../../../models/Order.js";
// import { getShiprocketToken } from "../../services/shiprocket.js";
// import { addRefundJob } from "../../services/refundQueue.js";


// async function trackReturnShipments() {
//     console.log("🔄 Return Tracking Cron Running...");

//     const token = await getShiprocketToken();

//     // FIND returns that are active but not refunded
//     const orders = await Order.find({
//         returns: {
//             $elemMatch: {
//                 "pickupDetails.awb": { $ne: null },
//                 overallStatus: {
//                     $in: [
//                         "pickup_scheduled",
//                         "picked_up",
//                         "in_transit"
//                     ]
//                 }
//             }
//         }
//     });

//     console.log(`📦 Tracking ${orders.length} return orders`);

//     for (const order of orders) {
//         for (const ret of order.returns) {

//             // skip irrelevant entries
//             if (!ret.pickupDetails?.awb) continue;

//             const awb = ret.pickupDetails.awb;

//             // ONLY process active returns
//             if (!["pickup_scheduled", "picked_up", "in_transit"].includes(ret.overallStatus)) {
//                 continue;
//             }

//             try {
//                 console.log(`🚚 Tracking Return AWB: ${awb}`);

//                 const res = await axios.get(
//                     `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`,
//                     { headers: { Authorization: `Bearer ${token}` } }
//                 );

//                 const trackingData = res.data?.tracking_data;
//                 if (!trackingData) continue;

//                 const timeline = trackingData.shipment_track || [];
//                 const latest = timeline[0];

//                 const currentStatus = trackingData.shipment_status;

//                 // Store timeline into auditTrail
//                 if (latest) {
//                     ret.auditTrail.push({
//                         status: currentStatus,
//                         action: "return_tracking",
//                         performedBy: null,
//                         performedByModel: "Admin",
//                         notes: latest.activity,
//                         metadata: latest
//                     });
//                 }

//                 // ---- LOGIC MAPPING ----
//                 if (currentStatus === "Pickup Scheduled") {
//                     ret.overallStatus = "pickup_scheduled";
//                 }

//                 if (currentStatus === "Picked Up") {
//                     ret.overallStatus = "picked_up";
//                     ret.pickupDetails.pickedUpAt = new Date();
//                 }

//                 if (currentStatus === "In Transit") {
//                     ret.overallStatus = "in_transit";
//                 }

//                 // ⭐ FINAL DELIVERY CHECK
//                 if (
//                     currentStatus === "Delivered" ||
//                     currentStatus === "RTO Delivered"
//                 ) {
//                     console.log("📦 Return Delivered → Start Refund Workflow");

//                     ret.overallStatus = "received_at_warehouse";
//                     ret.receivedAt = new Date();

//                     await triggerRefund(order, ret);
//                 }

//                 order.markModified("returns");

//             } catch (err) {
//                 console.error(
//                     `❌ Error tracking return AWB ${awb}:`,
//                     err.response?.data || err.message
//                 );
//             }
//         }

//         await order.save();
//     }
// }


// async function triggerRefund(order, ret) {
//     try {
//         console.log(`💸 Starting Refund for Return ID ${ret._id}`);

//         ret.overallStatus = "quality_check";

//         if (!ret.refund) ret.refund = {};
//         ret.refund.status = "initiated";

//         await addRefundJob(order._id, {
//             orderId: order._id,
//             returnId: ret._id,
//             amount: ret.refund?.amount || order.amount
//         });

//         ret.refund.refundedAt = new Date();

//     } catch (err) {
//         console.error("Refund trigger failed:", err.message);
//     }
// }


// export function startReturnTrackingCron() {
//     cron.schedule("*/2 * * * *", async () => {
//         try {
//             await trackReturnShipments();
//         } catch (e) {
//             console.error("Return Cron Failed:", e.message);
//         }
//     }, {
//         scheduled: true,
//         timezone: "Asia/Kolkata"
//     });

//     console.log("✅ Return Tracking Cron Started");
// }





import cron from "node-cron";
import axios from "axios";
import Order from "../../../models/Order.js";
import { getShiprocketToken } from "../../services/shiprocket.js";
import { addRefundJob } from "../../services/refundQueue.js";

// Fetch new AWBs + update timeline for returns
async function trackReturnShipments() {
    console.log("🔄 Return Tracking Cron Running...");

    const token = await getShiprocketToken();

    // 1️⃣ Find return orders that are either not assigned AWB or not delivered yet
    const orders = await Order.find({
        returns: {
            $elemMatch: {
                overallStatus: { $nin: ["received_at_warehouse", "refunded"] }
            }
        }
    });

    console.log(`📦 Tracking ${orders.length} return orders`);

    for (const order of orders) {
        for (const ret of order.returns) {
            const awb = ret.pickupDetails?.awb;

            try {
                // 2️⃣ If AWB not assigned yet → fetch Shiprocket order details
                if (!awb && ret.shiprocket_return_order_id) {
                    console.log(`⏳ Fetching AWB for Return ${ret._id}`);

                    const res = await axios.get(
                        `https://apiv2.shiprocket.in/v1/external/courier/track/shipment/${ret.shiprocket_return_order_id}`,
                        { headers: { Authorization: `Bearer ${token}` } }
                    );

                    const srData = res.data?.data || res.data;
                    const srShipment = Array.isArray(srData.shipments) ? srData.shipments[0] : srData.shipments || srData;

                    if (srShipment?.awb) {
                        ret.pickupDetails.awb = srShipment.awb;
                        ret.pickupDetails.tracking_url = srShipment.track_url;
                        console.log(`✔️ AWB assigned for Return ${ret._id}: ${srShipment.awb}`);
                    }
                }

                // 3️⃣ If AWB assigned → fetch timeline/status
                if (ret.pickupDetails?.awb) {
                    const res = await axios.get(
                        `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${ret.pickupDetails.awb}`,
                        { headers: { Authorization: `Bearer ${token}` } }
                    );

                    const trackingData = res.data?.tracking_data;
                    if (!trackingData) continue;

                    const timeline = trackingData.shipment_track || [];
                    const latest = timeline[0];

                    // Map Shiprocket status → internal status
                    const statusMap = {
                        "Pickup Scheduled": "pickup_scheduled",
                        "Picked Up": "picked_up",
                        "In Transit": "in_transit",
                        "Delivered": "received_at_warehouse",
                        "RTO Delivered": "received_at_warehouse",
                    };

                    const currentStatus = statusMap[trackingData.shipment_status] || ret.overallStatus;

                    // Push into auditTrail
                    if (latest) {
                        ret.auditTrail.push({
                            status: currentStatus,
                            action: "return_tracking",
                            performedBy: null,
                            performedByModel: "Admin",
                            notes: latest.activity,
                            metadata: latest
                        });
                    }

                    // Update overallStatus
                    ret.overallStatus = currentStatus;

                    // Trigger refund if delivered
                    if (currentStatus === "received_at_warehouse" && ret.refund?.status !== "initiated") {
                        await triggerRefund(order, ret);
                    }

                    console.log(`📌 Return ${ret._id} status updated: ${currentStatus}`);
                }

            } catch (err) {
                console.error(`❌ Error tracking return ${ret._id}:`, err.response?.data || err.message);
            }
        }

        order.markModified("returns");
        await order.save();
    }
}

async function triggerRefund(order, ret) {
    console.log(`💸 Triggering Refund for Return ${ret._id}`);

    ret.overallStatus = "quality_check";
    if (!ret.refund) ret.refund = {};
    ret.refund.status = "initiated";
    ret.refund.refundedAt = new Date();

    await addRefundJob(order._id, {
        orderId: order._id,
        returnId: ret._id,
        amount: ret.refund?.amount || order.amount
    });
}

export function startReturnTrackingCron() {
    // Run every 1 min
    cron.schedule("* * * * *", async () => {
        try {
            await trackReturnShipments();
        } catch (e) {
            console.error("Return Cron Failed:", e.message);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });

    console.log("✅ Return Tracking Cron Started (AWB + Timeline + Refund)");
}
