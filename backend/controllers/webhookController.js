import crypto from "crypto";
import Order from "../models/Order.js";
import { razorpay } from "../controllers/settings/payments/paymentController.js";
import { io } from "../server.js"; // ✅ import socket.io instance
import { sendEmail } from "../middlewares/utils/emailService.js"; // ✅ assume you already have an email service
import { refundQueue } from "../middlewares/services/refundQueue.js";

export const finalizeOrderPayment = async (order, payment) => {
    try {
        // ✅ Basic payment fields update
        order.paid = true;
        order.paymentStatus = "paid";
        order.orderStatus = "Confirmed";
        order.transactionId = payment.id;
        order.razorpayPaymentId = payment.id;
        order.razorpayOrderId = payment.order_id;
        order.paidAt = new Date();

        // ✅ Payment details snapshot
        order.paymentDetails = {
            method: payment.method,
            amount: payment.amount / 100,
            currency: payment.currency,
            bank: payment.bank || null,
            wallet: payment.wallet || null,
            email: payment.email,
            contact: payment.contact,
        };

        await order.save();

        // ✅ Optional: Notify user in real time
        io?.to(order.user?._id?.toString()).emit("orderUpdated", {
            orderId: order._id,
            status: "Paid",
            paymentId: payment.id,
        });

        // ✅ Send confirmation email
        await sendEmail(
            order.user.email,
            "🎉 Payment Successful – Order Confirmed!",
            `
        <p>Hi ${order.user.name},</p>
        <p>Your payment for order <strong>#${order._id}</strong> has been successfully received.</p>
        <p><strong>Amount:</strong> ₹${payment.amount / 100}</p>
        <p><strong>Method:</strong> ${payment.method}</p>
        <p>We’ll notify you once your order is shipped!</p>
        <p>Regards,<br/>Team Joyory Beauty</p>
      `
        );

        console.log(`✅ Payment finalized for order ${order._id}`);
        return order;
    } catch (err) {
        console.error("🔥 Error in finalizeOrderPayment helper:", err);
        throw err;
    }
};

export const razorpayWebhook = async (req, res) => {
    try {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        const signature = req.headers["x-razorpay-signature"];

        // ✅ Get raw body (for signature verification)
        const rawBody = req.rawBody || req.body.toString("utf8");

        // ✅ Verify signature (only in production)
        if (!(process.env.NODE_ENV === "development" || process.env.SKIP_SIGNATURE === "true")) {
            const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
            if (expected !== signature) {
                console.warn("⚠️ Invalid Razorpay signature");
                return res.status(200).json({ status: "ignored", reason: "invalid_signature" });
            }
        }

        // ✅ Parse payload safely
        let eventPayload;
        try {
            eventPayload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
        } catch (err) {
            console.error("⚠️ Invalid JSON body in webhook:", err);
            return res.status(200).json({ status: "ignored", reason: "invalid_json" });
        }

        const event = eventPayload?.event;
        if (!event || typeof event !== "string") {
            console.warn("⚠️ Missing or invalid event field:", eventPayload);
            return res.status(200).json({ status: "ignored", reason: "missing_event" });
        }

        console.log("✅ Razorpay Webhook Event:", event);

        // ----------------------------------------------------
        // 💰 PAYMENT CAPTURED
        // ----------------------------------------------------
        if (event === "payment.captured") {
            const payment = eventPayload.payload?.payment?.entity;
            if (!payment) {
                console.error("⚠️ Missing payment entity in webhook");
                return res.status(200).json({ status: "ignored", reason: "missing_payment_entity" });
            }

            const order = await Order.findOne({
                $or: [
                    { razorpayOrderId: payment.order_id },
                    { "paymentLink.id": payment.link_id },
                    { _id: payment.notes?.orderId },
                    { "paymentLink.referenceId": payment.reference_id },
                ],
            }).populate("user");

            if (!order) {
                console.error("❌ Order not found for Razorpay payment:", payment.order_id);
                return res.status(200).json({ status: "ignored", reason: "order_not_found" });
            }

            if (!order.paid && typeof finalizeOrderPayment === "function") {
                try {
                    await finalizeOrderPayment(order, payment);
                    console.log(`💰 Order ${order._id} marked Paid`);
                } catch (err) {
                    console.error("❌ Error finalizing payment:", err);
                }
            }

            try {
                io?.to(order.user._id.toString()).emit("orderUpdated", {
                    orderId: order._id,
                    status: "Paid",
                    paymentId: payment.id,
                });
            } catch (_) { }
        }

        // ----------------------------------------------------
        // 💳 PAYMENT LINK EVENTS
        // ----------------------------------------------------
        if (event.startsWith("payment_link.")) {
            const linkEntity = eventPayload.payload?.payment_link?.entity;
            if (!linkEntity) return res.status(200).json({ status: "ignored", reason: "missing_link_entity" });

            const order = await Order.findOne({ "paymentLink.id": linkEntity.id }).populate("user");
            if (order) {
                order.paymentLink = { ...order.paymentLink, status: linkEntity.status, updatedAt: new Date() };
                await order.save();
            }

            if (Array.isArray(linkEntity.payments) && linkEntity.payments.length) {
                for (const p of linkEntity.payments) {
                    try {
                        const paymentId = p.id || p;
                        const rpPayment = await razorpay.payments.fetch(paymentId);
                        const linkedOrder = order || (await Order.findOne({
                            $or: [
                                { razorpayOrderId: rpPayment.order_id },
                                { "paymentLink.id": rpPayment.link_id },
                                { _id: rpPayment.notes?.orderId },
                            ],
                        }).populate("user"));

                        if (linkedOrder && !linkedOrder.paid && typeof finalizeOrderPayment === "function") {
                            await finalizeOrderPayment(linkedOrder, rpPayment);
                            console.log(`💳 Payment finalized for order ${linkedOrder._id}`);
                        }
                    } catch (err) {
                        console.error("❌ Error handling payment_link payment:", err);
                    }
                }
            }
        }

        // ----------------------------------------------------
        // ⚠️ PAYMENT FAILED
        // ----------------------------------------------------
        if (event === "payment.failed") {
            const payment = eventPayload.payload?.payment?.entity;
            const order = await Order.findOne({
                $or: [
                    { razorpayOrderId: payment?.order_id },
                    { "paymentLink.id": payment?.link_id },
                    { _id: payment?.notes?.orderId },
                ],
            }).populate("user");

            if (order) {
                order.paymentStatus = "failed";
                order.orderStatus = "Payment Failed";
                await order.save();
                io?.to(order.user._id.toString()).emit("orderUpdated", {
                    orderId: order._id,
                    status: "Payment Failed",
                });
                console.log(`⚠️ Order ${order._id} marked Failed`);
            }
        }

        // ----------------------------------------------------
        // 💸 REFUND EVENTS
        // ----------------------------------------------------
        if (event.startsWith("refund.")) {
            const refund = eventPayload.payload?.refund?.entity;
            if (!refund) return res.status(200).json({ status: "ignored", reason: "missing_refund_entity" });

            const order = await Order.findOne({
                $or: [
                    { "refund.gatewayRefundId": refund.id },
                    { transactionId: refund.payment_id },
                ],
            }).populate("user");

            if (!order) return res.status(200).json({ status: "ignored", reason: "order_not_found" });

            if (event === "refund.created") {
                order.refund.status = "initiated";
                await order.save();
            }

            if (event === "refund.processed") {
                order.refund.status = "completed";
                order.paymentStatus = "refunded";
                order.refund.refundedAt = new Date();
                await order.save();

                const methodLabel =
                    order.refund.method === "razorpay"
                        ? "Original Payment Method"
                        : order.refund.method === "wallet"
                            ? "Joyory Wallet"
                            : "Manual UPI";

                await sendEmail(
                    order.user.email,
                    "✅ Your Refund Has Been Processed",
                    `
            <p>Hi ${order.user.name},</p>
            <p>Your refund for Order <strong>#${order._id}</strong> has been successfully processed.</p>
            <p><strong>Amount:</strong> ₹${order.refund.amount}</p>
            <p><strong>Method:</strong> ${methodLabel}</p>
            <p>It may take some time to reflect based on your provider.</p>
            <p>Regards,<br/>Team Joyory Beauty</p>
          `
                );
            }

            if (event === "refund.failed") {
                order.refund.status = "failed";
                order.paymentStatus = "refund_failed";
                await order.save();
                refundQueue.add("refund", { orderId: order._id });
            }
        }

        // ✅ Always respond fast
        return res.status(200).json({ status: "ok" });
    } catch (err) {
        console.error("🔥 Razorpay Webhook Error:", err);
        return res.status(200).json({ status: "error_logged" });
    }
};


// export const razorpayWebhook = async (req, res) => {
//     try {
//         const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
//         const signature = req.headers["x-razorpay-signature"];

//         const rawBody = req.body instanceof Buffer ? req.body.toString() : JSON.stringify(req.body);

//         // Verify signature
//         if (!(process.env.NODE_ENV === "development" || process.env.SKIP_SIGNATURE === "true")) {
//             const expectedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
//             if (signature !== expectedSignature) {
//                 console.error("❌ Invalid Razorpay Signature (webhook)");
//                 return res.status(200).json({ status: "ignored", reason: "invalid signature" });
//             }
//         }

//         const eventPayload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
//         const event = eventPayload.event;
//         console.log("✅ Razorpay Webhook Event:", event);

//         // ------------------------------------
//         // 🧾 PAYMENT EVENTS
//         // ------------------------------------
//         if (event === "payment.captured") {
//             const payment = eventPayload.payload.payment.entity;

//             const order = await Order.findOne({
//                 $or: [
//                     { razorpayOrderId: payment.order_id },
//                     { "paymentLink.id": payment.link_id },
//                     { _id: payment.notes?.orderId },
//                     { "paymentLink.referenceId": payment.reference_id },
//                 ],
//             }).populate("user");

//             if (!order) {
//                 console.error("❌ Order not found for Razorpay payment:", payment.order_id);
//                 return res.status(200).json({ status: "ignored", reason: "order not found" });
//             }

//             if (!order.paid) {
//                 try {
//                     await finalizeOrderPayment(order, payment);
//                     console.log(`💰 Order ${order._id} marked Paid (webhook payment.captured)`);
//                 } catch (err) {
//                     console.error("❌ Error during finalizeOrderPayment (webhook):", err);
//                 }
//             }

//             try {
//                 io.to(order.user._id.toString()).emit("orderUpdated", { orderId: order._id, status: "Paid", paymentId: payment.id });
//             } catch (err) { }
//         }

//         if (event && event.startsWith("payment_link.")) {
//             const linkEntity = eventPayload.payload.payment_link?.entity;
//             if (linkEntity) {
//                 const order = await Order.findOne({ "paymentLink.id": linkEntity.id }).populate("user");
//                 if (order) {
//                     order.paymentLink = order.paymentLink || {};
//                     order.paymentLink.status = linkEntity.status;
//                     order.paymentLink.updatedAt = new Date();
//                     await order.save();
//                 }

//                 if (Array.isArray(linkEntity.payments) && linkEntity.payments.length) {
//                     for (const p of linkEntity.payments) {
//                         try {
//                             const paymentId = p.id || p;
//                             const rpPayment = await razorpay.payments.fetch(paymentId);
//                             const linkedOrder = order || await Order.findOne({
//                                 $or: [
//                                     { razorpayOrderId: rpPayment.order_id },
//                                     { "paymentLink.id": rpPayment.link_id },
//                                     { _id: rpPayment.notes?.orderId },
//                                 ],
//                             }).populate("user");

//                             if (linkedOrder && !linkedOrder.paid) {
//                                 await finalizeOrderPayment(linkedOrder, rpPayment);
//                                 console.log(`💳 Finalized payment for order ${linkedOrder._id} (payment_link event)`);
//                             }
//                         } catch (err) {
//                             console.error("❌ Error handling payment_link payment:", err);
//                         }
//                     }
//                 }
//             }
//         }

//         if (event === "payment.failed") {
//             const payment = eventPayload.payload.payment.entity;
//             const order = await Order.findOne({
//                 $or: [
//                     { razorpayOrderId: payment.order_id },
//                     { "paymentLink.id": payment.link_id },
//                     { _id: payment.notes?.orderId },
//                 ],
//             });
//             if (order) {
//                 order.paymentStatus = "failed";
//                 order.orderStatus = "Payment Failed";
//                 await order.save();
//                 try { io.to(order.user._id.toString()).emit("orderUpdated", { orderId: order._id, status: "Payment Failed" }); } catch (e) { }
//                 console.log(`⚠️ Order ${order._id} marked Failed (webhook payment.failed)`);
//             }
//         }

//         // ------------------------------------
//         // 💸 REFUND EVENTS (Step D)
//         // ------------------------------------
//         // if (event.startsWith("refund.")) {
//         //     const refund = eventPayload.payload.refund.entity;

//         //     const order = await Order.findOne({
//         //         $or: [
//         //             { "refund.gatewayRefundId": refund.id },
//         //             { transactionId: refund.payment_id },
//         //             { _id: refund.notes?.orderId },
//         //         ],
//         //     });

//         //     if (!order) {
//         //         console.warn("⚠️ No matching order for refund:", refund.id);
//         //         return res.status(200).json({ status: "ignored", reason: "refund order not found" });
//         //     }

//         //     // REFUND CREATED → mark initiated
//         //     if (event === "refund.created") {
//         //         order.refund.status = "initiated";
//         //         order.paymentStatus = "refund_initiated";
//         //         order.refund.gatewayRefundId = refund.id;
//         //         await order.save();
//         //         console.log(`🔄 Refund initiated for order ${order._id}`);
//         //     }

//         //     // REFUND PROCESSED → mark completed
//         //     if (event === "refund.processed") {
//         //         order.refund.status = "completed";
//         //         order.paymentStatus = "refunded";
//         //         order.refund.refundedAt = new Date();
//         //         await order.save();
//         //         console.log(`✅ Refund completed for order ${order._id}`);

//         //         try {
//         //             io.to(order.user._id.toString()).emit("refundStatus", { orderId: order._id, status: "Refund Completed" });
//         //         } catch (err) { }
//         //     }

//         //     // REFUND FAILED → mark failed + retry worker
//         //     if (event === "refund.failed") {
//         //         order.refund.status = "failed";
//         //         order.paymentStatus = "refund_failed";
//         //         order.refund.failureReason = refund.error_reason || "Unknown failure";
//         //         await order.save();
//         //         console.log(`⚠️ Refund failed for order ${order._id}, scheduling retry...`);

//         //         refundWorker(order._id.toString()); // retry asynchronously
//         //     }
//         // }
//         // if (event.startsWith("refund.")) {
//         //     const refund = eventPayload.payload.refund.entity;

//         //     const order = await Order.findOne({
//         //         $or: [
//         //             { "refund.gatewayRefundId": refund.id },
//         //             { transactionId: refund.payment_id }
//         //         ]
//         //     });

//         //     if (!order) return res.status(200).json({ status: "ignored" });

//         //     if (event === "refund.created") {
//         //         order.refund.status = "initiated";
//         //         await order.save();
//         //     }

//         //     if (event === "refund.processed") {
//         //         order.refund.status = "completed";
//         //         order.paymentStatus = "refunded";
//         //         order.refund.refundedAt = new Date();
//         //         await order.save();
//         //     }

//         //     if (event === "refund.failed") {
//         //         order.refund.status = "failed";
//         //         order.paymentStatus = "refund_failed";
//         //         await order.save();

//         //         refundQueue.add("refund", { orderId: order._id });
//         //     }
//         // }
//         if (event.startsWith("refund.")) {
//             const refund = eventPayload.payload.refund.entity;

//             const order = await Order.findOne({
//                 $or: [
//                     { "refund.gatewayRefundId": refund.id },
//                     { transactionId: refund.payment_id }
//                 ]
//             }).populate("user");

//             if (!order) return res.status(200).json({ status: "ignored" });

//             // ✅ REFUND INITIATED
//             if (event === "refund.created") {
//                 order.refund.status = "initiated";
//                 await order.save();
//             }

//             // ✅ REFUND COMPLETED (send email here)
//             if (event === "refund.processed") {
//                 order.refund.status = "completed";
//                 order.paymentStatus = "refunded";
//                 order.refund.refundedAt = new Date();
//                 await order.save();

//                 // ✅ EMAIL TO USER
//                 const methodLabel =
//                     order.refund.method === "razorpay"
//                         ? "Original Payment Method (Razorpay)"
//                         : order.refund.method === "wallet"
//                             ? "Joyory Wallet"
//                             : "Manual UPI";

//                 await sendEmail(
//                     order.user.email,
//                     "✅ Your Refund Has Been Successfully Processed",
//                     `
//             <p>Hi ${order.user.name},</p>
//             <p>Your refund for Order <strong>#${order._id}</strong> has been successfully completed.</p>

//             <p><strong>Refund Amount:</strong> ₹${order.refund.amount}</p>
//             <p><strong>Refund Method:</strong> ${methodLabel}</p>

//             <p>The refunded amount should reflect shortly based on your payment provider.</p>

//             <p>If you have any questions, feel free to contact our support team.</p>

//             <p>Regards,<br/>Team Joyory Beauty</p>
//             `
//                 );
//             }

//             // ❌ REFUND FAILED
//             if (event === "refund.failed") {
//                 order.refund.status = "failed";
//                 order.paymentStatus = "refund_failed";
//                 await order.save();

//                 refundQueue.add("refund", { orderId: order._id });
//             }
//         }

//         // ✅ Always respond quickly
//         return res.status(200).json({ status: "ok" });

//     } catch (err) {
//         console.error("🔥 Razorpay Webhook Error:", err);
//         return res.status(200).json({ status: "error_logged" });
//     }
// };





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
        if (!order.tracking_history) order.tracking_history = [];
        order.tracking_history.push({
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
