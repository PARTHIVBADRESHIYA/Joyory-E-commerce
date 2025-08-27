// services/mockShipping.js
import Order from "../../models/Order.js";

const store = new Map(); // shipmentId -> { ...shipment }
const STATUSES = [
    "Created",
    "Awaiting Pickup",
    "In Transit",
    "Out for Delivery",
    "Delivered"
];

function rand(n = 9) {
    return Math.random().toString().slice(2, 2 + n);
}

function makeAwb() {
    return `AWB${rand(10)}`;
}
function makeShipmentId() {
    return `MOCK-SHIP-${rand(8)}`;
}
function makeOrderId() {
    return `MOCK-ORD-${rand(8)}`;
}

/**
 * Creates a shipment object that looks like Shiprocket’s response.
 * Returns: { shipmentDetails, rawResponses }
 */
export async function createMockShipment(order) {
    // minimal validations (like your Shiprocket service)
    if (!order?.shippingAddress?.addressLine1 ||
        !order?.shippingAddress?.city ||
        !order?.shippingAddress?.pincode ||
        !order?.shippingAddress?.state) {
        throw new Error("❌ Invalid or incomplete shipping address for shipment");
    }

    if (!order?.products?.length) {
        throw new Error("❌ No products in order to ship");
    }

    // "Create order"
    const shiprocket_order_id = makeOrderId();
    const shipment_id = makeShipmentId();

    // Optional: simulate AWB assignment immediately (like success path)
    const awb_code = makeAwb();

    const now = new Date();

    const shipmentDetails = {
        shiprocket_order_id,
        shipment_id,
        awb_code,
        courier_company_id: "MOCKCOURIER",
        courier_name: "Mock Courier Pvt Ltd",
        tracking_url: `https://tracking.mockcourier.example/${awb_code}`,
        status: "Awaiting Pickup",
        assignedAt: now
    };

    // Keep a timeline for GET /track
    store.set(shipment_id, {
        ...shipmentDetails,
        current_status: "Awaiting Pickup",
        checkpoints: [
            {
                status: "Created",
                location: "Warehouse",
                timestamp: now.toISOString()
            },
            {
                status: "Awaiting Pickup",
                location: "Warehouse",
                timestamp: now.toISOString()
            }
        ]
    });

    // Persist to your Order
    await Order.findByIdAndUpdate(order._id, {
        shipment: {
            shipment_id,
            awb_code,
            tracking_url: shipmentDetails.tracking_url,
            courier_id: "MOCKCOURIER",
            courier_name: "Mock Courier Pvt Ltd",
            current_status: "Awaiting Pickup",
            checkpoints: store.get(shipment_id).checkpoints
        },
        orderStatus: "Awaiting Pickup"
    });

    return {
        shipmentDetails,
        rawResponses: {
            orderRes: { mock: true, message: "Order created" },
            awbRes: { mock: true, message: "AWB assigned" }
        }
    };
}

/** Return a simple tracking object (like your /tracking route uses) */
export async function getMockTracking(shipment_id) {
    const rec = store.get(shipment_id);
    if (!rec) return null;

    return {
        shipment_id: rec.shipment_id,
        awb_code: rec.awb_code,
        tracking_url: rec.tracking_url,
        courier_id: rec.courier_company_id,
        courier_name: rec.courier_name,
        current_status: rec.current_status,
        checkpoints: rec.checkpoints
    };
}

/** Push status forward by one step for testing */
export async function advanceMockShipment(shipment_id) {
    const rec = store.get(shipment_id);
    if (!rec) throw new Error("Shipment not found");

    const idx = STATUSES.indexOf(rec.current_status);
    const nextIdx = Math.min(idx + 1, STATUSES.length - 1);
    const nextStatus = STATUSES[nextIdx];

    if (nextStatus !== rec.current_status) {
        rec.current_status = nextStatus;
        rec.checkpoints.push({
            status: nextStatus,
            location: nextStatus === "Out for Delivery" ? "Local Hub" :
                nextStatus === "Delivered" ? "Customer Address" : "In Transit",
            timestamp: new Date().toISOString()
        });

        // Optional: reflect on Order
        await Order.findOneAndUpdate(
            { "shipment.shipment_id": shipment_id },
            {
                $set: {
                    "shipment.current_status": rec.current_status,
                    "shipment.checkpoints": rec.checkpoints,
                    orderStatus: nextStatus
                }
            }
        );
    }

    return getMockTracking(shipment_id);
}
