

import axios from "axios";
import Order from "../../models/Order.js";
import cron from "node-cron";
import { computeOrderStatus } from "../../controllers/orderController.js";
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
    "RTO Initiated": 8,
    "RTO Delivered": 9,
    "Cancelled": 99   // 🔒 terminal
};

const RETURN_STATUS_RANK = {
    requested: 1,
    pickup_scheduled: 2,
    picked_up: 3,
    in_transit: 4,
    delivered_to_warehouse: 5,
    qc_passed: 6,
    qc_failed: 6,
    cancelled: 99
};

const mapDelhiveryStatus = (status = "") => {
    const s = status.toLowerCase();

    if (s.includes("cancel")) return "Cancelled";
    if (s.includes("rto")) return "RTO Initiated";
    if (s.includes("delivered")) return "Delivered";
    if (s.includes("out for delivery")) return "Out for Delivery";
    if (s.includes("picked")) return "Picked Up";
    if (s.includes("manifest") || s.includes("pickup"))
        return "Pickup Scheduled";
    if (s.includes("in transit") || s.includes("dispatched"))
        return "In Transit";

    return "In Transit";
};

const mapDelhiveryReturnStatus = (status = "") => {
    const s = status.toLowerCase();

    if (s.includes("cancel")) return "cancelled";
    if (s.includes("qc pass")) return "qc_passed";
    if (s.includes("qc fail")) return "qc_failed";
    if (s.includes("delivered") || s.includes("hub"))
        return "delivered_to_warehouse";
    if (s.includes("picked")) return "picked_up";
    if (s.includes("manifest") || s.includes("pickup"))
        return "pickup_scheduled";
    if (s.includes("transit") || s.includes("dispatched"))
        return "in_transit";

    return "in_transit";
};


const isDuplicateTimeline = (history, rawStatus, time) => {
    return history.some(h =>
        h.courierStatus === rawStatus &&
        new Date(h.timestamp).getTime() === new Date(time).getTime()
    );
};

const resolveOrderStatusFromShipments = (shipments = []) => {
    const statuses = shipments.map(s => s.status);

    if (statuses.every(s => s === "Cancelled"))
        return "Cancelled";

    if (statuses.every(s => s === "Delivered"))
        return "Delivered";

    if (statuses.some(s => s === "Out for Delivery"))
        return "Out for Delivery";

    if (statuses.some(s =>
        ["Picked Up", "In Transit"].includes(s)
    ))
        return "Shipped";

    if (statuses.some(s => s === "Cancelled"))
        return "Partially Cancelled";

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

/* ---------------------------
   🔹 SYNC DELHIVERY SHIPMENTS
---------------------------- */
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
                if (!data) continue;

                const scans = data.Scans || [];

                for (const scan of scans) {
                    const scanDetail = scan?.ScanDetail;
                    if (!scanDetail) continue;

                    const rawStatus = scanDetail.Scan;
                    const statusTime = scanDetail.ScanDateTime;
                    const mappedStatus = mapDelhiveryStatus(rawStatus);

                    /* ⛔ Prevent duplicate timeline */
                    if (isDuplicateTimeline(
                        shipment.tracking_history,
                        rawStatus,
                        statusTime
                    )) continue;

                    shipment.tracking_history.push({
                        status: mappedStatus,          // NORMALIZED
                        courierStatus: rawStatus,      // RAW
                        timestamp: new Date(statusTime),
                        location: scanDetail.ScannedLocation || "Delhivery",
                        description: scanDetail.Instructions || ""
                    });

                    /* ⛔ Prevent status regression */
                    if (
                        SHIPMENT_STATUS_RANK[mappedStatus] >
                        SHIPMENT_STATUS_RANK[shipment.status]
                    ) {
                        shipment.status = mappedStatus;

                        if (mappedStatus === "Picked Up")
                            shipment.shippedAt = new Date(statusTime);

                        if (mappedStatus === "Delivered")
                            shipment.deliveredAt = new Date(statusTime);
                    }

                    orderDirty = true;
                }

            } catch (err) {
                console.error(
                    `❌ Delhivery tracking failed (${shipment.waybill}):`,
                    err.message
                );
            }
        }

        for (const shipment of order.shipments) {

            if (!Array.isArray(shipment.returns)) continue;

            for (const ret of shipment.returns) {

                if (
                    ret.provider !== "delhivery" ||
                    !ret.waybill ||
                    ["qc_passed", "qc_failed", "cancelled"].includes(ret.status)
                ) continue;

                try {
                    const data = await trackDelhiveryWaybill(ret.waybill);
                    if (!data) continue;

                    const scans = data.Scans || [];

                    for (const scan of scans) {
                        const scanDetail = scan?.ScanDetail;
                        if (!scanDetail) continue;

                        const rawStatus = scanDetail.Scan;
                        const statusTime = scanDetail.ScanDateTime;
                        const mappedStatus = mapDelhiveryReturnStatus(rawStatus);

                        // ⛔ prevent duplicates
                        if (
                            ret.tracking_history.some(h =>
                                h.status === mappedStatus &&
                                new Date(h.timestamp).getTime() === new Date(statusTime).getTime()
                            )
                        ) continue;

                        ret.tracking_history.push({
                            status: mappedStatus,
                            timestamp: new Date(statusTime),
                            location: scanDetail.ScannedLocation || "Delhivery",
                            description: scanDetail.Instructions || ""
                        });

                        // ⛔ prevent regression
                        if (
                            RETURN_STATUS_RANK[mappedStatus] >
                            RETURN_STATUS_RANK[ret.status]
                        ) {
                            ret.status = mappedStatus;
                        }


                        /* -------------------------------
                                   🔥 AUTO-TRIGGER REFUND WHEN QC PASSED
                                -------------------------------- */
                        if (
                            ret.status === "qc_passed" &&
                            !ret.refund?.gatewayRefundId &&
                            !["initiated", "processing", "completed"].includes(ret.refund?.status)
                        ) {
                            console.log(`🚀 Auto refund triggered for Order ${order._id}, Return ${ret._id}`);

                            const paymentId = order.transactionId;
                            const isTestPayment =
                                paymentId?.startsWith("pay_TEST") ||
                                paymentId?.toLowerCase().includes("test");

                            if (isTestPayment) {
                                console.log("⚠️ Skipping real refund — Test mode payment");
                            } else {
                                await addRefundJob(order._id, ret._id);
                            }

                            ret.refund = {
                                status: isTestPayment ? "test_mode" : "initiated",
                                amount: 0,
                                gatewayRefundId: null,
                                refundedAt: null
                            };

                            orderDirty = true;
                        }

                        orderDirty = true;
                    }


                } catch (err) {
                    console.error(
                        `❌ Delhivery RETURN tracking failed (${ret.waybill}):`,
                        err.message
                    );
                }
            }
        }

        /* ✅ Resolve order status */
        if (orderDirty) {
            order.orderStatus =
                computeOrderStatus(order.shipments);


            await order.save();
        }
    }
};

export const startDelhiveryCron = () => {
    cron.schedule("*/5 * * * *", async () => {
        console.log("🔄 Delhivery tracking sync running every 5 minutes");
        await syncDelhiveryShipments();
    });
};




// /* ---------------------------
//    🔹 CRON (1 mins)
// ---------------------------- */
// export const startDelhiveryCron = () => {
//     cron.schedule("* * * * *", async () => {
//         console.log("🔄 Delhivery tracking sync running");
//         await syncDelhiveryShipments();
//     });
// };
