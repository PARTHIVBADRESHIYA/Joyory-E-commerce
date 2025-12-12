
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
            const { awb, courier, trackUrl } = extractAWBFromShiprocket(shipOrder, srShipment);


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

            // Find the local order that contains this shiprocket id / shipment id
            const orderDoc = await Order.findOne(
                {
                    $or: [
                        { "shipments.shiprocket_order_id": srOrderId },
                        { "shipments.shipment_id": String(shipmentId) }
                    ]
                },
                { _id: 1 }
            );

            if (!orderDoc) {
                console.warn(`⚠️ No local order found for srOrderId=${srOrderId} / shipmentId=${shipmentId} — skipping AWB save`);
                continue; // move to next srShipment
            }

            // Now update the specific order's matching shipment element (use $or so either field matches)
            const updateRes = await Order.updateOne(
                {
                    _id: orderDoc._id,
                    "shipments.shipment_id": String(shipmentId)
                }
                ,
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
            order_id: `${order.orderId}-${warehouseCode}`,
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

export async function cancelPickup(shiprocketOrderId) {
    const token = await getShiprocketToken();

    try {
        const response = await axios({
            url: "https://apiv2.shiprocket.in/v1/external/orders/cancel/pickup",
            method: "POST",
            data: {
                shipment_id: [shiprocketOrderId]
            },
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data;
    } catch (error) {
        console.error("Shiprocket pickup cancellation failed:", error.response?.data || error.message);
        throw new Error(`Shiprocket API Error: ${error.message}`);
    }
}

export const createShiprocketReturnOrder = async (order, returnRequest) => {
    if (!order) throw new Error("Order document is required");
    if (!returnRequest || !Array.isArray(returnRequest.items) || returnRequest.items.length === 0) {
        throw new Error("Invalid returnRequest: items required");
    }

    console.log("🔥 createShiprocketReturnOrder → order:", order._id, "returnRequest:", returnRequest._id);

    const orderId = order._id.toString();
    const retId = returnRequest._id.toString();

    // ------------------------------------------------------
    // 0. CHECK FOR DUPLICATION - FIX FOR PROBLEM 2
    // ------------------------------------------------------
    const existingReturns = await Order.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(orderId) } },
        { $unwind: "$shipments" },
        { $unwind: "$shipments.returns" },
        { $match: { "shipments.returns._id": new mongoose.Types.ObjectId(retId) } },
        { $project: { return: "$shipments.returns" } }
    ]);

    if (existingReturns && existingReturns.length > 0) {
        const existingReturn = existingReturns[0].return;
        
        // If already has Shiprocket IDs, skip creation
        if (existingReturn.shiprocket_order_id || existingReturn.shipment_id) {
            console.log("⚠️ Return already exists in Shiprocket → Skipping creation");
            return existingReturn;
        }
        
        // If exists but no Shiprocket IDs, use this return document
        console.log("ℹ️ Return exists in DB but no Shiprocket IDs → Will update");
    }

    // ------------------------------------------------------
    // 1. GET SHIPROCKET TOKEN
    // ------------------------------------------------------
    const token = await getShiprocketToken();
    if (!token) throw new Error("Unable to get Shiprocket token");

    // ------------------------------------------------------
    // 2. PREPARE ADDRESSES - FIXED
    // ------------------------------------------------------
    const SA = order.shippingAddress || {};
    const orderUser = order.user || {};
    
    // Pickup address (customer)
    const pickup = {
        pickup_customer_name: order.customerName || orderUser.name || "Customer",
        pickup_last_name: "",
        pickup_address: SA.addressLine1 || SA.address || "",
        pickup_city: SA.city || "",
        pickup_state: SA.state || "",
        pickup_country: "India",
        pickup_pincode: String(SA.pincode || ""),
        pickup_email: orderUser.email || "customer@example.com",
        pickup_phone: SA.phone || orderUser.phone || "0000000000"
    };

    // Warehouse address (from env)
    const W = JSON.parse(process.env.WAREHOUSE_JSON || '{}');
    const shipping = {
        shipping_customer_name: W.name || "Warehouse Manager",
        shipping_last_name: "",
        shipping_address: W.address || "Warehouse Address",
        shipping_city: W.city || "Mumbai",
        shipping_state: W.state || "Maharashtra",
        shipping_country: "India",
        shipping_pincode: String(W.pincode || "400001"),
        shipping_email: W.email || "warehouse@example.com",
        shipping_phone: W.phone || "9999999999"
    };

    // ------------------------------------------------------
    // 3. PREPARE ITEMS - FIXED
    // ------------------------------------------------------
    const order_items = returnRequest.items.map(it => ({
        name: it.name || it.variant?.name || "Return Item",
        sku: it.variant?.sku || `RETURN-${it.productId}`,
        units: Number(it.quantity) || 1,
        selling_price: 0.01  // Minimum price for Shiprocket
    }));

    // ------------------------------------------------------
    // 4. CREATE SHIPROCKET RETURN ORDER - FIXED PAYLOAD
    // ------------------------------------------------------
    const orderDate = new Date().toISOString().slice(0, 19).replace("T", " ");
    
    const payload = {
        order_id: `RET-${order.orderId}-${Date.now()}`.substring(0, 48),
        order_date: orderDate,
        channel_id: "",  // Optional
        pickup_location: process.env.SHIPROCKET_PICKUP || "Primary",
        ...pickup,
        ...shipping,
        order_items,
        payment_method: "Prepaid",  // Return is always prepaid
        total_discount: 0,
        sub_total: 0.01,  // Minimum amount
        length: 10,
        breadth: 10,
        height: 10,
        weight: 0.5
    };

    console.log("📦 Shiprocket Return Payload:", JSON.stringify(payload, null, 2));

    let srResponse;
    try {
        srResponse = await axios.post(
            "https://apiv2.shiprocket.in/v1/external/orders/create/return",
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );
    } catch (error) {
        console.error("❌ Shiprocket API Error:", error.response?.data || error.message);
        throw new Error(`Shiprocket API failed: ${error.response?.data?.message || error.message}`);
    }

    const srData = srResponse.data;
    console.log("✅ Shiprocket Return Response:", srData);

    if (!srData.order_id) {
        throw new Error("Shiprocket did not return order_id");
    }

    const shiprocketOrderId = srData.order_id;
    const shiprocketShipmentId = srData.shipment_id;
    const now = new Date();

    // ------------------------------------------------------
    // 5. CREATE RETURN DOCUMENT - FIXED STRUCTURE
    // ------------------------------------------------------
    const returnDoc = {
        _id: new mongoose.Types.ObjectId(retId),
        shiprocket_order_id: shiprocketOrderId,
        shipment_id: shiprocketShipmentId,
        awb_code: null,  // Will be set by cron
        courier_name: null, // Will be set by cron
        tracking_url: null, // Will be set by cron
        status: "requested",
        pickup_details: {
            name: pickup.pickup_customer_name,
            address: pickup.pickup_address,
            city: pickup.pickup_city,
            state: pickup.pickup_state,
            pincode: pickup.pickup_pincode,
            phone: pickup.pickup_phone,
            email: pickup.pickup_email
        },
        warehouse_details: {
            name: shipping.shipping_customer_name,
            address: shipping.shipping_address,
            city: shipping.shipping_city,
            state: shipping.shipping_state,
            pincode: shipping.shipping_pincode,
            phone: shipping.shipping_phone,
            email: shipping.shipping_email
        },
        items: returnRequest.items.map(it => ({
            productId: it.productId,
            quantity: it.quantity,
            variant: it.variant,
            reason: it.reason,
            reasonDescription: it.reasonDescription,
            images: it.images || [],
            condition: it.condition || "unknown"
        })),
        tracking_history: [{
            status: "Return Created",
            timestamp: now,
            location: "System",
            description: "Return order created in Shiprocket"
        }],
        audit_trail: [{
            status: "created",
            action: "shiprocket_return_created",
            timestamp: now,
            performedBy: returnRequest.requestedBy || order.user?._id,
            performedByModel: "User",
            notes: `Return created in Shiprocket. Order ID: ${shiprocketOrderId}`
        }],
        createdAt: now,
        requestedBy: returnRequest.requestedBy,
        requestedAt: returnRequest.requestedAt,
        reason: returnRequest.reason,
        description: returnRequest.description
    };

    // ------------------------------------------------------
    // 6. UPDATE DATABASE - FIXED: ONLY UPDATE ONE SHIPMENT
    // ------------------------------------------------------
    // Find which shipment to attach return to (primary or first shipment)
    const shipmentToUpdate = order.shipments.find(s => s._id.toString() === order.primary_shipment?.toString()) 
                           || order.shipments[0];
    
    if (!shipmentToUpdate) {
        throw new Error("No shipment found to attach return");
    }

    // Remove any existing return with same ID (prevent duplicates)
    await Order.updateOne(
        { _id: orderId, "shipments._id": shipmentToUpdate._id },
        { $pull: { "shipments.$.returns": { _id: new mongoose.Types.ObjectId(retId) } } }
    );

    // Add the new return document
    const updateResult = await Order.updateOne(
        { _id: orderId, "shipments._id": shipmentToUpdate._id },
        {
            $push: { "shipments.$.returns": returnDoc },
            $set: { 
                "returnRequest.status": "approved",
                "returnRequest.approvedAt": now 
            }
        }
    );

    if (updateResult.modifiedCount === 0) {
        throw new Error("Failed to update order with return");
    }

    console.log("✅ Return created successfully in Shiprocket and database");
    
    return {
        ...returnDoc,
        order_id: shiprocketOrderId,
        shipment_id: shiprocketShipmentId
    };
};

// export const createShiprocketReturnOrder = async (order, returnRequest) => {
//     if (!order) throw new Error("Order document is required");
//     if (!returnRequest || !Array.isArray(returnRequest.items) || returnRequest.items.length === 0) {
//         throw new Error("Invalid returnRequest: items required");
//     }

//     const orderId = order._id.toString();
//     const retId = returnRequest._id.toString();

//     // ------------------------------------------------------
//     // 0. CHECK IF THIS RETURN ALREADY EXISTS (NO DUPLICATES)
//     // ------------------------------------------------------
//     const existingRet = await Order.findOne(
//         {
//             _id: orderId,
//             "shipments.returns._id": retId
//         },
//         { "shipments.returns.$": 1 }
//     );

//     if (existingRet?.shipments[0]?.returns?.length) {
//         const r = existingRet.shipments[0].returns[0];

//         // Already created in Shiprocket
//         if (r.return_order_id && r.return_shipment_id) {
//             console.log("⚠ Return already created — skipping new Shiprocket call");
//             return r;
//         }
//     }

//     // -------------------------------------------
//     // 1. SHIPROCKET TOKEN
//     // -------------------------------------------
//     const token = await getShiprocketToken();
//     if (!token) throw new Error("Unable to get Shiprocket token");

//     const orderSafe = order.toObject({ depopulate: true });

//     // -------------------------------------------
//     // 2. PICKUP (CUSTOMER ADDRESS)
//     // -------------------------------------------
//     const SA = orderSafe.shippingAddress;
//     const pickup = {
//         pickup_customer_name: orderSafe.user?.name || "Customer",
//         pickup_last_name: "",
//         pickup_address: SA.addressLine1,
//         pickup_city: SA.city,
//         pickup_state: SA.state,
//         pickup_country: "India",
//         pickup_pincode: SA.pincode,
//         pickup_email: orderSafe.user?.email,
//         pickup_phone: orderSafe.user?.phone
//     };

//     // -------------------------------------------
//     // 3. WAREHOUSE / RETURN ADDRESS
//     // -------------------------------------------
//     let W = {};
//     try { W = JSON.parse(process.env.WAREHOUSE_JSON || "{}"); } catch (err) {}

//     const shipping = {
//         shipping_customer_name: W.name || "Warehouse",
//         shipping_last_name: "",
//         shipping_address: W.address,
//         shipping_city: W.city,
//         shipping_state: W.state,
//         shipping_country: W.country || "India",
//         shipping_pincode: W.pincode,
//         shipping_email: W.email,
//         shipping_phone: W.phone
//     };

//     // -------------------------------------------
//     // 4. ITEMS
//     // -------------------------------------------
//     const items = returnRequest.items.map(it => ({
//         name: it.variant?.name || it.name || "Returned Item",
//         sku: it.variant?.sku || `SKU-${it.productId}`,
//         units: Number(it.quantity),
//         selling_price: 0
//     }));

//     // -------------------------------------------
//     // 5. PAYLOAD
//     // -------------------------------------------
//     const payload = {
//         order_id: `RET-${orderSafe.orderId}-${retId}`.slice(0, 48),
//         order_date: new Date().toISOString().slice(0, 19).replace("T", " "),
//         pickup_location: process.env.SHIPROCKET_PICKUP || "Primary",
//         ...pickup,
//         ...shipping,
//         order_items: items,
//         payment_method: "Prepaid",
//         sub_total: 0,
//         length: 10,
//         breadth: 10,
//         height: 10,
//         weight: Math.max(0.3, items.length * 0.25)
//     };

//     // -------------------------------------------
//     // 6. CALL SHIPROCKET
//     // -------------------------------------------
//     const srRes = await shiprocketRequest(
//         "https://apiv2.shiprocket.in/v1/external/orders/create/return",
//         "post",
//         payload,
//         token
//     );

//     const sr = srRes.data || {};
//     if (!sr.order_id || !sr.shipment_id) {
//         throw new Error("Shiprocket did not return order_id or shipment_id");
//     }

//     const shiprocketReturnOrderId = sr.order_id;
//     const shiprocketReturnShipmentId = sr.shipment_id;
//     const now = new Date();

//     // -------------------------------------------
//     // 7. AT THIS POINT — WE DO NOT CREATE NEW DOC
//     // WE UPDATE THE EXISTING RETURN ENTRY ONLY
//     // -------------------------------------------
//     const update = await Order.updateOne(
//         {
//             _id: orderId,
//             "shipments.returns._id": retId
//         },
//         {
//             $set: {
//                 "shipments.$[ship].returns.$[ret].return_order_id": shiprocketReturnOrderId,
//                 "shipments.$[ship].returns.$[ret].return_shipment_id": shiprocketReturnShipmentId,
//                 "shipments.$[ship].returns.$[ret].status": "Return Created",
//                 "shipments.$[ship].returns.$[ret].assignedAt": now,
//                 "shipments.$[ship].returns.$[ret].trackingHistory.0": {
//                     status: "Return Created",
//                     timestamp: now,
//                     location: "System",
//                     description: "Return created in Shiprocket"
//                 }
//             },
//             $push: {
//                 "shipments.$[ship].returns.$[ret].auditTrail": {
//                     status: "Return Created",
//                     action: "shiprocket_return_created",
//                     timestamp: now,
//                     performedBy: returnRequest.requestedBy || orderSafe.user?._id,
//                     performedByModel: "User"
//                 }
//             }
//         },
//         {
//             arrayFilters: [
//                 { "ship.shipment_id": returnRequest.shipment_id },
//                 { "ret._id": retId }
//             ]
//         }
//     );

//     if (update.matchedCount === 0) {
//         throw new Error("Return entry not found for update — cannot attach Shiprocket IDs");
//     }

//     console.log("✔ Shiprocket return IDs attached");

//     // -------------------------------------------
//     // 8. RETURN FINAL UPDATED DATA
//     // -------------------------------------------
//     return {
//         return_order_id: shiprocketReturnOrderId,
//         return_shipment_id: shiprocketReturnShipmentId
//     };
// };



// export const createShiprocketReturnOrder = async (order, returnRequest) => {
//     if (!order) throw new Error("Order document is required");
//     if (!returnRequest || !Array.isArray(returnRequest.items) || returnRequest.items.length === 0) {
//         throw new Error("Invalid returnRequest: items required");
//     }

//     // Defensive token fetch
//     const token = await getShiprocketToken();
//     if (!token) throw new Error("Unable to get Shiprocket token");

//     // Work with a safe clone of the order for reading only
//     const orderSafe = order.toObject ? order.toObject({ depopulate: true }) : JSON.parse(JSON.stringify(order));

//     // Normalize shipping address from clone
//     const SA = orderSafe.shippingAddress || {};
//     const addressLine1 = SA.addressLine1 || SA.address || SA.address_line1 || "";
//     const city = SA.city || SA.town || "";
//     const state = SA.state || SA.region || "";
//     const pincode = (SA.pincode || SA.pin || SA.zip || "") + "";
//     const phone = SA.phone || SA.mobile || orderSafe.user?.phone || "0000000000";
//     const email = orderSafe.user?.email || SA.email || "no-reply@yourdomain.com";

//     if (!addressLine1 || !city || !state || !pincode) {
//         throw new Error("Invalid shipping address for return pickup");
//     }

//     const pickup = {
//         pickup_customer_name: `${orderSafe.user?.name || "Customer"}`.slice(0, 50),
//         pickup_last_name: "",
//         pickup_address: addressLine1,
//         pickup_city: city,
//         pickup_state: state,
//         pickup_country: "India",
//         pickup_pincode: pincode,
//         pickup_email: email,
//         pickup_phone: phone,
//     };

//     let W = {};
//     try { W = JSON.parse(process.env.WAREHOUSE_JSON || "{}"); } catch (err) { W = {}; console.warn("WAREHOUSE_JSON parse failed"); }

//     const shipping = {
//         shipping_customer_name: W?.name || "Warehouse",
//         shipping_last_name: "",
//         shipping_address: W?.address || "",
//         shipping_city: W?.city || "",
//         shipping_state: W?.state || "",
//         shipping_country: W?.country || "India",
//         shipping_pincode: W?.pincode || "",
//         shipping_email: W?.email || "support@yourdomain.com",
//         shipping_phone: W?.phone || "",
//     };

//     const order_items = returnRequest.items.map((it) => ({
//         name: it.variant?.name || it.name || "Returned Product",
//         sku: it.variant?.sku || `NO-SKU-${it.productId}`,
//         units: Number(it.quantity || 1),
//         selling_price: 0,
//     }));

//     const baseOrderId = `${orderSafe.orderId || orderSafe._id}`.toString();
//     const rsRid = `${returnRequest._id || new mongoose.Types.ObjectId()}`.toString();
//     const order_id = `RET-${baseOrderId}-${rsRid}`.slice(0, 48);

//     const payload = {
//         order_id,
//         order_date: new Date().toISOString().slice(0, 19).replace("T", " "),
//         pickup_location: process.env.SHIPROCKET_PICKUP || "Primary",
//         ...pickup,
//         ...shipping,
//         order_items,
//         payment_method: "Prepaid",
//         sub_total: 0,
//         length: 10,
//         breadth: 10,
//         height: 10,
//         weight: Math.max(0.1, order_items.length * 0.2),
//     };

//     try {
//         const res = await shiprocketRequest(
//             "https://apiv2.shiprocket.in/v1/external/orders/create/return",
//             "post",
//             payload,
//             token
//         );

//         const data = res?.data ?? {};
//         const payloadResp = data.data ?? data;

//         const shiprocketOrderId =
//             payloadResp?.id || payloadResp?.order_id || payloadResp?.shiprocket_order_id || null;
//         const shipmentId =
//             payloadResp?.shipment_id || payloadResp?.shipmentId || payloadResp?.id || null;

//         if (!shipmentId) {
//             console.warn("createShiprocketReturnOrder: Shiprocket did not return shipment_id immediately.");
//         }

//         // Build returnDoc locally (do NOT mutate order)
//         const now = new Date();
//         const returnDoc = {
//             _id: new mongoose.Types.ObjectId(),
//             shiprocket_order_id: shiprocketOrderId || null,
//             shipment_id: shipmentId || null,
//             awb_code: null,
//             courier_name: null,
//             tracking_url: null,
//             status: "Awaiting Pickup",
//             assignedAt: now,
//             pickupDetails: {
//                 name: pickup.pickup_customer_name,
//                 address: pickup.pickup_address,
//                 city: pickup.pickup_city,
//                 state: pickup.pickup_state,
//                 pincode: pickup.pickup_pincode,
//                 phone: pickup.pickup_phone,
//                 email: pickup.pickup_email,
//             },
//             warehouse_details: {
//                 name: shipping.shipping_customer_name,
//                 address: shipping.shipping_address,
//                 city: shipping.shipping_city,
//                 state: shipping.shipping_state,
//                 pincode: shipping.shipping_pincode,
//                 phone: shipping.shipping_phone,
//                 email: shipping.shipping_email,
//             },
//             items: returnRequest.items,
//             trackingHistory: [
//                 {
//                     status: "Return Created",
//                     timestamp: now,
//                     location: "System",
//                     description: `Return request ${returnRequest._id || rsRid} created`
//                 }
//             ],
//             auditTrail: [
//                 {
//                     status: "Awaiting Pickup",
//                     action: "return_created",
//                     performedBy: returnRequest.requestedBy || orderSafe.user?._id || null,
//                     performedByModel: returnRequest.requestedBy ? "User" : "Admin",
//                     notes: "Return order created and return request saved",
//                     timestamp: now
//                 }
//             ],
//             refund: { amount: 0, status: null, initiatedAt: null },
//             createdAt: now,
//             requestedBy: returnRequest.requestedBy || orderSafe.user?._id || null,
//             requestedAt: returnRequest.requestedAt || now,
//             reason: returnRequest.reason || "",
//             description: returnRequest.description || ""
//         };

//         // Determine target shipment id (string) that we want to attach into
//         let targetShipmentId = null;
//         if (returnRequest.shipment_id) targetShipmentId = String(returnRequest.shipment_id);
//         else if (orderSafe.primary_shipment) targetShipmentId = String(orderSafe.primary_shipment);
//         else if (Array.isArray(orderSafe.shipments) && orderSafe.shipments.length > 0) {
//             const first = orderSafe.shipments[0];
//             targetShipmentId = String(first._id || first.shipment_id || "");
//         }

//         // Attempt atomic updates in order of specificity (by shipment _id, by shipment_id, fallback to pushing to first shipment)
//         let updateRes = null;

//         if (!Array.isArray(orderSafe.shipments) || orderSafe.shipments.length === 0) {
//             // no shipments: create minimal shipment containing this return
//             const minimalShipment = {
//                 _id: new mongoose.Types.ObjectId(),
//                 shipment_id: shipmentId || `gen-${new mongoose.Types.ObjectId()}`,
//                 products: [],
//                 trackingHistory: [], // ensure forward timeline exists
//                 returns: [returnDoc]
//             };

//             updateRes = await Order.updateOne(
//                 { _id: orderSafe._id },
//                 { $push: { shipments: minimalShipment }, $inc: { "returnStats.totalReturns": 1 } }
//             );
//         } else {
//             const attempts = [];

//             if (targetShipmentId) {
//                 // attempt match by shipments._id (ObjectId)
//                 if (mongoose.Types.ObjectId.isValid(targetShipmentId)) {
//                     attempts.push({
//                         filter: {
//                             _id: orderSafe._id, "shipments._id": new mongoose.Types.ObjectId(targetShipmentId)
//                         },
//                         update: { $push: { "shipments.$.returns": returnDoc }, $inc: { "returnStats.totalReturns": 1 } }
//                     });
//                 }

//                 // attempt match by shipments.shipment_id (string)
//                 attempts.push({
//                     filter: { _id: orderSafe._id, "shipments.shipment_id": targetShipmentId },
//                     update: { $push: { "shipments.$.returns": returnDoc }, $inc: { "returnStats.totalReturns": 1 } }
//                 });
//             }

//             // final fallback: push to the first shipment index (shipments.0)
//             attempts.push({
//                 filter: { _id: orderSafe._id },
//                 update: { $push: { "shipments.0.returns": returnDoc }, $inc: { "returnStats.totalReturns": 1 } }
//             });

//             for (const a of attempts) {
//                 try {
//                     updateRes = await Order.updateOne(a.filter, a.update);
//                     // modern mongoose returns matchedCount/modifiedCount; older drivers may use nModified
//                     if (updateRes?.modifiedCount || updateRes?.nModified || updateRes?.modifiedCount === 1) break;
//                 } catch (uerr) {
//                     // ignore and try next attempt
//                     continue;
//                 }
//             }
//         }

//         // If still nothing modified (rare), fallback to findOneAndUpdate (safe atomic)
//         if (!updateRes || (updateRes.matchedCount === 0 && updateRes.modifiedCount === 0 && updateRes.nModified !== 1)) {
//             const fallback = await Order.findOneAndUpdate(
//                 { _id: orderSafe._id },
//                 { $push: { "shipments.0.returns": returnDoc }, $inc: { "returnStats.totalReturns": 1 } },
//                 { new: true }
//             );
//             if (!fallback) throw new Error("Unable to attach return to order (fallback failed)");
//         }

//         console.log(`✅ Shiprocket return order created: shipmentId=${shipmentId} | shiprocketOrderId=${shiprocketOrderId}`);

//         // Non-blocking immediate check if helper exists
//         try {
//             const srId = shiprocketOrderId || shipmentId;
//             if (srId && typeof checkSingleShiprocketOrderAndSave === "function") {
//                 await checkSingleShiprocketOrderAndSave(srId);
//             }
//         } catch (e) {
//             console.warn("Immediate return AWB check failed (non-blocking):", e.message || e);
//         }

//         return returnDoc;
//     } catch (err) {
//         console.error("❌ Shiprocket return order creation failed:", err?.response?.data || err.message || err);
//         throw err;
//     }
// };