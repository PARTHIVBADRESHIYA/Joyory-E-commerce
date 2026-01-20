import Product from "../../models/Product.js";
import User from "../../models/User.js";
import Order from "../../models/Order.js";
import mongoose from "mongoose";
import { formatProductCard, getRecommendations, getActivePromotions } from "../../middlewares/utils/recommendationService.js";
import { enrichProductsUnified } from "../../middlewares/services/productHelpers.js";
import { getRedis } from "../../middlewares/utils/redis.js";
import Promotion from "../../models/Promotion.js";

export async function getEnrichedProductsByIds(productIds, cacheKey, ttl = 120) {
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

export const getHomepageSections = async (req, res) => {
    try {
        const redis = getRedis();
        const cacheKey = "homepage:v3";

        const cached = await redis.get(cacheKey);
        if (cached) return res.json(JSON.parse(cached));

        const userId = req.user?._id || null;

        // /* -------------------------
        //    1️⃣ New Arrivals (STATIC)
        // ------------------------- */
        // const newArrivalsAgg = await Product.aggregate([
        //     {
        //         $match: {
        //             isDeleted: { $ne: true },
        //             isPublished: true
        //         }
        //     },
        //     {
        //         $lookup: {
        //             from: "brands",           // 👈 Brand collection
        //             localField: "brand",
        //             foreignField: "_id",
        //             as: "brand"
        //         }
        //     },
        //     { $unwind: { path: "$brand", preserveNullAndEmptyArrays: true } },
        //     { $sort: { createdAt: -1 } },
        //     { $limit: 10 }
        // ]);

        const newArrivalsAgg = await Product.aggregate([
            {
                $match: {
                    isDeleted: { $ne: true },
                    isPublished: true
                }
            },

            // 🔹 Brand
            {
                $lookup: {
                    from: "brands",
                    localField: "brand",
                    foreignField: "_id",
                    as: "brand"
                }
            },
            { $unwind: { path: "$brand", preserveNullAndEmptyArrays: true } },

            // 🔹 Category
            {
                $lookup: {
                    from: "categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "category"
                }
            },
            { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },

            // 🔹 Formulation
            {
                $lookup: {
                    from: "formulations",
                    localField: "formulation",
                    foreignField: "_id",
                    as: "formulation"
                }
            },
            { $unwind: { path: "$formulation", preserveNullAndEmptyArrays: true } },

            // 🔹 Skin Types
            {
                $lookup: {
                    from: "skintypes",
                    localField: "skinTypes",
                    foreignField: "_id",
                    as: "skinTypes"
                }
            },

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
