import Payment from '../../../models/settings/payments/Payment.js';
import PaymentMethod from '../../../models/settings/payments/PaymentMethod.js';
import Order from '../../../models/Order.js';
import { encrypt, decrypt } from '../../../middlewares/utils/encryption.js';
// import { createShiprocketOrder } from "../../../middlewares/services/shiprocket.js";
import { createShipment } from "../../../middlewares/services/shippingProvider.js";
import { sendEmail } from "../../../middlewares/utils/emailService.js"; // ✅ assume you already have an email service
import Product from '../../../models/Product.js';
import Affiliate from '../../../models/Affiliate.js';
import mongoose from 'mongoose';
import User from '../../../models/User.js';
import Referral from '../../../models/Referral.js'; // ✅ You need to import this
import Razorpay from "razorpay";
import crypto from "crypto";
import axios from 'axios';
import dotenv from "dotenv";

import cloudinary from '../../../middlewares/utils/cloudinary.js';
import { determineOccasions, craftMessage } from "../../../middlewares/services/ecardService.js";
import { buildEcardPdf } from "../../../middlewares/services/ecardPdf.js";
import { generateInvoice } from "../../../middlewares/services/invoiceService.js";
import { splitOrderForPersistence } from '../../../middlewares/services/orderSplit.js'; // or correct path

dotenv.config();


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

//         // 🚫 Prevent duplicate payment
//         if (order.paid) {
//             return res.status(400).json({ message: "⚠️ Order is already paid" });
//         }

//         // ✅ Ensure final payable amount is already saved in DB
//         if (!order.amount || order.amount <= 0) {
//             return res.status(400).json({ message: "❌ Invalid order amount" });
//         }

//         // Convert to paise
//         const amountInPaise = Math.round(order.amount * 100);

//         // ✅ Create Razorpay order
//         const razorpayOrder = await razorpay.orders.create({
//             amount: amountInPaise,
//             currency: "INR",
//             receipt: order._id.toString(),
//             payment_capture: 1,
//             notes: {
//                 orderId: order._id.toString(),
//                 customer: order.user?.name || "Guest User",
//             },
//         });

//         // ✅ Ensure seller split exists
//         await splitOrderForPersistence(order);

//         // 🟢 NEW seller tracking (safe, non-blocking)
//         try {
//             const updatedProducts = [];
//             for (const p of order.products) {
//                 if (!p.seller) {
//                     // fallback: fetch product’s seller
//                     const prod = await Product.findById(p.productId).select("seller").lean();
//                     if (prod?.seller) {
//                         p.seller = prod.seller;
//                         updatedProducts.push(p.productId.toString());
//                     } else {
//                         console.warn(
//                             `⚠️ Seller missing for product ${p.productId} in order ${order._id}`
//                         );
//                     }
//                 }
//             }
//             if (updatedProducts.length) {
//                 console.log(`🟢 Backfilled seller for products:`, updatedProducts);
//             }
//         } catch (sellerErr) {
//             console.warn("⚠️ Seller backfill skipped:", sellerErr.message);
//         }

//         // 🔄 Update order
//         order.razorpayOrderId = razorpayOrder.id;
//         order.paymentStatus = "pending";
//         order.orderStatus = "Awaiting Payment";

//         // 📌 Tracking history
//         if (!order.trackingHistory || order.trackingHistory.length === 0) {
//             order.trackingHistory = [
//                 { status: "Order Placed", timestamp: new Date(), location: "Store" },
//                 { status: "Awaiting Payment", timestamp: new Date() },
//             ];
//         } else {
//             order.trackingHistory.push({
//                 status: "Awaiting Payment",
//                 timestamp: new Date(),
//             });
//         }

//         // 🎁 Optional: E-Card generation
//         try {
//             const { occasion, festival } = await determineOccasions({
//                 userId: order.user._id,
//                 userDoc: order.user,
//             });

//             const message = craftMessage({
//                 occasion,
//                 user: order.user,
//                 festival,
//             });

//             if (message) {
//                 const pdfBuffer = await buildEcardPdf({
//                     title: "A Special Note from Joyory 🎉",
//                     name: order.user?.name || "Customer",
//                     message,
//                 });

//                 // Upload PDF to Cloudinary
//                 const uploadResult = await new Promise((resolve, reject) => {
//                     const uploadStream = cloudinary.uploader.upload_stream(
//                         {
//                             folder: "ecards",
//                             resource_type: "raw",
//                             public_id: `ecard-${order._id}`,
//                             access_mode: "public",
//                         },
//                         (error, result) => {
//                             if (error) return reject(error);
//                             resolve(result);
//                         }
//                     );
//                     uploadStream.end(pdfBuffer);
//                 });

//                 // Send email with PDF
//                 await sendEmail(
//                     order.user.email,
//                     "🎁 Your Joyory E-Card",
//                     `<p>${message}</p><p>We’ve also attached your special card as a PDF.</p>`,
//                     [
//                         {
//                             name: "ecard.pdf",
//                             content: pdfBuffer,
//                             mime_type: "application/pdf",
//                         },
//                     ]
//                 );

//                 // Save e-card reference in order
//                 order.ecard = {
//                     occasion,
//                     message,
//                     emailSentAt: new Date(),
//                     pdfUrl: uploadResult?.secure_url || null,
//                 };
//             }
//         } catch (ecardErr) {
//             console.warn("⚠️ E-Card skipped:", ecardErr.message);
//         }

//         await order.save();

//         return res.status(200).json({
//             success: true,
//             message: "✅ Razorpay order created (E-card processed if applicable)",
//             razorpayOrderId: razorpayOrder.id,
//             amount: order.amount, // ✅ final discounted total
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

//         // 🛑 Step 1: Validate orderId
//         if (!orderId) {
//             return res.status(400).json({ success: false, message: "❌ orderId is required." });
//         }

//         // 🧾 Step 2: Fetch order from DB
//         const order = await Order.findById(orderId).populate("user");
//         if (!order) {
//             return res.status(404).json({ success: false, message: "❌ Order not found." });
//         }

//         // 🚫 Step 3: Prevent duplicate payment
//         if (order.paid) {
//             return res.status(400).json({ 
//                 success: false, 
//                 message: "⚠️ This order has already been paid. Please do not retry payment." 
//             });
//         }

//         // 🛡️ Step 4: Prevent duplicate Razorpay order creation
//         if (order.razorpayOrderId) {
//             return res.status(200).json({
//                 success: true,
//                 message: "🟡 Razorpay order already exists for this order.",
//                 razorpayOrderId: order.razorpayOrderId,
//                 amount: order.amount,
//                 currency: "INR",
//                 orderId: order._id,
//             });
//         }

//         // 💰 Step 5: Check amount
//         if (!order.amount || order.amount <= 0) {
//             return res.status(400).json({ success: false, message: "❌ Invalid order amount." });
//         }

//         const amountInPaise = Math.round(order.amount * 100);

//         // 🧾 Step 6: Create Razorpay order
//         const razorpayOrder = await razorpay.orders.create({
//             amount: amountInPaise,
//             currency: "INR",
//             receipt: order._id.toString(),
//             payment_capture: 1,
//             notes: {
//                 orderId: order._id.toString(),
//                 customer: order.user?.name || "Guest User",
//             },
//         });

//         // 🧾 Step 7: Ensure seller split exists
//         await splitOrderForPersistence(order);

//         // 🧾 Step 8: Seller backfill (non-blocking)
//         try {
//             const updatedProducts = [];
//             for (const p of order.products) {
//                 if (!p.seller) {
//                     const prod = await Product.findById(p.productId).select("seller").lean();
//                     if (prod?.seller) {
//                         p.seller = prod.seller;
//                         updatedProducts.push(p.productId.toString());
//                     } else {
//                         console.warn(`⚠️ Seller missing for product ${p.productId} in order ${order._id}`);
//                     }
//                 }
//             }
//             if (updatedProducts.length) {
//                 console.log(`🟢 Seller backfilled for products:`, updatedProducts);
//             }
//         } catch (sellerErr) {
//             console.warn("⚠️ Seller backfill skipped:", sellerErr.message);
//         }

//         // 🧾 Step 9: Update order with Razorpay ID
//         order.razorpayOrderId = razorpayOrder.id;
//         order.paymentStatus = "pending";
//         order.orderStatus = "Awaiting Payment";

//         // 🚚 Step 10: Tracking history
//         if (!order.trackingHistory || order.trackingHistory.length === 0) {
//             order.trackingHistory = [
//                 { status: "Order Placed", timestamp: new Date(), location: "Store" },
//                 { status: "Awaiting Payment", timestamp: new Date() },
//             ];
//         } else {
//             order.trackingHistory.push({
//                 status: "Awaiting Payment",
//                 timestamp: new Date(),
//             });
//         }

//         // 🪄 Step 11: Optional — Generate and send E-card
//         try {
//             const { occasion, festival } = await determineOccasions({
//                 userId: order.user._id,
//                 userDoc: order.user,
//             });

//             const message = craftMessage({
//                 occasion,
//                 user: order.user,
//                 festival,
//             });

//             if (message) {
//                 const pdfBuffer = await buildEcardPdf({
//                     title: "A Special Note from Joyory 🎉",
//                     name: order.user?.name || "Customer",
//                     message,
//                 });

//                 // Upload PDF to Cloudinary
//                 const uploadResult = await new Promise((resolve, reject) => {
//                     const uploadStream = cloudinary.uploader.upload_stream(
//                         {
//                             folder: "ecards",
//                             resource_type: "raw",
//                             public_id: `ecard-${order._id}`,
//                             access_mode: "public",
//                         },
//                         (error, result) => {
//                             if (error) return reject(error);
//                             resolve(result);
//                         }
//                     );
//                     uploadStream.end(pdfBuffer);
//                 });

//                 // Send email with E-card
//                 await sendEmail(
//                     order.user.email,
//                     "🎁 Your Joyory E-Card",
//                     `<p>${message}</p><p>We’ve also attached your special card as a PDF.</p>`,
//                     [
//                         {
//                             name: "ecard.pdf",
//                             content: pdfBuffer,
//                             mime_type: "application/pdf",
//                         },
//                     ]
//                 );

//                 order.ecard = {
//                     occasion,
//                     message,
//                     emailSentAt: new Date(),
//                     pdfUrl: uploadResult?.secure_url || null,
//                 };
//             }
//         } catch (ecardErr) {
//             console.warn("⚠️ E-Card skipped:", ecardErr.message);
//         }

//         // 💾 Step 12: Save order
//         await order.save();

//         return res.status(200).json({
//             success: true,
//             message: "✅ Razorpay order created successfully.",
//             razorpayOrderId: razorpayOrder.id,
//             amount: order.amount,
//             currency: "INR",
//             orderId: order._id,
//         });

//     } catch (err) {
//         console.error("🔥 Error creating Razorpay order:", err);
//         return res.status(500).json({
//             success: false,
//             message: "❌ Something went wrong while creating Razorpay order.",
//             error: err.message,
//         });
//     }
// };

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

//         // STEP 9: Deduct stock (variant-safe)
//         for (const item of order.products) {
//             const product = await Product.findById(item.productId._id);
//             if (!product) {
//                 console.warn("⚠️ Product not found:", item.productId._id);
//                 continue;
//             }

//             // ✅ Variant exists → update variant stock & sales
//             if (item.selectedVariant?.sku && product.variants?.length) {
//                 const variantIndex = product.variants.findIndex(v => v.sku === item.selectedVariant.sku);
//                 if (variantIndex === -1) continue;

//                 const variant = product.variants[variantIndex];

//                 if (variant.stock < item.quantity) {
//                     console.error("❌ Insufficient stock for variant:", { product: product.name, variant: variant.name, available: variant.stock, requested: item.quantity });
//                     return res.status(400).json({
//                         step: "STOCK_CHECK",
//                         success: false,
//                         message: `Insufficient stock for ${product.name} - ${variant.name}`,
//                         debug: { available: variant.stock, requested: item.quantity }
//                     });
//                 }

//                 variant.stock -= item.quantity;
//                 variant.sales = (variant.sales || 0) + item.quantity;

//             } else {
//                 // ❌ No variant → fallback to product quantity
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
//             }

//             // ✅ Update product status & total quantity
//             if (product.variants?.length) {
//                 const totalStock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
//                 product.quantity = totalStock;
//                 product.status =
//                     totalStock <= 0
//                         ? "Out of stock"
//                         : totalStock < product.thresholdValue
//                             ? "Low stock"
//                             : "In-stock";
//             } else {
//                 product.status =
//                     product.quantity <= 0
//                         ? "Out of stock"
//                         : product.quantity < product.thresholdValue
//                             ? "Low stock"
//                             : "In-stock";
//             }

//             await product.save();
//             console.log(`✅ Stock updated for product ${product.name}`);
//         }

//         // STEP 10: Mark order as paid
//         order.paid = true;
//         order.paymentStatus = "success";
//         order.paymentMethod = rpPayment.method || "Prepaid";
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
//                 expiryDate: rpPayment.card ? `${rpPayment.card.expiry_month}/${rpPayment.card.expiry_year}` : undefined,
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

//         // STEP 14: Tracking history
//         if (!order.trackingHistory) order.trackingHistory = [];
//         order.trackingHistory.push(
//             { status: "Payment Successful", timestamp: new Date(), location: "Online Payment - Razorpay" },
//             { status: "Processing", timestamp: new Date(), location: "Store" }
//         );

//         await order.save();

//         // STEP 15: Deduct walletBalance (referral/points) after successful payment
//         try {
//             if (order.pointsUsed && order.pointsUsed > 0) {
//                 const user = await User.findById(order.user._id);
//                 if (user) {
//                     const pointsValue = order.pointsUsed * 0.1; // 1 point = 0.1 INR
//                     if (user.walletBalance >= pointsValue) {
//                         user.walletBalance -= pointsValue;
//                     } else {
//                         console.warn(`⚠️ Wallet balance insufficient. Available: ${user.walletBalance}, Required: ${pointsValue}`);
//                         user.walletBalance = 0; // deduct whatever is left
//                     }
//                     await user.save();
//                     console.log(`✅ Wallet points deducted: ${order.pointsUsed} points → ₹${pointsValue}`);
//                 } else {
//                     console.error("❌ User not found for wallet deduction", { userId: order.user._id });
//                 }
//             }
//         } catch (walletErr) {
//             console.error("🔥 Error deducting wallet points:", walletErr);
//         }

//         console.log("✅ Order updated successfully");

//         // STEP 16: Generate Invoice PDF
//         try {
//             const { pdfBuffer, pdfUrl } = await generateInvoice(order, order.user);

//             // Save invoice details in order
//             order.invoice = {
//                 number: `INV-${order._id}`,
//                 generatedAt: new Date(),
//                 pdfUrl,
//             };
//             await order.save();

//             // Email Invoice
//             await sendEmail(
//                 order.user.email,
//                 "🧾 Your Invoice from Joyory",
//                 `<p>Hi ${order.user.name},</p>
//          <p>Thank you for your purchase! Please find your invoice attached.</p>`,
//                 [
//                     {
//                         name: "invoice.pdf",
//                         content: pdfBuffer,
//                         mime_type: "application/pdf",
//                     },
//                 ]
//             );

//             console.log("✅ Invoice generated & emailed");
//         } catch (invoiceErr) {
//             console.error("❌ Failed to generate invoice:", invoiceErr);
//         }

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


// async function finalizeOrderPayment(order, rpPayment) {
//     if (!order || order.paid) return; // idempotency

//     // 1) Amount check already done by caller but double-check (tolerant small rounding)
//     const paidAmount = (rpPayment.amount || rpPayment.amount_paid || 0) / 100;
//     if (Math.abs(paidAmount - order.amount) > 0.001) {
//         throw new Error(`Amount mismatch: razorpay ${paidAmount} vs order ${order.amount}`);
//     }

//     // 2) Deduct stock & update products (same logic as you already have)
//     for (const item of order.products) {
//         const product = await Product.findById(item.productId._id || item.productId);
//         if (!product) continue;

//         if (item.selectedVariant?.sku && product.variants?.length) {
//             const variant = product.variants.find(v => v.sku === item.selectedVariant.sku);
//             if (!variant) continue;
//             if (variant.stock < item.quantity) throw new Error(`Insufficient stock for ${product.name} - ${variant.name}`);
//             variant.stock -= item.quantity;
//             variant.sales = (variant.sales || 0) + item.quantity;
//         } else {
//             if (product.quantity < item.quantity) throw new Error(`Insufficient stock for ${product.name}`);
//             product.quantity -= item.quantity;
//             product.sales = (product.sales || 0) + item.quantity;
//         }

//         // update aggregated status
//         if (product.variants?.length) {
//             const totalStock = product.variants.reduce((s, v) => s + (v.stock || 0), 0);
//             product.quantity = totalStock;
//             product.status = totalStock <= 0 ? "Out of stock" : totalStock < product.thresholdValue ? "Low stock" : "In-stock";
//         } else {
//             product.status = product.quantity <= 0 ? "Out of stock" : product.quantity < product.thresholdValue ? "Low stock" : "In-stock";
//         }

//         await product.save();
//     }

//     // 3) Mark order paid + meta
//     order.paid = true;
//     order.paymentStatus = "success";
//     order.paymentMethod = rpPayment.method || order.paymentMethod || "Prepaid";
//     order.transactionId = rpPayment.id || rpPayment.transactionId || rpPayment.payment_id;
//     order.razorpayOrderId = rpPayment.order_id || order.razorpayOrderId;
//     order.orderStatus = "Processing";
//     order.trackingHistory = order.trackingHistory || [];
//     order.trackingHistory.push({ status: "Payment Successful", timestamp: new Date(), location: "Online Payment - Razorpay" });
//     order.trackingHistory.push({ status: "Processing", timestamp: new Date(), location: "Store" });

//     // 4) Record Payment (idempotent)
//     try {
//         const existingPayment = await Payment.findOne({ transactionId: order.transactionId });
//         if (!existingPayment) {
//             await Payment.create({
//                 order: order._id,
//                 method: rpPayment.method || "Razorpay",
//                 status: "Completed",
//                 transactionId: order.transactionId,
//                 amount: order.amount,
//                 cardHolderName: rpPayment.card?.name || rpPayment.cardHolderName,
//                 cardNumber: rpPayment.card?.last4 || rpPayment.cardNumber,
//                 expiryDate: rpPayment.card ? `${rpPayment.card.expiry_month}/${rpPayment.card.expiry_year}` : undefined,
//                 isActive: true,
//             });
//         }
//     } catch (err) {
//         console.error("❌ Error saving Payment record:", err);
//     }

//     // 5) Clear user cart
//     try {
//         const user = await User.findById(order.user._id);
//         if (user) {
//             user.cart = [];
//             await user.save();
//         }
//     } catch (err) { console.error("❌ Error clearing cart:", err); }

//     // 6) Shiprocket / create shipment (best-effort)
//     try {
//         const shiprocketRes = await createShipment(order);
//         if (shiprocketRes) order.shipment = shiprocketRes.shipmentDetails;
//     } catch (err) {
//         console.error("❌ Shiprocket error:", err);
//     }

//     // 7) Deduct wallet points if used
//     try {
//         if (order.pointsUsed > 0) {
//             const user = await User.findById(order.user._id);
//             if (user) {
//                 const deduction = order.pointsUsed * 0.1;
//                 user.walletBalance = Math.max(0, user.walletBalance - deduction);
//                 await user.save();
//             }
//         }
//     } catch (err) { console.error("🔥 Wallet points error:", err); }

//     // 8) Invoice + email (best-effort)
//     try {
//         const { pdfBuffer, pdfUrl } = await generateInvoice(order, order.user);
//         order.invoice = { number: `INV-${order._id}`, generatedAt: new Date(), pdfUrl };

//         // If payment was UPI capture, store UPI metadata if available
//         if (rpPayment.method === "upi") {
//             order.upiId = rpPayment.vpa || order.upiId;
//             order.upiProvider = rpPayment.bank || order.upiProvider;
//         }

//         await order.save();

//         if (pdfBuffer) {
//             await sendEmail(order.user.email, "🧾 Your Invoice from Joyory", `<p>Hi ${order.user.name},</p><p>Thanks for your purchase. Invoice attached.</p>`, [
//                 { name: "invoice.pdf", content: pdfBuffer.toString("base64"), mime_type: "application/pdf" },
//             ]);
//         }
//     } catch (err) {
//         console.error("❌ Invoice generation/email error:", err);
//     }

//     await order.save();

//     // Notify user via socket if you use it
//     try {
//         io.to(order.user._id.toString()).emit("orderUpdated", {
//             orderId: order._id,
//             status: order.orderStatus,
//             paymentId: order.transactionId,
//         });
//     } catch (err) { /* ignore */ }
// }

// export const verifyRazorpayPayment = async (req, res) => {
//     try {
//         const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature, shippingAddress } = req.body;

//         if (!orderId || !razorpay_payment_id) {
//             return res.status(400).json({ step: "FIELD_VALIDATION", success: false, message: "orderId and razorpay_payment_id are required" });
//         }

//         const order = await Order.findById(orderId).populate("user").populate("products.productId");
//         if (!order) return res.status(404).json({ step: "ORDER_FETCH", success: false, message: "Order not found" });

//         if (req.user && !req.admin) {
//             if (order.user && order.user._id.toString() !== req.user._id.toString()) {
//                 return res.status(403).json({ step: "AUTH_CHECK", success: false, message: "Forbidden: not your order" });
//             }
//         }

//         if (order.paid) {
//             return res.status(200).json({ step: "IDEMPOTENCY", success: true, message: "Order already verified & paid", orderId: order._id });
//         }

//         // If signature is provided (checkout flow), verify timing-safe
//         if (razorpay_signature && razorpay_order_id) {
//             const signBody = `${razorpay_order_id}|${razorpay_payment_id}`;
//             const expectedSig = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(signBody).digest("hex");
//             const validSig = crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(razorpay_signature));
//             if (!validSig) return res.status(400).json({ step: "SIGNATURE", success: false, message: "Invalid signature / payment failed" });
//         } else {
//             // No signature - continue (payment-link flows often don't give a signature to frontend)
//             console.warn("verifyRazorpayPayment: no signature provided, proceeding with server-side fetch");
//         }

//         // Fetch Razorpay payment
//         let rpPayment;
//         try {
//             rpPayment = await razorpay.payments.fetch(razorpay_payment_id);
//         } catch (fetchErr) {
//             console.error("Failed to fetch payment from Razorpay:", fetchErr);
//             return res.status(502).json({ step: "RAZORPAY_FETCH", success: false, message: "Failed to fetch payment", error: fetchErr.message, details: fetchErr.response?.data || null });
//         }

//         // Payment must be captured
//         if (rpPayment.status !== "captured") {
//             return res.status(400).json({ step: "PAYMENT_STATUS", success: false, message: `Payment not captured (status: ${rpPayment.status})` });
//         }

//         // Validate amount
//         const paidAmount = rpPayment.amount / 100;
//         if (paidAmount !== order.amount) {
//             return res.status(400).json({ step: "AMOUNT_CHECK", success: false, message: "Amount mismatch", debug: { razorpay: paidAmount, order: order.amount } });
//         }

//         // Match payment -> order: accept match by order.razorpayOrderId, payment.link_id (payment link), or notes.orderId
//         const matchesOrder =
//             (order.razorpayOrderId && rpPayment.order_id && order.razorpayOrderId === rpPayment.order_id) ||
//             (order.paymentLink?.id && rpPayment.link_id && order.paymentLink.id === rpPayment.link_id) ||
//             (rpPayment.notes && rpPayment.notes.orderId && rpPayment.notes.orderId === order._id.toString());

//         if (!matchesOrder) {
//             console.warn("Payment/order mismatch", { rpOrderId: rpPayment.order_id, rpLinkId: rpPayment.link_id, notes: rpPayment.notes });
//             return res.status(400).json({ step: "ORDER_MATCH", success: false, message: "Order mismatch", debug: { expectedOrderId: order.razorpayOrderId, paymentOrderId: rpPayment.order_id, linkId: rpPayment.link_id } });
//         }

//         // optional: update shipping address
//         if (shippingAddress) order.shippingAddress = shippingAddress;

//         // finalize (deduct stock, save payment record, invoice, shipment, etc.)
//         await finalizeOrderPayment(order, rpPayment);

//         return res.status(200).json({
//             step: "COMPLETE",
//             success: true,
//             message: "Payment verified, stock updated, order paid & shipment created",
//             paymentMethod: rpPayment.method,
//             orderId: order._id,
//         });

//     } catch (err) {
//         console.error("🔥 Fatal error verifying Razorpay payment:", err);
//         return res.status(500).json({ step: "FATAL", success: false, message: "Unexpected server error during payment verification", error: err.message });
//     }
// };

// export const razorpayCallback = async (req, res) => {
//     try {
//         const { payment_link_id, payment_id, orderId } = req.query;

//         if (!payment_id || !orderId) {
//             console.error("Missing payment_id or orderId:", req.query);
//             return res.redirect(`${process.env.FRONTEND_URL}/paymentfailed`);
//         }

//         const order = await Order.findById(orderId).populate("user").populate("products.productId");
//         if (!order) return res.redirect(`${process.env.FRONTEND_URL}/paymentfailed`);

//         let rpPayment;
//         try {
//             rpPayment = await razorpay.payments.fetch(payment_id);
//         } catch (err) {
//             console.error("Failed to fetch Razorpay payment:", err);
//             return res.redirect(`${process.env.FRONTEND_URL}/paymentfailed`);
//         }

//         if (rpPayment.status !== "captured") {
//             console.warn("Payment not captured:", rpPayment.status);
//             return res.redirect(`${process.env.FRONTEND_URL}/paymentfailed`);
//         }

//         // Verify payment belongs to order
//         const matchesOrder =
//             (order.razorpayOrderId && rpPayment.order_id && order.razorpayOrderId === rpPayment.order_id) ||
//             (order.paymentLink?.id && rpPayment.link_id && order.paymentLink.id === rpPayment.link_id) ||
//             (rpPayment.notes && rpPayment.notes.orderId && rpPayment.notes.orderId === order._id.toString());

//         if (!matchesOrder) {
//             console.warn("Order/payment mismatch", rpPayment.notes, order._id.toString());
//             return res.redirect(`${process.env.FRONTEND_URL}/paymentfailed`);
//         }

//         // Finalize payment: updates DB
//         await finalizeOrderPayment(order, rpPayment);

//         return res.redirect(`${process.env.FRONTEND_URL}/ordersuccess?orderId=${orderId}`);
//     } catch (err) {
//         console.error("Razorpay callback error:", err);
//         return res.redirect(`${process.env.FRONTEND_URL}/paymentfailed`);
//     }
// };

// export const createRazorpayOrder = async (req, res) => {
//     try {
//         const { orderId, paymentMethodKey, upiId, provider } = req.body;

//         if (!orderId || !paymentMethodKey) {
//             return res.status(400).json({ success: false, message: "orderId and paymentMethodKey are required" });
//         }

//         const order = await Order.findById(orderId).populate("user");
//         if (!order) return res.status(404).json({ success: false, message: "Order not found" });

//         if (req.user && !req.admin) {
//             if (order.user && order.user._id.toString() !== req.user._id.toString()) {
//                 return res.status(403).json({ success: false, message: "Forbidden: you cannot create a payment for this order" });
//             }
//         }

//         if (order.paid) return res.status(400).json({ success: false, message: "Order is already paid" });
//         if (!order.amount || order.amount <= 0) return res.status(400).json({ success: false, message: "Invalid order amount" });

//         const paymentMethod = await PaymentMethod.findOne({ key: paymentMethodKey, isActive: true });
//         if (!paymentMethod) return res.status(400).json({ success: false, message: "Payment method not available" });

//         // Offline handling (unchanged)
//         if (paymentMethod.type === "offline") {
//             const maxCodAmount = paymentMethod.config?.maxAmount;
//             if (typeof maxCodAmount === "number" && order.amount > maxCodAmount) {
//                 return res.status(400).json({ success: false, message: `COD not allowed for orders above ₹${maxCodAmount}` });
//             }
//             order.paymentMethod = paymentMethod.key;
//             order.paymentStatus = "pending";
//             order.orderStatus = "Awaiting Payment";
//             order.trackingHistory = order.trackingHistory || [];
//             order.trackingHistory.push({ status: "Order Placed", timestamp: new Date(), location: "Store" });
//             order.trackingHistory.push({ status: "Awaiting Payment", timestamp: new Date() });
//             await order.save();
//             return res.status(200).json({ success: true, message: "Offline payment selected, order placed", orderId: order._id, paymentMethod: paymentMethod.key });
//         }

//         // UPI-specific
//         if (paymentMethod.key === "upi") {
//             if (!provider) return res.status(400).json({ success: false, message: "UPI provider is required (qr/gpay/phonepe/paytm)" });

//             const providerConfig = paymentMethod.config.providers.find(p => p.key === provider);
//             if (!providerConfig) return res.status(400).json({ success: false, message: "Invalid UPI provider" });

//             // If provider requires user UPI
//             if (providerConfig.requireUserUpi) {
//                 const vpaRegex = /^[\w.-]+@[\w]+$/;
//                 if (!upiId || !vpaRegex.test(upiId)) {
//                     return res.status(400).json({ success: false, message: "Invalid or missing UPI ID" });
//                 }
//                 order.upiId = upiId;
//             }

//             order.upiProvider = provider;
//             order.paymentMethod = "upi";
//             order.paymentStatus = "pending";
//             order.orderStatus = "Awaiting Payment";
//             order.trackingHistory = order.trackingHistory || [];
//             order.trackingHistory.push({ status: "Awaiting Payment", timestamp: new Date() });

//             // QR path preserved
//             if (provider === "qr") {
//                 // your existing QR create logic (leave as-is)
//                 const amountInPaise = Math.round(order.amount * 100);
//                 let qr;
//                 try {
//                     qr = await razorpay.qr.create({
//                         type: "upi_qr",
//                         name: `Payment for Order ${order._id}`,
//                         usage: "single_use",
//                         payment_amount: amountInPaise,
//                         currency: "INR",
//                         description: `Order:${order._id}`,
//                         notes: { orderId: order._id.toString(), customer: order.user?.name || "Guest" },
//                     });
//                 } catch (err) {
//                     console.error("UPI QR creation failed:", err);
//                     return res.status(502).json({ success: false, message: "Failed to create UPI QR", error: err.message });
//                 }
//                 order.qr = { qrId: qr.id, imageUrl: qr.image_url, createdAt: new Date() };
//                 await order.save();
//                 return res.status(200).json({ success: true, message: "UPI QR created", qrId: qr.id, qrImageUrl: qr.image_url, amount: order.amount, orderId: order._id, paymentMethod: "upi" });
//             }

//             // ---------- NEW: create Payment Link (UPI collect) ----------
//             // return existing pending link if present (idempotency)
//             if (order.paymentLink?.id && order.paymentStatus === "pending") {
//                 return res.status(200).json({
//                     success: true,
//                     message: "Existing payment link",
//                     paymentLinkId: order.paymentLink.id,
//                     shortUrl: order.paymentLink.shortUrl,
//                     expireAt: order.paymentLink.expireBy,
//                     orderId: order._id,
//                 });
//             }

//             const amountInPaise = Math.round(order.amount * 100);
//             const expireBy = Math.floor(Date.now() / 1000) + (20 * 60); // 20 minutes from now
//             const linkPayload = {
//                 amount: amountInPaise,
//                 currency: "INR",
//                 reference_id: `order_${order._id}`,
//                 description: `Payment for Order ${order._id}`,
//                 customer: {
//                     name: order.user?.name || "Customer",
//                     contact: order.user?.phone || undefined,
//                     email: order.user?.email || undefined,
//                 },
//                 notify: {
//                     sms: !!order.user?.phone,
//                     email: !!order.user?.email,
//                 },
//                 notes: { orderId: order._id.toString(), provider },
//                 expire_by: expireBy,   // ✅ min 15 mins
//                 upi_link: true,        // ✅ tells Razorpay to generate UPI collect
//                 callback_url: process.env.RAZORPAY_UPI_CALLBACK_URL || `${process.env.FRONTEND_URL}/payment/razorpay/callback`,
//                 callback_method: "get",
//             };



//             let paymentLink;
//             try {
//                 paymentLink = await razorpay.paymentLink.create(linkPayload);
//             } catch (err) {
//                 console.error("Payment link creation failed:", err);
//                 return res.status(502).json({ success: false, message: "Failed to create UPI collect link", error: err.message || err });
//             }

//             order.paymentLink = {
//                 id: paymentLink.id,
//                 shortUrl: paymentLink.short_url,
//                 expireBy: paymentLink.expire_by,
//                 status: paymentLink.status,
//                 createdAt: new Date(),
//             };
//             await order.save();

//             return res.status(200).json({
//                 success: true,
//                 message: "UPI collect link created",
//                 paymentLinkId: paymentLink.id,
//                 shortUrl: paymentLink.short_url,
//                 expireAt: paymentLink.expire_by,
//                 orderId: order._id,
//                 paymentMethod: "upi",
//             });
//         }

//         // ---------- default: normal Razorpay Order path (unchanged) ----------
//         // Idempotency
//         if (order.razorpayOrderId && order.paymentStatus === "pending") {
//             return res.status(200).json({
//                 success: true,
//                 message: "Razorpay order already exists for this order",
//                 razorpayOrderId: order.razorpayOrderId,
//                 amount: order.amount,
//                 currency: "INR",
//                 orderId: order._id,
//                 paymentMethod: order.paymentMethod || paymentMethod.key,
//                 upiId: order.upiId || null,
//             });
//         }

//         const amountInPaise = Math.round(order.amount * 100);
//         const payment_capture_flag = paymentMethod.config?.autoCapture ? 1 : 1;

//         let razorpayOrder;
//         try {
//             razorpayOrder = await razorpay.orders.create({
//                 amount: amountInPaise,
//                 currency: "INR",
//                 receipt: order._id.toString(),
//                 payment_capture: payment_capture_flag,
//                 notes: { orderId: order._id.toString(), customer: order.user?.name || "Guest User", upi: order.upiId || null },
//             });
//         } catch (err) {
//             console.error("Razorpay order creation failed:", err);
//             return res.status(502).json({ success: false, message: "Failed to create payment order with gateway", error: err.message || "Razorpay error" });
//         }

//         // backfill & other existing logic kept
//         try { await splitOrderForPersistence(order); } catch (err) { console.warn(err); }
//         // ... your existing seller backfill logic ...
//         order.razorpayOrderId = razorpayOrder.id;
//         order.paymentStatus = "pending";
//         order.orderStatus = "Awaiting Payment";
//         order.paymentMethod = paymentMethod.key;
//         order.trackingHistory = order.trackingHistory || [];
//         order.trackingHistory.push({ status: "Awaiting Payment", timestamp: new Date() });
//         await order.save();

//         return res.status(200).json({
//             success: true,
//             message: "Razorpay order created successfully",
//             razorpayOrderId: razorpayOrder.id,
//             amount: order.amount,
//             currency: "INR",
//             orderId: order._id,
//             paymentMethod: paymentMethod.key,
//             upiId: order.upiId || null,
//         });

//     } catch (err) {
//         console.error("Fatal error creating Razorpay order:", err);
//         return res.status(500).json({ success: false, message: "Failed to create Razorpay order", error: err.message });
//     }
// };

// export const createRazorpayOrder = async (req, res) => {
//     try {
//         const { orderId, paymentMethodKey, upiId, provider } = req.body;
//         console.log("🧾 Incoming createRazorpayOrder:", req.body);

//         if (!orderId || !paymentMethodKey)
//             return res.status(400).json({ success: false, message: "orderId and paymentMethodKey are required" });

//         const order = await Order.findById(orderId).populate("user");
//         if (!order) return res.status(404).json({ success: false, message: "Order not found" });

//         if (req.user && !req.admin && order.user && order.user._id.toString() !== req.user._id.toString())
//             return res.status(403).json({ success: false, message: "Forbidden: you cannot create a payment for this order" });

//         if (order.paid) return res.status(400).json({ success: false, message: "Order is already paid" });
//         if (!order.amount || order.amount <= 0) return res.status(400).json({ success: false, message: "Invalid order amount" });

//         const paymentMethod = await PaymentMethod.findOne({ key: paymentMethodKey, isActive: true });
//         if (!paymentMethod) return res.status(400).json({ success: false, message: "Payment method not available" });

//         const amountInPaise = Math.round(order.amount * 100);
//         console.log("💰 Amount in paise:", amountInPaise);

//         // --- UPI ---
//         if (paymentMethod.key === "upi") {
//             console.log("💳 UPI payment flow started...");

//             const vpaRegex = /^[\w.\-_]{2,256}@[a-zA-Z]{2,64}$/;
//             if (!upiId || !vpaRegex.test(upiId))
//                 return res.status(400).json({ success: false, message: "Invalid UPI ID format" });

//             console.log("⚙️ Creating direct UPI collect request for order:", order._id);
//             console.log("🔑 Razorpay Auth Check:", {
//                 keyId: process.env.RAZORPAY_KEY_ID,
//                 keySecretLoaded: !!process.env.RAZORPAY_KEY_SECRET,
//             });

//             const auth = Buffer.from(
//                 `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
//             ).toString("base64");

//             try {
//                 const upiResponse = await axios.post(
//                     "https://api.razorpay.com/v1/payments",
//                     {
//                         amount: amountInPaise,
//                         currency: "INR",
//                         method: "upi",
//                         vpa: upiId,
//                         email: order.user?.email || undefined,
//                         contact: order.user?.phone || undefined,
//                         notes: { orderId: order._id.toString(), provider },
//                     },
//                     {
//                         headers: {
//                             Authorization: `Basic ${auth}`,
//                             "Content-Type": "application/json",
//                         },
//                     }
//                 );

//                 console.log("✅ UPI Collect Success:", upiResponse.data);

//                 order.razorpayPaymentId = upiResponse.data.id;
//                 order.paymentStatus = "pending";
//                 await order.save();

//                 return res.status(200).json({
//                     success: true,
//                     message: "UPI collect request sent successfully",
//                     paymentId: upiResponse.data.id,
//                     orderId: order._id,
//                     amount: order.amount,
//                 });
//             } catch (err) {
//                 console.error("❌ Razorpay UPI Collect API Error:", err.response?.data || err.message);

//                 // --- fallback to standard Razorpay Order ---
//                 console.log("⚠️ Falling back to Razorpay Order API...");

//                 const razorpayOrder = await razorpay.orders.create({
//                     amount: amountInPaise,
//                     currency: "INR",
//                     receipt: order._id.toString(),
//                     payment_capture: 1,
//                     notes: { orderId: order._id.toString(), customer: order.user?.name || "Guest", upi: upiId },
//                 });

//                 order.razorpayOrderId = razorpayOrder.id;
//                 order.paymentStatus = "pending";
//                 order.orderStatus = "Awaiting Payment";
//                 order.paymentMethod = "upi";
//                 await order.save();

//                 return res.status(200).json({
//                     success: true,
//                     message: "Fallback: Razorpay order created instead of UPI Collect",
//                     razorpayOrderId: razorpayOrder.id,
//                     amount: order.amount,
//                     orderId: order._id,
//                     paymentMethod: "upi",
//                 });
//             }
//         }

//     } catch (err) {
//         console.error("💥 Unhandled error in createRazorpayOrder:", err.response?.data || err);
//         res.status(500).json({
//             success: false,
//             message: "Failed to create Razorpay order",
//             error: err.response?.data || err.message,
//         });
//     }
// };




// export const createRazorpayOrder = async (req, res) => {
//     try {
//         const { orderId, paymentMethodKey, upiId, provider } = req.body;

//         if (!orderId || !paymentMethodKey)
//             return res.status(400).json({ success: false, message: "orderId and paymentMethodKey are required" });

//         const order = await Order.findById(orderId).populate("user");
//         if (!order) return res.status(404).json({ success: false, message: "Order not found" });

//         // Security: ensure user owns the order
//         if (req.user && !req.admin && order.user && order.user._id.toString() !== req.user._id.toString()) {
//             return res.status(403).json({ success: false, message: "Forbidden: you cannot create a payment for this order" });
//         }

//         if (order.paid) return res.status(400).json({ success: false, message: "Order is already paid" });
//         if (!order.amount || order.amount <= 0) return res.status(400).json({ success: false, message: "Invalid order amount" });

//         const paymentMethod = await PaymentMethod.findOne({ key: paymentMethodKey, isActive: true });
//         if (!paymentMethod) return res.status(400).json({ success: false, message: "Payment method not available" });

//         const amountInPaise = Math.round(order.amount * 100);

//         // --- Offline Payment ---
//         if (paymentMethod.type === "offline") {
//             order.paymentMethod = paymentMethod.key;
//             order.paymentStatus = "pending";
//             order.orderStatus = "Awaiting Payment";
//             order.trackingHistory = order.trackingHistory || [];
//             order.trackingHistory.push({ status: "Order Placed", timestamp: new Date() });
//             order.trackingHistory.push({ status: "Awaiting Payment", timestamp: new Date() });
//             await order.save();
//             return res.status(200).json({ success: true, message: "Offline payment selected", orderId: order._id, paymentMethod: paymentMethod.key });
//         }

//         // --- UPI Payment ---
//         if (paymentMethod.key === "upi") {
//             if (!provider) return res.status(400).json({ success: false, message: "UPI provider is required" });

//             const providerConfig = paymentMethod.config?.providers?.find(p => p.key === provider);
//             if (!providerConfig) return res.status(400).json({ success: false, message: "Invalid UPI provider" });

//             if (providerConfig.requireUserUpi) {
//                 const vpaRegex = /^[\w.-]+@[\w]+$/;
//                 if (!upiId || !vpaRegex.test(upiId)) {
//                     return res.status(400).json({ success: false, message: "Invalid or missing UPI ID" });
//                 }
//                 order.upiId = upiId;
//             }

//             order.upiProvider = provider;
//             order.paymentMethod = "upi";
//             order.paymentStatus = "pending";
//             order.orderStatus = "Awaiting Payment";
//             order.trackingHistory = order.trackingHistory || [];
//             order.trackingHistory.push({ status: "Awaiting Payment", timestamp: new Date() });

//             // --- UPI QR ---
//             if (provider === "qr") {
//                 console.log("Creating UPI QR for order:", order._id);
//                 const qr = await razorpay.qr.create({
//                     type: "upi_qr",
//                     name: `Payment for Order ${order._id}`,
//                     usage: "single_use",
//                     payment_amount: amountInPaise,
//                     currency: "INR",
//                     description: `Order: ${order._id}`,
//                     notes: { orderId: order._id.toString(), customer: order.user?.name || "Guest" },
//                 });

//                 order.qr = { qrId: qr.id, imageUrl: qr.image_url, createdAt: new Date() };
//                 await order.save();

//                 return res.status(200).json({
//                     success: true,
//                     message: "UPI QR created",
//                     qrId: qr.id,
//                     qrImageUrl: qr.image_url,
//                     amount: order.amount,
//                     orderId: order._id,
//                 });
//             }

//             // --- UPI Collect (Payment Link) ---
//             console.log("Creating UPI Payment Link for order:", order._id);

//             // Use existing link if still pending
//             if (order.paymentLink?.id && order.paymentStatus === "pending") {
//                 return res.status(200).json({
//                     success: true,
//                     message: "Existing payment link",
//                     paymentLinkId: order.paymentLink.id,
//                     shortUrl: order.paymentLink.shortUrl,
//                     expireAt: order.paymentLink.expireBy,
//                     orderId: order._id,
//                 });
//             }

//             const expireBy = Math.floor(Date.now() / 1000) + 20 * 60; // 20 minutes
//             const linkPayload = {
//                 amount: amountInPaise,
//                 currency: "INR",
//                 reference_id: `order_${order._id}`,
//                 description: `Payment for Order ${order._id}`,
//                 customer: {
//                     name: order.user?.name || "Customer",
//                     contact: order.user?.phone || null,
//                     email: order.user?.email || null,
//                 },
//                 notify: { sms: !!order.user?.phone, email: !!order.user?.email },
//                 notes: { orderId: order._id.toString(), provider },
//                 expire_by: expireBy,
//                 upi_link: true,
//                 callback_url: process.env.RAZORPAY_UPI_CALLBACK_URL, // ✅ use correct env variable
//                 callback_method: "get",
//             };

//             console.log("UPI link payload:", linkPayload);

//             const paymentLink = await razorpay.paymentLink.create(linkPayload);
//             console.log("Razorpay payment link response:", paymentLink);

//             order.paymentLink = {
//                 id: paymentLink.id,
//                 shortUrl: paymentLink.short_url,
//                 expireBy: paymentLink.expire_by,
//                 status: paymentLink.status,
//                 createdAt: new Date(),
//             };
//             await order.save();

//             return res.status(200).json({
//                 success: true,
//                 message: "UPI collect link created",
//                 paymentLinkId: paymentLink.id,
//                 shortUrl: paymentLink.short_url,
//                 expireAt: paymentLink.expire_by,
//                 orderId: order._id,
//             });
//         }

//         // --- Card / Default Razorpay Order ---
//         if (order.razorpayOrderId && order.paymentStatus === "pending") {
//             return res.status(200).json({
//                 success: true,
//                 message: "Razorpay order already exists",
//                 razorpayOrderId: order.razorpayOrderId,
//                 amount: order.amount,
//                 orderId: order._id,
//                 paymentMethod: order.paymentMethod || paymentMethod.key,
//                 upiId: order.upiId || null,
//             });
//         }

//         const razorpayOrder = await razorpay.orders.create({
//             amount: amountInPaise,
//             currency: "INR",
//             receipt: order._id.toString(),
//             payment_capture: 1,
//             notes: { orderId: order._id.toString(), customer: order.user?.name || "Guest", upi: order.upiId || null },
//         });

//         order.razorpayOrderId = razorpayOrder.id;
//         order.paymentStatus = "pending";
//         order.orderStatus = "Awaiting Payment";
//         order.paymentMethod = paymentMethod.key;
//         order.trackingHistory = order.trackingHistory || [];
//         order.trackingHistory.push({ status: "Awaiting Payment", timestamp: new Date() });
//         await order.save();

//         return res.status(200).json({
//             success: true,
//             message: "Razorpay order created",
//             razorpayOrderId: razorpayOrder.id,
//             amount: order.amount,
//             orderId: order._id,
//             paymentMethod: paymentMethod.key,
//         });

//     } catch (err) {
//         console.error("Error creating Razorpay order:", err);
//         // Log full error for debugging
//         return res.status(500).json({ success: false, message: "Failed to create Razorpay order", error: err.toString() });
//     }
// };


// export const createRazorpayOrder = async (req, res) => {
//     try {
//         const { orderId, paymentMethodKey, upiId, provider } = req.body;

//         if (!orderId || !paymentMethodKey)
//             return res.status(400).json({ success: false, message: "orderId and paymentMethodKey are required" });

//         const order = await Order.findById(orderId).populate("user");
//         if (!order) return res.status(404).json({ success: false, message: "Order not found" });

//         if (req.user && !req.admin && order.user && order.user._id.toString() !== req.user._id.toString()) {
//             return res.status(403).json({ success: false, message: "Forbidden: you cannot create a payment for this order" });
//         }

//         if (order.paid) return res.status(400).json({ success: false, message: "Order is already paid" });
//         if (!order.amount || order.amount <= 0) return res.status(400).json({ success: false, message: "Invalid order amount" });

//         const paymentMethod = await PaymentMethod.findOne({ key: paymentMethodKey, isActive: true });
//         if (!paymentMethod) return res.status(400).json({ success: false, message: "Payment method not available" });

//         // Offline payment
//         if (paymentMethod.type === "offline") {
//             order.paymentMethod = paymentMethod.key;
//             order.paymentStatus = "pending";
//             order.orderStatus = "Awaiting Payment";
//             order.trackingHistory = order.trackingHistory || [];
//             order.trackingHistory.push({ status: "Order Placed", timestamp: new Date() });
//             order.trackingHistory.push({ status: "Awaiting Payment", timestamp: new Date() });
//             await order.save();
//             return res.status(200).json({ success: true, message: "Offline payment selected", orderId: order._id, paymentMethod: paymentMethod.key });
//         }

//         const amountInPaise = Math.round(order.amount * 100);

//         // UPI-specific
//         if (paymentMethod.key === "upi") {
//             if (!provider) return res.status(400).json({ success: false, message: "UPI provider is required" });
//             const providerConfig = paymentMethod.config.providers.find(p => p.key === provider);
//             if (!providerConfig) return res.status(400).json({ success: false, message: "Invalid UPI provider" });

//             if (providerConfig.requireUserUpi) {
//                 const vpaRegex = /^[\w.-]+@[\w]+$/;
//                 if (!upiId || !vpaRegex.test(upiId))
//                     return res.status(400).json({ success: false, message: "Invalid or missing UPI ID" });
//                 order.upiId = upiId;
//             }

//             order.upiProvider = provider;
//             order.paymentMethod = "upi";
//             order.paymentStatus = "pending";
//             order.orderStatus = "Awaiting Payment";
//             order.trackingHistory = order.trackingHistory || [];
//             order.trackingHistory.push({ status: "Awaiting Payment", timestamp: new Date() });

//             // QR UPI
//             if (provider === "qr") {
//                 const qr = await razorpay.qr.create({
//                     type: "upi_qr",
//                     name: `Payment for Order ${order._id}`,
//                     usage: "single_use",
//                     payment_amount: amountInPaise,
//                     currency: "INR",
//                     description: `Order:${order._id}`,
//                     notes: { orderId: order._id.toString(), customer: order.user?.name || "Guest" },
//                 });
//                 order.qr = { qrId: qr.id, imageUrl: qr.image_url, createdAt: new Date() };
//                 await order.save();
//                 return res.status(200).json({ success: true, message: "UPI QR created", qrId: qr.id, qrImageUrl: qr.image_url, amount: order.amount, orderId: order._id });
//             }

//             // Payment Link (UPI collect)
//             if (order.paymentLink?.id && order.paymentStatus === "pending") {
//                 return res.status(200).json({
//                     success: true,
//                     message: "Existing payment link",
//                     paymentLinkId: order.paymentLink.id,
//                     shortUrl: order.paymentLink.shortUrl,
//                     expireAt: order.paymentLink.expireBy,
//                     orderId: order._id,
//                 });
//             }

//             const expireBy = Math.floor(Date.now() / 1000) + 20 * 60; // 20 min
//             const linkPayload = {
//                 amount: amountInPaise,
//                 currency: "INR",
//                 reference_id: `order_${order._id}`,
//                 description: `Payment for Order ${order._id}`,
//                 customer: { name: order.user?.name || "Customer", contact: order.user?.phone, email: order.user?.email },
//                 notify: { sms: !!order.user?.phone, email: !!order.user?.email },
//                 notes: { orderId: order._id.toString(), provider },
//                 expire_by: expireBy,
//                 upi_link: true,
//                 callback_url: `${process.env.BACKEND_URL}/api/razorpay/callback`, // ✅ must be backend
//                 callback_method: "get",
//             };

//             const paymentLink = await razorpay.paymentLink.create(linkPayload);
//             order.paymentLink = { id: paymentLink.id, shortUrl: paymentLink.short_url, expireBy: paymentLink.expire_by, status: paymentLink.status, createdAt: new Date() };
//             await order.save();

//             return res.status(200).json({
//                 success: true,
//                 message: "UPI collect link created",
//                 paymentLinkId: paymentLink.id,
//                 shortUrl: paymentLink.short_url,
//                 expireAt: paymentLink.expire_by,
//                 orderId: order._id,
//             });
//         }

//         // Default Razorpay order
//         if (order.razorpayOrderId && order.paymentStatus === "pending") {
//             return res.status(200).json({
//                 success: true,
//                 message: "Razorpay order already exists",
//                 razorpayOrderId: order.razorpayOrderId,
//                 amount: order.amount,
//                 orderId: order._id,
//                 paymentMethod: order.paymentMethod || paymentMethod.key,
//                 upiId: order.upiId || null,
//             });
//         }

//         const razorpayOrder = await razorpay.orders.create({
//             amount: amountInPaise,
//             currency: "INR",
//             receipt: order._id.toString(),
//             payment_capture: 1,
//             notes: { orderId: order._id.toString(), customer: order.user?.name || "Guest", upi: order.upiId || null },
//         });

//         order.razorpayOrderId = razorpayOrder.id;
//         order.paymentStatus = "pending";
//         order.orderStatus = "Awaiting Payment";
//         order.paymentMethod = paymentMethod.key;
//         order.trackingHistory = order.trackingHistory || [];
//         order.trackingHistory.push({ status: "Awaiting Payment", timestamp: new Date() });
//         await order.save();

//         return res.status(200).json({
//             success: true,
//             message: "Razorpay order created",
//             razorpayOrderId: razorpayOrder.id,
//             amount: order.amount,
//             orderId: order._id,
//             paymentMethod: paymentMethod.key,
//         });

//     } catch (err) {
//         console.error("Error creating Razorpay order:", err);
//         return res.status(500).json({ success: false, message: "Failed to create Razorpay order", error: err.message });
//     }
// };

// export const razorpayCallback = async (req, res) => {
//     try {
//         const { payment_link_id, payment_id, orderId } = req.query;

//         if (!payment_id || !orderId) {
//             return res.redirect(`${process.env.FRONTEND_URL}/paymentfailed`);
//         }

//         // Fetch order from DB
//         const order = await Order.findById(orderId).populate("user").populate("products.productId");
//         if (!order) {
//             return res.redirect(`${process.env.FRONTEND_URL}/paymentfailed`);
//         }

//         // Fetch payment details from Razorpay
//         let rpPayment;
//         try {
//             rpPayment = await razorpay.payments.fetch(payment_id);
//         } catch (err) {
//             console.error("Failed to fetch payment from Razorpay:", err);
//             return res.redirect(`${process.env.FRONTEND_URL}/paymentfailed`);
//         }

//         // Check payment status
//         if (rpPayment.status !== "captured") {
//             console.warn("Payment not captured:", rpPayment.status);
//             return res.redirect(`${process.env.FRONTEND_URL}/paymentfailed`);
//         }

//         // Optional: verify order/payment mapping
//         const matchesOrder =
//             (order.razorpayOrderId && rpPayment.order_id && order.razorpayOrderId === rpPayment.order_id) ||
//             (order.paymentLink?.id && rpPayment.link_id && order.paymentLink.id === rpPayment.link_id) ||
//             (rpPayment.notes && rpPayment.notes.orderId && rpPayment.notes.orderId === order._id.toString());

//         if (!matchesOrder) {
//             console.warn("Order/payment mismatch");
//             return res.redirect(`${process.env.FRONTEND_URL}/paymentfailed`);
//         }

//         // ✅ Mark order paid & finalize payment
//         await finalizeOrderPayment(order, rpPayment);

//         // Redirect to frontend success page
//         return res.redirect(`${process.env.FRONTEND_URL}/ordersuccess?orderId=${orderId}`);
//     } catch (err) {
//         console.error("Razorpay Callback Error:", err);
//         return res.redirect(`${process.env.FRONTEND_URL}/paymentfailed`);
//     }
// };
//working some

// // // Create Razorpay order with PaymentMethod (improved, idempotent, secure, UPI-ready)
// export const createRazorpayOrder = async (req, res) => {
//     try {
//         const { orderId, paymentMethodKey, upiId, provider } = req.body;

//         // 1️⃣ Basic validation
//         if (!orderId || !paymentMethodKey) {
//             return res.status(400).json({ success: false, message: "orderId and paymentMethodKey are required" });
//         }

//         // 2️⃣ Fetch order (with user)
//         const order = await Order.findById(orderId).populate("user");
//         if (!order) return res.status(404).json({ success: false, message: "Order not found" });

//         // 3️⃣ Authorization check
//         if (req.user && !req.admin) {
//             if (order.user && order.user._id.toString() !== req.user._id.toString()) {
//                 return res.status(403).json({ success: false, message: "Forbidden: you cannot create a payment for this order" });
//             }
//         }

//         // 4️⃣ Already paid check
//         if (order.paid) {
//             return res.status(400).json({ success: false, message: "Order is already paid" });
//         }

//         // 5️⃣ Order amount validation
//         if (!order.amount || order.amount <= 0) {
//             return res.status(400).json({ success: false, message: "Invalid order amount" });
//         }

//         // 6️⃣ Fetch payment method
//         const paymentMethod = await PaymentMethod.findOne({ key: paymentMethodKey, isActive: true });
//         if (!paymentMethod) {
//             return res.status(400).json({ success: false, message: "Payment method not available" });
//         }

//         // 7️⃣ Offline payment handling (COD/wallet)
//         if (paymentMethod.type === "offline") {
//             const maxCodAmount = paymentMethod.config?.maxAmount;
//             if (typeof maxCodAmount === "number" && order.amount > maxCodAmount) {
//                 return res.status(400).json({ success: false, message: `COD not allowed for orders above ₹${maxCodAmount}` });
//             }

//             order.paymentMethod = paymentMethod.key;
//             order.paymentStatus = "pending";
//             order.orderStatus = "Awaiting Payment";
//             order.trackingHistory = order.trackingHistory || [];
//             order.trackingHistory.push({ status: "Order Placed", timestamp: new Date(), location: "Store" });
//             order.trackingHistory.push({ status: "Awaiting Payment", timestamp: new Date() });

//             await order.save();

//             return res.status(200).json({
//                 success: true,
//                 message: "Offline payment selected, order placed successfully",
//                 orderId: order._id,
//                 paymentMethod: paymentMethod.key,
//             });
//         }

//         // 8️⃣ UPI-specific validation
//         // 8️⃣ UPI-specific handling (includes QR option)
//         if (paymentMethod.key === "upi") {
//             if (!provider) {
//                 return res.status(400).json({ success: false, message: "UPI provider is required (qr/gpay/phonepe/paytm)" });
//             }

//             const providerConfig = paymentMethod.config.providers.find(p => p.key === provider);
//             if (!providerConfig) {
//                 return res.status(400).json({ success: false, message: "Invalid UPI provider" });
//             }

//             // If provider requires user UPI
//             if (providerConfig.requireUserUpi) {
//                 const vpaRegex = /^[\w.-]+@[\w]+$/;
//                 if (!upiId || !vpaRegex.test(upiId)) {
//                     return res.status(400).json({ success: false, message: "Invalid or missing UPI ID" });
//                 }
//                 order.upiId = upiId;
//             }

//             order.upiProvider = provider;
//             order.paymentMethod = "upi";
//             order.paymentStatus = "pending";
//             order.orderStatus = "Awaiting Payment";
//             order.trackingHistory = order.trackingHistory || [];
//             order.trackingHistory.push({ status: "Awaiting Payment", timestamp: new Date() });

//             // Generate QR dynamically if provider === "qr"
//             if (provider === "qr") {
//                 const amountInPaise = Math.round(order.amount * 100);
//                 let qr;
//                 try {
//                     qr = await razorpay.qr.create({
//                         type: "upi_qr",
//                         name: `Payment for Order ${order._id}`,
//                         usage: "single_use",
//                         payment_amount: amountInPaise,
//                         currency: "INR",
//                         description: `Order:${order._id}`,
//                         notes: { orderId: order._id.toString(), customer: order.user?.name || "Guest" },
//                     });
//                 } catch (err) {
//                     console.error("UPI QR creation failed:", err);
//                     return res.status(502).json({ success: false, message: "Failed to create UPI QR", error: err.message });
//                 }

//                 order.qr = { qrId: qr.id, imageUrl: qr.image_url, createdAt: new Date() };

//                 await order.save();

//                 return res.status(200).json({
//                     success: true,
//                     message: "UPI QR created successfully",
//                     qrId: qr.id,
//                     qrImageUrl: qr.image_url,
//                     amount: order.amount,
//                     orderId: order._id,
//                     paymentMethod: "upi",
//                 });
//             }
//         }



//         // 9️⃣ Idempotency: return existing pending Razorpay order
//         if (order.razorpayOrderId && order.paymentStatus === "pending") {
//             return res.status(200).json({
//                 success: true,
//                 message: "Razorpay order already exists for this order",
//                 razorpayOrderId: order.razorpayOrderId,
//                 amount: order.amount,
//                 currency: "INR",
//                 orderId: order._id,
//                 paymentMethod: order.paymentMethod || paymentMethod.key,
//                 upiId: order.upiId || null,
//             });
//         }

//         // 🔟 Create Razorpay order
//         const amountInPaise = Math.round(order.amount * 100);
//         const payment_capture_flag = paymentMethod.config?.autoCapture ? 1 : 1;

//         let razorpayOrder;
//         try {
//             razorpayOrder = await razorpay.orders.create({
//                 amount: amountInPaise,
//                 currency: "INR",
//                 receipt: order._id.toString(),
//                 payment_capture: payment_capture_flag,
//                 notes: {
//                     orderId: order._id.toString(),
//                     customer: order.user?.name || "Guest User",
//                     upi: order.upiId || null,
//                 },
//             });
//         } catch (err) {
//             console.error("Razorpay order creation failed:", err);
//             return res.status(502).json({
//                 success: false,
//                 message: "Failed to create payment order with gateway",
//                 error: err.message || "Razorpay error",
//             });
//         }

//         // 1️⃣1️⃣ Seller split/backfill (optional, your existing logic)
//         try { await splitOrderForPersistence(order); } catch (err) { console.warn(err); }

//         try {
//             const updatedProducts = [];
//             for (const p of order.products) {
//                 if (!p.seller) {
//                     const prod = await Product.findById(p.productId).select("seller").lean();
//                     if (prod?.seller) {
//                         p.seller = prod.seller;
//                         updatedProducts.push(p.productId.toString());
//                     }
//                 }
//             }
//             if (updatedProducts.length) console.log("Backfilled seller for products:", updatedProducts);
//         } catch (err) { console.warn(err); }

//         // 1️⃣2️⃣ Update order with Razorpay info
//         order.razorpayOrderId = razorpayOrder.id;
//         order.paymentStatus = "pending";
//         order.orderStatus = "Awaiting Payment";
//         order.paymentMethod = paymentMethod.key;
//         order.trackingHistory = order.trackingHistory || [];
//         order.trackingHistory.push({ status: "Awaiting Payment", timestamp: new Date() });

//         // 1️⃣3️⃣ Optional E-card (kept)
//         try {
//             const { occasion, festival } = await determineOccasions({ userId: order.user._id, userDoc: order.user });
//             const message = craftMessage({ occasion, user: order.user, festival });
//             if (message) {
//                 const pdfBuffer = await buildEcardPdf({ title: "A Special Note from Joyory 🎉", name: order.user?.name || "Customer", message });
//                 const uploadResult = await new Promise((resolve, reject) => {
//                     const uploadStream = cloudinary.uploader.upload_stream(
//                         { folder: "ecards", resource_type: "raw", public_id: `ecard-${order._id}`, access_mode: "public" },
//                         (error, result) => (error ? reject(error) : resolve(result))
//                     );
//                     uploadStream.end(pdfBuffer);
//                 });
//                 await sendEmail(order.user.email, "🎁 Your Joyory E-Card", `<p>${message}</p><p>PDF attached.</p>`, [{ name: "ecard.pdf", content: pdfBuffer.toString("base64"), mime_type: "application/pdf" }]);
//                 order.ecard = { occasion, message, emailSentAt: new Date(), pdfUrl: uploadResult?.secure_url || null };
//             }
//         } catch (err) { console.warn("E-card skipped:", err); }

//         // 1️⃣4️⃣ Save order
//         await order.save();

//         // 1️⃣5️⃣ Return success response
//         return res.status(200).json({
//             success: true,
//             message: "Razorpay order created successfully",
//             razorpayOrderId: razorpayOrder.id,
//             amount: order.amount,
//             currency: "INR",
//             orderId: order._id,
//             paymentMethod: paymentMethod.key,
//             upiId: order.upiId || null, // send to frontend for prefill
//         });

//     } catch (err) {
//         console.error("Fatal error creating Razorpay order:", err);
//         return res.status(500).json({ success: false, message: "Failed to create Razorpay order", error: err.message });
//     }
// };

// export const verifyRazorpayPayment = async (req, res) => {
//     try {
//         const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature, shippingAddress } = req.body;

//         // 1) Input validation
//         if (![orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature].every(v => typeof v === "string" && v.trim())) {
//             return res.status(400).json({ step: "FIELD_VALIDATION", success: false, message: "Missing or invalid required fields" });
//         }

//         // 2) Fetch order with user + products
//         const order = await Order.findById(orderId).populate("user").populate("products.productId");
//         if (!order) return res.status(404).json({ step: "ORDER_FETCH", success: false, message: "Order not found" });

//         // 3) Authorization check (only order owner or admin can verify)
//         if (req.user && !req.admin) {
//             if (order.user && order.user._id.toString() !== req.user._id.toString()) {
//                 return res.status(403).json({ step: "AUTH_CHECK", success: false, message: "Forbidden: not your order" });
//             }
//         }

//         // 4) Idempotency: already paid
//         if (order.paid) {
//             return res.status(200).json({ step: "IDEMPOTENCY", success: true, message: "Order already verified & paid", orderId: order._id });
//         }

//         // 5) Match stored Razorpay order
//         if (order.razorpayOrderId && order.razorpayOrderId !== razorpay_order_id) {
//             return res.status(400).json({ step: "ORDER_MATCH", success: false, message: "Order mismatch", debug: { expected: order.razorpayOrderId, got: razorpay_order_id } });
//         }

//         // 6) Payment method check
//         const paymentMethod = await PaymentMethod.findOne({ key: order.paymentMethod });
//         if (!paymentMethod || (paymentMethod.type !== "online" && order.paymentMethod !== "upi")) {
//             return res.status(400).json({ step: "PAYMENT_METHOD", success: false, message: "Payment method inactive or invalid" });
//         }



//         // 7) Signature verification (timing-safe)
//         const signBody = `${razorpay_order_id}|${razorpay_payment_id}`;
//         const expectedSig = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(signBody).digest("hex");

//         const validSig = crypto.timingSafeEqual(
//             Buffer.from(expectedSig),
//             Buffer.from(razorpay_signature)
//         );
//         if (!validSig) {
//             return res.status(400).json({ step: "SIGNATURE", success: false, message: "Invalid signature / payment failed" });
//         }

//         // 8) Fetch Razorpay payment
//         let rpPayment;
//         try {
//             rpPayment = await razorpay.payments.fetch(razorpay_payment_id);
//         } catch (fetchErr) {
//             return res.status(502).json({ step: "RAZORPAY_FETCH", success: false, message: "Failed to fetch payment", error: fetchErr.message, details: fetchErr.response?.data || null });
//         }

//         if (rpPayment.status !== "captured") {
//             return res.status(400).json({ step: "PAYMENT_STATUS", success: false, message: `Payment not captured (status: ${rpPayment.status})` });
//         }

//         // 9) Amount check
//         const paidAmount = rpPayment.amount / 100;
//         if (paidAmount !== order.amount) {
//             return res.status(400).json({ step: "AMOUNT_CHECK", success: false, message: "Amount mismatch", debug: { razorpay: paidAmount, order: order.amount } });
//         }

//         // 10) Deduct stock safely
//         for (const item of order.products) {
//             const product = await Product.findById(item.productId._id);
//             if (!product) continue;

//             if (item.selectedVariant?.sku && product.variants?.length) {
//                 const variant = product.variants.find(v => v.sku === item.selectedVariant.sku);
//                 if (!variant) continue;
//                 if (variant.stock < item.quantity) {
//                     return res.status(400).json({ step: "STOCK_CHECK", success: false, message: `Insufficient stock for ${product.name} - ${variant.name}` });
//                 }
//                 variant.stock -= item.quantity;
//                 variant.sales = (variant.sales || 0) + item.quantity;
//             } else {
//                 if (product.quantity < item.quantity) {
//                     return res.status(400).json({ step: "STOCK_CHECK", success: false, message: `Insufficient stock for ${product.name}` });
//                 }
//                 product.quantity -= item.quantity;
//                 product.sales = (product.sales || 0) + item.quantity;
//             }

//             // Update product status
//             if (product.variants?.length) {
//                 const totalStock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
//                 product.quantity = totalStock;
//                 product.status = totalStock <= 0 ? "Out of stock" : totalStock < product.thresholdValue ? "Low stock" : "In-stock";
//             } else {
//                 product.status = product.quantity <= 0 ? "Out of stock" : product.quantity < product.thresholdValue ? "Low stock" : "In-stock";
//             }

//             await product.save();
//         }

//         // 11) Mark order as paid
//         order.paid = true;
//         order.paymentStatus = "success";
//         order.paymentMethod = rpPayment.method || paymentMethod.key || "Prepaid";
//         order.transactionId = razorpay_payment_id;
//         order.razorpayOrderId = razorpay_order_id;
//         order.orderStatus = "Processing";
//         if (shippingAddress) order.shippingAddress = shippingAddress;

//         // 12) Record Payment (idempotent)
//         try {
//             const existingPayment = await Payment.findOne({ transactionId: razorpay_payment_id });
//             if (!existingPayment) {
//                 await Payment.create({
//                     order: order._id,
//                     method: rpPayment.method || "Razorpay",
//                     status: "Completed",
//                     transactionId: razorpay_payment_id,
//                     amount: order.amount,
//                     cardHolderName: rpPayment.card?.name,
//                     cardNumber: rpPayment.card?.last4,
//                     expiryDate: rpPayment.card ? `${rpPayment.card.expiry_month}/${rpPayment.card.expiry_year}` : undefined,
//                     isActive: true,
//                 });
//             }
//         } catch (err) {
//             console.error("❌ Error saving Payment record:", err);
//         }

//         // 13) Clear user cart
//         try {
//             const user = await User.findById(order.user._id);
//             if (user) { user.cart = []; await user.save(); }
//         } catch (err) { console.error("❌ Error clearing cart:", err); }

//         // 14) Shiprocket integration
//         try {
//             const shiprocketRes = await createShipment(order);
//             order.shipment = shiprocketRes.shipmentDetails;
//         } catch (err) {
//             console.error("❌ Shiprocket error:", err);
//         }

//         // 15) Tracking update
//         order.trackingHistory = order.trackingHistory || [];
//         order.trackingHistory.push(
//             { status: "Payment Successful", timestamp: new Date(), location: "Online Payment - Razorpay" },
//             { status: "Processing", timestamp: new Date(), location: "Store" }
//         );

//         // 16) Wallet points deduction
//         try {
//             if (order.pointsUsed > 0) {
//                 const user = await User.findById(order.user._id);
//                 if (user) {
//                     const deduction = order.pointsUsed * 0.1;
//                     user.walletBalance = Math.max(0, user.walletBalance - deduction);
//                     await user.save();
//                 }
//             }
//         } catch (err) { console.error("🔥 Wallet points error:", err); }

//         // Save order
//         await order.save();

//         // 17) Generate invoice
//         try {
//             const { pdfBuffer, pdfUrl } = await generateInvoice(order, order.user);
//             order.invoice = { number: `INV-${order._id}`, generatedAt: new Date(), pdfUrl };

//             // Store UPI details (optional, for logging)
//             if (rpPayment.method === "upi") {
//                 order.upiId = rpPayment.vpa;          // the virtual payment address customer paid with
//                 order.upiProvider = rpPayment.bank;   // UPI provider (e.g., 'HDFC', 'ICICI')
//             }


//             await order.save();

//             await sendEmail(
//                 order.user.email,
//                 "🧾 Your Invoice from Joyory",
//                 `<p>Hi ${order.user.name},</p><p>Thank you for your purchase! Please find your invoice attached.</p>`,
//                 [
//                     {
//                         name: "invoice.pdf",
//                         content: pdfBuffer.toString("base64"),
//                         mime_type: "application/pdf",
//                     },
//                 ]
//             );
//         } catch (err) {
//             console.error("❌ Invoice generation/email error:", err);
//         }

//         return res.status(200).json({
//             step: "COMPLETE",
//             success: true,
//             message: "Payment verified, stock updated, order paid & shipment created",
//             paymentMethod: rpPayment.method,
//             orderId: order._id,
//         });

//     } catch (err) {
//         console.error("🔥 Fatal error verifying Razorpay payment:", err);
//         return res.status(500).json({
//             step: "FATAL",
//             success: false,
//             message: "Unexpected server error during payment verification",
//             error: err.message,
//         });
//     }
// };

// // 🔹 Verify Razorpay payment with full existing logic + PaymentMethod
// export const verifyRazorpayPayment = async (req, res) => {
//     try {
//         const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature, shippingAddress } = req.body;

//         if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
//             return res.status(400).json({ step: "FIELD_VALIDATION", success: false, message: "Missing required payment fields", debug: { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } });
//         }

//         const order = await Order.findById(orderId).populate("user").populate("products.productId");
//         if (!order) return res.status(404).json({ step: "ORDER_FETCH", success: false, message: "Order not found", orderId });

//         if (order.paid) return res.status(200).json({ step: "IDEMPOTENCY", success: true, message: "Order already verified & paid", order });

//         if (order.razorpayOrderId && order.razorpayOrderId !== razorpay_order_id) return res.status(400).json({ step: "ORDER_MATCH", success: false, message: "Order mismatch", debug: { expected: order.razorpayOrderId, got: razorpay_order_id } });

//         // Verify signature
//         const signBody = `${razorpay_order_id}|${razorpay_payment_id}`;
//         const expectedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(signBody).digest("hex");
//         if (expectedSignature !== razorpay_signature) return res.status(400).json({ step: "SIGNATURE", success: false, message: "Invalid signature / payment failed", debug: { expectedSignature, got: razorpay_signature } });

//         // Fetch Razorpay payment
//         let rpPayment;
//         try { rpPayment = await razorpay.payments.fetch(razorpay_payment_id); } catch (fetchErr) { return res.status(500).json({ step: "RAZORPAY_FETCH", success: false, message: "Failed to fetch payment", error: fetchErr.message, details: fetchErr.response?.data || null }); }
//         if (rpPayment.status !== "captured") return res.status(400).json({ step: "PAYMENT_STATUS", success: false, message: `Payment not captured (status: ${rpPayment.status})`, debug: rpPayment });

//         // Amount check
//         const paidAmountInInr = rpPayment.amount / 100;
//         if (paidAmountInInr !== order.amount) return res.status(400).json({ step: "AMOUNT_CHECK", success: false, message: "Amount mismatch", debug: { razorpayAmount: paidAmountInInr, orderAmount: order.amount } });

//         // Deduct stock (variant-safe)
//         for (const item of order.products) {
//             const product = await Product.findById(item.productId._id);
//             if (!product) continue;

//             if (item.selectedVariant?.sku && product.variants?.length) {
//                 const variantIndex = product.variants.findIndex(v => v.sku === item.selectedVariant.sku);
//                 if (variantIndex !== -1) {
//                     const variant = product.variants[variantIndex];
//                     if (variant.stock < item.quantity) return res.status(400).json({ step: "STOCK_CHECK", success: false, message: `Insufficient stock for ${product.name} - ${variant.name}`, debug: { available: variant.stock, requested: item.quantity } });
//                     variant.stock -= item.quantity;
//                     variant.sales = (variant.sales || 0) + item.quantity;
//                 }
//             } else {
//                 if (product.quantity < item.quantity) return res.status(400).json({ step: "STOCK_CHECK", success: false, message: `Insufficient stock for ${product.name}`, debug: { available: product.quantity, requested: item.quantity } });
//                 product.quantity -= item.quantity;
//                 product.sales = (product.sales || 0) + item.quantity;
//             }

//             // Update status
//             if (product.variants?.length) {
//                 const totalStock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
//                 product.quantity = totalStock;
//                 product.status = totalStock <= 0 ? "Out of stock" : totalStock < product.thresholdValue ? "Low stock" : "In-stock";
//             } else {
//                 product.status = product.quantity <= 0 ? "Out of stock" : product.quantity < product.thresholdValue ? "Low stock" : "In-stock";
//             }

//             await product.save();
//         }

//         // Mark order as paid
//         order.paid = true;
//         order.paymentStatus = "success";
//         order.paymentMethod = rpPayment.method || "Prepaid";
//         order.transactionId = razorpay_payment_id;
//         order.razorpayOrderId = razorpay_order_id;
//         order.orderStatus = "Processing";
//         if (shippingAddress) order.shippingAddress = shippingAddress;

//         // Save payment record
//         try { await Payment.create({ order: order._id, method: rpPayment.method || "Razorpay", status: "Completed", transactionId: razorpay_payment_id, amount: order.amount, cardHolderName: rpPayment.card?.name, cardNumber: rpPayment.card?.last4, expiryDate: rpPayment.card ? `${rpPayment.card.expiry_month}/${rpPayment.card.expiry_year}` : undefined, isActive: true }); } catch (err) { console.error("❌ Error saving Payment record:", err); }

//         // Clear user cart
//         try { const user = await User.findById(order.user._id); if (user) { user.cart = []; await user.save(); } } catch (err) { console.error("❌ Error clearing cart:", err); }

//         // Shiprocket
//         let shiprocketRes = null;
//         try { shiprocketRes = await createShipment(order); order.shipment = shiprocketRes.shipmentDetails; } catch (err) { console.error("❌ Shiprocket error:", err); }

//         // Tracking
//         order.trackingHistory = order.trackingHistory || [];
//         order.trackingHistory.push({ status: "Payment Successful", timestamp: new Date(), location: "Online Payment - Razorpay" }, { status: "Processing", timestamp: new Date(), location: "Store" });

//         // Wallet points
//         try {
//             if (order.pointsUsed && order.pointsUsed > 0) {
//                 const user = await User.findById(order.user._id);
//                 if (user) {
//                     const pointsValue = order.pointsUsed * 0.1;
//                     user.walletBalance = Math.max(0, user.walletBalance - pointsValue);
//                     await user.save();
//                 }
//             }
//         } catch (err) { console.error("🔥 Error deducting wallet points:", err); }

//         await order.save();

//         // Invoice
//         try {
//             const { pdfBuffer, pdfUrl } = await generateInvoice(order, order.user);
//             order.invoice = { number: `INV-${order._id}`, generatedAt: new Date(), pdfUrl };
//             await order.save();

//             // Email Invoice

//             await sendEmail(
//                 order.user.email,
//                 "🧾 Your Invoice from Joyory",
//                 `<p>Hi ${order.user.name},</p>
//  <p>Thank you for your purchase! Please find your invoice attached.</p>`,
//                 [
//                     {
//                         name: "ecard.pdf",                     // ZeptoMail required
//                         content: pdfBuffer.toString("base64"), // MUST be base64
//                         mime_type: "application/pdf",       // ZeptoMail required
//                     },
//                 ]
//             );
//         } catch (err) { console.error("❌ Failed to generate invoice:", err); }

//         return res.status(200).json({ step: "COMPLETE", success: true, message: "Payment verified, stock updated, order paid & shipment created", paymentMethod: rpPayment.method, order, debug: { razorpayPayment: rpPayment, shiprocket: shiprocketRes?.rawResponses || null } });

//     } catch (err) {
//         console.error("🔥 Fatal error verifying Razorpay payment:", err);
//         res.status(500).json({ step: "FATAL", success: false, message: "Unexpected server error during payment verification", error: err.message, stack: err.stack, details: err.response?.data || null });
//     }
// };

// 🔹 Verify Razorpay payment with PaymentMethod + hardened security



// /**
//  * Razorpay Webhook Handler (Nykaa-style)
//  * No frontend verification needed.
//  * Razorpay will POST events (payment.captured) to this endpoint.
//  */
// export const verifyRazorpayPayment = async (req, res) => {
//     try {
//         const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

//         // 1) Verify webhook signature
//         const body = JSON.stringify(req.body);
//         const signature = req.headers["x-razorpay-signature"];
//         const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");

//         if (signature !== expected) {
//             return res.status(400).json({ success: false, step: "WEBHOOK_SIGNATURE", message: "Invalid webhook signature" });
//         }

//         const event = req.body.event;
//         const payload = req.body.payload;

//         if (event !== "payment.captured") {
//             return res.status(200).json({ success: true, message: "Event ignored" });
//         }

//         const rpPayment = payload.payment.entity;

//         // 2) Match order from notes (best practice: store orderId in notes when creating Razorpay order)
//         const orderId = rpPayment.notes?.orderId;
//         if (!orderId) {
//             return res.status(400).json({ success: false, step: "ORDER_MATCH", message: "No orderId found in payment notes" });
//         }

//         const order = await Order.findById(orderId).populate("user").populate("products.productId");
//         if (!order) return res.status(404).json({ success: false, step: "ORDER_FETCH", message: "Order not found" });

//         // 3) Idempotency
//         if (order.paid) {
//             return res.status(200).json({ success: true, step: "IDEMPOTENCY", message: "Order already paid" });
//         }

//         // 4) Amount check
//         const paidAmount = rpPayment.amount / 100;
//         if (paidAmount !== order.amount) {
//             return res.status(400).json({ success: false, step: "AMOUNT_CHECK", message: "Amount mismatch", debug: { razorpay: paidAmount, order: order.amount } });
//         }

//         // 5) Deduct stock
//         for (const item of order.products) {
//             const product = await Product.findById(item.productId._id);
//             if (!product) continue;

//             if (item.selectedVariant?.sku && product.variants?.length) {
//                 const variant = product.variants.find(v => v.sku === item.selectedVariant.sku);
//                 if (!variant) continue;
//                 if (variant.stock < item.quantity) {
//                     return res.status(400).json({ success: false, step: "STOCK_CHECK", message: `Insufficient stock for ${product.name} - ${variant.name}` });
//                 }
//                 variant.stock -= item.quantity;
//                 variant.sales = (variant.sales || 0) + item.quantity;
//             } else {
//                 if (product.quantity < item.quantity) {
//                     return res.status(400).json({ success: false, step: "STOCK_CHECK", message: `Insufficient stock for ${product.name}` });
//                 }
//                 product.quantity -= item.quantity;
//                 product.sales = (product.sales || 0) + item.quantity;
//             }

//             // Update product status
//             if (product.variants?.length) {
//                 const totalStock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
//                 product.quantity = totalStock;
//                 product.status = totalStock <= 0 ? "Out of stock" : totalStock < product.thresholdValue ? "Low stock" : "In-stock";
//             } else {
//                 product.status = product.quantity <= 0 ? "Out of stock" : product.quantity < product.thresholdValue ? "Low stock" : "In-stock";
//             }

//             await product.save();
//         }

//         // 6) Mark order as paid
//         order.paid = true;
//         order.paymentStatus = "success";
//         order.paymentMethod = rpPayment.method || "Prepaid";
//         order.transactionId = rpPayment.id;
//         order.razorpayOrderId = rpPayment.order_id;
//         order.orderStatus = "Processing";

//         // 7) Record Payment
//         const existingPayment = await Payment.findOne({ transactionId: rpPayment.id });
//         if (!existingPayment) {
//             await Payment.create({
//                 order: order._id,
//                 method: rpPayment.method || "Razorpay",
//                 status: "Completed",
//                 transactionId: rpPayment.id,
//                 amount: order.amount,
//                 cardHolderName: rpPayment.card?.name,
//                 cardNumber: rpPayment.card?.last4,
//                 expiryDate: rpPayment.card ? `${rpPayment.card.expiry_month}/${rpPayment.card.expiry_year}` : undefined,
//                 isActive: true,
//             });
//         }

//         // 8) Clear user cart
//         const user = await User.findById(order.user._id);
//         if (user) { user.cart = []; await user.save(); }

//         // 9) Shiprocket
//         try {
//             const shiprocketRes = await createShipment(order);
//             order.shipment = shiprocketRes.shipmentDetails;
//         } catch (err) { console.error("❌ Shiprocket error:", err); }

//         // 10) Tracking
//         order.trackingHistory = order.trackingHistory || [];
//         order.trackingHistory.push(
//             { status: "Payment Successful", timestamp: new Date(), location: "Online Payment - Razorpay" },
//             { status: "Processing", timestamp: new Date(), location: "Store" }
//         );

//         // 11) Wallet deduction
//         if (order.pointsUsed > 0) {
//             const deduction = order.pointsUsed * 0.1;
//             user.walletBalance = Math.max(0, user.walletBalance - deduction);
//             await user.save();
//         }

//         await order.save();

//         // 12) Invoice
//         try {
//             const { pdfBuffer, pdfUrl } = await generateInvoice(order, order.user);
//             order.invoice = { number: `INV-${order._id}`, generatedAt: new Date(), pdfUrl };

//             if (rpPayment.method === "upi") {
//                 order.upiId = rpPayment.vpa;
//                 order.upiProvider = rpPayment.bank;
//             }

//             await order.save();

//             await sendEmail(
//                 order.user.email,
//                 "🧾 Your Invoice from Joyory",
//                 `<p>Hi ${order.user.name},</p><p>Thank you for your purchase! Please find your invoice attached.</p>`,
//                 [
//                     {
//                         name: "invoice.pdf",
//                         content: pdfBuffer.toString("base64"),
//                         mime_type: "application/pdf",
//                     },
//                 ]
//             );
//         } catch (err) {
//             console.error("❌ Invoice/email error:", err);
//         }

//         return res.status(200).json({
//             success: true,
//             step: "COMPLETE",
//             message: "Webhook processed: order paid & shipment created",
//             orderId: order._id,
//             paymentMethod: rpPayment.method
//         });

//     } catch (err) {
//         console.error("🔥 Webhook error:", err);
//         return res.status(500).json({ success: false, step: "FATAL", message: err.message });
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

//         // 🚫 Prevent duplicate payment
//         if (order.paid) {
//             return res.status(400).json({ message: "⚠️ Order is already paid" });
//         }

//         // ✅ Ensure final payable amount is already saved in DB
//         if (!order.amount || order.amount <= 0) {
//             return res.status(400).json({ message: "❌ Invalid order amount" });
//         }

//         // Convert to paise
//         const amountInPaise = Math.round(order.amount * 100);

//         // ✅ Create Razorpay order
//         const razorpayOrder = await razorpay.orders.create({
//             amount: amountInPaise,
//             currency: "INR",
//             receipt: order._id.toString(),
//             payment_capture: 1,
//             notes: {
//                 orderId: order._id.toString(),
//                 customer: order.user?.name || "Guest User",
//             },
//         });

//         // ✅ Ensure seller split exists
//         await splitOrderForPersistence(order);

//         // 🟢 NEW seller tracking (safe, non-blocking)
//         try {
//             const updatedProducts = [];
//             for (const p of order.products) {
//                 if (!p.seller) {
//                     // fallback: fetch product’s seller
//                     const prod = await Product.findById(p.productId).select("seller").lean();
//                     if (prod?.seller) {
//                         p.seller = prod.seller;
//                         updatedProducts.push(p.productId.toString());
//                     } else {
//                         console.warn(
//                             `⚠️ Seller missing for product ${p.productId} in order ${order._id}`
//                         );
//                     }
//                 }
//             }
//             if (updatedProducts.length) {
//                 console.log(`🟢 Backfilled seller for products:`, updatedProducts);
//             }
//         } catch (sellerErr) {
//             console.warn("⚠️ Seller backfill skipped:", sellerErr.message);
//         }

//         // 🔄 Update order
//         order.razorpayOrderId = razorpayOrder.id;
//         order.paymentStatus = "pending";
//         order.orderStatus = "Awaiting Payment";

//         // 📌 Tracking history
//         if (!order.trackingHistory || order.trackingHistory.length === 0) {
//             order.trackingHistory = [
//                 { status: "Order Placed", timestamp: new Date(), location: "Store" },
//                 { status: "Awaiting Payment", timestamp: new Date() },
//             ];
//         } else {
//             order.trackingHistory.push({
//                 status: "Awaiting Payment",
//                 timestamp: new Date(),
//             });
//         }


//         // E-Card generation
//         try {
//             const { occasion, festival } = await determineOccasions({ userId: order.user._id, userDoc: order.user });
//             const message = craftMessage({ occasion, user: order.user, festival });

//             if (message) {
//                 const pdfBuffer = await buildEcardPdf({
//                     title: "A Special Note from Joyory 🎉",
//                     name: order.user?.name || "Customer",
//                     message,
//                 });

//                 if (pdfBuffer && pdfBuffer.length) {
//                     const uploadResult = await new Promise((resolve, reject) => {
//                         const uploadStream = cloudinary.uploader.upload_stream(
//                             { folder: "ecards", resource_type: "raw", public_id: `ecard-${order._id}`, access_mode: "public" },
//                             (err, result) => (err ? reject(err) : resolve(result))
//                         );
//                         uploadStream.end(pdfBuffer);
//                     });

//                     await sendEmail(
//                         order.user.email,
//                         "🎁 Your Joyory E-Card",
//                         `<p>${message}</p><p>We’ve attached your special card as a PDF.</p>`,
//                         [
//                             {
//                                 name: "ecard.pdf",                     // ZeptoMail required
//                                 content: pdfBuffer.toString("base64"), // MUST be base64
//                                 mime_type: "application/pdf",       // ZeptoMail required
//                             },
//                         ]
//                     );

//                     order.ecard = {
//                         occasion,
//                         message,
//                         emailSentAt: new Date(),
//                         pdfUrl: uploadResult?.secure_url || null,
//                     };
//                 } else console.warn("⚠️ PDF buffer empty, skipping e-card");
//             }
//         } catch (ecardErr) {
//             console.warn("⚠️ E-Card skipped:", ecardErr.message);
//         }


//         await order.save();

//         return res.status(200).json({
//             success: true,
//             message: "✅ Razorpay order created (E-card processed if applicable)",
//             razorpayOrderId: razorpayOrder.id,
//             amount: order.amount, // ✅ final discounted total
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

//         // STEP 9: Deduct stock (variant-safe)
//         for (const item of order.products) {
//             const product = await Product.findById(item.productId._id);
//             if (!product) {
//                 console.warn("⚠️ Product not found:", item.productId._id);
//                 continue;
//             }

//             // ✅ Variant exists → update variant stock & sales
//             if (item.selectedVariant?.sku && product.variants?.length) {
//                 const variantIndex = product.variants.findIndex(v => v.sku === item.selectedVariant.sku);
//                 if (variantIndex === -1) continue;

//                 const variant = product.variants[variantIndex];

//                 if (variant.stock < item.quantity) {
//                     console.error("❌ Insufficient stock for variant:", { product: product.name, variant: variant.name, available: variant.stock, requested: item.quantity });
//                     return res.status(400).json({
//                         step: "STOCK_CHECK",
//                         success: false,
//                         message: `Insufficient stock for ${product.name} - ${variant.name}`,
//                         debug: { available: variant.stock, requested: item.quantity }
//                     });
//                 }

//                 variant.stock -= item.quantity;
//                 variant.sales = (variant.sales || 0) + item.quantity;

//             } else {
//                 // ❌ No variant → fallback to product quantity
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
//             }

//             // ✅ Update product status & total quantity
//             if (product.variants?.length) {
//                 const totalStock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
//                 product.quantity = totalStock;
//                 product.status =
//                     totalStock <= 0
//                         ? "Out of stock"
//                         : totalStock < product.thresholdValue
//                             ? "Low stock"
//                             : "In-stock";
//             } else {
//                 product.status =
//                     product.quantity <= 0
//                         ? "Out of stock"
//                         : product.quantity < product.thresholdValue
//                             ? "Low stock"
//                             : "In-stock";
//             }

//             await product.save();
//             console.log(`✅ Stock updated for product ${product.name}`);
//         }

//         // STEP 10: Mark order as paid
//         order.paid = true;
//         order.paymentStatus = "success";
//         order.paymentMethod = rpPayment.method || "Prepaid";
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
//                 expiryDate: rpPayment.card ? `${rpPayment.card.expiry_month}/${rpPayment.card.expiry_year}` : undefined,
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

//         // STEP 14: Tracking history
//         if (!order.trackingHistory) order.trackingHistory = [];
//         order.trackingHistory.push(
//             { status: "Payment Successful", timestamp: new Date(), location: "Online Payment - Razorpay" },
//             { status: "Processing", timestamp: new Date(), location: "Store" }
//         );

//         await order.save();

//         // STEP 15: Deduct walletBalance (referral/points) after successful payment
//         try {
//             if (order.pointsUsed && order.pointsUsed > 0) {
//                 const user = await User.findById(order.user._id);
//                 if (user) {
//                     const pointsValue = order.pointsUsed * 0.1; // 1 point = 0.1 INR
//                     if (user.walletBalance >= pointsValue) {
//                         user.walletBalance -= pointsValue;
//                     } else {
//                         console.warn(`⚠️ Wallet balance insufficient. Available: ${user.walletBalance}, Required: ${pointsValue}`);
//                         user.walletBalance = 0; // deduct whatever is left
//                     }
//                     await user.save();
//                     console.log(`✅ Wallet points deducted: ${order.pointsUsed} points → ₹${pointsValue}`);
//                 } else {
//                     console.error("❌ User not found for wallet deduction", { userId: order.user._id });
//                 }
//             }
//         } catch (walletErr) {
//             console.error("🔥 Error deducting wallet points:", walletErr);
//         }

//         console.log("✅ Order updated successfully");

//         // STEP 16: Generate Invoice PDF
//         try {
//             const { pdfBuffer, pdfUrl } = await generateInvoice(order, order.user);

//             // Save invoice details in order
//             order.invoice = {
//                 number: `INV-${order._id}`,
//                 generatedAt: new Date(),
//                 pdfUrl,
//             };
//             await order.save();

//             // Email Invoice
//             await sendEmail(
//                 order.user.email,
//                 "🧾 Your Invoice from Joyory",
//                 `<p>Hi ${order.user.name},</p>
//          <p>Thank you for your purchase! Please find your invoice attached.</p>`,
//                 [
//                     {
//                         name: "ecard.pdf",                     // ZeptoMail required
//                         content: pdfBuffer.toString("base64"), // MUST be base64
//                         mime_type: "application/pdf",       // ZeptoMail required
//                     },
//                 ]
//             );

//             console.log("✅ Invoice generated & emailed");
//         } catch (invoiceErr) {
//             console.error("❌ Failed to generate invoice:", invoiceErr);
//         }

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

/**
 * 🧾 Create Razorpay Order
 */
export const createRazorpayOrder = async (req, res) => {
    try {
        const { orderId } = req.body;

        if (!orderId) {
            return res.status(400).json({ success: false, message: "❌ orderId is required" });
        }

        const order = await Order.findById(orderId).populate("user");
        if (!order) {
            return res.status(404).json({ success: false, message: "❌ Order not found" });
        }

        if (order.paid) {
            return res.status(400).json({ success: false, message: "⚠️ This order is already paid." });
        }

        if (order.razorpayOrderId) {
            return res.status(200).json({
                success: true,
                message: "🟡 Razorpay order already exists.",
                razorpayOrderId: order.razorpayOrderId,
                amount: order.amount,
                currency: "INR",
                orderId: order._id,
            });
        }

        if (!order.amount || order.amount <= 0) {
            return res.status(400).json({ success: false, message: "❌ Invalid order amount" });
        }

        const amountInPaise = Math.round(order.amount * 100);

        // ✅ Create Razorpay order
        const razorpayOrder = await razorpay.orders.create({
            amount: amountInPaise,
            currency: "INR",
            receipt: order._id.toString(),
            payment_capture: 1,
            notes: {
                orderId: order._id.toString(),
                customer: order.user?.name || "Guest",
            },
        });

        // 🧾 Split orders (seller wise)
        await splitOrderForPersistence(order);

        // 🪄 Backfill seller data if missing
        for (const p of order.products) {
            if (!p.seller) {
                const prod = await Product.findById(p.productId).select("seller");
                if (prod?.seller) p.seller = prod.seller;
            }
        }

        order.razorpayOrderId = razorpayOrder.id;
        order.paymentStatus = "pending";
        order.orderStatus = "Awaiting Payment";

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

        await order.save();

        res.status(200).json({
            success: true,
            message: "✅ Razorpay order created successfully.",
            razorpayOrderId: razorpayOrder.id,
            amount: order.amount,
            currency: "INR",
            orderId: order._id,
        });
    } catch (err) {
        console.error("🔥 createRazorpayOrder Error:", err);
        res.status(500).json({
            success: false,
            message: "❌ Failed to create Razorpay order",
            error: err.message,
        });
    }
};

// -------------------- VERIFY RAZORPAY PAYMENT (FIXED PERSISTENCE) --------------------

export const verifyRazorpayPayment = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature, shippingAddress } = req.body;

        if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ step: "VALIDATION", success: false, message: "❌ Missing required fields" });
        }

        // Fetch order (no DB changes yet)
        const order = await Order.findById(orderId).populate("user").populate("products.productId");
        if (!order) return res.status(404).json({ step: "ORDER_FETCH", success: false, message: "Order not found" });
        if (order.paid) return res.status(200).json({ step: "IDEMPOTENT", success: true, message: "✅ Order already paid", order });

        // Razorpay signature verification
        const expectedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ step: "SIGNATURE", success: false, message: "❌ Invalid signature" });
        }

        // Fetch payment from Razorpay
        const rpPayment = await razorpay.payments.fetch(razorpay_payment_id);
        if (rpPayment.status !== "captured") {
            return res.status(400).json({ step: "PAYMENT_STATUS", success: false, message: `Payment not captured (status: ${rpPayment.status})` });
        }
        // rpPayment.amount is in paisa; order.amount assumed to be in rupees
        if ((rpPayment.amount / 100) !== Number(order.amount)) {
            return res.status(400).json({ step: "AMOUNT_CHECK", success: false, message: "❌ Amount mismatch" });
        }

        console.log("🔹 Starting DB transaction for stock deduction & order persistence...");

        let productIdsToRecalc = new Set();

        // Transactional work
        await session.withTransaction(async () => {
            // Re-fetch the order inside the session with a 'for update' style read
            const sessionOrder = await Order.findById(orderId).session(session).populate("user").populate("products.productId");
            if (!sessionOrder) throw new Error("Order vanished during transaction");

            // For each ordered item do an atomic update on Product
            for (const item of sessionOrder.products) {
                const productId = item.productId instanceof mongoose.Types.ObjectId ? item.productId : item.productId._id;
                const qty = Number(item.quantity || 0);
                if (qty <= 0) continue;

                productIdsToRecalc.add(String(productId));

                if (item.selectedVariant?.sku) {
                    // Atomic update: ensure variant with sku has enough stock and then decrement it
                    const sku = item.selectedVariant.sku;
                    const updateRes = await Product.updateOne(
                        { _id: productId, "variants.sku": sku, "variants.stock": { $gte: qty } }, // ensure enough stock
                        {
                            $inc: {
                                "variants.$.stock": -qty,
                                "variants.$.sales": qty,
                                quantity: -qty,   // keep product.quantity in-sync by decrementing
                                sales: qty       // aggregate product.sales
                            }
                        },
                        { session }
                    );

                    if (!updateRes || updateRes.modifiedCount === 0) {
                        // Nothing modified -> either sku not found or insufficient stock
                        throw { step: "STOCK", type: "INSUFFICIENT", message: `Insufficient stock or SKU missing for product ${productId} (sku: ${sku})` };
                    }
                } else {
                    // Simple product: decrement quantity atomically if enough stock
                    const updateRes = await Product.updateOne(
                        { _id: productId, quantity: { $gte: qty } },
                        { $inc: { quantity: -qty, sales: qty } },
                        { session }
                    );

                    if (!updateRes || updateRes.modifiedCount === 0) {
                        throw { step: "STOCK", type: "INSUFFICIENT", message: `Insufficient stock for product ${productId}` };
                    }
                }
            } // end for each product

            // Update order fields (inside transaction)
            sessionOrder.paid = true;
            sessionOrder.paymentStatus = "success";
            sessionOrder.paymentMethod = rpPayment.method || "Razorpay";
            sessionOrder.transactionId = razorpay_payment_id;
            sessionOrder.orderStatus = "Processing";
            if (shippingAddress) sessionOrder.shippingAddress = shippingAddress;

            // Create Payment record inside transaction
            await Payment.create([{
                order: sessionOrder._id,
                method: rpPayment.method,
                status: "Completed",
                transactionId: razorpay_payment_id,
                amount: sessionOrder.amount,
                cardHolderName: rpPayment.card?.name,
                cardNumber: rpPayment.card?.last4,
                expiryDate: rpPayment.card ? `${rpPayment.card.expiry_month}/${rpPayment.card.expiry_year}` : undefined,
                isActive: true,
            }], { session });

            // Clear user's cart inside transaction
            if (sessionOrder.user && sessionOrder.user._id) {
                await User.updateOne({ _id: sessionOrder.user._id }, { $set: { cart: [] } }, { session });
            }

            // Save the order inside the transaction
            await sessionOrder.save({ session });

            // Recalculate and update product.status for affected products (inside transaction)
            // We fetch the latest product docs in-session and update their status based on quantity/thresholdValue
            const changedProductIds = Array.from(productIdsToRecalc).map(id => new mongoose.Types.ObjectId(id));
            const products = await Product.find({ _id: { $in: changedProductIds } }).session(session);

            // Prepare bulk operations
            const bulkOps = products.map(prod => {
                const qty = Number(prod.quantity || 0);
                let newStatus = "In-stock";
                if (qty <= 0) newStatus = "Out of stock";
                else if (prod.thresholdValue != null && qty < prod.thresholdValue) newStatus = "Low stock";

                // Ensure variant stock non-negative (defensive)
                if (Array.isArray(prod.variants)) {
                    prod.variants = prod.variants.map(v => {
                        if ((v.stock ?? 0) < 0) v.stock = 0; // safety clamp
                        return v;
                    });
                }

                return {
                    updateOne: {
                        filter: { _id: prod._id },
                        update: {
                            $set: {
                                status: newStatus,
                                variants: prod.variants // we keep variants as-is; they were already updated via $inc
                            }
                        }
                    }
                };
            });

            if (bulkOps.length) {
                await Product.bulkWrite(bulkOps, { session });
            }

            // Transaction function success -> commit will be attempted after this block
        }); // end withTransaction

        session.endSession();
        console.log("🔹 DB transaction committed successfully.");

        // After successful DB transaction, do external shipment creation (do NOT include external calls in transaction)
        let finalOrder = await Order.findById(orderId).populate("user").populate("products.productId");

        try {
            const shiprocketRes = await createShipment(finalOrder); // external call
            if (shiprocketRes?.shipmentDetails) {
                finalOrder.shipment = shiprocketRes.shipmentDetails;
                finalOrder.trackingHistory.push({ status: "Shipment Created", timestamp: new Date(), location: "Shiprocket" });
                await finalOrder.save();
            } else {
                console.warn("⚠️ Shiprocket responded without shipmentDetails", shiprocketRes);
            }
        } catch (shipErr) {
            // Shipment failed — log it but do not roll back DB transaction (already committed)
            console.error("⚠️ Shiprocket Error (post-commit):", shipErr?.message || shipErr);
            // Add a trackingHistory note so admins can see shipment creation failed
            try {
                await Order.updateOne({ _id: finalOrder._id }, {
                    $push: { trackingHistory: { status: "Shipment Creation Failed", timestamp: new Date(), location: "Shiprocket" } }
                });
            } catch (err) {
                console.error("⚠️ Failed to record shipment failure in order:", err);
            }
        }

        // Push payment/tracking history entries for order (safe to do after commit)
        try {
            await Order.updateOne({ _id: finalOrder._id }, {
                $push: {
                    trackingHistory: [
                        { status: "Payment Successful", timestamp: new Date(), location: "Online - Razorpay" },
                        { status: "Processing", timestamp: new Date(), location: "Store" }
                    ]
                }
            });
        } catch (err) {
            console.error("⚠️ Failed to push tracking history after commit:", err);
        }

        // Return updated order (refetch for latest)
        const refreshedOrder = await Order.findById(orderId).populate("user").populate("products.productId");

        return res.status(200).json({ step: "COMPLETE", success: true, message: "✅ Payment verified & order processed", order: refreshedOrder });

    } catch (err) {
        // Transaction will be aborted automatically on thrown error in session.withTransaction
        session.endSession();

        // Distinguish stock errors we threw intentionally
        if (err && err.step === "STOCK") {
            console.error("🔴 Stock error during payment verification:", err.message || err);
            return res.status(400).json({ step: "STOCK", success: false, message: err.message || "Insufficient stock for one or more items" });
        }

        console.error("🔥 verifyRazorpayPayment Error:", err);
        return res.status(500).json({ step: "FATAL", success: false, message: "Unexpected server error during payment verification", error: (err && err.message) || err });
    }
};




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

// 🌐 Get all active payment methods with full config
export const getActivePaymentMethods = async (req, res) => {
    try {
        // Fetch all active methods, including full config
        const methods = await PaymentMethod.find({ isActive: true })
            .select("_id name key type description order config") // include config for frontend
            .sort({ order: 1 });

        if (!methods.length) {
            return res.status(404).json({ success: false, message: "No active payment methods found" });
        }

        res.json({ success: true, methods });
    } catch (err) {
        console.error("getActivePaymentMethods error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

