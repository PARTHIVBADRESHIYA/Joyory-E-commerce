// controllers/sellers/sellerOrderController.js
import mongoose from "mongoose";
import Order from "../../models/Order.js";
import Product from "../../models/Product.js";
import Payment from "../../models/settings/payments/Payment.js";
// ================= LIST SELLER ORDERS =================
export const listSellerOrders = async (req, res) => {
    try {
        const sellerId = req.seller._id;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const skip = (page - 1) * limit;

        const { status, fromDate, toDate, orderType } = req.query;
        const match = { "splitOrders.seller": sellerId };

        if (status && status !== "all") match["splitOrders.status"] = status;
        if (orderType && orderType !== "all") match.orderType = orderType;
        if (fromDate || toDate) {
            match.createdAt = {};
            if (fromDate) match.createdAt.$gte = new Date(fromDate);
            if (toDate) match.createdAt.$lte = new Date(toDate);
        }

        const orders = await Order.aggregate([
            { $match: match },
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
                $addFields: {
                    splitOrder: {
                        $filter: {
                            input: "$splitOrders",
                            as: "so",
                            cond: { $eq: ["$$so.seller", sellerId] }
                        }
                    }
                }
            },
            {
                $addFields: {
                    amount: { $sum: "$splitOrder.amount" }
                }
            },
            {
                $project: {
                    _id: 1,
                    orderId: 1,
                    orderNumber: 1,
                    date: 1,
                    customerName: 1,
                    status: { $arrayElemAt: ["$splitOrder.status", 0] },
                    paymentMethod: { $arrayElemAt: ["$splitOrder.paymentMethod", 0] },
                    amount: 1,
                    products: 1,
                    courierName: { $arrayElemAt: ["$splitOrder.courierName", 0] },
                    trackingNumber: { $arrayElemAt: ["$splitOrder.trackingNumber", 0] },
                }
            }
        ]);

        // Map products to include name, image, qty, total
        const ordersWithProducts = await Promise.all(
            orders.map(async order => {
                const products = await Promise.all(
                    order.products.map(async p => {
                        const prod = await Product.findById(p.productId).select("name images").lean();
                        return {
                            name: prod?.name || "Product",
                            image: prod?.images?.[0] || null,
                            quantity: p.quantity,
                            price: p.price,
                            total: p.quantity * p.price
                        };
                    })
                );
                return { ...order, products };
            })
        );

        res.json({ data: ordersWithProducts, page, limit });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

// ================= GET SINGLE SELLER ORDER =================
export const getSellerOrderById = async (req, res) => {
    try {
        const sellerId = req.seller._id;
        const { id } = req.params;

        const order = await Order.findById(id)
            .populate("products.productId", "name brand images category seller")
            .populate("user", "name email phone")
            .lean();

        if (!order) return res.status(404).json({ message: "Order not found" });

        const split = (order.splitOrders || []).find(
            s => s.seller.toString() === sellerId.toString()
        );
        if (!split) return res.status(403).json({ message: "You cannot view this order" });

        // Seller products
        const sellerProducts = order.products
            .filter(p => p.productId?.seller?.toString() === sellerId.toString())
            .map(p => ({
                name: p.productId?.name,
                brand: p.productId?.brand || null,
                image: p.productId?.images?.[0] || null,
                quantity: p.quantity,
                price: p.price,
                total: p.quantity * p.price,
            }));

        const payment = await Payment.findOne({ order: order._id }).lean();

        res.json({
            // --- Summary ---
            orderId: order._id,
            orderNumber: order.orderNumber,
            date: order.date,
            status: split.status,

            // --- Customer ---
            customer: {
                name: order.user?.name || order.customerName,
                email: order.user?.email || null,
                phone: order.user?.phone || null
            },

            // --- Shipping ---
            shippingAddress: order.shippingAddress,
            courierName: split.courierName,
            trackingNumber: split.trackingNumber,
            expectedDelivery: split.expectedDelivery || order.expectedDelivery,

            // --- Payment ---
            payment: {
                paymentId: order.transactionId || payment?.transactionId,
                method: order.paymentMethod || payment?.method,
                amount: payment?.amount || split.amount || order.amount,
                cardHolder: payment?.cardHolderName || null,
                cardLast4: payment?.cardNumber || null,
            },
            // --- Products ---
            products: sellerProducts,

            // --- Order Timeline / History ---
            timeline: {
                orderedAt: order.date,
                confirmedAt: split.confirmedAt,
                shippedAt: split.shippedAt,
                outForDeliveryAt: split.outForDeliveryAt,
                deliveredAt: split.deliveredAt,
                returnInitiatedAt: split.returnInitiatedAt,
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch order", error: err.message });
    }
};


// ================= MARK AS SHIPPED =================
export const shipSellerOrder = async (req, res) => {
    try {
        const sellerId = req.seller._id;
        const { orderId } = req.params;
        const { courierName, trackingNumber } = req.body;

        const order = await Order.findOne({ orderId });
        if (!order) return res.status(404).json({ message: "Order not found" });

        const split = order.splitOrders.find(s => s.seller.toString() === sellerId.toString());
        if (!split) return res.status(404).json({ message: "Split order not found" });

        split.courierName = courierName;
        split.trackingNumber = trackingNumber;
        split.status = "shipped";

        await order.save();
        res.json({
            message: "Order marked as shipped", orderId: order._id,
            splitOrderId: split._id,
            status: split.status, order
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

// ================= UPDATE ORDER STATUS =================
export const updateSellerOrderStatus = async (req, res) => {
    try {
        const sellerId = req.seller._id;
        const { orderId } = req.params;
        const { status } = req.body;

        const order = await Order.findOne({ orderId });
        if (!order) return res.status(404).json({ message: "Order not found" });

        const split = order.splitOrders.find(s => s.seller.toString() === sellerId.toString());
        if (!split) return res.status(404).json({ message: "Split order not found" });

        split.status = status;
        await order.save();

        res.json({
            message: "Order status updated", orderId: order._id,
            splitOrderId: split._id,
            status: split.status, order
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

// ================= SELLER DASHBOARD METRICS =================
export const getSellerOrderSummary = async (req, res) => {
    try {
        const sellerId = req.seller._id;
        const now = new Date();

        // Current week (last 7 days)
        const lastWeekStart = new Date();
        lastWeekStart.setDate(now.getDate() - 7);

        // Previous week (7–14 days ago)
        const prevWeekStart = new Date();
        prevWeekStart.setDate(now.getDate() - 14);

        // --- Aggregation for current week ---
        const currentPipeline = [
            { $unwind: "$splitOrders" },
            { $match: { "splitOrders.seller": sellerId } },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    newOrders: {
                        $sum: {
                            $cond: [{ $gte: ["$createdAt", lastWeekStart] }, 1, 0]
                        }
                    },
                    shippedOrders: {
                        $sum: {
                            $cond: [{ $eq: ["$splitOrders.status", "shipped"] }, 1, 0]
                        }
                    },
                    pendingOrders: {
                        $sum: {
                            $cond: [{ $eq: ["$splitOrders.status", "pending"] }, 1, 0]
                        }
                    }
                }
            }
        ];

        const currentResult = await Order.aggregate(currentPipeline);
        const current = currentResult[0] || { totalOrders: 0, newOrders: 0, shippedOrders: 0, pendingOrders: 0 };

        // --- Aggregation for previous week (7-14 days ago) ---
        const prevPipeline = [
            { $unwind: "$splitOrders" },
            { $match: { "splitOrders.seller": sellerId, createdAt: { $gte: prevWeekStart, $lt: lastWeekStart } } },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    newOrders: { $sum: 1 },
                    shippedOrders: {
                        $sum: {
                            $cond: [{ $eq: ["$splitOrders.status", "shipped"] }, 1, 0]
                        }
                    },
                    pendingOrders: {
                        $sum: {
                            $cond: [{ $eq: ["$splitOrders.status", "pending"] }, 1, 0]
                        }
                    }
                }
            }
        ];

        const prevResult = await Order.aggregate(prevPipeline);
        const prev = prevResult[0] || { totalOrders: 0, newOrders: 0, shippedOrders: 0, pendingOrders: 0 };

        // --- Calculate percentage change ---
        const percentageChange = (currentVal, prevVal) => {
            if (prevVal === 0 && currentVal > 0) return 100; // from 0 → increase
            if (prevVal === 0 && currentVal === 0) return 0; // no change
            return ((currentVal - prevVal) / prevVal * 100).toFixed(2);
        };

        const summary = {
            totalOrders: {
                count: current.totalOrders,
                change: percentageChange(current.totalOrders, prev.totalOrders)
            },
            newOrders: {
                count: current.newOrders,
                change: percentageChange(current.newOrders, prev.newOrders)
            },
            shippedOrders: {
                count: current.shippedOrders,
                change: percentageChange(current.shippedOrders, prev.shippedOrders)
            },
            pendingOrders: {
                count: current.pendingOrders,
                change: percentageChange(current.pendingOrders, prev.pendingOrders)
            }
        };

        res.json(summary);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch summary", error: err.message });
    }
};


// ================= LATEST FEATURE: TOP SELLING PRODUCTS =================
export const getTopSellingProducts = async (req, res) => {
    try {
        const sellerId = req.seller._id;
        const topProducts = await Product.find({ seller: sellerId })
            .sort({ sales: -1 })
            .limit(10)
            .select("name sales images");

        res.json({ topProducts });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch top products", error: err.message });
    }
};
