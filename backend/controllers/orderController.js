// controllers/orderController.js
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Affiliate from '../models/Affiliate.js';
import User from '../models/User.js';
import { refundQueue } from "../middlewares/services/refundQueue.js";
import { sendEmail } from "../middlewares/utils/emailService.js"; // ✅ assume you already have an email service

export const addOrder = async (req, res) => {
    try {
        const { products: reqProducts, orderType, status } = req.body;
        const customerName = req.user.name;
        const userId = req.user._id;

        let totalAmount = 0;
        const validatedProducts = [];

        // ✅ Prevent duplicates
        const seen = new Set();

        for (const item of reqProducts) {
            if (seen.has(item.productId)) {
                return res
                    .status(400)
                    .json({ message: `❌ Duplicate product ID in order: ${item.productId}` });
            }
            seen.add(item.productId);

            const dbProduct = await Product.findById(item.productId);

            if (!dbProduct) {
                // Product was deleted by admin → skip it
                continue;
            }

            if (dbProduct.quantity < item.quantity) {
                return res
                    .status(400)
                    .json({ message: `❌ Insufficient stock for "${dbProduct.name}"` });
            }

            const subTotal = dbProduct.price * item.quantity;
            totalAmount += subTotal;

            // ✅ Update quantity and sales
            dbProduct.quantity -= item.quantity;
            dbProduct.sales = (dbProduct.sales || 0) + item.quantity;

            // ✅ Recalculate status using thresholdValue
            if (dbProduct.quantity <= 0) {
                dbProduct.status = "Out of stock";
            } else if (dbProduct.quantity < dbProduct.thresholdValue) {
                dbProduct.status = "Low stock";
            } else {
                dbProduct.status = "In-stock";
            }

            await dbProduct.save();

            validatedProducts.push({
                productId: dbProduct._id,
                quantity: item.quantity,
                price: dbProduct.price
            });
        }

        // 🚫 No valid products left
        if (validatedProducts.length === 0) {
            return res.status(400).json({
                message:
                    "All selected products are no longer available. Please refresh your cart."
            });
        }

        // 💰 Discount logic
        const amount = totalAmount;
        let discount = req.discount || null;
        let discountAmount = 0;

        if (discount) {
            const isUsageValid =
                !discount.totalLimit || discount.usageCount < discount.totalLimit;

            if (isUsageValid) {
                if (discount.type === "Flat") {
                    discountAmount = discount.value;
                } else if (discount.type === "Percentage") {
                    discountAmount = Math.round((discount.value / 100) * amount);
                }
            } else {
                console.log("❌ Discount usage limit reached.");
                discount = null;
            }
        }

        // 🎯 Promotion logic
        let promotionUsed = null;
        if (req.promotion) {
            promotionUsed = {
                promotionId: req.promotion._id,
                campaignName: req.promotion.campaignName
            };
        }

        const latestOrder = await Order.findOne().sort({ createdAt: -1 });
        const nextOrderNumber = latestOrder ? latestOrder.orderNumber + 1 : 1001;

        const orderId = `ORDER-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const customOrderId = `CUSTOM-${Date.now()}`;

        // Affiliate setup
        let affiliate = null;
        let buyerDiscountAmount = 0;
        const refCode = req.query.ref;

        if (refCode) {
            affiliate = await Affiliate.findOne({
                referralCode: refCode,
                status: "approved"
            });
            if (affiliate) {
                buyerDiscountAmount = Math.round(totalAmount * 0.1);
            }
        }

        const finalAmount = amount - discountAmount - buyerDiscountAmount;

        const newOrder = new Order({
            products: validatedProducts,
            orderId,
            orderNumber: nextOrderNumber,
            customOrderId,
            user: userId,
            date: new Date(),
            customerName,
            status,
            orderType,
            amount: finalAmount,
            discount: discount ? discount._id : null,
            discountCode: discount ? discount.code : null,
            discountAmount,
            promotionUsed,
            affiliate: affiliate ? affiliate._id : null,
            buyerDiscountAmount: buyerDiscountAmount || 0
        });

        await newOrder.save();

        await User.findByIdAndUpdate(userId, {
            savedRecommendations: [],
            lastRecommendationUpdate: new Date()
        });

        // Update discount usage count
        if (discount) {
            discount.usageCount = (discount.usageCount || 0) + 1;
            await discount.save();
        }

        // Save promotion attribution
        if (req.promotion) {
            req.promotion.conversions = (req.promotion.conversions || 0) + 1;
            req.promotion.orders = req.promotion.orders || [];
            req.promotion.orders.push(newOrder._id);
            await req.promotion.save();
        }

        res
            .status(201)
            .json({ message: "✅ Order placed successfully", order: newOrder });
    } catch (error) {
        console.error("🔥 Order placement error:", error);
        res
            .status(500)
            .json({ message: "Failed to place order", error: error.message });
    }
};

// export const getAllOrders = async (req, res) => {
//     try {
//         const { status, orderType, fromDate, toDate, paid } = req.query;
//         const query = {};

//         // ✅ Filter by status
//         if (status && status !== "all") {
//             query.status = status;
//         }

//         // ✅ Filter by orderType
//         if (orderType && orderType !== "all") {
//             query.orderType = orderType;
//         }

//         // ✅ Filter by PAID / UNPAID
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

//         // ✅ Filter by date range
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

//         // ✅ Fetch orders
//         const orders = await Order.find(query)
//             .populate('products.productId', 'name')
//             .sort({ createdAt: -1 });

//         // ✅ Format response
//         const formatted = orders.map(order => ({
//             _id: order._id,
//             orderId: order.orderId,
//             date: order.date?.toDateString() || "N/A",
//             customerName: order.customerName || "Unknown",
//             status: order.status,
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

// export const getOrderSummary = async (req, res) => {
//     try {
//         const { range = "7d" } = req.query;

//         // ---------------- Range Helpers ----------------
//         const now = new Date();
//         const buildRange = (r) => {
//             const end = new Date(now);
//             const start = new Date(now);

//             switch (r) {
//                 case "1d": start.setDate(now.getDate() - 1); break;
//                 case "7d": start.setDate(now.getDate() - 7); break;
//                 case "1m": start.setMonth(now.getMonth() - 1); break;
//                 case "1y": start.setFullYear(now.getFullYear() - 1); break;
//                 default: start.setDate(now.getDate() - 7);
//             }
//             return { start, end };
//         };

//         const { start: currentStart, end: currentEnd } = buildRange(range);

//         const buildPrevRange = (r, currentStart) => {
//             const prevEnd = new Date(currentStart);
//             const prevStart = new Date(currentStart);

//             switch (r) {
//                 case "1d": prevStart.setDate(prevEnd.getDate() - 1); break;
//                 case "7d": prevStart.setDate(prevEnd.getDate() - 7); break;
//                 case "1m": prevStart.setMonth(prevEnd.getMonth() - 1); break;
//                 case "1y": prevStart.setFullYear(prevEnd.getFullYear() - 1); break;
//                 default: prevStart.setDate(prevEnd.getDate() - 7);
//             }
//             return { prevStart, prevEnd };
//         };

//         const { prevStart, prevEnd } = buildPrevRange(range, currentStart);

//         // ---------------- % Helper ----------------
//         const pctChange = (curr, prev) => {
//             if (prev === 0 && curr > 0) return { change: 100, trend: "up" };
//             if (prev === 0 && curr === 0) return { change: 0, trend: "no-change" };
//             const diff = ((curr - prev) / prev) * 100;
//             return {
//                 change: Number(Math.abs(diff).toFixed(2)),
//                 trend: diff > 0 ? "up" : diff < 0 ? "down" : "no-change"
//             };
//         };

//         // ---------------- TOTAL ORDERS ----------------
//         const [totalOrders, prevTotalOrders] = await Promise.all([
//             Order.countDocuments({ createdAt: { $gte: currentStart, $lte: currentEnd } }),
//             Order.countDocuments({ createdAt: { $gte: prevStart, $lt: prevEnd } })
//         ]);

//         // ---------------- REFUNDED ORDERS (FIXED) ----------------
//         const refundedFilterCurrent = {
//             $or: [
//                 { paymentStatus: "refunded" },
//                 { "refund.isRefunded": true },
//                 { "refund.status": "completed" }
//             ],
//             "refund.refundedAt": { $gte: currentStart, $lte: currentEnd }
//         };

//         const refundedFilterPrev = {
//             $or: [
//                 { paymentStatus: "refunded" },
//                 { "refund.isRefunded": true },
//                 { "refund.status": "completed" }
//             ],
//             "refund.refundedAt": { $gte: prevStart, $lt: prevEnd }
//         };

//         const [refundOrders, prevRefundOrders] = await Promise.all([
//             Order.countDocuments(refundedFilterCurrent),
//             Order.countDocuments(refundedFilterPrev)
//         ]);

//         // ---------------- COMPLETED VIA TIMELINE ----------------
//         const deliveredRegex = /delivered|completed/i;

//         const [completedAgg, prevCompletedAgg] = await Promise.all([
//             Order.aggregate([
//                 { $unwind: "$trackingHistory" },
//                 {
//                     $match: {
//                         "trackingHistory.status": deliveredRegex,
//                         "trackingHistory.timestamp": { $gte: currentStart, $lte: currentEnd }
//                     }
//                 },
//                 { $group: { _id: "$_id" } },
//                 { $count: "count" }
//             ]),
//             Order.aggregate([
//                 { $unwind: "$trackingHistory" },
//                 {
//                     $match: {
//                         "trackingHistory.status": deliveredRegex,
//                         "trackingHistory.timestamp": { $gte: prevStart, $lt: prevEnd }
//                     }
//                 },
//                 { $group: { _id: "$_id" } },
//                 { $count: "count" }
//             ])
//         ]);

//         const completedOrders = completedAgg?.[0]?.count || 0;
//         const prevCompletedOrders = prevCompletedAgg?.[0]?.count || 0;

//         // ---------------- CANCELLED ORDERS ----------------
//         const cancelRegex = /cancel/i;

//         const [cancelledAgg, prevCancelledAgg] = await Promise.all([
//             Order.aggregate([
//                 { $unwind: "$trackingHistory" },
//                 {
//                     $match: {
//                         "trackingHistory.status": cancelRegex,
//                         "trackingHistory.timestamp": { $gte: currentStart, $lte: currentEnd }
//                     }
//                 },
//                 { $group: { _id: "$_id" } },
//                 { $count: "count" }
//             ]),
//             Order.aggregate([
//                 { $unwind: "$trackingHistory" },
//                 {
//                     $match: {
//                         "trackingHistory.status": cancelRegex,
//                         "trackingHistory.timestamp": { $gte: prevStart, $lt: prevEnd }
//                     }
//                 },
//                 { $group: { _id: "$_id" } },
//                 { $count: "count" }
//             ])
//         ]);

//         const cancelledOrders = cancelledAgg?.[0]?.count || 0;
//         const prevCancelledOrders = prevCancelledAgg?.[0]?.count || 0;

//         // ---------------- RESPONSE ----------------
//         res.json({
//             range,

//             totalOrders: {
//                 count: totalOrders,
//                 change: pctChange(totalOrders, prevTotalOrders),
//                 note: `Last ${range}`
//             },

//             refundOrders: {
//                 count: refundOrders,
//                 change: pctChange(refundOrders, prevRefundOrders),
//                 note: `Refunded in ${range}`
//             },

//             completedOrders: {
//                 count: completedOrders,
//                 change: pctChange(completedOrders, prevCompletedOrders),
//                 note: `Last ${range}`
//             },

//             cancelledOrders: {
//                 count: cancelledOrders,
//                 change: pctChange(cancelledOrders, prevCancelledOrders),
//                 note: `Last ${range}`
//             }
//         });

//     } catch (error) {
//         console.error(error);
//         res.status(500).json({
//             message: "Error generating order summary",
//             error: error.message
//         });
//     }
// };
export const getAllOrders = async (req, res) => {
    try {
        const { status, orderType, fromDate, toDate, paid } = req.query;
        const query = { isDraft: false };

        if (status && status !== "all") {
            query.status = status;
        }

        if (orderType && orderType !== "all") {
            query.orderType = orderType;
        }

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
            query.date = {
                $gte: new Date(fromDate),
                $lte: new Date(toDate)
            };
        } else if (fromDate) {
            query.date = { $gte: new Date(fromDate) };
        } else if (toDate) {
            query.date = { $lte: new Date(toDate) };
        }

        const orders = await Order.find(query)
            .populate('products.productId', 'name')
            .sort({ createdAt: -1 });

        const formatted = orders.map(order => ({
            _id: order._id,
            orderId: order.orderId,
            date: order.date?.toDateString() || "N/A",
            customerName: order.customerName || "Unknown",
            status: order.status,
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

        res.status(200).json(formatted);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch orders', error });
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

        // ✅ TOTAL ORDERS
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

        // ✅ REFUND ORDERS
        const refundedFilterCurrent = {
            isDraft: false,
            $or: [
                { paymentStatus: "refunded" },
                { "refund.isRefunded": true },
                { "refund.status": "completed" }
            ],
            "refund.refundedAt": { $gte: currentStart, $lte: currentEnd }
        };

        const refundedFilterPrev = {
            isDraft: false,
            $or: [
                { paymentStatus: "refunded" },
                { "refund.isRefunded": true },
                { "refund.status": "completed" }
            ],
            "refund.refundedAt": { $gte: prevStart, $lt: prevEnd }
        };

        const [refundOrders, prevRefundOrders] = await Promise.all([
            Order.countDocuments(refundedFilterCurrent),
            Order.countDocuments(refundedFilterPrev)
        ]);

        // ✅ COMPLETED ORDERS (Delivered in tracking)
        const deliveredRegex = /delivered|completed/i;

        const [completedAgg, prevCompletedAgg] = await Promise.all([
            Order.aggregate([
                { $match: { isDraft: false } },
                { $unwind: "$trackingHistory" },
                {
                    $match: {
                        "trackingHistory.status": deliveredRegex,
                        "trackingHistory.timestamp": { $gte: currentStart, $lte: currentEnd }
                    }
                },
                { $group: { _id: "$_id" } },
                { $count: "count" }
            ]),
            Order.aggregate([
                { $match: { isDraft: false } },
                { $unwind: "$trackingHistory" },
                {
                    $match: {
                        "trackingHistory.status": deliveredRegex,
                        "trackingHistory.timestamp": { $gte: prevStart, $lt: prevEnd }
                    }
                },
                { $group: { _id: "$_id" } },
                { $count: "count" }
            ])
        ]);

        const completedOrders = completedAgg?.[0]?.count || 0;
        const prevCompletedOrders = prevCompletedAgg?.[0]?.count || 0;

        // ✅ CANCELLED ORDERS
        const cancelRegex = /cancel/i;

        const [cancelledAgg, prevCancelledAgg] = await Promise.all([
            Order.aggregate([
                { $match: { isDraft: false } },
                { $unwind: "$trackingHistory" },
                {
                    $match: {
                        "trackingHistory.status": cancelRegex,
                        "trackingHistory.timestamp": { $gte: currentStart, $lte: currentEnd }
                    }
                },
                { $group: { _id: "$_id" } },
                { $count: "count" }
            ]),
            Order.aggregate([
                { $match: { isDraft: false } },
                { $unwind: "$trackingHistory" },
                {
                    $match: {
                        "trackingHistory.status": cancelRegex,
                        "trackingHistory.timestamp": { $gte: prevStart, $lt: prevEnd }
                    }
                },
                { $group: { _id: "$_id" } },
                { $count: "count" }
            ])
        ]);

        const cancelledOrders = cancelledAgg?.[0]?.count || 0;
        const prevCancelledOrders = prevCancelledAgg?.[0]?.count || 0;

        // ✅ DRAFT COUNT (optional but useful)
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
            .populate("products.productId", "name brand category images price")
            .populate("affiliate", "name referralCode")
            .populate("discount", "code type value")
            .lean();

        if (!order) return res.status(404).json({ message: "Order not found" });

        // 🧭 Timeline history (status progress)
        const timeline = (order.trackingHistory || []).map(t => ({
            status: t.status,
            date: t.timestamp,
            location: t.location || "",
        }));

        // Include shipment status if available
        if (order.shipment?.status) {
            timeline.push({
                status: order.shipment.status,
                date: order.shipment.assignedAt || null,
                location: order.shipment.courier_name || "",
            });
        }

        // 🧾 Order summary
        const summary = {
            orderId: order.orderId || order._id,
            orderNumber: order.orderNumber,
            date: order.date,
            totalAmount: order.amount,
            status: order.status,
            currentStatus: order.orderStatus || order.shipment?.status || order.status,
            orderType: order.orderType || "Online",
        };

        // 👤 Customer details
        const customer = {
            id: order.user?._id || null,
            name: order.user?.name || order.customerName || "",
            email: order.user?.email || "",
            phone: order.user?.phone || "",
        };

        // 📦 Product details (for both detail view + tracking view)
        const products = order.products.map((p) => ({
            id: p.productId?._id,
            name: p.productId?.name,
            brand: p.productId?.brand || "Unknown",
            category: p.productId?.category,
            image: p.productId?.images?.[0] || null,
            quantity: p.quantity,
            price: p.price,
            total: p.quantity * p.price,
        }));

        // 🚚 Shipping details
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

        // 💳 Payment details
        const payment = {
            method: order.paymentMethod || "Not specified",
            status: order.paymentStatus || "Pending",
            transactionId: order.transactionId || null,
            amount: order.amount,
        };

        // 🎁 Discount and affiliate info
        const discount = order.discount
            ? {
                code: order.discount.code,
                type: order.discount.type,
                value: order.discount.value,
                discountAmount: order.discountAmount || 0,
                buyerDiscountAmount: order.buyerDiscountAmount || 0,
            }
            : null;

        const affiliate = order.affiliate
            ? {
                id: order.affiliate._id,
                name: order.affiliate.name,
                referralCode: order.affiliate.referralCode,
            }
            : null;

        // 📦 Shipment info
        const shipment = order.shipment
            ? {
                courierName: order.shipment.courier_name || null,
                trackingNumber: order.shipment.awb_code || null,
                currentStatus: order.shipment.status || null,
                assignedAt: order.shipment.assignedAt || null,
            }
            : null;

        // 🧠 Compute totals
        const subtotal = order.products.reduce((acc, p) => acc + p.price * p.quantity, 0);
        const shippingCharge = order.shippingCharge || 0;
        const tax = order.taxAmount || 0;
        const totalPrice = subtotal + shippingCharge + tax - (order.discountAmount || 0);

        // 🧩 Final structured response (for both UIs)
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
                totalPrice,
            },
            timeline,
        };

        res.status(200).json(response);
    } catch (err) {
        console.error("Error fetching order:", err);
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
        order.trackingHistory.push({
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
