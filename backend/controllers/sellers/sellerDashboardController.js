// controllers/sellerDashboardController.js
import Order from "../../models/Order.js";
import Product from "../../models/Product.js";
import PayoutLedger from "../../models/PayoutLedger.js";

export const getSellerDashboard = async (req, res) => {
    try {
        const sellerId = req.seller._id;

        // --- Sales summary ---
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const weekAgo = new Date(); weekAgo.setDate(today.getDate() - 7);
        const monthAgo = new Date(); monthAgo.setDate(today.getDate() - 30);

        const [todaySales, weekSales, monthSales] = await Promise.all([
            Order.aggregate([
                { $match: { "splitOrders.seller": sellerId, createdAt: { $gte: today }, paid: true } },
                { $unwind: "$splitOrders" },
                { $match: { "splitOrders.seller": sellerId } },
                { $group: { _id: null, total: { $sum: "$splitOrders.amount" } } }
            ]),
            Order.aggregate([
                { $match: { "splitOrders.seller": sellerId, createdAt: { $gte: weekAgo }, paid: true } },
                { $unwind: "$splitOrders" },
                { $match: { "splitOrders.seller": sellerId } },
                { $group: { _id: null, total: { $sum: "$splitOrders.amount" } } }
            ]),
            Order.aggregate([
                { $match: { "splitOrders.seller": sellerId, createdAt: { $gte: monthAgo }, paid: true } },
                { $unwind: "$splitOrders" },
                { $match: { "splitOrders.seller": sellerId } },
                { $group: { _id: null, total: { $sum: "$splitOrders.amount" } } }
            ])
        ]);

        // --- Orders at a glance ---
        const orderCounts = await Order.aggregate([
            { $match: { "splitOrders.seller": sellerId } },
            { $unwind: "$splitOrders" },
            { $match: { "splitOrders.seller": sellerId } },
            { $group: { _id: "$splitOrders.status", count: { $sum: 1 } } }
        ]);

        // --- Earnings ---
        const payouts = await PayoutLedger.find({ seller: sellerId });

        const totalGross = payouts.reduce((sum, p) => sum + (p.grossAmount || 0), 0);
        const totalCommission = payouts.reduce((sum, p) => sum + (p.commissionAmount || 0), 0);
        const totalRefunds = payouts.reduce((sum, p) => sum + (p.refunds || 0), 0);
        const totalFees = payouts.reduce((sum, p) => sum + (p.fees || 0), 0);
        const totalNet = payouts.reduce((sum, p) => sum + (p.netPayable || 0), 0);

        // --- Stock alerts ---
        const products = await Product.find({ seller: sellerId });

        const lowStockProducts = [];
        const outOfStockProducts = [];

        products.forEach((product) => {
            // main product stock
            if (product.quantity > 0 && product.quantity <= (product.thresholdValue || 5)) {
                lowStockProducts.push({ _id: product._id, name: product.name, quantity: product.quantity });
            }
            if (product.quantity === 0) {
                outOfStockProducts.push({ _id: product._id, name: product.name });
            }

            // check variants stock
            if (product.variants && product.variants.length) {
                product.variants.forEach((v) => {
                    if (v.stock > 0 && v.stock <= (product.thresholdValue || 5)) {
                        lowStockProducts.push({ _id: product._id, name: product.name, variant: v.shadeName, quantity: v.stock });
                    }
                    if (v.stock === 0) {
                        outOfStockProducts.push({ _id: product._id, name: product.name, variant: v.shadeName });
                    }
                });
            }
        });

        // --- Final Response ---
        res.json({
            salesSummary: {
                today: todaySales[0]?.total || 0,
                week: weekSales[0]?.total || 0,
                month: monthSales[0]?.total || 0,
            },
            ordersSummary: orderCounts,
            earningsBreakdown: {
                gross: totalGross,
                commission: totalCommission,
                refunds: totalRefunds,
                fees: totalFees,
                net: totalNet,
            },
            stockAlerts: {
                low: lowStockProducts,
                out: outOfStockProducts,
            },
            notifications: [] // hook in returns/payout updates later
        });

    } catch (err) {
        res.status(500).json({ message: "Error fetching dashboard", error: err.message });
    }
};
