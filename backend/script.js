// import mongoose from "mongoose";
// import axios from "axios";
// import path from "path";
// import dotenv from "dotenv";
// import { fileURLToPath } from "url";

// import Order from "./models/Order.js";
// import { getShiprocketToken } from "./middlewares/services/shiprocket.js";

// const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dotenv.config({ path: path.join(__dirname, ".env") });

// async function fetchFullTimeline() {
//     try {
//         console.log("🔥 Connecting to DB…");
//         await mongoose.connect(process.env.MONGO_URI);

//         console.log("🔑 Fetching Shiprocket token…");
//         const token = await getShiprocketToken();

//         // GET all shipments which have AWB assigned
//         const orders = await Order.find({
//             "shipments.awb_code": { $exists: true, $ne: "" }
//         });

//         console.log(`🔍 Found ${orders.length} orders with shipments`);

//         for (const order of orders) {
//             for (const shipment of order.shipments) {
//                 if (!shipment.awb_code) continue;

//                 console.log(`\n🚚 Fetching timeline for AWB: ${shipment.awb_code}`);

//                 try {
//                     const url = `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${shipment.awb_code}`;

//                     const response = await axios.get(url, {
//                         headers: { Authorization: `Bearer ${token}` }
//                     });

//                     const data = response.data;

//                     if (!data.tracking_data) {
//                         console.log("⚠️ No tracking data found");
//                         continue;
//                     }

//                     const events = data.tracking_data.shipment_track_activities || [];

//                     // Convert to your DB format
//                     shipment.trackingHistory = events.map(ev => ({
//                         status: ev.activity,
//                         timestamp: new Date(ev.date),
//                         location: ev.location || "N/A",
//                         description: ev.activity
//                     }));

//                     // Update status
//                     if (data.tracking_data.shipment_status) {
//                         shipment.status = data.tracking_data.shipment_status;
//                     }

//                     console.log(`✅ Timeline updated for ${shipment.awb_code}`);
//                 } catch (err) {
//                     console.log("❌ Failed:", err.response?.data || err.message);
//                 }
//             }

//             await order.save();
//         }

//         console.log("\n🎉 DONE — All timelines updated!");
//         process.exit(0);
//     } catch (err) {
//         console.error("❌ ERROR:", err);
//         process.exit(1);
//     }
// }

// fetchFullTimeline();












































// update-order-statuses.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Order from "./models/Order.js"; // <-- adjust path

// Load ENV
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

// --- YOUR SAME FUNCTION EXACTLY ---
export function computeOrderStatus(shipments = []) {
    if (!shipments || shipments.length === 0) return "Pending";

    const normalize = (s = "") => s.trim().toLowerCase();

    // Map numeric status / deliveredAt to proper string
    const statuses = shipments.map(s => {
        if (s.deliveredAt) return "Delivered";
        if (s.status === "cancelled") return "Cancelled"; // your cancelled code
        if (["shipped", "out for delivery", "in transit"].includes(s.status.toLowerCase()))
            return "Shipped";

        // fallback to last trackingHistory status
        const lastTracking = s.trackingHistory?.[s.trackingHistory.length - 1]?.status;
        if (lastTracking) return lastTracking;
        return "Processing";
    });

    const total = statuses.length;
    const count = (s) => statuses.filter(x => normalize(x) === normalize(s)).length;
    const has = (s) => count(s) > 0;
    const all = (s) => count(s) === total;

    if (all("delivered")) return "Delivered";
    if (all("cancelled")) return "Cancelled";
    if (statuses.every(s => ["shipped", "out for delivery", "in transit"].includes(normalize(s))))
        return "Shipped";

    if (has("delivered") && has("cancelled") && !has("shipped") && !has("processing"))
        return "Partially Delivered / Cancelled";
    if (has("delivered") && !has("cancelled"))
        return "Partially Delivered";
    if (has("cancelled") && !has("delivered"))
        return "Partially Cancelled";

    if (has("shipped") || has("out for delivery") || has("in transit"))
        return "Processing";

    return "Processing";
}

// --- MAIN SYNC SCRIPT ---
async function run() {
    try {
        console.log("⏳ Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);

        const orders = await Order.find({});
        console.log(`📦 Total Orders Found: ${orders.length}`);

        let updated = 0;
        let skipped = 0;

        for (const order of orders) {
            if (!order.shipments || order.shipments.length === 0) {
                skipped++;
                continue; // skip orders without shipments
            }

            const newStatus = computeOrderStatus(order.shipments);

            if (order.orderStatus !== newStatus) {
                order.orderStatus = newStatus;
                await order.save();
                updated++;
            }
        }

        console.log("✅ Status Update Complete!");
        console.log(`🔹 Updated Orders: ${updated}`);
        console.log(`🔸 Skipped (no shipments): ${skipped}`);

        process.exit(0);
    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    }
}

run();
