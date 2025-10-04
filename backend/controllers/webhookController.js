import crypto from "crypto";
import Order from "../models/Order.js";
import Payment from "../models/settings/payments/Payment.js";
import { io } from "../server.js"; // ✅ import socket.io instance
import { splitOrderForPersistence } from "../middlewares/services/orderSplit.js"; // ✅ your split service

/**
 * 🔹 Razorpay Webhook
 * Handles → payment.captured, payment.failed
 */


// export const razorpayWebhook = async (req, res) => {
//     try {
//         const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
//         const signature = req.headers["x-razorpay-signature"];
//         const rawBody =
//             req.body instanceof Buffer ? req.body.toString() : JSON.stringify(req.body);

//         // 🔹 Verify Razorpay signature (skip in dev if SKIP_SIGNATURE flag set)
//         if (
//             !(process.env.NODE_ENV === "development" ||
//                 process.env.SKIP_SIGNATURE === "true")
//         ) {
//             const expectedSignature = crypto
//                 .createHmac("sha256", secret)
//                 .update(rawBody)
//                 .digest("hex");

//             if (signature !== expectedSignature) {
//                 console.error("❌ Razorpay Webhook Invalid Signature");
//                 return res
//                     .status(400)
//                     .json({ status: "failed", message: "Invalid signature" });
//             }
//         }

//         const eventPayload =
//             typeof req.body === "string" ? JSON.parse(req.body) : req.body;
//         const event = eventPayload.event;

//         console.log("✅ Razorpay Webhook Event:", event);

//         // ================= PAYMENT CAPTURED =================
//         if (event === "payment.captured") {
//             const payment = eventPayload.payload.payment.entity;
//             const order = await Order.findOne({
//                 razorpayOrderId: payment.order_id,
//             }).populate("user");

//             if (!order) {
//                 console.error(
//                     "❌ Order not found for Razorpay orderId:",
//                     payment.order_id
//                 );
//                 return res.status(404).json({ message: "Order not found" });
//             }

//             if (!order.paid) {
//                 order.paid = true;
//                 order.paymentStatus = "success";
//                 order.paymentMethod =
//                     order.paymentMethod === "COD" ? "COD" : "Prepaid";
//                 order.transactionId = payment.id;
//                 order.orderStatus = "Paid";
//                 await order.save();

//                 // ✅ Create Payment record
//                 await Payment.create({
//                     order: order._id,
//                     method: payment.method || "Razorpay",
//                     status: "Completed",
//                     transactionId: payment.id,
//                     amount: payment.amount / 100,
//                     cardHolderName: payment.card?.name,
//                     cardNumber: payment.card?.last4,
//                     expiryDate: payment.card
//                         ? `${payment.card.expiry_month}/${payment.card.expiry_year}`
//                         : undefined,
//                     isActive: true,
//                 });

//                 // ✅ Create seller splitOrders
//                 try {
//                     await splitOrderForPersistence(order);
//                     splitOrderForPersistence(order)
//                     console.log(
//                         `📦 Split orders generated for sellers in Order ${order._id}`
//                     );
//                 } catch (splitErr) {
//                     console.error("❌ Failed to split order for sellers:", splitErr);
//                 }

//                 // ✅ Notify user via socket
//                 io.to(order.user._id.toString()).emit("orderUpdated", {
//                     orderId: order._id,
//                     status: "Paid",
//                     paymentId: payment.id,
//                 });

//                 console.log(
//                     `💰 Order ${order._id} marked Paid, payment saved, socket emitted`
//                 );
//             }
//         }

//         // ================= PAYMENT FAILED =================
//         if (event === "payment.failed") {
//             const payment = eventPayload.payload.payment.entity;
//             const order = await Order.findOne({ razorpayOrderId: payment.order_id });

//             if (order) {
//                 order.paymentStatus = "failed";
//                 order.orderStatus = "Payment Failed";
//                 await order.save();

//                 // ✅ Notify user via socket
//                 io.to(order.user._id.toString()).emit("orderUpdated", {
//                     orderId: order._id,
//                     status: "Payment Failed",
//                 });

//                 console.log(
//                     `⚠️ Order ${order._id} marked Failed & user notified`
//                 );
//             }
//         }

//         return res.status(200).json({ status: "ok" });
//     } catch (err) {
//         console.error("🔥 Razorpay Webhook Error:", err);
//         return res.status(500).json({ status: "error", error: err.message });
//     }
// };

export const razorpayWebhook = async (req, res) => {
    try {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const signature = req.headers["x-razorpay-signature"];

        // raw body (req.body is Buffer because we used express.raw middleware)
        const rawBody = req.body instanceof Buffer ? req.body.toString() : JSON.stringify(req.body);

        // Verify signature (skip only in development if you intentionally set SKIP_SIGNATURE)
        if (!(process.env.NODE_ENV === "development" || process.env.SKIP_SIGNATURE === "true")) {
            const expectedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
            if (signature !== expectedSignature) {
                console.error("❌ Invalid Razorpay Signature (webhook)");
                // respond 200 to avoid retries but mark ignored
                return res.status(200).json({ status: "ignored", reason: "invalid signature" });
            }
        }

        const eventPayload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        const event = eventPayload.event;
        console.log("✅ Razorpay Webhook Event:", event);

        // Handle payment captured (covers regular orders and some payment-link captures)
        if (event === "payment.captured") {
            const payment = eventPayload.payload.payment.entity;

            // find order either by razorpayOrderId (order_id), by payment.link_id (payment link), or by notes.orderId
            const order = await Order.findOne({
                $or: [
                    { razorpayOrderId: payment.order_id },
                    { "paymentLink.id": payment.link_id },
                    { _id: payment.notes?.orderId },
                    { "paymentLink.referenceId": payment.reference_id }, // defensive
                ],
            }).populate("user");

            if (!order) {
                console.error("❌ Order not found for Razorpay payment:", payment.order_id, payment.link_id, payment.notes);
                return res.status(200).json({ status: "ignored", reason: "order not found" });
            }

            if (!order.paid) {
                try {
                    await finalizeOrderPayment(order, payment);
                    console.log(`💰 Order ${order._id} marked Paid (webhook payment.captured)`);
                } catch (err) {
                    console.error("❌ Error during finalizeOrderPayment (webhook):", err);
                }
            }

            // emit socket notify
            try {
                io.to(order.user._id.toString()).emit("orderUpdated", { orderId: order._id, status: "Paid", paymentId: payment.id });
            } catch (err) { /* ignore */ }
        }

        // Handle payment link events (e.g., payment_link.paid: you might get link entity with payments array)
        if (event && event.startsWith("payment_link.")) {
            const linkEntity = eventPayload.payload.payment_link?.entity;
            if (!linkEntity) {
                console.warn("payment_link event with no entity", eventPayload);
                return res.status(200).json({ status: "ok" });
            }

            // update order(s) that reference this payment link
            const order = await Order.findOne({ "paymentLink.id": linkEntity.id }).populate("user");
            if (order) {
                // update link meta on order
                order.paymentLink = order.paymentLink || {};
                order.paymentLink.status = linkEntity.status;
                order.paymentLink.updatedAt = new Date();
                await order.save();
            }

            // If payments array is present (customer paid), iterate and finalize
            if (Array.isArray(linkEntity.payments) && linkEntity.payments.length) {
                for (const p of linkEntity.payments) {
                    try {
                        // p might be simple id or object depending on payload; attempt to fetch payment details
                        const paymentId = p.id || p;
                        const rpPayment = await razorpay.payments.fetch(paymentId);
                        // find corresponding order as above
                        const linkedOrder = order || await Order.findOne({
                            $or: [
                                { razorpayOrderId: rpPayment.order_id },
                                { "paymentLink.id": rpPayment.link_id },
                                { _id: rpPayment.notes?.orderId },
                            ],
                        }).populate("user");

                        if (linkedOrder && !linkedOrder.paid) {
                            await finalizeOrderPayment(linkedOrder, rpPayment);
                            console.log(`💳 Finalized payment for order ${linkedOrder._id} (payment_link event)`);
                        }
                    } catch (err) {
                        console.error("❌ Error handling payment_link payment:", err);
                    }
                }
            }
        }

        // payment.failed -> mark order failed if we can map it
        if (event === "payment.failed") {
            const payment = eventPayload.payload.payment.entity;
            const order = await Order.findOne({ $or: [{ razorpayOrderId: payment.order_id }, { "paymentLink.id": payment.link_id }, { _id: payment.notes?.orderId }] });
            if (order) {
                order.paymentStatus = "failed";
                order.orderStatus = "Payment Failed";
                await order.save();
                try { io.to(order.user._id.toString()).emit("orderUpdated", { orderId: order._id, status: "Payment Failed" }); } catch (e) { }
                console.log(`⚠️ Order ${order._id} marked Failed (webhook payment.failed)`);
            }
        }

        // Always respond 200 quickly
        return res.status(200).json({ status: "ok" });

    } catch (err) {
        console.error("🔥 Razorpay Webhook Error:", err);
        // Don't return 500 (Razorpay will retry); return 200 and log
        return res.status(200).json({ status: "error_logged" });
    }
};

/**
 * 🔹 Shiprocket Webhook
 * Handles AWB status updates (In Transit, Delivered, Cancelled, etc.)
 */
export const shiprocketWebhook = async (req, res) => {
    try {
        const data = req.body;
        console.log("📦 Shiprocket Webhook:", JSON.stringify(data, null, 2));

        const { awb, current_status, courier, tracking_url, current_status_location } = data;

        if (!awb) {
            return res.status(400).json({ success: false, message: "AWB code missing" });
        }

        // 1️⃣ Find order by AWB code
        const order = await Order.findOne({ "shipment.awb_code": awb }).populate("user");
        if (!order) {
            console.error("❌ No order found for AWB:", awb);
            return res.status(404).json({ success: false, message: "Order not found for AWB" });
        }

        // 2️⃣ Update shipment fields
        order.shipment.status = current_status || order.shipment.status;
        if (courier) order.shipment.courier = courier;
        if (tracking_url) order.shipment.tracking_url = tracking_url;

        // 3️⃣ Sync high-level order status with shipment
        if (current_status) {
            const statusLower = current_status.toLowerCase();
            if (statusLower.includes("in transit") || statusLower.includes("shipped")) {
                order.orderStatus = "Shipped";
            } else if (statusLower.includes("out for delivery")) {
                order.orderStatus = "Out for Delivery";
            } else if (statusLower.includes("delivered")) {
                order.orderStatus = "Delivered";
            } else if (statusLower.includes("cancelled") || statusLower.includes("rto")) {
                order.orderStatus = "Cancelled";
            } else {
                order.orderStatus = "Processing"; // fallback
            }
        }

        // 4️⃣ Append to tracking history
        if (!order.trackingHistory) order.trackingHistory = [];
        order.trackingHistory.push({
            status: current_status || "Unknown",
            timestamp: new Date(),
            location: current_status_location || null
        });

        await order.save();

        // 5️⃣ Emit socket event to the user (real-time updates on frontend)
        if (order.user?._id) {
            io.to(order.user._id.toString()).emit("orderUpdated", {
                orderId: order._id,
                status: order.orderStatus,
                shipment: {
                    awb,
                    courier,
                    tracking_url,
                    current_status,
                },
            });
        }

        console.log(`✅ Order ${order._id} updated via Shiprocket Webhook → ${current_status}`);

        return res.status(200).json({ success: true, message: "Shipment status updated" });
    } catch (err) {
        console.error("🔥 Shiprocket Webhook Error:", err);
        res.status(500).json({ success: false, message: "Webhook processing failed", error: err.message });
    }
};


