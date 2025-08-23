// // services/shiprocket.js
// import axios from "axios";

// let shiprocketToken = null;

// export async function getShiprocketToken() {
//     if (shiprocketToken) return shiprocketToken;
//     const res = await axios.post("https://apiv2.shiprocket.in/v1/external/auth/login", {
//         email: process.env.SHIPROCKET_EMAIL,
//         password: process.env.SHIPROCKET_PASSWORD
//     });
//     shiprocketToken = res.data.token;
//     return shiprocketToken;
// }

// export async function createShiprocketOrder(order) {
//     const token = await getShiprocketToken();
//     const shipmentData = {
//         order_id: order.orderId,
//         order_date: order.date.toISOString(),
//         pickup_location: "Primary",
//         billing_customer_name: order.customerName,
//         billing_address: order.shippingAddress.addressLine,
//         billing_city: order.shippingAddress.city,
//         billing_pincode: order.shippingAddress.pincode,
//         billing_state: order.shippingAddress.state,
//         billing_country: "India",
//         billing_email: order.user.email,
//         billing_phone: order.user.phone,
//         order_items: order.products.map(item => ({
//             name: item.productId.toString(),
//             units: item.quantity,
//             selling_price: item.price
//         })),
//         payment_method: order.paymentMethod === "COD" ? "COD" : "Prepaid",
//         sub_total: order.amount,
//         length: 10,
//         breadth: 10,
//         height: 10,
//         weight: 1
//     };

//     const res = await axios.post(
//         "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
//         shipmentData,
//         { headers: { Authorization: `Bearer ${token}` } }
//     );

//     return res.data;
// }



// // services/shiprocket.js
// import axios from "axios";

// let shiprocketToken = null;

// export async function getShiprocketToken() {
//     if (shiprocketToken) return shiprocketToken;

//     const res = await axios.post("https://apiv2.shiprocket.in/v1/external/auth/login", {
//         email: process.env.SHIPROCKET_EMAIL,
//         password: process.env.SHIPROCKET_PASSWORD
//     });

//     shiprocketToken = res.data.token;
//     return shiprocketToken;
// }


// export async function createShiprocketOrder(order) {
//     const token = await getShiprocketToken();

//     // Step 1. Create Order in Shiprocket
//     const shipmentData = {
//         order_id: order._id.toString(),
//         order_date: new Date(order.createdAt).toISOString(),
//         pickup_location: "Primary", // Must match Shiprocket dashboard pickup location
//         billing_customer_name: order.customerName || order.user?.name || "Guest",
//         billing_address: order.shippingAddress?.addressLine,
//         billing_city: order.shippingAddress?.city,
//         billing_pincode: order.shippingAddress?.pincode,
//         billing_state: order.shippingAddress?.state,
//         billing_country: "India",
//         billing_email: order.user?.email || "guest@example.com",
//         billing_phone: order.user?.phone || "9999999999",
//         shipping_is_billing: true,
//         order_items: order.products.map(item => ({
//             name: item.productId?.name || item.name || "Product",
//             sku: item.productId?._id?.toString() || "SKU001",
//             units: item.quantity,
//             selling_price: item.price
//         })),
//         payment_method: order.paymentMethod === "COD" ? "COD" : "Prepaid",
//         sub_total: order.amount,
//         length: 10,
//         breadth: 10,
//         height: 10,
//         weight: 1
//     };

//     const orderRes = await axios.post(
//         "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
//         shipmentData,
//         { headers: { Authorization: `Bearer ${token}` } }
//     );

//     const shiprocketOrderId = orderRes.data.order_id;
//     const shipmentId = orderRes.data.shipment_id;

//     // Step 2. Assign AWB (Generate courier)
//     const awbRes = await axios.post(
//         "https://apiv2.shiprocket.in/v1/external/courier/assign/awb",
//         { shipment_id: shipmentId, courier_id: "" }, // courier_id "" => auto-assign
//         { headers: { Authorization: `Bearer ${token}` } }
//     );

//     const shipmentDetails = {
//         shiprocket_order_id: shiprocketOrderId,
//         shipment_id: shipmentId,
//         awb_code: awbRes.data.response?.awb_code,
//         courier_company_id: awbRes.data.response?.courier_company_id,
//         courier_name: awbRes.data.response?.courier_name,
//         tracking_url: `https://shiprocket.co/tracking/${awbRes.data.response?.awb_code}`,
//         status: "Created",
//         assignedAt: new Date()
//     };

//     // Step 3. Save shipment details in DB
//     await Order.findByIdAndUpdate(order._id, { shipment: shipmentDetails });

//     return shipmentDetails;
// }




// services/shiprocket.js
import axios from "axios";
import Order from "../../models/Order.js";

let shiprocketToken = null;

// ✅ Get / Cache Shiprocket Token
export async function getShiprocketToken() {
    if (shiprocketToken) return shiprocketToken;

    const res = await axios.post("https://apiv2.shiprocket.in/v1/external/auth/login", {
        email: process.env.SHIPROCKET_EMAIL,
        password: process.env.SHIPROCKET_PASSWORD
    });

    shiprocketToken = res.data.token;
    return shiprocketToken;
}

// ✅ Create Order + Assign Courier
export async function createShiprocketOrder(order) {
    const token = await getShiprocketToken();

    // Step 1: Create Order in Shiprocket
    const shipmentData = {
        order_id: order._id.toString(),
        order_date: new Date(order.createdAt).toISOString(),
        pickup_location: "Primary", // 🔴 Must match EXACT nickname in Shiprocket Dashboard
        billing_customer_name: order.customerName || order.user?.name || "Guest",
        billing_address: order.shippingAddress?.addressLine,
        billing_city: order.shippingAddress?.city,
        billing_pincode: order.shippingAddress?.pincode,
        billing_state: order.shippingAddress?.state,
        billing_country: "India",
        billing_email: order.user?.email || "guest@example.com",
        billing_phone: order.user?.phone || "9999999999",
        shipping_is_billing: true,
        order_items: order.products.map(item => ({
            name: item.productId?.name || item.name || "Product",
            sku: item.productId?._id?.toString() || "SKU001",
            units: item.quantity,
            selling_price: item.price
        })),
        payment_method: order.paymentMethod === "COD" ? "COD" : "Prepaid",
        sub_total: order.amount,
        length: 10,
        breadth: 10,
        height: 10,
        weight: 1
    };

    let orderRes, awbRes;

    try {
        orderRes = await axios.post(
            "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
            shipmentData,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        console.log("🚚 Shiprocket Order Response:", orderRes.data);
    } catch (err) {
        console.error("❌ Shiprocket Order Create Failed:", err.response?.data || err.message);
        throw new Error("Shiprocket order creation failed");
    }

    const shiprocketOrderId = orderRes.data.order_id;
    const shipmentId = orderRes.data.shipment_id;

    try {
        awbRes = await axios.post(
            "https://apiv2.shiprocket.in/v1/external/courier/assign/awb",
            { shipment_id: shipmentId, courier_id: "" }, // auto-assign courier
            { headers: { Authorization: `Bearer ${token}` } }
        );
        console.log("📦 Shiprocket AWB Response:", awbRes.data);
    } catch (err) {
        console.error("❌ Shiprocket AWB Assign Failed:", err.response?.data || err.message);
        throw new Error("Shiprocket AWB assignment failed");
    }

    const shipmentDetails = {
        shiprocket_order_id: shiprocketOrderId,
        shipment_id: shipmentId,
        awb_code: awbRes.data?.response?.awb_code || null,
        courier_company_id: awbRes.data?.response?.courier_company_id || null,
        courier_name: awbRes.data?.response?.courier_name || null,
        tracking_url: awbRes.data?.response?.awb_code
            ? `https://shiprocket.co/tracking/${awbRes.data.response.awb_code}`
            : null,
        status: awbRes.data?.status === 200 ? "Created" : "Failed",
        assignedAt: new Date()
    };

    // Step 3: Save shipment details in DB
    await Order.findByIdAndUpdate(order._id, { shipment: shipmentDetails });

    // Return both responses for debugging
    return {
        shipmentDetails,
        rawResponses: {
            orderRes: orderRes.data,
            awbRes: awbRes.data
        }
    };
}


// ✅ Fetch Tracking Status (Sync from Shiprocket)
export async function getTrackingStatus(orderId) {
    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");

    if (!order.shipment?.awb_code) {
        return { message: "No AWB code assigned yet", shipment: order.shipment };
    }

    const token = await getShiprocketToken();

    try {
        const trackRes = await axios.get(
            `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${order.shipment.awb_code}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        const trackingData = trackRes.data?.tracking_data;

        const updatedShipment = {
            ...order.shipment.toObject(),
            courier_name: trackingData?.courier_name || order.shipment.courier_name,
            current_status: trackingData?.shipment_status || order.shipment.status,
            checkpoints: trackingData?.shipment_track || [],
            lastSyncedAt: new Date()
        };

        order.shipment = updatedShipment;
        await order.save();

        return updatedShipment;
    } catch (err) {
        console.error("Shiprocket tracking fetch failed:", err.message);
        return { message: "Tracking fetch failed", error: err.message, shipment: order.shipment };
    }
}
