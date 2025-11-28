

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

function mapTimelineToNykaa(events = []) {
    if (!Array.isArray(events) || events.length === 0) return [];

    const milestones = {
        "Order Placed": null,
        "Ready to Ship": null,
        "Shipped": null,
        "Out for Delivery": null,
        "Delivered": null,
        "Return Initiated": null,
        "Returned": null
    };

    for (const ev of events) {
        const s = ev.status?.toLowerCase() || "";

        if (!milestones["Order Placed"]) {
            milestones["Order Placed"] = ev.timestamp;
        }

        if (
            s.includes("pickup") ||
            s.includes("manifest") ||
            (s.includes("ship") && !s.includes("shipped"))
        ) {
            milestones["Ready to Ship"] = milestones["Ready to Ship"] || ev.timestamp;
        }

        if (s.includes("in transit") || s.includes("in-scan") || s.includes("bagged")) {
            milestones["Shipped"] = milestones["Shipped"] || ev.timestamp;
        }

        if (s.includes("out for delivery")) {
            milestones["Out for Delivery"] = milestones["Out for Delivery"] || ev.timestamp;
        }

        if (s.includes("delivered")) {
            milestones["Delivered"] = milestones["Delivered"] || ev.timestamp;
        }

        if (s.includes("rto initiated")) {
            milestones["Return Initiated"] = milestones["Return Initiated"] || ev.timestamp;
        }

        if (s.includes("rto delivered")) {
            milestones["Returned"] = milestones["Returned"] || ev.timestamp;
        }
    }

    return Object.entries(milestones)
        .filter(([k, v]) => v != null)
        .map(([k, v]) => ({
            status: k,
            timestamp: v
        }));
}

function mapStatus(s) {
    if (!s) return "Shipped";

    s = s.toLowerCase();

    // Delivered
    // Delivered (safe)
    if (s.includes("delivered") &&
        !s.includes("rto") &&
        !s.includes("undelivered") &&
        !s.includes("attempt"))
        return "Delivered";

    // Out For Delivery
    if (s.includes("out for delivery")) return "Out for Delivery";

    // Pickup Scheduled / Pickup Pending
    if (s.includes("pickup scheduled") || s.includes("pending pickup"))
        return "Pickup Scheduled";

    // Pickup Done → Ready to Ship
    if (s.includes("picked up") || s.includes("shipment picked"))
        return "Ready to Ship";

    // In Transit
    if (
        s.includes("in transit") ||
        s.includes("in-scan") ||
        s.includes("forwarded") ||
        s.includes("hub") ||
        s.includes("facility")
    )
        return "In Transit";

    // RTO flows
    if (s.includes("rto")) {
        if (s.includes("delivered")) return "RTO Delivered";
        if (s.includes("out for delivery")) return "RTO Out for Delivery";
        return "RTO Initiated";
    }

    // Cancelled
    if (s.includes("cancel")) return "Cancelled";

    // Booked → Processing
    if (s.includes("booked") || s.includes("order created"))
        return "Processing";

    return "In Transit";
}

async function trackShipments() {
    try {
        // Only orders that have shiprocket_order_id and shipments that haven't received an AWB yet OR not delivered
        const THRESHOLD = new Date(Date.now() - 1000 * 60 * 60 * 2); // last 2 hours

        const orders = await Order.find({
            shipments: {
                $elemMatch: {
                    awb_code: null,
                    courier_name: null,
                    status: "Awaiting Pickup",
                    assignedAt: { $gte: THRESHOLD }  // FIXED
                }
            }
        }).select("_id shipments");


        console.log(`🔥 Tracking ${orders?.length || 0} orders for AWB updates`);
        if (!orders?.length) return;

        const token = await getShiprocketToken();

        for (const order of orders) {
            try {
                if (!order.shipments?.length) continue;

                for (const shipment of order.shipments) {
                    try {
                        if ([
                            "Delivered",
                            "Cancelled",
                            "RTO Delivered",
                            "RTO Initiated",
                            "Lost",
                            "Returning"
                        ].includes(shipment.status)) {
                            console.log(`⛔ Shipment ${shipment.shipment_id} already finished → skipping`);
                            continue;
                        }

                        const srOrderId = shipment.shiprocket_order_id || shipment.shipment_id;
                        if (!srOrderId) {
                            console.log("❌ No Shiprocket order ID or shipment ID found → skipping");
                            continue;
                        }


                        console.log(
                            `📦 Order ${order._id} → Shipment ${shipment.shipment_id} (srOrderId ${srOrderId}) | AWB: ${shipment.awb_code || 'NOT ASSIGNED'}`
                        );

                        const orderDetailsRes = await axios.get(
                            `https://apiv2.shiprocket.in/v1/external/courier/track/shipment/${shipment.shipment_id}`,
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
                            srShipment = root.shipments.find(s => String(s.shipment_id) === String(shipment.shipment_id));
                            if (!srShipment) srShipment = root.shipments[0]; // fallback
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

                        // WITH
                        if (shipment.awb_code && newAwb && shipment.awb_code === newAwb) {
                            console.log("✔️ AWB matches — checking courier anyway...");
                            shouldUpdate = true; // always update courier and tracking info
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
                                    status: ev.activity || ev.status || "Unknown",
                                    timestamp: new Date(ev.date),
                                    location: ev.location || "N/A",
                                    description: ev.activity || ev.status || "N/A",
                                }));


                                // SORT NEW EVENTS (latest first)
                                formattedEvents.sort((a, b) => b.timestamp - a.timestamp);
                                console.log("📌 Timeline + status updated for:", shipment.shipment_id);

                                // AUTO UPDATE STATUS

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

async function trackShipmentTimeline() {
    try {
        const token = await getShiprocketToken();

        const orders = await Order.find({
            shipments: {
                $elemMatch: {
                    awb_code: { $ne: null },
                    status: { $nin: ["Delivered", "Cancelled", "RTO Delivered"] }
                }
            }
        }).select("_id shipments");

        console.log(`📍 Timeline Tracker → Checking ${orders.length} orders`);

        for (const order of orders) {
            for (const shipment of order.shipments) {
                if (!shipment.awb_code) continue;
                if (["Delivered", "Cancelled", "RTO Delivered"].includes(shipment.status)) continue;

                const awb = shipment.awb_code;
                console.log(`⏳ Fetching timeline for AWB → ${awb}`);

                try {
                    // EXACT same API as working script
                    const courierRes = await axios.get(
                        `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`,
                        { headers: { Authorization: `Bearer ${token}` } }
                    );

                    const trackingData = courierRes.data?.tracking_data;
                    if (!trackingData) {
                        console.log(`⚠️ No tracking_data for AWB ${awb}`);
                        continue;
                    }

                    // EXACT same source priority (script logic)
                    const rawEvents =
                        trackingData.shipment_track_activities ||
                        trackingData.shipment_track ||
                        [];

                    // FORMAT EXACTLY like your script
                    const formattedEvents = rawEvents
                        .map(ev => {
                            if (!ev || !ev.date) return null;

                            const ts = new Date(ev.date);
                            if (isNaN(ts)) return null;

                            return {
                                status: ev.activity || ev.status || "Unknown",
                                timestamp: ts,
                                location: ev.location || "N/A",
                                description: ev.activity || ev.status || "N/A",
                            };
                        })
                        .filter(Boolean);

                    if (!formattedEvents.length) {
                        console.log(`⚠️ No timeline events for AWB ${awb}`);
                        continue;
                    }

                    // EXACT sort (latest → top)
                    formattedEvents.sort((a, b) => b.timestamp - a.timestamp);

                    // status mapping
                    const lastEvent = formattedEvents[0];
                    const mappedStatus = mapStatus(lastEvent.status || "Update");

                    // Nykaa style milestones
                    const milestones = mapTimelineToNykaa(
                        [...formattedEvents].sort((a, b) => a.timestamp - b.timestamp)
                    );

                    /** 
                     * 🚀 FINAL OVERWRITE LOGIC  
                     * EXACTLY WHAT YOUR SCRIPT DOES
                     * No merging, no retaining old events
                     */
                    await Order.updateOne(
                        {
                            _id: order._id,
                            "shipments.shipment_id": shipment.shipment_id
                        },
                        {
                            $set: {
                                "shipments.$.trackingHistory": formattedEvents,
                                "shipments.$.milestones": milestones,
                                "shipments.$.status": mappedStatus,
                                updatedAt: new Date()
                            }
                        }
                    );

                    console.log(`📦 Timeline updated → ${awb} | Status → ${mappedStatus}`);

                    // Auto-complete if delivered
                    if (mappedStatus === "Delivered") {
                        await Order.updateOne(
                            {
                                _id: order._id,
                                "shipments.shipment_id": shipment.shipment_id
                            },
                            {
                                $set: {
                                    "shipments.$.deliveredAt": new Date(),
                                    orderStatus: "Delivered"
                                }
                            }
                        );

                        console.log(`🎉 Delivered → Tracking stopped for AWB ${awb}`);
                    }

                } catch (err) {
                    console.log(
                        `❌ Timeline error for shipment ${shipment.shipment_id}`,
                        err.response?.data || err.message
                    );
                }
            }
        }

    } catch (err) {
        console.log("❌ Timeline cron failed:", err.message);
    }
}

export function startTrackingJob() {
    // CRON 1 → AWB + Shipment status
    cron.schedule("* * * * *", () => {
        console.log("🔥 Cron 1 → AWB + Shipment status");
        trackShipments().catch(err => console.error("Cron1 Error:", err));
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });

    // CRON 2 → Real Timeline Nykaa-style
    cron.schedule("*/2 * * * *", () => {
        console.log("📍 Cron 2 → Timeline (Nykaa Style)");
        trackShipmentTimeline().catch(err => console.error("Cron2 Error:", err));
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });

    console.log("✅ Both Cron Jobs Started (AWB Tracker + Timeline Tracker)");
}

// async function trackShipmentTimeline() {
//     try {
//         const token = await getShiprocketToken();

//         // All shipments that have AWB and are NOT delivered
//         const orders = await Order.find({
//             shipments: {
//                 $elemMatch: {
//                     awb_code: { $ne: null },
//                     status: { $nin: ["Delivered", "Cancelled", "RTO Delivered"] }
//                 }
//             }
//         }).select("_id shipments");

//         console.log(`📍 Timeline Tracker → Checking ${orders.length} orders`);

//         for (const order of orders) {
//             for (const shipment of order.shipments) {
//                 if (!shipment.awb_code) continue;

//                 console.log(`⏳ Fetching timeline for AWB → ${shipment.awb_code}`);

//                 if (["Delivered", "Cancelled", "RTO Delivered"].includes(shipment.status)) continue;

//                 try {
//                     const awb = shipment.awb_code;
//                     console.log(`⏳ Fetching timeline for AWB → ${awb}`);

//                     const courierRes = await axios.get(
//                         `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`,
//                         { headers: { Authorization: `Bearer ${token}` } }
//                     );

//                     const data = courierRes.data?.tracking_data || {};
//                     const shipTrack = data.shipment_track || [];

//                     if (!shipTrack.length) {
//                         console.log(`⚠️ No timeline for AWB ${awb}`);
//                         continue;
//                     }

//                     const formattedEvents = shipTrack
//                         .map(ev => sanitizeTimelineEvent({
//                             status: ev.activity || ev.status,
//                             date: ev.date,
//                             location: ev.location,
//                             description: ev.activity
//                         }))
//                         .filter(Boolean);


//                     // Sort newest first
//                     formattedEvents.sort((a, b) => b.timestamp - a.timestamp);

//                     // FIX: If all events invalid → skip
//                     if (!formattedEvents.length) {
//                         console.log(`⚠️ All timeline events invalid or removed for AWB ${awb}`);
//                         continue;   // <-- prevents crash
//                     }

//                     const lastEvent = formattedEvents[0];
//                     const mappedStatus = mapStatus(lastEvent.status || "Update");

//                     // BEFORE computing stableStatus
//                     formattedEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

//                     // THEN compute stableStatus
//                     let stableStatus = shipment.status;

//                     // RULE 1: Pickup → Ready to Ship
//                     if (formattedEvents.some(ev => ev.status.toLowerCase().includes("pickup") || ev.status.toLowerCase().includes("picked"))) {
//                         stableStatus = "Ready to Ship";
//                     }

//                     // RULE 2: In Transit → Shipped
//                     if (formattedEvents.some(ev => ev.status.toLowerCase().includes("in transit") || ev.status.toLowerCase().includes("in-scan") || ev.status.toLowerCase().includes("bagged"))) {
//                         stableStatus = "Shipped";
//                     }

//                     // RULE 3: Out for Delivery
//                     if (formattedEvents.some(ev => ev.status.toLowerCase().includes("out for delivery"))) {
//                         stableStatus = "Out for Delivery";
//                     }

//                     // RULE 4: Delivered
//                     if (formattedEvents.some(ev => ev.status.toLowerCase().includes("delivered"))) {
//                         stableStatus = "Delivered";
//                     }

//                     // RULE 5: RTO
//                     if (formattedEvents.some(ev => ev.status.toLowerCase().includes("rto initiated"))) {
//                         stableStatus = "Return Initiated";
//                     }
//                     if (formattedEvents.some(ev => ev.status.toLowerCase().includes("rto delivered"))) {
//                         stableStatus = "Returned";
//                     }

//                     // ensure chronological order: oldest -> newest

//                     // persist ascending timeline, milestones and the stable status
//                     await Order.updateOne(
//                         {
//                             _id: order._id,
//                             "shipments.shipment_id": shipment.shipment_id
//                         },
//                         {
//                             $set: {
//                                 "shipments.$.trackingHistory": formattedEvents,
//                                 "shipments.$.milestones": mapTimelineToNykaa(formattedEvents),
//                                 "shipments.$.status": stableStatus
//                             }
//                         }
//                     );

//                     // log the *stableStatus* (what's actually saved) so logs match DB
//                     console.log(`📦 Timeline updated → ${awb} | Status saved → ${stableStatus}`);


//                     // Auto complete
//                     if (mappedStatus === "Delivered") {
//                         await Order.updateOne(
//                             {
//                                 _id: order._id,
//                                 "shipments.shipment_id": shipment.shipment_id
//                             },
//                             {
//                                 $set: {
//                                     "shipments.$.deliveredAt": new Date(),
//                                     orderStatus: "Delivered"
//                                 }
//                             }
//                         );

//                         console.log(`🎉 Delivered → Tracking stopped for AWB ${awb}`);
//                     }

//                 } catch (err) {
//                     console.log(`❌ Timeline error for shipment ${shipment.shipment_id}`, err.response?.data || err.message);
//                 }
//             }
//         }

//     } catch (err) {
//         console.log("❌ Timeline cron failed:", err.message);
//     }
// }




// /** ---------- ENHANCED startTrackingJob() ---------- */
// export function startTrackingJob() {
//     cron.schedule(
//         "* * * * *", // Every minute
//         () => {
//             console.log("🔥 Running Shiprocket tracking job...");
//             trackShipments().catch((err) =>
//                 console.error("❌ Cron Error:", err.message || err)
//             );
//         },
//         {
//             scheduled: true,
//             timezone: "Asia/Kolkata"
//         }
//     );

//     console.log("✅ Shiprocket Tracking job scheduled (every 1 min) - 1000% GUARANTEED");
// }