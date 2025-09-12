import Payment from '../../../models/settings/payments/Payment.js';
import Order from '../../../models/Order.js';
import { encrypt, decrypt } from '../../../middlewares/utils/encryption.js';
// import { createShiprocketOrder } from "../../../middlewares/services/shiprocket.js";
import { createShipment } from "../../../middlewares/services/shippingProvider.js";
import GiftCard from "../../../models/GiftCard.js"; // ✅ Import your GiftCard model
import { sendEmail } from "../../../middlewares/utils/emailService.js"; // ✅ assume you already have an email service
import Product from '../../../models/Product.js';
import Affiliate from '../../../models/Affiliate.js';
import mongoose from 'mongoose';
import User from '../../../models/User.js';
import Referral from '../../../models/Referral.js'; // ✅ You need to import this
import Razorpay from "razorpay";
import crypto from "crypto";

import cloudinary from '../../../middlewares/utils/cloudinary.js';
import { determineOccasions, craftMessage } from "../../../middlewares/services/ecardService.js";
import { buildEcardPdf } from "../../../middlewares/services/ecardPdf.js";
import { uploadPdfBuffer } from "../../../middlewares/upload.js";
import { generateInvoice } from "../../../middlewares/services/invoiceService.js";
import { splitOrderForPersistence } from '../../../middlewares/services/orderSplit.js'; // or correct path

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// export const createRazorpayOrder = async (req, res) => {
//     try {
//         const { orderId } = req.body;

//         if (!orderId) {
//             return res.status(400).json({ message: "❌ orderId is required" });
//         }

//         const order = await Order.findById(orderId).populate("user");
//         if (!order) {
//             return res.status(404).json({ message: "❌ Order not found" });
//         }

//         // ✅ Prevent duplicate payment attempt
//         if (order.paid) {
//             return res.status(400).json({ message: "⚠️ Order is already paid" });
//         }

//         if (!order.amount || order.amount <= 0) {
//             return res.status(400).json({ message: "❌ Invalid order amount" });
//         }

//         // Convert amount to paise
//         const amountInPaise = Math.round(order.amount * 100);

//         // ✅ Create Razorpay order
//         const razorpayOrder = await razorpay.orders.create({
//             amount: amountInPaise,
//             currency: "INR",
//             receipt: order.orderId,
//             payment_capture: 1, // auto-capture enabled
//             notes: {
//                 orderId: order._id.toString(),
//                 customer: order.user?.name || "Guest User",
//             },
//         });

//         // ✅ Save Razorpay orderId + update status
//         order.razorpayOrderId = razorpayOrder.id;
//         order.paymentStatus = "pending";
//         order.orderStatus = "Awaiting Payment";

//         // Initialize tracking history if empty
//         if (!order.trackingHistory || order.trackingHistory.length === 0) {
//             order.trackingHistory = [
//                 {
//                     status: "Order Placed",
//                     timestamp: new Date(),
//                     location: "Store",
//                 },
//                 {
//                     status: "Awaiting Payment",
//                     timestamp: new Date(),
//                 },
//             ];
//         }

//         await order.save();

//         return res.status(200).json({
//             success: true,
//             message: "✅ Razorpay order created",
//             razorpayOrderId: razorpayOrder.id,
//             amount: order.amount,
//             currency: "INR",
//             orderId: order._id,
//         });
//     } catch (err) {
//         console.error("🔥 Error creating Razorpay order:", err);
//         res.status(500).json({
//             success: false,
//             message: "Failed to create Razorpay order",
//             error: err.message,
//         });
//     }
// };

// export const createRazorpayOrder = async (req, res) => {
//     try {
//         const { orderId } = req.body;

//         if (!orderId) {
//             return res.status(400).json({ message: "❌ orderId is required" });
//         }

//         const order = await Order.findById(orderId).populate("user");
//         if (!order) {
//             return res.status(404).json({ message: "❌ Order not found" });
//         }

//         // ✅ Prevent duplicate payment attempt
//         if (order.paid) {
//             return res.status(400).json({ message: "⚠️ Order is already paid" });
//         }

//         if (!order.amount || order.amount <= 0) {
//             return res.status(400).json({ message: "❌ Invalid order amount" });
//         }

//         // Convert amount to paise
//         const amountInPaise = Math.round(order.amount * 100);

//         // ✅ Create Razorpay order
//         const razorpayOrder = await razorpay.orders.create({
//             amount: amountInPaise,
//             currency: "INR",
//             receipt: order.orderId,
//             payment_capture: 1,
//             notes: {
//                 orderId: order._id.toString(),
//                 customer: order.user?.name || "Guest User",
//             },
//         });

//         // ✅ Save Razorpay orderId + update status
//         order.razorpayOrderId = razorpayOrder.id;
//         order.paymentStatus = "pending";
//         order.orderStatus = "Awaiting Payment";

//         // Initialize tracking history if empty
//         if (!order.trackingHistory || order.trackingHistory.length === 0) {
//             order.trackingHistory = [
//                 { status: "Order Placed", timestamp: new Date(), location: "Store" },
//                 { status: "Awaiting Payment", timestamp: new Date() },
//             ];
//         }

//         // 🔹 E-card logic
//         const { occasion, festival } = await determineOccasions({
//             userId: order.user._id,
//             userDoc: order.user,
//         });

//         const message = craftMessage({
//             occasion,
//             user: order.user,
//             festival,
//         });

//         if (message) {
//             // 1. Build PDF → Buffer
//             const pdfBuffer = await buildEcardPdf({
//                 title: "A Special Note from Joyory 🎉",
//                 name: order.user?.name || "Customer",
//                 message,
//             });

//             // 2. Upload Buffer to Cloudinary
//             const uploadResult = await new Promise((resolve, reject) => {
//                 const uploadStream = cloudinary.uploader.upload_stream(
//                     {
//                         folder: "ecards",
//                         resource_type: "raw",
//                         public_id: `ecard-${order._id}`,
//                         access_mode: "public",
//                     },
//                     (error, result) => {
//                         if (error) return reject(error);
//                         resolve(result);
//                     }
//                 );
//                 uploadStream.end(pdfBuffer);
//             });

//             // 3. Send Email with Buffer (✅ no 401 problem)
//             await sendEmail(
//                 order.user.email,
//                 "🎁 Your Joyory E-Card",
//                 `<p>${message}</p><p>We’ve also attached your special card as a PDF.</p>`,
//                 [
//                     {
//                         filename: "ecard.pdf",
//                         content: pdfBuffer,
//                         contentType: "application/pdf",
//                     },
//                 ]
//             );

//             // 4. Save in order
//             order.ecard = {
//                 occasion, // ✅ single string
//                 message,
//                 emailSentAt: new Date(),
//                 pdfUrl: uploadResult?.secure_url || null,
//             };
//         }

//         await order.save();

//         return res.status(200).json({
//             success: true,
//             message: "✅ Razorpay order created (E-card processed if applicable)",
//             razorpayOrderId: razorpayOrder.id,
//             amount: order.amount,
//             currency: "INR",
//             orderId: order._id,
//         });
//     } catch (err) {
//         console.error("🔥 Error creating Razorpay order:", err);
//         res.status(500).json({
//             success: false,
//             message: "Failed to create Razorpay order",
//             error: err.message,
//         });
//     }
// };

export const createRazorpayOrder = async (req, res) => {
    try {
        const { orderId } = req.body;

        if (!orderId) {
            return res.status(400).json({ message: "❌ orderId is required" });
        }

        const order = await Order.findById(orderId).populate("user");
        if (!order) {
            return res.status(404).json({ message: "❌ Order not found" });
        }

        // 🚫 Prevent duplicate payment
        if (order.paid) {
            return res.status(400).json({ message: "⚠️ Order is already paid" });
        }

        // ✅ Ensure final payable amount is already saved in DB
        if (!order.amount || order.amount <= 0) {
            return res.status(400).json({ message: "❌ Invalid order amount" });
        }

        // Convert to paise
        const amountInPaise = Math.round(order.amount * 100);

        // ✅ Create Razorpay order
        const razorpayOrder = await razorpay.orders.create({
            amount: amountInPaise,
            currency: "INR",
            receipt: order._id.toString(),
            payment_capture: 1,
            notes: {
                orderId: order._id.toString(),
                customer: order.user?.name || "Guest User",
            },
        });

        // ✅ Ensure seller split exists
        await splitOrderForPersistence(order);

        // 🔄 Update order
        order.razorpayOrderId = razorpayOrder.id;
        order.paymentStatus = "pending";
        order.orderStatus = "Awaiting Payment";

        // 📌 Tracking history
        if (!order.trackingHistory || order.trackingHistory.length === 0) {
            order.trackingHistory = [
                { status: "Order Placed", timestamp: new Date(), location: "Store" },
                { status: "Awaiting Payment", timestamp: new Date() },
            ];
        } else {
            order.trackingHistory.push({
                status: "Awaiting Payment",
                timestamp: new Date(),
            });
        }

        // 🎁 Optional: E-Card generation
        try {
            const { occasion, festival } = await determineOccasions({
                userId: order.user._id,
                userDoc: order.user,
            });

            const message = craftMessage({
                occasion,
                user: order.user,
                festival,
            });

            if (message) {
                const pdfBuffer = await buildEcardPdf({
                    title: "A Special Note from Joyory 🎉",
                    name: order.user?.name || "Customer",
                    message,
                });

                // Upload PDF to Cloudinary
                const uploadResult = await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        {
                            folder: "ecards",
                            resource_type: "raw",
                            public_id: `ecard-${order._id}`,
                            access_mode: "public",
                        },
                        (error, result) => {
                            if (error) return reject(error);
                            resolve(result);
                        }
                    );
                    uploadStream.end(pdfBuffer);
                });

                // Send email with PDF
                await sendEmail(
                    order.user.email,
                    "🎁 Your Joyory E-Card",
                    `<p>${message}</p><p>We’ve also attached your special card as a PDF.</p>`,
                    [
                        {
                            filename: "ecard.pdf",
                            content: pdfBuffer,
                            contentType: "application/pdf",
                        },
                    ]
                );

                // Save e-card reference in order
                order.ecard = {
                    occasion,
                    message,
                    emailSentAt: new Date(),
                    pdfUrl: uploadResult?.secure_url || null,
                };
            }
        } catch (ecardErr) {
            console.warn("⚠️ E-Card skipped:", ecardErr.message);
        }

        await order.save();

        return res.status(200).json({
            success: true,
            message: "✅ Razorpay order created (E-card processed if applicable)",
            razorpayOrderId: razorpayOrder.id,
            amount: order.amount, // ✅ final discounted total
            currency: "INR",
            orderId: order._id,
        });
    } catch (err) {
        console.error("🔥 Error creating Razorpay order:", err);
        res.status(500).json({
            success: false,
            message: "Failed to create Razorpay order",
            error: err.message,
        });
    }
};


export const verifyRazorpayPayment = async (req, res) => {
    try {
        const {
            orderId,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            shippingAddress,
        } = req.body;

        console.log("📥 Incoming payment verification request:", req.body);

        // STEP 1: Validate fields
        if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            console.error("❌ Missing fields:", { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature });
            return res.status(400).json({
                step: "FIELD_VALIDATION",
                success: false,
                message: "Missing required payment fields",
                debug: { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
            });
        }

        // STEP 2: Fetch order
        const order = await Order.findById(orderId)
            .populate("user")
            .populate("products.productId");

        if (!order) {
            console.error("❌ Order not found:", orderId);
            return res.status(404).json({
                step: "ORDER_FETCH",
                success: false,
                message: "Order not found",
                orderId
            });
        }

        // STEP 3: Idempotency check
        if (order.paid) {
            console.warn("⚠️ Order already paid:", order._id);
            return res.status(200).json({
                step: "IDEMPOTENCY",
                success: true,
                message: "Order already verified & paid",
                order
            });
        }

        // STEP 4: Razorpay Order match
        if (order.razorpayOrderId && order.razorpayOrderId !== razorpay_order_id) {
            console.error("❌ Razorpay Order ID mismatch", { expected: order.razorpayOrderId, got: razorpay_order_id });
            return res.status(400).json({
                step: "ORDER_MATCH",
                success: false,
                message: "Order mismatch",
                debug: { expected: order.razorpayOrderId, got: razorpay_order_id }
            });
        }

        // STEP 5: Signature verification
        const signBody = `${razorpay_order_id}|${razorpay_payment_id}`;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(signBody)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            console.error("❌ Invalid signature", { expectedSignature, got: razorpay_signature });
            return res.status(400).json({
                step: "SIGNATURE",
                success: false,
                message: "Invalid signature / payment failed",
                debug: { expectedSignature, got: razorpay_signature }
            });
        }
        console.log("✅ Signature verified");

        // STEP 6: Fetch payment from Razorpay
        let rpPayment;
        try {
            rpPayment = await razorpay.payments.fetch(razorpay_payment_id);
            console.log("✅ Razorpay payment fetched:", rpPayment);
        } catch (fetchErr) {
            console.error("❌ Error fetching Razorpay payment:", fetchErr.response?.data || fetchErr.message);
            return res.status(500).json({
                step: "RAZORPAY_FETCH",
                success: false,
                message: "Failed to fetch payment from Razorpay",
                error: fetchErr.message,
                details: fetchErr.response?.data || null
            });
        }

        // STEP 7: Payment status check
        if (rpPayment.status !== "captured") {
            console.error("❌ Payment not captured:", rpPayment.status);
            return res.status(400).json({
                step: "PAYMENT_STATUS",
                success: false,
                message: `Payment not captured (status: ${rpPayment.status})`,
                debug: rpPayment
            });
        }

        // STEP 8: Amount check
        const paidAmountInInr = rpPayment.amount / 100;
        if (paidAmountInInr !== order.amount) {
            console.error("❌ Amount mismatch", { razorpayAmount: paidAmountInInr, orderAmount: order.amount });
            return res.status(400).json({
                step: "AMOUNT_CHECK",
                success: false,
                message: "Amount mismatch",
                debug: { razorpayAmount: paidAmountInInr, orderAmount: order.amount }
            });
        }

        // STEP 9: Deduct stock
        for (const item of order.products) {
            const product = await Product.findById(item.productId._id);
            if (!product) {
                console.warn("⚠️ Product not found:", item.productId._id);
                continue;
            }

            if (product.quantity < item.quantity) {
                console.error("❌ Insufficient stock:", { product: product.name, available: product.quantity, requested: item.quantity });
                return res.status(400).json({
                    step: "STOCK_CHECK",
                    success: false,
                    message: `Insufficient stock for ${product.name}`,
                    debug: { available: product.quantity, requested: item.quantity }
                });
            }

            product.quantity -= item.quantity;
            product.sales = (product.sales || 0) + item.quantity;
            product.status =
                product.quantity <= 0
                    ? "Out of stock"
                    : product.quantity < product.thresholdValue
                        ? "Low stock"
                        : "In-stock";

            await product.save();
            console.log(`✅ Stock updated for product ${product.name}`);
        }

        // STEP 10: Mark order as paid
        order.paid = true;
        order.paymentStatus = "success";
        order.paymentMethod === "COD" ? "COD" : "Prepaid"
        order.transactionId = razorpay_payment_id;
        order.razorpayOrderId = razorpay_order_id;
        order.orderStatus = "Processing";

        if (shippingAddress) {
            order.shippingAddress = shippingAddress;
        }

        // STEP 11: Save Payment record
        try {
            await Payment.create({
                order: order._id,
                method: rpPayment.method || "Razorpay",
                status: "Completed",
                transactionId: razorpay_payment_id,
                amount: order.amount,
                cardHolderName: rpPayment.card ? rpPayment.card.name : undefined,
                cardNumber: rpPayment.card ? rpPayment.card.last4 : undefined,
                expiryDate: rpPayment.card
                    ? `${rpPayment.card.expiry_month}/${rpPayment.card.expiry_year}`
                    : undefined,
                isActive: true,
            });
            console.log("✅ Payment record saved");
        } catch (paymentErr) {
            console.error("❌ Error saving Payment record:", paymentErr);
        }

        // STEP 12: Clear user cart
        try {
            const user = await User.findById(order.user._id);
            if (user) {
                user.cart = [];
                await user.save();
                console.log("✅ User cart cleared");
            }
        } catch (userErr) {
            console.error("❌ Error clearing user cart:", userErr);
        }

        // STEP 13: Shiprocket Integration
        let shiprocketRes = null;
        try {
            // shiprocketRes = await createShiprocketOrder(order); // my updated version returns { shipmentDetails, rawResponses }
            shiprocketRes = await createShipment(order);
            order.shipment = shiprocketRes.shipmentDetails;
            console.log("✅ Shiprocket order created:", order.shipment);
        } catch (shipErr) {
            console.error("❌ Shiprocket error:", shipErr.response?.data || shipErr.message);
            return res.status(502).json({
                step: "SHIPROCKET",
                success: false,
                message: "Shiprocket order creation failed",
                error: shipErr.message,
                details: shipErr.response?.data || null
            });
        }



        // // STEP 13: Shiprocket Integration (Non-blocking)
        // let shiprocketRes = null;
        // try {
        //     shiprocketRes = await createShiprocketOrder(order); // returns { shipmentDetails, rawResponses }
        //     order.shipment = shiprocketRes.shipmentDetails;
        //     console.log("✅ Shiprocket order created:", order.shipment);
        // } catch (shipErr) {
        //     console.error("❌ Shiprocket error:", shipErr.response?.data || shipErr.message);

        //     // Mark shipping as pending but don't fail the payment
        //     order.shipment = {
        //         status: "Unshipped",
        //         error: shipErr.response?.data?.message || shipErr.message
        //     };
        //     console.warn("⚠️ Payment success but Shiprocket failed → order marked as Processing, shipment pending.");
        // }

        // STEP 14: Tracking history
        if (!order.trackingHistory) order.trackingHistory = [];
        order.trackingHistory.push(
            { status: "Payment Successful", timestamp: new Date(), location: "Online Payment - Razorpay" },
            { status: "Processing", timestamp: new Date(), location: "Store" }
        );

        await order.save();

        // STEP 15: Deduct walletBalance (referral/points) after successful payment
        try {
            if (order.pointsUsed && order.pointsUsed > 0) {
                const user = await User.findById(order.user._id);
                if (user) {
                    const pointsValue = order.pointsUsed * 0.1; // 1 point = 0.1 INR
                    if (user.walletBalance >= pointsValue) {
                        user.walletBalance -= pointsValue;
                    } else {
                        console.warn(`⚠️ Wallet balance insufficient. Available: ${user.walletBalance}, Required: ${pointsValue}`);
                        user.walletBalance = 0; // deduct whatever is left
                    }
                    await user.save();
                    console.log(`✅ Wallet points deducted: ${order.pointsUsed} points → ₹${pointsValue}`);
                } else {
                    console.error("❌ User not found for wallet deduction", { userId: order.user._id });
                }
            }
        } catch (walletErr) {
            console.error("🔥 Error deducting wallet points:", walletErr);
        }

        console.log("✅ Order updated successfully");



        // STEP 16: Generate Invoice PDF
        try {
            const { pdfBuffer, pdfUrl } = await generateInvoice(order, order.user);

            // Save invoice details in order
            order.invoice = {
                number: `INV-${order._id}`,
                generatedAt: new Date(),
                pdfUrl,
            };
            await order.save();

            // Email Invoice
            await sendEmail(
                order.user.email,
                "🧾 Your Invoice from Joyory",
                `<p>Hi ${order.user.name},</p>
         <p>Thank you for your purchase! Please find your invoice attached.</p>`,
                [
                    {
                        filename: "invoice.pdf",
                        content: pdfBuffer,
                        contentType: "application/pdf",
                    },
                ]
            );

            console.log("✅ Invoice generated & emailed");
        } catch (invoiceErr) {
            console.error("❌ Failed to generate invoice:", invoiceErr);
        }


        return res.status(200).json({
            step: "COMPLETE",
            success: true,
            message: shiprocketRes
                ? "Payment verified, stock updated, order paid & shipment created"
                : "Payment verified, stock updated, order paid (shipment pending)",
            paymentMethod: rpPayment.method,
            order,
            debug: {
                razorpayPayment: rpPayment,
                shiprocket: shiprocketRes?.rawResponses || null
            }
        });



    } catch (err) {
        console.error("🔥 Fatal error verifying Razorpay payment:", err);
        res.status(500).json({
            step: "FATAL",
            success: false,
            message: "Unexpected server error during payment verification",
            error: err.message,
            stack: err.stack,
            details: err.response?.data || null
        });
    }
};

// export const verifyRazorpayPayment = async (req, res) => {
//     try {
//         const {
//             orderId,
//             razorpay_order_id,
//             razorpay_payment_id,
//             razorpay_signature,
//             shippingAddress,
//         } = req.body;

//         console.log("📥 Incoming payment verification request:", req.body);

//         // STEP 1: Validate fields
//         if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
//             console.error("❌ Missing fields:", { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature });
//             return res.status(400).json({
//                 step: "FIELD_VALIDATION",
//                 success: false,
//                 message: "Missing required payment fields",
//                 debug: { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
//             });
//         }

//         // STEP 2: Fetch order
//         const order = await Order.findById(orderId)
//             .populate("user")
//             .populate("products.productId");

//         if (!order) {
//             console.error("❌ Order not found:", orderId);
//             return res.status(404).json({
//                 step: "ORDER_FETCH",
//                 success: false,
//                 message: "Order not found",
//                 orderId
//             });
//         }

//         // STEP 3: Idempotency check
//         if (order.paid) {
//             console.warn("⚠️ Order already paid:", order._id);
//             return res.status(200).json({
//                 step: "IDEMPOTENCY",
//                 success: true,
//                 message: "Order already verified & paid",
//                 order
//             });
//         }

//         // STEP 4: Razorpay Order match
//         if (order.razorpayOrderId && order.razorpayOrderId !== razorpay_order_id) {
//             console.error("❌ Razorpay Order ID mismatch", { expected: order.razorpayOrderId, got: razorpay_order_id });
//             return res.status(400).json({
//                 step: "ORDER_MATCH",
//                 success: false,
//                 message: "Order mismatch",
//                 debug: { expected: order.razorpayOrderId, got: razorpay_order_id }
//             });
//         }

//         // STEP 5: Signature verification
//         const signBody = `${razorpay_order_id}|${razorpay_payment_id}`;
//         const expectedSignature = crypto
//             .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
//             .update(signBody)
//             .digest("hex");

//         if (expectedSignature !== razorpay_signature) {
//             console.error("❌ Invalid signature", { expectedSignature, got: razorpay_signature });
//             return res.status(400).json({
//                 step: "SIGNATURE",
//                 success: false,
//                 message: "Invalid signature / payment failed",
//                 debug: { expectedSignature, got: razorpay_signature }
//             });
//         }
//         console.log("✅ Signature verified");

//         // STEP 6: Fetch payment from Razorpay
//         let rpPayment;
//         try {
//             rpPayment = await razorpay.payments.fetch(razorpay_payment_id);
//             console.log("✅ Razorpay payment fetched:", rpPayment);
//         } catch (fetchErr) {
//             console.error("❌ Error fetching Razorpay payment:", fetchErr.response?.data || fetchErr.message);
//             return res.status(500).json({
//                 step: "RAZORPAY_FETCH",
//                 success: false,
//                 message: "Failed to fetch payment from Razorpay",
//                 error: fetchErr.message,
//                 details: fetchErr.response?.data || null
//             });
//         }

//         // STEP 7: Payment status check
//         if (rpPayment.status !== "captured") {
//             console.error("❌ Payment not captured:", rpPayment.status);
//             return res.status(400).json({
//                 step: "PAYMENT_STATUS",
//                 success: false,
//                 message: `Payment not captured (status: ${rpPayment.status})`,
//                 debug: rpPayment
//             });
//         }

//         // STEP 8: Amount check
//         const paidAmountInInr = rpPayment.amount / 100;
//         if (paidAmountInInr !== order.amount) {
//             console.error("❌ Amount mismatch", { razorpayAmount: paidAmountInInr, orderAmount: order.amount });
//             return res.status(400).json({
//                 step: "AMOUNT_CHECK",
//                 success: false,
//                 message: "Amount mismatch",
//                 debug: { razorpayAmount: paidAmountInInr, orderAmount: order.amount }
//             });
//         }

//         // STEP 9: Deduct stock
//         for (const item of order.products) {
//             const product = await Product.findById(item.productId._id);
//             if (!product) {
//                 console.warn("⚠️ Product not found:", item.productId._id);
//                 continue;
//             }

//             if (product.quantity < item.quantity) {
//                 console.error("❌ Insufficient stock:", { product: product.name, available: product.quantity, requested: item.quantity });
//                 return res.status(400).json({
//                     step: "STOCK_CHECK",
//                     success: false,
//                     message: `Insufficient stock for ${product.name}`,
//                     debug: { available: product.quantity, requested: item.quantity }
//                 });
//             }

//             product.quantity -= item.quantity;
//             product.sales = (product.sales || 0) + item.quantity;
//             product.status =
//                 product.quantity <= 0
//                     ? "Out of stock"
//                     : product.quantity < product.thresholdValue
//                         ? "Low stock"
//                         : "In-stock";

//             await product.save();
//             console.log(`✅ Stock updated for product ${product.name}`);
//         }

//         // STEP 10: Mark order as paid
//         order.paid = true;
//         order.paymentStatus = "success";
//         order.paymentMethod === "COD" ? "COD" : "Prepaid"
//         order.transactionId = razorpay_payment_id;
//         order.razorpayOrderId = razorpay_order_id;
//         order.orderStatus = "Processing";

//         if (shippingAddress) {
//             order.shippingAddress = shippingAddress;
//         }

//         // STEP 11: Save Payment record
//         try {
//             await Payment.create({
//                 order: order._id,
//                 method: rpPayment.method || "Razorpay",
//                 status: "Completed",
//                 transactionId: razorpay_payment_id,
//                 amount: order.amount,
//                 cardHolderName: rpPayment.card ? rpPayment.card.name : undefined,
//                 cardNumber: rpPayment.card ? rpPayment.card.last4 : undefined,
//                 expiryDate: rpPayment.card
//                     ? `${rpPayment.card.expiry_month}/${rpPayment.card.expiry_year}`
//                     : undefined,
//                 isActive: true,
//             });
//             console.log("✅ Payment record saved");
//         } catch (paymentErr) {
//             console.error("❌ Error saving Payment record:", paymentErr);
//         }

//         // STEP 12: Clear user cart
//         try {
//             const user = await User.findById(order.user._id);
//             if (user) {
//                 user.cart = [];
//                 await user.save();
//                 console.log("✅ User cart cleared");
//             }
//         } catch (userErr) {
//             console.error("❌ Error clearing user cart:", userErr);
//         }

//         // STEP 13: Shiprocket Integration
//         let shiprocketRes = null;
//         try {
//             // shiprocketRes = await createShiprocketOrder(order); // my updated version returns { shipmentDetails, rawResponses }
//             shiprocketRes = await createShipment(order);
//             order.shipment = shiprocketRes.shipmentDetails;
//             console.log("✅ Shiprocket order created:", order.shipment);
//         } catch (shipErr) {
//             console.error("❌ Shiprocket error:", shipErr.response?.data || shipErr.message);
//             return res.status(502).json({
//                 step: "SHIPROCKET",
//                 success: false,
//                 message: "Shiprocket order creation failed",
//                 error: shipErr.message,
//                 details: shipErr.response?.data || null
//             });
//         }


//         // STEP 15: Referral rewards (non-blocking)
//         try {
//             const referral = await Referral.findOne({
//                 referee: order.user._id,
//                 status: "pending",
//             });

//             if (referral) {
//                 if (order.amount >= referral.minOrderAmount) {
//                     // ✅ Reward referee
//                     await User.findByIdAndUpdate(referral.referee, {
//                         $inc: { walletBalance: referral.rewardForReferee },
//                     });
//                     console.log(`✅ Referee rewarded: +${referral.rewardForReferee} to ${referral.referee}`);

//                     // ✅ Reward referrer
//                     await User.findByIdAndUpdate(referral.referrer, {
//                         $inc: { walletBalance: referral.rewardForReferrer },
//                     });
//                     console.log(`✅ Referrer rewarded: +${referral.rewardForReferrer} to ${referral.referrer}`);

//                     referral.status = "rewarded";
//                     referral.rewardedAt = new Date();
//                     await referral.save();
//                     console.log(`✅ Referral status updated to 'rewarded'`);
//                 } else {
//                     console.log(`⚠️ Order amount (${order.amount}) less than minOrderAmount (${referral.minOrderAmount}). Referral not rewarded yet.`);
//                 }
//             } else {
//                 console.log("ℹ️ No pending referral found for this user.");
//             }
//         } catch (refErr) {
//             console.error("❌ Referral reward processing failed:", refErr.message);
//             // Do NOT throw, continue normal order flow
//         }

//         // // STEP 13: Shiprocket Integration (Non-blocking)
//         // let shiprocketRes = null;
//         // try {
//         //     shiprocketRes = await createShiprocketOrder(order); // returns { shipmentDetails, rawResponses }
//         //     order.shipment = shiprocketRes.shipmentDetails;
//         //     console.log("✅ Shiprocket order created:", order.shipment);
//         // } catch (shipErr) {
//         //     console.error("❌ Shiprocket error:", shipErr.response?.data || shipErr.message);

//         //     // Mark shipping as pending but don't fail the payment
//         //     order.shipment = {
//         //         status: "Unshipped",
//         //         error: shipErr.response?.data?.message || shipErr.message
//         //     };
//         //     console.warn("⚠️ Payment success but Shiprocket failed → order marked as Processing, shipment pending.");
//         // }

//         // STEP 14: Tracking history
//         if (!order.trackingHistory) order.trackingHistory = [];
//         order.trackingHistory.push(
//             { status: "Payment Successful", timestamp: new Date(), location: "Online Payment - Razorpay" },
//             { status: "Processing", timestamp: new Date(), location: "Store" }
//         );

//         await order.save();
//         console.log("✅ Order updated successfully");

//         return res.status(200).json({
//             step: "COMPLETE",
//             success: true,
//             message: shiprocketRes
//                 ? "Payment verified, stock updated, order paid & shipment created"
//                 : "Payment verified, stock updated, order paid (shipment pending)",
//             paymentMethod: rpPayment.method,
//             order,
//             debug: {
//                 razorpayPayment: rpPayment,
//                 shiprocket: shiprocketRes?.rawResponses || null
//             }
//         });


//     } catch (err) {
//         console.error("🔥 Fatal error verifying Razorpay payment:", err);
//         res.status(500).json({
//             step: "FATAL",
//             success: false,
//             message: "Unexpected server error during payment verification",
//             error: err.message,
//             stack: err.stack,
//             details: err.response?.data || null
//         });
//     }
// };

//after giftcard use this
// export const verifyRazorpayPayment = async (req, res) => {
//     try {
//         const {
//             orderId,
//             razorpay_order_id,
//             razorpay_payment_id,
//             razorpay_signature,
//             shippingAddress,
//         } = req.body;

//         console.log("📥 Incoming payment verification request:", req.body);

//         // STEP 1: Validate fields
//         if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
//             console.error("❌ Missing fields:", { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature });
//             return res.status(400).json({
//                 step: "FIELD_VALIDATION",
//                 success: false,
//                 message: "Missing required payment fields",
//                 debug: { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
//             });
//         }

//         // STEP 2: Fetch order
//         const order = await Order.findById(orderId)
//             .populate("user")
//             .populate("products.productId");

//         if (!order) {
//             console.error("❌ Order not found:", orderId);
//             return res.status(404).json({
//                 step: "ORDER_FETCH",
//                 success: false,
//                 message: "Order not found",
//                 orderId
//             });
//         }

//         // STEP 3: Idempotency check
//         if (order.paid) {
//             console.warn("⚠️ Order already paid:", order._id);
//             return res.status(200).json({
//                 step: "IDEMPOTENCY",
//                 success: true,
//                 message: "Order already verified & paid",
//                 order
//             });
//         }

//         // STEP 4: Razorpay Order match
//         if (order.razorpayOrderId && order.razorpayOrderId !== razorpay_order_id) {
//             console.error("❌ Razorpay Order ID mismatch", { expected: order.razorpayOrderId, got: razorpay_order_id });
//             return res.status(400).json({
//                 step: "ORDER_MATCH",
//                 success: false,
//                 message: "Order mismatch",
//                 debug: { expected: order.razorpayOrderId, got: razorpay_order_id }
//             });
//         }

//         // STEP 5: Signature verification
//         const signBody = `${razorpay_order_id}|${razorpay_payment_id}`;
//         const expectedSignature = crypto
//             .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
//             .update(signBody)
//             .digest("hex");

//         if (expectedSignature !== razorpay_signature) {
//             console.error("❌ Invalid signature", { expectedSignature, got: razorpay_signature });
//             return res.status(400).json({
//                 step: "SIGNATURE",
//                 success: false,
//                 message: "Invalid signature / payment failed",
//                 debug: { expectedSignature, got: razorpay_signature }
//             });
//         }
//         console.log("✅ Signature verified");

//         // STEP 6: Fetch payment from Razorpay
//         let rpPayment;
//         try {
//             rpPayment = await razorpay.payments.fetch(razorpay_payment_id);
//             console.log("✅ Razorpay payment fetched:", rpPayment);
//         } catch (fetchErr) {
//             console.error("❌ Error fetching Razorpay payment:", fetchErr.response?.data || fetchErr.message);
//             return res.status(500).json({
//                 step: "RAZORPAY_FETCH",
//                 success: false,
//                 message: "Failed to fetch payment from Razorpay",
//                 error: fetchErr.message,
//                 details: fetchErr.response?.data || null
//             });
//         }

//         // STEP 7: Payment status check
//         if (rpPayment.status !== "captured") {
//             console.error("❌ Payment not captured:", rpPayment.status);
//             return res.status(400).json({
//                 step: "PAYMENT_STATUS",
//                 success: false,
//                 message: `Payment not captured (status: ${rpPayment.status})`,
//                 debug: rpPayment
//             });
//         }

//         // STEP 8: Amount check
//         const paidAmountInInr = rpPayment.amount / 100;
//         if (paidAmountInInr !== order.amount) {
//             console.error("❌ Amount mismatch", { razorpayAmount: paidAmountInInr, orderAmount: order.amount });
//             return res.status(400).json({
//                 step: "AMOUNT_CHECK",
//                 success: false,
//                 message: "Amount mismatch",
//                 debug: { razorpayAmount: paidAmountInInr, orderAmount: order.amount }
//             });
//         }


//         // STEP 9: Deduct stock (Only if it's a product order)
//         if (order.orderType !== "giftcard") {
//             for (const item of order.products) {
//                 const product = await Product.findById(item.productId._id);
//                 if (!product) {
//                     console.warn("⚠️ Product not found:", item.productId._id);
//                     continue;
//                 }

//                 if (product.quantity < item.quantity) {
//                     console.error("❌ Insufficient stock:", { product: product.name, available: product.quantity, requested: item.quantity });
//                     return res.status(400).json({
//                         step: "STOCK_CHECK",
//                         success: false,
//                         message: `Insufficient stock for ${product.name}`,
//                         debug: { available: product.quantity, requested: item.quantity }
//                     });
//                 }

//                 product.quantity -= item.quantity;
//                 product.sales = (product.sales || 0) + item.quantity;
//                 product.status =
//                     product.quantity <= 0
//                         ? "Out of stock"
//                         : product.quantity < product.thresholdValue
//                             ? "Low stock"
//                             : "In-stock";

//                 await product.save();
//                 console.log(`✅ Stock updated for product ${product.name}`);
//             }
//         }

//         // STEP 10: Mark order as paid
//         order.paid = true;
//         order.paymentStatus = "success";
//         order.paymentMethod === "COD" ? "COD" : "Prepaid"
//         order.transactionId = razorpay_payment_id;
//         order.razorpayOrderId = razorpay_order_id;
//         order.orderStatus = "Processing";

//         if (shippingAddress) {
//             order.shippingAddress = shippingAddress;
//         }

//         // STEP 11: Save Payment record (unchanged)
//         try {
//             await Payment.create({
//                 order: order._id,
//                 method: rpPayment.method || "Razorpay",
//                 status: "Completed",
//                 transactionId: razorpay_payment_id,
//                 amount: order.amount,
//                 cardHolderName: rpPayment.card ? rpPayment.card.name : undefined,
//                 cardNumber: rpPayment.card ? rpPayment.card.last4 : undefined,
//                 expiryDate: rpPayment.card
//                     ? `${rpPayment.card.expiry_month}/${rpPayment.card.expiry_year}`
//                     : undefined,
//                 isActive: true,
//             });
//             console.log("✅ Payment record saved");
//         } catch (paymentErr) {
//             console.error("❌ Error saving Payment record:", paymentErr);
//         }

//         // STEP 12: Clear user cart (only if normal product order)
//         if (order.orderType !== "giftcard") {
//             try {
//                 const user = await User.findById(order.user._id);
//                 if (user) {
//                     user.cart = [];
//                     await user.save();
//                     console.log("✅ User cart cleared");
//                 }
//             } catch (userErr) {
//                 console.error("❌ Error clearing user cart:", userErr);
//             }
//         }

//         // ✅ STEP 13: GiftCard Flow
//         if (order.orderType === "giftcard") {
//             try {
//                 const { recipientEmail, recipientName, message } = order.giftDetails;

//                 const giftCard = await GiftCard.create({
//                     code: "GC-" + Math.random().toString(36).substr(2, 8).toUpperCase(),
//                     pin: Math.floor(100000 + Math.random() * 900000).toString(),
//                     amount: order.amount,
//                     sender: order.user._id,
//                     recipientEmail,
//                     recipientName,
//                     message,
//                     status: "active",
//                 });

//                 console.log("🎁 Gift Card generated:", giftCard);

//                 // Send email to recipient
//                 await sendGiftCardEmail({
//                     to: recipientEmail,
//                     fromName: order.user.name,
//                     recipientName,
//                     code: giftCard.code,
//                     pin: giftCard.pin,
//                     amount: giftCard.amount,
//                     message,
//                 });

//                 console.log("📧 Gift Card sent to:", recipientEmail);

//                 // Update order
//                 order.orderStatus = "GiftCard Sent";
//             } catch (giftErr) {
//                 console.error("❌ Gift Card flow failed:", giftErr);
//             }
//         } else {
//             // ✅ STEP 13: Shiprocket Integration (existing for product orders)
//             let shiprocketRes = null;
//             try {
//                 shiprocketRes = await createShipment(order);
//                 order.shipment = shiprocketRes.shipmentDetails;
//                 console.log("✅ Shiprocket order created:", order.shipment);
//             } catch (shipErr) {
//                 console.error("❌ Shiprocket error:", shipErr.response?.data || shipErr.message);
//                 return res.status(502).json({
//                     step: "SHIPROCKET",
//                     success: false,
//                     message: "Shiprocket order creation failed",
//                     error: shipErr.message,
//                     details: shipErr.response?.data || null
//                 });
//             }
//         }

//         // STEP 14: Tracking history (common)
//         if (!order.trackingHistory) order.trackingHistory = [];
//         order.trackingHistory.push(
//             { status: "Payment Successful", timestamp: new Date(), location: "Online Payment - Razorpay" },
//             { status: order.orderType === "giftcard" ? "GiftCard Sent" : "Processing", timestamp: new Date(), location: "Store" }
//         );

//         await order.save();
//         console.log("✅ Order updated successfully");

//         return res.status(200).json({
//             step: "COMPLETE",
//             success: true,
//             message: order.orderType === "giftcard"
//                 ? "Payment verified & Gift Card sent 🎁"
//                 : "Payment verified, stock updated, order paid & shipment created",
//             paymentMethod: rpPayment.method,
//             order,
//         });

//     } catch (err) {
//         console.error("🔥 Fatal error verifying Razorpay payment:", err);
//         res.status(500).json({
//             step: "FATAL",
//             success: false,
//             message: "Unexpected server error during payment verification",
//             error: err.message,
//             stack: err.stack,
//             details: err.response?.data || null
//         });
//     }
// };

export const payForOrder = async (req, res) => {
    try {
        const order = req.order;

        if (order.status === 'Completed') {
            return res.status(400).json({ message: 'Order already Completed' });
        }

        // ✅ No stock manipulation

        // ✅ Update order
        order.status = 'Completed';
        order.paymentDate = new Date();
        await order.save();

        // ✅ Affiliate payout
        if (order.affiliate) {
            const affiliate = await Affiliate.findById(order.affiliate);
            if (affiliate) {
                const earning = order.amount * (affiliate.commissionRate || 0.15); // default 15%
                affiliate.totalEarnings += earning;
                affiliate.successfulOrders += 1;
                await affiliate.save();
            }
        }

        // ✅ Create payment
        const PaymentModel = (await import('../../../models/settings/payments/Payment.js')).default;

        const payment = await PaymentModel.create({
            order: order._id,
            method: req.body.method,
            status: 'Completed',
            transactionId: req.body.transactionId || `TXN-${Date.now()}`,
            amount: order.total || order.amount || 0,
            cardHolderName: req.body.cardHolderName,
            cardNumber: req.body.cardNumber ? encrypt(req.body.cardNumber) : undefined,
            expiryDate: req.body.expiryDate
        });

        // ✅ Send response once only
        res.status(200).json({
            message: 'Payment successful',
            orderId: order._id,
            paymentId: payment._id
        });

        // ✅ Background affiliate update (no res.send here!)
        for (const item of order.products) {
            const product = await Product.findById(item.productId);
            if (!product) continue;

            const profit = (product.sellingPrice - product.buyingPrice) * item.quantity;

            let activity = await AffiliateActivity.findOne({ product: product._id });
            if (!activity) {
                activity = new AffiliateActivity({ product: product._id });
            }

            const prevRevenue = activity.revenue || 0;
            const newRevenue = prevRevenue + (item.price * item.quantity);
            const trend = prevRevenue === 0 ? 100 : (((newRevenue - prevRevenue) / prevRevenue) * 100).toFixed(1);

            activity.conversions += item.quantity;
            activity.revenue = newRevenue;
            activity.trend = parseFloat(trend);
            await activity.save();
        }

    } catch (err) {
        // ✅ Only one response in case of error
        return res.status(400).json({ message: "Payment failed", error: err.message });
    }
};



export const createPayment = async (req, res) => {
    try {
        const {
            order,
            method,
            status,
            transactionId,
            amount,
            cardHolderName,
            cardNumber,
            expiryDate,
            isActive
        } = req.body;

        let existingOrder = null;

        if (mongoose.Types.ObjectId.isValid(order)) {
            existingOrder = await Order.findById(order);
        }

        if (!existingOrder) {
            existingOrder = await Order.findOne({ orderId: order });
        }

        if (!existingOrder) {
            return res.status(400).json({ message: 'Invalid order ID' });
        }

        const encrypted = cardNumber ? encrypt(cardNumber) : undefined;

        const payment = await Payment.create({
            order: existingOrder._id,
            method,
            status,
            transactionId,
            amount,
            cardHolderName,
            cardNumber: encrypted,
            expiryDate,
            isActive
        });

        res.status(201).json({ message: 'Payment recorded', payment });
    } catch (err) {
        res.status(500).json({ message: 'Payment creation failed', error: err.message });
    }
};


export const getMethodSummary = async (req, res) => {
    try {
        const summary = await Payment.aggregate([
            {
                $lookup: {
                    from: 'paymentmethods',
                    localField: 'method',
                    foreignField: '_id',
                    as: 'methodDetails'
                }
            },
            { $unwind: '$methodDetails' },
            {
                $group: {
                    _id: '$methodDetails._id',
                    name: { $first: '$methodDetails.name' },
                    type: { $first: '$methodDetails.type' },
                    transactions: { $sum: 1 },
                    revenue: { $sum: '$amount' }
                }
            }
        ]);

        res.status(200).json(summary);
    } catch (err) {
        res.status(500).json({ message: 'Summary error', error: err.message });
    }
};

export const filterPaymentsByDate = async (req, res) => {
    try {
        const { range } = req.params;
        let from = new Date();

        if (range === '7d') from.setDate(from.getDate() - 7);
        else if (range === '30d') from.setDate(from.getDate() - 30);
        else if (range === '1y') from.setFullYear(from.getFullYear() - 1);
        else return res.status(400).json({ message: 'Invalid range' });

        const payments = await Payment.find({ createdAt: { $gte: from } })
            .populate('order')
            .populate('method');

        res.status(200).json(payments);
    } catch (err) {
        res.status(500).json({ message: 'Filtering failed', error: err.message });
    }
};

export const getDashboardSummary = async (req, res) => {
    try {
        const range = req.query.range || '7d';
        const statusFilter = req.query.status || 'all';

        const now = new Date();
        const getDateOffset = (days) => {
            const d = new Date();
            d.setDate(d.getDate() - days);
            return d;
        };

        let currentStart, prevStart;
        if (range === '7d') {
            currentStart = getDateOffset(7);
            prevStart = getDateOffset(14);
        } else if (range === '30d') {
            currentStart = getDateOffset(30);
            prevStart = getDateOffset(60);
        } else if (range === '1y') {
            currentStart = new Date(now.setFullYear(now.getFullYear() - 1));
            prevStart = new Date(now.setFullYear(now.getFullYear() - 1));
        } else {
            return res.status(400).json({ message: 'Invalid range' });
        }

        const matchStatus = statusFilter !== 'all' ? { status: statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1).toLowerCase() } : {};

        const [curr, prev] = await Promise.all([
            Payment.aggregate([
                { $match: { ...matchStatus, createdAt: { $gte: currentStart } } },
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 },
                        revenue: { $sum: "$amount" }
                    }
                }
            ]),
            Payment.aggregate([
                { $match: { ...matchStatus, createdAt: { $gte: prevStart, $lt: currentStart } } },
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 },
                        revenue: { $sum: "$amount" }
                    }
                }
            ])
        ]);

        const parseStats = (arr) =>
            arr.reduce((acc, cur) => {
                acc[cur._id] = { count: cur.count, revenue: cur.revenue };
                return acc;
            }, {});

        const currStats = parseStats(curr);
        const prevStats = parseStats(prev);

        const computeChange = (currVal = 0, prevVal = 0) => {
            if (prevVal === 0) return currVal > 0 ? 100 : 0;
            return ((currVal - prevVal) / prevVal) * 100;
        };

        res.status(200).json({
            revenue: {
                total: curr.reduce((sum, item) => sum + item.revenue, 0),
                change: computeChange(
                    curr.reduce((sum, item) => sum + item.revenue, 0),
                    prev.reduce((sum, item) => sum + item.revenue, 0)
                )
            },
            completed: {
                count: currStats.Completed?.count || 0,
                change: computeChange(currStats.Completed?.count, prevStats.Completed?.count)
            },
            pending: {
                count: currStats.Pending?.count || 0,
                change: computeChange(currStats.Pending?.count, prevStats.Pending?.count)
            },
            failed: {
                count: currStats.Failed?.count || 0,
                change: computeChange(currStats.Failed?.count, prevStats.Failed?.count)
            }
        });
    } catch (err) {
        res.status(500).json({ message: 'Dashboard summary failed', error: err.message });
    }
};


export const getPaymentsFiltered = async (req, res) => {
    try {
        const { status, method } = req.query;

        const filter = {};

        if (status && status !== 'all') {
            filter.status = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
        }

        if (method && mongoose.Types.ObjectId.isValid(method)) {
            filter.method = new mongoose.Types.ObjectId(method);
        }

        const payments = await Payment.find(filter)
            .populate('order', 'orderId customerName date amount')
            .populate('method', 'name type')
            .sort({ createdAt: -1 });

        const formatted = payments.map(p => {
            const decrypted = p.cardNumber ? "**** **** **** " + decrypt(p.cardNumber).slice(-4) : null;
            return {
                _id: p._id,
                orderId: p.order?.orderId || 'N/A',
                customerName: p.order?.customerName || 'Unknown',
                date: p.order?.date?.toISOString().split('T')[0] || '',
                total: p.amount,
                method: p.method?.name || 'N/A',
                status: p.status,
                cardMasked: decrypted,
                action: "View Details"
            };
        });

        res.status(200).json(formatted);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch filtered payments', error: err.message });
    }
};

