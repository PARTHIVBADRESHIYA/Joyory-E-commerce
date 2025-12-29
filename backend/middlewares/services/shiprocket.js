
// import axios from "axios";
// import mongoose from "mongoose";
// import Order from "../../models/Order.js";
// import Brand from "../../models/Brand.js";
// import Product from "../../models/Product.js";
// import { allocateWarehousesForOrder } from "../utils/warehouseAllocator.js"; // adjust paths as needed


// let shiprocketToken = null;
// let tokenExpiry = null;


// const DEBUG_SHIPROCKET = process.env.DEBUG_SHIPROCKET === "true";
// function logDebug(...args) {
//     if (DEBUG_SHIPROCKET) console.log("[Shiprocket Debug]", ...args);
// }

// export async function getPickupWarehouse(productItem) {
//     return {
//         pickup_location: process.env.SHIPROCKET_PICKUP || "Primary",
//         pickup_address_id: process.env.SHIPROCKET_PICKUP_ADDRESS_ID || null
//     };
// }


// // export function deepSearch(obj, keys) {
// //     let found = null;
// //     function search(o) {
// //         if (!o || typeof o !== "object") return;
// //         for (let k of Object.keys(o)) {
// //             if (keys.includes(k)) found = o[k];
// //             if (typeof o[k] === "object") search(o[k]);
// //         }
// //     }
// //     search(obj);
// //     return found;
// // }
// // services/shiprocket.js

// export function deepSearch(obj, keys) {
//     const visited = new Set();

//     function search(o) {
//         if (!o || typeof o !== "object") return null;
//         if (visited.has(o)) return null;
//         visited.add(o);

//         for (const k of Object.keys(o)) {
//             if (keys.includes(k) && o[k] != null && o[k] !== "") {
//                 return o[k];
//             }
//             if (typeof o[k] === "object") {
//                 const found = search(o[k]);
//                 if (found != null) return found;
//             }
//         }
//         return null;
//     }

//     return search(obj);
// }

// export function extractAWBFromShiprocket(payload, shipmentId) {
//     // ✅ Normalize ALL payloads into shipment array
//     const shipments = [];

//     if (payload?.shipment_id || payload?.id) {
//         shipments.push(payload);
//     }

//     if (Array.isArray(payload?.shipments)) {
//         shipments.push(...payload.shipments);
//     }

//     if (Array.isArray(payload?.data?.shipments)) {
//         shipments.push(...payload.data.shipments);
//     }

//     if (Array.isArray(payload?.data)) {
//         shipments.push(...payload.data);
//     }

//     const targetShipment = shipments.find(s =>
//         String(s.shipment_id || s.id) === String(shipmentId)
//     );

//     if (!targetShipment) return null;

//     const awb = deepSearch(targetShipment, [
//         "awb_code",
//         "awb",
//         "waybill",
//         "last_mile_awb"
//     ]);

//     if (!awb) return null;

//     const courier = deepSearch(targetShipment, [
//         "courier_name",
//         "courier_company",
//         "assigned_courier",
//         "last_mile_courier",
//         "last_mile_courier_name",
//         "lm_courier_name",
//         "lm_courier",
//         "courier"
//     ]);

//     const trackUrl =
//         deepSearch(targetShipment, ["tracking_url", "track_url", "trackingLink"]) ||
//         `https://shiprocket.co/tracking/${awb}`;

//     return { awb, courier, trackUrl };
// }

// // 🔑 Get and cache Shiprocket token
// export async function getShiprocketToken(forceRefresh = false) {
//     if (!forceRefresh && shiprocketToken && tokenExpiry && new Date() < tokenExpiry) {
//         return shiprocketToken;
//     }

//     try {
//         const res = await axios.post("https://apiv2.shiprocket.in/v1/external/auth/login", {
//             email: process.env.SHIPROCKET_EMAIL,
//             password: process.env.SHIPROCKET_PASSWORD,
//         });

//         shiprocketToken = res.data.token;
//         tokenExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000);
//         console.log("✅ [Shiprocket] Token refreshed");
//         return shiprocketToken;
//     } catch (err) {
//         console.error("❌ Shiprocket Auth Failed:", err.response?.data || err.message);
//         throw new Error("Failed to authenticate with Shiprocket");
//     }
// }

// async function shiprocketRequest(url, method, data, token) {
//     try {
//         logDebug(`➡️ ${method.toUpperCase()} ${url}`);
//         const res = await axios({
//             url,
//             method,
//             data,
//             headers: { Authorization: `Bearer ${token}` },
//         });
//         logDebug("📥 Response:", JSON.stringify(res.data, null, 2));
//         return res;
//     } catch (err) {
//         if (err.response?.status === 401) {
//             console.warn("⚠️ [Shiprocket] Unauthorized. Retrying with new token...");
//             const freshToken = await getShiprocketToken(true);
//             return await axios({
//                 url,
//                 method,
//                 data,
//                 headers: { Authorization: `Bearer ${freshToken}` },
//             });
//         }
//         console.error("❌ Shiprocket API Error:", err.response?.data || err.message);
//         throw err;
//     }
// }

// async function checkSingleShiprocketOrderAndSave(srOrderId) {
//     try {
//         const token = await getShiprocketToken();
//         const orderDetailsRes = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders/show/${srOrderId}`, {
//             headers: { Authorization: `Bearer ${token}` }
//         });
//         const shipOrder = orderDetailsRes.data;
//         if (!shipOrder) return;

//         // Shiprocket sometimes returns shipments[] or top-level fields
//         const srShipments = Array.isArray(shipOrder.shipments) && shipOrder.shipments.length ? shipOrder.shipments : [shipOrder];

//         for (const srShipment of srShipments) {
//             const shipmentId = srShipment.shipment_id || srShipment.id;
//             // AWB priority: shipment.awb_code -> order.last_mile_awb -> order.awb_data.awb
//             const { awb, courier, trackUrl } = extractAWBFromShiprocket(shipOrder, srShipment);


//             if (!awb) {
//                 // nothing to save for this shipment
//                 continue;
//             }

//             const trackingEntry = {
//                 status: "AWB Assigned",
//                 timestamp: new Date(),
//                 location: "Shiprocket",
//                 description: `AWB ${awb} assigned via ${courier || 'unknown'}`
//             };

//             // Find the local order that contains this shiprocket id / shipment id
//             const orderDoc = await Order.findOne(
//                 {
//                     $or: [
//                         { "shipments.shiprocket_order_id": srOrderId },
//                         { "shipments.shipment_id": String(shipmentId) }
//                     ]
//                 },
//                 { _id: 1 }
//             );

//             if (!orderDoc) {
//                 console.warn(`⚠️ No local order found for srOrderId=${srOrderId} / shipmentId=${shipmentId} — skipping AWB save`);
//                 continue; // move to next srShipment
//             }

//             // Now update the specific order's matching shipment element (use $or so either field matches)
//             const updateRes = await Order.updateOne(
//                 {
//                     _id: orderDoc._id,
//                     "shipments.shipment_id": String(shipmentId)
//                 }
//                 ,
//                 {
//                     $set: {
//                         "shipments.$.awb_code": awb,
//                         "shipments.$.courier_name": courier,
//                         "shipments.$.tracking_url": trackUrl,
//                         "shipments.$.status": "AWB Assigned",
//                         "orderStatus": "Shipped"
//                     },
//                     $push: {
//                         "shipments.$.tracking_history": trackingEntry,
//                         tracking_history: {
//                             status: "AWB Assigned",
//                             timestamp: new Date(),
//                             location: "Shiprocket",
//                             description: `Shipment ${shipmentId} AWB ${awb}`
//                         }
//                     }
//                 }
//             );



//             console.log(`✅ Immediate AWB saved for srOrder ${srOrderId}, shipment ${shipmentId}:`, { matched: updateRes.matchedCount, modified: updateRes.modifiedCount });
//         }
//     } catch (err) {
//         console.warn("checkSingleShiprocketOrderAndSave err:", err.response?.data || err.message || err);
//     }
// }

// export async function createShiprocketOrder(order) {
//     if (!order) throw new Error("Order missing");

//     console.log("🔥 createShiprocketOrder → order:", order._id);

//     const token = await getShiprocketToken();

//     // validate shipping address
//     const SA = order.shippingAddress || {};
//     const shippingAddress = {
//         addressLine1: SA.addressLine1 || SA.address || "",
//         city: SA.city || SA.town || "",
//         pincode: SA.pincode ? String(SA.pincode) : "",
//         state: SA.state || SA.region || "",
//         phone: SA.phone || order.user?.phone || "0000000000",
//         email: order.user?.email || "guest@example.com",
//         name: order.customerName || order.user?.name || "Customer"
//     };

//     if (!shippingAddress.addressLine1 || !shippingAddress.city || !shippingAddress.pincode || !shippingAddress.state) {
//         throw new Error("Invalid shipping address");
//     }

//     // 1) warehouse allocation
//     let allocationMap;
//     try {
//         allocationMap = await allocateWarehousesForOrder(order);
//     } catch (err) {
//         console.error("Allocation failed:", err);
//         throw err;
//     }

//     // 2) group items per warehouse
//     const shipmentsByWarehouse = {};
//     for (const [idxStr, allocs] of Object.entries(allocationMap)) {
//         const idx = Number(idxStr);
//         const orderItem = order.products[idx];
//         if (!orderItem) continue;

//         for (const a of allocs) {
//             const wh = a.warehouseCode || "DEFAULT_WH";
//             if (!shipmentsByWarehouse[wh]) shipmentsByWarehouse[wh] = [];

//             const existing = shipmentsByWarehouse[wh].find(
//                 x => String(x.product._id) === String(orderItem._id)
//             );

//             if (existing) {
//                 existing.qty += a.qty;   // ✅ MERGE
//             } else {
//                 shipmentsByWarehouse[wh].push({
//                     index: idx,
//                     product: orderItem,
//                     qty: a.qty
//                 });
//             }
//         }

//     }

//     let failed = [];
//     const shipmentResults = [];

//     // 3) Shiprocket order creation per warehouse
//     for (const [warehouseCode, items] of Object.entries(shipmentsByWarehouse)) {
//         const pickup_location = process.env.SHIPROCKET_PICKUP || "Primary";
//         const pickup_address_id = process.env.SHIPROCKET_PICKUP_ADDRESS_ID || null;

//         // Build order_items
//         const order_items = [];
//         const usedSkus = new Set();

//         for (const it of items) {
//             const p = it.product;
//             const sku = p.variant?.sku || p.productId?.variant?.sku || `NO-SKU-${p.productId}`;

//             if (!usedSkus.has(sku + String(it.qty))) {
//                 usedSkus.add(sku + String(it.qty));
//                 order_items.push({
//                     name: p.productId?.name || p.name || "Product",
//                     sku,
//                     units: it.qty,
//                     selling_price: p.price || 0
//                 });
//             }
//         }

//         const shipmentData = {
//             order_id: `${order.orderId}-${warehouseCode}`,
//             order_date: new Date(order.createdAt || Date.now()).toISOString().slice(0, 19).replace("T", " "),
//             pickup_location,
//             pickup_address_id,
//             billing_customer_name: shippingAddress.name,
//             billing_last_name: "",
//             billing_address: shippingAddress.addressLine1,
//             billing_city: shippingAddress.city,
//             billing_pincode: shippingAddress.pincode,
//             billing_state: shippingAddress.state,
//             billing_country: "India",
//             billing_email: shippingAddress.email,
//             billing_phone: shippingAddress.phone,
//             shipping_is_billing: true,
//             order_items,
//             payment_method: order.paymentMethod === "COD" ? "COD" : "Prepaid",
//             sub_total: order_items.reduce((s, it) => s + it.selling_price * it.units, 0),
//             length: 10,
//             breadth: 10,
//             height: 10,
//             weight: Math.max(0.1, order_items.length * 0.2)
//         };

//         try {
//             const orderRes = await shiprocketRequest(
//                 "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
//                 "post",
//                 shipmentData,
//                 token
//             );

//             console.log("🔥 RAW SHIPROCKET RESPONSE:", orderRes.data);

//             const shiprocketOrderId = orderRes.data?.id || orderRes.data?.order_id || null;
//             const shipmentId = orderRes.data?.shipment_id || orderRes.data?.shipmentId || null;

//             if (!shipmentId) {
//                 failed.push({ warehouseCode, error: "No shipment_id returned" });
//                 continue;
//             }

//             console.log(`✅ Shiprocket order created: ${shipmentId}`);

//             const tracking_history = [
//                 {
//                     status: "Order Confirmed",
//                     timestamp: new Date(),
//                     location: "Shiprocket",
//                     description: "Shipment created - AWB assignment in progress"
//                 }
//             ];

//             const shipmentDoc = {
//                 _id: new mongoose.Types.ObjectId(),
//                 warehouseCode,
//                 pickup_location,
//                 pickup_address_id,
//                 shiprocket_order_id: shiprocketOrderId,
//                 shipment_id: shipmentId,
//                 awb_code: null,
//                 courier_name: null,
//                 tracking_url: null,
//                 status: "Pickup Scheduled",
//                 assignedAt: new Date(),
//                 expected_delivery: calculateExpectedDelivery(),
//                 products: items.map(it => ({
//                     productId: it.product.productId._id || it.product.productId,
//                     quantity: it.qty,
//                     price: it.product.price,
//                     variant: it.product.variant
//                 })),
//                 tracking_history
//             };

//             shipmentResults.push({ success: true, doc: shipmentDoc });

//         } catch (err) {
//             failed.push({ warehouseCode, error: err.message });
//         }
//     }

//     const successfulShipments = shipmentResults.filter(s => s.success).map(s => s.doc);
//     const shipmentIds = successfulShipments.map(s => s.shipment_id);

//     // 🚀 FIX APPLIED HERE — removed invalid top-level tracking_history push
//     if (successfulShipments.length > 0) {
//         try {
//             const updateResult = await Order.updateOne(
//                 {
//                     _id: order._id,
//                     "shipments.shipment_id": { $nin: shipmentIds } // ✅ correct
//                 },
//                 {
//                     $push: { shipments: { $each: successfulShipments } }, // ← ONLY VALID PUSH
//                     $set: {
//                         primary_shipment: successfulShipments[0]?._id || null,
//                         orderStatus: "Processing"
//                     }
//                 }
//             );

//             // immediate AWB check
//             try {
//                 const srIds = successfulShipments.map(s => s.shiprocket_order_id).filter(Boolean);
//                 for (const srId of srIds) {
//                     await checkSingleShiprocketOrderAndSave(srId);
//                 }
//             } catch (e) {
//                 console.warn("Immediate AWB refresh failed:", e);
//             }

//             console.log("✅ Shipments saved to DB:", updateResult);

//         } catch (dbError) {
//             console.error("❌ DB UPDATE FAILED:", dbError);
//             throw new Error("Failed to save shipments to database");
//         }
//     } else {
//         throw new Error("All shipment creations failed");
//     }

//     return { shipments: successfulShipments, failed };
// }

// function calculateExpectedDelivery() {
//     const deliveryDate = new Date();
//     deliveryDate.setDate(deliveryDate.getDate() + 7); // 7 days from now
//     return deliveryDate;
// }

// export async function cancelShiprocketShipment(shiprocketOrderId) {
//     const token = await getShiprocketToken();

//     const payload = {
//         ids: [Number(shiprocketOrderId)]
//     };

//     try {
//         const res = await shiprocketRequest(
//             "https://apiv2.shiprocket.in/v1/external/orders/cancel",
//             "post",
//             payload,
//             token
//         );
//         return res.data;
//     } catch (err) {
//         console.error("❌ Shiprocket API Error:", err.response?.data || err.message);
//         throw err;
//     }
// }

// // 🔍 Track shipment by AWB
// export async function trackShiprocketShipmentByAWB(awbCode) {
//     const token = await getShiprocketToken();
//     try {
//         const res = await axios.get(
//             `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awbCode}`,
//             { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
//         );
//         return res.data;
//     } catch (err) {
//         console.error("❌ Shiprocket AWB Tracking Failed:", err.response?.data || err.message);
//         throw err;
//     }
// }

// // 🔍 Track shipment by shipment ID
// export async function trackShiprocketShipment(shipmentId) {
//     const token = await getShiprocketToken();
//     const res = await axios.get(
//         `https://apiv2.shiprocket.in/v1/external/courier/track/shipment/${shipmentId}`,
//         { headers: { Authorization: `Bearer ${token}` } }
//     );
//     return res.data;
// }

// // 🧾 Label + Invoice download
// export async function getShiprocketDocuments(shipmentId) {
//     const token = await getShiprocketToken();
//     const [label, invoice] = await Promise.all([
//         axios.get(`https://apiv2.shiprocket.in/v1/external/courier/label/print?shipment_id=${shipmentId}`, {
//             headers: { Authorization: `Bearer ${token}` },
//         }),
//         axios.get(`https://apiv2.shiprocket.in/v1/external/courier/invoice/print?ids=${shipmentId}`, {
//             headers: { Authorization: `Bearer ${token}` },
//         }),
//     ]);
//     return { label: label.data, invoice: invoice.data };
// }

// // 🧰 Helpers
// async function saveDebugLog(order, step, payload, err) {
//     await Order.updateOne(
//         { _id: order._id },
//         {
//             $push: {
//                 "debugLogs": {
//                     step,
//                     payload,
//                     response: err.response?.data || err.message,
//                     createdAt: new Date(),
//                 },
//             },
//         }
//     );
// }

// export async function retryFailedShipments(maxRetries = 3) {
//     // Find orders with failed shipment statuses
//     const failedOrders = await Order.find({
//         "shipments.status": {
//             $in: ["Failed", "Created (AWB not assigned)", "Pickup Scheduled"]
//         },
//         orderStatus: { $ne: "Cancelled" }
//     });

//     if (!failedOrders.length) return console.log("✅ No failed shipments to retry.");

//     for (const order of failedOrders) {
//         try {
//             // Initialize retryCount if not present
//             order.retryCount = order.retryCount || 0;

//             if (order.retryCount >= maxRetries) {
//                 console.log(`❌ Order ${order._id} reached max retry attempts (${maxRetries}). Skipping.`);
//                 continue;
//             }

//             console.log(`🔁 Retrying shipment for order ${order._id} (Attempt ${order.retryCount + 1})`);

//             // Retry shipment creation
//             const res = await createShiprocketOrder(order);

//             console.log("✅ Retried successfully:", res.shipments.length, "shipments created");

//             // Update order with latest shipment info & increment retry count
//             order.retryCount = (order.retryCount || 0) + 1;
//             order.lastRetryAt = new Date();

//             // Save to DB
//             await order.save();
//         } catch (err) {
//             console.error("🚨 Retry failed for order", order._id, ":", err.response?.data || err.message);

//             // Push debug log
//             await Order.updateOne(
//                 { _id: order._id },
//                 {
//                     $push: {
//                         "debugLogs": {
//                             step: "Retry Failed",
//                             response: err.response?.data || err.message,
//                             retryCount: (order.retryCount || 0) + 1,
//                             createdAt: new Date()
//                         }
//                     }
//                 }
//             );

//             // Increment retry count even on failure
//             order.retryCount = (order.retryCount || 0) + 1;
//             await order.save();
//         }
//     }
// }

// export async function validatePincodeServiceability(pincode, cod = true) {
//     const token = await getShiprocketToken();

//     const pickup_postcode = process.env.SHIPROCKET_PICKUP_PIN || "110030";
//     const weight = 0.5;
//     const codFlag = cod ? 1 : 0;

//     const url = `https://apiv2.shiprocket.in/v1/external/courier/serviceability/?pickup_postcode=${pickup_postcode}&delivery_postcode=${String(
//         pincode
//     ).trim()}&weight=${weight}&cod=${codFlag}`;

//     try {
//         const res = await axios.get(url, {
//             headers: { Authorization: `Bearer ${token}` },
//         });

//         const couriers = res.data?.data?.available_courier_companies || [];

//         if (couriers.length === 0) {
//             return { serviceable: false, couriers: [] };
//         }

//         return {
//             serviceable: true,
//             couriers: couriers.map((c) => ({
//                 name: c.courier_name,
//                 etd: c.etd,
//                 cod: c.cod,
//             })),
//         };
//     } catch (err) {
//         console.error(
//             "❌ Shiprocket Pincode Validation Failed:",
//             err.response?.data || err.message
//         );
//         throw new Error("Failed to validate pincode via Shiprocket");
//     }
// }

// export async function cancelPickup(shiprocketOrderId) {
//     const token = await getShiprocketToken();

//     try {
//         const response = await axios({
//             url: "https://apiv2.shiprocket.in/v1/external/orders/cancel/pickup",
//             method: "POST",
//             data: {
//                 shipment_id: [shiprocketOrderId]
//             },
//             headers: {
//                 Authorization: `Bearer ${token}`,
//                 'Content-Type': 'application/json'
//             }
//         });

//         return response.data;
//     } catch (error) {
//         console.error("Shiprocket pickup cancellation failed:", error.response?.data || error.message);
//         throw new Error(`Shiprocket API Error: ${error.message}`);
//     }
// }

// export const createShiprocketReturnOrder = async (order, returnRequest) => {
//     if (!order) throw new Error("Order document is required");
//     if (!returnRequest || !Array.isArray(returnRequest.items) || returnRequest.items.length === 0) {
//         throw new Error("Invalid returnRequest: items required");
//     }

//     const orderId = order._id.toString();
//     const retId = returnRequest._id.toString();

//     console.log("🔥 createShiprocketReturnOrder → order:", orderId, "returnRequest:", retId);

//     // Validate basic item fields (server-side)
//     for (const it of returnRequest.items) {
//         if (!it.productId) throw new Error("Each return item must have productId");
//         if (!it.quantity || Number(it.quantity) <= 0) throw new Error("Each return item must have quantity > 0");
//     }

//     // 0. Quick DB-level pre-check to avoid an obvious duplicate without locking
//     const preExisting = await Order.aggregate([
//         { $match: { _id: new mongoose.Types.ObjectId(orderId) } },
//         { $unwind: "$shipments" },
//         { $unwind: "$shipments.returns" },
//         { $match: { "shipments.returns._id": new mongoose.Types.ObjectId(retId) } },
//         { $project: { return: "$shipments.returns" } }
//     ]).allowDiskUse(true);

//     if (preExisting && preExisting.length > 0) {
//         const existingReturn = preExisting[0].return;
//         if (existingReturn.shiprocket_order_id) {
//             console.log("⚠️ Return already linked to Shiprocket - returning existing");
//             return existingReturn;
//         }
//         // else continue flow - we'll update that return doc in transaction
//         console.log("ℹ️ Return exists in DB but not linked to Shiprocket → will proceed to create/update");
//     }

//     // 1. get token
//     const token = await getShiprocketToken();
//     if (!token) throw new Error("Unable to get Shiprocket token");

//     // 2. build payload (same approach you had; keep minimal price to avoid rejection)
//     const SA = order.shippingAddress || {};
//     const orderUser = order.user || {};

//     const pickup = {
//         pickup_customer_name: order.customerName || orderUser.name || "Customer",
//         pickup_last_name: "",
//         pickup_address: SA.addressLine1 || SA.address || "",
//         pickup_city: SA.city || "",
//         pickup_state: SA.state || "",
//         pickup_country: "India",
//         pickup_pincode: String(SA.pincode || ""),
//         pickup_email: orderUser.email || "customer@example.com",
//         pickup_phone: SA.phone || orderUser.phone || "0000000000"
//     };

//     const W = JSON.parse(process.env.WAREHOUSE_JSON || "{}");
//     const shipping = {
//         shipping_customer_name: W.name || "Warehouse Manager",
//         shipping_last_name: "",
//         shipping_address: W.address || "Warehouse Address",
//         shipping_city: W.city || "Mumbai",
//         shipping_state: W.state || "Maharashtra",
//         shipping_country: "India",
//         shipping_pincode: String(W.pincode || "400001"),
//         shipping_email: W.email || "warehouse@example.com",
//         shipping_phone: W.phone || "9999999999"
//     };

//     const order_items = returnRequest.items.map(it => ({
//         name: it.name || it.variant?.name || "Return Item",
//         sku: it.variant?.sku || `RETURN-${it.productId}`,
//         units: Number(it.quantity) || 1,
//         selling_price: 0.01
//     }));

//     const orderDate = new Date().toISOString().slice(0, 19).replace("T", " ");
//     const payload = {
//         order_id: `RET-${order.orderId || orderId}-${Date.now()}`.substring(0, 48),
//         order_date: orderDate,
//         pickup_location: process.env.SHIPROCKET_PICKUP || "Primary",
//         ...pickup,
//         ...shipping,
//         order_items,
//         payment_method: "Prepaid",
//         total_discount: 0,
//         sub_total: 0.01,
//         length: 10,
//         breadth: 10,
//         height: 10,
//         weight: 0.5
//     };

//     console.log("📦 Shiprocket Return Payload:", JSON.stringify(payload));

//     // 3. call Shiprocket
//     let srResponse;
//     try {
//         srResponse = await axios.post(
//             "https://apiv2.shiprocket.in/v1/external/orders/create/return",
//             payload,
//             {
//                 headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
//                 timeout: 30000
//             }
//         );
//     } catch (err) {
//         console.error("❌ Shiprocket API Error:", err.response?.data || err.message);
//         // audit: add an entry to order.returnRequest or create a small log entry (non-blocking)
//         await Order.updateOne(
//             { _id: orderId },
//             {
//                 $push: {
//                     "shipments.0.returns": { // best-effort audit; but don't create incomplete return if you prefer
//                         _id: new mongoose.Types.ObjectId(retId),
//                         status: "shiprocket_failed",
//                         audit_trail: [{
//                             status: "shiprocket_failed",
//                             action: "shiprocket_api_error",
//                             timestamp: new Date(),
//                             notes: JSON.stringify(err.response?.data || err.message)
//                         }]
//                     }
//                 }
//             }
//         ).catch(() => { });
//         throw new Error(`Shiprocket API failed: ${err.response?.data?.message || err.message}`);
//     }

//     const srData = srResponse.data;
//     console.log("✅ Shiprocket Return Response:", srData);
//     if (!srData.order_id) throw new Error("Shiprocket did not return order_id");

//     const shiprocketOrderId = srData.order_id;
//     const shiprocketShipmentId = srData.shipment_id;
//     const now = new Date();

//     // 4. transactionally attach return to the correct shipment and update returnRequest
//     const session = await mongoose.startSession();
//     let resultReturn = null;

//     try {
//         await session.withTransaction(async () => {
//             // re-load document inside session (this prevents TOCTOU)
//             const ord = await Order.findById(orderId).session(session);
//             if (!ord) throw new Error("Order not found inside transaction");

//             // determine which shipment to attach to
//             const shipmentToUpdate = ord.shipments.id(ord.primary_shipment?.toString()) || ord.shipments[0];
//             if (!shipmentToUpdate) throw new Error("No shipment found to attach return");

//             // find existing return subdoc in that shipment
//             let ret = shipmentToUpdate.returns.id(retId);

//             if (ret && ret.shiprocket_order_id) {
//                 // Only skip if Shiprocket order already exists
//                 console.log("⚠️ In-transaction: return already linked to Shiprocket - returning existing");
//                 resultReturn = ret.toObject();
//                 return;
//             }

//             // build return object to insert or update
//             const newReturn = {
//                 _id: new mongoose.Types.ObjectId(retId),
//                 shiprocket_order_id: shiprocketOrderId,
//                 shipment_id: shiprocketShipmentId,
//                 awb_code: null,
//                 courier_name: null,
//                 tracking_url: null,
//                 status: "requested",
//                 pickup_details: {
//                     name: pickup.pickup_customer_name,
//                     address: pickup.pickup_address,
//                     city: pickup.pickup_city,
//                     state: pickup.pickup_state,
//                     pincode: pickup.pickup_pincode,
//                     phone: pickup.pickup_phone,
//                     email: pickup.pickup_email
//                 },
//                 warehouse_details: {
//                     name: shipping.shipping_customer_name,
//                     address: shipping.shipping_address,
//                     city: shipping.shipping_city,
//                     state: shipping.shipping_state,
//                     pincode: shipping.shipping_pincode,
//                     phone: shipping.shipping_phone,
//                     email: shipping.shipping_email
//                 },
//                 items: returnRequest.items.map(it => ({
//                     productId: it.productId,
//                     quantity: it.quantity,
//                     variant: it.variant,
//                     reason: it.reason,
//                     reasonDescription: it.reasonDescription,
//                     images: it.images || [],
//                     condition: it.condition || "unknown"
//                 })),
//                 tracking_history: [{
//                     status: "Return Created",
//                     timestamp: now,
//                     location: "System",
//                     description: "Return order created in Shiprocket"
//                 }],
//                 audit_trail: [{
//                     status: "created",
//                     action: "shiprocket_return_created",
//                     timestamp: now,
//                     performedBy: returnRequest.requestedBy || (ord.user?._id),
//                     performedByModel: "User",
//                     notes: `Return created in Shiprocket. SR order id: ${shiprocketOrderId}`,
//                     metadata: { shiprocketRaw: srData }
//                 }],
//                 createdAt: now,
//                 requestedBy: returnRequest.requestedBy,
//                 requestedAt: returnRequest.requestedAt,
//                 reason: returnRequest.reason,
//                 description: returnRequest.description,
//                 // store raw shiprocket response for debugging
//                 _shiprocket_raw_response: srData
//             };

//             if (ret) {
//                 // replace fields on existing subdoc
//                 ret.set(newReturn);
//             } else {
//                 shipmentToUpdate.returns.push(newReturn);
//             }

//             // update order-level returnRequest state
//             if (ord.returnRequest) {
//                 ord.returnRequest.status = "approved";
//                 ord.returnRequest.approvedAt = now;
//             }

//             // increment some return stats if you want
//             ord.returnStats = ord.returnStats || {};
//             ord.returnStats.totalReturns = (ord.returnStats.totalReturns || 0) + 1;

//             await ord.save({ session });
//             // retrieve the just-saved subdoc
//             const savedShipment = ord.shipments.id(shipmentToUpdate._id);
//             resultReturn = savedShipment.returns.id(retId).toObject();
//         }); // end transaction
//     } finally {
//         session.endSession();
//     }

//     console.log("✅ Return created/updated in DB successfully");
//     return {
//         ...resultReturn,
//         order_id: shiprocketOrderId,
//         shipment_id: shiprocketShipmentId
//     };
// };

