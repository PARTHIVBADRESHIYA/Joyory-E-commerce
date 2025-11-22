// fetch-awb-now.js
import mongoose from "mongoose";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import Order from "./models/Order.js";
import { getShiprocketToken } from "./middlewares/services/shiprocket.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

// YOUR TARGETS
const TARGET_SR_ORDER_ID = "1048884663";
const TARGET_SHIPMENT_ID = "1045268902";

function deepSearch(obj, keys) {
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

async function start() {
    try {
        console.log("⏳ Connecting...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ DB Connected\n");

        const token = await getShiprocketToken();
        console.log("🔐 Token OK\n");

        console.log(`🔎 Fetching SR order ${TARGET_SR_ORDER_ID}...\n`);

        const res = await axios.get(
            `https://apiv2.shiprocket.in/v1/external/orders/show/${TARGET_SR_ORDER_ID}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        const data = res.data;
        console.log("📄 Top-level keys →", Object.keys(data), "\n");

        // Find shipments if exists
        let srShipment = null;

        if (Array.isArray(data.shipments)) {
            srShipment =
                data.shipments.find(
                    (s) => String(s.shipment_id) === TARGET_SHIPMENT_ID
                ) || data.shipments[0];
        }

        // Extract AWB from anywhere
        const awb =
            deepSearch(srShipment, [
                "awb_code",
                "awb",
                "last_mile_awb",
                "waybill",
            ]) ||
            deepSearch(data, [
                "awb_code",
                "awb",
                "waybill",
                "last_mile_awb",
            ]) ||
            null;

        const courier =
            deepSearch(srShipment, [
                "courier_name",
                "courier_company",
                "assigned_courier",
            ]) ||
            deepSearch(data, [
                "last_mile_courier",
                "courier_company",
            ]) ||
            null;

        const trackUrl =
            deepSearch(srShipment, [
                "tracking_url",
                "track_url",
                "trackingLink",
            ]) ||
            deepSearch(data, [
                "tracking_url",
                "track_url",
            ]) ||
            (awb ? `https://shiprocket.co/tracking/${awb}` : null);

        console.log("✂️ Extracted:");
        console.log({ awb, courier, trackUrl, srShipment }, "\n");

        if (!awb) {
            console.log("❌ API STILL NOT UPDATED. AWB does not exist in JSON yet.");
            return process.exit(0);
        }

        console.log("💾 Updating DB...");

        const updateRes = await Order.updateOne(
            {
                "shipments.shiprocket_order_id": TARGET_SR_ORDER_ID,
                "shipments.shipment_id": TARGET_SHIPMENT_ID,
            },
            {
                $set: {
                    "shipments.$.awb_code": awb,
                    "shipments.$.courier_name": courier,
                    "shipments.$.tracking_url": trackUrl,
                    "shipments.$.status": "AWB Assigned",
                },
                $push: {
                    "shipments.$.trackingHistory": {
                        status: "AWB Assigned",
                        timestamp: new Date(),
                        courier,
                        description: `AWB ${awb} assigned`,
                    },
                },
            }
        );

        console.log("\n✅ UPDATE RESULT:", updateRes);
        console.log("🎉 DONE");
        process.exit(0);
    } catch (err) {
        console.error("❌ ERROR:", err.response?.data || err.message);
        process.exit(1);
    }
}

start();
