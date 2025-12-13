// controllers/orderController.js
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Payment from '../models/settings/payments/Payment.js';
import User from '../models/User.js';
import { refundQueue } from "../middlewares/services/refundQueue.js";
import { splitOrderForPersistence } from "../middlewares/services/orderSplit.js"; // ensure this exists and supports session (see notes)
import { createShiprocketOrder, cancelShiprocketShipment } from "../middlewares/services/shiprocket.js";
import { sendEmail } from "../middlewares/utils/emailService.js"; // ✅ assume you already have an email service
import { allocateWarehousesForOrder } from "../middlewares/utils/warehouseAllocator.js";
import { buildCourierTimeline } from "../controllers/user/userOrderController.js";
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


// export function computeOrderStatus(shipments = []) {
//     if (!shipments || shipments.length === 0) return "Pending";

//     const normalize = (s = "") => s.trim().toLowerCase();

//     // Map numeric status / deliveredAt to proper string
//     const statuses = shipments.map(s => {
//         if (s.deliveredAt) return "Delivered";
//         if (s.status === "cancelled") return "Cancelled"; // your cancelled code
//         if (["shipped", "out for delivery", "in transit"].includes(s.status.toLowerCase()))
//             return "Shipped";

//         // fallback to last tracking_history status
//         const lastTracking = s.tracking_history?.[s.tracking_history.length - 1]?.status;
//         if (lastTracking) return lastTracking;
//         return "Processing";
//     });

//     const total = statuses.length;
//     const count = (s) => statuses.filter(x => normalize(x) === normalize(s)).length;
//     const has = (s) => count(s) > 0;
//     const all = (s) => count(s) === total;

//     if (all("delivered")) return "Delivered";
//     if (all("cancelled")) return "Cancelled";
//     if (statuses.every(s => ["shipped", "out for delivery", "in transit"].includes(normalize(s))))
//         return "Shipped";

//     if (has("delivered") && has("cancelled") && !has("shipped") && !has("processing"))
//         return "Partially Delivered / Cancelled";
//     if (has("delivered") && !has("cancelled"))
//         return "Partially Delivered";
//     if (has("cancelled") && !has("delivered"))
//         return "Partially Cancelled";

//     if (has("shipped") || has("out for delivery") || has("in transit"))
//         return "Processing";

//     return "Processing";
// }
export function computeOrderStatus(shipments = []) {
    if (!Array.isArray(shipments) || shipments.length === 0) {
        return "Pending";
    }

    const normalize = (s = "") => s.toString().trim().toLowerCase();

    let delivered = 0;
    let cancelled = 0;
    let shipped = 0;
    let processing = 0;
    let returned = 0;

    for (const shipment of shipments) {

        /** --------------------
         *  1️⃣ FORWARD STATUS
         * -------------------- */
        const forwardStatus = normalize(shipment.status);

        if (shipment.deliveredAt || forwardStatus === "delivered") {
            delivered++;
        }
        else if (forwardStatus === "cancelled" || forwardStatus === "rto delivered") {
            cancelled++;
        }
        else if (
            ["shipped", "in transit", "out for delivery"].includes(forwardStatus)
        ) {
            shipped++;
        }
        else {
            processing++;
        }

        /** --------------------
         *  2️⃣ RETURNS STATUS
         * -------------------- */
        if (Array.isArray(shipment.returns) && shipment.returns.length > 0) {
            for (const ret of shipment.returns) {
                const rStatus = normalize(ret.status);

                if (
                    ["refund_initiated", "refunded"].includes(rStatus)
                ) {
                    returned++;
                }
            }
        }
    }

    const total = shipments.length;

    /** --------------------
     *  3️⃣ FINAL ORDER STATUS
     * -------------------- */

    // ✅ Fully Delivered
    if (delivered === total && cancelled === 0) {
        return returned > 0 ? "Returned" : "Delivered";
    }

    // ❌ Fully Cancelled
    if (cancelled === total) {
        return "Cancelled";
    }

    // ⚠️ Partial cases
    if (delivered > 0 && cancelled > 0) {
        return "Partially Delivered / Cancelled";
    }

    if (delivered > 0 && delivered < total) {
        return "Partially Delivered";
    }

    if (cancelled > 0 && cancelled < total) {
        return "Partially Cancelled";
    }

    // 🚚 Shipping in progress
    if (shipped > 0) {
        return "Shipped";
    }

    // 🔄 Default
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

        const order = await Order.findById(orderId).populate("user").populate("products.productId");
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });
        if (order.adminConfirmed) return res.status(400).json({ success: false, message: "Order already confirmed" });
        if (order.orderStatus === "Cancelled") return res.status(400).json({ success: false, message: "Cannot confirm cancelled order" });

        await session.withTransaction(async () => {
            const txOrder = await Order.findById(orderId).session(session).populate("products.productId").populate("user");
            if (!txOrder) throw new Error("Order disappeared during transaction");
            // ⭐ GET ALLOCATION MAP (warehouse wise)
            const allocationMap = await allocateWarehousesForOrder(txOrder);

            // ⭐ DEDUCT STOCK PER WAREHOUSE
            for (let i = 0; i < txOrder.products.length; i++) {
                const item = txOrder.products[i];
                const productId = item.productId._id || item.productId;
                const allocations = allocationMap[i]; // [{ warehouseCode, qty }]

                const product = await Product.findById(productId).session(session);
                if (!product) throw new Error(`Product not found: ${productId}`);

                // find variant
                let variant = null;
                if (item.variant?.sku) {
                    variant = product.variants.find(v => v.sku === item.variant.sku);
                }
                if (!variant) variant = product.variants?.[0];
                if (!variant) throw new Error(`Variant missing for: ${productId}`);

                // deduct from each warehouse
                for (const alloc of allocations) {
                    const { warehouseCode, qty } = alloc;

                    const wh = variant.stockByWarehouse.find(w => w.warehouseCode === warehouseCode);

                    if (!wh || wh.stock < qty) {
                        throw Object.assign(
                            new Error(`Insufficient stock in warehouse ${warehouseCode} for SKU ${variant.sku}`),
                            { step: "STOCK" }
                        );
                    }

                    // deduct
                    wh.stock -= qty;
                }

                // update global stock = sum of warehouse stock
                variant.stock = variant.stockByWarehouse.reduce((s, w) => s + Number(w.stock || 0), 0);

                // update product quantity
                product.quantity = product.variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);

                // sales count
                const totalQty = allocations.reduce((s, a) => s + a.qty, 0);
                variant.sales = (variant.sales || 0) + totalQty;
                product.sales = (product.sales || 0) + totalQty;

                // status update
                if (product.quantity <= 0) product.status = "Out of stock";
                else if (product.thresholdValue && product.quantity < product.thresholdValue)
                    product.status = "Low stock";
                else product.status = "In-stock";

                await product.save({ session });
            }

            // Create splitOrders in-session (ensure your util supports session).
            if (typeof splitOrderForPersistence === "function") {
                await splitOrderForPersistence(txOrder, { session });
            }

            // If COD and not paid, create a Payment doc
            if (txOrder.paymentMethod === "COD" && !txOrder.paid) {
                const [paymentDoc] = await Payment.create([{
                    order: txOrder._id,
                    method: "COD",
                    status: "Pending",
                    amount: txOrder.amount
                }], { session });
                if (paymentDoc) txOrder.paymentId = paymentDoc._id;
            }

            txOrder.adminConfirmed = true;
            txOrder.orderStatus = "Processing";
            txOrder.isDraft = false;
            txOrder.tracking_history = txOrder.tracking_history || [];
            txOrder.tracking_history.push({ status: "Admin Confirmed", timestamp: new Date(), location: `Admin:${adminUser?._id || "system"}` });

            // Clear user's cart
            if (txOrder.user && txOrder.user._id) {
                await User.updateOne({ _id: txOrder.user._id }, { $set: { cart: [] } }, { session });
            }

            await txOrder.save({ session });
        }); // end transaction

        // After commit: create Shiprocket orders (your service will update Order.shipments itself)
        const finalOrder = await Order.findById(orderId).populate("user").populate("products.productId");

        try {
            const shiprocketRes = await createShiprocketOrder(finalOrder);

            // ❗ If Shiprocket failed any shipment
            if (shiprocketRes.failed && shiprocketRes.failed.length > 0) {
                console.error("Shiprocket API failed for order:", finalOrder._id, shiprocketRes.failed);
                throw new Error("Shiprocket shipment creation failed. Order not confirmed.");
            }
            if (Array.isArray(shiprocketRes?.shipments) && shiprocketRes.shipments.length > 0) {
                await Order.updateOne(
                    { _id: finalOrder._id },
                    {
                        $push: {
                            tracking_history: {
                                status: "Shipment Created",
                                timestamp: new Date(),
                                location: "Shiprocket"
                            }
                        }
                    },
                    { timestamps: false }
                );

                // ⭐ Recalculate order status based on new shipments
                const updated = await Order.findById(finalOrder._id).populate("shipments");
                const finalStatus = computeOrderStatus(updated.shipments || []);

                await Order.updateOne(
                    { _id: finalOrder._id },
                    { $set: { orderStatus: finalStatus } },
                    { timestamps: false }
                );
            }


            // ❌ PARTIAL FAILURE
            else if (shiprocketRes?.failed?.length) {
                await Order.updateOne(
                    { _id: finalOrder._id },
                    {
                        $push: {
                            tracking_history: {
                                status: "Shipment Creation Failed",
                                timestamp: new Date(),
                                location: "Shiprocket"
                            }
                        }
                    },
                    { timestamps: false }
                );
            }

            // ⚠️ NO SHIPMENTS CREATED
            else {
                await Order.updateOne(
                    { _id: finalOrder._id },
                    {
                        $push: {
                            tracking_history: {
                                status: "Shipment Creation Skipped",
                                timestamp: new Date(),
                                location: "System"
                            }
                        }
                    },
                    { timestamps: false }
                );


            }

        } catch (shipErr) {
            console.error("Shiprocket post-confirm error:", shipErr);

            await Order.updateOne(
                { _id: finalOrder._id },
                {
                    $push: {
                        tracking_history: {
                            status: "Shipment Creation Failed",
                            timestamp: new Date(),
                            location: "Shiprocket"
                        }
                    }
                },
                { timestamps: false } // 🚀 PREVENTS UPDATEDAT FROM BEING TOUCHED
            );

        }



        // notify user
        try {
            await sendEmail(
                finalOrder.user.email,
                "Order Confirmed & Shipped",
                `<p>Hi ${finalOrder.user.name},</p>
                 <p>Your order <strong>#${finalOrder._id}</strong> is confirmed and shipment is being created. We'll update you with tracking details shortly.</p>
                 <p>Regards,<br/>Team Joyory Beauty</p>`
            );
        } catch (e) { console.warn("Email error:", e); }

        const refreshed = await Order.findById(orderId).populate("user").populate("products.productId").populate("shipments.products.productId");
        return res.json({ success: true, message: "Order confirmed and shipment initiated", order: refreshed });
    } catch (err) {
        console.error("adminConfirmOrder error:", err);
        if (err.step === "STOCK") {
            return res.status(400).json({ success: false, message: err.message || "Insufficient stock" });
        }
        return res.status(500).json({ success: false, message: err.message || "Internal error" });
    } finally {
        try { await session.endSession(); } catch (e) { }
    }
};

export const adminCancelOrder = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const orderId = req.params.id;
        const { reason } = req.body;
        const adminId = req.user?._id;

        const order = await Order.findById(orderId)
            .populate("products.productId")
            .populate("user");

        if (!order)
            return res.status(404).json({ success: false, message: "Order not found" });

        if (order.orderStatus === "Cancelled")
            return res.status(400).json({ success: false, message: "Order already cancelled" });

        // Cannot cancel after shipped
        const nonCancelable = ["Shipped", "Out for Delivery", "Delivered"];
        if (nonCancelable.includes(order.orderStatus)) {
            return res.status(400).json({
                success: false,
                message: `Order cannot be cancelled once ${order.orderStatus}`,
            });
        }

        await session.withTransaction(async () => {
            const txOrder = await Order.findById(orderId)
                .session(session)
                .populate("products.productId");

            if (!txOrder) throw new Error("Order disappeared during transaction");

            // ⭐ REVERSE STOCK + SALES ONLY IF ADMIN CONFIRMED
            if (txOrder.adminConfirmed) {
                for (const item of txOrder.products) {
                    const product = await Product.findById(item.productId._id).session(session);
                    if (!product) continue;

                    const qty = Number(item.quantity || 0);

                    if (item.variant?.sku) {
                        const variantIndex = product.variants.findIndex(v => v.sku === item.variant.sku);
                        if (variantIndex !== -1) {
                            const variant = product.variants[variantIndex];

                            // Restore stock
                            variant.stock += qty;

                            // Decrease sales count
                            variant.sales = Math.max(0, (variant.sales || 0) - qty);
                        }
                    } else {
                        product.quantity += qty;
                    }

                    // Product-wide sales rollback
                    product.sales = Math.max(0, (product.sales || 0) - qty);

                    // Update product.quantity (if variants exist)
                    if (product.variants?.length > 0) {
                        product.quantity = product.variants.reduce((s, v) => s + (v.stock || 0), 0);
                    }

                    // Update status
                    if (product.quantity <= 0) product.status = "Out of stock";
                    else if (product.thresholdValue != null && product.quantity < product.thresholdValue)
                        product.status = "Low stock";
                    else product.status = "In-stock";

                    await product.save({ session });
                }
            }

            if (Array.isArray(txOrder.shipments)) {
                for (const sh of txOrder.shipments) {

                    // Use proper ID
                    const srShipmentId = sh.shipment_id;
                    const srOrderId = sh.shiprocket_order_id;

                    try {
                        if (srShipmentId) {
                            await cancelShiprocketShipment(srShipmentId); // Shipment cancel API
                        } else if (srOrderId) {
                            await cancelShiprocketOrder(srOrderId); // Order cancel API
                        }
                    } catch (ex) {
                        console.error("Shiprocket cancel failed:", ex?.response?.data || ex.message);
                    }

                    // Update local
                    sh.status = "Cancelled";
                    sh.tracking_history.push({
                        status: "Cancelled",
                        timestamp: new Date(),
                        location: `Admin:${adminId}`
                    });
                }
            }
            else if (txOrder.shipment?.shiprocket_order_id) {
                // fallback to legacy single shipment field
                try {
                    await cancelShiprocketShipment(txOrder.shipment.shiprocket_order_id);
                } catch (err) {
                    console.error("Shiprocket cancel failed:", err.response?.data || err.message);
                }
            }


            // Payment status
            txOrder.paymentStatus = txOrder.paid ? "refund_requested" : "cancelled";

            txOrder.cancellation = {
                cancelledBy: adminId,
                reason: reason || "Cancelled by admin",
                requestedAt: new Date(),
                allowed: true
            };

            // ⭐ Recompute orderStatus using all shipments mixed statuses
            const finalStatus = computeOrderStatus(txOrder.shipments || []);
            txOrder.orderStatus = finalStatus;

            // Tracking
            txOrder.tracking_history.push({
                status: "Cancelled",
                timestamp: new Date(),
                location: `Admin:${adminId}`
            });

            await txOrder.save({ session });
        });

        // Email notify
        try {
            await sendEmail(
                order.user.email,
                "Order Cancelled",
                `<p>Hi ${order.user.name},</p>
                 <p>Your order #${order.orderId || order._id} has been cancelled by admin.</p>
                 <p>Reason: ${reason || "Cancelled by admin"}</p>`
            );
        } catch (emailErr) {
            console.warn("Email sending failed:", emailErr);
        }

        return res.status(200).json({
            success: true,
            message: order.paid
                ? "Order cancelled. Refund has been requested."
                : "Order cancelled successfully.",
            order
        });

    } catch (err) {
        console.error("adminCancelOrder:", err);
        res.status(500).json({ success: false, message: "Admin cancel failed" });
    } finally {
        await session.endSession();
    }
};


// export const getAllOrders = async (req, res) => {
//     try {
//         const { status, orderType, fromDate, toDate, paid, refundStatus } = req.query;
//         const query = { isDraft: false };

//         if (status && status !== "all") {
//             query.status = status;
//         }

//         if (orderType && orderType !== "all") {
//             query.orderType = orderType;
//         }

//         // NEW REFUND FILTER
//         if (refundStatus && refundStatus !== "all") {
//             query["refund.status"] = refundStatus;
//         }

//         if (paid === "true") {
//             query.$or = [
//                 { paid: true },
//                 { paymentStatus: /paid/i },
//                 { paymentStatus: "success" }
//             ];
//         } else if (paid === "false") {
//             query.$or = [
//                 { paid: false },
//                 { paymentStatus: /pending|failed|cancelled/i }
//             ];
//         }

//         if (fromDate && toDate) {
//             query.date = {
//                 $gte: new Date(fromDate),
//                 $lte: new Date(toDate)
//             };
//         } else if (fromDate) {
//             query.date = { $gte: new Date(fromDate) };
//         } else if (toDate) {
//             query.date = { $lte: new Date(toDate) };
//         }

//         const orders = await Order.find(query)
//             .populate('products.productId', 'name')
//             .sort({ createdAt: -1 });

//         const formatted = orders.map(order => ({
//             _id: order._id,
//             orderId: order.orderId,
//             date: order.date?.toDateString() || "N/A",
//             customerName: order.customerName || "Unknown",
//             status: order.orderStatus,
//             orderType: order.orderType,
//             paid: order.paid,
//             paymentStatus: order.paymentStatus,
//             amount: `₹${order.amount}`,
//             products: order.products.map(p => ({
//                 name: p.productId?.name || 'Unknown',
//                 quantity: p.quantity,
//                 price: `₹${p.price}`
//             }))
//         }));

//         res.status(200).json(formatted);
//     } catch (error) {
//         console.error(error);
//         res.status(500).json({ message: 'Failed to fetch orders', error });
//     }
// };

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
            .populate("products.productId", "name brand category images price variants")
            .populate("affiliate", "name referralCode")
            .populate("discount", "code type value")
            .lean();

        if (!order) return res.status(404).json({ message: "Order not found" });

        // ✅ TIMELINE WITH HUMAN-READABLE SHIPROCKET STATUS
        const timeline = [];

        (order.tracking_history || [])
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
            .forEach(entry => {
                const cleanStatus =
                    shiprocketStatusMap[entry.status] || entry.status;

                const last = timeline[timeline.length - 1];

                if (!last || last.status !== cleanStatus) {
                    timeline.push({
                        status: cleanStatus,
                        timestamp: entry.timestamp,
                        location: entry.location || null
                    });
                }
            });

        // 🧾 SUMMARY
        const summary = {
            orderId: order.orderId || order._id,
            orderNumber: order.orderNumber,
            date: order.date,
            totalAmount: order.amount,

            // Set correct final status
            status: order.orderStatus,
            currentStatus:
                shiprocketStatusMap[order.shipment?.status] ||  // map if numeric
                order.orderStatus ||
                order.shipment?.status ||
                "Pending",

            orderType: order.orderType || "Online",
        };

        // 👤 CUSTOMER
        const customer = {
            id: order.user?._id || null,
            name: order.user?.name || order.customerName || "",
            email: order.user?.email || "",
            phone: order.user?.phone || "",
        };

        // 📦 PRODUCTS WITH VARIANT LOGIC (like getUserOrders)
        const products = order.products.map((p) => {
            const product = p.productId || {};

            // Detect variant if exists
            const variantObj =
                product?.variants?.find(v => String(v.sku) === String(p.variant?.sku));

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
                id: product._id,
                name: product.name,
                brand: product.brand || "Unknown",
                category: product.category,
                image: variantImage,
                quantity: p.quantity,
                price: p.price,
                total: p.quantity * p.price,
                variant: variantName
            };
        });

        // 🚚 SHIPPING
        const shipping = {
            name: order.shippingAddress?.name,
            phone: order.shippingAddress?.phone,
            address: [
                order.shippingAddress?.addressLine1,
                order.shippingAddress?.city,
                order.shippingAddress?.state,
                order.shippingAddress?.pincode,
            ].filter(Boolean).join(", "),
            expectedDelivery: order.expectedDelivery || null,
        };

        // 💳 PAYMENT
        const payment = {
            method: order.paymentMethod || "Not specified",
            status: order.paymentStatus || "Pending",
            transactionId: order.transactionId || null,
            amount: order.amount,
        };

        // 🎁 DISCOUNT
        const discount = order.discount
            ? {
                code: order.discount.code,
                type: order.discount.type,
                value: order.discount.value,
                discountAmount: order.discountAmount || 0,
                buyerDiscountAmount: order.buyerDiscountAmount || 0,
            }
            : null;

        // 🌐 AFFILIATE
        const affiliate = order.affiliate
            ? {
                id: order.affiliate._id,
                name: order.affiliate.name,
                referralCode: order.affiliate.referralCode,
            }
            : null;

        // 🛳️ SHIPMENT WITH HUMAN-READABLE STATUS
        const shipment = order.shipment
            ? {
                courierName: order.shipment.courier_name || null,
                trackingNumber: order.shipment.awb_code || null,

                currentStatus:
                    shiprocketStatusMap[order.shipment.status] ||
                    order.shipment.status ||
                    "Created",

                assignedAt: order.shipment.assignedAt || null,
            }
            : null;

        // 📊 TOTALS
        const subtotal = order.subtotal || 0;

        const shippingCharge = order.shippingCharge || 0;
        const tax = order.taxAmount || 0;

        const totalPrice = order.amount; // FINAL AMOUNT STORED IN ORDER
        const totalSavings = order.totalSavings || 0;   

        // FINAL RESPONSE
        const response = {
            summary,
            customer,
            products,
            shipping,
            payment,
            discount,
            affiliate,
            shipment,
            totals: {
                subtotal,
                shipping: shippingCharge,
                tax,
                totalSavings, // 💥 new field
                totalPrice, // always exactly what customer paid
            },

            timeline,
        };

        res.status(200).json(response);
    } catch (err) {
        console.error("🔥 getOrderById failed:", err);
        res.status(500).json({ message: "Failed to fetch order", error: err.message });
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
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    order.refund.status = "approved";
    order.refund.approvedBy = adminId;
    order.paymentStatus = "refund_initiated";

    order.refund.refundAudit.push({
        status: "approved",
        changedBy: adminId,
        changedByModel: "Admin",
        note: "Admin approved refund request"
    });

    await order.save();

    await refundQueue.add("refund", { orderId });

    // ✅ Send approval email
    await sendEmail(
        order.user.email,
        "✅ Your Refund Has Been Approved",
        `
        <p>Hi ${order.user.name},</p>
        <p>Your refund request for Order <strong>#${order._id}</strong> has been approved by our team.</p>

        <p><strong>Refund Method:</strong> ${order.refund.method === "razorpay"
            ? "Original Payment Method (Razorpay)"
            : order.refund.method === "wallet"
                ? "Joyory Wallet"
                : "Manual UPI"
        }</p>

        <p>Refund processing has begun. You will receive another update once the refund is completed.</p>

        <p>Regards,<br/>Team Joyory Beauty</p>
        `
    );

    res.status(200).json({
        success: true,
        message: "Refund approved and added to queue."
    });
};

export const getAllRefundRequests = async (req, res) => {
    try {
        const { fromDate, toDate } = req.query;
        const matchQuery = { "refund.status": { $exists: true } };

        // ✅ Optional date filter
        if (fromDate || toDate) {
            matchQuery.createdAt = {};
            if (fromDate) matchQuery.createdAt.$gte = new Date(fromDate);
            if (toDate) matchQuery.createdAt.$lte = new Date(toDate);
        }

        // ✅ Fetch all refund orders
        const refunds = await Order.find(matchQuery)
            .populate("user", "name email phone")
            .populate("refund.refundAudit.changedBy", "name email")
            .select("orderId user amount refund cancellation orderStatus paymentStatus createdAt")
            .sort({ createdAt: -1 });

        // ✅ Aggregate to get counts & totals for all statuses
        const refundStats = await Order.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: "$refund.status",
                    count: { $sum: 1 },
                    totalAmount: { $sum: "$amount" },
                },
            },
        ]);

        // ✅ Cancelled order count
        const cancelledOrders = await Order.countDocuments({ orderStatus: "Cancelled" });

        // ✅ Extract data for approved and rejected refunds
        const approved = refundStats.find(s => s._id === "approved") || { count: 0, totalAmount: 0 };
        const rejected = refundStats.find(s => s._id === "rejected") || { count: 0, totalAmount: 0 };

        // ✅ Total refund requests (all statuses)
        const totalRefundRequests = refundStats.reduce((sum, s) => sum + s.count, 0);

        // ✅ Final response
        res.status(200).json({
            success: true,
            message: "Refund summary fetched successfully",
            summary: {
                totalRefundRequests,               // total refunds overall
                approvedRefundCount: approved.count,   // ✅ approved count
                totalApprovedAmount: approved.totalAmount, // ✅ approved amount
                rejectedRefundCount: rejected.count, // ✅ rejected count
                cancelledOrders,                   // ✅ cancelled orders count
            },
            count: refunds.length,
            refunds,
        });

    } catch (err) {
        console.error("getAllRefundRequests error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch refund summary",
        });
    }
};

export const adminRejectRefund = async (req, res) => {
    try {
        const { orderId, rejectionReason } = req.body;
        const adminId = req.user?._id;

        const order = await Order.findById(orderId).populate("user");
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });

        if (order.refund.status === "completed")
            return res.status(400).json({ success: false, message: "Refund already completed" });

        order.refund.status = "rejected";
        order.refund.approvedBy = adminId;
        order.paymentStatus = "refund_failed";
        order.refund.rejectionReason = rejectionReason || "Refund rejected by admin";

        order.refund.refundAudit.push({
            status: "rejected",
            changedBy: adminId,
            changedByModel: "Admin",
            note: `Refund rejected: ${rejectionReason || "Not specified"}`
        });


        await order.save();

        // ✅ Send rejection email to user
        await sendEmail(
            order.user.email,
            "❌ Refund Request Rejected",
            `
      <p>Hi ${order.user.name},</p>
      <p>Your refund request for Order <strong>#${order._id}</strong> has been reviewed and unfortunately <strong>rejected</strong>.</p>
      <p><strong>Reason:</strong> ${rejectionReason || "Not specified"}</p>

      <p>If you believe this was a mistake, please contact our support team with your order details.</p>

      <p>Regards,<br/>Team Joyory Beauty</p>
      `
        );

        res.status(200).json({
            success: true,
            message: "Refund rejected successfully and user notified.",
        });

    } catch (err) {
        console.error("adminRejectRefund error:", err);
        res.status(500).json({ success: false, message: "Refund rejection failed" });
    }
};
