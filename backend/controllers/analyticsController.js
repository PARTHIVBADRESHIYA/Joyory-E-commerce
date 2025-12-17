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


const calcGrowth = (current, previous) => {
    if (previous === 0) {
        return { value: current, changePercent: current > 0 ? 100 : 0, trend: current > 0 ? "up" : "neutral" };
    }
    const changePercent = ((current - previous) / previous) * 100;
    const trend = changePercent > 0 ? "up" : changePercent < 0 ? "down" : "neutral";
    return { value: current, changePercent: Number(changePercent.toFixed(2)), trend };
};

const deliveredStatus = "Delivered";
const cancelledStatus = "Cancelled";
const refundStatuses = ["refund_initiated", "refunded"];

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
                                totalGSTCollected: { $sum: "$gst.amount" },
                                totalTaxableAmount: { $sum: "$gst.taxableAmount" },
                                totalShippingCollected: { $sum: "$shippingCharge" },

                                totalRefundLoss: {
                                    $sum: {
                                        $reduce: {
                                            input: {
                                                $cond: [
                                                    { $isArray: "$refund" },
                                                    "$refund",
                                                    { $cond: [{ $gt: ["$refund", null] }, ["$refund"], []] }
                                                ]
                                            },
                                            initialValue: 0,
                                            in: {
                                                $add: [
                                                    "$$value",
                                                    {
                                                        $cond: [
                                                            { $in: ["$$this.status", ["refund_requested", "refund_initiated", "refunded", "approved"]] },
                                                            { $ifNull: ["$$this.amount", 0] },
                                                            0
                                                        ]
                                                    }
                                                ]
                                            }
                                        }

                                    }
                                }
                                ,

                                paidCancelledLoss: {
                                    $sum: {
                                        $cond: [
                                            { $and: [{ $eq: ["$orderStatus", cancelledStatus] }, { $ne: ["$orderType", "COD"] }] },
                                            "$amount",
                                            0
                                        ]
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
        const totalGSTCollected = current.totalGSTCollected || 0;
        const totalTaxableAmount = current.totalTaxableAmount || 0;
        const totalShippingCollected = current.totalShippingCollected || 0;

        const totalRefundLoss = current.totalRefundLoss || 0;
        const paidCancelledLoss = current.paidCancelledLoss || 0;

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

                    gstAmount: { $first: "$gst.amount" },
                    taxableAmount: { $first: "$gst.taxableAmount" },
                    shippingCharge: { $first: "$shippingCharge" },

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
                    totalGSTCollected: { $sum: "$gstAmount" },
                    totalTaxableRevenue: { $sum: "$taxableAmount" },
                    totalShippingRevenue: { $sum: "$shippingCharge" },

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
            totalTaxableRevenue: revenueData.totalTaxableRevenue || 0,
            totalGSTCollected: revenueData.totalGSTCollected || 0,
            totalShippingRevenue: revenueData.totalShippingRevenue || 0,

            totalDiscountGiven: revenueData.totalDiscountGiven || 0,
            totalGiftCardRevenue: revenueData.totalGiftCardRevenue || 0,
            totalWalletRevenue: revenueData.totalWalletRevenue || 0,
            totalCostOfGoodsSold: revenueData.totalCostOfGoodsSold || 0,
            countOrders: revenueData.countOrders || 0,
        };

        const netRevenue =
            revenue.totalUserPaidRevenue
            - revenue.totalGSTCollected
            - totalRefundLoss;

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
                    gstCollected: totalGSTCollected,
                    taxableRevenue: totalTaxableAmount,
                    shippingRevenue: totalShippingCollected,
                    companyProductRevenue: revenue.totalCompanyProductRevenue,
                    discountGiven: revenue.totalDiscountGiven,
                    giftCardRevenue: revenue.totalGiftCardRevenue,
                    walletRevenue: revenue.totalWalletRevenue,
                    refundLoss: totalRefundLoss,
                    cancelledPaidLoss: paidCancelledLoss,
                    netRevenue
                },
                metrics: {
                    AOV, AOC, uniqueCustomers, repeatCustomers: repeatCustomerCount,
                    newUsers: newUsersCount
                },
                paymentSplit
            },
            revenueBreakdown: {
                totalUserPaidAmount: totalUserPaidAmount,
                deliveredUserPaidRevenue: revenue.totalUserPaidRevenue,
                gstCollected: totalGSTCollected,
                taxableRevenue: totalTaxableAmount,
                shippingRevenue: totalShippingCollected,
                companyProductRevenue: revenue.totalCompanyProductRevenue,
                discounts: revenue.totalDiscountGiven,
                giftCard: revenue.totalGiftCardRevenue,
                walletRevenue: revenue.totalWalletRevenue,
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

