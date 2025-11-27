import mongoose from "mongoose";
import axios from "axios";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

import Order from "./models/Order.js";
import { getShiprocketToken } from "./middlewares/services/shiprocket.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

async function fetchFullTimeline() {
    try {
        console.log("🔥 Connecting to DB…");
        await mongoose.connect(process.env.MONGO_URI);

        console.log("🔑 Fetching Shiprocket token…");
        const token = await getShiprocketToken();

        // GET all shipments which have AWB assigned
        const orders = await Order.find({
            "shipments.awb_code": { $exists: true, $ne: "" }
        });

        console.log(`🔍 Found ${orders.length} orders with shipments`);

        for (const order of orders) {
            for (const shipment of order.shipments) {
                if (!shipment.awb_code) continue;

                console.log(`\n🚚 Fetching timeline for AWB: ${shipment.awb_code}`);

                try {
                    const url = `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${shipment.awb_code}`;

                    const response = await axios.get(url, {
                        headers: { Authorization: `Bearer ${token}` }
                    });

                    const data = response.data;

                    if (!data.tracking_data) {
                        console.log("⚠️ No tracking data found");
                        continue;
                    }

                    const events = data.tracking_data.shipment_track_activities || [];

                    // Convert to your DB format
                    shipment.trackingHistory = events.map(ev => ({
                        status: ev.activity,
                        timestamp: new Date(ev.date),
                        location: ev.location || "N/A",
                        description: ev.activity
                    }));

                    // Update status
                    if (data.tracking_data.shipment_status) {
                        shipment.status = data.tracking_data.shipment_status;
                    }

                    console.log(`✅ Timeline updated for ${shipment.awb_code}`);
                } catch (err) {
                    console.log("❌ Failed:", err.response?.data || err.message);
                }
            }

            await order.save();
        }

        console.log("\n🎉 DONE — All timelines updated!");
        process.exit(0);
    } catch (err) {
        console.error("❌ ERROR:", err);
        process.exit(1);
    }
}

fetchFullTimeline();
