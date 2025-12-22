
// // // import mongoose from "mongoose";
// // // import axios from "axios";
// // // import path from "path";
// // // import dotenv from "dotenv";
// // // import { fileURLToPath } from "url";

// // // import Order from "./models/Order.js";
// // // import { getShiprocketToken } from "./middlewares/services/shiprocket.js";

// // // const __dirname = path.dirname(fileURLToPath(import.meta.url));
// // // dotenv.config({ path: path.join(__dirname, ".env") });

// // // async function fetchFullTimeline() {
// // //     try {
// // //         console.log("🔥 Connecting to DB…");
// // //         await mongoose.connect(process.env.MONGO_URI, {});

// // //         console.log("🔑 Fetching Shiprocket token…");
// // //         const token = await getShiprocketToken();

// // //         // Fetch all orders with shipments (including return shipments)
// // //         const orders = await Order.find({
// // //             $or: [
// // //                 { "shipments.awb_code": { $exists: true, $ne: null } },
// // //                 { "shipments.returns.pickupDetails.awb": { $exists: true, $ne: null } }
// // //             ]
// // //         });

// // //         console.log(`🔍 Found ${orders.length} orders with shipments/returns`);

// // //         for (const order of orders) {
// // //             for (const shipment of order.shipments || []) {
// // //                 // ----- FORWARD SHIPMENTS -----
// // //                 if (shipment.awb_code) {
// // //                     await fetchAndUpdateShipmentTimeline(order, shipment, token);
// // //                 }

// // //                 // ----- RETURN SHIPMENTS -----
// // //                 if (shipment.returns?.length) {
// // //                     for (const ret of shipment.returns) {
// // //                         if (ret.pickupDetails?.awb) {
// // //                             await fetchAndUpdateShipmentTimeline(order, ret, token, true);
// // //                         }
// // //                     }
// // //                 }
// // //             }

// // //             // Save after all updates
// // //             await order.save();
// // //         }

// // //         console.log("\n🎉 DONE — All timelines updated!");
// // //         process.exit(0);
// // //     } catch (err) {
// // //         console.error("❌ ERROR:", err);
// // //         process.exit(1);
// // //     }
// // // }

// // // // /**
// // // //  * Fetch Shiprocket timeline & update local object
// // // //  * @param {Object} order - Mongoose order doc
// // // //  * @param {Object} shipmentObj - Shipment or Return object
// // // //  * @param {string} token - Shiprocket token
// // // //  * @param {boolean} isReturn - whether this is a return shipment
// // // //  */
// // // async function fetchAndUpdateShipmentTimeline(order, shipmentObj, token, isReturn = false) {
// // //     const awb = shipmentObj.awb_code || shipmentObj.pickupDetails?.awb;
// // //     if (!awb) return;

// // //     console.log(`\n🚚 Fetching timeline for AWB: ${awb}`);

// // //     try {
// // //         const url = `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`;
// // //         const response = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });

// // //         const trackingData = response.data.tracking_data;
// // //         if (!trackingData) {
// // //             console.log("⚠️ No tracking data found");
// // //             return;
// // //         }

// // //         // Use either shipment_track_activities or shipment_track
// // //         const events = trackingData.shipment_track_activities?.length
// // //             ? trackingData.shipment_track_activities
// // //             : trackingData.shipment_track?.length
// // //                 ? trackingData.shipment_track
// // //                 : [];

// // //         // Map to standard tracking_history format
// // //         shipmentObj.tracking_history = events.map(ev => ({
// // //             status: ev.activity || ev.status || "Unknown",
// // //             timestamp: new Date(ev.date || ev.datetime || Date.now()),
// // //             location: ev.location || "N/A",
// // //             description: ev.activity || ev.status || ""
// // //         })).sort((a, b) => b.timestamp - a.timestamp);

// // //         // Fallback if no events
// // //         if (shipmentObj.tracking_history.length === 0) {
// // //             const fallbackStatus = trackingData.shipment_status || "Unknown";
// // //             shipmentObj.tracking_history.push({
// // //                 status: fallbackStatus,
// // //                 timestamp: new Date(),
// // //                 location: "N/A",
// // //                 description: fallbackStatus
// // //             });
// // //             console.log(`⚠️ No timeline events, using fallback status: ${fallbackStatus}`);
// // //         }

// // //         // Print timeline in console (Nykaa-style)
// // //         console.log(`📜 Timeline for AWB ${awb}:`);
// // //         shipmentObj.tracking_history.forEach((ev, idx) => {
// // //             console.log(`${idx + 1}. [${ev.timestamp.toLocaleString()}] ${ev.status} — ${ev.location}`);
// // //         });

// // //         // Update overallStatus
// // //         const shipStatus = trackingData.shipment_status;
// // //         if (typeof shipStatus === "string" && shipStatus.trim() !== "") {
// // //             shipmentObj.overallStatus = shipStatus.toLowerCase().replace(/\s+/g, "_");
// // //             if (shipmentObj.pickupDetails) shipmentObj.pickupDetails.status = shipmentObj.overallStatus;
// // //         } else if (shipStatus != null) {
// // //             shipmentObj.overallStatus = shipStatus;
// // //         }

// // //         console.log(`✅ Timeline updated for AWB: ${awb}`);
// // //     } catch (err) {
// // //         console.log("❌ Failed fetching timeline:", err.response?.data || err.message);
// // //     }
// // // }

// // // fetchFullTimeline();
















// // // // // // import mongoose from "mongoose";
// // // // // // import Order from "./models/Order.js";
// // // // // // import axios from "axios";
// // // // // // import { getShiprocketToken } from "./middlewares/services/shiprocket.js";

// // // // // // // 🔥 Replace with your MongoDB connection string
// // // // // // const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/joyory";

// // // // // // async function connectDB() {
// // // // // //     if (mongoose.connection.readyState === 0) {
// // // // // //         await mongoose.connect(MONGO_URI, {
// // // // // //             useNewUrlParser: true,
// // // // // //             useUnifiedTopology: true,
// // // // // //         });
// // // // // //         console.log("✅ MongoDB connected");
// // // // // //     }
// // // // // // }

// // // // // // export async function migrateReturnTimeline() {
// // // // // //     console.log("🚀 Migrating timeline for old returns...");

// // // // // //     await connectDB();

// // // // // //     const orders = await Order.find({
// // // // // //         "shipments.returns": { $exists: true, $not: { $size: 0 } }
// // // // // //     }).select("_id shipments");

// // // // // //     if (!orders.length) return console.log("✅ No old returns found.");

// // // // // //     const token = await getShiprocketToken();
// // // // // //     if (!token) throw new Error("❌ No Shiprocket token available");

// // // // // //     for (const order of orders) {
// // // // // //         for (const shipment of order.shipments || []) {
// // // // // //             if (!shipment.returns?.length) continue;

// // // // // //             for (const ret of shipment.returns) {
// // // // // //                 if (!ret.awb_code) continue; // must have AWB

// // // // // //                 console.log(`⏳ Fetching timeline for return ${ret._id}, AWB ${ret.awb_code}`);

// // // // // //                 try {
// // // // // //                     const res = await axios.get(
// // // // // //                         `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${ret.awb_code}`,
// // // // // //                         {
// // // // // //                             headers: { Authorization: `Bearer ${token}` },
// // // // // //                             timeout: 15000
// // // // // //                         }
// // // // // //                     );

// // // // // //                     const rawEvents = res.data?.tracking_data?.shipment_track_activities || [];
// // // // // //                     const timelineEvents = rawEvents
// // // // // //                         .map(ev => ({
// // // // // //                             status: ev.activity || ev.status || "Unknown",
// // // // // //                             timestamp: new Date(ev.date || ev.datetime || Date.now()),
// // // // // //                             location: ev.location || "N/A",
// // // // // //                             description: ev.activity || ev.status || ""
// // // // // //                         }))
// // // // // //                         .sort((a, b) => b.timestamp - a.timestamp)
// // // // // //                         .slice(0, 50); // latest 50 events

// // // // // //                     // Update only tracking_history for this return
// // // // // //                     await Order.updateOne(
// // // // // //                         { _id: order._id },
// // // // // //                         {
// // // // // //                             $set: {
// // // // // //                                 "shipments.$[ship].returns.$[ret].tracking_history": timelineEvents
// // // // // //                             }
// // // // // //                         },
// // // // // //                         {
// // // // // //                             arrayFilters: [
// // // // // //                                 { "ship._id": shipment._id },
// // // // // //                                 { "ret._id": ret._id }
// // // // // //                             ]
// // // // // //                         }
// // // // // //                     );

// // // // // //                     console.log(`✅ Timeline updated for return ${ret._id}`);
// // // // // //                 } catch (err) {
// // // // // //                     console.error(`❌ Failed timeline for return ${ret._id}:`, err.message);
// // // // // //                 }
// // // // // //             }
// // // // // //         }
// // // // // //     }

// // // // // //     console.log("🚀 Timeline migration finished!");
// // // // // // }

// // // // // // // 🔥 Run immediately if script executed directly
// // // // // // if (require.main === module) {
// // // // // //     (async () => {
// // // // // //         try {
// // // // // //             await migrateReturnTimeline();
// // // // // //             console.log("✅ All done");
// // // // // //             process.exit(0);
// // // // // //         } catch (err) {
// // // // // //             console.error("❌ Migration script failed:", err);
// // // // // //             process.exit(1);
// // // // // //         }
// // // // // //     })();
// // // // // // }






// // // // // // ============================================================
// // // // // // CLEANUP SCRIPT - RUN ONCE TO FIX OLD ORDER
// // // // // // Save as: cleanup-old-order.js
// // // // // // ============================================================

// // // // // import mongoose from 'mongoose';
// // // // // import dotenv from 'dotenv';
// // // // // import Order from './models/Order.js';
// // // // // dotenv.config();

// // // // // // ============================================================
// // // // // // CLEANUP FUNCTION
// // // // // // ============================================================

// // // // // async function cleanupOldOrder() {
// // // // //     try {
// // // // //         // Connect to MongoDB
// // // // //         console.log("🔌 Connecting to MongoDB...");
// // // // //         await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI, {
// // // // //             useNewUrlParser: true,
// // // // //             useUnifiedTopology: true,
// // // // //         });
// // // // //         console.log("✅ MongoDB connected");

// // // // //         const orderId = "693aa7fa871080413e775362";

// // // // //         const order = await Order.findById(orderId);

// // // // //         if (!order) {
// // // // //             console.log("❌ Order not found");
// // // // //             await mongoose.connection.close();
// // // // //             return;
// // // // //         }

// // // // //         console.log(`🔍 Found order: ${orderId}`);
// // // // //         console.log(`📦 Total shipments: ${order.shipments?.length || 0}`);

// // // // //         // Find shipment with returns
// // // // //         const shipmentWithReturns = order.shipments.find(s => s.returns?.length > 0);

// // // // //         if (!shipmentWithReturns) {
// // // // //             console.log("❌ No shipment with returns found");
// // // // //             await mongoose.connection.close();
// // // // //             return;
// // // // //         }

// // // // //         console.log(`📦 Shipment ${shipmentWithReturns.shipment_id} has ${shipmentWithReturns.returns.length} returns`);

// // // // //         // Show all returns before cleanup
// // // // //         console.log("\n🔍 BEFORE CLEANUP:");
// // // // //         shipmentWithReturns.returns.forEach((ret, idx) => {
// // // // //             console.log(`   ${idx + 1}. Return ${ret._id}:`);
// // // // //             console.log(`      - return_order_id: ${ret.return_order_id || 'NONE'}`);
// // // // //             console.log(`      - return_shipment_id: ${ret.return_shipment_id || 'NONE'}`);
// // // // //             console.log(`      - awb_code: ${ret.awb_code || 'NONE'}`);
// // // // //             console.log(`      - status: ${ret.overallStatus}`);
// // // // //         });

// // // // //         // 🔥 FIX: Keep only unique returns, remove invalid ones
// // // // //         const uniqueReturns = [];
// // // // //         const seenReturnIds = new Set();
// // // // //         const seenShipmentIds = new Set();

// // // // //         for (const ret of shipmentWithReturns.returns) {
// // // // //             const retId = ret._id.toString();
// // // // //             const shipmentId = ret.return_shipment_id;

// // // // //             // Skip if we've already seen this return _id
// // // // //             if (seenReturnIds.has(retId)) {
// // // // //                 console.log(`\n⚠️ REMOVING: Duplicate return with _id ${retId}`);
// // // // //                 continue;
// // // // //             }

// // // // //             // Skip if this return_shipment_id already exists (duplicate Shiprocket IDs)
// // // // //             if (shipmentId && seenShipmentIds.has(shipmentId)) {
// // // // //                 console.log(`\n⚠️ REMOVING: Duplicate return with shipment_id ${shipmentId} (return ${retId})`);
// // // // //                 continue;
// // // // //             }

// // // // //             // Skip if Shiprocket returns 404 for this ID (you mentioned 1075711965 is invalid)
// // // // //             if (shipmentId === "1075711965") {
// // // // //                 console.log(`\n⚠️ REMOVING: Return ${retId} has invalid/404 shipment_id ${shipmentId}`);
// // // // //                 continue;
// // // // //             }

// // // // //             seenReturnIds.add(retId);
// // // // //             if (shipmentId) seenShipmentIds.add(shipmentId);
// // // // //             uniqueReturns.push(ret);
// // // // //         }

// // // // //         console.log(`\n✅ Keeping ${uniqueReturns.length} valid returns out of ${shipmentWithReturns.returns.length}`);

// // // // //         if (uniqueReturns.length === shipmentWithReturns.returns.length) {
// // // // //             console.log("✅ No cleanup needed - all returns are valid");
// // // // //             await mongoose.connection.close();
// // // // //             return;
// // // // //         }

// // // // //         // Update the order
// // // // //         const updateResult = await Order.updateOne(
// // // // //             { 
// // // // //                 _id: orderId,
// // // // //                 "shipments._id": shipmentWithReturns._id
// // // // //             },
// // // // //             {
// // // // //                 $set: {
// // // // //                     "shipments.$.returns": uniqueReturns
// // // // //                 }
// // // // //             }
// // // // //         );

// // // // //         console.log(`\n✅ Order updated: matched=${updateResult.matchedCount}, modified=${updateResult.modifiedCount}`);

// // // // //         // Show final state
// // // // //         const updatedOrder = await Order.findById(orderId).select("shipments");
// // // // //         const updatedShipment = updatedOrder.shipments.find(s => 
// // // // //             s._id.toString() === shipmentWithReturns._id.toString()
// // // // //         );

// // // // //         console.log("\n📊 AFTER CLEANUP:");
// // // // //         console.log(`   Total returns: ${updatedShipment.returns.length}`);
// // // // //         updatedShipment.returns.forEach((ret, idx) => {
// // // // //             console.log(`   ${idx + 1}. Return ${ret._id}:`);
// // // // //             console.log(`      - return_order_id: ${ret.return_order_id || 'NONE'}`);
// // // // //             console.log(`      - return_shipment_id: ${ret.return_shipment_id || 'NONE'}`);
// // // // //             console.log(`      - awb_code: ${ret.awb_code || 'NONE'}`);
// // // // //             console.log(`      - status: ${ret.overallStatus}`);
// // // // //         });

// // // // //         console.log("\n✅ Cleanup completed successfully!");

// // // // //     } catch (err) {
// // // // //         console.error("❌ Cleanup failed:", err.message);
// // // // //         console.error(err.stack);
// // // // //     } finally {
// // // // //         // Close connection
// // // // //         await mongoose.connection.close();
// // // // //         console.log("🔌 MongoDB connection closed");
// // // // //         process.exit(0);
// // // // //     }
// // // // // }

// // // // // // Run cleanup
// // // // // cleanupOldOrder();















// // // // import dotenv from "dotenv";
// // // // dotenv.config();
// // // // import mongoose from "mongoose";
// // // // import axios from "axios";
// // // // import Order from "./models/Order.js";
// // // // import { getShiprocketToken } from "./middlewares/services/shiprocket.js";

// // // // async function migrateShipments() {
// // // //     await mongoose.connect(process.env.MONGO_URI);

// // // //     console.log("🚀 Migration started...");

// // // //     const token = await getShiprocketToken();
// // // //     console.log("✅ [Shiprocket] Token refreshed");

// // // //     // Fetch orders having shipments
// // // //     const orders = await Order.find({
// // // //         shipments: { $exists: true, $ne: [] }
// // // //     });

// // // //     console.log(`📦 Found ${orders.length} orders with shipments`);

// // // //     for (const order of orders) {
// // // //         let changed = false;

// // // //         for (const shipment of order.shipments) {

// // // //             // ⭐ 1) FIX INVALID ENUM STATUS
// // // //             if (shipment.status === "Awaiting Pickup") {
// // // //                 shipment.status = "Pickup Scheduled";
// // // //                 changed = true;
// // // //                 console.log(`🔧 Fixed invalid status for shipment ${shipment._id}`);
// // // //             }

// // // //             // ⭐ 2) FIX MISSING shiprocket_order_id
// // // //             if (!shipment.shiprocket_order_id && shipment.shipment_id) {
// // // //                 try {
// // // //                     const srRes = await axios.get(
// // // //                         `https://apiv2.shiprocket.in/v1/external/shipments/${shipment.shipment_id}`,
// // // //                         { headers: { Authorization: `Bearer ${token}` } }
// // // //                     );

// // // //                     const srData = srRes.data?.data;

// // // //                     if (srData?.order_id) {
// // // //                         shipment.shiprocket_order_id = srData.order_id;
// // // //                         changed = true;
// // // //                         console.log(`✅ Added shiprocket_order_id for shipment ${shipment._id}`);
// // // //                     }
// // // //                 } catch (err) {
// // // //                     console.log(`⚠️ Could not fetch SR order for shipment ${shipment._id}`);
// // // //                 }
// // // //             }

// // // //             // ⭐ 3) RENAME trackingHistory → tracking_history
// // // //             if (shipment.trackingHistory && !shipment.tracking_history) {
// // // //                 shipment.tracking_history = shipment.trackingHistory;
// // // //                 shipment.trackingHistory = undefined;
// // // //                 changed = true;
// // // //                 console.log(`🔄 Renamed trackingHistory → tracking_history for shipment ${shipment._id}`);
// // // //             }

// // // //             // ⭐ 4) ENSURE tracking_history ALWAYS EXISTS
// // // //             if (!Array.isArray(shipment.tracking_history)) {
// // // //                 shipment.tracking_history = [];
// // // //                 changed = true;
// // // //             }
// // // //         }

// // // //         // Save only if changed
// // // //         if (changed) {
// // // //             try {
// // // //                 await order.save();
// // // //                 console.log(`💾 Saved fixes for order ${order._id}`);
// // // //             } catch (err) {
// // // //                 console.log(`❌ Failed to save order ${order._id}`);
// // // //                 console.error(err.message);
// // // //             }
// // // //         }
// // // //     }

// // // //     console.log("🎉 Migration Completed Successfully!");
// // // //     process.exit(0);
// // // // }

// // // // migrateShipments();
























// // // import dotenv from "dotenv";
// // // dotenv.config();

// // // import mongoose from "mongoose";
// // // import axios from "axios";
// // // import Order from "./models/Order.js";
// // // import { getShiprocketToken } from "./middlewares/services/shiprocket.js";

// // // async function fixDuplicateAWBs() {
// // //     await mongoose.connect(process.env.MONGO_URI);

// // //     const orders = await Order.find({
// // //         "shipments.awb_code": { $ne: null }
// // //     });

// // //     console.log(`🔍 Scanning ${orders.length} orders`);

// // //     for (const order of orders) {
// // //         const awbMap = new Map();

// // //         for (const shipment of order.shipments) {
// // //             if (!shipment.awb_code) continue;

// // //             if (!awbMap.has(shipment.awb_code)) {
// // //                 // First occurrence → KEEP
// // //                 awbMap.set(shipment.awb_code, shipment._id.toString());
// // //             } else {
// // //                 // Duplicate → REMOVE
// // //                 console.log(
// // //                     `🚫 Removing duplicate AWB ${shipment.awb_code} from shipment ${shipment._id}`
// // //                 );

// // //                 shipment.awb_code = null;
// // //                 shipment.courier_name = null;
// // //                 shipment.tracking_url = null;
// // //                 shipment.status = "Pickup Scheduled";

// // //                 shipment.tracking_history.push({
// // //                     status: "AWB Removed",
// // //                     timestamp: new Date(),
// // //                     location: "System",
// // //                     description: "Duplicate AWB cleanup migration"
// // //                 });
// // //             }
// // //         }

// // //         await order.save();
// // //     }

// // //     console.log("✅ Duplicate AWB migration complete");
// // //     process.exit();
// // // }

// // // fixDuplicateAWBs().catch(err => {
// // //     console.error("❌ Migration failed", err);
// // //     process.exit(1);
// // // });



// // /**
// //  * One-time migration:
// //  * product.slug =
// //  * name + variant.shadeName + brand.slug + category.slug
// //  */

// // import mongoose from "mongoose";
// // import dotenv from "dotenv";

// // import Product from "./models/Product.js";
// // import Brand from "./models/Brand.js";
// // import Category from "./models/Category.js";
// // import { generateUniqueSlug } from "./middlewares/utils/slug.js";

// // dotenv.config();

// // const MONGO_URI = process.env.MONGO_URI;

// // async function migrateProductSlugs() {
// //     try {
// //         console.log("🔌 Connecting to MongoDB...");
// //         await mongoose.connect(MONGO_URI);
// //         console.log("✅ Connected");

// //         const cursor = Product.find()
// //             .populate("brand", "slug")
// //             .populate("category", "slug")
// //             .cursor();

// //         let processed = 0;
// //         let updated = 0;

// //         for await (const product of cursor) {
// //             processed++;

// //             // 🧠 Get first variant shade
// //             const shadeName =
// //                 product.variants?.[0]?.shadeName || "";

// //             const brandSlug = product.brand?.slug;
// //             const categorySlug = product.category?.slug;

// //             // ❗ Skip if critical data missing
// //             if (!brandSlug || !categorySlug) {
// //                 console.warn(
// //                     `⚠️ Skipped ${product._id} (missing brand/category slug)`
// //                 );
// //                 continue;
// //             }

// //             const slugBase = [
// //                 product.name,
// //                 shadeName,
// //                 brandSlug,
// //                 categorySlug
// //             ]
// //                 .filter(Boolean)
// //                 .join(" ");

// //             const newSlug = await generateUniqueSlug(
// //                 mongoose.model("Product"),
// //                 slugBase,
// //                 product._id // ignore self
// //             );

// //             if (product.slug !== newSlug) {
// //                 await Product.updateOne(
// //                     { _id: product._id },
// //                     { $set: { slug: newSlug } }
// //                 );

// //                 updated++;
// //                 console.log(`🔁 ${product._id} → ${newSlug}`);
// //             }

// //             if (processed % 100 === 0) {
// //                 console.log(`⏳ Processed ${processed} products...`);
// //             }
// //         }

// //         console.log("🎉 Migration completed");
// //         console.log(`📦 Processed: ${processed}`);
// //         console.log(`✏️ Updated: ${updated}`);

// //         process.exit(0);
// //     } catch (err) {
// //         console.error("❌ Migration failed:", err);
// //         process.exit(1);
// //     }
// // }

// // migrateProductSlugs();















// /**
//  * One-time migration:
//  * Copy slugs from Brand / Category / SkinType / Formulation
//  * into Product parallel slug fields
//  */

// import mongoose from "mongoose";
// import dotenv from "dotenv";

// import Product from "./models/Product.js";
// import Brand from "./models/Brand.js";
// import Category from "./models/Category.js";
// import SkinType from "./models/SkinType.js";
// import Formulation from "./models/shade/Formulation.js";

// dotenv.config();


// async function migrate() {
//     try {
//         await mongoose.connect(process.env.MONGO_URI);
//         console.log("Connected to MongoDB");

//         // remove product.slug and product.slugs
//         const unsetProductSlug = await mongoose.connection.db.collection("products").updateMany(
//             {},
//             {
//                 $unset: {
//                     slug: "",
//                     slugs: "",     // if exists
//                 },
//             }
//         );

//         console.log("Removed product.slug + product.slugs from:", unsetProductSlug.modifiedCount);

//         // remove variant.slug
//         const unsetVariantSlug = await mongoose.connection.db.collection("products").updateMany(
//             {
//                 "variants.slug": { $exists: true }
//             },
//             {
//                 $unset: {
//                     "variants.$[].slug": ""
//                 }
//             }
//         );

//         console.log("Removed variant.slug from:", unsetVariantSlug.modifiedCount);

//         console.log("Migration completed.");
//         process.exit(0);
//     } catch (err) {
//         console.error("Migration failed:", err);
//         process.exit(1);
//     }
// }

// migrate();



// import mongoose from "mongoose";
// import Invoice from "./models/Invoice.js";
// import Order from "./models/Order.js";

// async function run() {
//     try {
//         await mongoose.connect("mongodb+srv://parthivbadreshiya:parthiv12345@cluster0.silkevx.mongodb.net/joyory?retryWrites=true&w=majority&appName=Cluster0");
//         console.log("DB Connected");

//         const invoices = await Invoice.find({});
//         console.log(`Found ${invoices.length} invoices`);

//         for (const invoice of invoices) {
//             const orderId = invoice.order;

//             const order = await Order.findById(orderId).lean();
//             if (!order) {
//                 console.log(`Order not found for invoice ${invoice._id}`);
//                 continue;
//             }

//             const customerName = order.customerName || order.shippingAddress?.name || "Unknown";

//             await Invoice.updateOne(
//                 { _id: invoice._id },
//                 { $set: { customerName } }
//             );

//             console.log(`Updated Invoice ${invoice.invoiceNumber} -> customerName: ${customerName}`);
//         }

//         console.log("Migration Completed Successfully.");
//         process.exit(0);
//     } catch (err) {
//         console.error("Migration Error:", err);
//         process.exit(1);
//     }
// }

// run();





/**
 * ONE-TIME MIGRATION SCRIPT
 * ------------------------
 * - Generates variant-level slugs
 * - Stores all slugs in product.slugs[]
 *
 * Run with:
 *   node scripts/migrateProductVariantSlugs.js
 */

import mongoose from "mongoose";
import Promotion from "./models/Promotion.js";
import { buildPromotionSlug } from "./controllers/promotionController.js";

const MONGO_URI = "mongodb+srv://parthivbadreshiya:parthiv12345@cluster0.silkevx.mongodb.net/joyory?retryWrites=true&w=majority&appName=Cluster0";

const migrateSlugsForPromotions = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to DB");

        const promotions = await Promotion.find({ slug: { $exists: false } }); // no slug yet

        console.log(`Found ${promotions.length} promotions missing slugs.`);

        for (const promo of promotions) {

            const body = {
                campaignName: promo.campaignName,
                promotionType: promo.promotionType,
                discountValue: promo.discountValue,
            };

            const slug = await buildPromotionSlug(Promotion, body);

            promo.slug = slug;

            await promo.save();

            console.log(`✔ slug added → ${promo._id} → ${slug}`);
        }

        console.log("Migration completed successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed");
        console.error(err);
        process.exit(1);
    }
};

migrateSlugsForPromotions();