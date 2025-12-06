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

const calcGrowth = (current, previous) => {
    if (previous === 0) {
        return { value: current, changePercent: current > 0 ? 100 : 0, trend: current > 0 ? "up" : "neutral" };
    }
    const changePercent = ((current - previous) / previous) * 100;
    const trend = changePercent > 0 ? "up" : changePercent < 0 ? "down" : "neutral";
    return { value: current, changePercent: Number(changePercent.toFixed(2)), trend };
};

// const deliveredStatus = "Delivered";
// const cancelledStatus = "Cancelled";
// const refundStatuses = ["refund_initiated", "refunded"];

// export const getAnalyticsDashboard = async (req, res) => {
//     try {
//         const { range = "1m" } = req.query;

//         const now = dayjs();
//         const ranges = {
//             "1d": { start: now.startOf("day"), end: now.endOf("day") },
//             "7d": { start: now.subtract(7, "day").startOf("day"), end: now.endOf("day") },
//             "1m": { start: now.subtract(1, "month").startOf("day"), end: now.endOf("day") },
//             "1y": { start: now.subtract(1, "year").startOf("day"), end: now.endOf("day") },
//             "5y": { start: now.subtract(5, "year").startOf("day"), end: now.endOf("day") },
//         };

//         const { start: currentStart, end: currentEnd } = ranges[range] || ranges["1m"];
//         const periodMs = currentEnd.diff(currentStart);

//         const prevStart = currentStart.subtract(periodMs, "ms");
//         const prevEnd = currentStart.subtract(1, "ms");

//         // ------------------------------
//         // BASIC COUNTS 
//         // ------------------------------
//         const [
//             totalOrders,
//             prevTotalOrders,
//             completedOrders,
//             prevCompletedOrders,
//             cancelledOrders,
//             prevCancelledOrders,
//             refundOrders,
//             prevRefundOrders,
//             draftOrdersCount
//         ] = await Promise.all([
//             Order.countDocuments({ isDraft: false, createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() } }),
//             Order.countDocuments({ isDraft: false, createdAt: { $gte: prevStart.toDate(), $lte: prevEnd.toDate() } }),

//             Order.countDocuments({ isDraft: false, orderStatus: deliveredStatus, createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() } }),
//             Order.countDocuments({ isDraft: false, orderStatus: deliveredStatus, createdAt: { $gte: prevStart.toDate(), $lte: prevEnd.toDate() } }),

//             Order.countDocuments({ isDraft: false, orderStatus: cancelledStatus, createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() } }),
//             Order.countDocuments({ isDraft: false, orderStatus: cancelledStatus, createdAt: { $gte: prevStart.toDate(), $lte: prevEnd.toDate() } }),

//             Order.countDocuments({
//                 isDraft: false,
//                 paymentStatus: { $in: refundStatuses },
//                 createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() }
//             }),
//             Order.countDocuments({
//                 isDraft: false,
//                 paymentStatus: { $in: refundStatuses },
//                 createdAt: { $gte: prevStart.toDate(), $lte: prevEnd.toDate() }
//             }),

//             Order.countDocuments({ isDraft: true })
//         ]);

//         // ACTIVE = not delivered, not cancelled, not refunded
//         const activeOrders = totalOrders - completedOrders - cancelledOrders - refundOrders;
//         const prevActiveOrders = prevTotalOrders - prevCompletedOrders - prevCancelledOrders - prevRefundOrders;


//         // ----------------------------------------------------------
//         // TOTAL USER PAID AMOUNT (ALL PAID ORDERS, ANY STATUS)
//         // ----------------------------------------------------------
//         const totalUserPaidAgg = await Order.aggregate([
//             {
//                 $match: {
//                     isDraft: false,
//                     $or: [
//                         { paymentStatus: "Paid" },
//                         { paid: true }
//                     ]
//                 }
//             },
//             { $group: { _id: null, total: { $sum: "$amount" } } }
//         ]);

//         const totalUserPaidAmount = totalUserPaidAgg?.[0]?.total || 0;


//         // ----------------------------------------------------------
//         // REFUND LOSS — ONLY REFUND DELIVERED ORDERS (REAL LOSS)
//         // ----------------------------------------------------------
//         const refundSumAgg = await Order.aggregate([
//             {
//                 $match: {
//                     isDraft: false,
//                     orderStatus: deliveredStatus,
//                     paymentStatus: { $in: ["refund_initiated", "refunded"] },
//                     createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() }
//                 }
//             },
//             {
//                 $group: {
//                     _id: null,
//                     total: { $sum: { $ifNull: ["$refund.amount", 0] } }
//                 }
//             }
//         ]);

//         const totalRefundLoss = refundSumAgg?.[0]?.total || 0;

//         // pending refunds
//         const pendingRefundCount = await Order.countDocuments({
//             isDraft: false,
//             paymentStatus: { $in: ["refund_requested", "refund_initiated", "refund_processing"] }
//         });

//         // ----------------------------------------------------------
//         // CANCELLED PAID LOSS (NOT subtracted from revenue)
//         // For reporting only
//         // ----------------------------------------------------------
//         const paidCancelledLossAgg = await Order.aggregate([
//             {
//                 $match: {
//                     isDraft: false,
//                     orderStatus: cancelledStatus,
//                     orderType: { $ne: "COD" }, // online paid only
//                     createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() }
//                 }
//             },
//             { $group: { _id: null, total: { $sum: "$amount" } } }
//         ]);

//         const paidCancelledLoss = paidCancelledLossAgg?.[0]?.total || 0;

//         // ----------------------------------------------------------
//         // REVENUE (ONLY DELIVERED ORDERS)
//         // ----------------------------------------------------------
//         const revenueAgg = await Order.aggregate([
//             { $match: { isDraft: false, orderStatus: deliveredStatus, createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() } } },
//             { $unwind: "$products" },

//             {
//                 $addFields: {
//                     "products.displayPriceUsed": {
//                         $ifNull: [
//                             "$products.variant.displayPrice",
//                             "$products.variant.discountedPrice",
//                             "$products.price",
//                             0
//                         ]
//                     },
//                     "products.costPrice": { $ifNull: ["$products.variant.costPrice", 0] }
//                 }
//             },

//             {
//                 $group: {
//                     _id: "$_id",
//                     orderAmount: { $first: "$amount" },
//                     totalCompanyProductSales: { $sum: { $multiply: ["$products.quantity", "$products.displayPriceUsed"] } },
//                     totalProductCost: { $sum: { $multiply: ["$products.quantity", "$products.costPrice"] } },
//                     discount: {
//                         $first: {
//                             $add: [
//                                 { $ifNull: ["$discountAmount", 0] },         // Old discount
//                                 { $ifNull: ["$buyerDiscountAmount", 0] },    // Manual/admin discount
//                                 { $ifNull: ["$couponDiscount", 0] },         // Coupon
//                                 { $ifNull: ["$pointsDiscount", 0] },         // Points
//                                 { $ifNull: ["$giftCardDiscount", 0] },       // Gift card used at checkout
//                                 { $ifNull: ["$giftCardApplied.amount", 0] }  // Gift card applied (if separate)
//                             ]
//                         }
//                     },

//                     giftCard: {
//                         $first: { $ifNull: ["$giftCard.amount", 0] }   // Gift card PURCHASE (revenue)
//                     }

//                 }
//             },

//             {
//                 $group: {
//                     _id: null,
//                     totalUserPaidRevenue: { $sum: "$orderAmount" },
//                     totalCompanyProductRevenue: { $sum: "$totalCompanyProductSales" },
//                     totalDiscountGiven: { $sum: "$discount" },
//                     totalGiftCardRevenue: { $sum: "$giftCard" },
//                     totalCostOfGoodsSold: { $sum: "$totalProductCost" },
//                     countOrders: { $sum: 1 }
//                 }
//             }
//         ]);

//         const revenue = revenueAgg?.[0] || {
//             totalUserPaidRevenue: 0,
//             totalCompanyProductRevenue: 0,
//             totalDiscountGiven: 0,
//             totalGiftCardRevenue: 0,
//             totalCostOfGoodsSold: 0,
//             countOrders: 0
//         };

//         // ----------------------------------------------------------
//         // FINAL NET REVENUE (Corrected)
//         // ----------------------------------------------------------
//         const netRevenue = revenue.totalUserPaidRevenue - totalRefundLoss;

//         const completedCount = revenue.countOrders;
//         const AOV = completedCount ? Number((revenue.totalUserPaidRevenue / completedCount).toFixed(2)) : 0;

//         // repeat customer
//         const userAgg = await Order.aggregate([
//             { $match: { isDraft: false, orderStatus: deliveredStatus, createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() } } },
//             { $group: { _id: "$user", orders: { $sum: 1 } } }
//         ]);

//         const uniqueCustomers = userAgg.length;
//         const repeatCustomerCount = userAgg.filter(u => u.orders > 1).length;
//         const AOC = uniqueCustomers ? Number((completedCount / uniqueCustomers).toFixed(2)) : 0;

//         // ----------------------------------------------------------
//         // NEW USERS
//         // ----------------------------------------------------------
//         const newUsersCount = await Order.distinct("user", {
//             createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() }
//         }).then(users => users.length);

//         // ----------------------------------------------------------
//         // PAYMENT SPLIT
//         // ----------------------------------------------------------
//         const paymentSplit = {};
//         const paymentAgg = await Order.aggregate([
//             { $match: { isDraft: false, orderStatus: deliveredStatus, createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() } } },
//             {
//                 $group: {
//                     _id: "$orderType",
//                     count: { $sum: 1 },
//                     revenue: { $sum: "$amount" }
//                 }
//             }
//         ]);
//         paymentAgg.forEach(p => {
//             paymentSplit[p._id || "unknown"] = { count: p.count, revenue: p.revenue };
//         });

//         // ----------------------------------------------------------
//         // TOP PRODUCTS / CATEGORIES / BRANDS (unchanged)
//         // ------------------------------
//         // TOP PRODUCTS (UPDATED: Revenue Calculation)
//         // ------------------------------
//         const topProducts = await Order.aggregate([
//             {
//                 $match: {
//                     isDraft: false,
//                     orderStatus: deliveredStatus,
//                     createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() }
//                 }
//             },
//             { $unwind: "$products" },

//             // Group by VARIANT
//             {
//                 $group: {
//                     _id: "$products.variant._id",   // variantId
//                     productId: { $first: "$products.productId" },
//                     variant: { $first: "$products.variant" },
//                     qtySold: { $sum: "$products.quantity" },
//                     revenue: {
//                         $sum: {
//                             $multiply: [
//                                 "$products.quantity",
//                                 {
//                                     $ifNull: [
//                                         "$products.variant.displayPrice",
//                                         "$products.variant.discountedPrice",
//                                         "$products.price",
//                                         0
//                                     ]
//                                 }
//                             ]
//                         }
//                     }
//                 }
//             },

//             // Lookup product info
//             {
//                 $lookup: {
//                     from: Product.collection.name,
//                     localField: "productId",
//                     foreignField: "_id",
//                     as: "product"
//                 }
//             },
//             { $unwind: "$product" },

//             { $sort: { qtySold: -1 } },
//             { $limit: 10 },

//             // Final formatted output
//             {
//                 $project: {
//                     _id: 0,
//                     productName: "$product.name",
//                     variantName: "$variant.name",
//                     sales: "$qtySold",
//                     price: "$variant.price",
//                     displayPrice: "$variant.displayPrice",
//                     stock: "$variant.stock",
//                     revenue: 1
//                 }
//             }
//         ]);

//         // ------------------------------
//         // TOP CATEGORIES (UPDATED: Revenue Calculation)
//         // ------------------------------
//         const topCategories = await Order.aggregate([
//             {
//                 $match: {
//                     isDraft: false,
//                     orderStatus: deliveredStatus,
//                     createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() }
//                 }
//             },
//             { $unwind: "$products" },

//             // Join product to get category
//             {
//                 $lookup: {
//                     from: Product.collection.name,
//                     localField: "products.productId",
//                     foreignField: "_id",
//                     as: "product"
//                 }
//             },
//             { $unwind: "$product" },

//             // Group category *variant wise*
//             {
//                 $group: {
//                     _id: "$product.category",
//                     qtySold: { $sum: "$products.quantity" },
//                     revenue: {
//                         $sum: {
//                             $multiply: [
//                                 "$products.quantity",
//                                 {
//                                     $ifNull: [
//                                         "$products.variant.displayPrice",
//                                         "$products.variant.discountedPrice",
//                                         "$products.price",
//                                         0
//                                     ]
//                                 }
//                             ]
//                         }
//                     }
//                 }
//             },

//             {
//                 $lookup: {
//                     from: Category.collection.name,
//                     localField: "_id",
//                     foreignField: "_id",
//                     as: "category"
//                 }
//             },
//             { $unwind: "$category" },

//             { $sort: { qtySold: -1 } },
//             { $limit: 10 },

//             {
//                 $project: {
//                     category: "$category.name",
//                     sales: "$qtySold",
//                     revenue: 1
//                 }
//             }
//         ]);


//         // ------------------------------
//         // TOP BRANDS (UPDATED: Revenue Calculation)
//         // ------------------------------
//         const topBrands = await Order.aggregate([
//             {
//                 $match: {
//                     isDraft: false,
//                     orderStatus: deliveredStatus,
//                     createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() }
//                 }
//             },
//             { $unwind: "$products" },

//             // Join product for brand
//             {
//                 $lookup: {
//                     from: Product.collection.name,
//                     localField: "products.productId",
//                     foreignField: "_id",
//                     as: "product"
//                 }
//             },
//             { $unwind: "$product" },

//             // Group *variant wise* inside brand
//             {
//                 $group: {
//                     _id: "$product.brand",
//                     qtySold: { $sum: "$products.quantity" },
//                     revenue: {
//                         $sum: {
//                             $multiply: [
//                                 "$products.quantity",
//                                 {
//                                     $ifNull: [
//                                         "$products.variant.displayPrice",
//                                         "$products.variant.discountedPrice",
//                                         "$products.price",
//                                         0
//                                     ]
//                                 }
//                             ]
//                         }
//                     }
//                 }
//             },

//             {
//                 $lookup: {
//                     from: Brand.collection.name,
//                     localField: "_id",
//                     foreignField: "_id",
//                     as: "brand"
//                 }
//             },
//             { $unwind: "$brand" },

//             { $sort: { qtySold: -1 } },
//             { $limit: 10 },

//             {
//                 $project: {
//                     brand: "$brand.name",
//                     sales: "$qtySold",
//                     revenue: 1
//                 }
//             }
//         ]);

//         // ------------------------------
//         // STOCK ALERTS (auto generate)
//         // ------------------------------
//         const LOW_STOCK_THRESHOLD = 10;

//         const stockAlerts = await Product.aggregate([
//             // 1. Filter for products with variants or products using top-level quantity
//             {
//                 $match: {
//                     $or: [
//                         // Products with variants: check if any variant stock is low
//                         { "variants.stock": { $lte: LOW_STOCK_THRESHOLD } },
//                         // Products without variants: check if top-level quantity is low
//                         { quantity: { $lte: LOW_STOCK_THRESHOLD }, variants: { $size: 0 } }
//                     ]
//                 }
//             },
//             // 2. Unwind variants so we can process them individually
//             { $unwind: { path: "$variants", preserveNullAndEmptyArrays: true } },
//             // 3. Match only the variants (or the non-variant product) that are below the threshold
//             {
//                 $match: {
//                     $or: [
//                         // Match low stock variants
//                         { "variants.stock": { $lte: LOW_STOCK_THRESHOLD } },
//                         // Match low stock non-variant product (where variants is null/missing after unwind)
//                         { quantity: { $lte: LOW_STOCK_THRESHOLD }, "variants": { $exists: false } }
//                     ]
//                 }
//             },
//             // 4. Project the necessary fields
//             {
//                 $project: {
//                     _id: 0,
//                     productId: "$_id",
//                     productName: "$name",
//                     // Use the variant's stock if it exists, otherwise use the parent product's quantity
//                     stock: {
//                         $ifNull: ["$variants.stock", "$quantity"]
//                     },
//                     // Include variant-specific info
//                     variantId: "$variants.sku",
//                     shadeName: "$variants.shadeName",
//                     price: {
//                         // Determine the price to display
//                         $ifNull: [
//                             "$variants.displayPrice",
//                             "$variants.discountedPrice",
//                             "$variants.price",
//                             "$discountedPrice",
//                             "$price"
//                         ]
//                     }
//                 }
//             },
//             // 5. Sort by stock level (lowest first)
//             { $sort: { stock: 1 } }
//         ]);
//         // ------------------------------
//         // RECENT ORDERS
//         // ------------------------------
//         const recentOrders = await Order.find(
//             { isDraft: false },
//             { products: 1, amount: 1, orderId: 1, createdAt: 1, customerName: 1, orderType: 1, orderStatus: 1, paymentStatus: 1 }
//         )
//             .populate("products.productId", "name")
//             .sort({ createdAt: -1 })
//             .limit(10);

//         const formattedOrders = recentOrders.map(o => ({
//             productName: o.products?.[0]?.productId?.name || "N/A",
//             orderId: o.orderId,
//             date: dayjs(o.createdAt).format("MMM D, YYYY"),
//             customerName: o.customerName || "Unknown",
//             status: o.orderStatus,
//             paymentStatus: o.paymentStatus,
//             paymentMode: o.orderType,
//             amount: o.amount
//         }));

//         // ------------------------------
//         // CATEGORY TRENDS (based on sales)
//         // ------------------------------
//         const categoryTrends = await Order.aggregate([
//             { $match: { isDraft: false, orderStatus: deliveredStatus, createdAt: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() } } },
//             { $unwind: "$products" },
//             {
//                 $lookup: {
//                     from: Product.collection.name,
//                     localField: "products.productId",
//                     foreignField: "_id",
//                     as: "product"
//                 }
//             },
//             { $unwind: "$product" },
//             {
//                 $group: {
//                     _id: "$product.category",
//                     sales: { $sum: "$products.quantity" },
//                     revenue: {
//                         $sum: {
//                             $multiply: [
//                                 "$products.quantity",
//                                 {
//                                     $ifNull: [
//                                         "$products.variant.displayPrice",
//                                         "$products.variant.discountedPrice",
//                                         "$products.price",
//                                         0
//                                     ]
//                                 }
//                             ]
//                         }
//                     }
//                 }
//             },
//             {
//                 $lookup: {
//                     from: Category.collection.name,
//                     localField: "_id",
//                     foreignField: "_id",
//                     as: "category"
//                 }
//             },
//             { $unwind: "$category" },
//             {
//                 $project: {
//                     category: "$category.name",
//                     sales: 1,
//                     revenue: 1
//                 }
//             },
//             { $sort: { sales: -1 } }
//         ]);


//         // ----------------------------------------------------------
//         // FINAL RESPONSE
//         // ----------------------------------------------------------
//         res.json({
//             success: true,

//             summary: {
//                 orders: {
//                     total: calcGrowth(totalOrders, prevTotalOrders),
//                     completed: calcGrowth(completedOrders, prevCompletedOrders),
//                     active: calcGrowth(activeOrders, prevActiveOrders),
//                     cancelled: calcGrowth(cancelledOrders, prevCancelledOrders),
//                     refunded: calcGrowth(refundOrders, prevRefundOrders),
//                     draft: { value: draftOrdersCount }
//                 },

//                 revenue: {
//                     userPaidDelivered: revenue.totalUserPaidRevenue,
//                     userPaidAll: totalUserPaidAmount,
//                     companyProductRevenue: revenue.totalCompanyProductRevenue,
//                     discountGiven: revenue.totalDiscountGiven,
//                     giftCardRevenue: revenue.totalGiftCardRevenue,
//                     refundLoss: totalRefundLoss,
//                     cancelledPaidLoss: paidCancelledLoss,
//                     netRevenue
//                 },

//                 metrics: {
//                     AOV,
//                     AOC,
//                     uniqueCustomers,
//                     repeatCustomers: repeatCustomerCount,
//                     pendingRefunds: pendingRefundCount,
//                     newUsers: newUsersCount
//                 },

//                 paymentSplit
//             },

//             revenueBreakdown: {
//                 totalUserPaidAmount: totalUserPaidAmount,
//                 deliveredUserPaidRevenue: revenue.totalUserPaidRevenue,
//                 companyProductRevenue: revenue.totalCompanyProductRevenue,
//                 discounts: revenue.totalDiscountGiven,
//                 giftCard: revenue.totalGiftCardRevenue,
//                 refundLoss: totalRefundLoss,
//                 cancelledPaidLoss: paidCancelledLoss,
//                 netRevenue
//             },

//             lists: {
//                 topProducts,
//                 topCategories,
//                 topBrands,
//                 recentOrders: formattedOrders,
//                 categoryTrends,
//                 stockAlerts
//             }
//         });

//     } catch (err) {
//         console.error("Dashboard error:", err);
//         res.status(500).json({ success: false, message: "Server error" });
//     }
// };
const deliveredStatus = "Delivered";
const cancelledStatus = "Cancelled";
const refundStatuses = ["refund_initiated", "refunded"];

// Assuming a utility function exists for calculating growth percentage
// const calcGrowth = (current, previous) => { ... }; 

// Helper function to safely get the collection name for $lookup
const getCollectionName = (Model) => Model.collection.name;

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

        const currentStartMs = currentStart.toDate();
        const currentEndMs = currentEnd.toDate();
        const prevStartMs = prevStart.toDate();
        const prevEndMs = prevEnd.toDate();


        const [statsAgg] = await Order.aggregate([
            { $match: { isDraft: false } },
            {
                $facet: {
                    currentPeriod: [
                        { $match: { createdAt: { $gte: currentStartMs, $lte: currentEndMs } } },
                        {
                            $group: {
                                _id: null,
                                totalOrders: { $sum: 1 },
                                completedOrders: { $sum: { $cond: [{ $eq: ["$orderStatus", deliveredStatus] }, 1, 0] } },
                                cancelledOrders: { $sum: { $cond: [{ $eq: ["$orderStatus", cancelledStatus] }, 1, 0] } },
                                refundOrders: { $sum: { $cond: [{ $in: ["$paymentStatus", refundStatuses] }, 1, 0] } },

                                totalUserPaidAmount: {
                                    $sum: {
                                        $cond: [
                                            { $or: [{ $eq: ["$paymentStatus", "Paid"] }, { $eq: ["$paid", true] }] },
                                            "$amount",
                                            0
                                        ]
                                    }
                                },

                                totalRefundLoss: {
                                    $sum: {
                                        $cond: [
                                            { $and: [{ $eq: ["$orderStatus", deliveredStatus] }, { $in: ["$paymentStatus", ["refund_initiated", "refunded"]] }] },
                                            { $ifNull: ["$refund.amount", 0] },
                                            0
                                        ]
                                    }
                                },

                                paidCancelledLoss: {
                                    $sum: {
                                        $cond: [
                                            { $and: [{ $eq: ["$orderStatus", cancelledStatus] }, { $ne: ["$orderType", "COD"] }] },
                                            "$amount",
                                            0
                                        ]
                                    }
                                },

                                pendingRefundCount: {
                                    $sum: {
                                        $cond: [{ $in: ["$paymentStatus", ["refund_requested", "refund_initiated", "refund_processing"]] }, 1, 0]
                                    }
                                },
                            }
                        }
                    ],
                    previousPeriod: [
                        { $match: { createdAt: { $gte: prevStartMs, $lte: prevEndMs } } },
                        {
                            $group: {
                                _id: null,
                                totalOrders: { $sum: 1 },
                                completedOrders: { $sum: { $cond: [{ $eq: ["$orderStatus", deliveredStatus] }, 1, 0] } },
                                cancelledOrders: { $sum: { $cond: [{ $eq: ["$orderStatus", cancelledStatus] }, 1, 0] } },
                                refundOrders: { $sum: { $cond: [{ $in: ["$paymentStatus", refundStatuses] }, 1, 0] } },
                            }
                        }
                    ],
                    draftOrders: [
                        { $match: { isDraft: true } },
                        { $count: "count" }
                    ]
                }
            }
        ]);

        const current = statsAgg.currentPeriod[0] || {};
        const previous = statsAgg.previousPeriod[0] || {};
        const draftOrdersCount = statsAgg.draftOrders[0]?.count || 0;

        const totalOrders = current.totalOrders || 0;
        const completedOrders = current.completedOrders || 0;
        const cancelledOrders = current.cancelledOrders || 0;
        const refundOrders = current.refundOrders || 0;
        const totalUserPaidAmount = current.totalUserPaidAmount || 0;
        const totalRefundLoss = current.totalRefundLoss || 0;
        const paidCancelledLoss = current.paidCancelledLoss || 0;
        const pendingRefundCount = current.pendingRefundCount || 0;

        const prevTotalOrders = previous.totalOrders || 0;
        const prevCompletedOrders = previous.completedOrders || 0;
        const prevCancelledOrders = previous.cancelledOrders || 0;
        const prevRefundOrders = previous.refundOrders || 0;

        const activeOrders = totalOrders - completedOrders - cancelledOrders - refundOrders;
        const prevActiveOrders = prevTotalOrders - prevCompletedOrders - prevCancelledOrders - prevRefundOrders;


        const revenueAgg = await Order.aggregate([
            {
                $match: {
                    isDraft: false,
                    orderStatus: deliveredStatus,
                    createdAt: { $gte: currentStartMs, $lte: currentEndMs }
                }
            },
            { $unwind: "$products" },

            {
                $addFields: {
                    "products.displayPriceUsed": {
                        $ifNull: [
                            "$products.variant.displayPrice",
                            "$products.variant.discountedPrice",
                            "$products.price",
                            0
                        ]
                    },
                    "products.costPrice": { $ifNull: ["$products.variant.costPrice", 0] }
                }
            },

            {
                $group: {
                    _id: "$_id",
                    orderAmount: { $first: "$amount" },
                    orderType: { $first: "$orderType" },
                    userId: { $first: "$user" },
                    productRevenue: { $sum: { $multiply: ["$products.quantity", "$products.displayPriceUsed"] } },
                    productCost: { $sum: { $multiply: ["$products.quantity", "$products.costPrice"] } },

                    products: {
                        $push: {
                            productId: "$products.productId",
                            variantId: "$products.variant._id",
                            qtySold: "$products.quantity",
                            revenue: { $multiply: ["$products.quantity", "$products.displayPriceUsed"] }
                        }
                    },

                    // =============================
                    // 🎁 GIFT CARD REVENUE
                    // =============================
                    giftCardRevenue: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$orderType", "Online"] },
                                        { $eq: ["$paymentMethod", "GiftCard"] }
                                    ]
                                },
                                "$amount",
                                0
                            ]
                        }
                    },

                    // =============================
                    // 👛 WALLET REVENUE
                    // =============================
                    walletRevenue: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ["$orderType", "Online"] },
                                        { $eq: ["$paymentMethod", "Wallet"] }
                                    ]
                                },
                                "$amount",
                                0
                            ]
                        }
                    },

                    discount: {
                        $first: {
                            $add: [
                                { $ifNull: ["$discountAmount", 0] },
                                { $ifNull: ["$buyerDiscountAmount", 0] },
                                { $ifNull: ["$couponDiscount", 0] },
                                { $ifNull: ["$pointsDiscount", 0] },
                                { $ifNull: ["$giftCardDiscount", 0] },
                                { $ifNull: ["$giftCardApplied.amount", 0] }
                            ]
                        }
                    }
                }
            },

            {
                $group: {
                    _id: null,
                    totalUserPaidRevenue: { $sum: "$orderAmount" },
                    totalCompanyProductRevenue: { $sum: "$productRevenue" },
                    totalDiscountGiven: { $sum: "$discount" },
                    // NEW
                    totalGiftCardRevenue: { $sum: "$giftCardRevenue" },
                    totalWalletRevenue: { $sum: "$walletRevenue" },

                    totalCostOfGoodsSold: { $sum: "$productCost" },
                    countOrders: { $sum: 1 },

                    paymentSplit: { $push: { type: "$orderType", revenue: "$orderAmount", count: 1 } },

                    users: { $push: "$userId" },

                    allProducts: { $push: "$products" }
                }
            },

            {
                $addFields: {
                    flattenedProducts: { $reduce: { input: "$allProducts", initialValue: [], in: { $concatArrays: ["$$value", "$$this"] } } },

                    uniqueUserIds: { $setUnion: "$users" }
                }
            },
        ]);

        const revenueData = revenueAgg?.[0] || {};

        const revenue = {
            totalUserPaidRevenue: revenueData.totalUserPaidRevenue || 0,
            totalCompanyProductRevenue: revenueData.totalCompanyProductRevenue || 0,
            totalDiscountGiven: revenueData.totalDiscountGiven || 0,
            totalGiftCardRevenue: revenueData.totalGiftCardRevenue || 0,
            totalWalletRevenue: revenueData.totalWalletRevenue || 0,
            totalCostOfGoodsSold: revenueData.totalCostOfGoodsSold || 0,
            countOrders: revenueData.countOrders || 0,
        };

        const netRevenue = revenue.totalUserPaidRevenue - totalRefundLoss;
        const completedCount = revenue.countOrders;
        const AOV = completedCount ? Number((revenue.totalUserPaidRevenue / completedCount).toFixed(2)) : 0;

        const uniqueCustomers = (revenueData.uniqueUserIds || []).length;
        const userOrderCounts = (revenueData.users || []).reduce((acc, userId) => {
            if (userId) acc[userId] = (acc[userId] || 0) + 1;
            return acc;
        }, {});
        const repeatCustomerCount = Object.values(userOrderCounts).filter(count => count > 1).length;
        const AOC = uniqueCustomers ? Number((completedCount / uniqueCustomers).toFixed(2)) : 0;

        const paymentSplit = (revenueData.paymentSplit || []).reduce((acc, p) => {
            const type = p.type || "unknown";
            acc[type] = acc[type] || { count: 0, revenue: 0 };
            acc[type].count += p.count;
            acc[type].revenue += p.revenue;
            return acc;
        }, {});

        const productDataAgg = await Order.aggregate([
            { $match: { isDraft: false, orderStatus: deliveredStatus, createdAt: { $gte: currentStartMs, $lte: currentEndMs } } },
            { $unwind: "$products" },
            {
                $addFields: {
                    productLineRevenue: {
                        $multiply: [
                            "$products.quantity",
                            {
                                $ifNull: [
                                    "$products.variant.displayPrice",
                                    "$products.variant.discountedPrice",
                                    "$products.price",
                                    0
                                ]
                            }
                        ]
                    }
                }
            },
            {
                $lookup: {
                    from: getCollectionName(Product),
                    localField: "products.productId",
                    foreignField: "_id",
                    as: "product"
                }
            },
            { $unwind: "$product" },

            {
                $facet: {
                    topProducts: [
                        {
                            $group: {
                                _id: "$products.variant._id",
                                productId: { $first: "$products.productId" },
                                variant: { $first: "$products.variant" },
                                productName: { $first: "$product.name" },
                                qtySold: { $sum: "$products.quantity" },
                                revenue: { $sum: "$productLineRevenue" }
                            }
                        },
                        { $sort: { qtySold: -1 } },
                        { $limit: 10 },
                        {
                            $project: {
                                _id: 0, productName: 1, variantName: "$variant.name", sales: "$qtySold",
                                price: "$variant.price", displayPrice: "$variant.displayPrice",
                                stock: "$variant.stock", revenue: 1
                            }
                        }
                    ],
                    categoryMetrics: [
                        {
                            $group: {
                                _id: "$product.category",
                                qtySold: { $sum: "$products.quantity" },
                                revenue: { $sum: "$productLineRevenue" }
                            }
                        },
                        {
                            $lookup: {
                                from: getCollectionName(Category),
                                localField: "_id",
                                foreignField: "_id",
                                as: "category"
                            }
                        },
                        { $unwind: "$category" },
                        {
                            $project: { _id: 0, category: "$category.name", sales: "$qtySold", revenue: 1 }
                        },
                        { $sort: { qtySold: -1 } },
                    ],
                    brandMetrics: [
                        {
                            $group: {
                                _id: "$product.brand",
                                qtySold: { $sum: "$products.quantity" },
                                revenue: { $sum: "$productLineRevenue" }
                            }
                        },
                        {
                            $lookup: {
                                from: getCollectionName(Brand),
                                localField: "_id",
                                foreignField: "_id",
                                as: "brand"
                            }
                        },
                        { $unwind: "$brand" },
                        {
                            $project: { _id: 0, brand: "$brand.name", sales: "$qtySold", revenue: 1 }
                        },
                        { $sort: { qtySold: -1 } },
                    ]
                }
            }
        ]);

        const topProducts = productDataAgg[0]?.topProducts || [];
        const topCategories = productDataAgg[0]?.categoryMetrics?.slice(0, 10) || [];
        const topBrands = productDataAgg[0]?.brandMetrics?.slice(0, 10) || [];
        const categoryTrends = productDataAgg[0]?.categoryMetrics || [];

        const newUsersCount = await Order.distinct("user", {
            createdAt: { $gte: currentStartMs, $lte: currentEndMs }
        }).then(users => users.filter(Boolean).length);

        const LOW_STOCK_THRESHOLD = 10;
        const stockAlerts = await Product.aggregate([
            {
                $match: {
                    $or: [
                        { "variants.stock": { $lte: LOW_STOCK_THRESHOLD } },
                        { quantity: { $lte: LOW_STOCK_THRESHOLD }, variants: { $size: 0 } }
                    ]
                }
            },
            { $unwind: { path: "$variants", preserveNullAndEmptyArrays: true } },
            {
                $match: {
                    $or: [
                        { "variants.stock": { $lte: LOW_STOCK_THRESHOLD } },
                        { quantity: { $lte: LOW_STOCK_THRESHOLD }, "variants": { $exists: false } }
                    ]
                }
            },
            {
                $project: {
                    _id: 0,
                    productId: "$_id",
                    productName: "$name",
                    stock: { $ifNull: ["$variants.stock", "$quantity"] },
                    variantId: "$variants.sku",
                    shadeName: "$variants.shadeName",
                    price: {
                        $ifNull: ["$variants.displayPrice", "$variants.discountedPrice", "$variants.price", "$discountedPrice", "$price"]
                    }
                }
            },
            { $sort: { stock: 1 } }
        ]);

        const recentOrders = await Order.find(
            { isDraft: false },
            { products: 1, amount: 1, orderId: 1, createdAt: 1, customerName: 1, orderType: 1, orderStatus: 1, paymentStatus: 1 }
        )
            .populate("products.productId", "name")
            .sort({ createdAt: -1 })
            .limit(10);

        const formattedOrders = recentOrders.map(o => ({
            productName: o.products?.[0]?.productId?.name || "N/A",
            orderId: o.orderId,
            date: dayjs(o.createdAt).format("MMM D, YYYY"),
            customerName: o.customerName || "Unknown",
            status: o.orderStatus,
            paymentStatus: o.paymentStatus,
            paymentMode: o.orderType,
            amount: o.amount
        }));

        res.json({
            success: true,
            summary: {
                orders: {
                    total: calcGrowth(totalOrders, prevTotalOrders),
                    completed: calcGrowth(completedOrders, prevCompletedOrders),
                    active: calcGrowth(activeOrders, prevActiveOrders),
                    cancelled: calcGrowth(cancelledOrders, prevCancelledOrders),
                    refunded: calcGrowth(refundOrders, prevRefundOrders),
                    draft: { value: draftOrdersCount }
                },
                revenue: {
                    userPaidDelivered: revenue.totalUserPaidRevenue,
                    userPaidAll: totalUserPaidAmount,
                    companyProductRevenue: revenue.totalCompanyProductRevenue,
                    discountGiven: revenue.totalDiscountGiven,
                    giftCardRevenue: revenue.totalGiftCardRevenue,
                    walletRevenue : revenue.totalWalletRevenue,
                    refundLoss: totalRefundLoss,
                    cancelledPaidLoss: paidCancelledLoss,
                    netRevenue
                },
                metrics: {
                    AOV, AOC, uniqueCustomers, repeatCustomers: repeatCustomerCount,
                    pendingRefunds: pendingRefundCount, newUsers: newUsersCount
                },
                paymentSplit
            },
            revenueBreakdown: {
                totalUserPaidAmount: totalUserPaidAmount,
                deliveredUserPaidRevenue: revenue.totalUserPaidRevenue,
                companyProductRevenue: revenue.totalCompanyProductRevenue,
                discounts: revenue.totalDiscountGiven,
                giftCard: revenue.totalGiftCardRevenue,
                walletRevenue : revenue.totalWalletRevenue,
                refundLoss: totalRefundLoss,
                cancelledPaidLoss: paidCancelledLoss,
                netRevenue
            },
            lists: {
                topProducts, topCategories, topBrands, recentOrders: formattedOrders,
                categoryTrends, stockAlerts
            }
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