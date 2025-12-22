import Product from "../models/Product.js";
import { getRedis } from '../middlewares/utils/redis.js';
import { normalizeFilters } from '../controllers/user/userProductController.js';
import Promotion from "../models/Promotion.js";
import { enrichProductsUnified } from "../middlewares/services/productHelpers.js";

export const updateProductVTO = async (req, res) => {
    try {
        const { id } = req.params;
        const { supportsVTO, vtoType } = req.body;

        const product = await Product.findByIdAndUpdate(
            id,
            { supportsVTO, vtoType },
            { new: true }
        );

        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        res.json({
            message: "VTO settings updated successfully",
            product
        });
    } catch (error) {
        res.status(500).json({ message: "Error updating VTO", error: error.message });
    }
};


export const getAllVTOProducts = async (req, res) => {
    try {
        const products = await Product.find({ supportsVTO: true })
            .select("name slug brand category vtoType supportsVTO variants");

        res.json({ total: products.length, products });
    } catch (error) {
        res.status(500).json({ message: "Error fetching VTO products", error: error.message });
    }
};



// export const getAllVTOEnabledProducts = async (req, res) => {
//     try {
//         const redisKey = `vtoProducts:${JSON.stringify(req.query)}`;
//         const cached = await redis.get(redisKey);

//         if (cached) {
//             return res.status(200).json(JSON.parse(cached));
//         }

//         // 🔹 Pagination + Sorting
//         let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;
//         page = Number(page) || 1;
//         limit = Math.min(Number(limit) || 12, 50);

//         // Base VTO filter
//         const finalFilter = {
//             supportsVTO: true,
//             vtoType: { $ne: null },
//             isPublished: true,
//         };

//         // You can extend filters same as getAllProducts
//         // Prevent dynamic filters from overriding VTO logic
//         // Prevent dynamic filters from overriding VTO logic
//         const dynamic = normalizeFilters(queryFilters);

//         for (const key in dynamic) {
//             if (
//                 ["supportsVTO", "vtoType", "isPublished"].includes(key) ||
//                 dynamic[key] === undefined ||
//                 dynamic[key] === null ||
//                 dynamic[key] === "" ||
//                 (Array.isArray(dynamic[key]) && dynamic[key].length === 0)
//             ) {
//                 continue;
//             }

//             finalFilter[key] = dynamic[key];
//         }


//         const sortOptions = {
//             recent: { createdAt: -1 },
//             priceLowToHigh: { minPrice: 1 },
//             priceHighToLow: { minPrice: -1 },
//             rating: { avgRating: -1 },
//             discount: { discountPercent: -1 },
//         };

//         const total = await Product.countDocuments(finalFilter);

//         const products = await Product.find(finalFilter)
//             .populate("brand", "name slug logo isActive")
//             .populate("category", "name slug")
//             .populate("skinTypes", "name slug")
//             .populate("formulation", "name slug")
//             .sort(sortOptions[sort] || { createdAt: -1 })
//             .skip((page - 1) * limit)
//             .limit(limit)
//             .lean();

//         const now = new Date();
//         const promotions = await Promotion.find({
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now }
//         }).lean();

//         const enriched = await enrichProductsUnified(products, promotions);

//         const response = {
//             products: enriched,
//             pagination: {
//                 page,
//                 limit,
//                 total,
//                 totalPages: Math.ceil(total / limit),
//                 hasMore: page < Math.ceil(total / limit)
//             }
//         };

//         await redis.set(redisKey, JSON.stringify(response), "EX", 60);

//         return res.status(200).json(response);

//     } catch (err) {
//         console.error("❌ getAllVTOEnabledProducts error:", err);
//         return res.status(500).json({
//             message: "Failed to fetch VTO enabled products.",
//             error: err.message
//         });
//     }
// };


export const getAllVTOEnabledProducts = async (req, res) => {
    try {
        const redis = getRedis();   // <-- 🔥 IMPORTANT
        const redisKey = `vtoProducts:${JSON.stringify(req.query)}`;
        const cached = await redis.get(redisKey);

        if (cached) {
            return res.status(200).json(JSON.parse(cached));
        }

        // Pagination + Sorting
        let { page = 1, limit = 12, sort = "recent", vtoType,              // 🔥 extract explicitly
            ...queryFilters } = req.query;
        page = Number(page) || 1;
        limit = Math.min(Number(limit) || 12, 50);

        const baseFilter = {
            supportsVTO: true,
            isPublished: true,
            ...(vtoType ? { vtoType } : {})   // 🔥 lips / face / etc
        };


        // Normalize dynamic filters
        const dynamic = normalizeFilters(queryFilters);

        // Remove empty/undefined filters
        const safeDynamic = Object.fromEntries(
            Object.entries(dynamic).filter(([key, value]) => {
                if (["supportsVTO", "vtoType", "isPublished"].includes(key)) return false;
                if (value === undefined || value === null || value === "") return false;
                if (Array.isArray(value) && value.length === 0) return false;
                return true;
            })
        );

        // Final filter
        const finalFilter = { ...baseFilter, ...safeDynamic };

        // Sorting options
        const sortOptions = {
            recent: { createdAt: -1 },
            priceLowToHigh: { minPrice: 1 },
            priceHighToLow: { minPrice: -1 },
            rating: { avgRating: -1 },
            discount: { discountPercent: -1 },
        };

        // Count
        const total = await Product.countDocuments(finalFilter);

        // Fetch products
        const products = await Product.find(finalFilter)
            .populate("brand", "name slug logo isActive")
            .populate("category", "name slug")
            .populate("skinTypes", "name slug isActive")
            .populate("formulation", "name slug isActive")
            .sort(sortOptions[sort] || { createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        // No products
        if (!products.length) {
            return res.status(200).json({
                category: null,             // matched structure
                breadcrumb: [],             // matched structure
                products: [],
                pagination: {
                    page,
                    limit,
                    total: 0,
                    totalPages: 0,
                    hasMore: false,
                },
                message: "No Virtual Try-On products available right now.",
            });
        }

        // Promotions
        const now = new Date();
        const promotions = await Promotion.find({
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).lean();

        // Enrich (price, discount, offers)
        const enriched = await enrichProductsUnified(products, promotions);

        // Stock Messages (same as category API)
        for (const prod of enriched) {
            if (!Array.isArray(prod.variants)) continue;

            for (const v of prod.variants) {
                const s = v.stock ?? 0;
                if (s <= 0) v.stockMessage = "⛔ Currently out of stock — check back soon!";
                else if (s === 1) v.stockMessage = "🔥 Almost gone! Only 1 left in stock.";
                else if (s <= 3) v.stockMessage = `⚡ Hurry! Just ${s} piece${s > 1 ? "s" : ""} remaining.`;
                else if (s < 10) v.stockMessage = `💨 Only a few left — ${s} available!`;
                else v.stockMessage = null;
            }
        }

        // Ensure Slug exists
        const { generateUniqueSlug } = await import("../middlewares/utils/slug.js");
        for (const prod of enriched) {
            if (!prod.slug) {
                const newSlug = await generateUniqueSlug(Product, prod.name);
                await Product.findByIdAndUpdate(prod._id, { slug: newSlug });
                prod.slug = newSlug;
            }
        }

        // Keep original populations (same as category API)
        const productsWithRelations = enriched.map((p, i) => ({
            ...p,
            brand: products[i].brand,
            category: products[i].category,
            skinTypes: products[i].skinTypes,
            formulation: products[i].formulation
        }));

        // FINAL RESPONSE — EXACT STRUCTURE MATCH
        const response = {
            category: null,        // category API uses this
            breadcrumb: [],        // keep same structure
            products: productsWithRelations,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit)
            },
            message: null
        };

        // Cache
        await redis.set(redisKey, JSON.stringify(response), "EX", 60);

        return res.status(200).json(response);

    } catch (err) {
        console.error("❌ getAllVTOEnabledProducts error:", err);
        return res.status(500).json({
            message: "Failed to fetch VTO enabled products.",
        });
    }
};
