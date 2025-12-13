
// // corrected-return-cron.js
// import cron from "node-cron";
// import axios from "axios";
// import * as cheerio from "cheerio";
// import Order from "../../../models/Order.js";
// import { getShiprocketToken } from "../../services/shiprocket.js";
// import { addRefundJob } from "../../services/refundQueue.js";
// import pLimit from "p-limit";

// const shiprocketLimit = pLimit(5); // SAFE concurrency

// /* -----------------------------
//    HELPER FUNCTIONS
// ----------------------------- */

// export function deepSearch(obj, keys) {
//     let found = null;
//     function search(o) {
//         if (!o || typeof o !== "object") return;
//         for (let k of Object.keys(o)) {
//             if (keys.includes(k)) found = o[k];
//             if (typeof o[k] === "object") search(o[k]);
//         }
//     }
//     search(obj);
//     return found;
// }

// export function extractAWBFromShiprocket(data, srShipment) {
//     const awb =
//         deepSearch(srShipment, ["awb_code", "awb", "waybill", "last_mile_awb"]) ||
//         deepSearch(data, ["awb_code", "awb", "waybill", "last_mile_awb"]) ||
//         null;

//     const courier =
//         deepSearch(srShipment, [
//             "courier_name",
//             "courier_company",
//             "assigned_courier",
//             "last_mile_courier",
//             "last_mile_courier_name",
//             "lm_courier_name",
//             "lm_courier",
//             "courier",
//         ]) ||
//         deepSearch(data, [
//             "courier_name",
//             "courier_company",
//             "assigned_courier",
//             "last_mile_courier",
//             "last_mile_courier_name",
//             "lm_courier_name",
//         ]) ||
//         null;

//     const trackUrl =
//         deepSearch(srShipment, ["tracking_url", "track_url", "trackingLink"]) ||
//         deepSearch(data, ["tracking_url", "track_url"]) ||
//         (awb ? `https://shiprocket.co/tracking/${awb}` : null);

//     return { awb, courier, trackUrl, srShipment };
// }

// export const SHIPROCKET_STATUS_MAP = {
//     1: "AWB Assigned",
//     2: "Pickup Scheduled",
//     3: "In Transit",
//     4: "Out for Delivery",
//     5: "Delivered",
//     6: "RTO Initiated",
//     7: "RTO Delivered",
// };

// export function mapActivityToStatus(activity = "") {
//     const a = activity.toLowerCase();
//     if (a.includes("pickup scheduled") || a.includes("schedule pickup"))
//         return "Pickup Scheduled";
//     if (a.includes("pickup exception")) return "Pickup Scheduled";
//     if (a.includes("picked up") || a.includes("shipment picked")) return "Pickup Done";
//     if (a.includes("in transit")) return "In Transit";
//     if (a.includes("received at hub") || a.includes("arrived at")) return "In Transit";
//     if (a.includes("out for delivery")) return "Out for Delivery";
//     if (a.includes("delivered")) return "Delivered";
//     if (a.includes("rto initiated") || a.includes("return to origin")) return "RTO Initiated";
//     if (a.includes("rto delivered")) return "RTO Delivered";
//     return "In Transit";
// }

// /* -----------------------------
//    PUBLIC TRACKING SCRAPER
// ----------------------------- */
// async function scrapeShiprocketPublicTracking(awb) {
//     const url = `https://shiprocket.co/tracking/${awb}`;
//     const html = await axios.get(url).then(r => r.data);
//     const $ = cheerio.load(html);
//     const events = [];
//     $(".activity-card").each((i, el) => {
//         const activity = $(el).find(".activity-heading").text().trim();
//         const location = $(el).find(".activity-location").text().trim();
//         const date = $(el).find(".activity-date").text().trim();
//         events.push({
//             status: mapActivityToStatus(activity),
//             timestamp: new Date(date),
//             location,
//             description: activity,
//         });
//     });
//     return events;
// }

// /* -----------------------------
//    RETURN CRON 1 → ASSIGN AWB
// ----------------------------- */
// export async function trackReturnAWBAssignment() {
//     console.log("🔄 Return AWB Tracking Cron Running...");
//     try {
//         const token = await getShiprocketToken();
//         if (!token) throw new Error("No Shiprocket token");

//         const THRESHOLD = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

//         const orders = await Order.find({
//             "shipments.returns": {
//                 $elemMatch: { awb_code: null, shiprocket_order_id: { $ne: null }, createdAt: { $gte: THRESHOLD } }
//             }
//         }).select("_id shipments");

//         if (!orders?.length) return console.log("No return orders to assign AWB.");

//         for (const order of orders) {
//             for (const shipment of order.shipments) {
//                 if (!shipment.returns?.length) continue;
//                 for (const ret of shipment.returns) {
//                     if (ret.awb_code) continue;
//                     const srOrderId = ret.shiprocket_order_id;
//                     if (!srOrderId) continue;

//                     try {
//                         const orderRes = await axios.get(
//                             `https://apiv2.shiprocket.in/v1/external/orders/show/${srOrderId}`,
//                             { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
//                         );
//                         const orderData = orderRes.data?.data;
//                         if (!orderData) continue;

//                         const { awb, courier, trackUrl } = extractAWBFromShiprocket(orderData, orderData.shipments?.[0] || orderData);

//                         if (!awb) continue;

//                         await Order.updateOne(
//                             { _id: order._id },
//                             {
//                                 $set: {
//                                     "shipments.$[ship].returns.$[ret].awb_code": awb,
//                                     "shipments.$[ship].returns.$[ret].courier_name": courier,
//                                     "shipments.$[ship].returns.$[ret].tracking_url": trackUrl,
//                                     "shipments.$[ship].returns.$[ret].status": "pickup_scheduled"
//                                 },
//                                 $push: {
//                                     "shipments.$[ship].returns.$[ret].tracking_history": {
//                                         status: "AWB Assigned",
//                                         timestamp: new Date(),
//                                         location: "Shiprocket",
//                                         description: `Return AWB ${awb} assigned`
//                                     },
//                                     "shipments.$[ship].returns.$[ret].audit_trail": {
//                                         status: "awb_assigned",
//                                         action: "awb_assigned",
//                                         timestamp: new Date(),
//                                         performedBy: null,
//                                         performedByModel: "System",
//                                         notes: `AWB ${awb} assigned for return`
//                                     }
//                                 }
//                             },
//                             { arrayFilters: [{ "ship._id": shipment._id }, { "ret._id": ret._id }] }
//                         );

//                         console.log(`✅ Updated return ${ret._id} with AWB ${awb}`);
//                     } catch (err) {
//                         console.error(`❌ Error processing return ${ret._id}:`, err.message);
//                     }
//                 }
//             }
//         }
//     } catch (err) {
//         console.error("❌ Return AWB tracking failed:", err.message);
//     }
// }

// /* -----------------------------
//    RETURN CRON 2 → TRACK TIMELINE
// ----------------------------- */
// // export async function trackReturnTimeline() {
// //     console.log("📍 Return Timeline Tracker Running...");
// //     try {
// //         const token = await getShiprocketToken();
// //         if (!token) throw new Error("No Shiprocket token");

// //         const orders = await Order.find({
// //             "shipments.returns": { $elemMatch: { awb_code: { $ne: null }, status: { $nin: ["delivered_to_warehouse", "refunded", "cancelled"] } } }
// //         }).select("_id shipments");

// //         for (const order of orders) {
// //             for (const shipment of order.shipments) {
// //                 if (!shipment.returns?.length) continue;

// //                 for (const ret of shipment.returns) {
// //                     const awb = ret.awb_code;
// //                     if (!awb) continue;

// //                     try {
// //                         let trackingData;
// //                         try {
// //                             const res = await axios.get(
// //                                 `https://apiv2.shiprocket.in/v1/external/courier/track/return/awb/${awb}`,
// //                                 { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
// //                             );
// //                             trackingData = res.data?.tracking_data;
// //                         } catch {
// //                             console.log(`⚠️ Fallback scraping for return AWB: ${awb}`);
// //                             const events = await scrapeShiprocketPublicTracking(awb);
// //                             trackingData = { shipment_track_activities: events };
// //                         }

// //                         const rawEvents = trackingData.shipment_track_activities || trackingData.shipment_track || [];
// //                         const events = rawEvents
// //                             .map(ev => ({
// //                                 status: mapActivityToStatus(ev.activity || ev.status),
// //                                 timestamp: new Date(ev.date || ev.timestamp),
// //                                 location: ev.location || "N/A",
// //                                 description: ev.activity || ev.status || "N/A"
// //                             }))
// //                             .sort((a, b) => b.timestamp - a.timestamp);

// //                         let returnStatus = ret.status;
// //                         const srStatus = trackingData.shipment_status || (events[0]?.status || "").toLowerCase();
// //                         const statusMap = {
// //                             "pickup scheduled": "pickup_scheduled",
// //                             "picked up": "picked_up",
// //                             "in transit": "in_transit",
// //                             "out for delivery": "in_transit",
// //                             "delivered": "delivered_to_warehouse",
// //                             "rto delivered": "delivered_to_warehouse",
// //                             "undelivered": "in_transit",
// //                             "cancelled": "cancelled"
// //                         };
// //                         if (srStatus && statusMap[srStatus]) returnStatus = statusMap[srStatus];

// //                         await Order.updateOne(
// //                             { _id: order._id },
// //                             {
// //                                 $set: {
// //                                     "shipments.$[ship].returns.$[ret].tracking_history": events,
// //                                     "shipments.$[ship].returns.$[ret].status": returnStatus,
// //                                     "shipments.$[ship].returns.$[ret].tracking_url": `https://shiprocket.co/tracking/${awb}`
// //                                 },
// //                                 $push: {
// //                                     "shipments.$[ship].returns.$[ret].audit_trail": {
// //                                         status: returnStatus,
// //                                         action: "status_updated",
// //                                         timestamp: new Date(),
// //                                         performedBy: null,
// //                                         performedByModel: "System",
// //                                         notes: `Status updated to ${returnStatus} via Shiprocket`
// //                                     }
// //                                 }
// //                             },
// //                             { arrayFilters: [{ "ship._id": shipment._id }, { "ret._id": ret._id }] }
// //                         );

// //                         if (returnStatus === "delivered_to_warehouse") {
// //                             await addRefundJob(order._id, shipment._id, ret._id);
// //                         }

// //                         console.log(`✅ Updated return ${ret._id} timeline, status: ${returnStatus}`);
// //                     } catch (err) {
// //                         console.error(`❌ Error updating return timeline for ${ret._id}:`, err.message);
// //                     }
// //                 }
// //             }
// //         }
// //     } catch (err) {
// //         console.error("❌ Return timeline cron failed:", err.message);
// //     }
// // }
// export async function trackReturnTimeline() {
//     console.log("📍 Return Timeline Tracker Running...");

//     try {
//         const token = await getShiprocketToken();
//         if (!token) throw new Error("No Shiprocket token");

//         const orders = await Order.find({
//             "shipments.returns": {
//                 $elemMatch: {
//                     awb_code: { $ne: null },
//                     status: { $nin: ["delivered_to_warehouse", "refunded", "cancelled"] }
//                 }
//             }
//         }).select("_id shipments");

//         for (const order of orders) {
//             for (const shipment of order.shipments) {
//                 if (!shipment.returns?.length) continue;

//                 for (const ret of shipment.returns) {
//                     const awb = ret.awb_code;
//                     if (!awb) continue;

//                     try {
//                         const res = await axios.get(
//                             `https://apiv2.shiprocket.in/v1/external/courier/track/return/awb/${awb}`,
//                             {
//                                 headers: { Authorization: `Bearer ${token}` },
//                                 timeout: 10000
//                             }
//                         );

//                         const trackingData = res.data?.tracking_data;
//                         if (!trackingData) continue;

//                         const rawEvents =
//                             trackingData.shipment_track_activities ||
//                             trackingData.shipment_track ||
//                             [];

//                         const events = rawEvents
//                             .map(ev => ({
//                                 status: mapActivityToStatus(ev.activity || ev.status),
//                                 timestamp: new Date(ev.date || ev.timestamp),
//                                 location: ev.location || "N/A",
//                                 description: ev.activity || ev.status || "N/A"
//                             }))
//                             .sort((a, b) => b.timestamp - a.timestamp);

//                         let returnStatus = ret.status;

//                         const srStatus =
//                             trackingData.shipment_status ||
//                             (events[0]?.status || "");

//                         const statusMap = {
//                             "pickup scheduled": "pickup_scheduled",
//                             "picked up": "picked_up",
//                             "in transit": "in_transit",
//                             "out for delivery": "in_transit",
//                             "delivered": "delivered_to_warehouse",
//                             "rto delivered": "delivered_to_warehouse",
//                             "undelivered": "in_transit",
//                             "cancelled": "cancelled"
//                         };

//                         if (srStatus && statusMap[srStatus.toLowerCase()]) {
//                             returnStatus = statusMap[srStatus.toLowerCase()];
//                         }

//                         await Order.updateOne(
//                             { _id: order._id },
//                             {
//                                 $set: {
//                                     "shipments.$[ship].returns.$[ret].tracking_history": events,
//                                     "shipments.$[ship].returns.$[ret].status": returnStatus,
//                                     "shipments.$[ship].returns.$[ret].tracking_url":
//                                         `https://shiprocket.co/tracking/${awb}`
//                                 },
//                                 $push: {
//                                     "shipments.$[ship].returns.$[ret].audit_trail": {
//                                         status: returnStatus,
//                                         action: "status_updated",
//                                         timestamp: new Date(),
//                                         performedBy: null,
//                                         performedByModel: "System",
//                                         notes: `Status updated to ${returnStatus} via Shiprocket`
//                                     }
//                                 }
//                             },
//                             {
//                                 arrayFilters: [
//                                     { "ship._id": shipment._id },
//                                     { "ret._id": ret._id }
//                                 ]
//                             }
//                         );

//                         if (returnStatus === "delivered_to_warehouse") {
//                             await addRefundJob(order._id, shipment._id, ret._id);
//                         }

//                         console.log(
//                             `✅ Updated return ${ret._id} timeline, status: ${returnStatus}`
//                         );
//                     } catch (err) {
//                         console.error(
//                             `❌ Error updating return timeline for ${ret._id}:`,
//                             err.message
//                         );
//                     }
//                 }
//             }
//         }
//     } catch (err) {
//         console.error("❌ Return timeline cron failed:", err.message);
//     }
// }

// /* -----------------------------
//    START CRONS
// ----------------------------- */
// export function startReturnTrackingJobs() {
//     cron.schedule("* * * * *", () => {
//         console.log("🔥 Cron 1 → Return AWB Assignment");
//         trackReturnAWBAssignment();
//     });

//     cron.schedule("*/2 * * * *", () => {
//         console.log("📍 Cron 2 → Return Timeline Tracking");
//         trackReturnTimeline();
//     });

//     console.log("✅ Return Tracking Jobs Started.");
// }




//the above code is perfect for return ok ,... now asyncronously all crosn works ,.. do that at saturday,13/12/2025






// corrected-return-cron.js
import cron from "node-cron";
import axios from "axios";
import * as cheerio from "cheerio";
import Order from "../../../models/Order.js";
import { getShiprocketToken } from "../../services/shiprocket.js";
import { addRefundJob } from "../../services/refundQueue.js";
import pLimit from "p-limit";

const shiprocketLimit = pLimit(5); // SAFE concurrency

export function deepSearch(obj, keys) {
    let found = null;
    function search(o) {
        if (!o || typeof o !== "object") return;
        for (let k of Object.keys(o)) {
            if (keys.includes(k)) found = o[k];
            if (typeof o[k] === "object") search(o[k]);
        }
    }
    search(obj);
    return found;
}

export function extractAWBFromShiprocket(data, srShipment) {
    const awb =
        deepSearch(srShipment, ["awb_code", "awb", "waybill", "last_mile_awb"]) ||
        deepSearch(data, ["awb_code", "awb", "waybill", "last_mile_awb"]) ||
        null;

    const courier =
        deepSearch(srShipment, [
            "courier_name",
            "courier_company",
            "assigned_courier",
            "last_mile_courier",
            "last_mile_courier_name",
            "lm_courier_name",
            "lm_courier",
            "courier",
        ]) ||
        deepSearch(data, [
            "courier_name",
            "courier_company",
            "assigned_courier",
            "last_mile_courier",
            "last_mile_courier_name",
            "lm_courier_name",
        ]) ||
        null;

    const trackUrl =
        deepSearch(srShipment, ["tracking_url", "track_url", "trackingLink"]) ||
        deepSearch(data, ["tracking_url", "track_url"]) ||
        (awb ? `https://shiprocket.co/tracking/${awb}` : null);

    return { awb, courier, trackUrl, srShipment };
}

export const SHIPROCKET_STATUS_MAP = {
    1: "AWB Assigned",
    2: "Pickup Scheduled",
    3: "In Transit",
    4: "Out for Delivery",
    5: "Delivered",
    6: "RTO Initiated",
    7: "RTO Delivered",
};

export function mapActivityToStatus(activity = "") {
    const a = activity.toLowerCase();
    if (a.includes("pickup scheduled") || a.includes("schedule pickup"))
        return "Pickup Scheduled";
    if (a.includes("pickup exception")) return "Pickup Scheduled";
    if (a.includes("picked up") || a.includes("shipment picked")) return "Pickup Done";
    if (a.includes("in transit")) return "In Transit";
    if (a.includes("received at hub") || a.includes("arrived at")) return "In Transit";
    if (a.includes("out for delivery")) return "Out for Delivery";
    if (a.includes("delivered")) return "Delivered";
    if (a.includes("rto initiated") || a.includes("return to origin")) return "RTO Initiated";
    if (a.includes("rto delivered")) return "RTO Delivered";
    return "In Transit";
}

export async function trackReturnAWBAssignment() {
    console.log("🔄 Return AWB Tracking Cron Running...");

    try {
        const token = await getShiprocketToken();
        if (!token) return;

        const orders = await Order.find({
            "shipments.returns": {
                $elemMatch: { awb_code: null, shiprocket_order_id: { $ne: null } }
            }
        }).select("_id shipments");

        const tasks = [];

        for (const order of orders) {
            for (const shipment of order.shipments) {
                for (const ret of shipment.returns || []) {
                    if (ret.awb_code || !ret.shiprocket_order_id) continue;

                    tasks.push(
                        shiprocketLimit(() =>
                            processReturnAWB(order._id, shipment._id, ret, token)
                        )
                    );
                }
            }
        }

        await Promise.allSettled(tasks);

    } catch (err) {
        console.error("❌ Return AWB cron failed:", err.message);
    }
}

async function processReturnAWB(orderId, shipmentId, ret, token) {
    try {
        const res = await axios.get(
            `https://apiv2.shiprocket.in/v1/external/orders/show/${ret.shiprocket_order_id}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        const data = res.data?.data;
        if (!data) return;

        const { awb, courier, trackUrl } =
            extractAWBFromShiprocket(data, data.shipments?.[0] || data);

        if (!awb) return;

        await Order.updateOne(
            { _id: orderId },
            {
                $set: {
                    "shipments.$[s].returns.$[r].awb_code": awb,
                    "shipments.$[s].returns.$[r].courier_name": courier,
                    "shipments.$[s].returns.$[r].tracking_url": trackUrl,
                    "shipments.$[s].returns.$[r].status": "pickup_scheduled"
                }
            },
            { arrayFilters: [{ "s._id": shipmentId }, { "r._id": ret._id }] }
        );
    } catch {
        return;
    }
}

export async function trackReturnTimeline() {
    console.log("📍 Return Timeline Tracker Running...");

    try {
        const token = await getShiprocketToken();
        if (!token) return;

        const orders = await Order.find({
            "shipments.returns": {
                $elemMatch: {
                    awb_code: { $ne: null },
                    status: { $nin: ["delivered_to_warehouse", "refunded", "cancelled"] }
                }
            }
        }).select("_id shipments");

        const tasks = [];

        for (const order of orders) {
            for (const shipment of order.shipments) {
                for (const ret of shipment.returns || []) {
                    if (!ret.awb_code) continue;

                    tasks.push(
                        shiprocketLimit(() =>
                            processReturnTimeline(order._id, shipment._id, ret, token)
                        )
                    );
                }
            }
        }

        await Promise.allSettled(tasks);

    } catch (err) {
        console.error("❌ Return timeline cron failed:", err.message);
    }
}

async function processReturnTimeline(orderId, shipmentId, ret, token) {
    try {
        const res = await axios.get(
            `https://apiv2.shiprocket.in/v1/external/courier/track/return/awb/${ret.awb_code}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        const trackingData = res.data?.tracking_data;
        if (!trackingData) return;

        const events =
            trackingData.shipment_track_activities?.map(ev => ({
                status: mapActivityToStatus(ev.activity || ev.status),
                timestamp: new Date(ev.date || ev.timestamp),
                location: ev.location || "N/A",
                description: ev.activity || ev.status
            })) || [];

        let status = ret.status;
        if (trackingData.shipment_status === "Delivered") {
            status = "delivered_to_warehouse";
        }

        await Order.updateOne(
            { _id: orderId },
            {
                $set: {
                    "shipments.$[s].returns.$[r].tracking_history": events,
                    "shipments.$[s].returns.$[r].status": status
                }
            },
            { arrayFilters: [{ "s._id": shipmentId }, { "r._id": ret._id }] }
        );

        if (status === "delivered_to_warehouse") {
            await addRefundJob(orderId, shipmentId, ret._id);
        }
    } catch {
        return;
    }
}




// /* -----------------------------
//    RETURN CRON 1 → ASSIGN AWB
// ----------------------------- */
// export async function trackReturnAWBAssignment() {
//     console.log("🔄 Return AWB Tracking Cron Running...");
//     try {
//         const token = await getShiprocketToken();
//         if (!token) throw new Error("No Shiprocket token");

//         const THRESHOLD = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

//         const orders = await Order.find({
//             "shipments.returns": {
//                 $elemMatch: { awb_code: null, shiprocket_order_id: { $ne: null }, createdAt: { $gte: THRESHOLD } }
//             }
//         }).select("_id shipments");

//         if (!orders?.length) return console.log("No return orders to assign AWB.");

//         for (const order of orders) {
//             for (const shipment of order.shipments) {
//                 if (!shipment.returns?.length) continue;
//                 for (const ret of shipment.returns) {
//                     if (ret.awb_code) continue;
//                     const srOrderId = ret.shiprocket_order_id;
//                     if (!srOrderId) continue;

//                     try {
//                         const orderRes = await axios.get(
//                             `https://apiv2.shiprocket.in/v1/external/orders/show/${srOrderId}`,
//                             { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
//                         );
//                         const orderData = orderRes.data?.data;
//                         if (!orderData) continue;

//                         const { awb, courier, trackUrl } = extractAWBFromShiprocket(orderData, orderData.shipments?.[0] || orderData);

//                         if (!awb) continue;

//                         await Order.updateOne(
//                             { _id: order._id },
//                             {
//                                 $set: {
//                                     "shipments.$[ship].returns.$[ret].awb_code": awb,
//                                     "shipments.$[ship].returns.$[ret].courier_name": courier,
//                                     "shipments.$[ship].returns.$[ret].tracking_url": trackUrl,
//                                     "shipments.$[ship].returns.$[ret].status": "pickup_scheduled"
//                                 },
//                                 $push: {
//                                     "shipments.$[ship].returns.$[ret].tracking_history": {
//                                         status: "AWB Assigned",
//                                         timestamp: new Date(),
//                                         location: "Shiprocket",
//                                         description: `Return AWB ${awb} assigned`
//                                     },
//                                     "shipments.$[ship].returns.$[ret].audit_trail": {
//                                         status: "awb_assigned",
//                                         action: "awb_assigned",
//                                         timestamp: new Date(),
//                                         performedBy: null,
//                                         performedByModel: "System",
//                                         notes: `AWB ${awb} assigned for return`
//                                     }
//                                 }
//                             },
//                             { arrayFilters: [{ "ship._id": shipment._id }, { "ret._id": ret._id }] }
//                         );

//                         console.log(`✅ Updated return ${ret._id} with AWB ${awb}`);
//                     } catch (err) {
//                         console.error(`❌ Error processing return ${ret._id}:`, err.message);
//                     }
//                 }
//             }
//         }
//     } catch (err) {
//         console.error("❌ Return AWB tracking failed:", err.message);
//     }
// }


// export async function trackReturnTimeline() {
//     console.log("📍 Return Timeline Tracker Running...");

//     try {
//         const token = await getShiprocketToken();
//         if (!token) throw new Error("No Shiprocket token");

//         const orders = await Order.find({
//             "shipments.returns": {
//                 $elemMatch: {
//                     awb_code: { $ne: null },
//                     status: { $nin: ["delivered_to_warehouse", "refunded", "cancelled"] }
//                 }
//             }
//         }).select("_id shipments");

//         for (const order of orders) {
//             for (const shipment of order.shipments) {
//                 if (!shipment.returns?.length) continue;

//                 for (const ret of shipment.returns) {
//                     const awb = ret.awb_code;
//                     if (!awb) continue;

//                     try {
//                         const res = await axios.get(
//                             `https://apiv2.shiprocket.in/v1/external/courier/track/return/awb/${awb}`,
//                             {
//                                 headers: { Authorization: `Bearer ${token}` },
//                                 timeout: 10000
//                             }
//                         );

//                         const trackingData = res.data?.tracking_data;
//                         if (!trackingData) continue;

//                         const rawEvents =
//                             trackingData.shipment_track_activities ||
//                             trackingData.shipment_track ||
//                             [];

//                         const events = rawEvents
//                             .map(ev => ({
//                                 status: mapActivityToStatus(ev.activity || ev.status),
//                                 timestamp: new Date(ev.date || ev.timestamp),
//                                 location: ev.location || "N/A",
//                                 description: ev.activity || ev.status || "N/A"
//                             }))
//                             .sort((a, b) => b.timestamp - a.timestamp);

//                         let returnStatus = ret.status;

//                         const srStatus =
//                             trackingData.shipment_status ||
//                             (events[0]?.status || "");

//                         const statusMap = {
//                             "pickup scheduled": "pickup_scheduled",
//                             "picked up": "picked_up",
//                             "in transit": "in_transit",
//                             "out for delivery": "in_transit",
//                             "delivered": "delivered_to_warehouse",
//                             "rto delivered": "delivered_to_warehouse",
//                             "undelivered": "in_transit",
//                             "cancelled": "cancelled"
//                         };

//                         if (srStatus && statusMap[srStatus.toLowerCase()]) {
//                             returnStatus = statusMap[srStatus.toLowerCase()];
//                         }

//                         await Order.updateOne(
//                             { _id: order._id },
//                             {
//                                 $set: {
//                                     "shipments.$[ship].returns.$[ret].tracking_history": events,
//                                     "shipments.$[ship].returns.$[ret].status": returnStatus,
//                                     "shipments.$[ship].returns.$[ret].tracking_url":
//                                         `https://shiprocket.co/tracking/${awb}`
//                                 },
//                                 $push: {
//                                     "shipments.$[ship].returns.$[ret].audit_trail": {
//                                         status: returnStatus,
//                                         action: "status_updated",
//                                         timestamp: new Date(),
//                                         performedBy: null,
//                                         performedByModel: "System",
//                                         notes: `Status updated to ${returnStatus} via Shiprocket`
//                                     }
//                                 }
//                             },
//                             {
//                                 arrayFilters: [
//                                     { "ship._id": shipment._id },
//                                     { "ret._id": ret._id }
//                                 ]
//                             }
//                         );

//                         if (returnStatus === "delivered_to_warehouse") {
//                             await addRefundJob(order._id, shipment._id, ret._id);
//                         }

//                         console.log(
//                             `✅ Updated return ${ret._id} timeline, status: ${returnStatus}`
//                         );
//                     } catch (err) {
//                         console.error(
//                             `❌ Error updating return timeline for ${ret._id}:`,
//                             err.message
//                         );
//                     }
//                 }
//             }
//         }
//     } catch (err) {
//         console.error("❌ Return timeline cron failed:", err.message);
//     }
// }
