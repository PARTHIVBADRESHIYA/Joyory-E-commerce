import mongoose from 'mongoose';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Review from '../models/Review.js';
import Brand from "../models/Brand.js";
import Category from '../models/Category.js';
import Product from "../models/Product.js";
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween.js'; // ✅ Correct import
dayjs.extend(isBetween);


// ✅ COMMON DATE HELPERS
const getLast12Months = () => {
    const arr = [];
    for (let i = 11; i >= 0; i--) {
        arr.push(dayjs().subtract(i, "month").format("MMM"));
    }
    return arr;
};

const calculateProductRevenue = order => {
    let subtotal = 0;

    for (const item of order.products || []) {
        const product = item.productId;
        if (!product) continue;

        const variant = product.variants?.find(v => v.sku === item.variant?.sku);

        const sellingPrice =
            item.price ??
            item.variant?.displayPrice ??
            variant?.discountedPrice ??
            variant?.displayPrice ??
            product.discountedPrice ??
            product.price ?? 0;

        subtotal += sellingPrice * (item.quantity || 1);
    }

    return Math.max(subtotal - (order.discountAmount || 0), 0);
};


// export const getAnalyticsDashboard = async (req, res) => {
//     try {
//         const { range = "1m" } = req.query;

//         // 🗓️ Define date ranges
//         const now = dayjs();
//         const ranges = {
//             "1d": { start: now.startOf("day"), end: now.endOf("day") },
//             "7d": { start: now.subtract(7, "day").startOf("day"), end: now.endOf("day") },
//             "1m": { start: now.subtract(1, "month").startOf("day"), end: now.endOf("day") },
//             "1y": { start: now.subtract(1, "year").startOf("day"), end: now.endOf("day") },
//             "5y": { start: now.subtract(5, "year").startOf("day"), end: now.endOf("day") },
//         };

//         const { start: currentStart, end: currentEnd } = ranges[range] || ranges["1m"];
//         const periodDuration = currentEnd.diff(currentStart);
//         const previousStart = currentStart.subtract(periodDuration, "ms");
//         const previousEnd = currentStart.subtract(1, "ms");

//         // ⚡ Fetch all orders in last 5 years for context
//         const allOrders = await Order.find({
//             createdAt: { $gte: previousStart.toDate() },
//         })
//             .populate({ path: "products.productId", populate: { path: "category", select: "name" } })
//             .populate("user", "name")
//             .lean();

//         // 📦 Split into current and previous periods
//         const currentOrders = [];
//         const previousOrders = [];

//         allOrders.forEach(o => {
//             const created = dayjs(o.createdAt);
//             if (created.isBetween(currentStart, currentEnd, null, "[]")) currentOrders.push(o);
//             else if (created.isBetween(previousStart, previousEnd, null, "[]")) previousOrders.push(o);
//         });

//         // 📦 Fetch all products
//         const products = await Product.find().populate("category", "name").lean();

//         // 📈 Utility: Calculate growth and trend
//         const calcGrowth = (current, previous = 0) => {
//             if (previous === 0 && current === 0) return { value: 0, changePercent: 0, trend: "neutral" };
//             if (previous === 0) return { value: current, changePercent: 100, trend: "up" };

//             const changePercent = ((current - previous) / previous) * 100;
//             const trend = current > previous ? "up" : current < previous ? "down" : "neutral";
//             return { value: current, changePercent: Number(changePercent.toFixed(1)), trend };
//         };

//         // 💰 Summary metrics (current)
//         const getRevenue = orders =>
//             orders
//                 .filter(o => ["Delivered", "Completed"].includes(o.status))
//                 .reduce((sum, o) => sum + (o.amount || 0), 0);

//         const totalOrders = currentOrders.length;
//         const completedOrders = currentOrders.filter(o => ["Delivered", "Completed"].includes(o.status)).length;
//         const returnOrders = currentOrders.filter(o => ["Cancelled", "Returned"].includes(o.status)).length;
//         const activeOrders = totalOrders - completedOrders - returnOrders;
//         const totalUserPaidRevenue = getRevenue(currentOrders); // OLD
//         const totalProductRevenue = currentOrders
//             .filter(o => ["Delivered", "Completed"].includes(o.status))
//             .reduce((sum, o) => sum + calculateProductRevenue(o), 0);

//         // 💰 Summary metrics (previous)
//         const prevTotalOrders = previousOrders.length;
//         const prevCompletedOrders = previousOrders.filter(o => ["Delivered", "Completed"].includes(o.status)).length;
//         const prevReturnOrders = previousOrders.filter(o => ["Cancelled", "Returned"].includes(o.status)).length;
//         const prevActiveOrders = prevTotalOrders - prevCompletedOrders - prevReturnOrders;
//         const prevTotalRevenue = getRevenue(previousOrders);
//         // 💰 Previous product revenue
//         const prevTotalProductRevenue = previousOrders
//             .filter(o => ["Delivered", "Completed"].includes(o.status))
//             .reduce((sum, o) => sum + calculateProductRevenue(o), 0);

//         const summary = {
//             totalOrders: calcGrowth(totalOrders, prevTotalOrders),
//             completedOrders: calcGrowth(completedOrders, prevCompletedOrders),
//             activeOrders: calcGrowth(activeOrders, prevActiveOrders),
//             returnOrders: calcGrowth(returnOrders, prevReturnOrders),
//             totalUserPaidRevenue: calcGrowth(totalUserPaidRevenue, prevTotalRevenue),
//             totalProductRevenue: calcGrowth(totalProductRevenue, prevTotalProductRevenue)
//         };

//         // 📊 Sales Trends (monthly)
//         const monthlyRevenueMap = {};
//         allOrders.forEach(o => {
//             if (!["Delivered", "Completed"].includes(o.status)) return;
//             const month = dayjs(o.createdAt).format("YYYY-MM");
//             monthlyRevenueMap[month] = (monthlyRevenueMap[month] || 0) + (o.amount || 0);
//         });

//         const salesTrends = Object.entries(monthlyRevenueMap)
//             .map(([month, revenue]) => ({ month, revenue }))
//             .sort((a, b) => a.month.localeCompare(b.month));

//         // ⚠️ Stock Alerts
//         const stockAlerts = [];
//         products.forEach(p => {
//             if (p.quantity <= 5)
//                 stockAlerts.push({ name: p.name, stock: p.quantity, price: p.discountedPrice || p.price });

//             p.variants?.forEach(v => {
//                 if (v.stock <= (v.thresholdValue || 5)) {
//                     stockAlerts.push({
//                         name: `${p.name} (${v.shadeName || "Variant"})`,
//                         stock: v.stock,
//                         price: v.discountedPrice || p.discountedPrice || p.price,
//                     });
//                 }
//             });
//         });

//         // 🧾 Recent Orders
//         const recentOrders = currentOrders
//             .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
//             .slice(0, 6)
//             .map(o => ({
//                 productName: o.products?.[0]?.productId?.name || "N/A",
//                 orderId: o.orderId,
//                 date: dayjs(o.createdAt).format("MMM D, YYYY"),
//                 customerName: o.customerName || o.user?.name || "Guest",
//                 status: o.status,
//                 paymentMode: o.orderType,
//                 amount: o.amount || 0,
//             }));

//         // 🔍 Top Searches (bestsellers)
//         const topSearches = [...products]
//             .sort((a, b) => (b.sales || 0) - (a.sales || 0))
//             .slice(0, 3)
//             .map((p, i) => ({
//                 rank: i + 1,
//                 name: p.name,
//                 price: p.variants?.[0]?.discountedPrice || p.discountedPrice || p.price,
//             }));

//         // 📈 Category Trends
//         const categoryStats = {};
//         allOrders.forEach(order => {
//             if (!["Delivered", "Completed"].includes(order.status)) return;
//             order.products?.forEach(item => {
//                 const product = item.productId;
//                 if (!product?.category) return;
//                 const catName = product.category.name || "Unknown";

//                 if (!categoryStats[catName]) categoryStats[catName] = { sales: 0, revenue: 0 };
//                 const soldQty = item.quantity || 1;
//                 const soldPrice =
//                     item.variant?.discountedPrice ||
//                     item.price ||
//                     product.discountedPrice ||
//                     product.price ||
//                     0;

//                 categoryStats[catName].sales += soldQty;
//                 categoryStats[catName].revenue += soldPrice * soldQty;
//             });
//         });

//         const categoryTrends = Object.entries(categoryStats)
//             .map(([category, stats]) => ({
//                 category,
//                 sales: stats.sales,
//                 revenue: stats.revenue,
//             }))
//             .sort((a, b) => b.sales - a.sales)
//             .slice(0, 5);

//         // ✅ Send final dashboard response
//         res.status(200).json({
//             success: true,
//             summary,
//             salesTrends,
//             stockAlerts,
//             recentOrders,
//             topSearches,
//             categoryTrends,
//         });
//     } catch (error) {
//         console.error("🔥 Dashboard Error:", error);
//         res
//             .status(500)
//             .json({ success: false, message: "Failed to load admin dashboard", error: error.message });
//     }
// };


// Regex for status detection
const deliveredRegex = /delivered|completed/i;
const cancelRegex = /cancel/i;

// Calculate growth
const calcGrowth = (current, previous = 0) => {
    if (previous === 0 && current === 0)
        return { value: 0, changePercent: 0, trend: "neutral" };

    if (previous === 0)
        return { value: current, changePercent: 100, trend: "up" };

    const percent = ((current - previous) / previous) * 100;
    const trend = current > previous ? "up" : current < previous ? "down" : "neutral";

    return { value: current, changePercent: Number(percent.toFixed(1)), trend };
};

export const getAnalyticsDashboard = async (req, res) => {
    try {
        const { range = "1m" } = req.query;

        const now = dayjs();
        const ranges = {
            "1d": { start: now.startOf("day"), end: now.endOf("day") },
            "7d": { start: now.subtract(7, "day").startOf("day"), end: now.endOf("day") },
            "1m": { start: now.subtract(1, "month").startOf("day"), end: now.endOf("day") },
            "1y": { start: now.subtract(1, "year").startOf("day"), end: now.endOf("day") },
            "5y": { start: now.subtract(5, "year").startOf("day"), end: now.endOf("day") },
        };

        const { start: currentStart, end: currentEnd } = ranges[range] || ranges["1m"];
        const periodMs = currentEnd.diff(currentStart);

        const prevStart = currentStart.subtract(periodMs, "ms");
        const prevEnd = currentStart.subtract(1, "ms");

        // ------------------------------
        // BASIC COUNTS
        // ------------------------------
        const [
            totalOrders,
            prevTotalOrders,
            refundOrders,
            prevRefundOrders,
            draftOrdersCount
        ] = await Promise.all([
            Order.countDocuments({ isDraft: false, createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() } }),
            Order.countDocuments({ isDraft: false, createdAt: { $gte: prevStart.toDate(), $lte: prevEnd.toDate() } }),

            Order.countDocuments({
                isDraft: false,
                "refund.status": "completed",
                "refund.refundedAt": { $gte: currentStart.toDate(), $lte: currentEnd.toDate() }
            }),
            Order.countDocuments({
                isDraft: false,
                "refund.status": "completed",
                "refund.refundedAt": { $gte: prevStart.toDate(), $lte: prevEnd.toDate() }
            }),

            Order.countDocuments({ isDraft: true })
        ]);

        // ------------------------------
        // COMPLETED / CANCELLED (trackingHistory)
        // ------------------------------
        const makeStatusAgg = (regex, start, end) => [
            { $match: { isDraft: false } },
            { $unwind: "$trackingHistory" },
            {
                $match: {
                    "trackingHistory.status": regex,
                    "trackingHistory.timestamp": { $gte: start.toDate(), $lte: end.toDate() }
                }
            },
            { $group: { _id: "$_id" } },
            { $count: "count" }
        ];

        const [
            completedAgg,
            prevCompletedAgg,
            cancelledAgg,
            prevCancelledAgg
        ] = await Promise.all([
            Order.aggregate(makeStatusAgg(deliveredRegex, currentStart, currentEnd)),
            Order.aggregate(makeStatusAgg(deliveredRegex, prevStart, prevEnd)),
            Order.aggregate(makeStatusAgg(cancelRegex, currentStart, currentEnd)),
            Order.aggregate(makeStatusAgg(cancelRegex, prevStart, prevEnd)),
        ]);

        const completedOrders = completedAgg?.[0]?.count || 0;
        const prevCompletedOrders = prevCompletedAgg?.[0]?.count || 0;

        const cancelledOrders = cancelledAgg?.[0]?.count || 0;
        const prevCancelledOrders = prevCancelledAgg?.[0]?.count || 0;

        // ------------------------------
        // ACTIVE ORDERS
        // ------------------------------
        const activeOrders = totalOrders - completedOrders - cancelledOrders - refundOrders;
        const prevActiveOrders = prevTotalOrders - prevCompletedOrders - prevCancelledOrders - prevRefundOrders;

        // ------------------------------
        // REFUND LOSS + PENDING REFUNDS
        // ------------------------------
        const refundSumAgg = await Order.aggregate([
            {
                $match: {
                    isDraft: false,
                    "refund.status": "completed",
                    "refund.refundedAt": { $gte: currentStart.toDate(), $lte: currentEnd.toDate() }
                }
            },
            { $group: { _id: null, total: { $sum: "$refund.amount" } } }
        ]);

        const totalRefundLoss = refundSumAgg?.[0]?.total || 0;

        const pendingRefundCount = await Order.countDocuments({
            isDraft: false,
            "refund.status": { $in: ["requested", "initiated", "processing"] }
        });

        // ------------------------------
        // CANCELLED LOSS (sum order.amount)
        // ------------------------------
        const cancelledLossAgg = await Order.aggregate([
            { $match: { isDraft: false } },
            { $unwind: "$trackingHistory" },
            {
                $match: {
                    "trackingHistory.status": cancelRegex,
                    "trackingHistory.timestamp": { $gte: currentStart.toDate(), $lte: currentEnd.toDate() }
                }
            },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        const totalCancelledLoss = cancelledLossAgg?.[0]?.total || 0;

        // ------------------------------
        // REVENUE AGGREGATION
        // ------------------------------
        const revenueAgg = await Order.aggregate([
            { $match: { isDraft: false, createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() } } },
            { $unwind: "$trackingHistory" },
            { $match: { "trackingHistory.status": deliveredRegex } },
            { $unwind: "$products" },
            {
                $addFields: {
                    "products.priceUsed": {
                        $ifNull: [
                            "$products.variant.discountedPrice",
                            "$products.price",
                            "$products.variant.displayPrice",
                            0
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: "$_id",
                    orderAmount: { $first: "$amount" },
                    productTotal: { $sum: { $multiply: ["$products.quantity", "$products.priceUsed"] } },
                    discount: { $first: { $add: [{ $ifNull: ["$discountAmount", 0] }, { $ifNull: ["$buyerDiscountAmount", 0] }] } },
                    giftCard: { $first: { $ifNull: ["$giftCard.amount", 0] } }
                }
            },
            {
                $group: {
                    _id: null,
                    totalUserPaidRevenue: { $sum: "$orderAmount" },
                    totalCompanyProductRevenue: { $sum: "$productTotal" },
                    totalDiscountGiven: { $sum: "$discount" },
                    totalGiftCardRevenue: { $sum: "$giftCard" },
                    countOrders: { $sum: 1 }
                }
            }
        ]);

        const revenue = revenueAgg?.[0] || {
            totalUserPaidRevenue: 0,
            totalCompanyProductRevenue: 0,
            totalDiscountGiven: 0,
            totalGiftCardRevenue: 0,
            countOrders: 0
        };

        // ------------------------------
        // CALCULATED KPIs
        // ------------------------------
        const netRevenue = revenue.totalUserPaidRevenue - totalRefundLoss;

        const completedCount = revenue.countOrders;
        const AOV = completedCount ? Number((revenue.totalUserPaidRevenue / completedCount).toFixed(2)) : 0;

        // repeat customer / unique customer
        const userAgg = await Order.aggregate([
            { $match: { isDraft: false, createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() } } },
            { $unwind: "$trackingHistory" },
            { $match: { "trackingHistory.status": deliveredRegex } },
            { $group: { _id: "$user", orders: { $sum: 1 } } }
        ]);

        const uniqueCustomers = userAgg.length;
        const repeatCustomerCount = userAgg.filter(u => u.orders > 1).length;
        const AOC = uniqueCustomers ? Number((completedCount / uniqueCustomers).toFixed(2)) : 0;

        // ------------------------------
        // NEW USERS
        // ------------------------------
        const newUsersCount = await Order.distinct("user", {
            createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() }
        }).then(users => users.length);

        // ------------------------------
        // PAYMENT SPLIT
        // ------------------------------
        const paymentSplit = {};
        const paymentAgg = await Order.aggregate([
            { $match: { isDraft: false, createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() } } },
            { $unwind: "$trackingHistory" },
            { $match: { "trackingHistory.status": deliveredRegex } },
            {
                $group: {
                    _id: "$orderType",
                    count: { $sum: 1 },
                    revenue: { $sum: "$amount" }
                }
            }
        ]);
        paymentAgg.forEach(p => {
            paymentSplit[p._id || "unknown"] = { count: p.count, revenue: p.revenue };
        });

        // ------------------------------
        // TOP PRODUCTS
        // ------------------------------
        const topProducts = await Order.aggregate([
            { $match: { isDraft: false, createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() } } },
            { $unwind: "$trackingHistory" },
            { $match: { "trackingHistory.status": deliveredRegex } },
            { $unwind: "$products" },
            {
                $group: {
                    _id: "$products.productId",
                    qtySold: { $sum: "$products.quantity" },
                    revenue: {
                        $sum: {
                            $multiply: ["$products.quantity", { $ifNull: ["$products.variant.discountedPrice", "$products.price"] }]
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: Product.collection.name,
                    localField: "_id",
                    foreignField: "_id",
                    as: "product"
                }
            },
            { $unwind: "$product" },
            { $sort: { qtySold: -1 } },
            { $limit: 10 }
        ]);

        // ------------------------------
        // TOP CATEGORIES
        // ------------------------------
        const topCategories = await Order.aggregate([
            { $match: { isDraft: false, createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() } } },
            { $unwind: "$trackingHistory" },
            { $match: { "trackingHistory.status": deliveredRegex } },
            { $unwind: "$products" },
            {
                $lookup: {
                    from: Product.collection.name,
                    localField: "products.productId",
                    foreignField: "_id",
                    as: "product"
                }
            },
            { $unwind: "$product" },
            {
                $group: {
                    _id: "$product.category",
                    sales: { $sum: "$products.quantity" }
                }
            },
            {
                $lookup: {
                    from: Category.collection.name,
                    localField: "_id",
                    foreignField: "_id",
                    as: "category"
                }
            },
            { $unwind: "$category" },
            { $sort: { sales: -1 } },
            { $limit: 10 }
        ]);

        // ------------------------------
        // TOP BRANDS
        // ------------------------------
        const topBrands = await Order.aggregate([
            { $match: { isDraft: false, createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() } } },
            { $unwind: "$trackingHistory" },
            { $match: { "trackingHistory.status": deliveredRegex } },
            { $unwind: "$products" },
            {
                $lookup: {
                    from: Product.collection.name,
                    localField: "products.productId",
                    foreignField: "_id",
                    as: "product"
                }
            },
            { $unwind: "$product" },
            {
                $group: {
                    _id: "$product.brand",
                    sales: { $sum: "$products.quantity" }
                }
            },
            {
                $lookup: {
                    from: Brand.collection.name,
                    localField: "_id",
                    foreignField: "_id",
                    as: "brand"
                }
            },
            { $unwind: "$brand" },
            { $sort: { sales: -1 } },
            { $limit: 10 }
        ]);

        // ------------------------------
        // STOCK ALERTS (auto generate)
        // ------------------------------
        const stockAlerts = await Product.find(
            { stock: { $lte: 6 } },
            { name: 1, stock: 1, price: 1 }
        ).sort({ stock: 1 });

        // ------------------------------
        // RECENT ORDERS
        // ------------------------------
        const recentOrders = await Order.find(
            { isDraft: false },
            { products: 1, amount: 1, orderId: 1, createdAt: 1, customerName: 1, orderType: 1, status: 1 }
        )
            .populate("products.productId", "name")
            .sort({ createdAt: -1 })
            .limit(10);

        const formattedOrders = recentOrders.map(o => ({
            productName: o.products?.[0]?.productId?.name || "N/A",
            orderId: o.orderId,
            date: dayjs(o.createdAt).format("MMM D, YYYY"),
            customerName: o.customerName || "Unknown",
            status: o.status || "Pending",
            paymentMode: o.orderType,
            amount: o.amount
        }));

        // ------------------------------
        // CATEGORY TRENDS (based on sales)
        // ------------------------------
        const categoryTrends = await Order.aggregate([
            { $match: { isDraft: false, createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() } } },
            { $unwind: "$trackingHistory" },
            { $match: { "trackingHistory.status": deliveredRegex } },
            { $unwind: "$products" },
            {
                $lookup: {
                    from: Product.collection.name,
                    localField: "products.productId",
                    foreignField: "_id",
                    as: "product"
                }
            },
            { $unwind: "$product" },
            {
                $group: {
                    _id: "$product.category",
                    sales: { $sum: "$products.quantity" },
                    revenue: {
                        $sum: {
                            $multiply: ["$products.quantity", { $ifNull: ["$products.variant.discountedPrice", "$products.price"] }]
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: Category.collection.name,
                    localField: "_id",
                    foreignField: "_id",
                    as: "category"
                }
            },
            { $unwind: "$category" },
            {
                $project: {
                    category: "$category.name",
                    sales: 1,
                    revenue: 1
                }
            },
            { $sort: { sales: -1 } }
        ]);

        // ------------------------------
        // FINAL RESPONSE
        // ------------------------------
        res.json({
            success: true,
            summary: {
                totalOrders: calcGrowth(totalOrders, prevTotalOrders),
                completedOrders: calcGrowth(completedOrders, prevCompletedOrders),
                activeOrders: calcGrowth(activeOrders, prevActiveOrders),
                cancelledOrders: calcGrowth(cancelledOrders, prevCancelledOrders),
                refundOrders: calcGrowth(refundOrders, prevRefundOrders),
                draftOrders: { value: draftOrdersCount },

                totalUserPaidRevenue: calcGrowth(revenue.totalUserPaidRevenue, 0),
                totalCompanyRevenue: calcGrowth(revenue.totalCompanyProductRevenue, 0),
                totalDiscountGiven: calcGrowth(revenue.totalDiscountGiven, 0),
                totalGiftCardRevenue: calcGrowth(revenue.totalGiftCardRevenue, 0),

                totalRefundLoss,
                totalCancelledLoss,
                netRevenue,
                AOV,
                AOC,
                repeatCustomerCount,
                uniqueCustomers,
                pendingRefundCount,
                paymentSplit,
                conversionRate: null,
                newUsersCount,
                profitEstimation: null
            },

            revenueBreakdown: {
                userPaid: revenue.totalUserPaidRevenue,
                companyProductRevenue: revenue.totalCompanyProductRevenue,
                discounts: revenue.totalDiscountGiven,
                giftCard: revenue.totalGiftCardRevenue,
                refunds: totalRefundLoss,
                cancelledLoss: totalCancelledLoss,
                netRevenue
            },

            topProducts,
            topCategories,
            topBrands,
            stockAlerts,
            recentOrders: formattedOrders,
            categoryTrends
        });

    } catch (err) {
        console.error("Dashboard error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};



export const getBestSellingCategories = async () => {
    const products = await Product.find()
        .populate("category", "name")
        .select("price buyingPrice variants category")
        .lean();

    const catStats = {};

    for (const p of products) {
        const totalVariantSales = p.variants.reduce((sum, v) => sum + v.sales, 0);
        if (!p.category?.name) continue;

        if (!catStats[p.category.name]) {
            catStats[p.category.name] = { turnover: 0, totalSales: 0 };
        }

        // Turnover (total sales * avg variant selling price)
        const avgPrice =
            p.variants.length > 0
                ? p.variants.reduce(
                    (sum, v) =>
                        sum + (v.discountedPrice || v.displayPrice || p.price || 0),
                    0
                ) / p.variants.length
                : p.price || 0;

        catStats[p.category.name].turnover += totalVariantSales * avgPrice;
        catStats[p.category.name].totalSales += totalVariantSales;
    }

    const formatted = Object.entries(catStats).map(([cat, stat]) => ({
        category: cat,
        turnover: stat.turnover,
        totalSales: stat.totalSales,
        increaseBy: (Math.random() * 3).toFixed(1),
    }));

    return formatted.sort((a, b) => b.turnover - a.turnover).slice(0, 3);
};

export const getProfitRevenueOverview = async () => {
    const orders = await Order.find({ paymentStatus: "success" })
        .populate("products.productId", "buyingPrice price discountedPrice variants")
        .lean();

    let totalRevenue = 0; // customer-paid (excluding shipping)
    let totalPurchase = 0; // actual cost (buying price)
    let totalSales = 0;

    for (const order of orders) {
        let orderSubtotal = 0;

        for (const item of order.products || []) {
            const product = item.productId;
            if (!product) continue;

            const variant = product.variants?.find(v => v.sku === item.variant?.sku);

            // ✅ Determine the actual selling price used in this order
            const sellingPrice =
                item.price ??
                item.variant?.displayPrice ??
                variant?.discountedPrice ??
                variant?.displayPrice ??
                product.discountedPrice ??
                product.price ??
                0;

            const costPrice = product.buyingPrice || 0;
            const qty = item.quantity || 1;

            orderSubtotal += sellingPrice * qty;
            totalPurchase += costPrice * qty;
            totalSales += qty;
        }

        // ✅ Subtract coupon or discount amount if present
        const couponDiscount = order.discountAmount || 0;

        // ✅ Final revenue = product subtotal - discounts
        // Shipping is *excluded* to measure pure product turnover
        const orderRevenue = orderSubtotal - couponDiscount;

        totalRevenue += Math.max(orderRevenue, 0);
    }

    const totalProfit = totalRevenue - totalPurchase;

    return {
        totalRevenue: Math.round(totalRevenue),
        totalProfit: Math.round(totalProfit),
        totalSales,
        netPurchaseValue: Math.round(totalPurchase),
        netSalesValue: Math.round(totalRevenue),
    };
};

export const getProfitRevenueTrend = async () => {
    const months = getLast12Months();
    const revenueArr = [];
    const profitArr = [];

    const allOrders = await Order.find({ paymentStatus: "success" })
        .populate("products.productId", "buyingPrice price discountedPrice variants")
        .lean();

    for (let i = 11; i >= 0; i--) {
        const start = dayjs().subtract(i, "month").startOf("month").toDate();
        const end = dayjs().subtract(i, "month").endOf("month").toDate();

        const monthlyOrders = allOrders.filter(
            o => o.createdAt >= start && o.createdAt <= end
        );

        let monthlyRevenue = 0;
        let monthlyPurchase = 0;

        for (const order of monthlyOrders) {
            let orderSubtotal = 0;

            for (const item of order.products || []) {
                const product = item.productId;
                if (!product) continue;

                const variant = product.variants?.find(v => v.sku === item.variant?.sku);

                const sellingPrice =
                    item.price ??
                    item.variant?.displayPrice ??
                    variant?.discountedPrice ??
                    variant?.displayPrice ??
                    product.discountedPrice ??
                    product.price ??
                    0;

                const costPrice = product.buyingPrice || 0;
                const qty = item.quantity || 1;

                orderSubtotal += sellingPrice * qty;
                monthlyPurchase += costPrice * qty;
            }

            const couponDiscount = order.discountAmount || 0;
            const orderRevenue = orderSubtotal - couponDiscount;

            monthlyRevenue += Math.max(orderRevenue, 0);
        }

        const monthlyProfit = monthlyRevenue - monthlyPurchase;

        revenueArr.push(Math.round(monthlyRevenue));
        profitArr.push(Math.round(monthlyProfit));
    }

    return { months, revenueArr, profitArr };
};

export const getBestSellingProducts = async () => {
    const products = await Product.find().select("name category variants price").lean();

    const arr = [];

    for (const p of products) {
        for (const v of p.variants) {
            if (v.sales > 0) {
                const sellingPrice =
                    v.discountedPrice || v.displayPrice || p.price || 0;

                arr.push({
                    name: `${p.name} - ${v.shadeName || v.sku}`,
                    productId: p._id,
                    category: p.category,
                    remainingQty: v.stock,
                    totalSales: v.sales,
                    turnover: v.sales * sellingPrice,
                    increaseBy: (Math.random() * 2).toFixed(1),
                });
            }
        }
    }

    return arr.sort((a, b) => b.turnover - a.turnover).slice(0, 5);
};

export const getCustomerVolumeAnalytics = async () => {
    const totalCustomers = await User.countDocuments();
    const thirtyDaysAgo = dayjs().subtract(30, "day").toDate();

    const newCustomers = await User.countDocuments({
        createdAt: { $gte: thirtyDaysAgo },
    });

    const oldCustomers = totalCustomers - newCustomers;
    const newPct = totalCustomers ? Math.round((newCustomers / totalCustomers) * 100) : 0;

    return {
        totalCustomers,
        newCustomers,
        oldCustomers,
        newCustomerPercentage: newPct,
        oldCustomerPercentage: 100 - newPct,
    };
};

export const getCustomerBehaviorAnalytics = async () => {
    const reviews = await Review.find().select("rating").lean();

    let excellent = 0,
        good = 0,
        poor = 0;

    for (const r of reviews) {
        if (r.rating >= 4.5) excellent++;
        else if (r.rating >= 3) good++;
        else poor++;
    }

    const total = excellent + good + poor || 1;

    return {
        excellent: Math.round((excellent / total) * 100),
        good: Math.round((good / total) * 100),
        poor: Math.round((poor / total) * 100),
    };
};

export const getFullDashboard = async (req, res) => {
    try {
        const overview = await getProfitRevenueOverview();
        const trend = await getProfitRevenueTrend();
        const bestCategories = await getBestSellingCategories();
        const bestProducts = await getBestSellingProducts();
        const customerVolume = await getCustomerVolumeAnalytics();
        const customerBehavior = await getCustomerBehaviorAnalytics();

        res.status(200).json({
            overview,
            trend,
            bestCategories,
            bestProducts,
            customerVolume,
            customerBehavior
        });

    } catch (err) {
        console.error("Dashboard error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to load dashboard analytics",
            error: err.message
        });
    }
};