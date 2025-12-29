// // // middlewares/utils/cron/shiprocketTrackingJob.js
// // import * as cheerio from "cheerio";
// // import cron from "node-cron";
// // import axios from "axios";
// // import Order from "../../../models/Order.js";
// // import { getShiprocketToken, extractAWBFromShiprocket } from "../../services/shiprocket.js";
// // import { computeOrderStatus } from "../../../controllers/orderController.js";
// // import { trackReturnAWBAssignment, trackReturnTimeline } from "./returnCron.js";
// // import pLimit from "p-limit";

// // const shiprocketLimit = pLimit(5); // SAFE concurrency

// // export const SHIPROCKET_STATUS_MAP = {
// //     1: "AWB Assigned",
// //     2: "Pickup Scheduled",
// //     3: "In Transit",
// //     4: "Out for Delivery",
// //     5: "Delivered",
// //     6: "RTO Initiated",
// //     7: "RTO Delivered"
// // };

// // async function trackShipments() {
// //     try {
// //         console.log("🚀 Shipment Tracking Cron Started");

// //         const orders = await Order.find({
// //             shipments: {
// //                 $elemMatch: {
// //                     type: "forward",
// //                     status: { $nin: ["Delivered", "Cancelled", "RTO Delivered"] }
// //                 }
// //             }
// //         }).select("_id shipments");

// //         console.log(`📦 Orders found → ${orders.length}`);
// //         if (!orders.length) return;

// //         const token = await getShiprocketToken();
// //         if (!token) {
// //             console.log("❌ Shiprocket token missing");
// //             return;
// //         }

// //         for (const order of orders) {
// //             for (const shipment of order.shipments) {

// //                 if (shipment.type !== "forward") continue;

// //                 const shipmentId = String(shipment.shipment_id);
// //                 let awb = shipment.awb_code;

// //                 console.log(`📦 Processing shipment → ${shipmentId}`);

// //                 /* -------------------------------------------------
// //                    STEP 1️⃣ FETCH SHIPMENT DETAILS (BEST SOURCE)
// //                 ------------------------------------------------- */
// //                 let shipmentPayload = null;

// //                 try {
// //                     const res = await axios.get(
// //                         `https://apiv2.shiprocket.in/v1/external/shipments/${shipmentId}`,
// //                         { headers: { Authorization: `Bearer ${token}` } }
// //                     );

// //                     shipmentPayload = res.data?.data || res.data;
// //                 } catch (err) {
// //                     console.log(`❌ Shipment fetch failed → ${shipmentId}`);
// //                 }

// //                 /* -------------------------------------------------
// //                    STEP 2️⃣ EXTRACT AWB + COURIER (YOUR LOGIC ✅)
// //                 ------------------------------------------------- */
// //                 const extracted = extractAWBFromShiprocket(
// //                     shipmentPayload,
// //                     shipmentPayload
// //                 );

// //                 awb = awb || extracted.awb;
// //                 const courier =
// //                     extracted.courier ||
// //                     shipment.courier_name ||
// //                     null;

// //                 const trackingUrl =
// //                     extracted.trackUrl ||
// //                     (awb ? `https://shiprocket.co/tracking/${awb}` : null);

// //                 if (!awb) {
// //                     console.log(`⏳ AWB still missing → ${shipmentId}`);
// //                     continue;
// //                 }

// //                 /* -------------------------------------------------
// //                    STEP 3️⃣ UPDATE AWB + COURIER IF MISSING
// //                 ------------------------------------------------- */
// //                 await Order.updateOne(
// //                     { _id: order._id, "shipments.shipment_id": shipmentId },
// //                     {
// //                         $set: {
// //                             "shipments.$.awb_code": awb,
// //                             ...(courier && { "shipments.$.courier_name": courier }),
// //                             ...(trackingUrl && { "shipments.$.tracking_url": trackingUrl }),
// //                             orderStatus: "Shipped"
// //                         },
// //                         $push: {
// //                             "shipments.$.tracking_history": {
// //                                 status: "AWB Assigned",
// //                                 timestamp: new Date(),
// //                                 location: "Shiprocket",
// //                                 description: `AWB ${awb} assigned`
// //                             }
// //                         }
// //                     }
// //                 );

// //                 console.log(`✅ AWB & courier stored → ${awb} | ${courier}`);

// //                 /* -------------------------------------------------
// //                    STEP 4️⃣ TRACK USING AWB
// //                 ------------------------------------------------- */
// //                 try {
// //                     console.log(`📍 Fetching tracking → ${awb}`);

// //                     const res = await axios.get(
// //                         `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`,
// //                         { headers: { Authorization: `Bearer ${token}` } }
// //                     );

// //                     const trackData = res.data?.tracking_data;
// //                     if (!trackData) {
// //                         console.log(`⚠️ No tracking data → ${awb}`);
// //                         continue;
// //                     }

// //                     const numericStatus = trackData.shipment_status;
// //                     const mappedStatus =
// //                         SHIPROCKET_STATUS_MAP[numericStatus] || "In Transit";

// //                     const activities = trackData.shipment_track_activities || [];
// //                     const last = activities[activities.length - 1];

// //                     const update = {
// //                         $set: {
// //                             "shipments.$.status": mappedStatus,
// //                             orderStatus:
// //                                 mappedStatus === "Delivered"
// //                                     ? "Delivered"
// //                                     : mappedStatus === "Out for Delivery"
// //                                         ? "Out for Delivery"
// //                                         : "Shipped"
// //                         }
// //                     };

// //                     if (last) {
// //                         update.$push = {
// //                             "shipments.$.tracking_history": {
// //                                 status: last.status,
// //                                 timestamp: new Date(last.date),
// //                                 location: last.location,
// //                                 description: last.activity
// //                             }
// //                         };
// //                     }

// //                     await Order.updateOne(
// //                         { _id: order._id, "shipments.shipment_id": shipmentId },
// //                         update
// //                     );

// //                     console.log(`🚚 Shipment updated → ${awb}`);

// //                 } catch (err) {
// //                     const status = err.response?.status;
// //                     if (status === 500) {
// //                         console.log(`⏳ Shiprocket delay → ${awb}`);
// //                     } else if (status === 429) {
// //                         console.log(`🚫 Rate limit hit → ${awb}`);
// //                     } else {
// //                         console.log(`❌ Tracking error → ${awb}`, err.message);
// //                     }
// //                 }
// //             }
// //         }

// //         console.log("✅ Shipment Tracking Cron Finished");

// //     } catch (err) {
// //         console.log("❌ trackShipments crashed:", err);
// //     }
// // }


// // async function trackShipmentTimeline() {
// //     try {
// //         const token = await getShiprocketToken();

// //         const orders = await Order.find({
// //             shipments: {
// //                 $elemMatch: {
// //                     awb_code: { $ne: null },
// //                     status: { $nin: ["Delivered", "Cancelled", "RTO Delivered"] }
// //                 }
// //             }
// //         });

// //         console.log(`📍 Timeline Tracker → Checking ${orders.length} orders`);

// //         for (const order of orders) {
// //             let orderModified = false;

// //             for (const shipment of order.shipments) {
// //                 if (!shipment.awb_code) continue;

// //                 const awb = shipment.awb_code;
// //                 console.log(`⏳ Fetching timeline for AWB → ${awb}`);

// //                 try {
// //                     const res = await axios.get(
// //                         `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`,
// //                         { headers: { Authorization: `Bearer ${token}` } }
// //                     );

// //                     const trackingData = res.data?.tracking_data;
// //                     if (!trackingData) continue;

// //                     const rawEvents = trackingData.shipment_track_activities || [];

// //                     // ❗ DO NOT WIPE EXISTING HISTORY
// //                     if (rawEvents.length > 0) {
// //                         const existing = shipment.tracking_history || [];

// //                         const newEvents = rawEvents
// //                             .map(ev => ({
// //                                 status: ev.activity,
// //                                 description: ev.activity,
// //                                 location: ev.location || "N/A",
// //                                 timestamp: new Date(ev.date)
// //                             }))
// //                             .filter(ev =>
// //                                 !existing.some(e =>
// //                                     e.status === ev.status &&
// //                                     new Date(e.timestamp).getTime() === ev.timestamp.getTime()
// //                                 )
// //                             );

// //                         if (newEvents.length > 0) {
// //                             shipment.tracking_history.push(...newEvents);
// //                             orderModified = true;
// //                         }
// //                     }

// //                     // ✅ SAFE STATUS MAP
// //                     if (trackingData.shipment_status !== undefined) {
// //                         shipment.status =
// //                             SHIPROCKET_STATUS_MAP[trackingData.shipment_status] ||
// //                             shipment.status;
// //                     }

// //                     console.log(`✅ Timeline synced → ${awb}`);

// //                 } catch (err) {
// //                     const msg = err.response?.data?.message || "";

// //                     if (msg.toLowerCase().includes("cancelled")) {
// //                         shipment.status = "Cancelled";
// //                         shipment.tracking_history.push({
// //                             status: "Cancelled",
// //                             description: "Shipment cancelled by courier",
// //                             location: "Shiprocket",
// //                             timestamp: new Date()
// //                         });
// //                         orderModified = true;
// //                         console.log(`🚫 Shipment cancelled → ${awb}`);
// //                         continue;
// //                     }

// //                     console.log(`❌ Timeline error → ${awb}`, err.message);
// //                 }
// //             }

// //             if (orderModified) {
// //                 order.markModified("shipments");
// //                 await order.save();
// //             }
// //         }

// //         console.log("✅ Timeline Cron Finished");

// //     } catch (err) {
// //         console.log("❌ Timeline cron failed:", err.message);
// //     }
// // }

// // export function startTrackingJob() {
// //     cron.schedule("* * * * *", () => {
// //         console.log("🔥 Cron 1 → AWB + Shipment status");
// //         trackReturnTimeline();
// //     });

// //     console.log("✅ Tracking Jobs Started.");
// // }







// //the above code is perfect for forward ok ,... now asyncronously all crosn works ,.. do that at saturday,13/12/2025



// // // middlewares/utils/cron/shiprocketTrackingJob.js
// // // FINAL PRODUCTION VERSION – SAFE, ASYNC, NON-BLOCKING

// // import cron from "node-cron";
// // import axios from "axios";
// // import pLimit from "p-limit";
// // import mongoose from "mongoose";
// // import Order from "../../../models/Order.js";
// // import { getShiprocketToken, extractAWBFromShiprocket } from "../../services/shiprocket.js";
// // import { computeOrderStatus } from "../../../controllers/orderController.js";
// // import { trackReturnAWBAssignment, trackReturnTimeline } from "./returnCron.js";

// // const shiprocketLimit = pLimit(5);

// // const SR_DEBUG = false;

// // function srLog(...args) {
// //     if (SR_DEBUG) console.log("🚚 [SHIPROCKET]", ...args);
// // }

// // function srErr(...args) {
// //     console.error("❌ [SHIPROCKET]", ...args);
// // }

// // export async function safeShiprocketGet(url, token) {
// //     try {
// //         return await axios.get(url, {
// //             headers: { Authorization: `Bearer ${token}` },
// //             timeout: 10000
// //         });
// //     } catch (err) {

// //         const status = err.response?.status;

// //         // ⏳ Return tracking NOT READY (very common)
// //         if (status === 404) {
// //             return { _notReady: true };
// //         }

// //         // 🔁 Temporary Shiprocket issues
// //         if ([500, 429].includes(status)) {
// //             return null;
// //         }

// //         // ❌ Real failure
// //         throw err;
// //     }
// // }


// // /* -------------------------------------------------------------------------- */
// // /*                              STATUS NORMALIZER                               */
// // /* -------------------------------------------------------------------------- */
// // function normalizeShipmentStatus(raw) {
// //     const map = {
// //         "awb assigned": "AWB Assigned",
// //         "pickup scheduled": "Pickup Scheduled",
// //         "picked up": "Pickup Done",
// //         "pickup done": "Pickup Done",
// //         "in transit": "In Transit",
// //         "out for delivery": "Out for Delivery",
// //         "delivered": "Delivered",
// //         "rto initiated": "RTO Initiated",
// //         "rto delivered": "RTO Delivered"
// //     };
// //     return map[String(raw || "").toLowerCase()] || "In Transit";
// // }

// // export const SHIPROCKET_STATUS_MAP = {
// //     1: "AWB Assigned",
// //     2: "Pickup Scheduled",
// //     3: "In Transit",
// //     4: "Out for Delivery",
// //     5: "Delivered",
// //     6: "RTO Initiated",
// //     7: "RTO Delivered"
// // };

// // const TRACKABLE_STATUSES = [
// //     "AWB Assigned",
// //     "Pickup Scheduled",
// //     "Manifested",
// //     "Pickup Done",
// //     "In Transit",
// //     "Out for Delivery",
// //     "Delivered"
// // ];

// // /* -------------------------------------------------------------------------- */
// // /*                               CRON LOCKING                                  */
// // /* -------------------------------------------------------------------------- */
// // async function acquireLock(key, ttlSeconds = 90) {
// //     const now = new Date();
// //     const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
// //     const col = mongoose.connection.collection("cron_locks");

// //     try {
// //         await col.insertOne({ _id: key, expiresAt });
// //         return true;
// //     } catch (e) {
// //         if (e.code !== 11000) throw e;
// //     }

// //     const res = await col.findOneAndUpdate(
// //         { _id: key, expiresAt: { $lt: now } },
// //         { $set: { expiresAt } }
// //     );

// //     return !!res;
// // }

// // /* -------------------------------------------------------------------------- */
// // /*                        FORWARD – AWB ASSIGNMENT ONLY                          */
// // /* -------------------------------------------------------------------------- */
// // async function trackShipments() {
// //     if (!(await acquireLock("forward-awb-cron"))) return;

// //     try {
// //         const orders = await Order.find({
// //             shipments: { $elemMatch: { type: "forward", awb_code: { $in: [null, ""] } } }
// //         }).select("_id shipments");

// //         const token = await getShiprocketToken();
// //         if (!token) return;

// //         const tasks = [];

// //         for (const order of orders) {
// //             for (const shipment of order.shipments) {
// //                 if (shipment.type !== "forward" || shipment.awb_code) continue;
// //                 tasks.push(shiprocketLimit(() =>
// //                     processForwardShipment(order._id, shipment, token)
// //                 ));
// //             }
// //         }

// //         await Promise.allSettled(tasks);
// //     } catch (err) {
// //         console.error("❌ Forward AWB cron error:", err.message);
// //     }
// // }

// // async function processForwardShipment(orderId, shipment, token) {
// //     try {
// //         const res = await safeShiprocketGet(
// //             `https://apiv2.shiprocket.in/v1/external/shipments/${shipment.shipment_id}`,
// //             token
// //         );
// //         if (!res) return;

// //         const payload = res.data?.data || res.data;
// //         const extracted = extractAWBFromShiprocket(payload, payload);
// //         if (!extracted?.awb) return;

// //         await Order.updateOne(
// //             { _id: orderId, "shipments._id": shipment._id, "shipments.awb_code": { $in: [null, ""] } },
// //             {
// //                 $set: {
// //                     "shipments.$.awb_code": extracted.awb,
// //                     "shipments.$.courier_name": extracted.courier || null,
// //                     "shipments.$.tracking_url":
// //                         extracted.trackUrl || `https://shiprocket.co/tracking/${extracted.awb}`,
// //                     "shipments.$.status": "AWB Assigned"
// //                 },
// //                 $push: {
// //                     "shipments.$.tracking_history": {
// //                         status: "AWB Assigned",
// //                         timestamp: new Date(),
// //                         location: "Shiprocket",
// //                         description: `AWB ${extracted.awb} assigned`
// //                     }
// //                 }
// //             }
// //         );

// //     } catch (err) {
// //         console.error("❌ processForwardShipment error:", err.message);
// //     }
// // }



// // async function trackShipmentTimeline() {
// //     srLog("⏰ Cron started: Forward Shipment Timeline");

// //     try {
// //         const token = await getShiprocketToken();
// //         if (!token) {
// //             srErr("❌ Shiprocket token not found");
// //             return;
// //         }

// //         srLog("✅ Shiprocket token acquired");

// //         const orders = await Order.find({
// //             shipments: {
// //                 $elemMatch: {
// //                     awb_code: { $ne: null },
// //                     status: { $nin: ["Delivered", "Cancelled", "RTO Delivered"] }
// //                 }
// //             }
// //         });

// //         srLog(`📦 Orders eligible for tracking: ${orders.length}`);

// //         const tasks = [];
// //         const processedAwbs = new Set(); // 🔒 prevent duplicate API calls

// //         for (const order of orders) {
// //             srLog(`➡️ Order ${order._id} | Shipments=${order.shipments.length}`);

// //             for (const shipment of order.shipments) {
// //                 if (!shipment.awb_code) continue;
// //                 if (!TRACKABLE_STATUSES.includes(shipment.status)) continue;

// //                 if (
// //                     shipment.lastTrackingAttemptAt &&
// //                     Date.now() - new Date(shipment.lastTrackingAttemptAt).getTime() < 5 * 60 * 1000
// //                 ) continue;

// //                 if (processedAwbs.has(shipment.awb_code)) {
// //                     srLog(`⏭️ Skipped duplicate AWB ${shipment.awb_code}`);
// //                     continue;
// //                 }

// //                 processedAwbs.add(shipment.awb_code);

// //                 tasks.push(
// //                     shiprocketLimit(() =>
// //                         processForwardTimeline(order._id, shipment, token)
// //                     )
// //                 );
// //             }
// //         }

// //         srLog(`🚀 Total Shiprocket API calls: ${tasks.length}`);

// //         const results = await Promise.allSettled(tasks);

// //         srLog(
// //             `✅ Timeline done | Success=${results.filter(r => r.status === "fulfilled").length
// //             }, Failed=${results.filter(r => r.status === "rejected").length}`
// //         );

// //     } catch (err) {
// //         srErr("❌ Forward timeline cron crashed:", err);
// //     }
// // }

// // async function processForwardTimeline(orderId, shipment, token) {
// //     srLog(`🔍 Tracking started | Order=${orderId} | Shipment=${shipment._id}`);

// //     try {
// //         const url = `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${shipment.awb_code}`;
// //         srLog(`🌐 API CALL → ${url}`);

// //         const res = await safeShiprocketGet(url, token);
// //         if (!res?.data?.tracking_data) {
// //             srErr("❌ Invalid Shiprocket response");
// //             return;
// //         }

// //         const trackingData = res.data.tracking_data;

// //         const snapshot = trackingData.shipment_track?.[0];

// //         // 🚫 CANCELLED AT COURIER LEVEL
// //         if (
// //             snapshot?.current_status === "Canceled" ||
// //             trackingData.shipment_status === 8
// //         ) {
// //             srLog("🚫 Shipment CANCELLED at courier");

// //             await Order.updateOne(
// //                 { _id: orderId, "shipments._id": shipment._id },
// //                 {
// //                     $push: {
// //                         "shipments.$.tracking_history": { $each: newEvents }
// //                     },
// //                     $set: {
// //                         "shipments.$.status": normalizedStatus,
// //                         "shipments.$.tracking_url":
// //                             `https://shiprocket.co/tracking/${shipment.awb_code}`,
// //                         "shipments.$.lastTrackingAttemptAt": new Date()
// //                     }
// //                 }
// //             );

// //             return;
// //         }

// //         /* -------------------------------------------------
// //            🧠 COLLECT EVENTS FROM BOTH SOURCES
// //         -------------------------------------------------- */

// //         let events = [];

// //         // 1️⃣ shipment_track_activities (PRIMARY)
// //         if (Array.isArray(trackingData.shipment_track_activities)) {
// //             events.push(
// //                 ...trackingData.shipment_track_activities.map(ev => ({
// //                     status: ev.activity,
// //                     description: ev.activity,
// //                     location: ev.location || "N/A",
// //                     timestamp: ev.date ? new Date(ev.date) : null
// //                 }))
// //             );
// //         }

// //         // 2️⃣ shipment_track snapshot (FALLBACK / CURRENT STATE)
// //         if (snapshot?.current_status && snapshot?.updated_time_stamp) {
// //             events.push({
// //                 status: snapshot.current_status,
// //                 description: snapshot.current_status,
// //                 location: snapshot.destination || "N/A",
// //                 timestamp: new Date(snapshot.updated_time_stamp)
// //             });
// //         }

// //         // 🛡️ HARD SAFETY FILTER (NO GARBAGE)
// //         events = events.filter(e =>
// //             e.status &&
// //             e.timestamp instanceof Date &&
// //             !isNaN(e.timestamp)
// //         );

// //         if (!events.length) {
// //             srLog("⏭️ No valid tracking events");
// //             return;
// //         }

// //         /* -------------------------------------------------
// //            🔁 DEDUPLICATION
// //         -------------------------------------------------- */

// //         const existing = shipment.tracking_history || [];

// //         const newEvents = events.filter(ev =>
// //             !existing.some(e =>
// //                 e.status === ev.status &&
// //                 Math.abs(new Date(e.timestamp) - ev.timestamp) < 60000
// //             )
// //         );

// //         if (!newEvents.length) {
// //             srLog("⏭️ No new tracking events");
// //             return;
// //         }

// //         /* -------------------------------------------------
// //            🔄 STATUS NORMALIZATION
// //         -------------------------------------------------- */

// //         const normalizedStatus = normalizeShipmentStatus(
// //             trackingData.shipment_status ||
// //             newEvents[newEvents.length - 1].status
// //         );

// //         /* -------------------------------------------------
// //            💾 DB UPDATE
// //         -------------------------------------------------- */

// //         const updateResult = await Order.updateOne(
// //             { _id: orderId, "shipments._id": shipment._id, "shipments.awb_code": { $in: [null, ""] } },
// //             {
// //                 $set: {
// //                     "shipments.$.awb_code": extracted.awb,
// //                     "shipments.$.tracking_url":
// //                         extracted.trackUrl || `https://shiprocket.co/tracking/${extracted.awb}`,
// //                     "shipments.$.status": "AWB Assigned"
// //                 },
// //                 $setOnInsert: {
// //                     "shipments.$.courier_name": extracted.courier || null
// //                 },
// //                 $push: {
// //                     "shipments.$.tracking_history": {
// //                         status: "AWB Assigned",
// //                         timestamp: new Date(),
// //                         location: "Shiprocket",
// //                         description: `AWB ${extracted.awb} assigned`
// //                     }
// //                 }
// //             }
// //         );



// //         /* -------------------------------------------------
// //            📦 ORDER STATUS UPDATE
// //         -------------------------------------------------- */

// //         const order = await Order.findById(orderId);
// //         const prevStatus = order.orderStatus;

// //         order.orderStatus = computeOrderStatus(order.shipments);
// //         await order.save();

// //         srLog(`📦 Order status updated | ${prevStatus} → ${order.orderStatus}`);

// //     } catch (err) {
// //         srErr(
// //             `❌ Timeline failed | Order=${orderId} | Shipment=${shipment._id}`,
// //             err
// //         );
// //     }
// // }


// // /* -------------------------------------------------------------------------- */
// // /*                                   START                                     */
// // /* -------------------------------------------------------------------------- */
// // export function startTrackingJob() {

// //     cron.schedule("* * * * *", trackShipments);          // Forward AWB
// //     cron.schedule("*/2 * * * *", trackShipmentTimeline); // Forward Timeline
// //     cron.schedule("*/3 * * * *", trackReturnAWBAssignment);
// //     cron.schedule("*/4 * * * *", trackReturnTimeline);

// //     console.log("✅ Shiprocket Forward + Return Cron Jobs Started (PRODUCTION SAFE)");
// // }















// //the above code is perfect for forward ok ,... now asyncronously all crosn works ,.. do that at saturday,17/12/2025


// import cron from "node-cron";
// import axios from "axios";
// import pLimit from "p-limit";
// import mongoose from "mongoose";
// import Order from "../../../models/Order.js";
// import { getShiprocketToken, extractAWBFromShiprocket } from "../../services/shiprocket.js";
// import { computeOrderStatus } from "../../../controllers/orderController.js";
// import { trackReturnAWBAssignment, trackReturnTimeline } from "./returnCron.js";

// const shiprocketLimit = pLimit(5);
// const SR_DEBUG = false;

// function srLog(...args) {
//     if (SR_DEBUG) console.log("🚚 [SHIPROCKET]", ...args);
// }
// function srErr(...args) {
//     console.error("❌ [SHIPROCKET]", ...args);
// }

// function srCtx(orderId, shipment, extra = {}) {
//     return {
//         orderId: String(orderId),
//         shipmentId: String(shipment?._id),
//         awb: shipment?.awb_code || "NA",
//         status: shipment?.status,
//         ...extra
//     };
// }


// /* -------------------------------------------------------------------------- */
// /*                               SAFE API CALL                                 */
// /* -------------------------------------------------------------------------- */
// export async function safeShiprocketGet(url, token) {
//     try {
//         return await axios.get(url, {
//             headers: { Authorization: `Bearer ${token}` },
//             timeout: 10000
//         });
//     } catch (err) {
//         const status = err.response?.status;
//         if (status === 404) return { _notReady: true };
//         if ([500, 429].includes(status)) return null;
//         throw err;
//     }
// }

// /* -------------------------------------------------------------------------- */
// /*                              STATUS NORMALIZER                              */
// /* -------------------------------------------------------------------------- */
// function normalizeShipmentStatus(raw) {
//     const map = {
//         "awb assigned": "AWB Assigned",
//         "pickup scheduled": "Pickup Scheduled",
//         "picked up": "Pickup Done",
//         "pickup done": "Pickup Done",
//         "in transit": "In Transit",
//         "out for delivery": "Out for Delivery",
//         "delivered": "Delivered",
//         "rto initiated": "RTO Initiated",
//         "rto delivered": "RTO Delivered",
//         "canceled": "Cancelled"
//     };
//     return map[String(raw || "").toLowerCase()] || "In Transit";
// }

// const TRACKABLE_STATUSES = [
//     "AWB Assigned",
//     "Pickup Scheduled",
//     "Manifested",
//     "Pickup Done",
//     "In Transit",
//     "Out for Delivery",
//     "Delivered"
// ];

// /* -------------------------------------------------------------------------- */
// /*                               CRON LOCK                                     */
// /* -------------------------------------------------------------------------- */
// async function acquireLock(key, ttlSeconds = 90) {
//     const now = new Date();
//     const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
//     const col = mongoose.connection.collection("cron_locks");

//     try {
//         await col.insertOne({ _id: key, expiresAt });
//         return true;
//     } catch (e) {
//         if (e.code !== 11000) throw e;
//     }

//     const res = await col.findOneAndUpdate(
//         { _id: key, expiresAt: { $lt: now } },
//         { $set: { expiresAt } }
//     );

//     return !!res;
// }

// /* -------------------------------------------------------------------------- */
// /*                           FORWARD – AWB ASSIGN                               */
// /* -------------------------------------------------------------------------- */
// async function trackShipments() {
//     if (!(await acquireLock("forward-awb-cron"))) {
//         srLog("⏭️ AWB cron skipped (lock active)");
//         return;
//     }

//     try {
//         srLog("🔍 AWB scan started");

//         const orders = await Order.find({
//             shipments: { $elemMatch: { type: "forward", awb_code: { $in: [null, ""] } } }
//         }).select("_id shipments");

//         srLog(`📦 Orders fetched`, { count: orders.length });

//         const token = await getShiprocketToken();
//         if (!token) {
//             srErr("❌ Shiprocket token missing");
//             return;
//         }

//         const tasks = [];

//         for (const order of orders) {
//             for (const shipment of order.shipments) {

//                 srLog("🔎 Checking shipment", srCtx(order._id, shipment));

//                 if (shipment.type !== "forward") {
//                     srLog("⏭️ Skip: Not forward", srCtx(order._id, shipment));
//                     continue;
//                 }

//                 if (shipment.awb_code) {
//                     srLog("⏭️ Skip: AWB already exists", srCtx(order._id, shipment));
//                     continue;
//                 }

//                 srLog("📌 AWB fetch queued", srCtx(order._id, shipment));

//                 tasks.push(
//                     shiprocketLimit(() =>
//                         processForwardShipment(order._id, shipment, token)
//                     )
//                 );
//             }
//         }

//         await Promise.allSettled(tasks);
//         srLog("✅ AWB cron finished");

//     } catch (err) {
//         srErr("❌ Forward AWB cron error", err.message);
//     }
// }


// async function processForwardShipment(orderId, shipment, token) {
//     try {
//         srLog("🚀 AWB fetch START", srCtx(orderId, shipment));

//         if (!shipment.shipment_id) {
//             srErr("❌ Missing shipment_id", srCtx(orderId, shipment));
//             return;
//         }

//         const res = await safeShiprocketGet(
//             `https://apiv2.shiprocket.in/v1/external/shipments/${shipment.shipment_id}`,
//             token
//         );

//         if (!res?.data) return;

//         const payload = res.data?.data || res.data;
//         const extracted = extractAWBFromShiprocket(payload, shipment.shipment_id);

//         if (!extracted?.awb) {
//             srLog("⏭️ AWB not yet assigned", srCtx(orderId, shipment));
//             return;
//         }

//         // 🔒 HARD SAFETY: never overwrite
//         const updated = await Order.updateOne(
//             {
//                 _id: orderId,
//                 "shipments.shipment_id": String(shipment.shipment_id),
//                 "shipments.awb_code": { $in: [null, ""] }
//             },
//             {
//                 $set: {
//                     "shipments.$.awb_code": extracted.awb,
//                     "shipments.$.courier_name": extracted.courier || null,
//                     "shipments.$.tracking_url": extracted.trackUrl,
//                     "shipments.$.status": "AWB Assigned"
//                 },
//                 $push: {
//                     "shipments.$.tracking_history": {
//                         status: "AWB Assigned",
//                         timestamp: new Date(),
//                         location: "Shiprocket",
//                         description: `AWB ${extracted.awb} assigned`
//                     }
//                 }
//             }
//         );

//         if (updated.modifiedCount === 0) {
//             srLog("⏭️ AWB already set, skip", srCtx(orderId, shipment));
//             return;
//         }

//         srLog("💾 AWB saved safely", {
//             ...srCtx(orderId, shipment),
//             awb: extracted.awb,
//             courier: extracted.courier
//         });

//     } catch (err) {
//         srErr("❌ processForwardShipment error", srCtx(orderId, shipment), err.message);
//     }
// }


// /* -------------------------------------------------------------------------- */
// /*                           FORWARD – TIMELINE                                 */
// /* -------------------------------------------------------------------------- */
// async function trackShipmentTimeline() {
//     srLog("⏰ Timeline cron started");

//     const token = await getShiprocketToken();
//     if (!token) {
//         srErr("❌ Shiprocket token missing");
//         return;
//     }

//     const orders = await Order.find({
//         shipments: {
//             $elemMatch: {
//                 awb_code: { $ne: null },
//                 status: { $nin: ["Delivered", "Cancelled", "RTO Delivered"] }
//             }
//         }
//     });

//     srLog(`📦 Orders fetched for timeline`, { count: orders.length });

//     const processedAwbs = new Set();
//     const tasks = [];

//     const processedShipments = new Set();


//     for (const order of orders) {
//         for (const shipment of order.shipments) {

//             srLog("🔍 Timeline check", srCtx(order._id, shipment));

//             if (!shipment.awb_code) {
//                 srLog("⏭️ Skip: No AWB", srCtx(order._id, shipment));
//                 continue;
//             }

//             if (!TRACKABLE_STATUSES.includes(shipment.status)) {
//                 srLog("⏭️ Skip: Status not trackable", srCtx(order._id, shipment));
//                 continue;
//             }

//             if (
//                 shipment.lastTrackingAttemptAt &&
//                 Date.now() - new Date(shipment.lastTrackingAttemptAt) < 5 * 60 * 1000
//             ) {
//                 srLog("⏭️ Skip: Cooldown active", srCtx(order._id, shipment));
//                 continue;
//             }


//             const key = `${order._id}-${shipment.shipment_id}`;
//             if (processedShipments.has(key)) continue;
//             processedShipments.add(key);


//             processedAwbs.add(shipment.awb_code);
//             srLog("📌 Timeline fetch queued", srCtx(order._id, shipment));

//             tasks.push(
//                 shiprocketLimit(() =>
//                     processForwardTimeline(order._id, shipment, token)
//                 )
//             );
//         }
//     }

//     await Promise.allSettled(tasks);
//     srLog("✅ Timeline cron finished");
// }

// async function processForwardTimeline(orderId, shipment, token) {
//     try {
//         srLog("🚀 Timeline START", srCtx(orderId, shipment));

//         const res = await safeShiprocketGet(
//             `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${shipment.awb_code}`,
//             token
//         );

//         /* ---------------------------------------------
//           AUTO-CANCEL FALLBACK (Shiprocket API Delay)
//        ---------------------------------------------- */
//         if (!res?.data?.tracking_data) {

//             // 1) If Shiprocket shows old status but no tracking for 10 days → auto-cancel
//             const createdAt = new Date(shipment.createdAt || shipment.created_date || Date.now());
//             const ageDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

//             if (ageDays > 10) {
//                 srLog("🚫 Auto-cancel fallback triggered (no pickup for 10 days)", srCtx(orderId, shipment));

//                 await Order.updateOne(
//                     { _id: orderId, "shipments._id": shipment._id },
//                     {
//                         $set: {
//                             "shipments.$.status": "Cancelled",
//                             "shipments.$.cancelReason": "Auto Cancelled by Shiprocket",
//                             "shipments.$.lastTrackingAttemptAt": new Date()
//                         },
//                         $push: {
//                             "shipments.$.tracking_history": {
//                                 status: "Cancelled",
//                                 timestamp: new Date(),
//                                 location: "Shiprocket",
//                                 description: "Auto cancelled by Shiprocket (No pickup within 10 days)"
//                             }
//                         }
//                     }
//                 );
//                 return;
//             }

//             // 2) IF NOT CANCELLED: tracking not ready → do NOT error
//             srLog("🟡 Tracking pending (courier has no events yet)", srCtx(orderId, shipment));
//             await Order.updateOne(
//                 { _id: orderId, "shipments._id": shipment._id },
//                 { $set: { "shipments.$.lastTrackingAttemptAt": new Date() } }
//             );
//             return;
//         }


//         if (!res?.data?.tracking_data) {
//             srErr("❌ Invalid tracking payload", srCtx(orderId, shipment));
//             return;
//         }

//         const trackingData = res.data.tracking_data;
//         const snapshot = trackingData.shipment_track?.[0];

//         /* -------------------- CANCELLED -------------------- */
//         if (snapshot?.current_status === "Canceled" || trackingData.shipment_status === 8) {
//             srLog("🚫 Shipment cancelled by courier", srCtx(orderId, shipment));

//             await Order.updateOne(
//                 { _id: orderId, "shipments._id": shipment._id },
//                 {
//                     $set: {
//                         "shipments.$.status": "Cancelled",
//                         "shipments.$.lastTrackingAttemptAt": new Date()
//                     },
//                     $push: {
//                         "shipments.$.tracking_history": {
//                             status: "Cancelled",
//                             timestamp: new Date(),
//                             location: "Courier",
//                             description: "Shipment cancelled by courier"
//                         }
//                     }
//                 }
//             );
//             return;
//         }

//         /* -------------------- EVENTS -------------------- */
//         let events = [];

//         if (Array.isArray(trackingData.shipment_track_activities)) {
//             events.push(...trackingData.shipment_track_activities.map(ev => ({
//                 status: ev.activity,
//                 description: ev.activity,
//                 location: ev.location || "N/A",
//                 timestamp: new Date(ev.date)
//             })));
//         }

//         if (snapshot?.current_status && snapshot?.updated_time_stamp) {
//             events.push({
//                 status: snapshot.current_status,
//                 description: snapshot.current_status,
//                 location: snapshot.destination || "N/A",
//                 timestamp: new Date(snapshot.updated_time_stamp)
//             });
//         }

//         events = events.filter(e => e.status && e.timestamp && !isNaN(e.timestamp));
//         srLog("📦 Events received", { ...srCtx(orderId, shipment), count: events.length });

//         if (!events.length) return;

//         const existing = shipment.tracking_history || [];
//         const newEvents = events.filter(ev =>
//             !existing.some(e =>
//                 e.status === ev.status &&
//                 Math.abs(new Date(e.timestamp) - ev.timestamp) < 60000
//             )
//         );

//         srLog("🧹 New events after dedup", { ...srCtx(orderId, shipment), count: newEvents.length });

//         if (!newEvents.length) return;

//         const normalizedStatus = normalizeShipmentStatus(
//             newEvents[newEvents.length - 1].status
//         );

//         /* -------------------- COD PAYMENT CONFIRMATION -------------------- */
//         if (normalizedStatus === "Delivered") {
//             const orderDoc = await Order.findById(orderId);

//             if (
//                 orderDoc &&
//                 orderDoc.paymentMethod === "COD" &&
//                 !orderDoc.paid
//             ) {
//                 orderDoc.paid = true;
//                 orderDoc.paymentStatus = "success";
//                 orderDoc.transactionId = `COD-${shipment.awb_code}`;
//                 orderDoc.paidAt = new Date();

//                 await orderDoc.save();

//                 srLog("💰 COD payment marked as PAID", {
//                     orderId,
//                     awb: shipment.awb_code
//                 });
//             }
//         }

//         await Order.updateOne(
//             { _id: orderId, "shipments._id": shipment._id },
//             {
//                 $set: {
//                     "shipments.$.status": normalizedStatus,
//                     "shipments.$.tracking_url":
//                         `https://shiprocket.co/tracking/${shipment.awb_code}`,
//                     "shipments.$.lastTrackingAttemptAt": new Date()
//                 },
//                 $push: {
//                     "shipments.$.tracking_history": { $each: newEvents }
//                 }
//             }
//         );

//         srLog("💾 Tracking updated", { ...srCtx(orderId, shipment), newStatus: normalizedStatus });

//         const order = await Order.findById(orderId);
//         order.orderStatus = computeOrderStatus(order.shipments);
//         await order.save();

//         srLog("📦 Order status recalculated", { orderId, status: order.orderStatus });

//     } catch (err) {
//         srErr("❌ Timeline error", srCtx(orderId, shipment), err.message);
//     }
// }


// /* -------------------------------------------------------------------------- */
// /*                                   START                                     */
// /* -------------------------------------------------------------------------- */
// export function startTrackingJob() {
//     cron.schedule("* * * * *", trackShipments);
//     cron.schedule("*/2 * * * *", trackShipmentTimeline);
//     cron.schedule("*/3 * * * *", trackReturnAWBAssignment);
//     cron.schedule("*/4 * * * *", trackReturnTimeline);

//     console.log("✅ Shiprocket Forward + Return Cron Jobs Started (PRODUCTION SAFE)");
// }
