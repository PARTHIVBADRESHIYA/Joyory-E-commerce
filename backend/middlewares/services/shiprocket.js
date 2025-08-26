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
let tokenExpiry = null;

// 🔑 Get & cache Shiprocket token
export async function getShiprocketToken() {
    if (shiprocketToken && tokenExpiry && new Date() < tokenExpiry) {
        return shiprocketToken;
    }

    try {
        const res = await axios.post(
            "https://apiv2.shiprocket.in/v1/external/auth/login",
            {
                email: process.env.SHIPROCKET_EMAIL,
                password: process.env.SHIPROCKET_PASSWORD
            }
        );

        shiprocketToken = res.data.token;
        // Shiprocket tokens usually last ~24 hrs
        tokenExpiry = new Date(new Date().getTime() + 23 * 60 * 60 * 1000);

        return shiprocketToken;
    } catch (err) {
        console.error("❌ Shiprocket Auth Failed:", err.response?.data || err.message);
        throw new Error("Failed to authenticate with Shiprocket");
    }
}

// 🚚 Create order & assign courier
export async function createShiprocketOrder(order) {
    const token = await getShiprocketToken();

    // 🔍 Validate minimum shipping fields
    if (!order.shippingAddress?.addressLine ||
        !order.shippingAddress?.city ||
        !order.shippingAddress?.pincode ||
        !order.shippingAddress?.state) {
        throw new Error("❌ Invalid or incomplete shipping address for Shiprocket order");
    }

    if (!order.products?.length) {
        throw new Error("❌ No products found in order for Shiprocket");
    }

    // 📝 Shiprocket payload
    const shipmentData = {
        order_id: order._id.toString(),
        order_date: new Date(order.createdAt).toISOString().slice(0, 19).replace("T", " "),
        pickup_location: process.env.SHIPROCKET_PICKUP || "Primary", // must match dashboard pickup nickname
        billing_customer_name: order.customerName || order.user?.name || "Guest",
        billing_last_name: "",
        billing_address: order.shippingAddress.addressLine,
        billing_city: order.shippingAddress.city,
        billing_pincode: order.shippingAddress.pincode,
        billing_state: order.shippingAddress.state,
        billing_country: "India",
        billing_email: order.user?.email || "guest@example.com",
        billing_phone: order.user?.phone || "9999999999",
        shipping_is_billing: true,
        order_items: order.products.map(item => ({
            name: item.productId?.name || item.name || "Product",
            sku: item.productId?._id?.toString() || "SKU001",
            units: item.quantity,
            selling_price: item.price || 0
        })),
        payment_method: order.paymentMethod === "COD" ? "COD" : "Prepaid",
        sub_total: order.amount,
        length: 10,
        breadth: 10,
        height: 10,
        weight: 1
    };

    let orderRes, awbRes;

    // Step 1: Create order
    try {
        orderRes = await axios.post(
            "https://apiv2.shiprocket.in/v1/external/orders/create/adhoc",
            shipmentData,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        console.log("🚚 Shiprocket Order Created:", orderRes.data);
    } catch (err) {
        console.error("❌ Shiprocket Order Create Failed:", err.response?.data || err.message);
        throw new Error(`Shiprocket order creation failed: ${JSON.stringify(err.response?.data || err.message)}`);
    }

    const shiprocketOrderId = orderRes.data?.order_id;
    const shipmentId = orderRes.data?.shipment_id;

    if (!shipmentId) {
        throw new Error("❌ No shipment_id returned from Shiprocket");
    }

    // Step 2: Auto-assign courier
    try {
        awbRes = await axios.post(
            "https://apiv2.shiprocket.in/v1/external/courier/assign/awb",
            { shipment_id: shipmentId },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        console.log("📦 AWB Assigned:", awbRes.data);
    } catch (err) {
        console.error("❌ Shiprocket AWB Assign Failed:", err.response?.data || err.message);
        throw new Error(`Shiprocket AWB assignment failed: ${JSON.stringify(err.response?.data || err.message)}`);
    }

    // ✅ Build shipment details
    let shipmentDetails = {
        shiprocket_order_id: shiprocketOrderId,
        shipment_id: shipmentId,
        awb_code: awbRes.data?.response?.awb_code || null,
        courier_company_id: awbRes.data?.response?.courier_company_id || null,
        courier_name: awbRes.data?.response?.courier_name || null,
        tracking_url: awbRes.data?.response?.awb_code
            ? `https://shiprocket.co/tracking/${awbRes.data.response.awb_code}`
            : null,
        status: awbRes.data?.response?.awb_code ? "Awaiting Pickup" : "Processing",
        assignedAt: new Date()
    };

    // Step 3: Ensure tracking URL
    if (!shipmentDetails.tracking_url && shipmentDetails.awb_code) {
        try {
            const trackRes = await axios.get(
                `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${shipmentDetails.awb_code}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            shipmentDetails.tracking_url = trackRes.data?.tracking_data?.track_url || null;
        } catch (trackErr) {
            console.warn("⚠️ Tracking URL not yet available for AWB:", shipmentDetails.awb_code);
        }
    }

    // Step 4: Save to DB & update status
    const update = {
        shipment: shipmentDetails,
        orderStatus: shipmentDetails.status
    };

    await Order.findByIdAndUpdate(order._id, update);

    return {
        shipmentDetails,
        rawResponses: {
            orderRes: orderRes.data,
            awbRes: awbRes.data
        }
    };
}
