// // services/shiprocket.js
// import axios from "axios";
// import Order from "../../models/Order.js";

// let shiprocketToken = null;
// let tokenExpiry = null;

// const DEBUG_SHIPROCKET = process.env.DEBUG_SHIPROCKET === "true";
// function logDebug(...args) {
//     if (DEBUG_SHIPROCKET) console.log("[Shiprocket Debug]", ...args);
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

// // 📡 Helper request with 401 retry
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

// export async function createShiprocketOrder(order) {
//     const token = await getShiprocketToken();

//     if (
//         !order.shippingAddress?.addressLine1 ||
//         !order.shippingAddress?.city ||
//         !order.shippingAddress?.pincode ||
//         !order.shippingAddress?.state
//     ) throw new Error("Invalid shipping address");

//     if (!order.products?.length) throw new Error("No products found in order");

//     // ✅ Build Shiprocket order_items with safe SKU deduplication
//     const orderItems = [];
//     const usedSkus = new Set();

//     for (const item of order.products) {
//         const sku = item.variant?.sku || "NO-SKU";

//         if (usedSkus.has(sku)) {
//             console.warn(`⚠️ Duplicate SKU removed from Shiprocket payload: ${sku}`);
//             continue;
//         }

//         usedSkus.add(sku);

//         orderItems.push({
//             name: item.productId?.name || item.name || "Product",
//             sku,
//             units: item.quantity,
//             selling_price: item.price || 0,
//         });
//     }

//     const shipmentData = {
//         order_id: order._id.toString(),
//         order_date: new Date(order.createdAt).toISOString().slice(0, 19).replace("T", " "),
//         pickup_location: process.env.SHIPROCKET_PICKUP || "Primary",
//         pickup_address_id: 9479305,  // 🔥 REQUIRED
//         billing_customer_name: order.customerName || order.user?.name || "Guest",
//         billing_last_name: "",
//         billing_address: order.shippingAddress.addressLine1,
//         billing_city: order.shippingAddress.city,
//         billing_pincode: order.shippingAddress.pincode,
//         billing_state: order.shippingAddress.state,
//         billing_country: "India",
//         billing_email: order.user?.email || "guest@example.com",
//         billing_phone: order.shippingAddress?.phone || order.user?.phone || "9876543210",
//         shipping_is_billing: true,

//         // ✅ Replace old mapping with our deduplicated array
//         order_items: orderItems,

//         payment_method: order.paymentMethod === "COD" ? "COD" : "Prepaid",
//         sub_total: order.amount,
//         length: 10,
//         breadth: 10,
//         height: 10,
//         weight: 1,
//     };

//     // STEP 1: Create order
//     let orderRes;
//     try {
//         orderRes = await shiprocketRequest(
//             "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
//             "post",
//             shipmentData,
//             token
//         );
//     } catch (err) {
//         await saveDebugLog(order, "Order Create Failed", shipmentData, err);
//         throw new Error("Shiprocket order creation failed");
//     }

//     const shiprocketOrderId = orderRes.data?.order_id;
//     const shipmentId = orderRes.data?.shipment_id;
//     if (!shipmentId) {
//         return partialReturn(order, shiprocketOrderId, "Created (No Shipment ID)");
//     }

//     // STEP 2: Assign AWB
//     let awbRes;
//     try {
//         awbRes = await shiprocketRequest(
//             "https://apiv2.shiprocket.in/v1/external/courier/assign/awb",
//             "post",
//             { shipment_id: shipmentId },
//             token
//         );
//     } catch (err) {
//         await saveDebugLog(order, "AWB Assign Failed", { shipment_id: shipmentId }, err);
//         return partialReturn(order, shiprocketOrderId, "Created (AWB not assigned)", shipmentId);
//     }

//     const awbData = awbRes.data?.response?.data;
//     const awbCode = awbData?.awb_code || null;
//     const courierName = awbData?.courier_name || null;

//     const trackingUrl = awbCode
//         ? `https://shiprocket.co/tracking/${awbCode}`
//         : null;

//     // STEP 3: Schedule Pickup 🚚
//     let pickupRes;
//     try {
//         pickupRes = await shiprocketRequest(
//             "https://apiv2.shiprocket.in/v1/external/courier/generate/pickup",
//             "post",
//             { shipment_id: [shipmentId] },
//             token
//         );
//     } catch (err) {
//         await saveDebugLog(order, "Pickup Schedule Failed", { shipment_id: shipmentId }, err);
//     }

//     const shipmentDetails = {
//         shiprocket_order_id: shiprocketOrderId,
//         shipment_id: shipmentId,
//         awb_code: awbCode,
//         courier_company_id: awbData?.courier_company_id || null,
//         courier_name: courierName,
//         tracking_url: trackingUrl,
//         status: pickupRes?.data?.pickup_scheduled
//             ? "Pickup Scheduled"
//             : "Awaiting Pickup",
//         assignedAt: new Date(),
//     };


//     await Order.findByIdAndUpdate(order._id, {
//         shipment: shipmentDetails,
//         orderStatus: shipmentDetails.status,
//         $push: {
//             trackingHistory: {
//                 status: shipmentDetails.status,
//                 timestamp: new Date(),
//                 location: shipmentDetails.courier_name || "Shiprocket",
//             },
//         },
//     });


//     return {
//         shipmentDetails,
//         rawResponses: {
//             orderRes: orderRes.data,
//             awbRes: awbRes.data,
//             pickupRes: pickupRes?.data,
//         },
//     };
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


// // 🔍 Track shipment
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
//                 "shipment.debugLogs": {
//                     step,
//                     payload,
//                     response: err.response?.data || err.message,
//                     createdAt: new Date(),
//                 },
//             },
//         }
//     );
// }

// function partialReturn(order, orderId, status, shipmentId = null) {
//     return {
//         shipmentDetails: {
//             shiprocket_order_id: orderId,
//             shipment_id: shipmentId,
//             status,
//             assignedAt: new Date(),
//         },
//     };
// }


// export async function retryFailedShipments(maxRetries = 3) {
//     // Find orders with failed shipment statuses
//     const failedOrders = await Order.find({
//         "shipment.status": {
//             $in: ["Shipment Creation Failed", "Created (AWB not assigned)", "Awaiting Pickup"]
//         }
//     });

//     if (!failedOrders.length) return console.log("✅ No failed shipments to retry.");

//     for (const order of failedOrders) {
//         try {
//             // Initialize retryCount if not present
//             order.shipment.retryCount = order.shipment.retryCount || 0;

//             if (order.shipment.retryCount >= maxRetries) {
//                 console.log(`❌ Order ${order._id} reached max retry attempts (${maxRetries}). Skipping.`);
//                 continue;
//             }

//             console.log(`🔁 Retrying shipment for order ${order._id} (Attempt ${order.shipment.retryCount + 1})`);

//             // Retry shipment
//             const res = await createShiprocketOrder(order);

//             console.log("✅ Retried successfully:", res.shipmentDetails);

//             // Update order with latest shipment info & increment retry count
//             order.shipment = {
//                 ...res.shipmentDetails,
//                 retryCount: order.shipment.retryCount + 1,
//                 lastRetryAt: new Date()
//             };
//             order.orderStatus = res.shipmentDetails.status;

//             // Save to DB
//             await order.save();
//         } catch (err) {
//             console.error("🚨 Retry failed for order", order._id, ":", err.response?.data || err.message);

//             // Push debug log into MongoDB
//             await Order.updateOne(
//                 { _id: order._id },
//                 {
//                     $push: {
//                         "shipment.debugLogs": {
//                             step: "Retry Failed",
//                             response: err.response?.data || err.message,
//                             retryCount: (order.shipment.retryCount || 0) + 1,
//                             createdAt: new Date()
//                         }
//                     }
//                 }
//             );

//             // Increment retry count even on failure
//             order.shipment.retryCount = (order.shipment.retryCount || 0) + 1;
//             await order.save();
//         }
//     }
// }

// export async function validatePincodeServiceability(pincode, cod = true) {
//     const token = await getShiprocketToken();

//     const pickup_postcode = process.env.SHIPROCKET_PICKUP_PIN || "110030"; // Default or env pickup pin
//     const weight = 0.5; // in KG
//     const codFlag = cod ? 1 : 0;

//     // ✅ Build query string for GET request
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

//         // Extract useful info
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



import axios from "axios";
import mongoose from "mongoose";
import Order from "../../models/Order.js";
import Brand from "../../models/Brand.js";
import Product from "../../models/Product.js";
import { allocateWarehousesForOrder } from "../utils/warehouseAllocator.js"; // adjust paths as needed


let shiprocketToken = null;
let tokenExpiry = null;

const DEBUG_SHIPROCKET = process.env.DEBUG_SHIPROCKET === "true";
function logDebug(...args) {
    if (DEBUG_SHIPROCKET) console.log("[Shiprocket Debug]", ...args);
}

export async function getPickupWarehouse(productItem) {
    return {
        pickup_location: process.env.SHIPROCKET_PICKUP || "Primary",
        pickup_address_id: process.env.SHIPROCKET_PICKUP_ADDRESS_ID || null
    };
}


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
    // Try find shipment inside array
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
        deepSearch(srShipment?.last_mile, [
            "courier_name",
            "courier_company",
            "courier_code",
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


// 🔑 Get and cache Shiprocket token
export async function getShiprocketToken(forceRefresh = false) {
    if (!forceRefresh && shiprocketToken && tokenExpiry && new Date() < tokenExpiry) {
        return shiprocketToken;
    }

    try {
        const res = await axios.post("https://apiv2.shiprocket.in/v1/external/auth/login", {
            email: process.env.SHIPROCKET_EMAIL,
            password: process.env.SHIPROCKET_PASSWORD,
        });

        shiprocketToken = res.data.token;
        tokenExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000);
        console.log("✅ [Shiprocket] Token refreshed");
        return shiprocketToken;
    } catch (err) {
        console.error("❌ Shiprocket Auth Failed:", err.response?.data || err.message);
        throw new Error("Failed to authenticate with Shiprocket");
    }
}

// 📡 Helper request with 401 retry
async function shiprocketRequest(url, method, data, token) {
    try {
        logDebug(`➡️ ${method.toUpperCase()} ${url}`);
        const res = await axios({
            url,
            method,
            data,
            headers: { Authorization: `Bearer ${token}` },
        });
        logDebug("📥 Response:", JSON.stringify(res.data, null, 2));
        return res;
    } catch (err) {
        if (err.response?.status === 401) {
            console.warn("⚠️ [Shiprocket] Unauthorized. Retrying with new token...");
            const freshToken = await getShiprocketToken(true);
            return await axios({
                url,
                method,
                data,
                headers: { Authorization: `Bearer ${freshToken}` },
            });
        }
        console.error("❌ Shiprocket API Error:", err.response?.data || err.message);
        throw err;
    }
}

// async function checkSingleShiprocketOrderAndSave(srOrderId) {
//     try {
//         const token = await getShiprocketToken();
//         const orderDetailsRes = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders/show/${srOrderId}`, {
//             headers: { Authorization: `Bearer ${token}` }
//         });
//         const shipOrder = orderDetailsRes.data;
//         if (!shipOrder) return;

//         // Extract shipments array and update any AWB found
//         const srShipments = Array.isArray(shipOrder.shipments) ? shipOrder.shipments : [shipOrder];
//         for (const srShipment of srShipments) {
//             const shipmentId = srShipment.shipment_id || srShipment.id;
//             const awb =
//                 srShipment?.awb_code ||
//                 Order.last_mile_awb ||
//                 Order.awb_data?.awb ||
//                 null;

//             const trackUrl =
//                 srShipment?.tracking_url ||
//                 Order.last_mile_awb_track_url ||
//                 null;

//             const courier =
//                 srShipment?.courier_name ||
//                 Order.last_mile_courier_name ||
//                 null;


//             if (!awb) continue;

//             // Atomic update like before
//             const trackingEntry = {
//                 status: "AWB Assigned",
//                 timestamp: new Date(),
//                 location: "Shiprocket",
//                 description: `AWB ${awb} assigned via ${courier || 'unknown'}`
//             };

//             await Order.updateOne(
//                 { "shipments.shipment_id": String(shipmentId) },

//                 {
//                     $set: {
//                         "shipments.$.awb_code": awb,
//                         "shipments.$.courier_name": courier,
//                         "shipments.$.tracking_url": trackUrl,
//                         "shipments.$.status": "AWB Assigned",
//                         "orderStatus": "Shipped"
//                     },
//                     $push: {
//                         "shipments.$.trackingHistory": trackingEntry,
//                         trackingHistory: {
//                             status: "AWB Assigned",
//                             timestamp: new Date(),
//                             location: "Shiprocket",
//                             description: `Shipment ${shipmentId} AWB ${awb}`
//                         }
//                     }
//                 }
//             );
//             console.log(`✅ Immediate AWB saved for srOrder ${srOrderId}, shipment ${shipmentId}`);
//         }
//     } catch (err) {
//         console.warn("checkSingleShiprocketOrderAndSave err:", err.response?.data || err.message || err);
//     }
// }
async function checkSingleShiprocketOrderAndSave(srOrderId) {
    try {
        const token = await getShiprocketToken();
        const orderDetailsRes = await axios.get(`https://apiv2.shiprocket.in/v1/external/orders/show/${srOrderId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const shipOrder = orderDetailsRes.data;
        if (!shipOrder) return;

        // Shiprocket sometimes returns shipments[] or top-level fields
        const srShipments = Array.isArray(shipOrder.shipments) && shipOrder.shipments.length ? shipOrder.shipments : [shipOrder];

        for (const srShipment of srShipments) {
            const shipmentId = srShipment.shipment_id || srShipment.id;
            // AWB priority: shipment.awb_code -> order.last_mile_awb -> order.awb_data.awb
            const { awb, courier, trackUrl } = extractAWBFromShiprocket(shipOrder, shipmentId);


            if (!awb) {
                // nothing to save for this shipment
                continue;
            }

            const trackingEntry = {
                status: "AWB Assigned",
                timestamp: new Date(),
                location: "Shiprocket",
                description: `AWB ${awb} assigned via ${courier || 'unknown'}`
            };

            // Match both shiprocket_order_id and shipment_id to be safe
            const updateRes = await Order.updateOne(
                { "shipments.shiprocket_order_id": srOrderId, "shipments.shipment_id": String(shipmentId) },
                {
                    $set: {
                        "shipments.$.awb_code": awb,
                        "shipments.$.courier_name": courier,
                        "shipments.$.tracking_url": trackUrl,
                        "shipments.$.status": "AWB Assigned",
                        "orderStatus": "Shipped"
                    },
                    $push: {
                        "shipments.$.trackingHistory": trackingEntry,
                        trackingHistory: {
                            status: "AWB Assigned",
                            timestamp: new Date(),
                            location: "Shiprocket",
                            description: `Shipment ${shipmentId} AWB ${awb}`
                        }
                    }
                }
            );

            console.log(`✅ Immediate AWB saved for srOrder ${srOrderId}, shipment ${shipmentId}:`, { matched: updateRes.matchedCount, modified: updateRes.modifiedCount });
        }
    } catch (err) {
        console.warn("checkSingleShiprocketOrderAndSave err:", err.response?.data || err.message || err);
    }
}

export async function createShiprocketOrder(order) {
    if (!order) throw new Error("Order missing");

    console.log("🔥 createShiprocketOrder → order:", order._id);

    const token = await getShiprocketToken();

    // validate shipping address
    const SA = order.shippingAddress || {};
    const shippingAddress = {
        addressLine1: SA.addressLine1 || SA.address || "",
        city: SA.city || SA.town || "",
        pincode: SA.pincode ? String(SA.pincode) : "",
        state: SA.state || SA.region || "",
        phone: SA.phone || order.user?.phone || "0000000000",
        email: order.user?.email || "guest@example.com",
        name: order.customerName || order.user?.name || "Customer"
    };
    if (!shippingAddress.addressLine1 || !shippingAddress.city || !shippingAddress.pincode || !shippingAddress.state) {
        throw new Error("Invalid shipping address");
    }

    // 1) Use allocator to decide per-product -> per-warehouse mapping
    let allocationMap;
    try {
        allocationMap = await allocateWarehousesForOrder(order);
    } catch (err) {
        console.error("Allocation failed:", err.message || err);
        throw err;
    }

    // 2) Build shipments grouped by warehouseCode
    const shipmentsByWarehouse = {};
    for (const [idxStr, allocs] of Object.entries(allocationMap)) {
        const idx = Number(idxStr);
        const orderItem = order.products[idx];
        if (!orderItem) continue;
        for (const a of allocs) {
            const wh = a.warehouseCode || (process.env.DEFAULT_PICKUP_LOCATION || "DEFAULT_WH");
            if (!shipmentsByWarehouse[wh]) shipmentsByWarehouse[wh] = [];
            shipmentsByWarehouse[wh].push({
                index: idx,
                product: orderItem,
                qty: a.qty
            });
        }
    }

    // 3) For each warehouse, create Shiprocket order and collect results
    let failed = [];
    const shipmentResults = [];

    for (const [warehouseCode, items] of Object.entries(shipmentsByWarehouse)) {
        const pickup_location = process.env.SHIPROCKET_PICKUP || "Primary";
        const pickup_address_id = process.env.SHIPROCKET_PICKUP_ADDRESS_ID || null;

        // Build order_items for Shiprocket
        const order_items = [];
        const usedSkus = new Set();
        for (const it of items) {
            const p = it.product;
            const sku = p.variant?.sku || (p.productId?.variant?.sku) || `NO-SKU-${p.productId}`;
            if (usedSkus.has(sku + String(it.qty))) {
                // avoid duplicates
            } else {
                usedSkus.add(sku + String(it.qty));
                order_items.push({
                    name: (p.productId?.name) || p.name || "Product",
                    sku,
                    units: it.qty,
                    selling_price: p.price || 0
                });
            }
        }

        // Compose Shiprocket payload
        const shipmentData = {
            order_id: `${order._id.toString()}-${warehouseCode}`,
            order_date: new Date(order.createdAt || Date.now()).toISOString().slice(0, 19).replace("T", " "),
            pickup_location,
            pickup_address_id,
            billing_customer_name: shippingAddress.name,
            billing_last_name: "",
            billing_address: shippingAddress.addressLine1,
            billing_city: shippingAddress.city,
            billing_pincode: shippingAddress.pincode,
            billing_state: shippingAddress.state,
            billing_country: "India",
            billing_email: shippingAddress.email,
            billing_phone: shippingAddress.phone,
            shipping_is_billing: true,
            order_items,
            payment_method: order.paymentMethod === "COD" ? "COD" : "Prepaid",
            sub_total: order_items.reduce((s, it) => s + (it.selling_price * it.units), 0),
            length: 10,
            breadth: 10,
            height: 10,
            weight: Math.max(0.1, order_items.length * 0.2)
        };

        try {
            // Create Shiprocket adhoc order
            const orderRes = await shiprocketRequest("https://apiv2.shiprocket.in/v1/external/orders/create/adhoc", "post", shipmentData, token);
            console.log("🔥 RAW SHIPROCKET RESPONSE:", orderRes.data);

            const shiprocketOrderId = orderRes.data?.id || orderRes.data?.order_id || null;
            const shipmentId = orderRes.data?.shipment_id || orderRes.data?.shipmentId || null;

            if (!shipmentId) {
                console.error("❌ No shipment_id returned from Shiprocket");
                shipmentResults.push({ warehouseCode, status: "Failed", error: "No shipment_id returned" });
                continue;
            }

            // 🚀 **REMOVED AWB ASSIGNMENT - TRACKING JOB WILL HANDLE IT**
            console.log(`✅ Shiprocket order created: ${shipmentId}`);
            console.log(`📦 AWB will be assigned automatically within 5-15 minutes`);

            // 🚀 **SIMPLE SHIPMENT DOCUMENT**
            const trackingHistory = [
                {
                    status: "Order Confirmed",
                    timestamp: new Date(),
                    location: "Shiprocket",
                    description: "Shipment created - AWB assignment in progress"
                }
            ];

            const shipmentDoc = {
                _id: new mongoose.Types.ObjectId(),
                warehouseCode,
                pickup_location,
                pickup_address_id,
                shiprocket_order_id: orderRes.data?.id,  // real ID for tracking
                shipment_id: shipmentId,
                awb_code: null, // Will be populated by tracking job
                courier_name: null, // Will be populated by tracking job
                tracking_url: null, // Will be populated by tracking job
                status: "Awaiting Pickup",
                assignedAt: new Date(),
                expected_delivery: calculateExpectedDelivery(),
                products: items.map(it => ({
                    productId: it.product.productId._id || it.product.productId,
                    quantity: it.qty,
                    price: it.product.price,
                    variant: it.product.variant
                })),
                trackingHistory
            };

            shipmentResults.push({ success: true, doc: shipmentDoc });
            console.log(`✅ Shipment document created for warehouse ${warehouseCode}`);

        } catch (err) {
            console.error("❌ Shiprocket create error for warehouse", warehouseCode, err.response?.data || err.message || err);
            failed.push({ warehouseCode, error: err.message });
        }
    }

    // 🚀 **GUARANTEED DATABASE UPDATE**
    const successfulShipments = shipmentResults
        .filter(s => s.success)
        .map(s => s.doc);

    console.log(`🔥 FINAL SHIPROCKET RESULT for order ${order._id}:`, {
        successfulShipments: successfulShipments.length,
        failed: failed.length
    });

    if (successfulShipments.length > 0) {
        try {
            const updateResult = await Order.updateOne(
                { _id: order._id },
                {
                    $push: {
                        shipments: { $each: successfulShipments },
                        trackingHistory: {
                            status: "Shipments Created",
                            timestamp: new Date(),
                            location: "Shiprocket",
                            description: `${successfulShipments.length} shipment(s) created`
                        }
                    },
                    $set: {
                        primary_shipment: successfulShipments[0]?._id || null,
                        orderStatus: "Processing"
                    }
                }
            );

            // After the DB update succeeded (inside the try that updates DB):
            // Trigger an immediate one-off tracking check for these shipments to speed up AWB recovery
            try {
                // small helper to fetch right away for these shiprocket order ids
                const srIds = successfulShipments.map(s => s.shiprocket_order_id).filter(Boolean);
                for (const srId of srIds) {
                    // small delay between each to be polite (optional)
                    await checkSingleShiprocketOrderAndSave(srId);
                }
            } catch (e) {
                console.warn("Immediate AWB check failed (non-blocking):", e.message || e);
            }

            console.log(`✅ DATABASE UPDATE SUCCESS:`, {
                orderId: order._id,
                matched: updateResult.matchedCount,
                modified: updateResult.modifiedCount,
                shipmentsAdded: successfulShipments.length
            });

        } catch (dbError) {
            console.error(`❌ DATABASE UPDATE FAILED:`, dbError.message);
            throw new Error(`Failed to save shipments to database: ${dbError.message}`);
        }
    } else {
        console.error(`❌ NO SUCCESSFUL SHIPMENTS for order ${order._id}`);
        throw new Error("All shipment creations failed");
    }

    return { shipments: successfulShipments, failed };
}

// Helper function to calculate expected delivery
function calculateExpectedDelivery() {
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 7); // 7 days from now
    return deliveryDate;
}

export async function cancelShiprocketShipment(shiprocketOrderId) {
    const token = await getShiprocketToken();

    const payload = {
        ids: [Number(shiprocketOrderId)]
    };

    try {
        const res = await shiprocketRequest(
            "https://apiv2.shiprocket.in/v1/external/orders/cancel",
            "post",
            payload,
            token
        );
        return res.data;
    } catch (err) {
        console.error("❌ Shiprocket API Error:", err.response?.data || err.message);
        throw err;
    }
}

// 🔍 Track shipment by AWB
export async function trackShiprocketShipmentByAWB(awbCode) {
    const token = await getShiprocketToken();
    try {
        const res = await axios.get(
            `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awbCode}`,
            { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
        );
        return res.data;
    } catch (err) {
        console.error("❌ Shiprocket AWB Tracking Failed:", err.response?.data || err.message);
        throw err;
    }
}

// 🔍 Track shipment by shipment ID
export async function trackShiprocketShipment(shipmentId) {
    const token = await getShiprocketToken();
    const res = await axios.get(
        `https://apiv2.shiprocket.in/v1/external/courier/track/shipment/${shipmentId}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data;
}

// 🧾 Label + Invoice download
export async function getShiprocketDocuments(shipmentId) {
    const token = await getShiprocketToken();
    const [label, invoice] = await Promise.all([
        axios.get(`https://apiv2.shiprocket.in/v1/external/courier/label/print?shipment_id=${shipmentId}`, {
            headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`https://apiv2.shiprocket.in/v1/external/courier/invoice/print?ids=${shipmentId}`, {
            headers: { Authorization: `Bearer ${token}` },
        }),
    ]);
    return { label: label.data, invoice: invoice.data };
}

// 🧰 Helpers
async function saveDebugLog(order, step, payload, err) {
    await Order.updateOne(
        { _id: order._id },
        {
            $push: {
                "debugLogs": {
                    step,
                    payload,
                    response: err.response?.data || err.message,
                    createdAt: new Date(),
                },
            },
        }
    );
}

export async function retryFailedShipments(maxRetries = 3) {
    // Find orders with failed shipment statuses
    const failedOrders = await Order.find({
        "shipments.status": {
            $in: ["Failed", "Created (AWB not assigned)", "Awaiting Pickup"]
        },
        orderStatus: { $ne: "Cancelled" }
    });

    if (!failedOrders.length) return console.log("✅ No failed shipments to retry.");

    for (const order of failedOrders) {
        try {
            // Initialize retryCount if not present
            order.retryCount = order.retryCount || 0;

            if (order.retryCount >= maxRetries) {
                console.log(`❌ Order ${order._id} reached max retry attempts (${maxRetries}). Skipping.`);
                continue;
            }

            console.log(`🔁 Retrying shipment for order ${order._id} (Attempt ${order.retryCount + 1})`);

            // Retry shipment creation
            const res = await createShiprocketOrder(order);

            console.log("✅ Retried successfully:", res.shipments.length, "shipments created");

            // Update order with latest shipment info & increment retry count
            order.retryCount = (order.retryCount || 0) + 1;
            order.lastRetryAt = new Date();

            // Save to DB
            await order.save();
        } catch (err) {
            console.error("🚨 Retry failed for order", order._id, ":", err.response?.data || err.message);

            // Push debug log
            await Order.updateOne(
                { _id: order._id },
                {
                    $push: {
                        "debugLogs": {
                            step: "Retry Failed",
                            response: err.response?.data || err.message,
                            retryCount: (order.retryCount || 0) + 1,
                            createdAt: new Date()
                        }
                    }
                }
            );

            // Increment retry count even on failure
            order.retryCount = (order.retryCount || 0) + 1;
            await order.save();
        }
    }
}

export async function validatePincodeServiceability(pincode, cod = true) {
    const token = await getShiprocketToken();

    const pickup_postcode = process.env.SHIPROCKET_PICKUP_PIN || "110030";
    const weight = 0.5;
    const codFlag = cod ? 1 : 0;

    const url = `https://apiv2.shiprocket.in/v1/external/courier/serviceability/?pickup_postcode=${pickup_postcode}&delivery_postcode=${String(
        pincode
    ).trim()}&weight=${weight}&cod=${codFlag}`;

    try {
        const res = await axios.get(url, {
            headers: { Authorization: `Bearer ${token}` },
        });

        const couriers = res.data?.data?.available_courier_companies || [];

        if (couriers.length === 0) {
            return { serviceable: false, couriers: [] };
        }

        return {
            serviceable: true,
            couriers: couriers.map((c) => ({
                name: c.courier_name,
                etd: c.etd,
                cod: c.cod,
            })),
        };
    } catch (err) {
        console.error(
            "❌ Shiprocket Pincode Validation Failed:",
            err.response?.data || err.message
        );
        throw new Error("Failed to validate pincode via Shiprocket");
    }
}