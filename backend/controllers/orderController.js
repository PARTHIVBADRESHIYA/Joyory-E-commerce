// controllers/orderController.js
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Affiliate from '../models/Affiliate.js';
import User from '../models/User.js';

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

export const getAllOrders = async (req, res) => {
    try {
        const { status, orderType, fromDate, toDate } = req.query;
        const query = {};

        // ✅ Filter by status
        if (status && status !== "all") {
            query.status = status;
        }

        // ✅ Filter by orderType
        if (orderType && orderType !== "all") {
            query.orderType = orderType;
        }

        // ✅ Filter by date range
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
            _id: order._id,                  // Mongo default
            orderId: order.orderId,
            date: order.date?.toDateString() || "N/A",
            customerName: order.customerName || "Unknown",
            status: order.status,
            orderType: order.orderType,
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
// Get summary metrics for dashboard

export const getOrderSummary = async (req, res) => {
    try {
        const { range = "7d" } = req.query; // options: 1d, 7d, 1m, 1y

        // ---- Helper: Date Range Builder ----
        const now = new Date();
        const getDateRange = (type) => {
            const end = new Date(now);
            const start = new Date(now);
            switch (type) {
                case "1d":
                    start.setDate(now.getDate() - 1);
                    break;
                case "7d":
                    start.setDate(now.getDate() - 7);
                    break;
                case "1m":
                    start.setMonth(now.getMonth() - 1);
                    break;
                case "1y":
                    start.setFullYear(now.getFullYear() - 1);
                    break;
                default:
                    start.setDate(now.getDate() - 7);
            }
            return { start, end };
        };

        const { start: currentStart, end: currentEnd } = getDateRange(range);

        // ---- Helper: Previous Range ----
        const getPreviousRange = (type) => {
            const prevEnd = new Date(currentStart);
            const prevStart = new Date(currentStart);
            switch (type) {
                case "1d":
                    prevStart.setDate(prevEnd.getDate() - 1);
                    break;
                case "7d":
                    prevStart.setDate(prevEnd.getDate() - 7);
                    break;
                case "1m":
                    prevStart.setMonth(prevEnd.getMonth() - 1);
                    break;
                case "1y":
                    prevStart.setFullYear(prevEnd.getFullYear() - 1);
                    break;
                default:
                    prevStart.setDate(prevEnd.getDate() - 7);
            }
            return { prevStart, prevEnd };
        };

        const { prevStart, prevEnd } = getPreviousRange(range);

        // ---- Helper: Percentage Change ----
        const pctChange = (curr, prev) => {
            if (prev === 0 && curr > 0) return { change: 100, trend: "up" };
            if (prev === 0 && curr === 0) return { change: 0, trend: "no-change" };

            const diff = ((curr - prev) / prev) * 100;
            return {
                change: Math.abs(diff.toFixed(2)),
                trend: diff > 0 ? "up" : diff < 0 ? "down" : "no-change",
            };
        };

        // ===== Current Range Data =====
        const [totalOrders, newOrders, completedOrders, cancelledOrders] = await Promise.all([
            Order.countDocuments({ createdAt: { $gte: currentStart, $lte: currentEnd } }), // ✅ range-based total
            Order.countDocuments({ createdAt: { $gte: currentStart, $lte: currentEnd } }), // ✅ same as total for now
            Order.countDocuments({
                status: { $in: ["Delivered", "Completed"] },
                createdAt: { $gte: currentStart, $lte: currentEnd },
            }),
            Order.countDocuments({
                status: "Cancelled",
                createdAt: { $gte: currentStart, $lte: currentEnd },
            }),
        ]);

        // ===== Previous Range Data =====
        const [prevTotalOrders, prevNewOrders, prevCompletedOrders, prevCancelledOrders] = await Promise.all([
            Order.countDocuments({ createdAt: { $gte: prevStart, $lt: prevEnd } }),
            Order.countDocuments({ createdAt: { $gte: prevStart, $lt: prevEnd } }),
            Order.countDocuments({
                status: { $in: ["Delivered", "Completed"] },
                createdAt: { $gte: prevStart, $lt: prevEnd },
            }),
            Order.countDocuments({
                status: "Cancelled",
                createdAt: { $gte: prevStart, $lt: prevEnd },
            }),
        ]);

        // ===== Response =====
        res.json({
            range,
            totalOrders: {
                count: totalOrders,
                change: pctChange(totalOrders, prevTotalOrders),
                note: `Last ${range}`,
            },
            newOrders: {
                count: newOrders,
                change: pctChange(newOrders, prevNewOrders),
                note: `Last ${range}`,
            },
            completedOrders: {
                count: completedOrders,
                change: pctChange(completedOrders, prevCompletedOrders),
                note: `Last ${range}`,
            },
            cancelledOrders: {
                count: cancelledOrders,
                change: pctChange(cancelledOrders, prevCancelledOrders),
                note: `Last ${range}`,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Error generating order summary",
            error: error.message,
        });
    }
};
// export const getOrderSummary = async (req, res) => {
//     try {
//         const now = new Date();

//         // Current week (last 7 days)
//         const lastWeekStart = new Date();
//         lastWeekStart.setDate(now.getDate() - 7);

//         // Previous week (7–14 days ago)
//         const prevWeekStart = new Date();
//         prevWeekStart.setDate(now.getDate() - 14);

//         // --- Current stats ---
//         const current = {
//             totalOrders: await Order.countDocuments(), // ✅ all time
//             totalOrdersWeek: await Order.countDocuments({ createdAt: { $gte: lastWeekStart } }), // ✅ for trend only

//             newOrders: await Order.countDocuments({ createdAt: { $gte: lastWeekStart } }),

//             completedOrders: await Order.countDocuments({
//                 status: { $in: ["Delivered", "Completed"] },
//                 createdAt: { $gte: lastWeekStart }
//             }),

//             cancelledOrders: await Order.countDocuments({
//                 status: "Cancelled",
//                 createdAt: { $gte: lastWeekStart }
//             })
//         };

//         // --- Previous week stats ---
//         const prev = {
//             totalOrdersWeek: await Order.countDocuments({
//                 createdAt: { $gte: prevWeekStart, $lt: lastWeekStart }
//             }),

//             newOrders: await Order.countDocuments({
//                 createdAt: { $gte: prevWeekStart, $lt: lastWeekStart }
//             }),

//             completedOrders: await Order.countDocuments({
//                 status: { $in: ["Delivered", "Completed"] },
//                 createdAt: { $gte: prevWeekStart, $lt: lastWeekStart }
//             }),

//             cancelledOrders: await Order.countDocuments({
//                 status: "Cancelled",
//                 createdAt: { $gte: prevWeekStart, $lt: lastWeekStart }
//             })
//         };

//         // Always return { change, trend }
//         const pctChange = (curr, prev) => {
//             if (prev === 0 && curr > 0) return { change: 100, trend: "up" };
//             if (prev === 0 && curr === 0) return { change: 0, trend: "no-change" };

//             const diff = ((curr - prev) / prev) * 100;
//             return {
//                 change: Math.abs(diff.toFixed(2)),
//                 trend: diff > 0 ? "up" : diff < 0 ? "down" : "no-change"
//             };
//         };

//         res.json({
//             totalOrders: {
//                 count: current.totalOrders, // ✅ all-time total
//                 change: pctChange(current.totalOrdersWeek, prev.totalOrdersWeek), // ✅ weekly trend
//             },
//             newOrders: {
//                 count: current.newOrders,
//                 change: pctChange(current.newOrders, prev.newOrders),
//                 note: "last 7 days"
//             },
//             completedOrders: {
//                 count: current.completedOrders,
//                 change: pctChange(current.completedOrders, prev.completedOrders),
//                 note: "last 7 days"
//             },
//             cancelledOrders: {
//                 count: current.cancelledOrders,
//                 change: pctChange(current.cancelledOrders, prev.cancelledOrders),
//                 note: "last 7 days"
//             }
//         });

//     } catch (error) {
//         console.error(error);
//         res.status(500).json({
//             message: "Error getting summary",
//             error: error.message
//         });
//     }
// };

// export const getOrderById = async (req, res) => {
//     try {
//         const { id } = req.params;

//         const order = await Order.findById(id)
//             .populate("user", "name email phone")
//             .populate("products.productId", "name brand category images price")
//             .populate("affiliate", "name referralCode")
//             .populate("discount", "code type value")
//             .lean();

//         if (!order) return res.status(404).json({ message: "Order not found" });

//         // --- Build timeline from trackingHistory & shipment ---
//         const timeline = (order.trackingHistory || []).map(t => ({
//             status: t.status,
//             timestamp: t.timestamp,
//             location: t.location || null
//         }));

//         // Include shipment status as a final step if available
//         if (order.shipment?.status) {
//             timeline.push({
//                 status: order.shipment.status,
//                 timestamp: order.shipment.assignedAt || null,
//                 location: order.shipment.courier_name || null
//             });
//         }

//         const response = {
//             // --- Summary ---
//             _id: order._id,
//             orderId: order.orderId,
//             orderNumber: order.orderNumber,
//             date: order.date,
//             status: order.status,
//             currentStatus: order.orderStatus || order.shipment?.status || order.status,
//             orderType: order.orderType,
//             amount: order.amount,

//             // --- Customer ---
//             customer: {
//                 id: order.user?._id,
//                 name: order.user?.name || order.customerName,
//                 email: order.user?.email,
//                 phone: order.user?.phone,
//             },

//             // --- Products ---
//             products: order.products.map(p => ({
//                 id: p.productId?._id,
//                 name: p.productId?.name,
//                 brand: p.productId?.brand,
//                 category: p.productId?.category,
//                 image: p.productId?.images?.[0] || null,
//                 quantity: p.quantity,
//                 price: p.price,
//                 total: p.quantity * p.price
//             })),

//             // --- Shipping & Payment ---
//             shippingAddress: order.shippingAddress,
//             courierName: order.shipment?.courier_name || null,
//             trackingNumber: order.shipment?.awb_code || null,
//             expectedDelivery: null, // compute if you have ETA
//             payment: {
//                 method: order.paymentMethod || "Manual",
//                 status: order.paymentStatus || "Pending",
//                 transactionId: order.transactionId || null,
//                 amount: order.amount
//             },

//             // --- Discounts & Affiliates ---
//             discount: {
//                 code: order.discountCode,
//                 discountAmount: order.discountAmount || 0,
//                 buyerDiscountAmount: order.buyerDiscountAmount || 0,
//             },
//             affiliate: order.affiliate
//                 ? { id: order.affiliate._id, name: order.affiliate.name, referralCode: order.affiliate.referralCode }
//                 : null,

//             // --- Timeline (with status) ---
//             timeline
//         };

//         res.json(response);
//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ message: "Failed to fetch order", error: err.message });
//     }
// };
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

