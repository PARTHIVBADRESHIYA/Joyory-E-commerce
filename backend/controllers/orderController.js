// controllers/orderController.js
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Payment from '../models/settings/payments/Payment.js';
import Wallet from '../models/Wallet.js';
import User from '../models/User.js';
import { addOrderRefundJob } from "../middlewares/services/orderRefundQueue.js";
import { splitOrderForPersistence } from "../middlewares/services/orderSplit.js"; // ensure this exists and supports session (see notes)
// import { createShiprocketOrder, cancelShiprocketShipment } from "../middlewares/services/shiprocket.js";
import { sendEmail } from "../middlewares/utils/emailService.js"; // ✅ assume you already have an email service
import { allocateWarehousesForOrder } from "../middlewares/utils/warehouseAllocator.js";
import { buildCourierTimeline } from "../controllers/user/userOrderController.js";
import { createDelhiveryShipment, cancelDelhiveryShipment } from "../middlewares/services/delhiveryService.js";


const shiprocketStatusMap = {
    0: "Not Picked",
    1: "Pickup Scheduled",
    2: "Pickup Error",
    3: "Picked Up",
    4: "In Transit",
    5: "Out For Delivery",
    6: "Delivered",
    7: "Cancelled",
    8: "RTO Initiated",
    9: "RTO In Transit",
    10: "RTO Delivered"
};

function buildShipmentsFromAllocation(txOrder, allocationMap) {
    const shipmentMap = {}; // warehouseCode → shipment

    txOrder.products.forEach((orderItem, index) => {
        allocationMap[index].forEach(alloc => {
            const whCode = alloc.warehouseCode;

            if (!shipmentMap[whCode]) {
                shipmentMap[whCode] = {
                    warehouseCode: whCode,
                    provider: "delhivery",
                    status: "Pending",
                    products: [],
                    tracking_history: []
                };
            }

            shipmentMap[whCode].products.push({
                productId: orderItem.productId,
                quantity: alloc.qty,

                // 🔒 PRICE SNAPSHOT
                price: orderItem.price,

                // 🔒 VARIANT SNAPSHOT
                variant: {
                    sku: orderItem.variant?.sku,
                    shadeName: orderItem.variant?.shadeName,
                    hex: orderItem.variant?.hex,
                    image: orderItem.variant?.image,

                    originalPrice: orderItem.variant?.originalPrice,
                    discountedPrice: orderItem.variant?.discountedPrice,
                    displayPrice: orderItem.variant?.displayPrice,

                    discountPercent: orderItem.variant?.discountPercent,
                    discountAmount: orderItem.variant?.discountAmount
                }
            });
        });
    });

    return Object.values(shipmentMap);
}

// export function computeOrderStatus(shipments = []) {
//     if (!Array.isArray(shipments) || shipments.length === 0) {
//         return "Pending";
//     }

//     const normalize = (s = "") => s.toString().trim().toLowerCase();

//     let delivered = 0;
//     let cancelled = 0;
//     let shipped = 0;
//     let processing = 0;
//     let returned = 0;
//     let rto = 0;

//     for (const shipment of shipments) {

//         /** --------------------
//          *  1️⃣ FORWARD STATUS
//          * -------------------- */
//         const forwardStatus = normalize(shipment.status);

//         if (shipment.deliveredAt || forwardStatus === "delivered") {
//             delivered++;
//         }
//         else if (forwardStatus === "cancelled") {
//             cancelled++;
//         }
//         else if (forwardStatus.includes("rto")) {
//             rto++;
//         }

//         else if (
//             ["shipped", "in transit", "out for delivery"].includes(forwardStatus)
//         ) {
//             shipped++;
//         }
//         else {
//             processing++;
//         }

//         /** --------------------
//          *  2️⃣ RETURNS STATUS
//          * -------------------- */
//         if (Array.isArray(shipment.returns) && shipment.returns.length > 0) {
//             for (const ret of shipment.returns) {
//                 const rStatus = normalize(ret.status);

//                 if (
//                     ["refund_initiated", "refunded"].includes(rStatus)
//                 ) {
//                     returned++;
//                 }
//             }
//         }
//     }

//     const total = shipments.length;

//     /** --------------------
//      *  3️⃣ FINAL ORDER STATUS
//      * -------------------- */

//     // ✅ Fully Delivered (no cancellation)
//     if (delivered === total && cancelled === 0) {
//         return "Delivered";
//     }

//     // ♻️ Fully Returned (all delivered + all returned)
//     if (returned === total && delivered === total) {
//         return "Returned";
//     }


//     // ❌ Fully Cancelled
//     if (cancelled === total) {
//         return "Cancelled";
//     }

//     // ⚠️ Partial cases
//     if (delivered > 0 && cancelled > 0) {
//         return "Partially Delivered / Cancelled";
//     }

//     if (delivered > 0 && delivered < total) {
//         return "Partially Delivered";
//     }

//     if (cancelled > 0 && cancelled < total) {
//         return "Partially Cancelled";
//     }

//     // 🚚 Shipping in progress
//     if (shipped > 0) {
//         return "Shipped";
//     }

//     // 🔄 Default
//     return "Processing";
// }


export function computeOrderStatus(order) {
    const shipments = order.shipments || [];
    const normalize = (s = "") => s.toString().trim().toLowerCase();

    // 🔥 Only treat as cancelled if cancellation.status === "cancelled"
    if (order.cancellation?.status === "cancelled") {
        return "Cancelled";
    }

    if (!Array.isArray(shipments) || shipments.length === 0) {
        return "Pending";
    }

    let delivered = 0;
    let cancelled = 0;
    let shipped = 0;
    let returned = 0;

    for (const shipment of shipments) {
        const forwardStatus = normalize(shipment.status);

        if (shipment.deliveredAt || forwardStatus === "delivered") {
            delivered++;
        } else if (forwardStatus === "cancelled") {
            cancelled++;
        } else if (
            ["shipped", "in transit", "out for delivery"].includes(forwardStatus)
        ) {
            shipped++;
        }

        if (Array.isArray(shipment.returns)) {
            for (const ret of shipment.returns) {
                const rStatus = normalize(ret.status);
                if (["refund_initiated", "refunded"].includes(rStatus)) {
                    returned++;
                }
            }
        }
    }

    const total = shipments.length;

    if (returned === total && delivered === total) return "Returned";
    if (delivered === total && cancelled === 0) return "Delivered";
    if (cancelled === total) return "Cancelled";

    if (delivered > 0 && cancelled > 0) return "Partially Delivered / Cancelled";
    if (delivered > 0 && delivered < total) return "Partially Delivered";
    if (cancelled > 0 && cancelled < total) return "Partially Cancelled";

    if (shipped > 0) return "Shipped";

    return "Processing";
}

export const adminListOrders = async (req, res) => {
    try {
        const { page = 1, limit = 20, search } = req.query;

        const q = {
            orderStatus: "Awaiting Admin Confirmation",   // FIXED ✔
            isDraft: false
        };

        // 🔍 Search filters
        if (search) {
            q.$or = [
                { "user.name": new RegExp(search, "i") },
                { orderId: new RegExp(search, "i") },
                { _id: new RegExp(search, "i") }
            ];
        }

        // 🟦 Fetch orders
        const orders = await Order.find(q)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .populate("user")
            .populate("products.productId", "name");

        const total = await Order.countDocuments(q);

        // 🟩 Format like getAllOrders
        const formatted = orders.map(order => ({
            _id: order._id,
            orderId: order.orderId,
            date: order.date?.toDateString() || "N/A",
            customerName: order.user?.name || order.customerName || "Unknown",
            status: order.orderStatus,
            orderType: order.orderType,
            paid: order.paid,
            paymentStatus: order.paymentStatus,
            amount: `₹${order.amount}`,
            products: order.products.map(p => ({
                name: p.productId?.name || 'Unknown',
                quantity: p.quantity,
                price: `₹${p.price}`
            }))
        }));

        res.json({
            success: true,
            data: formatted,
            meta: {
                page: Number(page),
                limit: Number(limit),
                total
            }
        });

    } catch (err) {
        console.error("adminListOrders:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

export const adminConfirmOrder = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        const { id: orderId } = req.params;
        const adminUser = req.user;

        /* --------------------------------
           🔍 PRE CHECK
        -------------------------------- */
        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });
        if (order.adminConfirmed) return res.status(400).json({ success: false, message: "Order already confirmed" });
        if (order.orderStatus === "Cancelled") return res.status(400).json({ success: false, message: "Order cancelled" });

        /* --------------------------------
           🔁 TRANSACTION
        -------------------------------- */
        await session.withTransaction(async () => {

            const txOrder = await Order.findById(orderId)
                .session(session)
                .populate("products.productId")
                .populate("user");

            if (!txOrder) throw new Error("Order disappeared during transaction");

            /* ---------- STOCK DEDUCTION ---------- */
            const allocationMap = await allocateWarehousesForOrder(txOrder);

            for (let i = 0; i < txOrder.products.length; i++) {
                const item = txOrder.products[i];
                const product = await Product.findById(item.productId._id).session(session);

                if (!product) throw new Error("Product missing");

                let variant =
                    item.variant?.sku
                        ? product.variants.find(v => v.sku === item.variant.sku)
                        : product.variants?.[0];

                if (!variant) throw new Error("Variant missing");

                for (const alloc of allocationMap[i]) {
                    const wh = variant.stockByWarehouse.find(w => w.warehouseCode === alloc.warehouseCode);
                    if (!wh || wh.stock < alloc.qty) {
                        throw Object.assign(new Error("Insufficient stock"), { step: "STOCK" });
                    }
                    wh.stock -= alloc.qty;
                }

                variant.stock = variant.stockByWarehouse.reduce((s, w) => s + w.stock, 0);
                product.quantity = product.variants.reduce((s, v) => s + v.stock, 0);

                variant.sales = (variant.sales || 0) + item.quantity;

                await product.save({ session });
            }

            txOrder.shipments = buildShipmentsFromAllocation(txOrder, allocationMap);

            /* ---------- CREATE SHIPMENTS (🔥 FIX) ---------- */
            if (!txOrder.shipments || txOrder.shipments.length === 0) {
                txOrder.shipments = txOrder.splitOrders.map(split => ({
                    provider: "delhivery",
                    status: "Pending",
                    products: split.items.map(i => {

                        const orderItem = txOrder.products.find(p =>
                            p.productId._id
                                ? p.productId._id.toString() === i.productId.toString()
                                : p.productId.toString() === i.productId.toString()
                        );

                        if (!orderItem) {
                            console.error("❌ SNAPSHOT FAIL DEBUG", {
                                splitProductId: i.productId.toString(),
                                orderProducts: txOrder.products.map(p => ({
                                    id: p.productId._id?.toString?.() || p.productId.toString()
                                }))
                            });
                            throw new Error("Order item missing while creating shipment snapshot");
                        }

                        return {
                            productId: orderItem.productId,
                            quantity: i.qty,

                            // 🔒 PRICE SNAPSHOT
                            price: orderItem.price,

                            // 🔒 VARIANT SNAPSHOT (FREEZE IT)
                            variant: {
                                sku: orderItem.variant?.sku,
                                shadeName: orderItem.variant?.shadeName,
                                hex: orderItem.variant?.hex,
                                image: orderItem.variant?.image,

                                originalPrice: orderItem.variant?.originalPrice,
                                discountedPrice: orderItem.variant?.discountedPrice,
                                displayPrice: orderItem.variant?.displayPrice,

                                discountPercent: orderItem.variant?.discountPercent,
                                discountAmount: orderItem.variant?.discountAmount
                            }
                        };
                    }),
                    tracking_history: []
                }));

            }

            /* ---------- PAYMENT ---------- */
            if (txOrder.paymentMethod === "COD" && !txOrder.paid) {
                const [payment] = await Payment.create([{
                    order: txOrder._id,
                    method: "COD",
                    status: "Pending",
                    amount: txOrder.amount
                }], { session });

                txOrder.paymentId = payment._id;
            }

            txOrder.orderStatus = "Processing";
            txOrder.isDraft = false;

            txOrder.tracking_history = txOrder.tracking_history || [];
            txOrder.tracking_history.push({
                status: "Admin Confirmed",
                timestamp: new Date(),
                location: `Admin:${adminUser?._id}`
            });

            await txOrder.save({ session });

            if (txOrder.user?._id) {
                await User.updateOne({ _id: txOrder.user._id }, { $set: { cart: [] } }, { session });
            }
        });

        /* --------------------------------
           🚚 DELHIVERY CREATION (BLOCKING)
        -------------------------------- */
        const finalOrder = await Order.findById(orderId)
            .populate("user")
            .populate("shipments.products.productId");

        console.log("🚚 DELHIVERY START — Shipments:", finalOrder.shipments.length);

        for (const shipment of finalOrder.shipments) {
            const baseOrderId = finalOrder.customOrderId || `JOY-${finalOrder._id.toString()}`;
            const shipmentOrderId = `${baseOrderId}-S${shipment._id.toString().slice(-4)}`;

            if (shipment.waybill) continue;

            console.log("📦 Creating Delhivery shipment:", {
                order: finalOrder.orderId,
                shipmentId: shipment._id
            });

            try {

                const items = shipment.products.map(p => {
                    const product = p.productId;
                    const variant =
                        p.variant?.sku
                            ? product.variants.find(v => v.sku === p.variant.sku)
                            : product.variants?.[0];

                    return {
                        name: product.name,
                        sku: variant?.sku || product._id.toString(),
                        quantity: p.quantity,
                        price: variant?.discountedPrice || product.price,
                        category: product.categorySlug || "general"
                    };
                });

                const productDescription = shipment.products
                    .map(p => {
                        const product = p.productId;

                        return [
                            `Product: ${product.name || "Item"}`,
                            `SKU: ${p.variant?.sku || "-"}`,
                            p.variant?.shadeName ? `Shade: ${p.variant.shadeName}` : null,
                            `Qty: ${p.quantity}`,
                            `Price: ₹${p.variant?.displayPrice || p.price}`,
                        ]
                            .filter(Boolean)
                            .join("\n");
                    })
                    .join("\n\n"); // blank line between products

                const shipmentTotal = shipment.products.reduce((sum, p) => {
                    const unitPrice =
                        p.variant?.displayPrice ??
                        p.variant?.discountedPrice ??
                        p.price;

                    return sum + unitPrice * p.quantity;
                }, 0);

                shipment.shipment_value = shipmentTotal;

                shipment.cod_amount =
                    finalOrder.paymentMethod === "COD"
                        ? shipmentTotal
                        : 0;

                await finalOrder.save(); // 🔒 SNAPSHOT FREEZE

                const payload = {
                    order: {
                        order_id: shipmentOrderId,
                        payment_mode: finalOrder.paymentMethod === "COD" ? "COD" : "Prepaid",
                        total_amount: shipment.shipment_value
                    },
                    pickup: JSON.parse(process.env.WAREHOUSE_JSON),
                    shipping_address: {
                        name: finalOrder.shippingAddress.name,
                        address: finalOrder.shippingAddress.addressLine1,
                        city: finalOrder.shippingAddress.city,
                        state: finalOrder.shippingAddress.state,
                        pincode: finalOrder.shippingAddress.pincode,
                        phone: finalOrder.shippingAddress.phone
                    },
                    customer: {
                        email: finalOrder.user.email
                    },
                    items,
                    productDescription // 🔥 ADD THIS

                };

                console.log("📤 DELHIVERY PAYLOAD:", JSON.stringify(payload, null, 2));




                const delhiveryRes = await createDelhiveryShipment(payload);

                if (!delhiveryRes?.waybill) {
                    throw new Error(`Delhivery failed: ${JSON.stringify(delhiveryRes)}`);
                }

                console.log("✅ DELHIVERY RESPONSE:", delhiveryRes);

                shipment.provider = "delhivery";
                shipment.waybill = delhiveryRes.waybill;
                shipment.delhivery_pickup_id = delhiveryRes.pickup_id;
                shipment.tracking_url = delhiveryRes.tracking_url;
                shipment.status = "Pickup Scheduled";

                shipment.tracking_history = shipment.tracking_history || [];
                shipment.tracking_history.push({
                    status: "Shipment Created",
                    timestamp: new Date(),
                    location: "Delhivery"
                });

            } catch (err) {
                console.error("❌ DELHIVERY ERROR:", err.message);

                // 🔥 HARD BLOCK — DO NOT CONFIRM ORDER
                return res.status(500).json({
                    success: false,
                    message: "Delhivery shipment creation failed",
                    error: err.message
                });
            }
        }

        finalOrder.adminConfirmed = true;

        finalOrder.orderStatus = "Awaiting Pickup";
        finalOrder.tracking_history = finalOrder.tracking_history || [];

        finalOrder.tracking_history.push({
            status: "Shipment Created",
            timestamp: new Date(),
            location: "Delhivery"
        });
        await finalOrder.save();

        return res.json({
            success: true,
            message: "Order confirmed & Delhivery shipment created",
            order: finalOrder
        });

    } catch (err) {
        console.error("🔥 ADMIN CONFIRM ERROR:", err);
        return res.status(500).json({ success: false, message: err.message });
    } finally {
        await session.endSession();
    }
};

export const adminCancelOrder = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        const { id: orderId } = req.params;
        const { reason } = req.body;
        const adminId = req.user._id;

        const order = await Order.findById(orderId).populate("user");
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        await session.withTransaction(async () => {
            const txOrder = await Order.findById(orderId)
                .session(session)
                .populate("products.productId");

            if (!txOrder) throw new Error("Order missing in transaction");

            /* --------------------------------
               🔁 CANCEL ALL SHIPMENTS
            -------------------------------- */
            const nonCancelableShipmentStates = [
                "Picked Up",
                "In Transit",
                "Out for Delivery",
                "Delivered"
            ];

            for (const shipment of txOrder.shipments) {

                // Idempotent
                if (shipment.status === "Cancelled") continue;

                // 🚫 Block if ANY shipment is already moving
                if (nonCancelableShipmentStates.includes(shipment.status)) {
                    throw new Error(
                        `Order cannot be cancelled because shipment ${shipment.waybill} is already ${shipment.status}`
                    );
                }

                // 🚚 Cancel at Delhivery
                if (shipment.provider === "delhivery" && shipment.waybill) {
                    await cancelDelhiveryShipment(shipment.waybill);
                }

                // 📦 Update shipment locally
                shipment.status = "Cancelled";
                shipment.tracking_history.push({
                    status: "Cancelled",
                    timestamp: new Date(),
                    location: `Admin`,
                    description: reason || "Cancelled by admin"
                });
            }

            /* --------------------------------
               🔁 STOCK ROLLBACK
            -------------------------------- */
            /* --------------------------------
     🔁 STOCK ROLLBACK (WAREHOUSE SAFE)
  -------------------------------- */
            if (txOrder.adminConfirmed) {
                for (const shipment of txOrder.shipments) {
                    for (const item of shipment.products) {

                        const product = await Product.findById(item.productId._id)
                            .session(session);

                        if (!product) continue;

                        const variant = item.variant?.sku
                            ? product.variants.find(v => v.sku === item.variant.sku)
                            : null;

                        if (!variant) continue;

                        const qty = Number(item.quantity || 0);

                        // 🔁 Restore stock to correct warehouse
                        if (shipment.warehouseCode) {
                            const wh = variant.stockByWarehouse.find(
                                w => w.warehouseCode === shipment.warehouseCode
                            );

                            if (wh) {
                                wh.stock += qty;
                            } else {
                                variant.stockByWarehouse.push({
                                    warehouseCode: shipment.warehouseCode,
                                    stock: qty
                                });
                            }
                        }

                        // 🔁 Recalculate total variant stock
                        variant.stock = variant.stockByWarehouse.reduce(
                            (s, w) => s + w.stock,
                            0
                        );

                        // 🔁 Reverse sales
                        variant.sales = Math.max(0, (variant.sales || 0) - qty);

                        await product.save({ session });
                    }
                }
            }

            /* --------------------------------
               📦 ORDER STATE (DERIVED)
            -------------------------------- */
            txOrder.cancellation = {
                cancelledBy: adminId,
                reason: reason || "Cancelled by admin",
                requestedAt: new Date(),
                allowed: true
            };

            txOrder.orderStatus = computeOrderStatus(txOrder.shipments);

            await txOrder.save({ session });
        });

        // 📧 Email (non-blocking)
        sendEmail(
            order.user.email,
            "Order Cancelled",
            `<p>Your order has been cancelled.</p>
             <p>Reason: ${reason || "Cancelled by admin"}</p>`
        ).catch(console.warn);

        return res.json({
            success: true,
            message: "Order cancelled successfully"
        });

    } catch (err) {
        console.error("ADMIN CANCEL ERROR:", err);
        return res.status(400).json({
            success: false,
            message: err.message
        });
    } finally {
        await session.endSession();
    }
};

export const getAllOrders = async (req, res) => {
    try {
        const { status, orderType, fromDate, toDate, paid, refundStatus } = req.query;
        const query = { isDraft: false };

        if (status && status !== "all") query.orderStatus = status;
        if (orderType && orderType !== "all") query.orderType = orderType;
        if (refundStatus && refundStatus !== "all") query["refund.status"] = refundStatus;

        if (paid === "true") {
            query.$or = [
                { paid: true },
                { paymentStatus: /paid/i },
                { paymentStatus: "success" }
            ];
        } else if (paid === "false") {
            query.$or = [
                { paid: false },
                { paymentStatus: /pending|failed|cancelled/i }
            ];
        }

        if (fromDate && toDate) {
            query.date = { $gte: new Date(fromDate), $lte: new Date(toDate) };
        } else if (fromDate) query.date = { $gte: new Date(fromDate) };
        else if (toDate) query.date = { $lte: new Date(toDate) };

        const orders = await Order.find(query)
            .populate('products.productId', 'name')
            .sort({ createdAt: -1 });

        const formatted = orders.map(order => {
            // compute live status
            const liveStatus = order.shipments?.length > 0
                ? computeOrderStatus(order.shipments)
                : order.orderStatus;

            return {
                _id: order._id,
                orderId: order.orderId,
                date: order.date?.toDateString() || "N/A",
                customerName: order.customerName || "Unknown",
                status: liveStatus, // <-- use computed status
                orderType: order.orderType,
                paid: order.paid,
                paymentStatus: order.paymentStatus,
                amount: `₹${order.amount}`,
                products: order.products.map(p => ({
                    name: p.productId?.name || 'Unknown',
                    quantity: p.quantity,
                    price: `₹${p.price}`
                }))
            };
        });

        res.status(200).json(formatted);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch orders', error });
    }
};

export const getAdminOrderTracking = async (req, res) => {
    try {
        const { id } = req.params;

        const order = await Order.findById(id)
            .populate("shipments.products.productId")
            .lean();

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        const shipments = order.shipments || [];

        // ----------------------------
        // 1. Build shipment-wise timeline WITH PRODUCT DETAILS
        // ----------------------------
        const shipmentBlocks = shipments.map((s, i) => {

            const products = (s.products || []).map(item => {
                const p = item.productId || {};
                const variant = item.variant || {};

                return {
                    productId: p._id,
                    name: p.name || item.name,
                    image: variant.image || p.images?.[0] || null,
                    qty: item.quantity,
                    price: item.price,

                    variant: {
                        sku: variant.sku || null,
                        shadeName: variant.shadeName || null,
                        hex: variant.hex || null
                    },

                    mrp: variant.originalPrice || 0,
                    sellingPrice: variant.displayPrice || 0,
                    total: (variant.displayPrice || 0) * (item.quantity || 1)
                };
            });

            return {
                shipmentId: s.shipment_id,
                label: `Shipment ${i + 1}`,
                courier: s.courier_name || null,
                awb: s.awb_code || null,
                expectedDelivery: s.expected_delivery || null,
                status: s.status,

                products,  // ⬅⬅⬅ ADDED PRODUCT DETAILS INSIDE SHIPMENT

                timeline: buildCourierTimeline(s.tracking_history || [])
            };
        });

        // ----------------------------
        // 2. Build merged timeline
        // ----------------------------
        let mergedTimeline = [];

        shipments.forEach((s, i) => {
            (s.tracking_history || []).forEach(event => {
                mergedTimeline.push({
                    shipmentId: s.shipment_id,
                    shipmentLabel: `Shipment ${i + 1}`,
                    courier: s.courier_name || null,
                    status: event.status,
                    location: event.location,
                    timestamp: new Date(event.timestamp || event.createdAt || order.createdAt)
                });
            });
        });

        mergedTimeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        return res.json({
            success: true,
            orderId: order.orderId,
            orderNumber: order.orderNumber,
            createdAt: order.createdAt,

            shipments: shipmentBlocks, // ⬅ now includes full product details
            mergedTimeline              // full combined status timeline
        });

    } catch (err) {
        console.error("getAdminOrderTracking failed:", err);
        return res.status(500).json({ success: false, message: "Failed to fetch order tracking" });
    }
};

export const getOrderSummary = async (req, res) => {
    try {
        const { range = "7d" } = req.query;

        const now = new Date();

        const buildRange = (r) => {
            const end = new Date(now);
            const start = new Date(now);
            switch (r) {
                case "1d": start.setDate(now.getDate() - 1); break;
                case "7d": start.setDate(now.getDate() - 7); break;
                case "1m": start.setMonth(now.getMonth() - 1); break;
                case "1y": start.setFullYear(now.getFullYear() - 1); break;
                default: start.setDate(now.getDate() - 7);
            }
            return { start, end };
        };

        const { start: currentStart, end: currentEnd } = buildRange(range);

        const buildPrevRange = (r, currentStart) => {
            const prevEnd = new Date(currentStart);
            const prevStart = new Date(currentStart);
            switch (r) {
                case "1d": prevStart.setDate(prevEnd.getDate() - 1); break;
                case "7d": prevStart.setDate(prevEnd.getDate() - 7); break;
                case "1m": prevStart.setMonth(prevEnd.getMonth() - 1); break;
                case "1y": prevStart.setFullYear(prevEnd.getFullYear() - 1); break;
                default: prevStart.setDate(prevEnd.getDate() - 7);
            }
            return { prevStart, prevEnd };
        };

        const { prevStart, prevEnd } = buildPrevRange(range, currentStart);

        const pctChange = (curr, prev) => {
            if (prev === 0 && curr > 0) return { change: 100, trend: "up" };
            if (prev === 0 && curr === 0) return { change: 0, trend: "no-change" };
            const diff = ((curr - prev) / prev) * 100;
            return {
                change: Number(Math.abs(diff).toFixed(2)),
                trend: diff > 0 ? "up" : diff < 0 ? "down" : "no-change"
            };
        };

        // --------------------------------------------
        // ✅ TOTAL ORDERS
        // --------------------------------------------
        const [totalOrders, prevTotalOrders] = await Promise.all([
            Order.countDocuments({
                isDraft: false,
                createdAt: { $gte: currentStart, $lte: currentEnd }
            }),
            Order.countDocuments({
                isDraft: false,
                createdAt: { $gte: prevStart, $lt: prevEnd }
            })
        ]);

        // --------------------------------------------
        // ✅ FIXED REFUND ORDERS ❗
        // --------------------------------------------
        const refundedFilterCurrent = {
            isDraft: false,
            $or: [
                { paymentStatus: { $in: ["refund_initiated", "refunded"] } },
                { "refund.status": { $in: ["initiated", "completed"] } }
            ],
            updatedAt: { $gte: currentStart, $lte: currentEnd }
        };

        const refundedFilterPrev = {
            isDraft: false,
            $or: [
                { paymentStatus: { $in: ["refund_initiated", "refunded"] } },
                { "refund.status": { $in: ["initiated", "completed"] } }
            ],
            updatedAt: { $gte: prevStart, $lt: prevEnd }
        };

        const [refundOrders, prevRefundOrders] = await Promise.all([
            Order.countDocuments(refundedFilterCurrent),
            Order.countDocuments(refundedFilterPrev)
        ]);

        // --------------------------------------------
        // ✅ FIXED COMPLETED / DELIVERED ORDERS ❗
        // --------------------------------------------
        const completedFilterCurrent = {
            isDraft: false,
            $or: [
                { status: "Delivered" },
                { orderStatus: "Delivered" },
                { "shipment.deliveredAt": { $exists: true } }
            ],
            updatedAt: { $gte: currentStart, $lte: currentEnd }
        };

        const completedFilterPrev = {
            isDraft: false,
            $or: [
                { status: "Delivered" },
                { orderStatus: "Delivered" },
                { "shipment.deliveredAt": { $exists: true } }
            ],
            updatedAt: { $gte: prevStart, $lt: prevEnd }
        };

        const [completedOrders, prevCompletedOrders] = await Promise.all([
            Order.countDocuments(completedFilterCurrent),
            Order.countDocuments(completedFilterPrev)
        ]);

        // --------------------------------------------
        // CANCELLED
        // --------------------------------------------
        const cancelRegex = /cancel/i;

        const cancelledFilterCurrent = {
            isDraft: false,
            $or: [
                { orderStatus: cancelRegex },
                { status: cancelRegex },
                { paymentStatus: cancelRegex },
                { "cancellation.reason": { $exists: true } },
                { "tracking_history.status": cancelRegex }
            ],
            createdAt: { $gte: currentStart, $lte: currentEnd }
        };

        const cancelledFilterPrev = {
            isDraft: false,
            $or: [
                { orderStatus: cancelRegex },
                { status: cancelRegex },
                { paymentStatus: cancelRegex },
                { "cancellation.reason": { $exists: true } },
                { "tracking_history.status": cancelRegex }
            ],
            createdAt: { $gte: prevStart, $lt: prevEnd }
        };

        const [cancelledOrders, prevCancelledOrders] = await Promise.all([
            Order.countDocuments(cancelledFilterCurrent),
            Order.countDocuments(cancelledFilterPrev)
        ]);

        // --------------------------------------------
        // DRAFT
        // --------------------------------------------
        const draftOrders = await Order.countDocuments({ isDraft: true });

        res.json({
            range,

            totalOrders: {
                count: totalOrders,
                change: pctChange(totalOrders, prevTotalOrders),
                note: `Last ${range}`
            },

            refundOrders: {
                count: refundOrders,
                change: pctChange(refundOrders, prevRefundOrders),
                note: `Refunded in ${range}`
            },

            completedOrders: {
                count: completedOrders,
                change: pctChange(completedOrders, prevCompletedOrders),
                note: `Last ${range}`
            },

            cancelledOrders: {
                count: cancelledOrders,
                change: pctChange(cancelledOrders, prevCancelledOrders),
                note: `Last ${range}`
            },

            draftOrders: {
                count: draftOrders,
                note: "Draft / abandoned checkouts"
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Error generating order summary",
            error: error.message
        });
    }
};

export const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;

        const order = await Order.findById(id)
            .populate("user", "name email phone")
            .populate("products.productId", "name brand category images variants")
            .populate("affiliate", "name referralCode")
            .populate("discount", "code type value")
            .lean();

        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        /* -------------------------------------------------
           🕒 TIMELINE (FIXED: Delhivery + multi-shipment)
       /* -------------------------------------------------
   🕒 TIMELINE (Shipment-wise + merged)
-------------------------------------------------- */

        const shipmentTimelines = [];
        const mergedTimeline = [];

        (order.shipments || []).forEach((shipment, index) => {
            const shipmentTimeline = [];

            (shipment.tracking_history || []).forEach(entry => {
                const cleanStatus =
                    shiprocketStatusMap[entry.status] || entry.status;

                const last =
                    shipmentTimeline[shipmentTimeline.length - 1];

                // prevent duplicate consecutive statuses (per shipment)
                if (!last || last.status !== cleanStatus) {
                    const event = {
                        status: cleanStatus,
                        timestamp: entry.timestamp,
                        location: entry.location || null,
                        shipmentIndex: index,
                        waybill: shipment.waybill || null
                    };

                    shipmentTimeline.push(event);
                    mergedTimeline.push(event);
                }
            });

            shipmentTimeline.sort(
                (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
            );

            shipmentTimelines.push({
                shipmentId: shipment._id,
                waybill: shipment.waybill || null,
                provider: shipment.provider,
                courierName: shipment.courier_name || null,
                timeline: shipmentTimeline
            });
        });

        mergedTimeline.sort(
            (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        );


        /* -------------------------------------------------
           📦 LAST SHIPMENT (used for current status)
        -------------------------------------------------- */
        const lastShipment =
            order.shipments?.[order.shipments.length - 1];

        /* -------------------------------------------------
           🧾 SUMMARY (FIXED: removed order.shipment)
        -------------------------------------------------- */
        const summary = {
            orderId: order.orderId || order._id,
            orderNumber: order.orderNumber,
            date: order.date,
            totalAmount: order.amount,

            status: order.orderStatus,

            currentStatus:
                shiprocketStatusMap[lastShipment?.status] ||
                lastShipment?.status ||
                order.orderStatus ||
                "Pending",

            orderType: order.orderType || "Online",
        };

        /* -------------------------------------------------
           👤 CUSTOMER
        -------------------------------------------------- */
        const customer = {
            id: order.user?._id || null,
            name: order.user?.name || order.customerName || "",
            email: order.user?.email || "",
            phone: order.user?.phone || "",
        };

        /* -------------------------------------------------
           📦 PRODUCTS (variant-safe, Nykaa-style)
        -------------------------------------------------- */
        const products = (order.products || []).map(p => {
            const product = p.productId || {};

            const variantObj =
                product.variants?.find(
                    v => String(v.sku) === String(p.variant?.sku)
                ) || null;

            const variantName =
                p.variant?.shadeName ||
                variantObj?.shadeName ||
                null;

            const variantImage =
                variantObj?.image ||
                p.variant?.image ||
                product.images?.[0] ||
                null;

            return {
                id: product._id || null,
                name: product.name || p.name || "",
                brand: product.brand || "Unknown",
                category: product.category || null,
                image: variantImage,
                quantity: p.quantity,
                price: p.price,
                total: p.quantity * p.price,
                variant: variantName,
            };
        });

        /* -------------------------------------------------
           🚚 SHIPPING
        -------------------------------------------------- */
        const shipping = {
            name: order.shippingAddress?.name || "",
            phone: order.shippingAddress?.phone || "",
            address: [
                order.shippingAddress?.addressLine1,
                order.shippingAddress?.city,
                order.shippingAddress?.state,
                order.shippingAddress?.pincode,
            ].filter(Boolean).join(", "),
            expectedDelivery: order.expectedDelivery || null,
        };

        /* -------------------------------------------------
           💳 PAYMENT
        -------------------------------------------------- */
        const payment = {
            method: order.paymentMethod || "Not specified",
            status: order.paymentStatus || "Pending",
            transactionId: order.transactionId || null,
            amount: order.amount,
        };

        /* -------------------------------------------------
           🎁 DISCOUNT
        -------------------------------------------------- */
        const discount = order.discount
            ? {
                code: order.discount.code,
                type: order.discount.type,
                value: order.discount.value,
                discountAmount: order.discountAmount || 0,
                buyerDiscountAmount: order.buyerDiscountAmount || 0,
            }
            : null;

        /* -------------------------------------------------
           🌐 AFFILIATE
        -------------------------------------------------- */
        const affiliate = order.affiliate
            ? {
                id: order.affiliate._id,
                name: order.affiliate.name,
                referralCode: order.affiliate.referralCode,
            }
            : null;

        /* -------------------------------------------------
           🚚 SHIPMENTS (FIXED: plural, Delhivery-ready)
        -------------------------------------------------- */
        const shipments = (order.shipments || []).map(s => ({
            id: s._id,
            type: s.type,
            provider: s.provider,
            courierName: s.courier_name || null,
            trackingNumber: s.waybill || null,
            trackingUrl: s.tracking_url || null,

            currentStatus:
                shiprocketStatusMap[s.status] ||
                s.status ||
                "Created",

            deliveredAt: s.deliveredAt || null,
            hasReturn: Array.isArray(s.returns) && s.returns.length > 0,
        }));

        /* -------------------------------------------------
           📊 TOTALS (matches your stored order math)
        -------------------------------------------------- */
        const totals = {
            subtotal: order.subtotal || 0,
            shipping: order.shippingCharge || 0,
            tax: order.gst?.amount || order.taxAmount || 0,
            totalSavings: order.totalSavings || 0,
            totalPrice: order.amount, // always final paid
        };

        /* -------------------------------------------------
           ✅ FINAL RESPONSE
        -------------------------------------------------- */
        return res.status(200).json({
            summary,
            customer,
            products,
            shipping,
            payment,
            discount,
            affiliate,
            shipments,
            totals,
            timeline: {
                merged: mergedTimeline,
                byShipment: shipmentTimelines
            },
        });

    } catch (err) {
        console.error("🔥 getOrderById failed:", err);
        return res.status(500).json({
            message: "Failed to fetch order",
            error: err.message,
        });
    }
};

export const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, location, courierName, trackingNumber } = req.body;

        // Allowed statuses from orderStatus enum
        const allowedStatuses = [
            "Pending",
            "Awaiting Payment",
            "Paid",
            "Processing",
            "Shipped",
            "Delivered",
            "Cancelled"
        ];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ message: `❌ Invalid status: ${status}` });
        }

        const order = await Order.findById(id);
        if (!order) return res.status(404).json({ message: "Order not found" });

        // 🔹 Only update orderStatus (full workflow)
        order.orderStatus = status;

        // 🔹 Sync legacy status field only when it makes sense
        if (status === "Delivered") order.status = "Delivered";
        if (status === "Cancelled") order.status = "Cancelled";
        if (status === "Pending") order.status = "Pending";
        // leave `Completed` for payment/fulfillment logic only

        // Add tracking history entry
        order.tracking_history.push({
            status,
            location: location || "System Update",
            timestamp: new Date()
        });

        // If shipped, update courier details
        if (status === "Shipped") {
            order.courierName = courierName || order.courierName;
            order.trackingNumber = trackingNumber || order.trackingNumber;
        }

        // If delivered, mark deliveredAt
        if (status === "Delivered") {
            order.shipment = {
                ...order.shipment,
                status: "Delivered",
                deliveredAt: new Date()
            };
        }

        await order.save();

        res.status(200).json({
            message: `✅ Order status updated to "${status}"`,
            order
        });
    } catch (err) {
        console.error("🔥 updateOrderStatus error:", err);
        res.status(500).json({
            message: "Failed to update order status",
            error: err.message
        });
    }
};

export const retryFailedShipments = async (req, res) => {
    try {
        await retryFailedShipments();
        res.json({ success: true, message: "Retried all failed shipments" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}

export const adminApproveRefund = async (req, res) => {
    const { orderId } = req.body;
    const adminId = req.user?._id;

    const order = await Order.findById(orderId).populate("user");
    if (!order) {
        return res.status(404).json({ success: false, message: "Order not found" });
    }

    const refund = order.orderRefund;
    if (!refund || refund.status !== "requested") {
        return res.status(400).json({
            success: false,
            message: "Refund not in requested state"
        });
    }

    // 🔐 COMMON ADMIN APPROVAL FIELDS
    refund.approvedBy = adminId;
    refund.approvedAt = new Date();

    refund.audit_trail.push({
        status: "approved",
        action: "admin_approved_refund",
        performedBy: adminId,
        performedByModel: "Admin",
        notes: `Approved refund via ${refund.method}`
    });

    /* --------------------------------
       🅰️ WALLET REFUND (INSTANT)
    -------------------------------- */
    if (refund.method === "wallet") {

        const wallet = await Wallet.findOne({ user: order.user._id });

        if (!wallet) {
            return res.status(400).json({
                success: false,
                message: "User wallet not found"
            });
        }

        // 💰 CREDIT WALLET
        wallet.joyoryCash += refund.amount;

        wallet.transactions.push({
            type: "REFUND",
            amount: refund.amount,
            mode: "ONLINE",
            description: `Refund for Order ${order.orderNumber || order._id}`
        });

        await wallet.save();

        // ✅ ORDER + REFUND UPDATE
        refund.status = "completed";
        refund.refundedAt = new Date();
        order.paymentStatus = "refunded";
        order.orderStatus = "Cancelled";

        refund.audit_trail.push({
            status: "completed",
            action: "wallet_refund_completed",
            performedByModel: "System",
            notes: `₹${refund.amount} credited to wallet`
        });

        await order.save();


        // 📧 USER EMAIL
        await sendEmail(
            order.user.email,
            "✅ Refund Completed – Wallet Credit",
            `
            <p>Hi ${order.user.name},</p>
            <p>Your refund for Order <strong>#${order._id}</strong> has been successfully credited to your Joyory Wallet.</p>
            <p><strong>Amount:</strong> ₹${refund.amount}</p>
            <p>You can use this balance on your next purchase.</p>
            <p>Regards,<br/>Team Joyory Beauty</p>
            `
        );

        return res.status(200).json({
            success: true,
            message: "Wallet refund completed successfully."
        });
    }

    /* --------------------------------
       🅱️ RAZORPAY REFUND (ASYNC)
    -------------------------------- */
    if (refund.method === "razorpay") {

        if (!order.transactionId?.startsWith("pay_")) {
            throw new Error("Not a Razorpay payment, refund skipped");
        }


        refund.status = "pending"; // 👈 let scanner/worker control it
        refund.lockedAt = null;
        refund.idempotencyKey =
            refund.idempotencyKey || `order_refund_${order._id}`;

        order.paymentStatus = "refund_initiated";
        order.orderStatus = "Cancelled";

        refund.audit_trail.push({
            status: "approved",
            action: "razorpay_refund_approved",
            performedBy: adminId,
            performedByModel: "Admin"
        });

        await order.save();

        // ✅ QUEUE SAFELY
        await addOrderRefundJob(order._id);

        return res.status(200).json({
            success: true,
            message: "Order refund approved and queued"
        });
    }

    return res.status(400).json({
        success: false,
        message: "Invalid refund method"
    });
};


export const adminRejectRefund = async (req, res) => {
    try {
        const { orderId, rejectionReason } = req.body;
        const adminId = req.user?._id;

        const order = await Order.findById(orderId).populate("user");
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        const refund = order.orderRefund;

        if (!refund || !["requested", "pending"].includes(refund.status)) {
            return res.status(400).json({
                success: false,
                message: "Refund cannot be rejected in its current state"
            });
        }

        // ❌ Mark refund as permanently failed
        refund.status = "failed";
        refund.failureReason = rejectionReason || "Rejected by admin";
        refund.lockedAt = null;
        refund.nextRetryAt = null;

        refund.audit_trail.push({
            status: "failed",
            action: "admin_rejected_refund",
            performedBy: adminId,
            performedByModel: "Admin",
            notes: refund.failureReason
        });

        order.paymentStatus = "failed";

        await order.save();

        // 📧 Notify User
        await sendEmail(
            order.user.email,
            "❌ Refund Request Rejected",
            `
            <p>Hi ${order.user.name},</p>
            <p>Your refund request for Order <strong>#${order.orderNumber || order._id}</strong> has been rejected.</p>
            <p><strong>Reason:</strong> ${refund.failureReason}</p>
            <p>If you believe this is incorrect, please contact support.</p>
            <p>Regards,<br/>Team Joyory Beauty</p>
            `
        );

        return res.status(200).json({
            success: true,
            message: "Refund rejected and marked as failed successfully."
        });

    } catch (err) {
        console.error("adminRejectRefund error:", err);
        return res.status(500).json({
            success: false,
            message: "Refund rejection failed"
        });
    }
};

export const getAllRefundRequests = async (req, res) => {
    try {
        const { fromDate, toDate, status } = req.query;

        const matchQuery = {
            "orderRefund.status": { $exists: true }
        };

        if (fromDate || toDate) {
            matchQuery.createdAt = {};
            if (fromDate) matchQuery.createdAt.$gte = new Date(fromDate);
            if (toDate) matchQuery.createdAt.$lte = new Date(toDate);
        }

        // 🔎 Status filter
        if (status) {
            matchQuery["orderRefund.status"] = status;
        }

        // 📦 Fetch all refund orders
        const refunds = await Order.find(matchQuery)
            .populate("user", "name email phone")
            .select("orderNumber user amount orderRefund orderStatus paymentStatus createdAt")
            .sort({ createdAt: -1 });

        // 📊 Refund Statistics
        const refundStats = await Order.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: "$orderRefund.status",
                    count: { $sum: 1 },
                    totalAmount: { $sum: "$orderRefund.amount" }
                }
            }
        ]);

        // Helper
        const getStat = (status) =>
            refundStats.find(s => s._id === status) || { count: 0, totalAmount: 0 };

        const completed = getStat("completed");
        const failed = getStat("failed");
        const processing = getStat("processing");
        const pending = getStat("pending");
        const retrying = getStat("retrying");

        const totalRefundRequests = refundStats.reduce((sum, s) => sum + s.count, 0);

        const cancelledOrders = await Order.countDocuments({ orderStatus: "Cancelled" });

        return res.status(200).json({
            success: true,
            message: "Refund summary fetched successfully",
            summary: {
                totalRefundRequests,
                completedRefunds: completed.count,
                completedAmount: completed.totalAmount,

                failedRefunds: failed.count,
                processingRefunds: processing.count,
                pendingRefunds: pending.count,
                retryingRefunds: retrying.count,

                cancelledOrders
            },
            count: refunds.length,
            refunds
        });

    } catch (err) {
        console.error("getAllRefundRequests error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch refund summary"
        });
    }
};

