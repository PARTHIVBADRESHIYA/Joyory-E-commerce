// import validator from "validator";
// import Payment from '../../../models/settings/payments/Payment.js';
// import PaymentMethod from '../../../models/settings/payments/PaymentMethod.js';
// import GiftCard from "../../../models/GiftCard.js";
// import WalletConfig from "../../../models/WalletConfig.js";
// import Order from '../../../models/Order.js';
// import { encrypt, decrypt } from '../../../middlewares/utils/encryption.js';
// import { createShiprocketOrder, cancelShiprocketShipment } from "../../../middlewares/services/shiprocket.js";
// import { refundQueue } from "../../../middlewares/services/refundQueue.js";
// import { sendEmail } from "../../../middlewares/utils/emailService.js"; // ✅ assume you already have an email service
// import Product from '../../../models/Product.js';
// import Affiliate from '../../../models/Affiliate.js';
// import mongoose from 'mongoose';
// import User from '../../../models/User.js';
// import Referral from '../../../models/Referral.js'; // ✅ You need to import this
// import Razorpay from "razorpay";
// import crypto from "crypto";
// import axios from 'axios';
// import dotenv from "dotenv";

// import cloudinary from '../../../middlewares/utils/cloudinary.js';
// import { determineOccasions, craftMessage } from "../../../middlewares/services/ecardService.js";
// import { buildEcardPdf } from "../../../middlewares/services/ecardPdf.js";
// import { generateAndSaveInvoice } from "../../../middlewares/services/invoiceService.js";
// import { splitOrderForPersistence } from '../../../middlewares/services/orderSplit.js'; // or correct path
// import { shiprocketQueue } from "../../../middlewares/services/shiprocketQueue.js";

// dotenv.config();


// export const razorpay = new Razorpay({
//     key_id: process.env.RAZORPAY_KEY_ID,
//     key_secret: process.env.RAZORPAY_KEY_SECRET
// });

// const razorpayAxios = axios.create({
//     baseURL: "https://api.razorpay.com/v1",
//     auth: {
//         username: process.env.RAZORPAY_KEY_ID,
//         password: process.env.RAZORPAY_KEY_SECRET,
//     },
// });

// // Simple helper - adapt rules to your business
// const isCodAllowed = ({ pincode, amount, user }) => {
//     const MAX_COD_AMOUNT = 10000; // example limit
//     const blockedPincodes = []; // fill from DB/config
//     if (!pincode) return false;
//     if (blockedPincodes.includes(String(pincode))) return false;
//     if (amount > MAX_COD_AMOUNT) return false;
//     // add any other business rules here (first order, fraud flags etc)
//     return true;
// };

// export const isFraudulentCodOrder = async (order, user, shippingAddress) => {
//     const { amount } = order || {};
//     const userId = user?._id;
//     const phone = user?.addresses?.[0]?.phone;
//     const email = user?.email;

//     // Basic email and phone validation
//     if (!validator.isEmail(email || "")) {
//         return { isFraud: true, reason: "Invalid or fake email address provided" };
//     }
//     if (!validator.isMobilePhone(phone || "", "en-IN")) {
//         return { isFraud: true, reason: "Invalid phone number format" };
//     }

//     // Check high value COD
//     if (amount > 10000) {
//         return { isFraud: true, reason: "High-value COD orders need verification" };
//     }

//     // Past issues
//     const pastRTOIssues = await Order.countDocuments({
//         user: userId,
//         orderStatus: { $in: ["Returned", "Cancelled by Seller"] },
//         paymentMethod: "COD",
//     });
//     if (pastRTOIssues >= 1) {
//         return { isFraud: true, reason: "Past COD returns/cancellations detected" };
//     }

//     // ✅ Validate shipping address pincode
//     if (!shippingAddress?.pincode || String(shippingAddress.pincode).length !== 6) {
//         return { isFraud: true, reason: "Incomplete or invalid pincode in the shipping address" };
//     }

//     return { isFraud: false };
// };

// export const processOrderStockAndFinalize = async (orderId, session, shippingAddress) => {
//     const productIdsToRecalc = new Set();

//     const txOrder = await Order.findById(orderId)
//         .populate("products.productId")
//         .populate("user")
//         .session(session);

//     if (!txOrder) throw new Error("Order vanished during transaction");

//     for (const item of txOrder.products) {
//         const product = await Product.findById(item.productId).session(session);
//         if (!product) throw new Error(`Product not found: ${item.productId}`);

//         const qty = Number(item.quantity || 0);
//         if (qty <= 0) continue;

//         if (item.variant?.sku) {
//             const variant = product.variants.find(v => v.sku === item.variant.sku);
//             if (!variant) throw new Error(`Variant not found: ${item.variant.sku}`);
//             if (variant.stock < qty) throw new Error(`Not enough stock for ${variant.sku}`);

//             variant.stock -= qty;
//             variant.sales = (variant.sales || 0) + qty;

//         } else {
//             if (product.quantity < qty) throw new Error(`Not enough stock for ${product.name}`);
//             product.quantity -= qty;
//             product.sales = (product.sales || 0) + qty;
//         }

//         productIdsToRecalc.add(String(product._id));
//         await product.save({ session });
//     }

//     // Don't change order status here. Payment flow controls it.
//     if (shippingAddress) txOrder.shippingAddress = shippingAddress;

//     await txOrder.save({ session });

//     // recalc product stock levels
//     const products = await Product.find({ _id: { $in: [...productIdsToRecalc] } }).session(session);

//     for (const prod of products) {
//         const totalQty = prod.variants?.length
//             ? prod.variants.reduce((a, b) => a + (b.stock || 0), 0)
//             : (prod.quantity || 0);

//         prod.quantity = totalQty;

//         if (totalQty <= 0) prod.status = "Out of stock";
//         else if (prod.thresholdValue && totalQty < prod.thresholdValue) prod.status = "Low stock";
//         else prod.status = "In-stock";

//         await prod.save({ session });
//     }

//     return txOrder;
// };

// export const setPaymentMethod = async (req, res) => {
//     try {
//         const { orderId, paymentMethod } = req.body;

//         if (!orderId || !paymentMethod)
//             return res.status(400).json({ success: false, message: "orderId & paymentMethod required" });

//         // ✅ Normalize input
//         const normalized = paymentMethod.toUpperCase();

//         const valid = ["COD", "ONLINE", "WALLET", "GIFTCARD"];
//         if (!valid.includes(normalized))
//             return res.status(400).json({ success: false, message: "Invalid payment method" });

//         const order = await Order.findById(orderId);
//         if (!order) return res.status(404).json({ message: "Order not found" });

//         if (order.paid)
//             return res.status(400).json({ message: "Order already paid" });

//         // ✅ Normalize and FIX save value (schema uses "Online")
//         if (normalized === "ONLINE") {
//             order.orderType = "Online";       // ✅ correct
//             order.paymentMethod = "Online";   // ✅ correct
//         }

//         if (normalized === "COD") {
//             order.orderType = "COD";
//             order.paymentMethod = "COD";
//         }
//         if (normalized === "WALLET") {
//             order.orderType = "Online";
//             order.paymentMethod = "Wallet";
//         }
//         if (normalized === "GIFTCARD") {
//             order.orderType = "Online";
//             order.paymentMethod = "GiftCard";
//         }


//         await order.save();  // ✅ now we save actual updated value

//         // ✅ return flow
//         return res.json({
//             success: true,
//             next: normalized === "COD" ? "COD_FLOW" : "ONLINE_FLOW",
//             message:
//                 normalized === "COD"
//                     ? "COD selected. Proceed to /createCodOrder"
//                     : "Online payment selected. Proceed to /createRazorpayOrder",
//         });

//     } catch (err) {
//         res.status(500).json({ message: err.message });
//     }
// };

// export const createRazorpayOrder = async (req, res) => {
//     try {
//         const { orderId } = req.body;

//         if (!orderId) {
//             return res.status(400).json({ success: false, message: "❌ orderId is required" });
//         }

//         const order = await Order.findById(orderId).populate("user");
//         if (!order) {
//             return res.status(404).json({ success: false, message: "❌ Order not found" });
//         }

//         if (order.paid) {
//             return res.status(400).json({ success: false, message: "⚠️ This order is already paid." });
//         }

//         if (order.razorpayOrderId) {
//             return res.status(200).json({
//                 success: true,
//                 message: "🟡 Razorpay order already exists.",
//                 razorpayOrderId: order.razorpayOrderId,
//                 amount: order.amount,
//                 currency: "INR",
//                 orderId: order._id,
//             });
//         }

//         if (!order.amount || order.amount <= 0) {
//             return res.status(400).json({ success: false, message: "❌ Invalid order amount" });
//         }

//         if (order.orderType !== "Online") {
//             return res.status(400).json({
//                 success: false,
//                 message: "Payment method must be ONLINE before creating Razorpay order",
//             });
//         }


//         const amountInPaise = Math.round(order.amount * 100);

//         // ✅ Create Razorpay order
//         const razorpayOrder = await razorpay.orders.create({
//             amount: amountInPaise,
//             currency: "INR",
//             receipt: order._id.toString(),
//             payment_capture: 1,
//             notes: {
//                 orderId: order._id.toString(),
//                 customer: order.user?.name || "Guest",
//             },
//         });

//         // 🧾 Split orders (seller wise)
//         await splitOrderForPersistence(order);

//         // 🪄 Backfill seller data if missing
//         for (const p of order.products) {
//             if (!p.seller) {
//                 const prod = await Product.findById(p.productId).select("seller");
//                 if (prod?.seller) p.seller = prod.seller;
//             }
//         }

//         order.razorpayOrderId = razorpayOrder.id;
//         order.paymentStatus = "pending";
//         order.orderStatus = "Awaiting Payment";

//         if (!order.tracking_history || order.tracking_history.length === 0) {
//             order.tracking_history = [
//                 { status: "Order Placed", timestamp: new Date(), location: "Store" },
//                 { status: "Awaiting Payment", timestamp: new Date() },
//             ];
//         } else {
//             order.tracking_history.push({
//                 status: "Awaiting Payment",
//                 timestamp: new Date(),
//             });
//         }

//         await order.save();

//         res.status(200).json({
//             success: true,
//             message: "✅ Razorpay order created successfully.",
//             razorpayOrderId: razorpayOrder.id,
//             amount: order.amount,
//             currency: "INR",
//             orderId: order._id,
//         });
//     } catch (err) {
//         console.error("🔥 createRazorpayOrder Error:", err);
//         res.status(500).json({
//             success: false,
//             message: "❌ Failed to create Razorpay order",
//             error: err.message,
//         });
//     }
// };

// export const verifyRazorpayPayment = async (req, res) => {
//     const session = await mongoose.startSession();
//     try {
//         const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature, shippingAddress } = req.body;

//         if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
//             return res.status(400).json({ step: "VALIDATION", success: false, message: "❌ Missing required fields" });
//         }

//         // initial fetch (read-only)
//         const order = await Order.findById(orderId).populate("user").populate("products.productId");
//         if (!order) return res.status(404).json({ step: "ORDER_FETCH", success: false, message: "Order not found" });
//         if (order.paid) return res.status(200).json({ step: "IDEMPOTENT", success: true, message: "✅ Order already paid", order });

//         // verify signature
//         const expectedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
//             .update(`${razorpay_order_id}|${razorpay_payment_id}`)
//             .digest("hex");

//         if (expectedSignature !== razorpay_signature) {
//             return res.status(400).json({ step: "SIGNATURE", success: false, message: "❌ Invalid signature" });
//         }

//         // fetch payment from Razorpay
//         const rpPayment = await razorpay.payments.fetch(razorpay_payment_id);
//         if (rpPayment.status !== "captured") {
//             return res.status(400).json({ step: "PAYMENT_STATUS", success: false, message: `Payment not captured (status: ${rpPayment.status})` });
//         }
//         if ((rpPayment.amount / 100) !== Number(order.amount)) {
//             return res.status(400).json({ step: "AMOUNT_CHECK", success: false, message: "❌ Amount mismatch" });
//         }

//         console.log("🔹 Starting DB transaction for stock deduction & order persistence...");

//         const productIdsToRecalc = new Set();

//         // transaction block
//         await session.withTransaction(async () => {
//             // re-fetch order inside session to ensure consistency
//             const sessionOrder = await Order.findById(orderId).session(session).populate("user").populate("products.productId");
//             if (!sessionOrder) throw new Error("Order vanished during transaction");

//             // iterate items and perform atomic updates
//             for (const item of sessionOrder.products) {
//                 const productId = item.productId._id || item.productId;
//                 const qty = Number(item.quantity || 0);
//                 if (qty <= 0) continue;

//                 productIdsToRecalc.add(String(productId));

//                 // 🧠 If product has variant SKU
//                 if (item.variant?.sku) {
//                     const sku = item.variant.sku;

//                     const product = await Product.findById(productId).session(session);
//                     if (!product) throw new Error(`Product not found: ${productId}`);

//                     const variantIndex = product.variants.findIndex(v => v.sku === sku);
//                     if (variantIndex === -1) throw new Error(`Variant not found for SKU: ${sku}`);

//                     const variant = product.variants[variantIndex];
//                     if (variant.stock < qty) throw new Error(`Not enough stock for ${variant.sku}`);

//                     // update variant stock and sales
//                     variant.stock -= qty;
//                     variant.sales = (variant.sales || 0) + qty;

//                     // update product-level stock and sales
//                     product.sales = (product.sales || 0) + qty;

//                     // recalc total stock (sum of all variants)
//                     const totalQty = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
//                     product.quantity = totalQty;

//                     // status update
//                     if (totalQty <= 0) product.status = "Out of stock";
//                     else if (product.thresholdValue && totalQty < product.thresholdValue)
//                         product.status = "Low stock";
//                     else product.status = "In-stock";

//                     await product.save({ session });

//                 } else {
//                     // 🧠 Non-variant product
//                     const product = await Product.findById(productId).session(session);
//                     if (!product) throw new Error(`Product not found: ${productId}`);
//                     if (product.quantity < qty) throw new Error(`Not enough stock for ${product.name}`);

//                     product.quantity -= qty;
//                     product.sales = (product.sales || 0) + qty;

//                     if (product.quantity <= 0) product.status = "Out of stock";
//                     else if (product.thresholdValue && product.quantity < product.thresholdValue)
//                         product.status = "Low stock";
//                     else product.status = "In-stock";

//                     await product.save({ session });
//                 }
//             }


//             // ---- update order fields inside transaction ----
//             sessionOrder.paid = true;
//             sessionOrder.paymentStatus = "success";
//             sessionOrder.paymentMethod = rpPayment.method || "Razorpay";
//             sessionOrder.transactionId = razorpay_payment_id;
//             sessionOrder.orderStatus = "Processing";
//             if (shippingAddress) sessionOrder.shippingAddress = shippingAddress;

//             sessionOrder.isDraft = false;


//             // create Payment record in same transaction
//             await Payment.create([{
//                 order: sessionOrder._id,
//                 method: rpPayment.method,
//                 status: "Completed",
//                 transactionId: razorpay_payment_id,
//                 amount: sessionOrder.amount,
//                 cardHolderName: rpPayment.card?.name,
//                 cardNumber: rpPayment.card?.last4,
//                 expiryDate: rpPayment.card ? `${rpPayment.card.expiry_month}/${rpPayment.card.expiry_year}` : undefined,
//                 isActive: true,
//             }], { session });

//             // clear user's cart inside tx
//             if (sessionOrder.user && sessionOrder.user._id) {
//                 await User.updateOne({ _id: sessionOrder.user._id }, { $set: { cart: [] } }, { session });
//             }

//             // save the order inside tx
//             await sessionOrder.save({ session });

//             // ---- recalc total quantity and status for affected products ----
//             if (productIdsToRecalc.size > 0) {
//                 const changedProductIds = Array.from(productIdsToRecalc).map(id => new mongoose.Types.ObjectId(id));
//                 const products = await Product.find({ _id: { $in: changedProductIds } }).session(session);

//                 const bulkOps = products.map(prod => {
//                     // totalQty derived from variants if available; otherwise use product.quantity
//                     let totalQty = 0;
//                     if (Array.isArray(prod.variants) && prod.variants.length > 0) {
//                         totalQty = prod.variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);
//                     } else {
//                         totalQty = Number(prod.quantity || 0);
//                     }

//                     // compute status
//                     let newStatus = "In-stock";
//                     if (totalQty <= 0) newStatus = "Out of stock";
//                     else if (prod.thresholdValue != null && totalQty < prod.thresholdValue) newStatus = "Low stock";

//                     // defensive clamp variants' stock to >=0
//                     if (Array.isArray(prod.variants)) {
//                         prod.variants = prod.variants.map(v => {
//                             if ((v.stock ?? 0) < 0) v.stock = 0;
//                             return v;
//                         });
//                     }

//                     return {
//                         updateOne: {
//                             filter: { _id: prod._id },
//                             update: {
//                                 $set: {
//                                     status: newStatus,
//                                     quantity: totalQty,
//                                     variants: prod.variants
//                                 }
//                             }
//                         }
//                     };
//                 });

//                 if (bulkOps.length) {
//                     const bwRes = await Product.bulkWrite(bulkOps, { session });
//                     console.log("BulkWrite result:", bwRes);
//                 }
//             }

//             // finishing transaction block (commit attempted automatically after success)
//         }); // end withTransaction

//         console.log("🔹 DB transaction committed successfully.");

//         // ---- post-commit: external shipment (do not include external calls inside tx) ----
//         const finalOrder = await Order.findById(orderId).populate("user").populate("products.productId");
//         try {
//             const shiprocketRes = await createShiprocketOrder(finalOrder);
//             if (shiprocketRes?.shipmentDetails) {
//                 finalOrder.shipment = shiprocketRes.shipmentDetails;
//                 finalOrder.tracking_history.push({ status: "Shipment Created", timestamp: new Date(), location: "Shiprocket" });
//                 await finalOrder.save();
//             } else {
//                 console.warn("⚠️ Shiprocket responded without shipmentDetails", shiprocketRes);
//             }
//         } catch (shipErr) {
//             console.error("⚠️ Shiprocket Error (post-commit):", shipErr?.message || shipErr);
//             // record failure note
//             try {
//                 await Order.updateOne({ _id: finalOrder._id }, {
//                     $push: { tracking_history: { status: "Shipment Creation Failed", timestamp: new Date(), location: "Shiprocket" } }
//                 });
//             } catch (err) {
//                 console.error("⚠️ Failed to record shipment failure:", err);
//             }
//         }

//         // push payment/tracking history
//         try {
//             await Order.updateOne({ _id: finalOrder._id }, {
//                 $push: {
//                     tracking_history: [
//                         { status: "Payment Successful", timestamp: new Date(), location: "Online - Razorpay" },
//                         { status: "Processing", timestamp: new Date(), location: "Store" }
//                     ]
//                 }
//             });
//         } catch (err) {
//             console.error("⚠️ Failed to push tracking history after commit:", err);
//         }

//         // return final order
//         const refreshedOrder = await Order.findById(orderId).populate("user").populate("products.productId");
//         return res.status(200).json({ step: "COMPLETE", success: true, message: "✅ Payment verified & order processed", order: refreshedOrder });

//     } catch (err) {
//         // If we threw our stock error object, send friendly message
//         if (err && err.step === "STOCK") {
//             console.error("🔴 Stock error during payment verification:", err.message || err);
//             await session.endSession();
//             return res.status(400).json({ step: "STOCK", success: false, message: err.message || "Insufficient stock for one or more items" });
//         }

//         console.error("🔥 verifyRazorpayPayment Error:", err);
//         await session.endSession();
//         return res.status(500).json({ step: "FATAL", success: false, message: "Unexpected server error during payment verification", error: (err && err.message) || err });
//     } finally {
//         // ensure session is ended in all cases
//         try { await session.endSession(); } catch (e) { /* ignore */ }
//     }
// };

// export const createCodOrder = async (req, res) => {
//     try {
//         const { orderId } = req.body;
//         const userId = req.user?._id;

//         if (!orderId)
//             return res.status(400).json({ success: false, message: "orderId is required" });

//         const order = await Order.findById(orderId)
//             .populate("user")
//             .populate("products.productId");

//         if (!order) return res.status(404).json({ success: false, message: "Order not found" });
//         if (order.paid) return res.status(400).json({ success: false, message: "Already paid" });
//         if (order.orderType !== "COD")
//             return res.status(400).json({ success: false, message: "Invalid order type" });

//         // Check if fraud flagged
//         const fraudCheck = await isFraudulentCodOrder(order, order.user, req.body.shippingAddress);
//         if (fraudCheck.isFraud) {
//             // Send warning email to the user
//             await sendEmail(
//                 order.user.email,
//                 "⚠️ COD Order Rejected (Fraudulent Activity Detected)",
//                 `<p>Hi ${order.user.name},</p>
//                 <p>Your Cash on Delivery order <strong>#${order._id}</strong> has been rejected because: <em>${fraudCheck.reason}</em>.</p>
//                 <p>Please use prepaid payment for secure delivery.</p>
//                 <p>Regards,<br/>Team Joyory Beauty</p>`
//             );

//             return res.status(400).json({
//                 success: false,
//                 step: "DENIED_FRAUD_RISK",
//                 message: "COD not available: " + fraudCheck.reason,
//             });
//         }

//         return res.status(200).json({
//             success: true,
//             step: "STEP_1_VALIDATED",
//             message: "COD validation passed. Ready for confirmation.",
//             orderSummary: {
//                 orderId: order._id,
//                 amount: order.amount,
//                 productsCount: order.products?.length || 0,
//                 customer: order.user?.name || "Guest",
//             },
//         });
//     } catch (err) {
//         console.error("🔥 COD Step1 Error:", err);
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

// export const confirmCodOrder = async (req, res) => {
//     const session = await mongoose.startSession();
//     try {
//         const { orderId, shippingAddress } = req.body;
//         const userId = req.user?._id;

//         if (!orderId || !userId)
//             return res.status(400).json({ success: false, message: "Invalid request" });

//         const order = await Order.findById(orderId).populate("user").populate("products.productId");
//         if (!order) return res.status(404).json({ success: false, message: "Order not found" });

//         if (order.paid || order.orderStatus === "Cancelled")
//             return res.status(400).json({ success: false, message: "Order cannot be confirmed" });

//         // Final fraud check (e.g., between step 1 and confirm, user might change info)
//         const fraudCheck = await isFraudulentCodOrder(order, order.user, req.body.shippingAddress);
//         if (fraudCheck.isFraud) {
//             await sendEmail(
//                 order.user.email,
//                 "⚠️ COD Order Blocked (Fraud Risk)",
//                 `<p>Hi ${order.user.name},</p>
//                 <p>Unfortunately we could not proceed with your order <strong>#${order._id}</strong> due to:</p>
//                 <p><em>${fraudCheck.reason}</em>.</p>
//                 <p>Please try prepaid payment to confirm delivery.</p>
//                 <p>Regards,<br/>Team Joyory Beauty</p>`
//             );
//             return res.status(400).json({ success: false, message: "COD denied: " + fraudCheck.reason });
//         }

//         // COD eligibility check based on pincode or amount
//         const deliveryPincode = shippingAddress?.pincode || order.shippingAddress?.pincode;
//         if (!isCodAllowed({ pincode: deliveryPincode, amount: order.amount })) {
//             return res.status(400).json({ success: false, message: "COD not available for this location/amount" });
//         }

//         await session.withTransaction(async () => {
//             const txOrder = await Order.findById(orderId).session(session).populate("products.productId");
//             if (!txOrder) throw new Error("Order disappeared during transaction");

//             // ✅ Deduct stock
//             for (const item of txOrder.products) {
//                 const product = await Product.findById(item.productId).session(session);
//                 if (!product) throw new Error(`Product not found: ${item.productId}`);

//                 const qty = Number(item.quantity || 0);
//                 if (qty <= 0) continue;

//                 if (item.variant?.sku) {
//                     const variant = product.variants.find(v => String(v.sku) === String(item.variant.sku));
//                     if (!variant || variant.stock < qty) throw new Error(`Not enough stock for ${item.variant.sku}`);
//                     variant.stock -= qty;
//                     variant.sales += qty;
//                 } else {
//                     if (product.quantity < qty) throw new Error(`Not enough stock for ${product.name}`);
//                     product.quantity -= qty;
//                     product.sales += qty;
//                 }
//                 await product.save({ session });
//             }

//             // ✅ Update order + create payment
//             txOrder.paymentMethod = "COD";
//             txOrder.paid = false;
//             txOrder.paymentStatus = "pending";
//             txOrder.orderStatus = "Processing";
//             if (shippingAddress) txOrder.shippingAddress = shippingAddress;
//             txOrder.isDraft = false;


//             const [paymentDoc] = await Payment.create(
//                 [
//                     {
//                         order: txOrder._id,
//                         method: "COD",
//                         status: "Pending",
//                         amount: txOrder.amount,
//                     },
//                 ],
//                 { session }
//             );

//             if (paymentDoc) txOrder.paymentId = paymentDoc._id;
//             await User.updateOne({ _id: txOrder.user._id }, { $set: { cart: [] } }, { session });

//             txOrder.tracking_history = [
//                 ...(txOrder.tracking_history || []),
//                 { status: "Order Placed (COD)", timestamp: new Date(), location: "Store" },
//                 { status: "Processing", timestamp: new Date(), location: "Store" },
//             ];
//             await txOrder.save({ session });
//         });

//         // ✅ Post Transaction – Create Shiprocket Order (not in transaction)
//         const finalOrder = await Order.findById(orderId).populate("user").populate("products.productId");
//         try {
//             const shiprocketRes = await createShiprocketOrder(finalOrder);
//             if (shiprocketRes?.shipmentDetails) {
//                 finalOrder.shipment = shiprocketRes.shipmentDetails;
//                 finalOrder.tracking_history.push({
//                     status: "Shipment Created",
//                     timestamp: new Date(),
//                     location: "Shiprocket",
//                 });
//                 await finalOrder.save();
//             } else {
//                 console.warn("⚠️ Shiprocket responded without shipmentDetails", shiprocketRes);
//             }
//         } catch (shipErr) {
//             console.error("⚠️ Shiprocket Error for COD:", shipErr?.message || shipErr);
//             await Order.updateOne(
//                 { _id: finalOrder._id },
//                 {
//                     $push: {
//                         tracking_history: {
//                             status: "Shipment Creation Failed",
//                             timestamp: new Date(),
//                             location: "Shiprocket",
//                         },
//                     },
//                 }
//             );
//         }

//         // ✅ Send COD confirmation email
//         await sendEmail(
//             order.user.email,
//             "🎉 Your COD Order is Confirmed!",
//             `<p>Hi ${order.user.name},</p>
//             <p>Your COD order <strong>#${order._id}</strong> has been confirmed and is now being processed.</p>
//             <p>We’ll notify you once it’s shipped.</p>
//             <p>Regards,<br/>Team Joyory Beauty</p>`
//         );

//         return res.status(200).json({
//             success: true,
//             message: "✅ COD order confirmed & queued for shipment",
//             order: finalOrder,
//         });
//     } catch (err) {
//         console.error("confirmCodOrder Error:", err);
//         return res.status(500).json({ success: false, message: err.message });
//     } finally {
//         await session.endSession();
//     }
// };

// export const createWalletPayment = async (req, res) => {
//     const session = await mongoose.startSession();
//     try {
//         const { orderId, shippingAddress } = req.body;

//         if (!orderId || !shippingAddress) {
//             return res.status(400).json({ success: false, message: "orderId and shippingAddress are required" });
//         }

//         const required = ["name", "phone", "addressLine1", "city", "state", "pincode"];
//         for (const field of required) {
//             if (!shippingAddress[field]) {
//                 return res.status(400).json({ success: false, message: `Shipping address missing: ${field}` });
//             }
//         }

//         await session.withTransaction(async () => {

//             const order = await Order.findById(orderId)
//                 .session(session)
//                 .populate("user")
//                 .populate("products.productId");

//             if (!order) throw new Error("Order not found");
//             if (order.paid) throw new Error("Already paid");

//             // Save shipping address
//             order.shippingAddress = {
//                 name: shippingAddress.name,
//                 email: shippingAddress.email || order.user.email,
//                 phone: shippingAddress.phone,
//                 addressLine1: shippingAddress.addressLine1,
//                 addressLine2: shippingAddress.addressLine2 || "",
//                 city: shippingAddress.city,
//                 state: shippingAddress.state,
//                 pincode: shippingAddress.pincode,
//                 country: shippingAddress.country || "India",
//             };
//             await order.save({ session });

//             // Payment fields
//             order.orderType = "Online";
//             order.paymentMethod = "Wallet";

//             const Wallet = mongoose.model("Wallet");
//             let wallet = await Wallet.findOne({ user: order.user._id }).session(session);

//             if (!wallet) {
//                 wallet = await Wallet.create([{
//                     user: order.user._id,
//                     joyoryCash: 0,
//                     rewardPoints: 0,
//                     transactions: []
//                 }], { session }).then(docs => docs[0]);
//             }

//             // Load config for points conversion
//             const config = await WalletConfig.findOne().session(session);
//             const pointsRate = config?.pointsToCurrencyRate ?? 0.1;

//             // Calculate real wallet balance
//             const joyoryCash = Number(wallet.joyoryCash) || 0;
//             const rewardPoints = Number(wallet.rewardPoints) || 0;
//             const pointsValue = rewardPoints * pointsRate;

//             const walletBalance = joyoryCash + pointsValue;
//             const orderAmount = Number(order.amount);

//             if (walletBalance < orderAmount) {
//                 throw new Error(`Not enough wallet balance. Available: ${walletBalance}, Required: ${orderAmount}`);
//             }

//             // Deduction logic
//             let remaining = orderAmount;

//             // 1. Deduct from joyoryCash
//             if (joyoryCash >= remaining) {
//                 wallet.joyoryCash = joyoryCash - remaining;
//                 remaining = 0;
//             } else {
//                 remaining -= joyoryCash;
//                 wallet.joyoryCash = 0;
//             }

//             // 2. Deduct from rewardPoints (convert amount to points)
//             if (remaining > 0) {
//                 const pointsNeeded = remaining / pointsRate;
//                 wallet.rewardPoints = rewardPoints - pointsNeeded;
//                 remaining = 0;
//             }

//             // Calculate reward points used & discount value
//             let pointsUsed = 0;
//             let pointsDiscount = 0;

//             if (remaining === 0) {
//                 // Means we used reward points to cover some part
//                 const originalRewardPoints = rewardPoints;
//                 pointsUsed = originalRewardPoints - wallet.rewardPoints;
//                 pointsDiscount = pointsUsed * pointsRate;
//             }

//             // Add transaction
//             wallet.transactions.push({
//                 type: "PURCHASE",
//                 amount: orderAmount,
//                 mode: "ONLINE",
//                 description: `Wallet payment for order ${order._id}`,
//                 timestamp: new Date(),
//             });

//             order.pointsDiscount = pointsDiscount;
//             order.pointsUsed = pointsUsed;

//             order.giftCardDiscount = 0;
//             order.giftCardApplied = { code: null, amount: 0 };

//             await wallet.save({ session });

//             // Finalize order + stock
//             const txOrder = await processOrderStockAndFinalize(orderId, session, order.shippingAddress);

//             txOrder.paid = true;
//             txOrder.paymentStatus = "success";
//             txOrder.paymentMethod = "Wallet";
//             txOrder.transactionId = `WALLET-${Date.now()}`;
//             txOrder.orderType = "Online";
//             txOrder.orderStatus = "Processing";
//             txOrder.isDraft = false;

//             txOrder.tracking_history.push(
//                 { status: "Payment Successful", timestamp: new Date(), location: "Wallet" },
//                 { status: "Processing", timestamp: new Date(), location: "Store" }
//             );

//             // Payment document
//             const [paymentDoc] = await Payment.create([{
//                 order: txOrder._id,
//                 method: "Wallet",
//                 status: "Completed",
//                 transactionId: txOrder.transactionId,
//                 amount: txOrder.amount,
//                 isActive: true,
//             }], { session });

//             if (paymentDoc) txOrder.paymentId = paymentDoc._id;

//             // Clear cart
//             await User.updateOne(
//                 { _id: txOrder.user._id },
//                 { $set: { cart: [] } },
//                 { session }
//             );

//             await txOrder.save({ session });
//         });

//         // SHIPROCKET (after commit)
//         const finalOrder = await Order.findById(orderId).populate("user").populate("products.productId");

//         try {
//             const shiprocketRes = await createShiprocketOrder(finalOrder);

//             if (shiprocketRes?.shipmentDetails) {
//                 finalOrder.shipment = shiprocketRes.shipmentDetails;
//                 finalOrder.tracking_history.push({
//                     status: "Shipment Created",
//                     timestamp: new Date(),
//                     location: "Shiprocket"
//                 });
//                 await finalOrder.save();
//             } else {
//                 await Order.updateOne(
//                     { _id: finalOrder._id },
//                     {
//                         $push: {
//                             tracking_history: {
//                                 status: "Shipment Creation Failed",
//                                 timestamp: new Date(),
//                                 location: "Shiprocket"
//                             }
//                         }
//                     }
//                 );
//             }
//         } catch (err) {
//             await Order.updateOne(
//                 { _id: orderId },
//                 {
//                     $push: {
//                         tracking_history: {
//                             status: "Shipment Creation Failed",
//                             timestamp: new Date(),
//                             location: "Shiprocket"
//                         }
//                     }
//                 }
//             );
//         }

//         const updated = await Order.findById(orderId).populate("user").populate("products.productId");

//         return res.json({ success: true, message: "Wallet payment successful", order: updated });

//     } catch (err) {
//         return res.status(500).json({ success: false, message: err.message || "Internal error" });
//     } finally {
//         try { await session.endSession(); } catch { }
//     }
// };

// export const createGiftCardPayment = async (req, res) => {
//     const session = await mongoose.startSession();
//     try {
//         const { orderId, giftCardCode, giftCardPin, shippingAddress } = req.body;
//         if (!orderId || !giftCardCode || !giftCardPin || !shippingAddress) {
//             return res.status(400).json({ success: false, message: "orderId, giftCardCode, giftCardPin and shippingAddress required" });
//         }

//         // Validate minimum fields Shiprocket needs
//         const required = ["name", "phone", "addressLine1", "city", "state", "pincode"];
//         for (const field of required) {
//             if (!shippingAddress[field]) {
//                 return res.status(400).json({ success: false, message: `Shipping address missing: ${field}` });
//             }
//         }

//         await session.withTransaction(async () => {
//             const order = await Order.findById(orderId).session(session)
//                 .populate("user")
//                 .populate("products.productId");

//             if (!order) throw new Error("Order not found");
//             if (order.paid) throw new Error("Already paid");

//             // Normalize order payment fields
//             order.orderType = "Online";
//             order.paymentMethod = "GiftCard";

//             // Save corrected shipping address into order (in-session)
//             order.shippingAddress = {
//                 name: shippingAddress.name,
//                 email: shippingAddress.email || order.user.email,
//                 phone: shippingAddress.phone,
//                 addressLine1: shippingAddress.addressLine1,
//                 addressLine2: shippingAddress.addressLine2 || "",
//                 city: shippingAddress.city,
//                 state: shippingAddress.state,
//                 pincode: shippingAddress.pincode,
//                 country: shippingAddress.country || "India"
//             };
//             await order.save({ session });

//             // Fetch gift card in-session
//             const giftCard = await GiftCard.findOne({ code: giftCardCode, pin: giftCardPin }).session(session);
//             if (!giftCard) throw new Error("Invalid gift card");
//             if (Number(giftCard.balance) < Number(order.amount)) throw new Error("Insufficient gift card balance");

//             // Deduct balance
//             giftCard.balance = Number(giftCard.balance) - Number(order.amount);
//             giftCard.transactions = giftCard.transactions || [];
//             giftCard.transactions.push({
//                 type: "debit",
//                 amount: order.amount,
//                 description: `Payment for order ${order._id}`,
//                 timestamp: new Date(),
//             });

//             // Store Gift Card usage inside order
//             order.giftCardDiscount = Number(order.amount);
//             order.giftCardApplied = {
//                 code: giftCardCode,
//                 amount: Number(order.amount),
//                 templateId: giftCard.templateId
//             };

//             order.pointsDiscount = 0;  // Wallet points not used
//             order.pointsUsed = 0;


//             await giftCard.save({ session });

//             // Stock + finalize order (this updates order inside session)
//             const txOrder = await processOrderStockAndFinalize(orderId, session, order.shippingAddress);

//             // Mark order paid & set fields (in-session)
//             txOrder.paid = true;
//             txOrder.paymentStatus = "success";
//             txOrder.paymentMethod = "GiftCard";
//             txOrder.transactionId = `GIFTCARD-${Date.now()}`;
//             txOrder.orderType = "Online";
//             txOrder.orderStatus = "Processing";
//             txOrder.isDraft = false;


//             txOrder.tracking_history = txOrder.tracking_history || [];
//             txOrder.tracking_history.push(
//                 { status: "Payment Successful", timestamp: new Date(), location: "GiftCard" },
//                 { status: "Processing", timestamp: new Date(), location: "Store" }
//             );

//             // Create Payment doc inside transaction
//             const [paymentDoc] = await Payment.create([{
//                 order: txOrder._id,
//                 method: "GiftCard",
//                 status: "Completed",
//                 transactionId: txOrder.transactionId,
//                 amount: txOrder.amount,
//                 isActive: true,
//             }], { session });

//             if (paymentDoc) txOrder.paymentId = paymentDoc._id;

//             // Clear cart
//             if (txOrder.user && txOrder.user._id) {
//                 await User.updateOne({ _id: txOrder.user._id }, { $set: { cart: [] } }, { session });
//             }

//             await txOrder.save({ session });
//         }); // end transaction

//         // POST-COMMIT: Shiprocket
//         const finalOrder = await Order.findById(orderId).populate("user").populate("products.productId");
//         try {
//             const shiprocketRes = await createShiprocketOrder(finalOrder);

//             if (shiprocketRes?.shipmentDetails) {
//                 finalOrder.shipment = shiprocketRes.shipmentDetails;
//                 finalOrder.tracking_history = finalOrder.tracking_history || [];
//                 finalOrder.tracking_history.push({
//                     status: "Shipment Created",
//                     timestamp: new Date(),
//                     location: "Shiprocket"
//                 });
//                 await finalOrder.save();
//             } else {
//                 await Order.updateOne(
//                     { _id: finalOrder._id },
//                     { $push: { tracking_history: { status: "Shipment Creation Failed", timestamp: new Date(), location: "Shiprocket" } } }
//                 );
//             }
//         } catch (shipErr) {
//             console.error("⚠️ Shiprocket Error (GiftCard):", shipErr?.message || shipErr);
//             await Order.updateOne(
//                 { _id: finalOrder._id },
//                 { $push: { tracking_history: { status: "Shipment Creation Failed", timestamp: new Date(), location: "Shiprocket" } } }
//             );
//         }

//         const updated = await Order.findById(orderId).populate("user").populate("products.productId");
//         return res.json({ success: true, message: "Gift card payment successful", order: updated });

//     } catch (err) {
//         console.error("createGiftCardPayment Error:", err);
//         return res.status(500).json({ success: false, message: err.message || "Internal error" });
//     } finally {
//         await session.endSession().catch(() => { });
//     }
// };

// // export const cancelOrder = async (req, res) => {
// //     const session = await mongoose.startSession();
// //     try {
// //         const { orderId, reason } = req.body;
// //         const userId = req.user?._id;

// //         if (!orderId) return res.status(400).json({ success: false, message: "orderId is required" });

// //         const order = await Order.findById(orderId)
// //             .populate("products.productId")
// //             .populate("user");

// //         if (!order) return res.status(404).json({ success: false, message: "Order not found" });

// //         // ✅ Ensure only order owner or admin can cancel
// //         if (String(order.user._id) !== String(userId) && !req.user?.isAdmin)
// //             return res.status(403).json({ success: false, message: "Unauthorized" });

// //         // ✅ Prevent cancelling shipped or delivered orders
// //         const nonCancelableStatuses = ["Shipped", "Out for Delivery", "Delivered"];
// //         if (nonCancelableStatuses.includes(order.orderStatus))
// //             return res.status(400).json({ success: false, message: `Order cannot be cancelled once ${order.orderStatus}` });

// //         await session.withTransaction(async () => {
// //             order.orderStatus = "Cancelled";
// //             order.paymentStatus = order.paid ? "refund_requested" : "cancelled";

// //             order.cancellation = {
// //                 cancelledBy: userId,
// //                 reason,
// //                 requestedAt: new Date(),
// //                 allowed: true
// //             };

// //             if (order.paid) {
// //                 order.refund = {
// //                     amount: order.amount,
// //                     method: null,
// //                     status: "requested",
// //                     reason,
// //                     requestedBy: userId,
// //                     refundAudit: [
// //                         {
// //                             status: "requested",
// //                             changedBy: userId,
// //                             changedByModel: "User",
// //                             note: "Refund requested automatically after order cancellation"
// //                         }
// //                     ]
// //                 };
// //             }


// //             await order.save({ session });
// //         });

// //         // ✅ Available refund options if payment was made
// //         const refundMethodsAvailable = order.paid
// //             ? [
// //                 { method: "razorpay", label: "Original Payment Method (Razorpay)" },
// //                 { method: "wallet", label: "Add to Wallet" }
// //             ]
// //             : [];

// //         // ✅ Send email confirmation to user
// //         await sendEmail(
// //             order.user.email,
// //             "🛒 Order Cancellation Confirmation",
// //             `
// //             <p>Hi ${order.user.name},</p>
// //             <p>We have successfully received your cancellation request for Order <strong>#${order._id}</strong>.</p>
// //             <p><strong>Reason:</strong> ${reason || "No reason provided"}</p>

// //             ${order.paid
// //                 ? `
// //                     <p>Your payment was already completed, so a refund request has been initiated automatically.</p>
// //                     <p><strong>Next Step:</strong> Please select your preferred refund method:</p>
// //                     <ul>
// //                         <li>💳 <strong>Original Payment Method (Razorpay)</strong></li>
// //                         <li>💰 <strong>Joyory Wallet</strong></li>
// //                     </ul>
// //                     <p>Once you choose a refund method, our team will process it within a few business days.</p>
// //                     `
// //                 : `<p>Since your payment wasn’t completed, no refund is needed.</p>`
// //             }

// //             <p>Thank you for shopping with us. We hope to serve you again soon!</p>
// //             <p>Regards,<br/>Team Joyory Beauty</p>
// //             `
// //         );

// //         // ✅ Send response to user
// //         res.status(200).json({
// //             success: true,
// //             message: order.paid
// //                 ? "Order cancelled successfully. Refund initiated — please select your preferred refund method."
// //                 : "Order cancelled successfully.",
// //             refundMethodsAvailable
// //         });

// //     } catch (err) {
// //         console.error("❌ Cancel order error:", err);
// //         res.status(500).json({ success: false, message: "Cancel order failed" });
// //     } finally {
// //         await session.endSession();
// //     }
// // };
// export const cancelOrder = async (req, res) => {
//     const session = await mongoose.startSession();
//     try {
//         const { orderId, reason } = req.body;
//         const userId = req.user?._id;

//         if (!orderId)
//             return res.status(400).json({ success: false, message: "orderId is required" });

//         const order = await Order.findById(orderId)
//             .populate("products.productId")
//             .populate("user");

//         if (!order)
//             return res.status(404).json({ success: false, message: "Order not found" });

//         // 🔐 Ensure user owns order or admin
//         if (String(order.user._id) !== String(userId) && !req.user?.isAdmin)
//             return res.status(403).json({ success: false, message: "Unauthorized" });

//         // 🚫 Prevent double cancellation
//         if (order.orderStatus === "Cancelled")
//             return res.status(400).json({ success: false, message: "Order is already cancelled" });

//         // 🚫 Prevent cancelling after shipping
//         const nonCancelableStatuses = ["Shipped", "Out for Delivery", "Delivered"];
//         if (nonCancelableStatuses.includes(order.orderStatus))
//             return res.status(400).json({
//                 success: false,
//                 message: `Order cannot be cancelled once ${order.orderStatus}`,
//             });

//         await session.withTransaction(async () => {
//             order.orderStatus = "Cancelled";

//             // 🚀 Cancel in Shiprocket (only if order exists there)
//             if (order.shipment?.shiprocket_order_id) {
//                 try {
//                     await cancelShiprocketShipment(order.shipment.shiprocket_order_id);
//                     console.log("🚀 Shiprocket order cancelled");
//                 } catch (err) {
//                     console.error("❌ Shiprocket cancel failed:", err.response?.data || err.message);
//                 }
//             }

//             // 📌 Payment status
//             order.paymentStatus = order.paid ? "refund_requested" : "cancelled";

//             // 📝 Cancellation logs
//             order.cancellation = {
//                 cancelledBy: userId,
//                 reason,
//                 requestedAt: new Date(),
//                 allowed: true,
//             };

//             // 💰 Refund setup
//             if (order.paid) {
//                 order.refund = {
//                     amount: order.amount,
//                     method: null,
//                     status: "requested",
//                     reason,
//                     requestedBy: userId,
//                     refundAudit: [
//                         {
//                             status: "requested",
//                             changedBy: userId,
//                             changedByModel: "User",
//                             note: "Refund requested automatically after cancellation",
//                         },
//                     ],
//                 };
//             }

//             await order.save({ session });
//         });

//         const refundMethodsAvailable = order.paid
//             ? [
//                 { method: "razorpay", label: "Original Payment Method" },
//                 { method: "wallet", label: "Joyory Wallet" },
//             ]
//             : [];

//         return res.status(200).json({
//             success: true,
//             message: order.paid
//                 ? "Order cancelled. Refund initiated — choose refund method."
//                 : "Order cancelled successfully.",
//             refundMethodsAvailable,
//         });
//     } catch (err) {
//         console.error("❌ Cancel order error:", err);
//         res.status(500).json({ success: false, message: "Cancel order failed" });
//     } finally {
//         await session.endSession();
//     }
// };

// export const setRefundMethod = async (req, res) => {
//     const { orderId, method } = req.body;
//     const userId = req.user?._id;

//     const order = await Order.findById(orderId).populate("user");
//     if (!order) return res.status(404).json({ success: false, message: "Order not found" });

//     order.refund.method = method;
//     order.refund.status = "requested";

//     order.refund.refundAudit.push({
//         status: "requested",
//         changedBy: userId,
//         changedByModel: "User",
//         note: `User selected refund method: ${method}`
//     });
//     // Notify Admin (You can replace with your admin email or from DB)
//     await sendEmail(
//         process.env.ADMIN_EMAIL || "admin@joyorybeauty.com",
//         "⚠️ New Refund Request Received",
//         `
//   <p>Hello Admin,</p>
//   <p>A new refund request has been received.</p>

//   <ul>
//     <li><strong>Order ID:</strong> ${order._id}</li>
//     <li><strong>User:</strong> ${order.user.name} (${order.user.email})</li>
//     <li><strong>Amount:</strong> ₹${order.amount}</li>
//     <li><strong>Requested Method:</strong> ${method || "Not selected yet"}</li>
//     <li><strong>Reason:</strong> ${order.refund.reason || "No reason provided"}</li>
//   </ul>

//   <p>Please review this request in your Admin Dashboard.</p>
//   <p>— Joyory Refund System</p>
//   `
//     );


//     order.refund.requestedBy = userId;

//     await order.save();

//     // ✅ Send email to user
//     await sendEmail(
//         order.user.email,
//         "📩 Refund Request Received",
//         `
//         <p>Hi ${order.user.name},</p>
//         <p>We have received your refund request for Order <strong>#${order._id}</strong>.</p>

//         <p><strong>Selected Refund Method:</strong> ${method === "razorpay"
//             ? "Original Payment Method (Razorpay)"
//             : method === "wallet"
//                 ? "Joyory Wallet"
//                 : "Manual UPI"
//         }</p>

//         <p>Our team will review your request soon. You will receive another update once an admin approves it.</p>

//         <p>Regards,<br/>Team Joyory Beauty</p>
//         `
//     );

//     res.status(200).json({
//         success: true,
//         message: "Refund method submitted. Waiting for admin approval."
//     });
// };

// export const payForOrder = async (req, res) => {
//     try {
//         const order = req.order;

//         if (order.status === 'Completed') {
//             return res.status(400).json({ message: 'Order already Completed' });
//         }

//         // ✅ No stock manipulation

//         // ✅ Update order
//         order.status = 'Completed';
//         order.paymentDate = new Date();
//         await order.save();

//         // ✅ Affiliate payout
//         if (order.affiliate) {
//             const affiliate = await Affiliate.findById(order.affiliate);
//             if (affiliate) {
//                 const earning = order.amount * (affiliate.commissionRate || 0.15); // default 15%
//                 affiliate.totalEarnings += earning;
//                 affiliate.successfulOrders += 1;
//                 await affiliate.save();
//             }
//         }

//         // ✅ Create payment
//         const PaymentModel = (await import('../../../models/settings/payments/Payment.js')).default;

//         const payment = await PaymentModel.create({
//             order: order._id,
//             method: req.body.method,
//             status: 'Completed',
//             transactionId: req.body.transactionId || `TXN-${Date.now()}`,
//             amount: order.total || order.amount || 0,
//             cardHolderName: req.body.cardHolderName,
//             cardNumber: req.body.cardNumber ? encrypt(req.body.cardNumber) : undefined,
//             expiryDate: req.body.expiryDate
//         });

//         // ✅ Send response once only
//         res.status(200).json({
//             message: 'Payment successful',
//             orderId: order._id,
//             paymentId: payment._id
//         });

//         // ✅ Background affiliate update (no res.send here!)
//         for (const item of order.products) {
//             const product = await Product.findById(item.productId);
//             if (!product) continue;

//             const profit = (product.sellingPrice - product.buyingPrice) * item.quantity;

//             let activity = await AffiliateActivity.findOne({ product: product._id });
//             if (!activity) {
//                 activity = new AffiliateActivity({ product: product._id });
//             }

//             const prevRevenue = activity.revenue || 0;
//             const newRevenue = prevRevenue + (item.price * item.quantity);
//             const trend = prevRevenue === 0 ? 100 : (((newRevenue - prevRevenue) / prevRevenue) * 100).toFixed(1);

//             activity.conversions += item.quantity;
//             activity.revenue = newRevenue;
//             activity.trend = parseFloat(trend);
//             await activity.save();
//         }

//     } catch (err) {
//         // ✅ Only one response in case of error
//         return res.status(400).json({ message: "Payment failed", error: err.message });
//     }
// };

// export const createPayment = async (req, res) => {
//     try {
//         const {
//             order,
//             method,
//             status,
//             transactionId,
//             amount,
//             cardHolderName,
//             cardNumber,
//             expiryDate,
//             isActive
//         } = req.body;

//         let existingOrder = null;

//         if (mongoose.Types.ObjectId.isValid(order)) {
//             existingOrder = await Order.findById(order);
//         }

//         if (!existingOrder) {
//             existingOrder = await Order.findOne({ orderId: order });
//         }

//         if (!existingOrder) {
//             return res.status(400).json({ message: 'Invalid order ID' });
//         }

//         const encrypted = cardNumber ? encrypt(cardNumber) : undefined;

//         const payment = await Payment.create({
//             order: existingOrder._id,
//             method,
//             status,
//             transactionId,
//             amount,
//             cardHolderName,
//             cardNumber: encrypted,
//             expiryDate,
//             isActive
//         });

//         res.status(201).json({ message: 'Payment recorded', payment });
//     } catch (err) {
//         res.status(500).json({ message: 'Payment creation failed', error: err.message });
//     }
// };

// export const getMethodSummary = async (req, res) => {
//     try {
//         const summary = await Payment.aggregate([
//             {
//                 $lookup: {
//                     from: 'paymentmethods',
//                     localField: 'method',
//                     foreignField: '_id',
//                     as: 'methodDetails'
//                 }
//             },
//             { $unwind: '$methodDetails' },
//             {
//                 $group: {
//                     _id: '$methodDetails._id',
//                     name: { $first: '$methodDetails.name' },
//                     type: { $first: '$methodDetails.type' },
//                     transactions: { $sum: 1 },
//                     revenue: { $sum: '$amount' }
//                 }
//             }
//         ]);

//         res.status(200).json(summary);
//     } catch (err) {
//         res.status(500).json({ message: 'Summary error', error: err.message });
//     }
// };

// export const filterPaymentsByDate = async (req, res) => {
//     try {
//         const { range } = req.params;
//         let from = new Date();

//         if (range === '7d') from.setDate(from.getDate() - 7);
//         else if (range === '30d') from.setDate(from.getDate() - 30);
//         else if (range === '1y') from.setFullYear(from.getFullYear() - 1);
//         else return res.status(400).json({ message: 'Invalid range' });

//         const payments = await Payment.find({ createdAt: { $gte: from } })
//             .populate('order')
//             .populate('method');

//         res.status(200).json(payments);
//     } catch (err) {
//         res.status(500).json({ message: 'Filtering failed', error: err.message });
//     }
// };

// export const getDashboardSummary = async (req, res) => {
//     try {
//         const range = req.query.range || '7d';
//         const statusFilter = req.query.status || 'all';

//         const now = new Date();
//         const getDateOffset = (days) => {
//             const d = new Date();
//             d.setDate(d.getDate() - days);
//             return d;
//         };

//         let currentStart, prevStart;
//         if (range === '7d') {
//             currentStart = getDateOffset(7);
//             prevStart = getDateOffset(14);
//         } else if (range === '30d') {
//             currentStart = getDateOffset(30);
//             prevStart = getDateOffset(60);
//         } else if (range === '1y') {
//             currentStart = new Date(now.setFullYear(now.getFullYear() - 1));
//             prevStart = new Date(now.setFullYear(now.getFullYear() - 1));
//         } else {
//             return res.status(400).json({ message: 'Invalid range' });
//         }

//         const matchStatus = statusFilter !== 'all' ? { status: statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1).toLowerCase() } : {};

//         const [curr, prev] = await Promise.all([
//             Payment.aggregate([
//                 { $match: { ...matchStatus, createdAt: { $gte: currentStart } } },
//                 {
//                     $group: {
//                         _id: "$status",
//                         count: { $sum: 1 },
//                         revenue: { $sum: "$amount" }
//                     }
//                 }
//             ]),
//             Payment.aggregate([
//                 { $match: { ...matchStatus, createdAt: { $gte: prevStart, $lt: currentStart } } },
//                 {
//                     $group: {
//                         _id: "$status",
//                         count: { $sum: 1 },
//                         revenue: { $sum: "$amount" }
//                     }
//                 }
//             ])
//         ]);

//         const parseStats = (arr) =>
//             arr.reduce((acc, cur) => {
//                 acc[cur._id] = { count: cur.count, revenue: cur.revenue };
//                 return acc;
//             }, {});

//         const currStats = parseStats(curr);
//         const prevStats = parseStats(prev);

//         const computeChange = (currVal = 0, prevVal = 0) => {
//             if (prevVal === 0) return currVal > 0 ? 100 : 0;
//             return ((currVal - prevVal) / prevVal) * 100;
//         };

//         res.status(200).json({
//             revenue: {
//                 total: curr.reduce((sum, item) => sum + item.revenue, 0),
//                 change: computeChange(
//                     curr.reduce((sum, item) => sum + item.revenue, 0),
//                     prev.reduce((sum, item) => sum + item.revenue, 0)
//                 )
//             },
//             completed: {
//                 count: currStats.Completed?.count || 0,
//                 change: computeChange(currStats.Completed?.count, prevStats.Completed?.count)
//             },
//             pending: {
//                 count: currStats.Pending?.count || 0,
//                 change: computeChange(currStats.Pending?.count, prevStats.Pending?.count)
//             },
//             failed: {
//                 count: currStats.Failed?.count || 0,
//                 change: computeChange(currStats.Failed?.count, prevStats.Failed?.count)
//             }
//         });
//     } catch (err) {
//         res.status(500).json({ message: 'Dashboard summary failed', error: err.message });
//     }
// };

// export const getPaymentsFiltered = async (req, res) => {
//     try {
//         const { status, method } = req.query;

//         const filter = {};

//         if (status && status !== 'all') {
//             filter.status = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
//         }

//         if (method && mongoose.Types.ObjectId.isValid(method)) {
//             filter.method = new mongoose.Types.ObjectId(method);
//         }

//         const payments = await Payment.find(filter)
//             .populate('order', 'orderId customerName date amount')
//             .populate('method', 'name type')
//             .sort({ createdAt: -1 });

//         const formatted = payments.map(p => {
//             const decrypted = p.cardNumber ? "**** **** **** " + decrypt(p.cardNumber).slice(-4) : null;
//             return {
//                 _id: p._id,
//                 orderId: p.order?.orderId || 'N/A',
//                 customerName: p.order?.customerName || 'Unknown',
//                 date: p.order?.date?.toISOString().split('T')[0] || '',
//                 total: p.amount,
//                 method: p.method?.name || 'N/A',
//                 status: p.status,
//                 cardMasked: decrypted,
//                 action: "View Details"
//             };
//         });

//         res.status(200).json(formatted);
//     } catch (err) {
//         res.status(500).json({ message: 'Failed to fetch filtered payments', error: err.message });
//     }
// };

// // 🌐 Get all active payment methods with full config
// export const getActivePaymentMethods = async (req, res) => {
//     try {
//         // Fetch all active methods, including full config
//         const methods = await PaymentMethod.find({ isActive: true })
//             .select("_id name key type description order config") // include config for frontend
//             .sort({ order: 1 });

//         if (!methods.length) {
//             return res.status(404).json({ success: false, message: "No active payment methods found" });
//         }

//         res.json({ success: true, methods });
//     } catch (err) {
//         console.error("getActivePaymentMethods error:", err);
//         res.status(500).json({ success: false, message: "Server error" });
//     }
// };







//// the above code is perfect for sellers and all users and all , now for manual confirmation for orders in from admin side i does the changes at botttom,...



import "../../../config/env.js";

import validator from "validator";
import Payment from '../../../models/settings/payments/Payment.js';
import PaymentMethod from '../../../models/settings/payments/PaymentMethod.js';
import GiftCard from "../../../models/GiftCard.js";
import WalletConfig from "../../../models/WalletConfig.js";
import Order from '../../../models/Order.js';
import { encrypt, decrypt } from '../../../middlewares/utils/encryption.js';
import { createShiprocketOrder, cancelShiprocketShipment } from "../../../middlewares/services/shiprocket.js";
import { sendEmail } from "../../../middlewares/utils/emailService.js"; // ✅ assume you already have an email service
import Product from '../../../models/Product.js';
import AffiliateUser from "../../../models/AffiliateUser.js";
import AffiliateLink from "../../../models/AffiliateLink.js";
import AffiliateEarning from "../../../models/AffiliateEarning.js";
import AffiliatePayout from "../../../models/AffiliatePayout.js";
import AffiliateOrder from "../../../models/AffiliateOrder.js";
import mongoose from 'mongoose';
import User from '../../../models/User.js';
import Referral from '../../../models/Referral.js'; // ✅ You need to import this
import Razorpay from "razorpay";
import crypto from "crypto";
import axios from 'axios';
import {sendNotification} from '../../../controllers/sendNotification.js';
import cloudinary from '../../../middlewares/utils/cloudinary.js';
import { determineOccasions, craftMessage } from "../../../middlewares/services/ecardService.js";
import { buildEcardPdf } from "../../../middlewares/services/ecardPdf.js";
import { generateAndSaveInvoice } from "../../../middlewares/services/invoiceService.js";
import { splitOrderForPersistence } from '../../../middlewares/services/orderSplit.js'; // or correct path



export const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const razorpayAxios = axios.create({
    baseURL: "https://api.razorpay.com/v1",
    auth: {
        username: process.env.RAZORPAY_KEY_ID,
        password: process.env.RAZORPAY_KEY_SECRET,
    },
});

// Simple helper - adapt rules to your business
const isCodAllowed = ({ pincode, amount, user }) => {
    const MAX_COD_AMOUNT = 10000; // example limit
    const blockedPincodes = []; // fill from DB/config
    if (!pincode) return false;
    if (blockedPincodes.includes(String(pincode))) return false;
    if (amount > MAX_COD_AMOUNT) return false;
    // add any other business rules here (first order, fraud flags etc)
    return true;
};

export const clearUserCart = async (userId, session = null) => {
    if (!userId) return;

    const update = {
        $set: {
            cart: [],
            cartSubtotal: 0,
            cartDiscount: 0,
            cartUpdatedAt: new Date()
        }
    };

    if (session) {
        await User.updateOne({ _id: userId }, update).session(session);
    } else {
        await User.updateOne({ _id: userId }, update);
    }
};


export const isFraudulentCodOrder = async (order, user, shippingAddress) => {
    const { amount } = order || {};
    const userId = user?._id;
    const phone = user?.addresses?.[0]?.phone;
    const email = user?.email;

    // Basic email and phone validation
    if (!validator.isEmail(email || "")) {
        return { isFraud: true, reason: "Invalid or fake email address provided" };
    }
    if (!validator.isMobilePhone(phone || "", "en-IN")) {
        return { isFraud: true, reason: "Invalid phone number format" };
    }

    // Check high value COD
    if (amount > 10000) {
        return { isFraud: true, reason: "High-value COD orders need verification" };
    }

    // Past issues
    const pastRTOIssues = await Order.countDocuments({
        user: userId,
        orderStatus: { $in: ["Returned", "Cancelled by Seller"] },
        paymentMethod: "COD",
    });
    if (pastRTOIssues >= 1) {
        return { isFraud: true, reason: "Past COD returns/cancellations detected" };
    }

    // ✅ Validate shipping address pincode
    if (!shippingAddress?.pincode || String(shippingAddress.pincode).length !== 6) {
        return { isFraud: true, reason: "Incomplete or invalid pincode in the shipping address" };
    }

    return { isFraud: false };
};

export const processOrderStockAndFinalize = async (orderId, session, shippingAddress) => {
    const productIdsToRecalc = new Set();

    const txOrder = await Order.findById(orderId)
        .populate("products.productId")
        .populate("user")
        .session(session);

    if (!txOrder) throw new Error("Order vanished during transaction");

    for (const item of txOrder.products) {
        const product = await Product.findById(item.productId).session(session);
        if (!product) throw new Error(`Product not found: ${item.productId}`);

        const qty = Number(item.quantity || 0);
        if (qty <= 0) continue;

        if (item.variant?.sku) {
            const variant = product.variants.find(v => v.sku === item.variant.sku);
            if (!variant) throw new Error(`Variant not found: ${item.variant.sku}`);
            if (variant.stock < qty) throw new Error(`Not enough stock for ${variant.sku}`);

            variant.stock -= qty;
            variant.sales = (variant.sales || 0) + qty;

        } else {
            if (product.quantity < qty) throw new Error(`Not enough stock for ${product.name}`);
            product.quantity -= qty;
            product.sales = (product.sales || 0) + qty;
        }

        productIdsToRecalc.add(String(product._id));
        await product.save({ session });
    }

    // Don't change order status here. Payment flow controls it.
    if (shippingAddress) txOrder.shippingAddress = shippingAddress;

    await txOrder.save({ session });

    // recalc product stock levels
    const products = await Product.find({ _id: { $in: [...productIdsToRecalc] } }).session(session);

    for (const prod of products) {
        const totalQty = prod.variants?.length
            ? prod.variants.reduce((a, b) => a + (b.stock || 0), 0)
            : (prod.quantity || 0);

        prod.quantity = totalQty;

        if (totalQty <= 0) prod.status = "Out of stock";
        else if (prod.thresholdValue && totalQty < prod.thresholdValue) prod.status = "Low stock";
        else prod.status = "In-stock";

        await prod.save({ session });
    }

    return txOrder;
};

export const setPaymentMethod = async (req, res) => {
    try {
        const { orderId, paymentMethod } = req.body;

        if (!orderId || !paymentMethod)
            return res.status(400).json({ success: false, message: "orderId & paymentMethod required" });

        // ✅ Normalize input
        const normalized = paymentMethod.toUpperCase();

        const valid = ["COD", "ONLINE", "WALLET", "GIFTCARD"];
        if (!valid.includes(normalized))
            return res.status(400).json({ success: false, message: "Invalid payment method" });

        const order = await Order.findById(orderId);
        if (!order) return res.status(404).json({ message: "Order not found" });

        if (order.paid)
            return res.status(400).json({ message: "Order already paid" });

        // ✅ Normalize and FIX save value (schema uses "Online")
        if (normalized === "ONLINE") {
            order.orderType = "Online";       // ✅ correct
            order.paymentMethod = "Online";   // ✅ correct
        }

        if (normalized === "COD") {
            order.orderType = "COD";
            order.paymentMethod = "COD";
        }
        if (normalized === "WALLET") {
            order.orderType = "Online";
            order.paymentMethod = "Wallet";
        }
        if (normalized === "GIFTCARD") {
            order.orderType = "Online";
            order.paymentMethod = "GiftCard";
        }


        await order.save();  // ✅ now we save actual updated value

        // ✅ return flow
        return res.json({
            success: true,
            next: normalized === "COD" ? "COD_FLOW" : "ONLINE_FLOW",
            message:
                normalized === "COD"
                    ? "COD selected. Proceed to /createCodOrder"
                    : "Online payment selected. Proceed to /createRazorpayOrder",
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

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

        if (order.orderType !== "Online") {
            return res.status(400).json({
                success: false,
                message: "Payment method must be ONLINE before creating Razorpay order",
            });
        }

        const amountInPaise = Math.round(order.amount * 100);

        // Create Razorpay order
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

        // NOTE: DO NOT persist splitOrders or deduct stock here.
        // We'll let the admin confirm the order later and do atomic stock deduction.

        order.razorpayOrderId = razorpayOrder.id;
        order.paymentStatus = "pending";
        order.orderStatus = "Awaiting Payment";
        order.isDraft = false;   // <-- ADD THIS
        order.tracking_history = order.tracking_history || [];
        order.tracking_history.push({ status: "Awaiting Payment", timestamp: new Date(), location: "Store" });

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

export const verifyRazorpayPayment = async (req, res) => {
    try {
        const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature, shippingAddress } = req.body;

        if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ step: "VALIDATION", success: false, message: "❌ Missing required fields" });
        }

        const order = await Order.findById(orderId).populate("user").populate("products.productId");
        if (!order) return res.status(404).json({ step: "ORDER_FETCH", success: false, message: "Order not found" });
        if (order.paid) return res.status(200).json({ step: "IDEMPOTENT", success: true, message: "✅ Order already paid", order });

        const expectedSignature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ step: "SIGNATURE", success: false, message: "❌ Invalid signature" });
        }

        const rpPayment = await razorpay.payments.fetch(razorpay_payment_id);
        if (rpPayment.status !== "captured") {
            return res.status(400).json({ step: "PAYMENT_STATUS", success: false, message: `Payment not captured (status: ${rpPayment.status})` });
        }
        if ((rpPayment.amount / 100) !== Number(order.amount)) {
            return res.status(400).json({ step: "AMOUNT_CHECK", success: false, message: "❌ Amount mismatch" });
        }

        // MARK AS PAID but DO NOT change inventory or call Shiprocket.
        order.paid = true;
        order.paymentStatus = "success";
        order.paymentMethod = rpPayment.method || "Razorpay";
        order.transactionId = razorpay_payment_id;
        order.orderStatus = "Awaiting Admin Confirmation";
        order.isDraft = false;   // <-- ADD THIS
        order.adminConfirmed = false;
        /************************************
 *  AFFILIATE SYSTEM TRIGGER POINT  *
 ************************************/
        if (order.affiliate?.slug && !order.affiliate?.applied) {

            // 1️⃣ Find affiliate link using slug
            const affiliateLink = await AffiliateLink.findOne({ slug: order.affiliate.slug });

            if (affiliateLink) {

                // 2️⃣ Find affiliate user from affiliateLink
                const affiliateUser = await AffiliateUser.findById(affiliateLink.affiliateUser);

                if (affiliateUser) {

                    // 3️⃣ Commission calculation
                    const commissionRate = affiliateUser.commissionRate || 10; // default 10%
                    const commissionAmount = Math.round((order.amount * commissionRate) / 100);

                    // 4️⃣ Create earning record
                    await AffiliateEarning.create({
                        affiliateUser: affiliateUser._id,
                        affiliateLink: affiliateLink._id,

                        orderId: order._id,
                        orderNumber: order.orderNumber || order.orderId || "-",

                        orderAmount: order.amount,
                        commission: commissionAmount,
                        status: "pending"
                    });

                    // 4B️⃣ Create affiliate order (IMPORTANT)
                    await AffiliateOrder.create({
                        affiliateUser: affiliateUser._id,
                        affiliateLink: affiliateLink._id,

                        orderId: order._id,
                        commission: commissionAmount,
                        orderValue: order.amount,
                        status: "pending"
                    });

                    // 5️⃣ Update ORDER affiliate section
                    order.affiliate.applied = true;
                    order.affiliate.affiliateUser = affiliateUser._id;
                    order.affiliate.affiliateLink = affiliateLink._id;

                    // 6️⃣ Add pending commission to affiliate user
                    affiliateUser.pendingCommission =
                        (affiliateUser.pendingCommission || 0) + commissionAmount;

                    await affiliateUser.save();
                }
            }
        }



        if (shippingAddress) order.shippingAddress = shippingAddress;
        order.tracking_history = order.tracking_history || [];
        order.tracking_history.push({ status: "Payment Captured", timestamp: new Date(), location: "Razorpay" });

        // Create Payment doc (non-transactional here)
        try {
            await Payment.create({
                order: order._id,
                method: rpPayment.method,
                status: "Completed",
                transactionId: razorpay_payment_id,
                amount: order.amount,
                cardHolderName: rpPayment.card?.name,
                cardNumber: rpPayment.card?.last4,
                expiryDate: rpPayment.card ? `${rpPayment.card.expiry_month}/${rpPayment.card.expiry_year}` : undefined,
                isActive: true,
            });
        } catch (e) {
            console.warn("Payment doc creation failed:", e);
        }

        await order.save();
        // 🔔 Notify Admin: New Prepaid Order
        await sendNotification({
            type: "order_paid",
            message: `New prepaid order #${order.orderNumber || order._id} placed`,
            priority: "high",
            meta: {
                orderId: order._id,
                userId: order.user._id,
                paymentId: razorpay_payment_id
            }
        });

        await clearUserCart(order.user._id);


        try {
            await sendEmail(
                order.user.email,
                `Payment Successful! Order #${order.orderNumber || order._id} Confirmed`,
                `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { padding: 30px; background: #f9f9f9; }
                .order-card { background: white; padding: 25px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin: 20px 0; }
                .status-badge { background: #e8f5e9; color: #2e7d32; padding: 8px 16px; border-radius: 20px; display: inline-block; font-weight: bold; }
                .btn { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
                .icon { color: #4CAF50; font-size: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Payment Successful!</h1>
                    <p>Thank you for your order with Joyory Beauty</p>
                </div>
                <div class="content">
                    <h2>Hi ${order.user.name},</h2>
                    <p>We've successfully received your payment of <strong>₹${order.amount}</strong> for your order.</p>
                    
                    <div class="order-card">
                        <h3>📦 Order Details</h3>
                        <p><strong>Order ID:</strong> #${order.orderNumber || order._id}</p>
                        <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>
                        <p><strong>Transaction ID:</strong> ${order.transactionId}</p>
                        <p><strong>Date:</strong> ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        
                        <div style="margin: 20px 0;">
                            <span class="status-badge">⏳ Awaiting Admin Confirmation</span>
                            <p style="margin-top: 10px; color: #666;">Our team will verify stock availability and confirm your order within 24 hours.</p>
                        </div>
                    </div>
                    
                    <p>🔔 <strong>What's Next?</strong></p>
                    <ul>
                        <li>We'll send confirmation once order is verified</li>
                        <li>You'll receive tracking details after dispatch</li>
                        <li>Estimated delivery: 5-7 business days</li>
                    </ul>
                    
                    <div style="text-align: center;">
                        <a href="${process.env.FRONTEND_URL}/orders/${order._id}" class="btn">View Order Details</a>
                    </div>
                    
                    <p style="margin-top: 30px;">Need help? <a href="mailto:support@joyorybeauty.com">Contact our support team</a></p>
                </div>
                <div class="footer">
                    <p>Joyory Beauty Pvt. Ltd.<br>
                    ${process.env.COMPANY_ADDRESS || ''}</p>
                    <p>📞 ${process.env.COMPANY_PHONE || 'Customer Care'}</p>
                </div>
            </div>
        </body>
        </html>
        `
            );
        } catch (e) { console.warn("Email failed:", e); }

        return res.status(200).json({ step: "CAPTURED", success: true, message: "Payment captured. Awaiting admin confirmation.", order });
    } catch (err) {
        console.error("🔥 verifyRazorpayPayment Error:", err);
        return res.status(500).json({ step: "FATAL", success: false, message: "Unexpected server error during payment verification", error: (err && err.message) || err });
    }
};

export const createCodOrder = async (req, res) => {
    try {
        const { orderId } = req.body;
        const userId = req.user?._id;

        if (!orderId)
            return res.status(400).json({ success: false, message: "orderId is required" });

        const order = await Order.findById(orderId)
            .populate("user")
            .populate("products.productId");

        if (!order) return res.status(404).json({ success: false, message: "Order not found" });
        if (order.paid) return res.status(400).json({ success: false, message: "Already paid" });
        if (order.orderType !== "COD")
            return res.status(400).json({ success: false, message: "Invalid order type" });

        // Check if fraud flagged
        const fraudCheck = await isFraudulentCodOrder(order, order.user, req.body.shippingAddress);
        if (fraudCheck.isFraud) {
            // 🔥 Notify Admin: COD Fraud Attempt
            await sendNotification({
                type: "cod_fraud",
                message: `⚠️ COD Fraud Attempt by user for order #${order.orderNumber || order._id}`,
                priority: "critical",
                meta: {
                    orderId: order._id,
                    userId: order.user._id,
                    reason: fraudCheck.reason
                }
            });

            // Send warning email to the user
            await sendEmail(
                order.user.email,
                `Important: Your COD Order #${order.orderNumber || order._id} Requires Attention`,
                `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { padding: 30px; background: #f9f9f9; }
            .alert-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 20px 0; border-radius: 5px; }
            .btn-primary { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 5px; }
            .btn-secondary { display: inline-block; padding: 12px 30px; background: #6c757d; color: white; text-decoration: none; border-radius: 5px; margin-left: 10px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>⚠️ COD Order Update</h1>
                <p>Action Required for Order #${order.orderNumber || order._id}</p>
            </div>
            <div class="content">
                <h2>Hi ${order.user.name},</h2>
                <p>We noticed your Cash on Delivery request for order <strong>#${order.orderNumber || order._id}</strong>.</p>
                
                <div class="alert-box">
                    <h3 style="color: #856404;">🛑 Payment Method Update Required</h3>
                    <p>Due to security measures, COD is not available for this order.</p>
                    <p><strong>Reason:</strong> ${fraudCheck.reason}</p>
                </div>
                
                <div style="background: white; padding: 25px; border-radius: 10px; margin: 20px 0;">
                    <h3>🎁 Switch to Prepaid & Get Benefits!</h3>
                    <p>Complete your order with prepaid payment and enjoy:</p>
                    <ul>
                        <li>✅ Faster processing & dispatch</li>
                        <li>✅ Additional 5% discount on your order</li>
                        <li>✅ Priority customer support</li>
                        <li>✅ Guaranteed delivery slot</li>
                    </ul>
                </div>
                
                <p><strong>Order Amount:</strong> ₹${order.amount}</p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${process.env.FRONTEND_URL}/checkout/payment?orderId=${order._id}" class="btn-primary">Switch to Prepaid Payment</a>
                    <a href="${process.env.FRONTEND_URL}/help" class="btn-secondary">Need Help?</a>
                </div>
                
                <p style="color: #666;">Your order will be reserved for the next 2 hours. Complete payment to proceed with delivery.</p>
            </div>
            <div class="footer">
                <p>For immediate assistance, call us at ${process.env.COMPANY_PHONE || 'our helpline'}</p>
                <p>Joyory Beauty - Safe & Secure Shopping</p>
            </div>
        </div>
    </body>
    </html>
    `
            );

            return res.status(400).json({
                success: false,
                step: "DENIED_FRAUD_RISK",
                message: "COD not available: " + fraudCheck.reason,
            });
        }

        return res.status(200).json({
            success: true,
            step: "STEP_1_VALIDATED",
            message: "COD validation passed. Ready for confirmation.",
            orderSummary: {
                orderId: order._id,
                amount: order.amount,
                productsCount: order.products?.length || 0,
                customer: order.user?.name || "Guest",
            },
        });
    } catch (err) {
        console.error("🔥 COD Step1 Error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

export const confirmCodOrder = async (req, res) => {
    try {
        const { orderId, shippingAddress } = req.body;
        const userId = req.user?._id;

        if (!orderId || !userId)
            return res.status(400).json({ success: false, message: "Invalid request" });

        const order = await Order.findById(orderId)
            .populate("user")
            .populate("products.productId");

        if (!order) return res.status(404).json({ success: false, message: "Order not found" });
        if (order.paid || order.orderStatus === "Cancelled")
            return res.status(400).json({ success: false, message: "Order cannot be confirmed" });

        // fraud check
        const fraudCheck = await isFraudulentCodOrder(order, order.user, shippingAddress);
        if (fraudCheck.isFraud) {
            // 🔥 Notify Admin: COD Fraud Attempt
            await sendNotification({
                type: "cod_fraud",
                message: `⚠️ COD Fraud Attempt by user for order #${order.orderNumber || order._id}`,
                priority: "critical",
                meta: {
                    orderId: order._id,
                    userId: order.user._id,
                    reason: fraudCheck.reason
                }
            });
            await sendEmail(
                order.user.email,
                `Important: Your COD Order #${order.orderNumber || order._id} Requires Attention`,
                `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { padding: 30px; background: #f9f9f9; }
            .alert-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 20px 0; border-radius: 5px; }
            .btn-primary { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 5px; }
            .btn-secondary { display: inline-block; padding: 12px 30px; background: #6c757d; color: white; text-decoration: none; border-radius: 5px; margin-left: 10px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>⚠️ COD Order Update</h1>
                <p>Action Required for Order #${order.orderNumber || order._id}</p>
            </div>
            <div class="content">
                <h2>Hi ${order.user.name},</h2>
                <p>We noticed your Cash on Delivery request for order <strong>#${order.orderNumber || order._id}</strong>.</p>
                
                <div class="alert-box">
                    <h3 style="color: #856404;">🛑 Payment Method Update Required</h3>
                    <p>Due to security measures, COD is not available for this order.</p>
                    <p><strong>Reason:</strong> ${fraudCheck.reason}</p>
                </div>
                
                <div style="background: white; padding: 25px; border-radius: 10px; margin: 20px 0;">
                    <h3>🎁 Switch to Prepaid & Get Benefits!</h3>
                    <p>Complete your order with prepaid payment and enjoy:</p>
                    <ul>
                        <li>✅ Faster processing & dispatch</li>
                        <li>✅ Additional 5% discount on your order</li>
                        <li>✅ Priority customer support</li>
                        <li>✅ Guaranteed delivery slot</li>
                    </ul>
                </div>
                
                <p><strong>Order Amount:</strong> ₹${order.amount}</p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${process.env.FRONTEND_URL}/checkout/payment?orderId=${order._id}" class="btn-primary">Switch to Prepaid Payment</a>
                    <a href="${process.env.FRONTEND_URL}/help" class="btn-secondary">Need Help?</a>
                </div>
                
                <p style="color: #666;">Your order will be reserved for the next 2 hours. Complete payment to proceed with delivery.</p>
            </div>
            <div class="footer">
                <p>For immediate assistance, call us at ${process.env.COMPANY_PHONE || 'our helpline'}</p>
                <p>Joyory Beauty - Safe & Secure Shopping</p>
            </div>
        </div>
    </body>
    </html>
    `
            );
            return res.status(400).json({ success: false, message: "COD denied: " + fraudCheck.reason });
        }

        // COD eligibility
        const deliveryPincode = shippingAddress?.pincode || order.shippingAddress?.pincode;
        if (!isCodAllowed({ pincode: deliveryPincode, amount: order.amount })) {
            return res.status(400).json({ success: false, message: "COD not available for this location/amount" });
        }

        // **MATCH Razorpay logic**
        if (shippingAddress) order.shippingAddress = shippingAddress;

        order.orderStatus = "Awaiting Admin Confirmation";
        order.adminConfirmed = false;
        order.paid = false;
        order.paymentMethod = "COD";
        order.isDraft = false;   // <-- ADD THIS

        /************************************
     *  AFFILIATE SYSTEM TRIGGER POINT  *
     ************************************/
        if (order.affiliate?.slug && !order.affiliate?.applied) {

            // 1️⃣ Find affiliate link using slug
            const affiliateLink = await AffiliateLink.findOne({ slug: order.affiliate.slug });

            if (affiliateLink) {

                // 2️⃣ Find affiliate user from affiliateLink
                const affiliateUser = await AffiliateUser.findById(affiliateLink.affiliateUser);

                if (affiliateUser) {

                    // 3️⃣ Commission calculation
                    const commissionRate = affiliateUser.commissionRate || 10; // default 10%
                    const commissionAmount = Math.round((order.amount * commissionRate) / 100);

                    // 4️⃣ Create earning record
                    await AffiliateEarning.create({
                        affiliateUser: affiliateUser._id,
                        affiliateLink: affiliateLink._id,

                        orderId: order._id,
                        orderNumber: order.orderNumber || order.orderId || "-",

                        orderAmount: order.amount,
                        commission: commissionAmount,
                        status: "pending"
                    });

                    // 4B️⃣ Create affiliate order (IMPORTANT)
                    await AffiliateOrder.create({
                        affiliateUser: affiliateUser._id,
                        affiliateLink: affiliateLink._id,

                        orderId: order._id,
                        commission: commissionAmount,
                        orderValue: order.amount,
                        status: "pending"
                    });

                    // 5️⃣ Update ORDER affiliate section
                    order.affiliate.applied = true;
                    order.affiliate.affiliateUser = affiliateUser._id;
                    order.affiliate.affiliateLink = affiliateLink._id;

                    // 6️⃣ Add pending commission to affiliate user
                    affiliateUser.pendingCommission =
                        (affiliateUser.pendingCommission || 0) + commissionAmount;

                    await affiliateUser.save();
                }
            }
        }


        order.tracking_history = order.tracking_history || [];

        order.tracking_history.push({
            status: "COD Requested",
            timestamp: new Date(),
            location: "Customer"
        });

        await order.save();
        // 🔔 Notify Admin: New COD Order
        await sendNotification({
            type: "order_cod",
            message: `New COD order #${order.orderNumber || order._id} placed`,
            priority: "high",
            meta: {
                orderId: order._id,
                userId: order.user._id
            }
        });
        await clearUserCart(order.user._id);

        await sendEmail(
            order.user.email,
            `COD Order #${order.orderNumber || order._id} Received Successfully!`,
            `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { padding: 30px; background: #f9f9f9; }
            .order-summary { background: white; padding: 25px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            .cod-badge { background: #fff3e0; color: #e65100; padding: 8px 16px; border-radius: 20px; display: inline-block; font-weight: bold; border: 2px dashed #ff9800; }
            .steps { display: flex; justify-content: space-between; margin: 30px 0; }
            .step { text-align: center; flex: 1; padding: 15px; }
            .step-number { background: #4CAF50; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>📦 COD Order Confirmed!</h1>
                <p>Pay when your order arrives at your doorstep</p>
            </div>
            <div class="content">
                <h2>Hi ${order.user.name},</h2>
                <p>Great news! Your Cash on Delivery order has been received successfully.</p>
                
                <div class="order-summary">
                    <h3>Order Summary</h3>
                    <p><strong>Order ID:</strong> #${order.orderNumber || order._id}</p>
                    <p><strong>Order Amount:</strong> ₹${order.amount} (Pay on Delivery)</p>
                    <p><strong>Items:</strong> ${order.products?.length || 0} product(s)</p>
                    
                    <div style="margin: 20px 0;">
                        <span class="cod-badge">💰 Cash on Delivery</span>
                    </div>
                    
                    <p><strong>Delivery Address:</strong><br>
                    ${order.shippingAddress?.name || ''}<br>
                    ${order.shippingAddress?.addressLine1 || ''}<br>
                    ${order.shippingAddress?.city || ''}, ${order.shippingAddress?.state || ''} - ${order.shippingAddress?.pincode || ''}
                    </p>
                </div>
                
                <h3 style="margin-top: 30px;">📋 Next Steps</h3>
                <div class="steps">
                    <div class="step">
                        <div class="step-number">1</div>
                        <strong>Order Verification</strong>
                        <p>Our team verifies stock availability</p>
                    </div>
                    <div class="step">
                        <div class="step-number">2</div>
                        <strong>Dispatch</strong>
                        <p>Order packed & shipped</p>
                    </div>
                    <div class="step">
                        <div class="step-number">3</div>
                        <strong>Delivery</strong>
                        <p>Pay when order arrives</p>
                    </div>
                </div>
                
                <div style="background: #e8f5e9; padding: 20px; border-radius: 10px; margin: 20px 0;">
                    <h4>💡 Important Notes:</h4>
                    <ul>
                        <li>Please keep exact change ready for delivery</li>
                        <li>Our delivery executive will call before arrival</li>
                        <li>Check products before making payment</li>
                        <li>Contact us within 48 hours for any issues</li>
                    </ul>
                </div>
                
                <div style="text-align: center; margin-top: 30px;">
                    <a href="${process.env.FRONTEND_URL}/orders/${order._id}" style="display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; text-decoration: none; border-radius: 5px;">Track Your Order</a>
                </div>
            </div>
            <div class="footer">
                <p>Questions? Email us at support@joyorybeauty.com or call ${process.env.COMPANY_PHONE || ''}</p>
                <p>© ${new Date().getFullYear()} Joyory Beauty. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    `
        );

        return res.status(200).json({
            success: true,
            message: "COD request received. Awaiting admin confirmation.",
            order
        });

    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

export const createWalletPayment = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const { orderId, shippingAddress } = req.body;

        if (!orderId || !shippingAddress)
            return res.status(400).json({ success: false, message: "orderId and shippingAddress are required" });

        const required = ["name", "phone", "addressLine1", "city", "state", "pincode"];
        for (const field of required) {
            if (!shippingAddress[field]) {
                return res.status(400).json({ success: false, message: `Shipping address missing: ${field}` });
            }
        }

        await session.withTransaction(async () => {
            const order = await Order.findById(orderId)
                .session(session)
                .populate("user")
                .populate("products.productId");

            if (!order) throw new Error("Order not found");
            if (order.paid) throw new Error("Already paid");

            order.shippingAddress = shippingAddress;
            order.orderType = "Online";
            order.paymentMethod = "Wallet";

            const Wallet = mongoose.model("Wallet");
            let wallet = await Wallet.findOne({ user: order.user._id }).session(session);
            if (!wallet) {
                wallet = await Wallet.create([{ user: order.user._id, joyoryCash: 0, rewardPoints: 0, transactions: [] }], { session }).then(d => d[0]);
            }

            const config = await WalletConfig.findOne().session(session);
            const pointsRate = config?.pointsToCurrencyRate ?? 0.1;

            const joyoryCash = Number(wallet.joyoryCash) || 0;
            const rewardPoints = Number(wallet.rewardPoints) || 0;
            const pointsValue = rewardPoints * pointsRate;

            const walletBalance = joyoryCash + pointsValue;
            const orderAmount = Number(order.amount);

            if (walletBalance < orderAmount) throw new Error("Not enough wallet balance");

            let remaining = orderAmount;

            if (joyoryCash >= remaining) {
                wallet.joyoryCash = joyoryCash - remaining;
                remaining = 0;
            } else {
                remaining -= joyoryCash;
                wallet.joyoryCash = 0;
            }

            if (remaining > 0) {
                const pointsNeeded = remaining / pointsRate;
                wallet.rewardPoints = rewardPoints - pointsNeeded;
                remaining = 0;
            }

            const pointsUsed = rewardPoints - wallet.rewardPoints;
            const pointsDiscount = pointsUsed * pointsRate;

            wallet.transactions.push({
                type: "PURCHASE",
                amount: orderAmount,
                mode: "ONLINE",
                description: `Wallet payment for order ${order._id}`,
                timestamp: new Date(),
            });

            order.pointsDiscount = pointsDiscount;
            order.pointsUsed = pointsUsed;

            await wallet.save({ session });

            order.paid = true;
            order.paymentStatus = "success";
            order.orderStatus = "Awaiting Admin Confirmation";
            order.isDraft = false;   // <-- ADD THIS
            order.adminConfirmed = false;

            /************************************
       *  AFFILIATE SYSTEM TRIGGER POINT  *
       ************************************/
            if (order.affiliate?.slug && !order.affiliate?.applied) {

                // 1️⃣ Find affiliate link using slug
                const affiliateLink = await AffiliateLink.findOne({ slug: order.affiliate.slug });

                if (affiliateLink) {

                    // 2️⃣ Find affiliate user from affiliateLink
                    const affiliateUser = await AffiliateUser.findById(affiliateLink.affiliateUser);

                    if (affiliateUser) {

                        // 3️⃣ Commission calculation
                        const commissionRate = affiliateUser.commissionRate || 10; // default 10%
                        const commissionAmount = Math.round((order.amount * commissionRate) / 100);

                        // 4️⃣ Create earning record
                        await AffiliateEarning.create({
                            affiliateUser: affiliateUser._id,
                            affiliateLink: affiliateLink._id,

                            orderId: order._id,
                            orderNumber: order.orderNumber || order.orderId || "-",

                            orderAmount: order.amount,
                            commission: commissionAmount,
                            status: "pending"
                        });

                        // 4B️⃣ Create affiliate order (IMPORTANT)
                        await AffiliateOrder.create({
                            affiliateUser: affiliateUser._id,
                            affiliateLink: affiliateLink._id,

                            orderId: order._id,
                            commission: commissionAmount,
                            orderValue: order.amount,
                            status: "pending"
                        });

                        // 5️⃣ Update ORDER affiliate section
                        order.affiliate.applied = true;
                        order.affiliate.affiliateUser = affiliateUser._id;
                        order.affiliate.affiliateLink = affiliateLink._id;

                        // 6️⃣ Add pending commission to affiliate user
                        affiliateUser.pendingCommission =
                            (affiliateUser.pendingCommission || 0) + commissionAmount;

                        await affiliateUser.save();
                    }
                }
            }


            order.transactionId = `WALLET-${Date.now()}`;

            order.tracking_history = order.tracking_history || [];
            order.tracking_history.push({
                status: "Payment Successful",
                timestamp: new Date(),
                location: "Wallet"
            });
            order.tracking_history.push({
                status: "Awaiting Admin Confirmation",
                timestamp: new Date(),
                location: "Store"
            });

            const [paymentDoc] = await Payment.create([{
                order: order._id,
                method: "Wallet",
                status: "Completed",
                transactionId: order.transactionId,
                amount: order.amount,
                isActive: true,
            }], { session });

            if (paymentDoc) order.paymentId = paymentDoc._id;

            await order.save({ session });

            // 🔔 Notify Admin: New Wallet Payment Order
            await sendNotification({
                type: "order_wallet",
                message: `New Wallet-paid order #${order.orderNumber || order._id} placed`,
                priority: "high",
                meta: {
                    orderId: order._id,
                    userId: order.user._id,
                    amount: order.amount,
                    transactionId: order.transactionId
                }
            });


            await clearUserCart(order.user._id, session);

        });

        const updated = await Order.findById(orderId)
            .populate("user")
            .populate("products.productId");

        let invoice;
        try {
            invoice = await generateAndSaveInvoice(updated);

            // OPTIONAL: store invoiceId in order schema for linkage
            updated.invoice = invoice._id;
            await updated.save();
        } catch (e) {
            console.warn("Invoice generation failed:", e.message);
        }


        await sendEmail(
            updated.user.email,
            `🎯 Wallet Payment Successful! Order #${updated.orderNumber || updated._id}`,
            `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #9c27b0 0%, #673ab7 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { padding: 30px; background: #f9f9f9; }
            .wallet-card { background: white; padding: 25px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin: 20px 0; }
            .points-used { background: #e1bee7; color: #4a148c; padding: 10px 20px; border-radius: 10px; margin: 15px 0; }
            .benefits { background: #f3e5f5; padding: 20px; border-radius: 10px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>💳 Wallet Payment Complete!</h1>
                <p>You've successfully used your Joyory Beauty Wallet</p>
            </div>
            <div class="content">
                <h2>Hi ${updated.user.name},</h2>
                <p>Smart choice! Your wallet payment for order <strong>#${updated.orderNumber || updated._id}</strong> has been processed successfully.</p>
                
                <div class="wallet-card">
                    <h3>💰 Payment Summary</h3>
                    <p><strong>Total Order Value:</strong> ₹${updated.amount}</p>
                    <p><strong>Payment Method:</strong> Joyory Wallet</p>
                    <p><strong>Transaction ID:</strong> ${updated.transactionId}</p>
                    
                    ${updated.pointsUsed > 0 ? `
                    <div class="points-used">
                        <p>🎁 <strong>Reward Points Used:</strong> ${updated.pointsUsed} points</p>
                        <p>💰 <strong>Points Value:</strong> ₹${updated.pointsDiscount || 0}</p>
                    </div>
                    ` : ''}
                    
                    <p style="color: #4CAF50; font-weight: bold;">✅ Payment Status: Completed</p>
                </div>
                
                <div class="benefits">
                    <h4>🌟 Wallet Benefits You Enjoyed:</h4>
                    <ul>
                        <li>Instant payment processing</li>
                        <li>No additional payment charges</li>
                        <li>Secure transaction with rewards</li>
                        <li>Faster order processing</li>
                    </ul>
                </div>
                
                <div style="background: #e8f5e9; padding: 20px; border-radius: 10px; margin: 20px 0;">
                    <h4>📈 Your Wallet Status:</h4>
                    <p>Keep earning rewards on every purchase! Visit your wallet to check balance and rewards.</p>
                    <a href="${process.env.FRONTEND_URL}/account/wallet" style="color: #9c27b0; font-weight: bold;">View Wallet Balance →</a>
                </div>
                
                <div style="text-align: center;">
                    <a href="${process.env.FRONTEND_URL}/orders/${updated._id}" style="display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #9c27b0 0%, #673ab7 100%); color: white; text-decoration: none; border-radius: 5px;">View Order Details</a>
                </div>
            </div>
            <div class="footer">
                <p>Thank you for using Joyory Beauty Wallet!</p>
                <p>Earn 5% cashback on every prepaid order</p>
            </div>
        </div>
    </body>
    </html>
    `
        );

        return res.json({
            success: true,
            message: "Wallet payment successful. Awaiting admin confirmation.",
            order: updated
        });

    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    } finally {
        await session.endSession().catch(() => { });
    }
};

export const createGiftCardPayment = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const { orderId, giftCardCode, giftCardPin, shippingAddress } = req.body;

        if (!orderId || !giftCardCode || !giftCardPin || !shippingAddress)
            return res.status(400).json({ success: false, message: "orderId, giftCardCode, giftCardPin and shippingAddress required" });

        const required = ["name", "phone", "addressLine1", "city", "state", "pincode"];
        for (const field of required) {
            if (!shippingAddress[field]) {
                return res.status(400).json({ success: false, message: `Shipping address missing: ${field}` });
            }
        }

        await session.withTransaction(async () => {
            const order = await Order.findById(orderId)
                .session(session)
                .populate("user")
                .populate("products.productId");

            if (!order) throw new Error("Order not found");
            if (order.paid) throw new Error("Already paid");

            order.shippingAddress = shippingAddress;
            order.orderType = "Online";
            order.paymentMethod = "GiftCard";

            const giftCard = await GiftCard.findOne({ code: giftCardCode, pin: giftCardPin }).session(session);
            if (!giftCard) throw new Error("Invalid gift card");
            if (Number(giftCard.balance) < Number(order.amount)) throw new Error("Insufficient gift card balance");

            giftCard.balance -= Number(order.amount);
            giftCard.transactions.push({
                type: "debit",
                amount: order.amount,
                description: `Payment for order ${order._id}`,
                timestamp: new Date(),
            });

            order.giftCardDiscount = Number(order.amount);
            order.giftCardApplied = {
                code: giftCardCode,
                amount: Number(order.amount),
                templateId: giftCard.templateId
            };
            order.pointsDiscount = 0;
            order.pointsUsed = 0;

            await giftCard.save({ session });

            order.paid = true;
            order.paymentStatus = "success";
            order.isDraft = false;   // <-- ADD THIS
            order.adminConfirmed = false;
            order.orderStatus = "Awaiting Admin Confirmation";

            /************************************
    *  AFFILIATE SYSTEM TRIGGER POINT  *
    ************************************/
            if (order.affiliate?.slug && !order.affiliate?.applied) {

                // 1️⃣ Find affiliate link using slug
                const affiliateLink = await AffiliateLink.findOne({ slug: order.affiliate.slug });

                if (affiliateLink) {

                    // 2️⃣ Find affiliate user from affiliateLink
                    const affiliateUser = await AffiliateUser.findById(affiliateLink.affiliateUser);

                    if (affiliateUser) {

                        // 3️⃣ Commission calculation
                        const commissionRate = affiliateUser.commissionRate || 10; // default 10%
                        const commissionAmount = Math.round((order.amount * commissionRate) / 100);

                        // 4️⃣ Create earning record
                        await AffiliateEarning.create({
                            affiliateUser: affiliateUser._id,
                            affiliateLink: affiliateLink._id,

                            orderId: order._id,
                            orderNumber: order.orderNumber || order.orderId || "-",

                            orderAmount: order.amount,
                            commission: commissionAmount,
                            status: "pending"
                        });

                        // 4B️⃣ Create affiliate order (IMPORTANT)
                        await AffiliateOrder.create({
                            affiliateUser: affiliateUser._id,
                            affiliateLink: affiliateLink._id,

                            orderId: order._id,
                            commission: commissionAmount,
                            orderValue: order.amount,
                            status: "pending"
                        });

                        // 5️⃣ Update ORDER affiliate section
                        order.affiliate.applied = true;
                        order.affiliate.affiliateUser = affiliateUser._id;
                        order.affiliate.affiliateLink = affiliateLink._id;

                        // 6️⃣ Add pending commission to affiliate user
                        affiliateUser.pendingCommission =
                            (affiliateUser.pendingCommission || 0) + commissionAmount;

                        await affiliateUser.save();
                    }
                }
            }


            order.transactionId = `GIFTCARD-${Date.now()}`;

            order.tracking_history = order.tracking_history || [];
            order.tracking_history.push(
                { status: "Payment Successful", timestamp: new Date(), location: "GiftCard" },
                { status: "Awaiting Admin Confirmation", timestamp: new Date(), location: "Store" }
            );

            const [paymentDoc] = await Payment.create([{
                order: order._id,
                method: "GiftCard",
                status: "Completed",
                transactionId: order.transactionId,
                amount: order.amount,
                isActive: true,
            }], { session });

            if (paymentDoc) order.paymentId = paymentDoc._id;

            await order.save({ session });

            // 🔔 Notify Admin: New Gift Card Order
            await sendNotification({
                type: "order_giftcard",
                message: `New Gift Card-paid order #${order.orderNumber || order._id} placed`,
                priority: "high",
                meta: {
                    orderId: order._id,
                    userId: order.user._id,
                    amount: order.amount,
                    transactionId: order.transactionId,
                    giftCard: order.giftCardApplied?.code
                }
            });

            await clearUserCart(order.user._id, session);


        });

        const updated = await Order.findById(orderId)
            .populate("user")
            .populate("products.productId");

        await sendEmail(
            updated.user.email,
            `🎁 Gift Card Payment Successful! Order #${updated.orderNumber || updated._id}`,
            `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #ff6b6b 0%, #ff8e53 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { padding: 30px; background: #f9f9f9; }
            .gift-card-box { background: white; padding: 25px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 2px dashed #ff6b6b; }
            .balance-info { background: #ffebee; padding: 15px; border-radius: 10px; margin: 15px 0; }
            .share-box { background: #f3e5f5; padding: 20px; border-radius: 10px; margin: 20px 0; text-align: center; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎁 Gift Card Payment Success!</h1>
                <p>The perfect way to treat yourself or share joy!</p>
            </div>
            <div class="content">
                <h2>Hi ${updated.user.name},</h2>
                <p>You've successfully redeemed a Joyory Beauty Gift Card for your order. What a lovely way to shop!</p>
                
                <div class="gift-card-box">
                    <h3>💝 Gift Card Details</h3>
                    <p><strong>Order ID:</strong> #${updated.orderNumber || updated._id}</p>
                    <p><strong>Gift Card Used:</strong> ${order.giftCardApplied?.code || 'Joyory Gift Card'}</p>
                    <p><strong>Amount Redeemed:</strong> ₹${order.giftCardDiscount || updated.amount}</p>
                    <p><strong>Payment Status:</strong> <span style="color: #4CAF50; font-weight: bold;">✅ Fully Paid with Gift Card</span></p>
                    
                    <div class="balance-info">
                        <h4>💰 Remaining Balance:</h4>
                        <p>Check your gift card balance for future purchases or share with loved ones!</p>
                        <a href="${process.env.FRONTEND_URL}/gift-cards/balance" style="color: #ff6b6b; font-weight: bold;">Check Gift Card Balance →</a>
                    </div>
                </div>
                
                <div class="share-box">
                    <h4>🎉 Spread the Joy!</h4>
                    <p>Loved shopping with a gift card? Share the joy with friends and family!</p>
                    <a href="${process.env.FRONTEND_URL}/gift-cards" style="display: inline-block; padding: 10px 20px; background: #ff6b6b; color: white; text-decoration: none; border-radius: 5px; margin-top: 10px;">Send a Gift Card</a>
                </div>
                
                <div style="background: #e8f5e9; padding: 20px; border-radius: 10px; margin: 20px 0;">
                    <h4>📦 Your Order Status:</h4>
                    <p>Your order is now being processed. You'll receive:</p>
                    <ul>
                        <li>Order confirmation within 24 hours</li>
                        <li>Shipping updates via SMS & email</li>
                        <li>Delivery in 5-7 business days</li>
                    </ul>
                </div>
                
                <div style="text-align: center;">
                    <a href="${process.env.FRONTEND_URL}/orders/${updated._id}" style="display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #ff6b6b 0%, #ff8e53 100%); color: white; text-decoration: none; border-radius: 5px;">Track Your Order</a>
                </div>
            </div>
            <div class="footer">
                <p>Gift Cards never expire! Share beauty, spread joy.</p>
                <p>Joyory Beauty - Where every purchase is special</p>
            </div>
        </div>
    </body>
    </html>
    `
        );

        return res.json({
            success: true,
            message: "Gift card payment successful. Awaiting admin confirmation.",
            order: updated
        });

    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    } finally {
        await session.endSession().catch(() => { });
    }
};

export const setRefundMethod = async (req, res) => {
    const { orderId, method } = req.body;
    const userId = req.user?._id;

    const order = await Order.findById(orderId).populate("user");
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    order.refund.method = method;
    order.refund.status = "requested";

    order.refund.refundAudit.push({
        status: "requested",
        changedBy: userId,
        changedByModel: "User",
        note: `User selected refund method: ${method}`
    });
    // Notify Admin (You can replace with your admin email or from DB)
    await sendEmail(
        process.env.ADMIN_EMAIL || "admin@joyorybeauty.com",
        "⚠️ New Refund Request Received",
        `
  <p>Hello Admin,</p>
  <p>A new refund request has been received.</p>

  <ul>
    <li><strong>Order ID:</strong> ${order._id}</li>
    <li><strong>User:</strong> ${order.user.name} (${order.user.email})</li>
    <li><strong>Amount:</strong> ₹${order.amount}</li>
    <li><strong>Requested Method:</strong> ${method || "Not selected yet"}</li>
    <li><strong>Reason:</strong> ${order.refund.reason || "No reason provided"}</li>
  </ul>

  <p>Please review this request in your Admin Dashboard.</p>
  <p>— Joyory Refund System</p>
  `
    );


    order.refund.requestedBy = userId;

    await order.save();

    // ✅ Send email to user
    await sendEmail(
        order.user.email,
        "📩 Refund Request Received",
        `
        <p>Hi ${order.user.name},</p>
        <p>We have received your refund request for Order <strong>#${order._id}</strong>.</p>
        
        <p><strong>Selected Refund Method:</strong> ${method === "razorpay"
            ? "Original Payment Method (Razorpay)"
            : method === "wallet"
                ? "Joyory Wallet"
                : "Manual UPI"
        }</p>

        <p>Our team will review your request soon. You will receive another update once an admin approves it.</p>

        <p>Regards,<br/>Team Joyory Beauty</p>
        `
    );

    res.status(200).json({
        success: true,
        message: "Refund method submitted. Waiting for admin approval."
    });
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

