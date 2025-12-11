// fetch-full-timeline.js
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
        await mongoose.connect(process.env.MONGO_URI, {});

        console.log("🔑 Fetching Shiprocket token…");
        const token = await getShiprocketToken();

        // Fetch all orders with shipments (including return shipments)
        const orders = await Order.find({
            $or: [
                { "shipments.awb_code": { $exists: true, $ne: null } },
                { "shipments.returns.pickupDetails.awb": { $exists: true, $ne: null } }
            ]
        });

        console.log(`🔍 Found ${orders.length} orders with shipments/returns`);

        for (const order of orders) {
            for (const shipment of order.shipments || []) {
                // ----- FORWARD SHIPMENTS -----
                if (shipment.awb_code) {
                    await fetchAndUpdateShipmentTimeline(order, shipment, token);
                }

                // ----- RETURN SHIPMENTS -----
                if (shipment.returns?.length) {
                    for (const ret of shipment.returns) {
                        if (ret.pickupDetails?.awb) {
                            await fetchAndUpdateShipmentTimeline(order, ret, token, true);
                        }
                    }
                }
            }

            // Save after all updates
            await order.save();
        }

        console.log("\n🎉 DONE — All timelines updated!");
        process.exit(0);
    } catch (err) {
        console.error("❌ ERROR:", err);
        process.exit(1);
    }
}

/**
 * Fetch Shiprocket timeline & update local object
 * @param {Object} order - Mongoose order doc
 * @param {Object} shipmentObj - Shipment or Return object
 * @param {string} token - Shiprocket token
 * @param {boolean} isReturn - whether this is a return shipment
 */
async function fetchAndUpdateShipmentTimeline(order, shipmentObj, token, isReturn = false) {
    const awb = shipmentObj.awb_code || shipmentObj.pickupDetails?.awb;
    if (!awb) return;

    console.log(`\n🚚 Fetching timeline for AWB: ${awb}`);

    try {
        const url = `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awb}`;
        const response = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });

        const trackingData = response.data.tracking_data;
        if (!trackingData) {
            console.log("⚠️ No tracking data found");
            return;
        }

        // Use either shipment_track_activities or shipment_track
        const events = trackingData.shipment_track_activities?.length
            ? trackingData.shipment_track_activities
            : trackingData.shipment_track?.length
                ? trackingData.shipment_track
                : [];

        // Map to standard trackingHistory format
        shipmentObj.trackingHistory = events.map(ev => ({
            status: ev.activity || ev.status || "Unknown",
            timestamp: new Date(ev.date || ev.datetime || Date.now()),
            location: ev.location || "N/A",
            description: ev.activity || ev.status || ""
        })).sort((a, b) => b.timestamp - a.timestamp);

        // Fallback if no events
        if (shipmentObj.trackingHistory.length === 0) {
            const fallbackStatus = trackingData.shipment_status || "Unknown";
            shipmentObj.trackingHistory.push({
                status: fallbackStatus,
                timestamp: new Date(),
                location: "N/A",
                description: fallbackStatus
            });
            console.log(`⚠️ No timeline events, using fallback status: ${fallbackStatus}`);
        }

        // Print timeline in console (Nykaa-style)
        console.log(`📜 Timeline for AWB ${awb}:`);
        shipmentObj.trackingHistory.forEach((ev, idx) => {
            console.log(`${idx + 1}. [${ev.timestamp.toLocaleString()}] ${ev.status} — ${ev.location}`);
        });

        // Update overallStatus
        const shipStatus = trackingData.shipment_status;
        if (typeof shipStatus === "string" && shipStatus.trim() !== "") {
            shipmentObj.overallStatus = shipStatus.toLowerCase().replace(/\s+/g, "_");
            if (shipmentObj.pickupDetails) shipmentObj.pickupDetails.status = shipmentObj.overallStatus;
        } else if (shipStatus != null) {
            shipmentObj.overallStatus = shipStatus;
        }

        console.log(`✅ Timeline updated for AWB: ${awb}`);
    } catch (err) {
        console.log("❌ Failed fetching timeline:", err.response?.data || err.message);
    }
}

fetchFullTimeline();
