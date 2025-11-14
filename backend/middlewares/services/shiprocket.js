// services/shiprocket.js
import axios from "axios";
import Order from "../../models/Order.js";

let shiprocketToken = null;
let tokenExpiry = null;

const DEBUG_SHIPROCKET = process.env.DEBUG_SHIPROCKET === "true";
function logDebug(...args) {
    if (DEBUG_SHIPROCKET) console.log("[Shiprocket Debug]", ...args);
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

export async function createShiprocketOrder(order) {
    const token = await getShiprocketToken();

    if (
        !order.shippingAddress?.addressLine1 ||
        !order.shippingAddress?.city ||
        !order.shippingAddress?.pincode ||
        !order.shippingAddress?.state
    ) throw new Error("Invalid shipping address");

    if (!order.products?.length) throw new Error("No products found in order");

    // ✅ Build Shiprocket order_items with safe SKU deduplication
    const orderItems = [];
    const usedSkus = new Set();

    for (const item of order.products) {
        const sku = item.variant?.sku || "NO-SKU";

        if (usedSkus.has(sku)) {
            console.warn(`⚠️ Duplicate SKU removed from Shiprocket payload: ${sku}`);
            continue;
        }

        usedSkus.add(sku);

        orderItems.push({
            name: item.productId?.name || item.name || "Product",
            sku,
            units: item.quantity,
            selling_price: item.price || 0,
        });
    }

    const shipmentData = {
        order_id: order._id.toString(),
        order_date: new Date(order.createdAt).toISOString().slice(0, 19).replace("T", " "),
        pickup_location: process.env.SHIPROCKET_PICKUP || "Primary",
        billing_customer_name: order.customerName || order.user?.name || "Guest",
        billing_last_name: "",
        billing_address: order.shippingAddress.addressLine1,
        billing_city: order.shippingAddress.city,
        billing_pincode: order.shippingAddress.pincode,
        billing_state: order.shippingAddress.state,
        billing_country: "India",
        billing_email: order.user?.email || "guest@example.com",
        billing_phone: order.shippingAddress?.phone || order.user?.phone || "9876543210",
        shipping_is_billing: true,

        // ✅ Replace old mapping with our deduplicated array
        order_items: orderItems,

        payment_method: order.paymentMethod === "COD" ? "COD" : "Prepaid",
        sub_total: order.amount,
        length: 10,
        breadth: 10,
        height: 10,
        weight: 1,
    };

    // STEP 1: Create order
    let orderRes;
    try {
        orderRes = await shiprocketRequest(
            "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
            "post",
            shipmentData,
            token
        );
    } catch (err) {
        await saveDebugLog(order, "Order Create Failed", shipmentData, err);
        throw new Error("Shiprocket order creation failed");
    }

    const shiprocketOrderId = orderRes.data?.order_id;
    const shipmentId = orderRes.data?.shipment_id;
    if (!shipmentId) {
        return partialReturn(order, shiprocketOrderId, "Created (No Shipment ID)");
    }

    // STEP 2: Assign AWB
    let awbRes;
    try {
        awbRes = await shiprocketRequest(
            "https://apiv2.shiprocket.in/v1/external/courier/assign/awb",
            "post",
            { shipment_id: shipmentId },
            token
        );
    } catch (err) {
        await saveDebugLog(order, "AWB Assign Failed", { shipment_id: shipmentId }, err);
        return partialReturn(order, shiprocketOrderId, "Created (AWB not assigned)", shipmentId);
    }

    const awbData = awbRes.data?.response?.data;
    const awbCode = awbData?.awb_code || null;
    const courierName = awbData?.courier_name || null;

    const trackingUrl = awbCode
        ? `https://shiprocket.co/tracking/${awbCode}`
        : null;

    // STEP 3: Schedule Pickup 🚚
    let pickupRes;
    try {
        pickupRes = await shiprocketRequest(
            "https://apiv2.shiprocket.in/v1/external/courier/generate/pickup",
            "post",
            { shipment_id: [shipmentId] },
            token
        );
    } catch (err) {
        await saveDebugLog(order, "Pickup Schedule Failed", { shipment_id: shipmentId }, err);
    }

    const shipmentDetails = {
        shiprocket_order_id: shiprocketOrderId,
        shipment_id: shipmentId,
        awb_code: awbCode,
        courier_company_id: awbData?.courier_company_id || null,
        courier_name: courierName,
        tracking_url: trackingUrl,
        status: pickupRes?.data?.pickup_scheduled
            ? "Pickup Scheduled"
            : "Awaiting Pickup",
        assignedAt: new Date(),
    };


    await Order.findByIdAndUpdate(order._id, {
        shipment: shipmentDetails,
        orderStatus: shipmentDetails.status,
        $push: {
            trackingHistory: {
                status: shipmentDetails.status,
                timestamp: new Date(),
                location: shipmentDetails.courier_name || "Shiprocket",
            },
        },
    });


    return {
        shipmentDetails,
        rawResponses: {
            orderRes: orderRes.data,
            awbRes: awbRes.data,
            pickupRes: pickupRes?.data,
        },
    };
}

export async function cancelShiprocketShipment(shipmentId) {
    const token = await getShiprocketToken();
    const res = await shiprocketRequest(
        "https://apiv2.shiprocket.in/v1/external/orders/cancel",
        "post",
        { ids: [shipmentId] },
        token
    );
    return res.data;
}

// 🔍 Track shipment
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
                "shipment.debugLogs": {
                    step,
                    payload,
                    response: err.response?.data || err.message,
                    createdAt: new Date(),
                },
            },
        }
    );
}

function partialReturn(order, orderId, status, shipmentId = null) {
    return {
        shipmentDetails: {
            shiprocket_order_id: orderId,
            shipment_id: shipmentId,
            status,
            assignedAt: new Date(),
        },
    };
}


export async function retryFailedShipments(maxRetries = 3) {
    // Find orders with failed shipment statuses
    const failedOrders = await Order.find({
        "shipment.status": {
            $in: ["Shipment Creation Failed", "Created (AWB not assigned)", "Awaiting Pickup"]
        }
    });

    if (!failedOrders.length) return console.log("✅ No failed shipments to retry.");

    for (const order of failedOrders) {
        try {
            // Initialize retryCount if not present
            order.shipment.retryCount = order.shipment.retryCount || 0;

            if (order.shipment.retryCount >= maxRetries) {
                console.log(`❌ Order ${order._id} reached max retry attempts (${maxRetries}). Skipping.`);
                continue;
            }

            console.log(`🔁 Retrying shipment for order ${order._id} (Attempt ${order.shipment.retryCount + 1})`);

            // Retry shipment
            const res = await createShiprocketOrder(order);

            console.log("✅ Retried successfully:", res.shipmentDetails);

            // Update order with latest shipment info & increment retry count
            order.shipment = {
                ...res.shipmentDetails,
                retryCount: order.shipment.retryCount + 1,
                lastRetryAt: new Date()
            };
            order.orderStatus = res.shipmentDetails.status;

            // Save to DB
            await order.save();
        } catch (err) {
            console.error("🚨 Retry failed for order", order._id, ":", err.response?.data || err.message);

            // Push debug log into MongoDB
            await Order.updateOne(
                { _id: order._id },
                {
                    $push: {
                        "shipment.debugLogs": {
                            step: "Retry Failed",
                            response: err.response?.data || err.message,
                            retryCount: (order.shipment.retryCount || 0) + 1,
                            createdAt: new Date()
                        }
                    }
                }
            );

            // Increment retry count even on failure
            order.shipment.retryCount = (order.shipment.retryCount || 0) + 1;
            await order.save();
        }
    }
}

export async function validatePincodeServiceability(pincode, cod = true) {
    const token = await getShiprocketToken();

    const pickup_postcode = process.env.SHIPROCKET_PICKUP_PIN || "110030"; // Default or env pickup pin
    const weight = 0.5; // in KG
    const codFlag = cod ? 1 : 0;

    // ✅ Build query string for GET request
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

        // Extract useful info
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
