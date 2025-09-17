
import mongoose from "mongoose";
import Seller from "../../models/sellers/Seller.js";
import Order from "../../models/Order.js";

// ================= LIST ORDERS =================
export const listSellerOrders = async (req, res) => {
    try {
        const seller = req.seller;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const skip = (page - 1) * limit;

        const results = await Order.aggregate([
            { $match: { "splitOrders.seller": seller._id } },
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
                $project: {
                    orderId: 1,
                    orderNumber: 1,
                    user: 1,
                    date: 1,
                    customerName: 1,
                    status: 1,
                    orderType: 1,
                    paid: 1,
                    paymentStatus: 1,
                    shippingAddress: 1,
                    splitOrders: {
                        $filter: {
                            input: "$splitOrders",
                            as: "so",
                            cond: { $eq: ["$$so.seller", seller._id] }
                        }
                    }
                }
            },
            {
                // Recalculate the amount for this seller only
                $addFields: {
                    amount: { $sum: "$splitOrders.amount" }
                }
            }
        ]);


        if (!results.length) {
            results = await Order.aggregate([
                { $match: { "products.seller": seller._id, paid: true } },
                { $sort: { createdAt: -1 } },
                { $skip: skip },
                { $limit: limit },
            ]);
        }

        return res.json({ data: results, page, limit });
    } catch (err) {
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};

// ================= SHIP ORDER =================
export const shipOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { trackingNumber, courierName } = req.body;

        const order = await Order.findOne({ orderId });
        if (!order) return res.status(404).json({ message: "Order not found" });

        const split = (order.splitOrders || []).find(
            (s) => s.seller?.toString() === req.seller._id.toString()
        );
        if (!split) return res.status(404).json({ message: "Split order not found" });

        split.trackingNumber = trackingNumber;
        split.courierName = courierName;
        split.status = "shipped";

        await order.save();
        return res.json({ message: "Marked shipped", order });
    } catch (err) {
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};