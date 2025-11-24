

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
import { getShiprocketToken, extractAWBFromShiprocket } from "../../services/shiprocket.js";


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

//                 for (const shipment of order.shipments) {
//                     try {
//                         const srOrderId = shipment.shiprocket_order_id;
//                         if (!srOrderId) continue;

//                         console.log(
//                             `📦 Order ${order._id} → Shipment ${shipment.shipment_id} (srOrderId ${srOrderId}) | AWB: ${shipment.awb_code || 'NOT ASSIGNED'}`
//                         );

//                         // GET Shiprocket order details
//                         const orderDetailsRes = await axios.get(
//                             `https://apiv2.shiprocket.in/v1/external/orders/show/${srOrderId}`,
//                             { headers: { Authorization: `Bearer ${token}` } }
//                         );
//                         const shipOrder = orderDetailsRes.data;

//                         if (!shipOrder) {
//                             console.warn(`⚠️ Empty response for srOrder ${srOrderId}`);
//                             continue;
//                         }

//                         // Shiprocket wraps everything inside data
//                         const root = shipOrder?.data || shipOrder;

//                         // Case 1: shipments is an OBJECT, not array
//                         let srShipment = null;
//                         if (root.shipments && !Array.isArray(root.shipments)) {
//                             srShipment = root.shipments;
//                         }
//                         // Case 2: shipments is array (rare but possible)
//                         else if (Array.isArray(root.shipments)) {
//                             srShipment = root.shipments.find(s => String(s.shipment_id) === String(shipment.shipment_id)) || root.shipments[0];
//                         }
//                         // Fallback
//                         else {
//                             srShipment = root;
//                         }

//                         const { awb: newAwb, courier: newCourier, trackUrl: newTrackUrl } =
//                             extractAWBFromShiprocket(shipOrder, srShipment);

//                         // If AWB already saved and identical, skip
//                         if (shipment.awb_code && newAwb && shipment.awb_code === newAwb) {
//                             console.log("✔️ Skipping — AWB already saved and matches Shiprocket");
//                             continue;
//                         }

//                         // If no AWB found at all, skip
//                         if (!newAwb) {
//                             console.log(`⏳ AWB not yet assigned for sr shipment ${shipment.shipment_id}`);
//                             continue;
//                         }

//                         console.log("🔥 Found AWB →", { newAwb, newCourier, newTrackUrl });

//                         // Build atomic update entry
//                         const trackingEntry = {
//                             status: "AWB Assigned",
//                             timestamp: new Date(),
//                             location: "Shiprocket",
//                             description: `AWB ${newAwb} assigned via ${newCourier || 'unknown'}`
//                         };

//                         // Update by matching order id + shipment_id (ensure atomic update of the correct subdoc)
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

// /** ---------- ENHANCED startTrackingJob() ---------- */
// export function startTrackingJob() {
//     cron.schedule(
//         "* * * * *", // Every minute
//         () => {
//             console.log('🔥 Running Shiprocket tracking job...');
//             trackShipments().catch((err) => console.error("❌ Cron Error:", err.message || err));
//         },
//         {
//             scheduled: true,
//             timezone: "Asia/Kolkata"
//         }
//     );

//     console.log("✅ Shiprocket Tracking job scheduled (every 1 min) - 1000% GUARANTEED");
// }


function mapStatus(s) {
    if (!s) return "Shipped";

    s = s.toLowerCase();

    if (s.includes("out for delivery")) return "Out for Delivery";
    if (s.includes("delivered")) return "Delivered";
    if (s.includes("pickup")) return "Awaiting Pickup";
    if (s.includes("in transit") || s.includes("in-scan")) return "Shipped";
    if (s.includes("booked")) return "Processing";

    return "Shipped";
}


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

                        console.log(
                            `📦 Order ${order._id} → Shipment ${shipment.shipment_id} (srOrderId ${srOrderId}) | AWB: ${shipment.awb_code || 'NOT ASSIGNED'}`
                        );

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

                        // Shiprocket wraps everything inside data
                        const root = shipOrder?.data || shipOrder;

                        // Case 1: shipments is an OBJECT, not array
                        let srShipment = null;
                        if (root.shipments && !Array.isArray(root.shipments)) {
                            srShipment = root.shipments;
                        }
                        // Case 2: shipments is array (rare but possible)
                        else if (Array.isArray(root.shipments)) {
                            srShipment =
                                root.shipments.find(
                                    (s) => String(s.shipment_id) === String(shipment.shipment_id)
                                ) || root.shipments[0];
                        }
                        // Fallback
                        else {
                            srShipment = root;
                        }

                        /** ----------------- EXISTING AWB EXTRACTION ----------------- */
                        let {
                            awb: newAwb,
                            trackUrl: newTrackUrl
                        } = extractAWBFromShiprocket(shipOrder, srShipment);

                        let shouldUpdate = true;

                        if (shipment.awb_code && newAwb && shipment.awb_code === newAwb) {
                            console.log("✔️ AWB matches — but checking courier name...");
                            shouldUpdate = false; // don't overwrite AWB
                        }


                        // If no AWB found at all, skip
                        if (!newAwb) {
                            console.log(`⏳ AWB not yet assigned for sr shipment ${shipment.shipment_id}`);
                            continue;
                        }

                        /** ------------------ FIX: FETCH COURIER NAME ------------------ */
                        let newCourier = null;

                        try {
                            const courierRes = await axios.get(
                                `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${newAwb}`,
                                { headers: { Authorization: `Bearer ${token}` } }
                            );
                            const trackData = courierRes.data?.tracking_data;

                            newCourier =
                                trackData?.shipment_track?.[0]?.courier_name ||
                                trackData?.courier_name ||
                                trackData?.awb_details?.courier_name ||
                                courierRes.data?.courier_name ||
                                null;

                            console.log("🔍 courier extracted:", newCourier);

                            const trackList = courierRes.data?.tracking_data?.shipment_track || [];
                            if (trackList.length > 0) {
                                const lastStatus = trackList[0]?.activity || null;

                                const formattedEvents = trackList.map(ev => ({
                                    status: ev.activity || ev.status || "Update",
                                    timestamp: new Date(ev.date),
                                    location: ev.location || "",
                                    description: ev.activity || ""
                                }));
                                // SORT NEW EVENTS (latest first)
                                formattedEvents.sort((a, b) => b.timestamp - a.timestamp);

                                await Order.updateOne(
                                    {
                                        _id: order._id,
                                        "shipments.shipment_id": shipment.shipment_id
                                    },
                                    {
                                        $set: {
                                            "shipments.$.trackingHistory": formattedEvents,
                                            "shipments.$.status": lastStatus   // <-- ADD THIS
                                        }
                                    }
                                );

                                console.log("📌 Timeline + status updated for:", shipment.shipment_id);

                                // AUTO UPDATE STATUS
                                const lastEvent = formattedEvents[0];
                                const mappedStatus = mapStatus(lastEvent?.status);

                                if (mappedStatus !== shipment.status) {
                                    await Order.updateOne(
                                        {
                                            _id: order._id,
                                            "shipments.shipment_id": shipment.shipment_id
                                        },
                                        {
                                            $set: { "shipments.$.status": mappedStatus }
                                        }
                                    );

                                    console.log(`🚀 Shipment status updated → ${mappedStatus}`);
                                }

                            }



                            if (newCourier && shipment.courier_name !== newCourier) {
                                await Order.updateOne(
                                    {
                                        _id: order._id,
                                        "shipments.shipment_id": shipment.shipment_id
                                    },
                                    {
                                        $set: {
                                            "shipments.$.courier_name": newCourier
                                        }
                                    }
                                );

                                console.log(`🚚 Courier updated → ${newCourier}`);
                            }


                        } catch (err) {
                            console.warn(`⚠️ Courier lookup failed for AWB ${newAwb}:`);
                        }

                        console.log("🔥 Found AWB →", {
                            newAwb,
                            newCourier: newCourier || "unknown",
                            newTrackUrl
                        });

                        if (shouldUpdate) {
                            const trackingEntry = {
                                status: "AWB Assigned",
                                timestamp: new Date(),
                                location: "Shiprocket",
                                description: `AWB ${newAwb} assigned via ${newCourier || 'unknown'}`
                            };

                            const updatePayload = {
                                $set: {
                                    "shipments.$.awb_code": newAwb,
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
                            };

                            if (newCourier) {
                                updatePayload.$set["shipments.$.courier_name"] = newCourier;
                            }

                            const updateRes = await Order.updateOne(
                                {
                                    _id: order._id,
                                    "shipments.shipment_id": shipment.shipment_id
                                },
                                updatePayload
                            );

                            console.log(
                                `✅ AWB update result for order ${order._id}, shipment ${shipment.shipment_id}:`,
                                {
                                    matched: updateRes.matchedCount,
                                    modified: updateRes.modifiedCount
                                }
                            );
                        }


                    } catch (shErr) {
                        console.error(
                            `❌ Error processing shipment ${shipment._id} for order ${order._id}:`,
                            shErr.response?.data || shErr.message || shErr
                        );
                    }
                }
            } catch (innerErr) {
                console.error(
                    `❌ Error iterating shipments for order ${order._id}:`,
                    innerErr.message || innerErr
                );
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
            console.log("🔥 Running Shiprocket tracking job...");
            trackShipments().catch((err) =>
                console.error("❌ Cron Error:", err.message || err)
            );
        },
        {
            scheduled: true,
            timezone: "Asia/Kolkata"
        }
    );

    console.log("✅ Shiprocket Tracking job scheduled (every 1 min) - 1000% GUARANTEED");
}
