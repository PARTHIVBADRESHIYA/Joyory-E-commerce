import axios from "axios";
import Order from "../../models/Order.js";
import cron from "node-cron";


const DELHIVERY_TRACK_URL =
    "https://track.delhivery.com/api/v1/packages/json/";
const DELHIVERY_API_KEY = process.env.DELHIVERY_API_KEY;



const SHIPMENT_STATUS_RANK = {
    "Created": 1,
    "Pending": 2,
    "Pickup Scheduled": 3,
    "Picked Up": 4,
    "In Transit": 5,
    "Out for Delivery": 6,
    "Delivered": 7,
    "Cancelled": 8,
    "RTO Initiated": 9,
    "RTO Delivered": 10
};

const mapDelhiveryStatus = (status = "") => {
    const s = status.toLowerCase();

    if (s.includes("manifest") || s.includes("pickup"))
        return "Pickup Scheduled";

    if (s.includes("picked"))
        return "Picked Up";

    if (s.includes("in transit") || s.includes("dispatched"))
        return "In Transit";

    if (s.includes("out for delivery"))
        return "Out for Delivery";

    if (s.includes("delivered"))
        return "Delivered";

    if (s.includes("rto"))
        return "RTO Initiated";

    if (s.includes("cancel"))
        return "Cancelled";

    return "In Transit";
};

const isDuplicateTimeline = (history, status, time) => {
    return history.some(h =>
        h.status === status &&
        new Date(h.timestamp).getTime() === new Date(time).getTime()
    );
};

const resolveOrderStatusFromShipments = (shipments = []) => {
    const statuses = shipments.map(s => s.status);

    if (statuses.every(s => s === "Delivered"))
        return "Delivered";

    if (statuses.some(s => s === "Out for Delivery"))
        return "Out for Delivery";

    if (statuses.some(s =>
        ["Pickup Scheduled", "Picked Up", "In Transit"].includes(s)
    ))
        return "Shipped";

    return "Processing";
};



/* ---------------------------
   🔹 Track Single Waybill
---------------------------- */
const trackDelhiveryWaybill = async (waybill) => {
    const res = await axios.get(DELHIVERY_TRACK_URL, {
        headers: {
            Authorization: `Token ${DELHIVERY_API_KEY}`
        },
        params: { waybill }
    });

    return res.data?.ShipmentData?.[0]?.Shipment || null;
};

export const syncDelhiveryShipments = async () => {

    const orders = await Order.find({
        "shipments.provider": "delhivery",
        "shipments.waybill": { $exists: true }
    });

    for (const order of orders) {
        let orderDirty = false;

        for (const shipment of order.shipments) {

            if (
                shipment.provider !== "delhivery" ||
                !shipment.waybill ||
                ["Delivered", "Cancelled", "RTO Delivered"].includes(shipment.status)
            ) continue;

            try {
                const data = await trackDelhiveryWaybill(shipment.waybill);
                if (!data?.Status) continue;

                const rawStatus = data.Status.Status;
                const newStatus = mapDelhiveryStatus(rawStatus);
                const statusTime = data.Status.StatusDateTime;

                /* --------------------------------
                   ⛔ Prevent status regression
                -------------------------------- */
                if (
                    SHIPMENT_STATUS_RANK[newStatus] <=
                    SHIPMENT_STATUS_RANK[shipment.status]
                ) continue;

                /* --------------------------------
                   ⛔ Prevent duplicate timeline
                -------------------------------- */
                if (!isDuplicateTimeline(
                    shipment.tracking_history,
                    rawStatus,
                    statusTime
                )) {
                    shipment.tracking_history.push({
                        status: rawStatus,
                        timestamp: new Date(statusTime),
                        location: data.Status.Location || "Delhivery",
                        description: data.Status.Instructions || ""
                    });
                }

                /* --------------------------------
                   ✅ Update shipment status
                -------------------------------- */
                shipment.status = newStatus;

                if (newStatus === "Picked Up")
                    shipment.shippedAt = new Date();

                if (newStatus === "Delivered")
                    shipment.deliveredAt = new Date();

                orderDirty = true;

            } catch (err) {
                console.error(
                    `❌ Delhivery tracking failed (${shipment.waybill}):`,
                    err.message
                );
            }
        }

        /* --------------------------------
           ✅ Resolve Order Status SAFELY
        -------------------------------- */
        if (orderDirty) {
            order.orderStatus =
                resolveOrderStatusFromShipments(order.shipments);

            await order.save();
        }
    }
};



export const startDelhiveryCron = () => {
    cron.schedule("*/15 * * * *", async () => {
        console.log("🔄 Delhivery tracking sync running");
        await syncDelhiveryShipments();
    });
};