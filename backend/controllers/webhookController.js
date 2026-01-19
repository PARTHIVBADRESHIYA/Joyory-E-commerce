import crypto from "crypto";
import Order from "../models/Order.js";
import { razorpay } from "../controllers/settings/payments/paymentController.js";
import { io } from "../server.js"; // ✅ import socket.io instance
import { sendEmail } from "../middlewares/utils/emailService.js"; // ✅ assume you already have an email service
import { refundQueue } from "../middlewares/services/refundQueue.js";

export const finalizeOrderPayment = async (order, payment, { isTest, isLivePayment }) => {
    try {
        // ✅ Basic payment fields update
        order.paid = true;
        order.paymentStatus = "paid";
        order.orderStatus = "Confirmed";
        order.transactionId = payment.id;
        order.razorpayPaymentId = payment.id;
        order.razorpayOrderId = payment.order_id;
        order.paidAt = new Date();

        // Store mode flags
        order.isTestPayment = isTest;
        order.isLivePayment = isLivePayment;


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

        // Probably skip email for test mode (recommended)
        if (!isTest) {
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
        }

        console.log(`✅ Payment finalized for order ${order._id}`);
        return order;
    } catch (err) {
        console.error("🔥 Error in finalizeOrderPayment helper:", err);
        throw err;
    }
};

// export const razorpayWebhook = async (req, res) => {
//     try {
//         const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
//         const signature = req.headers["x-razorpay-signature"];

//         // ✅ Get raw body (for signature verification)
//         const rawBody = req.rawBody || req.body.toString("utf8");

//         // ✅ Verify signature (only in production)
//         if (!(process.env.NODE_ENV === "development" || process.env.SKIP_SIGNATURE === "true")) {
//             const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
//             if (expected !== signature) {
//                 console.warn("⚠️ Invalid Razorpay signature");
//                 return res.status(200).json({ status: "ignored", reason: "invalid_signature" });
//             }
//         }

//         // ✅ Parse payload safely
//         let eventPayload;
//         try {
//             eventPayload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
//         } catch (err) {
//             console.error("⚠️ Invalid JSON body in webhook:", err);
//             return res.status(200).json({ status: "ignored", reason: "invalid_json" });
//         }

//         const event = eventPayload?.event;
//         if (!event || typeof event !== "string") {
//             console.warn("⚠️ Missing or invalid event field:", eventPayload);
//             return res.status(200).json({ status: "ignored", reason: "missing_event" });
//         }

//         console.log("✅ Razorpay Webhook Event:", event);

//         // ----------------------------------------------------
//         // 💰 PAYMENT CAPTURED
//         // ----------------------------------------------------
//         if (event === "payment.captured") {
//             const payment = eventPayload.payload?.payment?.entity;
//             if (!payment) {
//                 console.error("⚠️ Missing payment entity in webhook");
//                 return res.status(200).json({ status: "ignored", reason: "missing_payment_entity" });
//             }

//             // --------------------------------------------------------
//             // 🔥 ADD HERE — Detect LIVE Payment & Test Payment
//             // --------------------------------------------------------
//             const isTest = payment.id?.startsWith("pay_TEST") || payment.order_id?.startsWith("order_TEST");

//             const isLivePayment =
//                 payment.gateway === "razorpay" &&
//                 payment?.acquirer_data?.auth_code &&
//                 !isTest; // prevent marking TEST payments as live

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
//                 return res.status(200).json({ status: "ignored", reason: "order_not_found" });
//             }

//             if (!order.paid && typeof finalizeOrderPayment === "function") {
//                 try {
//                     await finalizeOrderPayment(order, payment, {
//                         isTest,
//                         isLivePayment
//                     });
//                     console.log(`💰 Order ${order._id} marked Paid`);
//                 } catch (err) {
//                     console.error("❌ Error finalizing payment:", err);
//                 }
//             }

//             try {
//                 io?.to(order.user._id.toString()).emit("orderUpdated", {
//                     orderId: order._id,
//                     status: "Paid",
//                     paymentId: payment.id,
//                 });
//             } catch (_) { }
//         }

//         // ----------------------------------------------------
//         // 💳 PAYMENT LINK EVENTS
//         // ----------------------------------------------------
//         if (event.startsWith("payment_link.")) {
//             const linkEntity = eventPayload.payload?.payment_link?.entity;
//             if (!linkEntity) return res.status(200).json({ status: "ignored", reason: "missing_link_entity" });

//             const order = await Order.findOne({ "paymentLink.id": linkEntity.id }).populate("user");
//             if (order) {
//                 order.paymentLink = { ...order.paymentLink, status: linkEntity.status, updatedAt: new Date() };
//                 await order.save();
//             }

//             if (Array.isArray(linkEntity.payments) && linkEntity.payments.length) {
//                 for (const p of linkEntity.payments) {
//                     try {
//                         const paymentId = p.id || p;
//                         const rpPayment = await razorpay.payments.fetch(paymentId);
//                         const linkedOrder = order || (await Order.findOne({
//                             $or: [
//                                 { razorpayOrderId: rpPayment.order_id },
//                                 { "paymentLink.id": rpPayment.link_id },
//                                 { _id: rpPayment.notes?.orderId },
//                             ],
//                         }).populate("user"));

//                         if (linkedOrder && !linkedOrder.paid && typeof finalizeOrderPayment === "function") {

//                             const _isTest =
//                                 rpPayment.id?.startsWith("pay_TEST") ||
//                                 rpPayment.order_id?.startsWith("order_TEST");

//                             const _isLivePayment =
//                                 rpPayment.gateway === "razorpay" &&
//                                 rpPayment?.acquirer_data?.auth_code &&
//                                 !_isTest;

//                             await finalizeOrderPayment(linkedOrder, rpPayment, {
//                                 isTest: _isTest,
//                                 isLivePayment: _isLivePayment
//                             });

//                             console.log(`💳 Payment finalized for order ${linkedOrder._id}`);
//                         }

//                     } catch (err) {
//                         console.error("❌ Error handling payment_link payment:", err);
//                     }
//                 }
//             }
//         }

//         // ----------------------------------------------------
//         // ⚠️ PAYMENT FAILED
//         // ----------------------------------------------------
//         if (event === "payment.failed") {
//             const payment = eventPayload.payload?.payment?.entity;
//             const order = await Order.findOne({
//                 $or: [
//                     { razorpayOrderId: payment?.order_id },
//                     { "paymentLink.id": payment?.link_id },
//                     { _id: payment?.notes?.orderId },
//                 ],
//             }).populate("user");

//             if (order) {
//                 order.paymentStatus = "failed";
//                 order.orderStatus = "Payment Failed";
//                 await order.save();
//                 io?.to(order.user._id.toString()).emit("orderUpdated", {
//                     orderId: order._id,
//                     status: "Payment Failed",
//                 });
//                 console.log(`⚠️ Order ${order._id} marked Failed`);
//             }
//         }

//         // ----------------------------------------------------
//         // 💸 REFUND EVENTS (RETURN LEVEL – FINAL)
//         // ----------------------------------------------------
//         if (event.startsWith("refund.")) {
//             const refund = eventPayload.payload?.refund?.entity;
//             if (!refund) {
//                 return res.status(200).json({ status: "ignored", reason: "missing_refund_entity" });
//             }

//             // 1️⃣ Find order containing this return refund
//             const order = await Order.findOne({
//                 "shipments.returns.refund.gatewayRefundId": refund.id
//             }).populate("user");

//             if (!order) {
//                 return res.status(200).json({ status: "ignored", reason: "order_not_found" });
//             }

//             // 2️⃣ Find exact return inside shipments
//             let matchedReturn = null;

//             for (const shipment of order.shipments) {
//                 const ret = shipment.returns.find(
//                     r => r.refund?.gatewayRefundId === refund.id
//                 );
//                 if (ret) {
//                     matchedReturn = ret;
//                     break;
//                 }
//             }

//             if (!matchedReturn) {
//                 return res.status(200).json({ status: "ignored", reason: "return_not_found" });
//             }

//             // 3️⃣ Handle refund lifecycle correctly
//             if (event === "refund.created") {
//                 // Razorpay accepted refund request
//                 matchedReturn.refund.status = "processing";
//                 await order.save();
//             }

//             if (event === "refund.processed") {
//                 // Refund completed at Razorpay side
//                 if (matchedReturn.refund.status !== "completed") {
//                     matchedReturn.refund.status = "completed";
//                     matchedReturn.refund.refundedAt = new Date();
//                     await order.save();

//                     // 📧 SEND EMAIL ONLY ON COMPLETION
//                     if (order.user?.email) {
//                         await sendEmail(
//                             order.user.email,
//                             "✅ Your Refund Has Been Processed",
//                             `
//                 <p>Hi ${order.user.name},</p>
//                 <p>Your refund request has been successfully processed.</p>
//                 <p><strong>Refund Amount:</strong> ₹${matchedReturn.refund.amount}</p>
//                 <p>The amount will reflect in your account within 3–7 working days.</p>
//                 <p>Regards,<br/>Team Joyory Beauty</p>
//                 `
//                         );
//                     }
//                 }
//             }

//             if (event === "refund.failed") {
//                 matchedReturn.refund.status = "failed";
//                 await order.save();
//             }
//         }

//         // ✅ Always respond fast
//         return res.status(200).json({ status: "ok" });
//     } catch (err) {
//         console.error("🔥 Razorpay Webhook Error:", err);
//         return res.status(200).json({ status: "error_logged" });
//     }
// };

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

            // --------------------------------------------------------
            // 🔥 ADD HERE — Detect LIVE Payment & Test Payment
            // --------------------------------------------------------
            const isTest = payment.id?.startsWith("pay_TEST") || payment.order_id?.startsWith("order_TEST");

            const isLivePayment =
                payment.gateway === "razorpay" &&
                payment?.acquirer_data?.auth_code &&
                !isTest; // prevent marking TEST payments as live

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
                    await finalizeOrderPayment(order, payment, {
                        isTest,
                        isLivePayment
                    });
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

                            const _isTest =
                                rpPayment.id?.startsWith("pay_TEST") ||
                                rpPayment.order_id?.startsWith("order_TEST");

                            const _isLivePayment =
                                rpPayment.gateway === "razorpay" &&
                                rpPayment?.acquirer_data?.auth_code &&
                                !_isTest;

                            await finalizeOrderPayment(linkedOrder, rpPayment, {
                                isTest: _isTest,
                                isLivePayment: _isLivePayment
                            });

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

        // // ----------------------------------------------------
        // // 💸 REFUND EVENTS (RETURN LEVEL – FINAL)
        // // ----------------------------------------------------
        // if (event.startsWith("refund.")) {
        //     const refund = eventPayload.payload?.refund?.entity;
        //     if (!refund) {
        //         return res.status(200).json({ status: "ignored", reason: "missing_refund_entity" });
        //     }

        //     // 1️⃣ Find order containing this return refund
        //     const order = await Order.findOne({
        //         "shipments.returns.refund.gatewayRefundId": refund.id
        //     }).populate("user");

        //     if (!order) {
        //         return res.status(200).json({ status: "ignored", reason: "order_not_found" });
        //     }

        //     // 2️⃣ Find exact return inside shipments
        //     let matchedReturn = null;

        //     for (const shipment of order.shipments) {
        //         const ret = shipment.returns.find(
        //             r => r.refund?.gatewayRefundId === refund.id
        //         );
        //         if (ret) {
        //             matchedReturn = ret;
        //             break;
        //         }
        //     }

        //     if (!matchedReturn) {
        //         return res.status(200).json({ status: "ignored", reason: "return_not_found" });
        //     }

        //     // 3️⃣ Handle refund lifecycle correctly
        //     if (event === "refund.created") {
        //         // Razorpay accepted refund request
        //         matchedReturn.refund.status = "processing";
        //         await order.save();
        //     }

        //     if (event === "refund.processed") {
        //         // Refund completed at Razorpay side
        //         if (matchedReturn.refund.status !== "completed") {
        //             matchedReturn.refund.status = "completed";
        //             matchedReturn.refund.refundedAt = new Date();
        //             await order.save();

        //             // 📧 SEND EMAIL ONLY ON COMPLETION
        //             if (order.user?.email) {
        //                 await sendEmail(
        //                     order.user.email,
        //                     "✅ Your Refund Has Been Processed",
        //                     `
        //         <p>Hi ${order.user.name},</p>
        //         <p>Your refund request has been successfully processed.</p>
        //         <p><strong>Refund Amount:</strong> ₹${matchedReturn.refund.amount}</p>
        //         <p>The amount will reflect in your account within 3–7 working days.</p>
        //         <p>Regards,<br/>Team Joyory Beauty</p>
        //         `
        //                 );
        //             }
        //         }
        //     }

        //     if (event === "refund.failed") {
        //         matchedReturn.refund.status = "failed";
        //         await order.save();
        //     }
        // }


        // ----------------------------------------------------
        // 💸 REFUND EVENTS (FINAL AUTHORITY – RAZORPAY)
        // ----------------------------------------------------
        if (event.startsWith("refund.")) {
            const refundEntity = eventPayload.payload?.refund?.entity;
            if (!refundEntity) {
                return res.status(200).json({
                    status: "ignored",
                    reason: "missing_refund_entity",
                });
            }

            /* =====================================================
               1️⃣ ORDER-LEVEL REFUND (CANCEL ORDER)
            ===================================================== */
            const orderRefundOrder = await Order.findOne({
                "orderRefund.gatewayRefundId": refundEntity.id,
            }).populate("user");

            if (orderRefundOrder && orderRefundOrder.orderRefund) {
                const refund = orderRefundOrder.orderRefund;

                if (event === "refund.created") {
                    refund.status = "processing";
                    await orderRefundOrder.save();
                }

                if (event === "refund.processed") {
                    if (refund.status !== "completed") {
                        refund.status = "completed";
                        refund.refundedAt = new Date();

                        refund.audit_trail.push({
                            status: "refund_completed",
                            action: "razorpay_refund_processed",
                            performedByModel: "System",
                            notes: refundEntity.id,
                            timestamp: new Date(),
                        });

                        await orderRefundOrder.save();

                        // 📧 Email only on FINAL success
                        if (orderRefundOrder.user?.email) {
                            await sendEmail(
                                orderRefundOrder.user.email,
                                "✅ Your Order Refund Has Been Processed",
                                `
                        <p>Hi ${orderRefundOrder.user.name},</p>
                        <p>Your order cancellation refund has been successfully processed.</p>
                        <p><strong>Refund Amount:</strong> ₹${refund.amount}</p>
                        <p>The amount will reflect in your account within 3–7 working days.</p>
                        <p>Regards,<br/>Team Joyory Beauty</p>
                        `
                            );
                        }
                    }
                }

                if (event === "refund.failed") {
                    refund.status = "failed";
                    refund.failureReason =
                        refundEntity.error_reason || "Refund failed at Razorpay";

                    refund.audit_trail.push({
                        status: "refund_failed",
                        action: "razorpay_refund_failed",
                        notes: refundEntity.error_reason,
                        timestamp: new Date(),
                    });

                    await orderRefundOrder.save();
                }

                return res.status(200).json({ status: "ok", level: "order" });
            }

            /* =====================================================
               2️⃣ RETURN-LEVEL REFUND (SHIPMENT RETURN)
            ===================================================== */
            const order = await Order.findOne({
                "shipments.returns.refund.gatewayRefundId": refundEntity.id,
            }).populate("user");

            if (!order) {
                return res.status(200).json({
                    status: "ignored",
                    reason: "order_not_found",
                });
            }

            let matchedReturn = null;

            for (const shipment of order.shipments) {
                const ret = shipment.returns.find(
                    (r) => r.refund?.gatewayRefundId === refundEntity.id
                );
                if (ret) {
                    matchedReturn = ret;
                    break;
                }
            }

            if (!matchedReturn) {
                return res.status(200).json({
                    status: "ignored",
                    reason: "return_not_found",
                });
            }

            if (event === "refund.created") {
                matchedReturn.refund.status = "processing";
                await order.save();
            }

            if (event === "refund.processed") {
                if (matchedReturn.refund.status !== "completed") {
                    matchedReturn.refund.status = "completed";
                    matchedReturn.refund.refundedAt = new Date();

                    matchedReturn.refund.audit_trail.push({
                        status: "refund_completed",
                        action: "razorpay_refund_processed",
                        performedByModel: "System",
                        notes: refundEntity.id,
                        timestamp: new Date(),
                    });

                    await order.save();

                    // 📧 Email only on FINAL success
                    if (order.user?.email) {
                        await sendEmail(
                            order.user.email,
                            "✅ Your Refund Has Been Processed",
                            `
                    <p>Hi ${order.user.name},</p>
                    <p>Your return refund has been successfully processed.</p>
                    <p><strong>Refund Amount:</strong> ₹${matchedReturn.refund.amount}</p>
                    <p>The amount will reflect in your account within 3–7 working days.</p>
                    <p>Regards,<br/>Team Joyory Beauty</p>
                    `
                        );
                    }
                }
            }

            if (event === "refund.failed") {
                matchedReturn.refund.status = "failed";
                matchedReturn.refund.failureReason =
                    refundEntity.error_reason || "Refund failed at Razorpay";
                
                matchedReturn.refund.audit_trail.push({
                    status: "refund_failed",
                    action: "razorpay_refund_failed",
                    notes: refundEntity.error_reason,
                    timestamp: new Date(),
                });

                await order.save();
            }

            return res.status(200).json({ status: "ok", level: "return" });
        }


        // ✅ Always respond fast
        return res.status(200).json({ status: "ok" });
    } catch (err) {
        console.error("🔥 Razorpay Webhook Error:", err);
        return res.status(200).json({ status: "error_logged" });
    }
};
