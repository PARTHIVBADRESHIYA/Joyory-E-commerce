import Product from "../../models/Product.js";
import User from "../../models/User.js";
import Order from "../../models/Order.js";
import mongoose from "mongoose";
import { formatProductCard, getRecommendations, getActivePromotions } from "../../middlewares/utils/recommendationService.js";
import { enrichProductsUnified } from "../../middlewares/services/productHelpers.js";
import { getRedis } from "../../middlewares/utils/redis.js";
import Promotion from "../../models/Promotion.js";

export async function getEnrichedProductsByIds(productIds, cacheKey, ttl = 60) {
    const redis = getRedis();

    // 🔥 Redis hit
    const cached = await redis.get(cacheKey);
    if (cached) {
        return JSON.parse(cached);
    }

    // Fetch products
    const products = await Product.find({
        _id: { $in: productIds },
        isPublished: true
    })
        .select(
            "name slugs mrp price discountedPrice variants images brand category avgRating totalRatings"
        )
        .populate("brand", "name slug")
        .populate("category", "name slug")
        .lean();

    // Promotions (same logic as product page)
    const now = new Date();
    const promotions = await Promotion.find({
        status: "active",
        startDate: { $lte: now },
        endDate: { $gte: now }
    }).lean();

    const enriched = await enrichProductsUnified(products, promotions);

    await redis.set(cacheKey, JSON.stringify(enriched), "EX", ttl);

    return enriched;
}

// export const getHomepageSections = async (req, res) => {
//     try {
//         const isGuest = !req.user;
//         const sections = [];

//         // 🔹 Fetch homepage buckets in ONE aggregation
//         const productsAgg = await Product.aggregate([
//             {
//                 $facet: {
//                     trending: [{ $sort: { sales: -1 } }, { $limit: 10 }],
//                     newArrivals: [{ $sort: { createdAt: -1 } }, { $limit: 10 }],
//                     topSelling: [{ $sort: { sales: -1 } }, { $limit: 10 }],
//                     mostViewed: [{ $sort: { views: -1 } }, { $limit: 10 }]
//                 }
//             }
//         ]);

//         const data = productsAgg[0] || {};

//         // 🔥 Unified enrichment (NO formatProductCard)
//         const trending = await enrichProductsUnified(data.trending || []);
//         const newArrivals = await enrichProductsUnified(data.newArrivals || []);
//         const topSelling = await enrichProductsUnified(data.topSelling || []);
//         const mostViewed = await enrichProductsUnified(data.mostViewed || []);

//         sections.push({ title: "Trending Now", products: trending });
//         sections.push({ title: "New Arrivals", products: newArrivals });
//         sections.push({ title: "Top Selling", products: topSelling });
//         sections.push({ title: "Most Viewed", products: mostViewed });

//         // 🔹 Personalized sections (Logged-in users)
//         if (!isGuest) {
//             const user = await User.findById(req.user._id).lean();

//             let purchasedIds = [];
//             let userCategories = [];
//             let userBrands = [];

//             const orders = await Order.find({ userId: req.user._id })
//                 .sort({ createdAt: -1 })
//                 .limit(20)
//                 .populate("products.productId")
//                 .lean();

//             orders.forEach(order => {
//                 order.products.forEach(item => {
//                     if (!item.productId) return;
//                     purchasedIds.push(item.productId._id.toString());
//                     if (item.productId.category) userCategories.push(item.productId.category.toString());
//                     if (item.productId.brand) userBrands.push(item.productId.brand);
//                 });
//             });

//             user?.recentProducts?.forEach(pid => purchasedIds.push(pid.toString()));
//             user?.recentCategories?.forEach(cid => userCategories.push(cid.toString()));

//             // 🔹 Weight scoring
//             const categoryScore = {};
//             userCategories.forEach(cid => categoryScore[cid] = (categoryScore[cid] || 0) + 3);

//             const brandScore = {};
//             userBrands.forEach(b => brandScore[b] = (brandScore[b] || 0) + 2);

//             const topCategories = Object.keys(categoryScore).sort((a, b) => categoryScore[b] - categoryScore[a]);
//             const topBrands = Object.keys(brandScore).sort((a, b) => brandScore[b] - brandScore[a]);

//             const personalizedProducts = await Product.find({
//                 $or: [
//                     topCategories.length ? { category: { $in: topCategories } } : null,
//                     topBrands.length ? { brand: { $in: topBrands } } : null
//                 ].filter(Boolean),
//                 _id: { $nin: purchasedIds }
//             })
//                 .sort({ createdAt: -1 })
//                 .limit(10)
//                 .lean();

//             const personalized = await enrichProductsUnified(personalizedProducts);
//             if (personalized.length) {
//                 sections.push({ title: "Recommended For You", products: personalized });
//             }

//             // 🔹 Recently Viewed (already enriched)
//             const recentViewed = await getRecommendations({
//                 mode: "recentlyViewed",
//                 userId: req.user._id,
//                 limit: 10
//             });

//             if (recentViewed?.success && recentViewed.products?.length) {
//                 sections.push({ title: "Recently Viewed", products: recentViewed.products });
//             }

//             // 🔹 Customers Also Viewed
//             if (personalized.length) {
//                 const alsoViewed = await getRecommendations({
//                     mode: "alsoViewed",
//                     productId: personalized[0]._id,
//                     limit: 8
//                 });

//                 if (alsoViewed?.success && alsoViewed.products?.length) {
//                     sections.push({ title: "Customers Also Viewed", products: alsoViewed.products });
//                 }
//             }
//         }

//         return res.json({ success: true, sections });

//     } catch (err) {
//         console.error("🔥 Homepage Sections Error:", err);
//         return res.status(500).json({
//             success: false,
//             message: "Failed to fetch homepage sections"
//         });
//     }
// };
// export const getHomepageSections = async (req, res) => {
//     try {  
//         const sections = [];

//         const productsAgg = await Product.aggregate([
//             {
//                 $match: {
//                     isDeleted: { $ne: true },
//                     isPublished: true
//                 }
//             },
//             {
//                 $addFields: {
//                     topVariant: {
//                         $arrayElemAt: [
//                             {
//                                 $sortArray: {
//                                     input: "$variants",
//                                     sortBy: { sales: -1 }
//                                 }
//                             },
//                             0
//                         ]
//                     }
//                 }
//             },
//             {
//                 $project: {
//                     name: 1,
//                     createdAt: 1,
//                     views: 1,
//                     totalSales: {
//                         $sum: {
//                             $map: {
//                                 input: "$variants",
//                                 as: "v",
//                                 in: { $ifNull: ["$$v.sales", 0] }
//                             }
//                         }
//                     },
//                     image: {
//                         $cond: [
//                             { $gt: [{ $size: "$topVariant.images" }, 0] },
//                             { $arrayElemAt: ["$topVariant.images", 0] },
//                             null
//                         ]
//                     }
//                 }
//             },
//             {
//                 $facet: {
//                     trending: [
//                         { $sort: { totalSales: -1 } },
//                         { $limit: 10 }
//                     ],
//                     newArrivals: [
//                         { $sort: { createdAt: -1 } },
//                         { $limit: 10 }
//                     ],
//                     topSelling: [
//                         { $sort: { totalSales: -1 } },
//                         { $limit: 10 }
//                     ],
//                     mostViewed: [
//                         { $sort: { views: -1 } },
//                         { $limit: 10 }
//                     ]
//                 }
//             }
//         ]);

//         const data = productsAgg[0] || {};

//         const mapMinimal = (list = []) =>
//             list.map(p => ({
//                 _id: p._id,
//                 name: p.name,
//                 image: p.image
//             }));

//         sections.push({
//             title: "Trending Now",
//             products: mapMinimal(data.trending)
//         });

//         sections.push({
//             title: "New Arrivals",
//             products: mapMinimal(data.newArrivals)
//         });

//         sections.push({
//             title: "Top Selling",
//             products: mapMinimal(data.topSelling)
//         });

//         sections.push({
//             title: "Most Viewed",
//             products: mapMinimal(data.mostViewed)
//         });

//         return res.json({
//             success: true,
//             sections
//         });

//     } catch (err) {
//         console.error("🔥 Homepage Sections Error:", err);
//         return res.status(500).json({
//             success: false,
//             message: "Failed to fetch homepage sections"
//         });
//     }
// };
// export const getHomepageSections = async (req, res) => {
//     try {
//         const redis = getRedis();
//         const cacheKey = "homepage:v2";

//         const cached = await redis.get(cacheKey);
//         if (cached) {
//             return res.json(JSON.parse(cached));
//         }

//         const agg = await Product.aggregate([
//             {
//                 $match: {
//                     isDeleted: { $ne: true },
//                     isPublished: true
//                 }
//             },
//             {
//                 $addFields: {
//                     totalSales: {
//                         $sum: {
//                             $map: {
//                                 input: "$variants",
//                                 as: "v",
//                                 in: { $ifNull: ["$$v.sales", 0] }
//                             }
//                         }
//                     }
//                 }
//             },
//             {
//                 $facet: {
//                     trending: [
//                         { $sort: { totalSales: -1 } },
//                         { $limit: 10 },
//                         { $project: { _id: 1 } }
//                     ],
//                     newArrivals: [
//                         { $sort: { createdAt: -1 } },
//                         { $limit: 10 },
//                         { $project: { _id: 1 } }
//                     ],
//                     topSelling: [
//                         { $sort: { totalSales: -1 } },
//                         { $limit: 10 },
//                         { $project: { _id: 1 } }
//                     ],
//                     mostViewed: [
//                         { $sort: { views: -1 } },
//                         { $limit: 10 },
//                         { $project: { _id: 1 } }
//                     ]
//                 }
//             }
//         ]);

//         const data = agg[0] || {};

//         // Extract IDs
//         const ids = list => list.map(p => p._id);

//         // 🔥 SAME enrichment as product page
//         const [
//             trending,
//             newArrivals,
//             topSelling,
//             mostViewed
//         ] = await Promise.all([
//             getEnrichedProductsByIds(ids(data.trending), "home:trending"),
//             getEnrichedProductsByIds(ids(data.newArrivals), "home:new"),
//             getEnrichedProductsByIds(ids(data.topSelling), "home:top"),
//             getEnrichedProductsByIds(ids(data.mostViewed), "home:viewed")
//         ]);

//         const response = {
//             success: true,
//             sections: [
//                 { title: "Trending Now", products: trending },
//                 { title: "New Arrivals", products: newArrivals },
//                 { title: "Top Selling", products: topSelling },
//                 { title: "Most Viewed", products: mostViewed }
//             ]
//         };

//         await redis.set(cacheKey, JSON.stringify(response), "EX", 120);

//         return res.json(response);

//     } catch (err) {
//         console.error("🔥 Homepage Sections Error:", err);
//         return res.status(500).json({
//             success: false,
//             message: "Failed to fetch homepage sections"
//         });
//     }
// };
export const getHomepageSections = async (req, res) => {
    try {
        const redis = getRedis();
        const cacheKey = "homepage:v3";

        const cached = await redis.get(cacheKey);
        if (cached) return res.json(JSON.parse(cached));

        const userId = req.user?._id || null;

        /* -------------------------
           1️⃣ New Arrivals (STATIC)
        ------------------------- */
        const newArrivalsAgg = await Product.aggregate([
            {
                $match: {
                    isDeleted: { $ne: true },
                    isPublished: true
                }
            },
            {
                $lookup: {
                    from: "brands",           // 👈 Brand collection
                    localField: "brand",
                    foreignField: "_id",
                    as: "brand"
                }
            },
            { $unwind: { path: "$brand", preserveNullAndEmptyArrays: true } },
            { $sort: { createdAt: -1 } },
            { $limit: 10 }
        ]);


        const newArrivals = await enrichProductsUnified(
            newArrivalsAgg,
            await getActivePromotions()
        );

        /* -------------------------
           2️⃣ Recommendation-based sections
        ------------------------- */
        const [
            trendingRes,
            mostViewedRes
        ] = await Promise.all([
            getRecommendations({ mode: "default", limit: 10 }),
            getRecommendations({ mode: "alsoViewed", userId, limit: 10 })
        ]);

        const response = {
            success: true,
            sections: [
                {
                    title: "Trending Now",
                    products: trendingRes.products
                },
                {
                    title: "New Arrivals",
                    products: newArrivals
                },
                {
                    title: "Most Viewed",
                    products: mostViewedRes.products
                }
            ]
        };

        await redis.set(cacheKey, JSON.stringify(response), "EX", 120);
        return res.json(response);

    } catch (err) {
        console.error("🔥 Homepage Sections Error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch homepage sections"
        });
    }
};
