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

import cloudinary from '../../../middlewares/utils/cloudinary.js';
import { determineOccasions, craftMessage } from "../../../middlewares/services/ecardService.js";
import { buildEcardPdf } from "../../../middlewares/services/ecardPdf.js";
import { generateInvoice } from "../../../middlewares/services/invoiceService.js";
import { splitOrderForPersistence } from '../../../middlewares/services/orderSplit.js'; // or correct path

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create Razorpay order with PaymentMethod (improved, idempotent, secure, UPI-ready)
export const createRazorpayOrder = async (req, res) => {
    try {
        const { orderId, paymentMethodKey, upiId, provider } = req.body;

        // 1️⃣ Basic validation
        if (!orderId || !paymentMethodKey) {
            return res.status(400).json({ success: false, message: "orderId and paymentMethodKey are required" });
        }

        // 2️⃣ Fetch order (with user)
        const order = await Order.findById(orderId).populate("user");
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });

        // 3️⃣ Authorization check
        if (req.user && !req.admin) {
            if (order.user && order.user._id.toString() !== req.user._id.toString()) {
                return res.status(403).json({ success: false, message: "Forbidden: you cannot create a payment for this order" });
            }
        }

        // 4️⃣ Already paid check
        if (order.paid) {
            return res.status(400).json({ success: false, message: "Order is already paid" });
        }

        // 5️⃣ Order amount validation
        if (!order.amount || order.amount <= 0) {
            return res.status(400).json({ success: false, message: "Invalid order amount" });
        }

        // 6️⃣ Fetch payment method
        const paymentMethod = await PaymentMethod.findOne({ key: paymentMethodKey, isActive: true });
        if (!paymentMethod) {
            return res.status(400).json({ success: false, message: "Payment method not available" });
        }

        // 7️⃣ Offline payment handling (COD/wallet)
        if (paymentMethod.type === "offline") {
            const maxCodAmount = paymentMethod.config?.maxAmount;
            if (typeof maxCodAmount === "number" && order.amount > maxCodAmount) {
                return res.status(400).json({ success: false, message: `COD not allowed for orders above ₹${maxCodAmount}` });
            }

            order.paymentMethod = paymentMethod.key;
            order.paymentStatus = "pending";
            order.orderStatus = "Awaiting Payment";
            order.trackingHistory = order.trackingHistory || [];
            order.trackingHistory.push({ status: "Order Placed", timestamp: new Date(), location: "Store" });
            order.trackingHistory.push({ status: "Awaiting Payment", timestamp: new Date() });

            await order.save();

            return res.status(200).json({
                success: true,
                message: "Offline payment selected, order placed successfully",
                orderId: order._id,
                paymentMethod: paymentMethod.key,
            });
        }

        // 8️⃣ UPI-specific validation
        if (paymentMethod.key === "upi") {
            const vpaRegex = /^[\w.-]+@[\w]+$/;
            if (!upiId || !vpaRegex.test(upiId)) {
                return res.status(400).json({ success: false, message: "Invalid or missing UPI ID" });
            }
            if (!provider) {
                return res.status(400).json({ success: false, message: "UPI provider is required (gpay/phonepe/paytm)" });
            }

            order.upiId = upiId;
            order.upiProvider = provider;
        }

        // 9️⃣ Idempotency: return existing pending Razorpay order
        if (order.razorpayOrderId && order.paymentStatus === "pending") {
            return res.status(200).json({
                success: true,
                message: "Razorpay order already exists for this order",
                razorpayOrderId: order.razorpayOrderId,
                amount: order.amount,
                currency: "INR",
                orderId: order._id,
                paymentMethod: order.paymentMethod || paymentMethod.key,
                upiId: order.upiId || null,
            });
        }

        // 🔟 Create Razorpay order
        const amountInPaise = Math.round(order.amount * 100);
        const payment_capture_flag = paymentMethod.config?.autoCapture ? 1 : 1;

        let razorpayOrder;
        try {
            razorpayOrder = await razorpay.orders.create({
                amount: amountInPaise,
                currency: "INR",
                receipt: order._id.toString(),
                payment_capture: payment_capture_flag,
                notes: {
                    orderId: order._id.toString(),
                    customer: order.user?.name || "Guest User",
                    upi: order.upiId || null,
                },
            });
        } catch (err) {
            console.error("Razorpay order creation failed:", err);
            return res.status(502).json({
                success: false,
                message: "Failed to create payment order with gateway",
                error: err.message || "Razorpay error",
            });
        }

        // 1️⃣1️⃣ Seller split/backfill (optional, your existing logic)
        try { await splitOrderForPersistence(order); } catch (err) { console.warn(err); }

        try {
            const updatedProducts = [];
            for (const p of order.products) {
                if (!p.seller) {
                    const prod = await Product.findById(p.productId).select("seller").lean();
                    if (prod?.seller) {
                        p.seller = prod.seller;
                        updatedProducts.push(p.productId.toString());
                    }
                }
            }
            if (updatedProducts.length) console.log("Backfilled seller for products:", updatedProducts);
        } catch (err) { console.warn(err); }

        // 1️⃣2️⃣ Update order with Razorpay info
        order.razorpayOrderId = razorpayOrder.id;
        order.paymentStatus = "pending";
        order.orderStatus = "Awaiting Payment";
        order.paymentMethod = paymentMethod.key;
        order.trackingHistory = order.trackingHistory || [];
        order.trackingHistory.push({ status: "Awaiting Payment", timestamp: new Date() });

        // 1️⃣3️⃣ Optional E-card (kept)
        try {
            const { occasion, festival } = await determineOccasions({ userId: order.user._id, userDoc: order.user });
            const message = craftMessage({ occasion, user: order.user, festival });
            if (message) {
                const pdfBuffer = await buildEcardPdf({ title: "A Special Note from Joyory 🎉", name: order.user?.name || "Customer", message });
                const uploadResult = await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        { folder: "ecards", resource_type: "raw", public_id: `ecard-${order._id}`, access_mode: "public" },
                        (error, result) => (error ? reject(error) : resolve(result))
                    );
                    uploadStream.end(pdfBuffer);
                });
                await sendEmail(order.user.email, "🎁 Your Joyory E-Card", `<p>${message}</p><p>PDF attached.</p>`, [{ name: "ecard.pdf", content: pdfBuffer.toString("base64"), mime_type: "application/pdf" }]);
                order.ecard = { occasion, message, emailSentAt: new Date(), pdfUrl: uploadResult?.secure_url || null };
            }
        } catch (err) { console.warn("E-card skipped:", err); }

        // 1️⃣4️⃣ Save order
        await order.save();

        // 1️⃣5️⃣ Return success response
        return res.status(200).json({
            success: true,
            message: "Razorpay order created successfully",
            razorpayOrderId: razorpayOrder.id,
            amount: order.amount,
            currency: "INR",
            orderId: order._id,
            paymentMethod: paymentMethod.key,
            upiId: order.upiId || null, // send to frontend for prefill
        });

    } catch (err) {
        console.error("Fatal error creating Razorpay order:", err);
        return res.status(500).json({ success: false, message: "Failed to create Razorpay order", error: err.message });
    }
};

// 🔹 Verify Razorpay payment with PaymentMethod + hardened security
export const verifyRazorpayPayment = async (req, res) => {
    try {
        const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature, shippingAddress } = req.body;

        // 1) Input validation
        if (![orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature].every(v => typeof v === "string" && v.trim())) {
            return res.status(400).json({ step: "FIELD_VALIDATION", success: false, message: "Missing or invalid required fields" });
        }

        // 2) Fetch order with user + products
        const order = await Order.findById(orderId).populate("user").populate("products.productId");
        if (!order) return res.status(404).json({ step: "ORDER_FETCH", success: false, message: "Order not found" });

        // 3) Authorization check (only order owner or admin can verify)
        if (req.user && !req.admin) {
            if (order.user && order.user._id.toString() !== req.user._id.toString()) {
                return res.status(403).json({ step: "AUTH_CHECK", success: false, message: "Forbidden: not your order" });
            }
        }

        // 4) Idempotency: already paid
        if (order.paid) {
            return res.status(200).json({ step: "IDEMPOTENCY", success: true, message: "Order already verified & paid", orderId: order._id });
        }

        // 5) Match stored Razorpay order
        if (order.razorpayOrderId && order.razorpayOrderId !== razorpay_order_id) {
            return res.status(400).json({ step: "ORDER_MATCH", success: false, message: "Order mismatch", debug: { expected: order.razorpayOrderId, got: razorpay_order_id } });
        }

        // 6) Verify PaymentMethod (must be active online)
        const paymentMethod = await PaymentMethod.findOne({ key: order.paymentMethod, isActive: true });
        if (!paymentMethod || paymentMethod.type !== "online") {
            return res.status(400).json({ step: "PAYMENT_METHOD", success: false, message: "Payment method inactive or invalid" });
        }

        // 7) Signature verification (timing-safe)
        const signBody = `${razorpay_order_id}|${razorpay_payment_id}`;
        const expectedSig = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(signBody).digest("hex");

        const validSig = crypto.timingSafeEqual(
            Buffer.from(expectedSig),
            Buffer.from(razorpay_signature)
        );
        if (!validSig) {
            return res.status(400).json({ step: "SIGNATURE", success: false, message: "Invalid signature / payment failed" });
        }

        // 8) Fetch Razorpay payment
        let rpPayment;
        try {
            rpPayment = await razorpay.payments.fetch(razorpay_payment_id);
        } catch (fetchErr) {
            return res.status(502).json({ step: "RAZORPAY_FETCH", success: false, message: "Failed to fetch payment", error: fetchErr.message, details: fetchErr.response?.data || null });
        }

        if (rpPayment.status !== "captured") {
            return res.status(400).json({ step: "PAYMENT_STATUS", success: false, message: `Payment not captured (status: ${rpPayment.status})` });
        }

        // 9) Amount check
        const paidAmount = rpPayment.amount / 100;
        if (paidAmount !== order.amount) {
            return res.status(400).json({ step: "AMOUNT_CHECK", success: false, message: "Amount mismatch", debug: { razorpay: paidAmount, order: order.amount } });
        }

        // 10) Deduct stock safely
        for (const item of order.products) {
            const product = await Product.findById(item.productId._id);
            if (!product) continue;

            if (item.selectedVariant?.sku && product.variants?.length) {
                const variant = product.variants.find(v => v.sku === item.selectedVariant.sku);
                if (!variant) continue;
                if (variant.stock < item.quantity) {
                    return res.status(400).json({ step: "STOCK_CHECK", success: false, message: `Insufficient stock for ${product.name} - ${variant.name}` });
                }
                variant.stock -= item.quantity;
                variant.sales = (variant.sales || 0) + item.quantity;
            } else {
                if (product.quantity < item.quantity) {
                    return res.status(400).json({ step: "STOCK_CHECK", success: false, message: `Insufficient stock for ${product.name}` });
                }
                product.quantity -= item.quantity;
                product.sales = (product.sales || 0) + item.quantity;
            }

            // Update product status
            if (product.variants?.length) {
                const totalStock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
                product.quantity = totalStock;
                product.status = totalStock <= 0 ? "Out of stock" : totalStock < product.thresholdValue ? "Low stock" : "In-stock";
            } else {
                product.status = product.quantity <= 0 ? "Out of stock" : product.quantity < product.thresholdValue ? "Low stock" : "In-stock";
            }

            await product.save();
        }

        // 11) Mark order as paid
        order.paid = true;
        order.paymentStatus = "success";
        order.paymentMethod = rpPayment.method || paymentMethod.key || "Prepaid";
        order.transactionId = razorpay_payment_id;
        order.razorpayOrderId = razorpay_order_id;
        order.orderStatus = "Processing";
        if (shippingAddress) order.shippingAddress = shippingAddress;

        // 12) Record Payment (idempotent)
        try {
            const existingPayment = await Payment.findOne({ transactionId: razorpay_payment_id });
            if (!existingPayment) {
                await Payment.create({
                    order: order._id,
                    method: rpPayment.method || "Razorpay",
                    status: "Completed",
                    transactionId: razorpay_payment_id,
                    amount: order.amount,
                    cardHolderName: rpPayment.card?.name,
                    cardNumber: rpPayment.card?.last4,
                    expiryDate: rpPayment.card ? `${rpPayment.card.expiry_month}/${rpPayment.card.expiry_year}` : undefined,
                    isActive: true,
                });
            }
        } catch (err) {
            console.error("❌ Error saving Payment record:", err);
        }

        // 13) Clear user cart
        try {
            const user = await User.findById(order.user._id);
            if (user) { user.cart = []; await user.save(); }
        } catch (err) { console.error("❌ Error clearing cart:", err); }

        // 14) Shiprocket integration
        try {
            const shiprocketRes = await createShipment(order);
            order.shipment = shiprocketRes.shipmentDetails;
        } catch (err) {
            console.error("❌ Shiprocket error:", err);
        }

        // 15) Tracking update
        order.trackingHistory = order.trackingHistory || [];
        order.trackingHistory.push(
            { status: "Payment Successful", timestamp: new Date(), location: "Online Payment - Razorpay" },
            { status: "Processing", timestamp: new Date(), location: "Store" }
        );

        // 16) Wallet points deduction
        try {
            if (order.pointsUsed > 0) {
                const user = await User.findById(order.user._id);
                if (user) {
                    const deduction = order.pointsUsed * 0.1;
                    user.walletBalance = Math.max(0, user.walletBalance - deduction);
                    await user.save();
                }
            }
        } catch (err) { console.error("🔥 Wallet points error:", err); }

        // Save order
        await order.save();

        // 17) Generate invoice
        try {
            const { pdfBuffer, pdfUrl } = await generateInvoice(order, order.user);
            order.invoice = { number: `INV-${order._id}`, generatedAt: new Date(), pdfUrl };

            // Store UPI details (optional, for logging)
            if (rpPayment.method === "upi") {
                order.upiId = rpPayment.vpa;          // the virtual payment address customer paid with
                order.upiProvider = rpPayment.bank;   // UPI provider (e.g., 'HDFC', 'ICICI')
            }


            await order.save();

            await sendEmail(
                order.user.email,
                "🧾 Your Invoice from Joyory",
                `<p>Hi ${order.user.name},</p><p>Thank you for your purchase! Please find your invoice attached.</p>`,
                [
                    {
                        name: "invoice.pdf",
                        content: pdfBuffer.toString("base64"),
                        mime_type: "application/pdf",
                    },
                ]
            );
        } catch (err) {
            console.error("❌ Invoice generation/email error:", err);
        }

        return res.status(200).json({
            step: "COMPLETE",
            success: true,
            message: "Payment verified, stock updated, order paid & shipment created",
            paymentMethod: rpPayment.method,
            orderId: order._id,
        });

    } catch (err) {
        console.error("🔥 Fatal error verifying Razorpay payment:", err);
        return res.status(500).json({
            step: "FATAL",
            success: false,
            message: "Unexpected server error during payment verification",
            error: err.message,
        });
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
