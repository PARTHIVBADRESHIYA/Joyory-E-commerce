// // // fetch-full-timeline.js
// // import mongoose from "mongoose";
// // import axios from "axios";
// // import path from "path";
// // import dotenv from "dotenv";
// // import { fileURLToPath } from "url";

// // import Order from "./models/Order.js";
// // import { getShiprocketToken } from "./middlewares/services/shiprocket.js";

// // const __dirname = path.dirname(fileURLToPath(import.meta.url));
// // dotenv.config({ path: path.join(__dirname, ".env") });

// // async function fetchFullTimeline() {
// //     try {
// //         console.log("🔥 Connecting to DB…");
// //         await mongoose.connect(process.env.MONGO_URI, {});

// //         console.log("🔑 Fetching Shiprocket token…");
// //         const token = await getShiprocketToken();

// //         // Fetch all orders with shipments (including return shipments)
// //         const orders = await Order.find({
// //             $or: [
// //                 { "shipments.awb_code": { $exists: true, $ne: null } },
// //                 { "shipments.returns.pickupDetails.awb": { $exists: true, $ne: null } }
// //             ]
// //         });

// //         console.log(`🔍 Found ${orders.length} orders with shipments/returns`);

// //         for (const order of orders) {
// //             for (const shipment of order.shipments || []) {
// //                 // ----- FORWARD SHIPMENTS -----
// //                 if (shipment.awb_code) {
// //                     await fetchAndUpdateShipmentTimeline(order, shipment, token);
// //                 }

// //                 // ----- RETURN SHIPMENTS -----
// //                 if (shipment.returns?.length) {
// //                     for (const ret of shipment.returns) {
// //                         if (ret.pickupDetails?.awb) {
// //                             await fetchAndUpdateShipmentTimeline(order, ret, token, true);
// //                         }
// //                     }
// //                 }
// //             }

// //             // Save after all updates
// //             await order.save();
// //         }

// //         console.log("\n🎉 DONE — All timelines updated!");
// //         process.exit(0);
// //     } catch (err) {
// //         console.error("❌ ERROR:", err);
// //         process.exit(1);
// //     }
// // }

// // /**
// //  * Fetch Shiprocket timeline & update local object
// //  * @param {Object} order - Mongoose order doc
// //  * @param {Object} shipmentObj - Shipment or Return object
// //  * @param {string} token - Shiprocket token
// //  * @param {boolean} isReturn - whether this is a return shipment
// //  */
// // async function fetchAndUpdateShipmentTimeline(order, shipmentObj, token, isReturn = false) {
// //     const awb = shipmentObj.awb_code || shipmentObj.pickupDetails?.awb;
// //     if (!awb) return;

// //     console.log(`\n🚚 Fetching timeline for AWB: ${awb}`);

// //     try {
// //         const url = `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`;
// //         const response = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });

// //         const trackingData = response.data.tracking_data;
// //         if (!trackingData) {
// //             console.log("⚠️ No tracking data found");
// //             return;
// //         }

// //         // Use either shipment_track_activities or shipment_track
// //         const events = trackingData.shipment_track_activities?.length
// //             ? trackingData.shipment_track_activities
// //             : trackingData.shipment_track?.length
// //                 ? trackingData.shipment_track
// //                 : [];

// //         // Map to standard trackingHistory format
// //         shipmentObj.trackingHistory = events.map(ev => ({
// //             status: ev.activity || ev.status || "Unknown",
// //             timestamp: new Date(ev.date || ev.datetime || Date.now()),
// //             location: ev.location || "N/A",
// //             description: ev.activity || ev.status || ""
// //         })).sort((a, b) => b.timestamp - a.timestamp);

// //         // Fallback if no events
// //         if (shipmentObj.trackingHistory.length === 0) {
// //             const fallbackStatus = trackingData.shipment_status || "Unknown";
// //             shipmentObj.trackingHistory.push({
// //                 status: fallbackStatus,
// //                 timestamp: new Date(),
// //                 location: "N/A",
// //                 description: fallbackStatus
// //             });
// //             console.log(`⚠️ No timeline events, using fallback status: ${fallbackStatus}`);
// //         }

// //         // Print timeline in console (Nykaa-style)
// //         console.log(`📜 Timeline for AWB ${awb}:`);
// //         shipmentObj.trackingHistory.forEach((ev, idx) => {
// //             console.log(`${idx + 1}. [${ev.timestamp.toLocaleString()}] ${ev.status} — ${ev.location}`);
// //         });

// //         // Update overallStatus
// //         const shipStatus = trackingData.shipment_status;
// //         if (typeof shipStatus === "string" && shipStatus.trim() !== "") {
// //             shipmentObj.overallStatus = shipStatus.toLowerCase().replace(/\s+/g, "_");
// //             if (shipmentObj.pickupDetails) shipmentObj.pickupDetails.status = shipmentObj.overallStatus;
// //         } else if (shipStatus != null) {
// //             shipmentObj.overallStatus = shipStatus;
// //         }

// //         console.log(`✅ Timeline updated for AWB: ${awb}`);
// //     } catch (err) {
// //         console.log("❌ Failed fetching timeline:", err.response?.data || err.message);
// //     }
// // }

// // fetchFullTimeline();
















// import mongoose from "mongoose";
// import Order from "./models/Order.js";
// import axios from "axios";
// import { getShiprocketToken } from "./middlewares/services/shiprocket.js";

// // 🔥 Replace with your MongoDB connection string
// const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/joyory";

// async function connectDB() {
//     if (mongoose.connection.readyState === 0) {
//         await mongoose.connect(MONGO_URI, {
//             useNewUrlParser: true,
//             useUnifiedTopology: true,
//         });
//         console.log("✅ MongoDB connected");
//     }
// }

// export async function migrateReturnTimeline() {
//     console.log("🚀 Migrating timeline for old returns...");

//     await connectDB();

//     const orders = await Order.find({
//         "shipments.returns": { $exists: true, $not: { $size: 0 } }
//     }).select("_id shipments");

//     if (!orders.length) return console.log("✅ No old returns found.");

//     const token = await getShiprocketToken();
//     if (!token) throw new Error("❌ No Shiprocket token available");

//     for (const order of orders) {
//         for (const shipment of order.shipments || []) {
//             if (!shipment.returns?.length) continue;

//             for (const ret of shipment.returns) {
//                 if (!ret.awb_code) continue; // must have AWB

//                 console.log(`⏳ Fetching timeline for return ${ret._id}, AWB ${ret.awb_code}`);

//                 try {
//                     const res = await axios.get(
//                         `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${ret.awb_code}`,
//                         {
//                             headers: { Authorization: `Bearer ${token}` },
//                             timeout: 15000
//                         }
//                     );

//                     const rawEvents = res.data?.tracking_data?.shipment_track_activities || [];
//                     const timelineEvents = rawEvents
//                         .map(ev => ({
//                             status: ev.activity || ev.status || "Unknown",
//                             timestamp: new Date(ev.date || ev.datetime || Date.now()),
//                             location: ev.location || "N/A",
//                             description: ev.activity || ev.status || ""
//                         }))
//                         .sort((a, b) => b.timestamp - a.timestamp)
//                         .slice(0, 50); // latest 50 events

//                     // Update only trackingHistory for this return
//                     await Order.updateOne(
//                         { _id: order._id },
//                         {
//                             $set: {
//                                 "shipments.$[ship].returns.$[ret].trackingHistory": timelineEvents
//                             }
//                         },
//                         {
//                             arrayFilters: [
//                                 { "ship._id": shipment._id },
//                                 { "ret._id": ret._id }
//                             ]
//                         }
//                     );

//                     console.log(`✅ Timeline updated for return ${ret._id}`);
//                 } catch (err) {
//                     console.error(`❌ Failed timeline for return ${ret._id}:`, err.message);
//                 }
//             }
//         }
//     }

//     console.log("🚀 Timeline migration finished!");
// }

// // 🔥 Run immediately if script executed directly
// if (require.main === module) {
//     (async () => {
//         try {
//             await migrateReturnTimeline();
//             console.log("✅ All done");
//             process.exit(0);
//         } catch (err) {
//             console.error("❌ Migration script failed:", err);
//             process.exit(1);
//         }
//     })();
// }






// ============================================================
// CLEANUP SCRIPT - RUN ONCE TO FIX OLD ORDER
// Save as: cleanup-old-order.js
// ============================================================

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './models/Order.js';
dotenv.config();

// ============================================================
// CLEANUP FUNCTION
// ============================================================

async function cleanupOldOrder() {
    try {
        // Connect to MongoDB
        console.log("🔌 Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ MongoDB connected");

        const orderId = "693aa7fa871080413e775362";
        
        const order = await Order.findById(orderId);
        
        if (!order) {
            console.log("❌ Order not found");
            await mongoose.connection.close();
            return;
        }

        console.log(`🔍 Found order: ${orderId}`);
        console.log(`📦 Total shipments: ${order.shipments?.length || 0}`);

        // Find shipment with returns
        const shipmentWithReturns = order.shipments.find(s => s.returns?.length > 0);
        
        if (!shipmentWithReturns) {
            console.log("❌ No shipment with returns found");
            await mongoose.connection.close();
            return;
        }

        console.log(`📦 Shipment ${shipmentWithReturns.shipment_id} has ${shipmentWithReturns.returns.length} returns`);

        // Show all returns before cleanup
        console.log("\n🔍 BEFORE CLEANUP:");
        shipmentWithReturns.returns.forEach((ret, idx) => {
            console.log(`   ${idx + 1}. Return ${ret._id}:`);
            console.log(`      - return_order_id: ${ret.return_order_id || 'NONE'}`);
            console.log(`      - return_shipment_id: ${ret.return_shipment_id || 'NONE'}`);
            console.log(`      - awb_code: ${ret.awb_code || 'NONE'}`);
            console.log(`      - status: ${ret.overallStatus}`);
        });

        // 🔥 FIX: Keep only unique returns, remove invalid ones
        const uniqueReturns = [];
        const seenReturnIds = new Set();
        const seenShipmentIds = new Set();

        for (const ret of shipmentWithReturns.returns) {
            const retId = ret._id.toString();
            const shipmentId = ret.return_shipment_id;

            // Skip if we've already seen this return _id
            if (seenReturnIds.has(retId)) {
                console.log(`\n⚠️ REMOVING: Duplicate return with _id ${retId}`);
                continue;
            }

            // Skip if this return_shipment_id already exists (duplicate Shiprocket IDs)
            if (shipmentId && seenShipmentIds.has(shipmentId)) {
                console.log(`\n⚠️ REMOVING: Duplicate return with shipment_id ${shipmentId} (return ${retId})`);
                continue;
            }

            // Skip if Shiprocket returns 404 for this ID (you mentioned 1075711965 is invalid)
            if (shipmentId === "1075711965") {
                console.log(`\n⚠️ REMOVING: Return ${retId} has invalid/404 shipment_id ${shipmentId}`);
                continue;
            }

            seenReturnIds.add(retId);
            if (shipmentId) seenShipmentIds.add(shipmentId);
            uniqueReturns.push(ret);
        }

        console.log(`\n✅ Keeping ${uniqueReturns.length} valid returns out of ${shipmentWithReturns.returns.length}`);

        if (uniqueReturns.length === shipmentWithReturns.returns.length) {
            console.log("✅ No cleanup needed - all returns are valid");
            await mongoose.connection.close();
            return;
        }

        // Update the order
        const updateResult = await Order.updateOne(
            { 
                _id: orderId,
                "shipments._id": shipmentWithReturns._id
            },
            {
                $set: {
                    "shipments.$.returns": uniqueReturns
                }
            }
        );

        console.log(`\n✅ Order updated: matched=${updateResult.matchedCount}, modified=${updateResult.modifiedCount}`);
        
        // Show final state
        const updatedOrder = await Order.findById(orderId).select("shipments");
        const updatedShipment = updatedOrder.shipments.find(s => 
            s._id.toString() === shipmentWithReturns._id.toString()
        );
        
        console.log("\n📊 AFTER CLEANUP:");
        console.log(`   Total returns: ${updatedShipment.returns.length}`);
        updatedShipment.returns.forEach((ret, idx) => {
            console.log(`   ${idx + 1}. Return ${ret._id}:`);
            console.log(`      - return_order_id: ${ret.return_order_id || 'NONE'}`);
            console.log(`      - return_shipment_id: ${ret.return_shipment_id || 'NONE'}`);
            console.log(`      - awb_code: ${ret.awb_code || 'NONE'}`);
            console.log(`      - status: ${ret.overallStatus}`);
        });

        console.log("\n✅ Cleanup completed successfully!");

    } catch (err) {
        console.error("❌ Cleanup failed:", err.message);
        console.error(err.stack);
    } finally {
        // Close connection
        await mongoose.connection.close();
        console.log("🔌 MongoDB connection closed");
        process.exit(0);
    }
}

// Run cleanup
cleanupOldOrder();