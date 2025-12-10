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





// import cron from "node-cron";
// import axios from "axios";
// import Order from "../../../models/Order.js";
// import { getShiprocketToken } from "../../services/shiprocket.js";
// import { addRefundJob } from "../../services/refundQueue.js";


// async function trackReturnAWBAssignment() {
//     console.log("🔄 Return AWB Tracking Cron Running...");

//     try {
//         const THRESHOLD = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7); // last 7 days

//         const orders = await Order.find({
//             "returns": {
//                 $elemMatch: {
//                     "pickupDetails.awb": null,
//                     "createdAt": { $gte: THRESHOLD }
//                 }
//             }
//         });

//         console.log(`📦 Tracking ${orders?.length || 0} return orders for AWB updates`);
//         if (!orders?.length) return;

//         const token = await getShiprocketToken();

//         for (const order of orders) {
//             try {
//                 if (!order.returns?.length) continue;

//                 for (const ret of order.returns) {
//                     try {
//                         // Skip if already has AWB or is in final state
//                         if (ret.pickupDetails?.awb) continue;

//                         if (["received_at_warehouse", "refunded", "cancelled"].includes(ret.overallStatus)) {
//                             continue;
//                         }

//                         const srOrderId = ret.shiprocket_return_order_id;
//                         if (!srOrderId) {
//                             console.log("❌ No Shiprocket return order ID found → skipping");
//                             continue;
//                         }

//                         console.log(`📦 Order ${order._id} → Return ${ret._id} | AWB: NOT ASSIGNED`);

//                         // Try multiple endpoints to get AWB
//                         let awbData = null;

//                         try {
//                             // Method 1: Try shipment tracking
//                             const shipmentRes = await axios.get(
//                                 `https://apiv2.shiprocket.in/v1/external/courier/track/shipment/${ret.shiprocket_return_order_id}`,
//                                 { headers: { Authorization: `Bearer ${token}` } }
//                             );

//                             awbData = shipmentRes.data?.data;
//                         } catch (err) {
//                             // Method 2: Try order details
//                             try {
//                                 const orderRes = await axios.get(
//                                     `https://apiv2.shiprocket.in/v1/external/orders/show/${srOrderId}`,
//                                     { headers: { Authorization: `Bearer ${token}` } }
//                                 );
//                                 awbData = orderRes.data?.data;
//                             } catch (err2) {
//                                 console.log(`⚠️ Could not fetch AWB for return ${ret._id}`);
//                                 continue;
//                             }
//                         }

//                         // Extract AWB from response
//                         let newAwb = null;
//                         let newCourier = null;
//                         let trackingUrl = null;

//                         if (awbData) {
//                             // Try different response structures
//                             newAwb = awbData.awb_code || awbData.awb || awbData.shipments?.awb;
//                             trackingUrl = awbData.tracking_url || awbData.track_url;

//                             if (awbData.courier_name) {
//                                 newCourier = awbData.courier_name;
//                             } else if (awbData.shipments?.courier_name) {
//                                 newCourier = awbData.shipments.courier_name;
//                             }
//                         }

//                         if (newAwb) {
//                             console.log(`✅ Found AWB for return ${ret._id}: ${newAwb}`);

//                             // Update the return with AWB details
//                             await Order.updateOne(
//                                 {
//                                     _id: order._id,
//                                     "returns._id": ret._id
//                                 },
//                                 {
//                                     $set: {
//                                         "returns.$.pickupDetails.awb": newAwb,
//                                         "returns.$.pickupDetails.tracking_url": trackingUrl,
//                                         "returns.$.pickupDetails.courier_name": newCourier,
//                                         "returns.$.overallStatus": "pickup_scheduled"
//                                     },
//                                     $push: {
//                                         "returns.$.auditTrail": {
//                                             status: "pickup_scheduled",
//                                             action: "awb_assigned",
//                                             performedBy: null,
//                                             performedByModel: "System",
//                                             notes: `AWB ${newAwb} assigned via ${newCourier || 'unknown courier'}`,
//                                             timestamp: new Date()
//                                         }
//                                     }
//                                 }
//                             );

//                             console.log(`📦 Return ${ret._id} → AWB assigned: ${newAwb}`);
//                         } else {
//                             console.log(`⏳ AWB not yet assigned for return ${ret._id}`);
//                         }

//                     } catch (shErr) {
//                         console.error(`❌ Error processing return ${ret?._id}:`, shErr.message);
//                     }
//                 }
//             } catch (innerErr) {
//                 console.error(`❌ Error iterating returns for order ${order._id}:`, innerErr.message);
//             }
//         }
//     } catch (err) {
//         console.error("❌ Return AWB tracking job failed:", err.message);
//     }
// }

// async function trackReturnTimeline() {
//     console.log("📍 Return Timeline Tracker Running...");

//     try {
//         const token = await getShiprocketToken();

//         const orders = await Order.find({
//             "returns": {
//                 $elemMatch: {
//                     "pickupDetails.awb": { $ne: null },
//                     "overallStatus": { $nin: ["received_at_warehouse", "refunded", "cancelled"] }
//                 }
//             }
//         });

//         console.log(`📍 Return Timeline → Checking ${orders.length} orders`);

//         for (const order of orders) {
//             for (const ret of order.returns) {
//                 if (!ret.pickupDetails?.awb) continue;

//                 const awb = ret.pickupDetails.awb;
//                 console.log(`⏳ Fetching timeline for Return AWB → ${awb}`);

//                 try {
//                     const res = await axios.get(
//                         `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`,
//                         { headers: { Authorization: `Bearer ${token}` } }
//                     );

//                     const trackingData = res.data?.tracking_data;
//                     if (!trackingData) {
//                         console.log(`⚠️ No tracking_data for Return AWB ${awb}`);
//                         continue;
//                     }

//                     // Get timeline events
//                     const rawEvents = trackingData.shipment_track_activities || trackingData.shipment_track || [];

//                     // Convert to our format
//                     const timelineEvents = rawEvents.map(ev => ({
//                         activity: ev.activity || ev.status,
//                         timestamp: new Date(ev.date || ev.timestamp),
//                         location: ev.location || "N/A",
//                         status: ev.activity || ev.status
//                     })).sort((a, b) => b.timestamp - a.timestamp); // Latest first

//                     // Get current status from Shiprocket
//                     const shiprocketStatus = trackingData.shipment_status ||
//                         (timelineEvents[0]?.status || ret.overallStatus);

//                     // Map Shiprocket status to our return status
//                     const statusMap = {
//                         "Pickup Scheduled": "pickup_scheduled",
//                         "Pickup Pending": "pickup_scheduled",
//                         "Pickup Generated": "pickup_scheduled",
//                         "Pickup Rescheduled": "pickup_scheduled",
//                         "Pickup Cancelled": "cancelled",
//                         "Pickup Failed": "pickup_failed",
//                         "Pickup Exception": "pickup_failed",
//                         "Pickup": "picked_up",
//                         "Pickup Done": "picked_up",
//                         "Picked Up": "picked_up",
//                         "In Transit": "in_transit",
//                         "Out For Delivery": "out_for_delivery",
//                         "Delivered": "received_at_warehouse",
//                         "RTO Delivered": "received_at_warehouse",
//                         "RTO Initiated": "rto_initiated",
//                         "RTO": "rto_initiated",
//                         "Undelivered": "undelivered",
//                         "Cancelled": "cancelled"
//                     };

//                     const newStatus = statusMap[shiprocketStatus] || "in_transit";

//                     // Check if status changed
//                     if (newStatus !== ret.overallStatus) {
//                         // Update return status
//                         await Order.updateOne(
//                             {
//                                 _id: order._id,
//                                 "returns._id": ret._id
//                             },
//                             {
//                                 $set: {
//                                     "returns.$.overallStatus": newStatus
//                                 },
//                                 $push: {
//                                     "returns.$.auditTrail": {
//                                         status: newStatus,
//                                         action: "status_updated",
//                                         performedBy: null,
//                                         performedByModel: "System",
//                                         notes: `Status changed to ${newStatus}`,
//                                         timestamp: new Date(),
//                                         metadata: {
//                                             shiprocket_status: shiprocketStatus,
//                                             current_activity: timelineEvents[0]?.activity
//                                         }
//                                     }
//                                 }
//                             }
//                         );

//                         console.log(`📌 Return ${ret._id} status updated: ${ret.overallStatus} → ${newStatus}`);

//                         // Trigger refund if delivered to warehouse
//                         if (newStatus === "received_at_warehouse") {
//                             await triggerReturnRefund(order, ret);
//                         }
//                     }

//                     // Store timeline in a separate field if you want detailed history
//                     await Order.updateOne(
//                         {
//                             _id: order._id,
//                             "returns._id": ret._id
//                         },
//                         {
//                             $set: {
//                                 "returns.$.timeline": timelineEvents.slice(0, 20) // Keep last 20 events
//                             }
//                         }
//                     );

//                 } catch (err) {
//                     console.log(`❌ Timeline error for return ${ret._id}`, err.response?.data || err.message);
//                 }
//             }
//         }
//     } catch (err) {
//         console.log("❌ Return timeline cron failed:", err.message);
//     }
// }

// async function triggerReturnRefund(order, ret) {
//     console.log(`💸 Triggering Refund for Return ${ret._id}`);

//     try {
//         // Calculate refund amount based on return items
//         const refundAmount = ret.items.reduce((total, item) => {
//             return total + (item.price * item.quantity);
//         }, 0);

//         await Order.updateOne(
//             {
//                 _id: order._id,
//                 "returns._id": ret._id
//             },
//             {
//                 $set: {
//                     "returns.$.overallStatus": "quality_check",
//                     "returns.$.refund.status": "initiated",
//                     "returns.$.refund.amount": refundAmount,
//                     "returns.$.refund.initiatedAt": new Date()
//                 },
//                 $push: {
//                     "returns.$.auditTrail": {
//                         status: "quality_check",
//                         action: "refund_initiated",
//                         performedBy: null,
//                         performedByModel: "System",
//                         notes: `Refund of ₹${refundAmount} initiated`,
//                         timestamp: new Date()
//                     }
//                 }
//             }
//         );

//         // Add to refund job queue
//         await addRefundJob(order._id, {
//             orderId: order._id,
//             returnId: ret._id,
//             amount: refundAmount
//         });

//         console.log(`✅ Refund initiated for return ${ret._id}: ₹${refundAmount}`);

//     } catch (error) {
//         console.error(`❌ Failed to trigger refund for return ${ret._id}:`, error.message);
//     }
// }

// export function startReturnTrackingCron() {
//     // CRON 1 → Return AWB Assignment (runs every minute)
//     cron.schedule("* * * * *", () => {
//         console.log("🔥 Return Cron 1 → AWB Assignment");
//         trackReturnAWBAssignment().catch(err => console.error("Return Cron1 Error:", err));
//     }, {
//         scheduled: true,
//         timezone: "Asia/Kolkata"
//     });

//     // CRON 2 → Return Timeline Tracking (runs every 2 minutes)
//     cron.schedule("*/2 * * * *", () => {
//         console.log("📍 Return Cron 2 → Timeline Tracking");
//         trackReturnTimeline().catch(err => console.error("Return Cron2 Error:", err));
//     }, {
//         scheduled: true,
//         timezone: "Asia/Kolkata"
//     });

//     console.log("✅ Both Return Cron Jobs Started (AWB Tracker + Timeline Tracker)");
// }




// corrected-return-cron.js
import cron from "node-cron";
import axios from "axios";
import mongoose from "mongoose";
import Order from "../../../models/Order.js";
import { getShiprocketToken } from "../../services/shiprocket.js";
import { addRefundJob } from "../../services/refundQueue.js";

/**
 * Helper: safely read shiprocket response for AWB & courier & tracking_url
 */
function parseShipmentShowResponse(root) {
    // root is usually res.data.data or res.data
    // Shiprocket shapes vary; try common locations
    const shipments = root?.shipments || (Array.isArray(root) ? root : null);

    // If shipments is an array, prefer first element
    const sr = Array.isArray(shipments) ? shipments[0] : root;

    const awb =
        sr?.awb_code ||
        sr?.awb ||
        sr?.shipment?.awb ||
        sr?.awb_no ||
        (sr?.shipments && sr.shipments[0]?.awb);

    const courier =
        sr?.courier_name ||
        sr?.shipment?.courier_name ||
        sr?.courier ||
        (sr?.shipments && sr.shipments[0]?.courier_name) ||
        null;

    const tracking_url =
        sr?.tracking_url || sr?.track_url || sr?.shipment?.tracking_url || null;

    return { awb, courier, tracking_url, root: sr };
}

/**
 * CRON 1 → Find returns (inside shipments[].returns) that don't have AWB yet and try to fetch AWB
 */
async function trackReturnAWBAssignment() {
    console.log("🔄 Return AWB Tracking Cron Running...");

    try {
        const THRESHOLD = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7); // last 7 days

        // Find orders where any shipment has a return with missing AWB and created recently
        const orders = await Order.find({
            "shipments.returns": {
                $elemMatch: {
                    "pickupDetails.awb": null,
                    "createdAt": { $gte: THRESHOLD },
                    // ensure we have the shiprocket return shipment id to query
                    "shiprocket_return_shipment_id": { $exists: true, $ne: null }
                }
            }
        }).select("_id shipments");

        console.log(`📦 Tracking ${orders?.length || 0} orders for return AWB updates`);
        if (!orders?.length) return;

        const token = await getShiprocketToken();
        if (!token) throw new Error("No Shiprocket token");

        for (const order of orders) {
            try {
                if (!order.shipments?.length) continue;

                for (const shipment of order.shipments) {
                    if (!shipment.returns?.length) continue;

                    for (const ret of shipment.returns) {
                        try {
                            // Skip if AWB already set or final state
                            if (ret.pickupDetails?.awb) continue;
                            if (["received_at_warehouse", "refunded", "cancelled"].includes(ret.overallStatus)) {
                                continue;
                            }

                            const srShipmentId = ret.shiprocket_return_shipment_id || ret.shipmentId || ret.shipment_id;
                            if (!srShipmentId) {
                                console.log(`❌ Return ${ret._id} has no shiprocket_return_shipment_id — skipping`);
                                continue;
                            }

                            console.log(`📦 Order ${order._id} -> Shipment ${shipment.shipment_id} -> Return ${ret._id} | fetching shipment ${srShipmentId}`);

                            // Use shipments/show endpoint — reliable for shipment-level info (includes AWB when assigned)
                            let resp;
                            try {
                                resp = await axios.get(
                                    `https://apiv2.shiprocket.in/v1/external/shipments/show/${srShipmentId}`,
                                    { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
                                );
                            } catch (err) {
                                // Some accounts may still need orders/show; fallback but log
                                console.warn(`⚠️ shipments/show failed for ${srShipmentId}, trying orders/show fallback`);
                                try {
                                    const orderResp = await axios.get(
                                        `https://apiv2.shiprocket.in/v1/external/orders/show/${ret.shiprocket_return_order_id || srShipmentId}`,
                                        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
                                    );
                                    resp = orderResp;
                                } catch (err2) {
                                    console.warn(`⚠️ Both endpoints failed for return ${ret._id}:`, err2?.message || err?.message);
                                    continue;
                                }
                            }

                            const root = resp?.data?.data ?? resp?.data ?? {};
                            const { awb: newAwb, courier: newCourier, tracking_url: newTrackUrl } = parseShipmentShowResponse(root);

                            if (!newAwb) {
                                console.log(`⏳ AWB not yet assigned for return ${ret._id} (srShipmentId ${srShipmentId})`);
                                continue;
                            }

                            // Update nested return inside shipment using arrayFilters
                            const updateRes = await Order.updateOne(
                                { _id: order._id },
                                {
                                    $set: {
                                        "shipments.$[ship].returns.$[ret].pickupDetails.awb": newAwb,
                                        "shipments.$[ship].returns.$[ret].pickupDetails.trackingUrl": newTrackUrl || null,
                                        "shipments.$[ship].returns.$[ret].pickupDetails.courier": newCourier || null,
                                        "shipments.$[ship].returns.$[ret].overallStatus": "pickup_scheduled"
                                    },
                                    $push: {
                                        "shipments.$[ship].returns.$[ret].auditTrail": {
                                            status: "pickup_scheduled",
                                            action: "awb_assigned",
                                            performedBy: null,
                                            performedByModel: "Admin",
                                            notes: `AWB ${newAwb} assigned via ${newCourier || "unknown courier"}`,
                                            timestamp: new Date()
                                        }
                                    }
                                },
                                {
                                    arrayFilters: [
                                        { "ship._id": shipment._id },
                                        { "ret._id": ret._id }
                                    ]
                                }
                            );

                            console.log(`✅ Return ${ret._id} AWB assigned: ${newAwb} | update: matched ${updateRes.matchedCount}, modified ${updateRes.modifiedCount}`);

                        } catch (inner) {
                            console.error(`❌ Error processing return ${ret._id}:`, inner.message || inner);
                        }
                    }
                }
            } catch (orderErr) {
                console.error(`❌ Error iterating shipments for order ${order._id}:`, orderErr.message);
            }
        }

    } catch (err) {
        console.error("❌ Return AWB tracking job failed:", err.message || err);
    }
}

/**
 * CRON 2 → Fetch timeline for returns which have AWB and are not final
 */
async function trackReturnTimeline() {
    console.log("📍 Return Timeline Tracker Running...");

    try {
        const token = await getShiprocketToken();
        if (!token) throw new Error("No Shiprocket token");

        // Find orders where any shipment return has an AWB and is not finished
        const orders = await Order.find({
            "shipments.returns": {
                $elemMatch: {
                    "pickupDetails.awb": { $ne: null },
                    "overallStatus": { $nin: ["received_at_warehouse", "refunded", "cancelled"] }
                }
            }
        }).select("_id shipments");

        console.log(`📍 Return Timeline → Checking ${orders.length || 0} orders`);

        for (const order of orders) {
            for (const shipment of order.shipments || []) {
                if (!shipment.returns?.length) continue;

                for (const ret of shipment.returns) {
                    try {
                        const awb = ret.pickupDetails?.awb;
                        if (!awb) continue;

                        console.log(`⏳ Fetching timeline for Return AWB → ${awb} (return ${ret._id})`);

                        let res;
                        try {
                            res = await axios.get(
                                `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`,
                                { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
                            );
                        } catch (err) {
                            console.warn(`⚠️ Tracking API failed for AWB ${awb}:`, err.message);
                            continue;
                        }

                        const trackingData = res.data?.tracking_data ?? {};
                        const rawEvents = trackingData.shipment_track_activities || trackingData.shipment_track || trackingData.shipment_track_activities || [];

                        const timelineEvents = (Array.isArray(rawEvents) ? rawEvents : []).map(ev => ({
                            status: ev.activity || ev.status || ev.description || "Unknown",
                            timestamp: new Date(ev.date || ev.datetime || ev.timestamp || Date.now()),
                            location: ev.location || "N/A",
                            description: ev.activity || ev.status || ev.description || ""
                        })).sort((a, b) => b.timestamp - a.timestamp);

                        const shiprocketStatus = trackingData.shipment_status || (timelineEvents[0]?.status) || ret.overallStatus;

                        // Map Shiprocket textual status to your overallStatus enums
                        const statusMap = {
                            "Pickup Scheduled": "pickup_scheduled",
                            "Pickup Pending": "pickup_scheduled",
                            "Pickup Generated": "pickup_scheduled",
                            "Pickup Rescheduled": "pickup_scheduled",
                            "Pickup Cancelled": "cancelled",
                            "Pickup Failed": "cancelled",
                            "Pickup Done": "picked_up",
                            "Picked Up": "picked_up",
                            "In Transit": "in_transit",
                            "Out For Delivery": "out_for_delivery",
                            "Out for Delivery": "out_for_delivery",
                            "Delivered": "received_at_warehouse",
                            "RTO Delivered": "received_at_warehouse",
                            "RTO Initiated": "rto_initiated",
                            "Undelivered": "undelivered",
                            "Cancelled": "cancelled"
                        };

                        const newStatus = statusMap[shiprocketStatus] || (shiprocketStatus ? shiprocketStatus.toLowerCase().replace(/\s+/g, "_") : "in_transit");

                        // Update timeline and status atomically
                        const updateOps = {
                            $set: {
                                "shipments.$[ship].returns.$[ret].timeline": timelineEvents.slice(0, 50),
                                "shipments.$[ship].returns.$[ret].pickupDetails.trackingUrl": trackingData?.tracking_url || ret.pickupDetails?.trackingUrl || null
                            },
                            $push: {
                                "shipments.$[ship].returns.$[ret].trackingHistory": {
                                    status: timelineEvents[0]?.status || shiprocketStatus || "Updated",
                                    timestamp: timelineEvents[0]?.timestamp || new Date(),
                                    location: timelineEvents[0]?.location || "N/A",
                                    description: timelineEvents[0]?.description || timelineEvents[0]?.status || ""
                                },
                                "shipments.$[ship].returns.$[ret].auditTrail": {
                                    status: newStatus,
                                    action: "timeline_updated",
                                    performedBy: null,
                                    performedByModel: "System",
                                    notes: `Shiprocket status: ${shiprocketStatus}`,
                                    timestamp: new Date()
                                }
                            }
                        };

                        // If overallStatus changed, set it
                        if (newStatus && newStatus !== ret.overallStatus) {
                            updateOps.$set["shipments.$[ship].returns.$[ret].overallStatus"] = newStatus;
                        }

                        await Order.updateOne(
                            { _id: order._id },
                            updateOps,
                            {
                                arrayFilters: [
                                    { "ship._id": shipment._id },
                                    { "ret._id": ret._id }
                                ]
                            }
                        );

                        console.log(`✅ Return ${ret._id} timeline updated, newStatus=${newStatus}`);

                        // If received at warehouse → trigger refund pipeline (only once)
                        if (newStatus === "received_at_warehouse") {
                            // Re-fetch the return (or rely on ret) — call trigger
                            await triggerReturnRefund(order, shipment, ret);
                        }

                    } catch (iterErr) {
                        console.error(`❌ Error handling return ${ret._id}:`, iterErr.message || iterErr);
                    }
                }
            }
        }

    } catch (err) {
        console.error("❌ Return timeline cron failed:", err.message || err);
    }
}

/**
 * Trigger refund - adapted to nested shipments.returns structure
 */
async function triggerReturnRefund(order, shipment, ret) {
    console.log(`💸 Triggering Refund for Return ${ret._id}`);

    try {
        // Compute refund amount if item.price exists (defensive)
        const refundAmount = (ret.items || []).reduce((total, item) => {
            const price = Number(item.price || 0);
            const qty = Number(item.quantity || 0);
            return total + price * qty;
        }, 0);

        await Order.updateOne(
            { _id: order._id },
            {
                $set: {
                    "shipments.$[ship].returns.$[ret].overallStatus": "quality_check",
                    "shipments.$[ship].returns.$[ret].refund.amount": refundAmount,
                    "shipments.$[ship].returns.$[ret].refund.status": "initiated",
                    "shipments.$[ship].returns.$[ret].refund.initiatedAt": new Date()
                },
                $push: {
                    "shipments.$[ship].returns.$[ret].auditTrail": {
                        status: "quality_check",
                        action: "refund_initiated",
                        performedBy: null,
                        performedByModel: "System",
                        notes: `Refund of ₹${refundAmount} initiated`,
                        timestamp: new Date()
                    }
                }
            },
            {
                arrayFilters: [
                    { "ship._id": shipment._id },
                    { "ret._id": ret._id }
                ]
            }
        );

        // Add job to refund queue
        await addRefundJob(order._id, {
            orderId: order._id,
            shipmentId: shipment._id,
            returnId: ret._id,
            amount: refundAmount
        });

        console.log(`✅ Refund initiated for return ${ret._id}: ₹${refundAmount}`);
    } catch (error) {
        console.error(`❌ Failed to trigger refund for return ${ret._id}:`, error.message || error);
    }
}

/**
 * Entrypoint to start both crons
 */
export function startReturnTrackingCron() {
    // CRON 1 → Return AWB Assignment (runs every minute)
    cron.schedule("* * * * *", () => {
        console.log("🔥 Return Cron 1 → AWB Assignment");
        trackReturnAWBAssignment().catch(err => console.error("Return Cron1 Error:", err));
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });

    // CRON 2 → Return Timeline Tracking (runs every 2 minutes)
    cron.schedule("*/2 * * * *", () => {
        console.log("📍 Return Cron 2 → Timeline Tracking");
        trackReturnTimeline().catch(err => console.error("Return Cron2 Error:", err));
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });

    console.log("✅ Both Return Cron Jobs Started (AWB Tracker + Timeline Tracker)");
}










// // Fetch new AWBs + update timeline for returns
// async function trackReturnShipments() {
//     console.log("🔄 Return Tracking Cron Running...");

//     const token = await getShiprocketToken();

//     // 1️⃣ Find return orders that are either not assigned AWB or not delivered yet
//     const orders = await Order.find({
//         returns: {
//             $elemMatch: {
//                 overallStatus: { $nin: ["received_at_warehouse", "refunded"] }
//             }
//         }
//     });

//     console.log(`📦 Tracking ${orders.length} return orders`);

//     for (const order of orders) {
//         for (const ret of order.returns) {
//             const awb = ret.pickupDetails?.awb;

//             try {
//                 // 2️⃣ If AWB not assigned yet → fetch Shiprocket order details
//                 if (!awb && ret.shiprocket_return_order_id) {
//                     console.log(`⏳ Fetching AWB for Return ${ret._id}`);

//                     const res = await axios.get(
//                         `https://apiv2.shiprocket.in/v1/external/courier/track/shipment/${ret.shiprocket_return_order_id}`,
//                         { headers: { Authorization: `Bearer ${token}` } }
//                     );

//                     const srData = res.data?.data || res.data;
//                     const srShipment = Array.isArray(srData.shipments) ? srData.shipments[0] : srData.shipments || srData;

//                     if (srShipment?.awb) {
//                         ret.pickupDetails.awb = srShipment.awb;
//                         ret.pickupDetails.tracking_url = srShipment.track_url;
//                         console.log(`✔️ AWB assigned for Return ${ret._id}: ${srShipment.awb}`);
//                     }
//                 }

//                 // 3️⃣ If AWB assigned → fetch timeline/status
//                 if (ret.pickupDetails?.awb) {
//                     const res = await axios.get(
//                         `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${ret.pickupDetails.awb}`,
//                         { headers: { Authorization: `Bearer ${token}` } }
//                     );

//                     const trackingData = res.data?.tracking_data;
//                     if (!trackingData) continue;

//                     const timeline = trackingData.shipment_track || [];
//                     const latest = timeline[0];

//                     // Map Shiprocket status → internal status
//                     const statusMap = {
//                         "Pickup Scheduled": "pickup_scheduled",
//                         "Picked Up": "picked_up",
//                         "In Transit": "in_transit",
//                         "Delivered": "received_at_warehouse",
//                         "RTO Delivered": "received_at_warehouse",
//                     };

//                     const currentStatus = statusMap[trackingData.shipment_status] || ret.overallStatus;

//                     // Push into auditTrail
//                     if (latest) {
//                         ret.auditTrail.push({
//                             status: currentStatus,
//                             action: "return_tracking",
//                             performedBy: null,
//                             performedByModel: "Admin",
//                             notes: latest.activity,
//                             metadata: latest
//                         });
//                     }

//                     // Update overallStatus
//                     ret.overallStatus = currentStatus;

//                     // Trigger refund if delivered
//                     if (currentStatus === "received_at_warehouse" && ret.refund?.status !== "initiated") {
//                         await triggerRefund(order, ret);
//                     }

//                     console.log(`📌 Return ${ret._id} status updated: ${currentStatus}`);
//                 }

//             } catch (err) {
//                 console.error(`❌ Error tracking return ${ret._id}:`, err.response?.data || err.message);
//             }
//         }

//         order.markModified("returns");
//         await order.save();
//     }
// }

// async function triggerRefund(order, ret) {
//     console.log(`💸 Triggering Refund for Return ${ret._id}`);

//     ret.overallStatus = "quality_check";
//     if (!ret.refund) ret.refund = {};
//     ret.refund.status = "initiated";
//     ret.refund.refundedAt = new Date();

//     await addRefundJob(order._id, {
//         orderId: order._id,
//         returnId: ret._id,
//         amount: ret.refund?.amount || order.amount
//     });
// }

// export function startReturnTrackingCron() {
//     // Run every 1 min
//     cron.schedule("* * * * *", async () => {
//         try {
//             await trackReturnShipments();
//         } catch (e) {
//             console.error("Return Cron Failed:", e.message);
//         }
//     }, {
//         scheduled: true,
//         timezone: "Asia/Kolkata"
//     });

//     console.log("✅ Return Tracking Cron Started (AWB + Timeline + Refund)");
// }
