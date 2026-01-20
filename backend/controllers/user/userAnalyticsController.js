import User from "../../models/User.js";
import UserActivity from "../../models/UserActivity.js";
import Order from "../../models/Order.js";
import Review from "../../models/Review.js";
import Brand from "../../models/Brand.js";
import Category from "../../models/Category.js";
import Product from "../../models/Product.js";
import Wallet from "../../models/Wallet.js";
import mongoose from "mongoose";


export const getCustomerCore = async (userId) => {
    const user = await User.findById(userId).select(
        "name email createdAt recentlyViewed recentCategoryViews wishlist"
    );

    if (!user) throw new Error("User not found");

    // ------------------------------------
    // Recently Viewed → product IDs extract
    // ------------------------------------
    const viewedProductIds = (user.recentlyViewed || []).map(v => v.product);

    const viewedProducts = viewedProductIds.length
        ? await Product.find({ _id: { $in: viewedProductIds } }).select("name")
        : [];

    const viewedMap = Object.fromEntries(
        viewedProducts.map(p => [String(p._id), p.name])
    );

    // ---------------------
    // Wishlist → product IDs
    // ---------------------
    const wishlist = (user.wishlist || []).map(w => ({
        productId: w.productId,
        name: w.name || null
    }));


    // ------------------------------------
    // Final return structure
    // ------------------------------------
    return {
        id: user._id,
        name: user.name,
        email: user.email,
        joinedAt: user.createdAt,

        behavior: {
            recentlyViewed: (user.recentlyViewed || []).map(v => ({
                id: v._id,                        // internal item id
                productId: v.product,             // actual product ID
                name: viewedMap[String(v.product)] || null,
                viewedAt: v.viewedAt
            })),

            recentCategoryViews: user.recentCategoryViews || [],

            wishlist,                // 🔥 directly returning snapshot (no populate)
            wishlistCount: wishlist.length
        }
    };
};

export const getCustomerOrderStats = async (userId) => {
    const data = await Order.aggregate([
        { $match: { user: userId, paid: true } },
        {
            $group: {
                _id: "$user",
                totalOrders: { $sum: 1 },
                totalSpent: { $sum: "$amount" },
                firstOrderAt: { $min: "$createdAt" },
                lastOrderAt: { $max: "$createdAt" }
            }
        }
    ]);

    const stats = data[0] || {};

    const avgOrderValue =
        stats.totalOrders > 0
            ? stats.totalSpent / stats.totalOrders
            : 0;

    return {
        totalOrders: stats.totalOrders || 0,
        totalSpent: stats.totalSpent || 0,
        avgOrderValue,
        firstOrderAt: stats.firstOrderAt || null,
        lastOrderAt: stats.lastOrderAt || null
    };
};

export const getCustomerReturnStats = async (userId) => {
    const data = await Order.aggregate([
        { $match: { user: userId } },
        { $unwind: "$shipments" },
        { $unwind: "$shipments.returns" },
        {
            $group: {
                _id: "$user",
                totalReturns: { $sum: 1 },
                totalRefunded: {
                    $sum: "$shipments.returns.refund.amount"
                }
            }
        }
    ]);

    return {
        totalReturns: data[0]?.totalReturns || 0,
        totalRefunded: data[0]?.totalRefunded || 0
    };
};

export const getCustomerPreferences = async (userId) => {
    // ---- TOP PRODUCT ----
    const productPref = await Order.aggregate([
        { $match: { user: userId, paid: true } },
        { $unwind: "$products" },
        {
            $group: {
                _id: "$products.productId",
                qty: { $sum: "$products.quantity" }
            }
        },
        { $sort: { qty: -1 } },
        { $limit: 1 },

        // 🔥 Join Product to get name, image, brand etc
        {
            $lookup: {
                from: "products",
                localField: "_id",
                foreignField: "_id",
                as: "product"
            }
        },
        { $unwind: "$product" }
    ]);

    // ---- TOP SHADE / VARIANT ----
    const variantPref = await Order.aggregate([
        { $match: { user: userId, paid: true } },
        { $unwind: "$products" },
        {
            $group: {
                _id: "$products.variant.sku",
                shadeName: { $first: "$products.variant.shadeName" },
                productId: { $first: "$products.productId" },
                count: { $sum: "$products.quantity" }
            }
        },
        { $sort: { count: -1 } },
        { $limit: 1 },

        // 🔥 lookup product to attach product.name
        {
            $lookup: {
                from: "products",
                localField: "productId",
                foreignField: "_id",
                as: "product"
            }
        },
        { $unwind: "$product" }
    ]);

    return {
        favoriteProduct: productPref.length
            ? {
                productId: productPref[0]._id,
                name: productPref[0].product.name,
                qty: productPref[0].qty,
            }
            : null,

        favoriteVariant: variantPref.length
            ? {
                sku: variantPref[0]._id,
                shadeName: variantPref[0].shadeName,
                productId: variantPref[0].productId,
                productName: variantPref[0].product.name,
                totalBought: variantPref[0].count
            }
            : null
    };
};

export const getCustomerReviewStats = async (userId) => {
    const data = await Review.aggregate([
        { $match: { customer: userId } },
        {
            $group: {
                _id: "$customer",
                totalReviews: { $sum: 1 },
                verifiedReviews: {
                    $sum: { $cond: ["$verifiedPurchase", 1, 0] }
                },
                avgRating: { $avg: "$rating" }
            }
        }
    ]);

    return {
        totalReviews: data[0]?.totalReviews || 0,
        verifiedReviews: data[0]?.verifiedReviews || 0,
        avgRating: Number((data[0]?.avgRating || 0).toFixed(2))
    };
};


export const getCustomerFunnel = async (userId) => {
    const user = await User.findById(userId).select("conversionStats");

    const orderStats = await Order.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId), paid: true } },

        {
            $group: {
                _id: null,

                // Order delivered status
                ordersDelivered: {
                    $sum: {
                        $cond: [{ $eq: ["$orderStatus", "Delivered"] }, 1, 0]
                    }
                },

                // Any shipment delivered
                shipmentsDelivered: {
                    $sum: {
                        $cond: [
                            {
                                $gt: [
                                    {
                                        $size: {
                                            $filter: {
                                                input: "$shipments",
                                                as: "s",
                                                cond: { $eq: ["$$s.status", "Delivered"] }
                                            }
                                        }
                                    },
                                    0
                                ]
                            },
                            1,
                            0
                        ]
                    }
                },

                // 🚀 NEW: order-level returns based on shipment returns (NOT orderStatus)
                ordersReturned: {
                    $sum: {
                        $cond: [
                            {
                                $gt: [
                                    {
                                        $size: {
                                            $filter: {
                                                input: "$shipments",
                                                as: "s",
                                                cond: {
                                                    $gt: [
                                                        { $size: "$$s.returns" },
                                                        0
                                                    ]
                                                }
                                            }
                                        }
                                    },
                                    0
                                ]
                            },
                            1,
                            0
                        ]
                    }
                },

                // Shipment-level returns (same logic)
                shipmentsReturned: {
                    $sum: {
                        $cond: [
                            {
                                $gt: [
                                    {
                                        $size: {
                                            $filter: {
                                                input: "$shipments",
                                                as: "s",
                                                cond: {
                                                    $gt: [
                                                        { $size: "$$s.returns" },
                                                        0
                                                    ]
                                                }
                                            }
                                        }
                                    },
                                    0
                                ]
                            },
                            1,
                            0
                        ]
                    }
                }
            }
        }
    ]);

    const o = orderStats[0] || {};

    return {
        views: user?.conversionStats?.viewCount || 0,
        addToCart: user?.conversionStats?.addToCartCount || 0,
        checkoutInitiated: user?.conversionStats?.checkoutCount || 0,
        orderCount: user?.conversionStats?.orderCount || 0,

        ordersDelivered: o.ordersDelivered || 0,
        shipmentsDelivered: o.shipmentsDelivered || 0,

        // Updated
        ordersReturned: o.ordersReturned || 0,
        shipmentsReturned: o.shipmentsReturned || 0
    };
};

export const deriveCustomerSegment = (orders, spent, lastOrderAt) => {
    let segment = "new";

    if (orders === 1) segment = "one_time";
    else if (orders >= 2 && orders <= 5) segment = "repeat";
    else if (orders >= 6) segment = "loyal";

    if (lastOrderAt) {
        const days =
            (Date.now() - new Date(lastOrderAt)) /
            (1000 * 60 * 60 * 24);

        if (days > 90) segment = "dormant";
        if (spent >= 10000) segment = "high_value";
    }

    return segment;
};

export const getCustomerWalletStats = async (userId) => {
    const wallet = await Wallet.findOne({ user: userId }).lean();

    if (!wallet) {
        return {
            balance: {
                joyoryCash: 0,
                rewardPoints: 0
            },
            credits: {
                addedMoney: 0,
                refunds: 0,
                rewardsEarned: 0
            }
        };
    }

    let addedMoney = 0;
    let refunds = 0;
    let rewardsEarned = 0;

    for (const tx of wallet.transactions || []) {
        if (tx.type === "ADD_MONEY") addedMoney += tx.amount;
        if (tx.type === "REFUND") refunds += tx.amount;
        if (tx.type === "REWARD") rewardsEarned += tx.amount;
    }

    return {
        balance: {
            joyoryCash: wallet.joyoryCash,
            rewardPoints: wallet.rewardPoints
        },
        credits: {
            addedMoney,
            refunds,
            rewardsEarned
        }
    };
};

export const getCustomerWalletUsageFromOrders = async (userId) => {
    const data = await Order.aggregate([
        {
            $match: {
                user: userId,
                paid: true,
                paymentMethod: "Wallet"   // 🔥 key condition
            }
        },
        {
            $group: {
                _id: "$user",
                totalWalletOrders: { $sum: 1 },
                totalSpentFromWallet: { $sum: "$amount" }
            }
        }
    ]);

    return {
        totalWalletOrders: data[0]?.totalWalletOrders || 0,
        totalSpentFromWallet: data[0]?.totalSpentFromWallet || 0
    };
};


export const getCustomerAnalytics = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: "Invalid userId" });
        }

        const uid = new mongoose.Types.ObjectId(userId);

        const core = await getCustomerCore(uid);
        const orders = await getCustomerOrderStats(uid);
        const returns = await getCustomerReturnStats(uid);
        const preferences = await getCustomerPreferences(uid);
        const reviews = await getCustomerReviewStats(uid);
        const funnel = await getCustomerFunnel(uid);
        const walletStats = await getCustomerWalletStats(uid);
        const walletUsage = await getCustomerWalletUsageFromOrders(uid);

        const returnRate =
            orders.totalOrders > 0
                ? (returns.totalReturns / orders.totalOrders) * 100
                : 0;

        const segment = deriveCustomerSegment(
            orders.totalOrders,
            orders.totalSpent,
            orders.lastOrderAt
        );

        res.json({
            customer: core,
            orders,
            returns: {
                ...returns,
                returnRate: Number(returnRate.toFixed(2))
            },
            preferences,
            reviews,
            funnel,
            segment,
            walletStats,
            walletUsage
        });
    } catch (err) {
        res.status(500).json({
            message: "Customer analytics failed",
            error: err.message
        });
    }
};

//all over users analytics

export const getGlobalOverview = async () => {
    const totalCustomers = await User.countDocuments();

    // new customers (last 30 days)
    const newCustomers = await User.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });

    // active = recently viewed
    const activeCustomers = await User.countDocuments({
        "recentlyViewed.0": { $exists: true }
    });

    // returning = users with >= 2 paid orders
    const returning = await Order.aggregate([
        { $match: { paid: true } },
        {
            $group: {
                _id: "$user",
                count: { $sum: 1 }
            }
        },
        { $match: { count: { $gte: 2 } } },
        { $count: "returningCustomers" }
    ]);

    const returningCustomers = returning[0]?.returningCustomers || 0;

    // order stats
    const orderStats = await Order.aggregate([
        { $match: { paid: true } },
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalSpent: { $sum: "$amount" },
                avgOrderValue: { $avg: "$amount" }
            }
        }
    ]);

    const totalOrders = orderStats[0]?.totalOrders || 0;
    const totalSpent = orderStats[0]?.totalSpent || 0;

    const averageOrderValue =
        orderStats[0]?.avgOrderValue
            ? Number(orderStats[0].avgOrderValue.toFixed(2))
            : 0;

    // CLV
    const customerLifetimeValue =
        totalCustomers > 0
            ? Number((totalSpent / totalCustomers).toFixed(2))
            : 0;

    // Repeat Purchase Rate
    const repeatPurchaseRate =
        totalCustomers > 0
            ? Number(((returningCustomers / totalCustomers) * 100).toFixed(2))
            : 0;

    // Churn (no orders in last 90 days)
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const activeOrderUsers = await Order.distinct("user", {
        paid: true,
        createdAt: { $gte: cutoff }
    });

    const inactiveCustomers = totalCustomers - activeOrderUsers.length;

    const churnRate =
        totalCustomers > 0
            ? Number(((inactiveCustomers / totalCustomers) * 100).toFixed(2))
            : 0;

    return {
        totalCustomers,
        newCustomers,
        activeCustomers,
        returningCustomers,
        totalOrders,
        totalSpent: Number(totalSpent.toFixed(2)), // optional but recommended
        averageOrderValue,
        customerLifetimeValue,
        repeatPurchaseRate,
        churnRate
    };
};


export const getCustomerSegmentation = async () => {
    // ----------------------------
    // 1️⃣ Gender Distribution
    // ----------------------------
    const byGender = await User.aggregate([
        {
            $group: {
                _id: {
                    $cond: [
                        { $in: ["$gender", ["male", "female", "other"]] },
                        "$gender",
                        "unknown"
                    ]
                },
                count: { $sum: 1 }
            }
        }
    ]);

    // ----------------------------
    // ----------------------------
    // 2️⃣ Age Groups (DOB from updateUserProfile)
    // ----------------------------
    const byAgeGroup = await User.aggregate([
        {
            $project: {
                dob: 1,
                validDob: {
                    $cond: [
                        {
                            $and: [
                                { $ne: ["$dob", null] },               // must exist
                                { $lte: ["$dob", new Date()] },        // cannot be future
                                { $gte: ["$dob", new Date("1900-01-01")] } // reasonable range
                            ]
                        },
                        "$dob",
                        null
                    ]
                }
            }
        },
        {
            $project: {
                age: {
                    $cond: [
                        { $ifNull: ["$validDob", false] },
                        {
                            $floor: {
                                $divide: [
                                    { $subtract: [new Date(), "$validDob"] },
                                    365 * 24 * 60 * 60 * 1000
                                ]
                            }
                        },
                        null
                    ]
                }
            }
        },
        {
            $bucket: {
                groupBy: "$age",
                boundaries: [0, 18, 25, 35, 45, 60, 100],
                default: "unknown",
                output: { count: { $sum: 1 } }
            }
        }
    ]);
    // ----------------------------
    // 3️⃣ Region / City Distribution
    // ----------------------------
    const byCity = await User.aggregate([
        { $unwind: "$addresses" },
        {
            $group: {
                _id: {
                    $cond: [
                        { $ifNull: ["$addresses.city", false] },
                        "$addresses.city",
                        "unknown"
                    ]
                },
                count: { $sum: 1 }
            }
        }
    ]);

    return {
        genderDistribution: byGender,
        ageGroups: byAgeGroup,
        regions: byCity
    };
};

export const getPurchaseBehavior = async () => {

    // -------------------------------
    // 1️⃣ TOP CATEGORIES (same)
    const topCategories = await Order.aggregate([
        { $match: { paid: true } },
        { $unwind: "$products" },
        {
            $group: {
                _id: "$products.productId",
                qty: { $sum: "$products.quantity" }
            }
        },
        {
            $lookup: {
                from: "products",
                localField: "_id",
                foreignField: "_id",
                as: "product"
            }
        },
        { $unwind: "$product" },

        // GROUP BY CATEGORY ID
        {
            $group: {
                _id: "$product.category",   // categoryId
                totalQty: { $sum: "$qty" }
            }
        },

        // 🔥 LOOKUP CATEGORY DETAILS
        {
            $lookup: {
                from: "categories",
                localField: "_id",          // categoryId
                foreignField: "_id",
                as: "category"
            }
        },
        { $unwind: "$category" },

        // FINAL SHAPE
        {
            $project: {
                _id: 0,
                categoryId: "$category._id",
                name: "$category.name",
                slug: "$category.slug",
                totalQty: 1
            }
        },

        { $sort: { totalQty: -1 } },
        { $limit: 6 }
    ]);



    const frequentlyBought = await Order.aggregate([
        { $match: { paid: true } },

        // 1️⃣ Expand products WITH variant info
        { $unwind: "$products" },

        {
            $project: {
                orderId: "$_id",
                productId: "$products.productId",
                variant: "$products.variant"
            }
        },

        // 2️⃣ Pair with other products FROM THE SAME ORDER
        {
            $lookup: {
                from: "orders",
                let: {
                    oid: "$orderId",
                    pid: "$productId",
                    sku: "$variant.sku"
                },
                pipeline: [
                    { $match: { $expr: { $eq: ["$_id", "$$oid"] } } },
                    { $unwind: "$products" },
                    {
                        $match: {
                            $expr: {
                                $or: [
                                    { $ne: ["$products.productId", "$$pid"] },
                                    { $ne: ["$products.variant.sku", "$$sku"] }
                                ]
                            }
                        }
                    },
                    {
                        $project: {
                            productId: "$products.productId",
                            variant: "$products.variant"
                        }
                    }
                ],
                as: "paired"
            }
        },

        { $unwind: "$paired" },

        // 3️⃣ Group by VARIANT PAIR
        {
            $group: {
                _id: {
                    baseProduct: "$productId",
                    baseSku: "$variant.sku",
                    withProduct: "$paired.productId",
                    withSku: "$paired.variant.sku"
                },
                count: { $sum: 1 }
            }
        },

        { $sort: { count: -1 } },
        { $limit: 10 },

        // 4️⃣ Lookup product details
        {
            $lookup: {
                from: "products",
                localField: "_id.baseProduct",
                foreignField: "_id",
                as: "baseProduct"
            }
        },
        { $unwind: "$baseProduct" },

        {
            $lookup: {
                from: "products",
                localField: "_id.withProduct",
                foreignField: "_id",
                as: "withProduct"
            }
        },
        { $unwind: "$withProduct" },

        // 5️⃣ Final shape (variant-aware, frontend ready)
        {
            $project: {
                _id: 0,
                count: 1,

                base: {
                    productId: "$baseProduct._id",
                    name: "$baseProduct.name",
                    sku: "$_id.baseSku",
                    shadeName: {
                        $let: {
                            vars: {
                                v: {
                                    $arrayElemAt: [
                                        {
                                            $filter: {
                                                input: "$baseProduct.variants",
                                                as: "v",
                                                cond: { $eq: ["$$v.sku", "$_id.baseSku"] }
                                            }
                                        },
                                        0
                                    ]
                                }
                            },
                            in: "$$v.shadeName"
                        }
                    },
                    image: {
                        $let: {
                            vars: {
                                v: {
                                    $arrayElemAt: [
                                        {
                                            $filter: {
                                                input: "$baseProduct.variants",
                                                as: "v",
                                                cond: { $eq: ["$$v.sku", "$_id.baseSku"] }
                                            }
                                        },
                                        0
                                    ]
                                }
                            },
                            in: { $arrayElemAt: ["$$v.images", 0] }
                        }
                    }
                },

                boughtTogetherWith: {
                    productId: "$withProduct._id",
                    name: "$withProduct.name",
                    sku: "$_id.withSku",
                    shadeName: {
                        $let: {
                            vars: {
                                v: {
                                    $arrayElemAt: [
                                        {
                                            $filter: {
                                                input: "$withProduct.variants",
                                                as: "v",
                                                cond: { $eq: ["$$v.sku", "$_id.withSku"] }
                                            }
                                        },
                                        0
                                    ]
                                }
                            },
                            in: "$$v.shadeName"
                        }
                    },
                    image: {
                        $let: {
                            vars: {
                                v: {
                                    $arrayElemAt: [
                                        {
                                            $filter: {
                                                input: "$withProduct.variants",
                                                as: "v",
                                                cond: { $eq: ["$$v.sku", "$_id.withSku"] }
                                            }
                                        },
                                        0
                                    ]
                                }
                            },
                            in: { $arrayElemAt: ["$$v.images", 0] }
                        }
                    }
                }
            }
        }
    ]);


    return { topCategories, frequentlyBought };
};

export const getActivityStats = async () => {

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    // -------------------------------
    // 1️⃣ DAU / WAU / MAU
    // -------------------------------
    const dau = await UserActivity.distinct("user", {
        createdAt: { $gte: new Date(now - oneDay) }
    }).then(u => u.length);

    const wau = await UserActivity.distinct("user", {
        createdAt: { $gte: new Date(now - 7 * oneDay) }
    }).then(u => u.length);

    const mau = await UserActivity.distinct("user", {
        createdAt: { $gte: new Date(now - 30 * oneDay) }
    }).then(u => u.length);


    // -------------------------------
    // 2️⃣ Returning Users (>=2 visits)
    // -------------------------------
    const returningUsersAgg = await UserActivity.aggregate([
        {
            $group: {
                _id: "$user",
                visits: { $sum: 1 }
            }
        },
        { $match: { visits: { $gte: 2 } } },
        { $count: "count" }
    ]);

    const returningUsers = returningUsersAgg[0]?.count || 0;


    // -------------------------------
    // 3️⃣ Funnel (views → cart → checkout → order)
    // -------------------------------
    const funnelAgg = await UserActivity.aggregate([
        {
            $group: {
                _id: null,
                views: {
                    $sum: {
                        $cond: [{ $eq: ["$type", "product_view"] }, 1, 0]
                    }
                },
                addToCart: {
                    $sum: {
                        $cond: [{ $eq: ["$type", "add_to_cart"] }, 1, 0]
                    }
                },
                checkout: {
                    $sum: {
                        $cond: [{ $eq: ["$type", "checkout"] }, 1, 0]
                    }
                },
                orders: {
                    $sum: {
                        $cond: [{ $eq: ["$type", "order"] }, 1, 0]
                    }
                }
            }
        }
    ]);

    const funnel = funnelAgg[0] || {
        views: 0,
        addToCart: 0,
        checkout: 0,
        orders: 0
    };


    // -------------------------------
    // 4️⃣ Bounce Rate
    // User viewed a product ONCE & no cart & no order
    // -------------------------------
    const bounceAgg = await UserActivity.aggregate([
        {
            $group: {
                _id: "$user",
                views: {
                    $sum: {
                        $cond: [{ $eq: ["$type", "product_view"] }, 1, 0]
                    }
                },
                cart: {
                    $sum: {
                        $cond: [{ $eq: ["$type", "add_to_cart"] }, 1, 0]
                    }
                },
                orders: {
                    $sum: {
                        $cond: [{ $eq: ["$type", "order"] }, 1, 0]
                    }
                }
            }
        },
        {
            $match: {
                views: 1,
                cart: 0,
                orders: 0
            }
        },
        { $count: "count" }
    ]);

    const bounce = bounceAgg[0]?.count || 0;


    // -------------------------------
    // 5️⃣ Power Users (Top 5)
    // -------------------------------
    const powerUsers = await UserActivity.aggregate([
        {
            $group: {
                _id: "$user",
                score: { $sum: 1 }
            }
        },
        { $sort: { score: -1 } },
        { $limit: 5 },
        {
            $lookup: {
                from: "users",
                localField: "_id",
                foreignField: "_id",
                as: "user"
            }
        },
        { $unwind: "$user" },
        {
            $project: {
                name: "$user.name",
                email: "$user.email",
                score: 1
            }
        }
    ]);


    const topViewedCategories = await UserActivity.aggregate([
        // 🔹 Only category views in the last 30 days
        {
            $match: {
                type: "category_view",
                createdAt: { $gte: new Date(now - 30 * oneDay) }
            }
        },

        // 🔹 Group by category
        {
            $group: {
                _id: "$category",
                views: { $sum: 1 }
            }
        },

        // 🔹 Lookup category details
        {
            $lookup: {
                from: "categories",        // collection name
                localField: "_id",         // category _id from group
                foreignField: "_id",       // match _id in categories
                as: "category"
            }
        },

        // 🔹 Unwind the category array
        { $unwind: "$category" },

        // 🔹 Project only required fields
        {
            $project: {
                _id: 0,
                categoryId: "$_id",
                name: "$category.name",
                slug: "$category.slug",
                views: 1
            }
        },

        // 🔹 Sort by views descending
        { $sort: { views: -1 } },

        // 🔹 Limit top 6
        { $limit: 6 }
    ]);


    const topViewedProducts = await UserActivity.aggregate([
        {
            $match: {
                type: "product_view",
                createdAt: { $gte: new Date(now - 30 * oneDay) }
            }
        },
        {
            $group: {
                _id: "$product",
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
        {
            $lookup: {
                from: "products",
                localField: "_id",
                foreignField: "_id",
                as: "product"
            }
        },
        { $unwind: "$product" },

        // ✅ SAFELY EXTRACT FIRST VARIANT IMAGE
        {
            $addFields: {
                firstVariant: {
                    $arrayElemAt: ["$product.variants", 0]
                }
            }
        },
        {
            $addFields: {
                image: {
                    $arrayElemAt: ["$firstVariant.images", 0]
                }
            }
        },

        {
            $project: {
                productId: "$product._id",
                name: "$product.name",
                views: "$count",
                image: { $ifNull: ["$image", null] }
            }
        }
    ]);


    // -------------------------------
    // 8️⃣ Avg Time: First view → First order
    // -------------------------------
    const timeToPurchase = await Order.aggregate([
        { $match: { paid: true } },

        {
            $lookup: {
                from: "useractivities",
                localField: "user",
                foreignField: "user",
                as: "activity"
            }
        },

        { $unwind: "$activity" },

        {
            $match: {
                "activity.type": "product_view",
                $expr: { $lte: ["$activity.createdAt", "$createdAt"] }
            }
        },

        {
            $group: {
                _id: "$_id",
                orderDate: { $first: "$createdAt" },
                firstView: { $min: "$activity.createdAt" }
            }
        },

        {
            $project: {
                diffHours: {
                    $divide: [
                        { $subtract: ["$orderDate", "$firstView"] },
                        1000 * 60 * 60
                    ]
                }
            }
        },

        { $match: { diffHours: { $gte: 0 } } },

        {
            $group: {
                _id: null,
                avgHours: { $avg: "$diffHours" }
            }
        }
    ]);


    const avgViewToOrderHoursRaw = timeToPurchase[0]?.avgHours ?? null;

    const avgViewToOrderHours =
        avgViewToOrderHoursRaw !== null
            ? Number(avgViewToOrderHoursRaw.toFixed(2))
            : null;


    // -------------------------------
    // 9️⃣ FINAL RESPONSE
    // -------------------------------
    return {
        dau,
        wau,
        mau,
        returningUsers,
        bounce,
        funnel,
        powerUsers,
        topViewedCategories,
        topViewedProducts,
        avgViewToOrderHours
    };
};

export const getAllCustomerAnalytics = async (req, res) => {
    try {
        const overview = await getGlobalOverview();
        const segmentation = await getCustomerSegmentation();
        const purchase = await getPurchaseBehavior();
        const activity = await getActivityStats();

        res.json({
            overview,
            segmentation,
            purchase,
            activity
        });
    } catch (err) {
        res.status(500).json({
            message: "Global customer analytics failed",
            error: err.message
        });
    }
};