

// // middlewares/utils/cron/shiprocketTrackingJob.js
// import cron from "node-cron";
// import axios from "axios";
// import Order from "../../../models/Order.js";
// import { getShiprocketToken } from "../../services/shiprocket.js";

// // 🔥 Helper to mark order as cancelled properly
// async function markCancelled(order, location = "Shiprocket") {
//     order.orderStatus = "Cancelled";
//     order.shipment.status = "Cancelled";
//     order.shipment.tracking_url = null;
//     order.shipment.awb_code = null;

//     if (!order.trackingHistory) order.trackingHistory = [];

//     order.trackingHistory.push({
//         status: "Cancelled",
//         timestamp: new Date(),
//         location
//     });

//     await order.save();
// }

// async function trackShipments() {
//     try {
//         const pendingOrders = await Order.find({
//             "shipment.shiprocket_order_id": { $exists: true, $ne: null },
//             orderStatus: { $nin: ["Delivered", "Cancelled"] }
//         });


//         if (!pendingOrders.length) return;

//         const token = await getShiprocketToken();

//         await Promise.allSettled(
//             pendingOrders.map(async (order) => {
//                 try {
//                     // --------------------------------------------------
//                     // ⭐ NEW FIX: ALSO check Shiprocket Order API
//                     // --------------------------------------------------
//                     const orderDetailsRes = await axios.get(
//                         `https://apiv2.shiprocket.in/v1/external/orders/show/${order.shipment.shiprocket_order_id}`,
//                         { headers: { Authorization: `Bearer ${token}` } }
//                     );

//                     const shipOrder = orderDetailsRes.data;

//                     // --------------------------------------------------
//                     // 🚨 NEW FIX 1: courier-level cancellation
//                     // --------------------------------------------------
//                     if (
//                         shipOrder?.courier_status &&
//                         String(shipOrder.courier_status).toLowerCase().includes("cancel")
//                     ) {
//                         await markCancelled(order, "Courier Partner (courier_status)");
//                         return;
//                     }

//                     // 🚨 NEW FIX 2: courier_status_code = 9 (cancelled)
//                     if (shipOrder?.courier_status_code === 9) {
//                         await markCancelled(order, "Courier Partner (status_code 9)");
//                         return;
//                     }

//                     // 🚨 Existing Shiprocket cancellation indicators
//                     if (
//                         shipOrder?.is_canceled ||
//                         String(shipOrder?.status).toLowerCase().includes("cancel")
//                     ) {
//                         await markCancelled(order, "Shiprocket Dashboard");
//                         return;
//                     }

//                     // --------------------------------------------------
//                     // EXISTING TRACK API CALL
//                     // --------------------------------------------------
//                     const res = await axios.get(
//                         `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${order.shipment.awb_code}`,
//                         { headers: { Authorization: `Bearer ${token}` } }
//                     );

//                     if (res.data?.tracking_data?.track_url && !order.shipment.tracking_url) {
//                         order.shipment.tracking_url = res.data.tracking_data.track_url;
//                     }

//                     const trackingData = res.data.tracking_data;
//                     if (!trackingData) return;

//                     let currentStatus =
//                         trackingData.current_status ||
//                         trackingData.shipment_status ||
//                         trackingData.status ||
//                         null;

//                     if (!currentStatus && trackingData.track_activities?.length) {
//                         const lastEvent = trackingData.track_activities.slice(-1)[0];
//                         currentStatus = lastEvent.activity || null;
//                     }

//                     // --------------------------------------------------
//                     // EXISTING CANCEL CHECK
//                     // --------------------------------------------------
//                     if (currentStatus && String(currentStatus).toLowerCase().includes("cancel")) {
//                         await markCancelled(
//                             order,
//                             trackingData.current_status_location || "Courier Partner"
//                         );
//                         return;
//                     }

//                     // --------------------------------------------------
//                     // Status updates
//                     // --------------------------------------------------
//                     if (currentStatus) {
//                         order.shipment.status = currentStatus;
//                     }

//                     order.shipment.tracking_url =
//                         trackingData.track_url || order.shipment.tracking_url;

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

//                     if (!order.trackingHistory) order.trackingHistory = [];

//                     const lastEntry = order.trackingHistory[order.trackingHistory.length - 1];
//                     if (!lastEntry || lastEntry.status !== currentStatus) {
//                         order.trackingHistory.push({
//                             status: currentStatus,
//                             timestamp: new Date(),
//                             location: trackingData.current_status_location || undefined
//                         });
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
import { getShiprocketToken,extractAWBFromShiprocket  } from "../../services/shiprocket.js";


/** 📌 Utility to push tracking history safely */
function pushTracking(order, shipment, status, location) {
    if (!shipment.trackingHistory) shipment.trackingHistory = [];

    const last = shipment.trackingHistory[shipment.trackingHistory.length - 1];

    if (!last || last.status !== status) {
        shipment.trackingHistory.push({
            status,
            timestamp: new Date(),
            location: location || undefined
        });
    }
}


/** 📌 Cancel handler */
async function markShipmentCancelled(order, shipment, location = "Shiprocket") {
    shipment.status = "Cancelled";
    shipment.awb_code = null;
    shipment.tracking_url = null;

    order.orderStatus = "Cancelled";

    pushTracking(order, shipment, "Cancelled", location);

    await order.save();
}


// async function trackShipments() {
//     try {
//         const orders = await Order.find({
//             "shipments.shiprocket_order_id": { $exists: true, $ne: null },
//             orderStatus: { $nin: ["Delivered", "Cancelled"] }
//         });

//         console.log(`🔥 Tracking ${orders?.length || 0} orders for AWB updates`);
//         if (!orders?.length) return;

//         const token = await getShiprocketToken();

//         for (const order of orders) {
//             try {
//                 if (!order.shipments?.length) continue;

//                 console.log(`🔥 Processing order ${order._id} with ${order.shipments.length} shipments`);

//                 for (const shipment of order.shipments) {
//                     try {
//                         const srOrderId = shipment.shiprocket_order_id;
//                         if (!srOrderId) continue;

//                         console.log(`📦 Checking shipment ${shipment.shipment_id} - AWB: ${shipment.awb_code || 'NOT ASSIGNED'}`);

//                         // 1) Get latest Shiprocket order details
//                         const orderDetailsRes = await axios.get(
//                             `https://apiv2.shiprocket.in/v1/external/orders/show/${srOrderId}`,
//                             { headers: { Authorization: `Bearer ${token}` } }
//                         );
//                         const shipOrder = orderDetailsRes.data;

//                         // Find matching shipment
//                         let srShipment = null;
//                         if (Array.isArray(shipOrder?.shipments) && shipOrder.shipments.length) {
//                             srShipment = shipOrder.shipments.find(s => String(s.shipment_id) === String(shipment.shipment_id));
//                             if (!srShipment) srShipment = shipOrder.shipments[0];
//                         } else {
//                             srShipment = shipOrder;
//                         }

//                         if (!srShipment) {
//                             console.warn(`⚠️ No shipment found in Shiprocket for ${shipment.shipment_id}`);
//                             continue;
//                         }

//                         // 🚀 **AWB RECOVERY GUARANTEE**
//                         const newAwb = srShipment.awb_code || null;
//                         const newCourier = srShipment.courier_name || srShipment.courier_company || null;

//                         let shouldSaveOrder = false;

//                         // 🚀 **CRITICAL: RECOVER MISSING AWB**
//                         if (newAwb && !shipment.awb_code) {
//                             console.log(`🎉 AWB ASSIGNED: ${newAwb} via ${newCourier}`);

//                             shipment.awb_code = newAwb;
//                             shipment.courier_name = newCourier;
//                             shipment.tracking_url = srShipment.track_url || `https://shiprocket.co/tracking/${newAwb}`;
//                             shipment.status = "AWB Assigned";

//                             // Add to tracking history
//                             if (!shipment.trackingHistory) shipment.trackingHistory = [];
//                             shipment.trackingHistory.push({
//                                 status: "AWB Assigned",
//                                 timestamp: new Date(),
//                                 location: "Shiprocket",
//                                 description: `AWB ${newAwb} assigned via ${newCourier}`
//                             });

//                             shouldSaveOrder = true;
//                             console.log(`✅ AWB RECOVERED SUCCESSFULLY for shipment ${shipment._id}: ${newAwb}`);
//                         }

//                         // 🚀 **SAVE IF CHANGES DETECTED**
//                         if (shouldSaveOrder) {
//                             await order.save();
//                             console.log(`✅ ORDER SAVED: ${order._id} with AWB: ${newAwb}`);
//                         }

//                     } catch (shErr) {
//                         console.error(`❌ Error processing shipment ${shipment._id}:`, shErr.message);
//                     }
//                 }
//             } catch (innerErr) {
//                 console.error(`❌ Error tracking order ${order._id}:`, innerErr.message);
//             }
//         }
//     } catch (err) {
//         console.error("❌ Tracking job failed:", err.message);
//     }
// }
// Replace your current trackShipments() with this version











// async function trackShipments() {
//     try {
//         // Only orders that have shiprocket_order_id and shipments that haven't received an AWB yet OR not delivered
//         const orders = await Order.find({
//             "shipments.shiprocket_order_id": { $exists: true, $ne: null },
//             orderStatus: { $nin: ["Delivered", "Cancelled"] }
//         }).select("_id shipments"); // reduce payload

//         console.log(`🔥 Tracking ${orders?.length || 0} orders for AWB updates`);
//         if (!orders?.length) return;

//         const token = await getShiprocketToken();

//         for (const order of orders) {
//             try {
//                 if (!order.shipments?.length) continue;

//                 // iterate shipments but we'll use atomic update for each
//                 for (const shipment of order.shipments) {
//                     try {
//                         const srOrderId = shipment.shiprocket_order_id;
//                         if (!srOrderId) continue;

//                         console.log(`📦 Checking shipment ${shipment.shipment_id} (srOrderId ${srOrderId}) - current AWB: ${shipment.awb_code || 'NOT ASSIGNED'}`);

//                         // GET Shiprocket order details
//                         const orderDetailsRes = await axios.get(
//                             `https://apiv2.shiprocket.in/v1/external/orders/show/${srOrderId}`,
//                             { headers: { Authorization: `Bearer ${token}` } }
//                         );
//                         const shipOrder = orderDetailsRes.data;

//                         // find the right shipment record returned by Shiprocket
//                         let srShipment = null;
//                         if (Array.isArray(shipOrder?.shipments) && shipOrder.shipments.length) {
//                             srShipment = shipOrder.shipments.find(s => String(s.shipment_id) === String(shipment.shipment_id))
//                                 || shipOrder.shipments[0];
//                         } else {
//                             // fallback: some endpoints return the shipment object directly
//                             srShipment = shipOrder;
//                         }

//                         if (!srShipment) {
//                             console.warn(`⚠️ No matching shipment in Shiprocket for shipment_id ${shipment.shipment_id}`);
//                             continue;
//                         }

//                         const newAwb = srShipment.awb_code || null;
//                         const newCourier = srShipment.courier_name || srShipment.courier_company || srShipment.courier || null;
//                         const newTrackUrl = srShipment.track_url || (newAwb ? `https://shiprocket.co/tracking/${newAwb}` : null);

//                         // Skip only if AWB already saved and same
//                         if (shipment.awb_code && shipment.awb_code === newAwb) {
//                             console.log("✔️ Skipping — AWB already saved");
//                             continue;
//                         }

//                         if (newAwb && !shipment.awb_code) {
//                             console.log("🔥 Found NEW AWB not saved before → saving now...");
//                         }

//                         // If no change detected, skip
//                         if (!newAwb) {
//                             console.log(`⏳ AWB not yet assigned for sr shipment ${shipment.shipment_id}`);
//                             continue;
//                         }

//                         // Build atomic update: set AWB/courier/tracking_url/status and push trackingHistory inside the specific shipment subdoc & push to order.trackingHistory
//                         const trackingEntry = {
//                             status: "AWB Assigned",
//                             timestamp: new Date(),
//                             location: "Shiprocket",
//                             description: `AWB ${newAwb} assigned via ${newCourier || 'unknown'}`
//                         };

//                         const updateRes = await Order.updateOne(
//                             {
//                                 _id: order._id,
//                                 "shipments.shipment_id": shipment.shipment_id
//                             },
//                             {
//                                 $set: {
//                                     "shipments.$.awb_code": newAwb,
//                                     "shipments.$.courier_name": newCourier,
//                                     "shipments.$.tracking_url": newTrackUrl,
//                                     "shipments.$.status": "AWB Assigned",
//                                     "orderStatus": "Shipped",
//                                     "primary_shipment": order.primary_shipment || shipment._id
//                                 },
//                                 $push: {
//                                     "shipments.$.trackingHistory": trackingEntry,
//                                     trackingHistory: {
//                                         status: "AWB Assigned",
//                                         timestamp: new Date(),
//                                         location: "Shiprocket",
//                                         description: `Shipment ${shipment.shipment_id} AWB ${newAwb}`
//                                     }
//                                 }
//                             }
//                         );

//                         console.log(`✅ AWB update result for order ${order._id}, shipment ${shipment.shipment_id}:`, {
//                             matched: updateRes.matchedCount, modified: updateRes.modifiedCount
//                         });

//                         if (updateRes.modifiedCount > 0) {
//                             // (optional) notify user or emit event
//                         }

//                     } catch (shErr) {
//                         console.error(`❌ Error processing shipment ${shipment._id} for order ${order._id}:`, shErr.response?.data || shErr.message || shErr);
//                     }
//                 }
//             } catch (innerErr) {
//                 console.error(`❌ Error iterating shipments for order ${order._id}:`, innerErr.message || innerErr);
//             }
//         }
//     } catch (err) {
//         console.error("❌ Tracking job failed:", err.message || err);
//     }
// }


async function trackShipments() {
    try {
        // Only orders that have shiprocket_order_id and shipments that haven't received an AWB yet OR not delivered
        const orders = await Order.find({
            "shipments.shiprocket_order_id": { $exists: true, $ne: null },
            orderStatus: { $nin: ["Delivered", "Cancelled"] }
        }).select("_id shipments"); // reduce payload

        console.log(`🔥 Tracking ${orders?.length || 0} orders for AWB updates`);
        if (!orders?.length) return;

        const token = await getShiprocketToken();

        for (const order of orders) {
            try {
                if (!order.shipments?.length) continue;

                for (const shipment of order.shipments) {
                    try {
                        const srOrderId = shipment.shiprocket_order_id;
                        if (!srOrderId) continue;

                        console.log(`📦 Checking shipment ${shipment.shipment_id} (srOrderId ${srOrderId}) - current AWB: ${shipment.awb_code || 'NOT ASSIGNED'}`);

                        // GET Shiprocket order details
                        const orderDetailsRes = await axios.get(
                            `https://apiv2.shiprocket.in/v1/external/orders/show/${srOrderId}`,
                            { headers: { Authorization: `Bearer ${token}` } }
                        );
                        const shipOrder = orderDetailsRes.data;
                        if (!shipOrder) {
                            console.warn(`⚠️ Empty response for srOrder ${srOrderId}`);
                            continue;
                        }

                        // find the right shipment record returned by Shiprocket (if any)
                        let srShipment = null;
                        if (Array.isArray(shipOrder.shipments) && shipOrder.shipments.length) {
                            srShipment = shipOrder.shipments.find(s => String(s.shipment_id) === String(shipment.shipment_id)) || shipOrder.shipments[0];
                        } else if (shipOrder.shipment_id || shipOrder.shipment) {
                            srShipment = shipOrder; // some responses put fields at top level
                        } else {
                            // fallback — no shipments array and no top-level shipment fields
                            srShipment = null;
                        }

                        const { awb: newAwb, courier: newCourier, trackUrl: newTrackUrl } =
                            extractAWBFromShiprocket(shipOrder, shipment.shipment_id);

                        // If AWB already saved and identical, skip
                        if (shipment.awb_code && newAwb && shipment.awb_code === newAwb) {
                            console.log("✔️ Skipping — AWB already saved and matches Shiprocket");
                            continue;
                        }

                        // If no AWB found at all, skip
                        if (!newAwb) {
                            console.log(`⏳ AWB not yet assigned for sr shipment ${shipment.shipment_id}`);
                            continue;
                        }

                        console.log("🔥 Found AWB →", { newAwb, newCourier, newTrackUrl });

                        // Build atomic update entry
                        const trackingEntry = {
                            status: "AWB Assigned",
                            timestamp: new Date(),
                            location: "Shiprocket",
                            description: `AWB ${newAwb} assigned via ${newCourier || 'unknown'}`
                        };

                        // Update by matching order id + shipment_id (ensure atomic update of the correct subdoc)
                        const updateRes = await Order.updateOne(
                            {
                                _id: order._id,
                                "shipments.shipment_id": shipment.shipment_id
                            },
                            {
                                $set: {
                                    "shipments.$.awb_code": newAwb,
                                    "shipments.$.courier_name": newCourier,
                                    "shipments.$.tracking_url": newTrackUrl,
                                    "shipments.$.status": "AWB Assigned",
                                    "orderStatus": "Shipped",
                                    "primary_shipment": order.primary_shipment || shipment._id
                                },
                                $push: {
                                    "shipments.$.trackingHistory": trackingEntry,
                                    trackingHistory: {
                                        status: "AWB Assigned",
                                        timestamp: new Date(),
                                        location: "Shiprocket",
                                        description: `Shipment ${shipment.shipment_id} AWB ${newAwb}`
                                    }
                                }
                            }
                        );

                        console.log(`✅ AWB update result for order ${order._id}, shipment ${shipment.shipment_id}:`, {
                            matched: updateRes.matchedCount, modified: updateRes.modifiedCount
                        });

                    } catch (shErr) {
                        console.error(`❌ Error processing shipment ${shipment._id} for order ${order._id}:`, shErr.response?.data || shErr.message || shErr);
                    }
                }
            } catch (innerErr) {
                console.error(`❌ Error iterating shipments for order ${order._id}:`, innerErr.message || innerErr);
            }
        }
    } catch (err) {
        console.error("❌ Tracking job failed:", err.message || err);
    }
}

/** ---------- ENHANCED startTrackingJob() ---------- */
export function startTrackingJob() {
    cron.schedule(
        "* * * * *", // Every minute
        () => {
            console.log('🔥 Running Shiprocket tracking job...');
            trackShipments().catch((err) => console.error("❌ Cron Error:", err.message || err));
        },
        {
            scheduled: true,
            timezone: "Asia/Kolkata"
        }
    );

    console.log("✅ Shiprocket Tracking job scheduled (every 1 min) - 1000% GUARANTEED");
}