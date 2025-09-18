
// import mongoose from "mongoose";
// import Seller from "../../models/sellers/Seller.js";
// import Order from "../../models/Order.js";

// // ================= LIST ORDERS =================
// export const listSellerOrders = async (req, res) => {
//     try {
//         const seller = req.seller;
//         const page = parseInt(req.query.page) || 1;
//         const limit = Math.min(parseInt(req.query.limit) || 20, 100);
//         const skip = (page - 1) * limit;

//         const results = await Order.aggregate([
//             { $match: { "splitOrders.seller": seller._id } },
//             { $sort: { createdAt: -1 } },
//             { $skip: skip },
//             { $limit: limit },
//             {
//                 $project: {
//                     orderId: 1,
//                     orderNumber: 1,
//                     user: 1,
//                     date: 1,
//                     customerName: 1,
//                     status: 1,
//                     orderType: 1,
//                     paid: 1,
//                     paymentStatus: 1,
//                     shippingAddress: 1,
//                     splitOrders: {
//                         $filter: {
//                             input: "$splitOrders",
//                             as: "so",
//                             cond: { $eq: ["$$so.seller", seller._id] }
//                         }
//                     }
//                 }
//             },
//             {
//                 // Recalculate the amount for this seller only
//                 $addFields: {
//                     amount: { $sum: "$splitOrders.amount" }
//                 }
//             }
//         ]);


//         if (!results.length) {
//             results = await Order.aggregate([
//                 { $match: { "products.seller": seller._id, paid: true } },
//                 { $sort: { createdAt: -1 } },
//                 { $skip: skip },
//                 { $limit: limit },
//             ]);
//         }

//         return res.json({ data: results, page, limit });
//     } catch (err) {
//         return res.status(500).json({ message: "Server error", error: err.message });
//     }
// };

// // ================= SHIP ORDER =================
// export const shipOrder = async (req, res) => {
//     try {
//         const { orderId } = req.params;
//         const { trackingNumber, courierName } = req.body;

//         const order = await Order.findOne({ orderId });
//         if (!order) return res.status(404).json({ message: "Order not found" });

//         const split = (order.splitOrders || []).find(
//             (s) => s.seller?.toString() === req.seller._id.toString()
//         );
//         if (!split) return res.status(404).json({ message: "Split order not found" });

//         split.trackingNumber = trackingNumber;
//         split.courierName = courierName;
//         split.status = "shipped";

//         await order.save();
//         return res.json({ message: "Marked shipped", order });
//     } catch (err) {
//         return res.status(500).json({ message: "Server error", error: err.message });
//     }
// };






















// controllers/sellers/sellerOrderController.js
import mongoose from "mongoose";
import Order from "../../models/Order.js";
import Product from "../../models/Product.js";

// ================= LIST SELLER ORDERS =================
// export const listSellerOrders = async (req, res) => {
//     try {
//         const sellerId = req.seller._id;
//         const page = parseInt(req.query.page) || 1;
//         const limit = Math.min(parseInt(req.query.limit) || 20, 100);
//         const skip = (page - 1) * limit;

//         const { status, fromDate, toDate, orderType } = req.query;
//         const match = { "splitOrders.seller": sellerId };

//         if (status && status !== "all") match["splitOrders.status"] = status;
//         if (orderType && orderType !== "all") match.orderType = orderType;
//         if (fromDate || toDate) {
//             match.createdAt = {};
//             if (fromDate) match.createdAt.$gte = new Date(fromDate);
//             if (toDate) match.createdAt.$lte = new Date(toDate);
//         }

//         const orders = await Order.aggregate([
//             { $match: match },
//             { $sort: { createdAt: -1 } },
//             { $skip: skip },
//             { $limit: limit },
//             {
//                 $addFields: {
//                     splitOrder: {
//                         $filter: {
//                             input: "$splitOrders",
//                             as: "so",
//                             cond: { $eq: ["$$so.seller", sellerId] }
//                         }
//                     }
//                 }
//             },
//             {
//                 $addFields: {
//                     amount: { $sum: "$splitOrder.amount" }
//                 }
//             },
//             {
//                 $project: {
//                     orderId: 1,
//                     orderNumber: 1,
//                     date: 1,
//                     customerName: 1,
//                     status: { $arrayElemAt: ["$splitOrder.status", 0] },
//                     paid: { $arrayElemAt: ["$splitOrder.paid", 0] },
//                     paymentStatus: 1,
//                     amount: 1,
//                     shippingAddress: 1,
//                     products: 1,
//                     courierName: { $arrayElemAt: ["$splitOrder.courierName", 0] },
//                     trackingNumber: { $arrayElemAt: ["$splitOrder.trackingNumber", 0] },
//                 }
//             }
//         ]);

//         res.json({ data: orders, page, limit });
//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ message: "Server error", error: err.message });
//     }
// };
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
                    _id: 1,  // ✅ include order MongoDB ID
                    orderId: 1,
                    orderNumber: 1,
                    date: 1,
                    customerName: 1,
                    status: { $arrayElemAt: ["$splitOrder.status", 0] },
                    splitOrderId: { $arrayElemAt: ["$splitOrder._id", 0] }, // optional
                    paid: { $arrayElemAt: ["$splitOrder.paid", 0] },
                    paymentStatus: 1,
                    amount: 1,
                    shippingAddress: 1,
                    products: 1,
                    courierName: { $arrayElemAt: ["$splitOrder.courierName", 0] },
                    trackingNumber: { $arrayElemAt: ["$splitOrder.trackingNumber", 0] },
                }
            }
        ]);

        res.json({ data: orders, page, limit });
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

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid order ID" });
        }

        const order = await Order.findById(id)
            .populate("products.productId", "name brand images category seller")
            .populate("user", "name email phone")
            .lean();

        if (!order) return res.status(404).json({ message: "Order not found" });

        const split = (order.splitOrders || []).find(
            s => s.seller.toString() === sellerId.toString()
        );
        if (!split) return res.status(403).json({ message: "You cannot view this order" });

        const sellerProducts = order.products.filter(
            p => p.productId?.seller?.toString() === sellerId.toString()
        );

        res.json({
            _id: order._id,
            orderId: order.orderId,
            orderNumber: order.orderNumber,
            date: order.date,
            customer: order.user ? {
                id: order.user._id,
                name: order.user.name,
                email: order.user.email,
                phone: order.user.phone
            } : { name: order.customerName },
            status: split.status,
            paid: split.paid,
            paymentStatus: order.paymentStatus,
            amount: split.amount,
            shippingAddress: order.shippingAddress,
            courierName: split.courierName,
            trackingNumber: split.trackingNumber,
            products: sellerProducts.map(p => ({
                _id: p._id,                        // entry ID in order.products[]
                productId: p.productId?._id,       // actual Product ID
                name: p.productId?.name,
                brand: p.productId?.brand,
                image: p.productId?.images?.[0] || null,
                category: p.productId?.category || null,
                quantity: p.quantity,
                price: p.price,
                total: p.quantity * p.price
            }))
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
// export const getSellerOrderSummary = async (req, res) => {
//     try {
//         const sellerId = req.seller._id;
//         const now = new Date();
//         const lastWeek = new Date();
//         lastWeek.setDate(now.getDate() - 7);

//         const totalOrders = await Order.countDocuments({ "splitOrders.seller": sellerId });
//         const newOrders = await Order.countDocuments({
//             "splitOrders.seller": sellerId,
//             createdAt: { $gte: lastWeek }
//         });
//         const shippedOrders = await Order.countDocuments({
//             "splitOrders.seller": sellerId,
//             "splitOrders.status": "shipped"
//         });
//         const pendingOrders = await Order.countDocuments({
//             "splitOrders.seller": sellerId,
//             "splitOrders.status": "pending"
//         });

//         res.json({ totalOrders, newOrders, shippedOrders, pendingOrders });
//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ message: "Failed to fetch summary", error: err.message });
//     }
// };

export const getSellerOrderSummary = async (req, res) => {
    try {
        const sellerId = req.seller._id;
        const now = new Date();
        const lastWeek = new Date();
        lastWeek.setDate(now.getDate() - 7);

        const pipeline = [
            { $unwind: "$splitOrders" },
            { $match: { "splitOrders.seller": sellerId } },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    newOrders: {
                        $sum: {
                            $cond: [{ $gte: ["$createdAt", lastWeek] }, 1, 0]
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

        const result = await Order.aggregate(pipeline);
        const summary = result[0] || { totalOrders: 0, newOrders: 0, shippedOrders: 0, pendingOrders: 0 };

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
