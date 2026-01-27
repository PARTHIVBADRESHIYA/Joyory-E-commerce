// controllers/user/userBrandController.js
import mongoose from "mongoose";
import Product from "../../models/Product.js";
import Category from "../../models/Category.js";
import Brand from "../../models/Brand.js";
import User from "../../models/User.js";
import Promotion from "../../models/Promotion.js";
import SkinType from "../../models/SkinType.js";
import { getRedis } from "../../middlewares/utils/redis.js";
// 🔹 helpers (same as category controller)
import { enrichProductsUnified } from "../../middlewares/services/productHelpers.js";
import { normalizeFilters, applyDynamicFilters, normalizeImages } from "../../controllers/user/userProductController.js";

export const getAllBrands = async (req, res) => {
    try {
        const brands = await Brand.find({ isActive: true })
            .select("_id name logo banner description slug")
            .sort({ name: 1 })
            .lean();

        const counts = await Product.aggregate([
            {
                $match: {
                    brand: { $in: brands.map(b => b._id) },
                    isPublished: true
                }
            },
            { $group: { _id: "$brand", count: { $sum: 1 } } }
        ]);

        const countMap = {};
        counts.forEach(c => {
            countMap[c._id.toString()] = c.count;
        });

        const enriched = brands.map(b => ({
            ...b,
            count: countMap[b._id.toString()] || 0
        }));

        res.json(enriched);
    } catch (err) {
        console.error("🔥 Error in getAllBrands:", err);
        res.status(500).json({ message: "Failed to fetch brands", error: err.message });
    }
};

export const getBrandCategoryProducts = async (req, res) => {
    try {
        const { brandSlug, categorySlug } = req.params;
        let { limit = 9, sort = "recent", cursor, ...queryFilters } = req.query;
        limit = Math.min(Number(limit) || 9, 50);

        // ---------------------------------------------
        // 🔥 CACHED VERSION — EXACTLY LIKE CATEGORY API
        // ---------------------------------------------
        const redis = getRedis();   // <-- 🔥 IMPORTANT

        const redisKey = `brandCat:v2:${brandSlug}:${categorySlug}:${JSON.stringify(req.query)}`;

        const cached = await redis.get(redisKey);
        if (cached) {
            return res.status(200).json(JSON.parse(cached));
        }
        // ---------------------------------------------


        const brand = await Brand.findOne({ slug: brandSlug, isActive: true }).lean();
        if (!brand) return res.status(404).json({ message: "Brand not found" });

        const category = await Category.findOne({ slug: categorySlug, isActive: true }).lean();
        if (!category) return res.status(404).json({ message: "Category not found" });

        if (req.user?.id) {
            await User.findByIdAndUpdate(req.user.id, { $pull: { recentBrands: brand._id } });
            await User.findByIdAndUpdate(req.user.id, {
                $push: { recentBrands: { $each: [brand._id], $position: 0, $slice: 20 } }
            });
        }

        const filters = normalizeFilters(queryFilters);
        if (filters.skinTypes?.length) {
            const skinDocs = await SkinType.find({
                name: { $in: filters.skinTypes.map(s => new RegExp(`^${s}$`, "i")) }
            }).select("_id").lean();
            filters.skinTypes = skinDocs.map(s => s._id.toString());
        }

        filters.brandIds = [brand._id.toString()];
        filters.categoryIds = [category._id.toString()];

        const finalFilter = await applyDynamicFilters(filters);
        finalFilter.isPublished = true;
        const sortConfig = {
            recent: { field: "_id", order: -1 },
            priceLowToHigh: { field: "minPrice", order: 1 },
            priceHighToLow: { field: "maxPrice", order: -1 },
            rating: { field: "avgRating", order: -1 }
        };

        const { field, order } = sortConfig[sort] || sortConfig.recent;

        if (cursor) {
            finalFilter[field] = order === -1
                ? { $lt: cursor }
                : { $gt: cursor };
        }
        const total = await Product.countDocuments(finalFilter);

        const products = await Product.find(finalFilter)
            .populate("brand", "name logo isActive")
            .populate("category", "name slug isActive")
            .populate("formulation", "name slug isActive")
            .populate("skinTypes", "name slug isActive")
            .sort({ [field]: order })
            .limit(limit + 1)
            .lean();

        const now = new Date();
        const promotions = await Promotion.find({
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).lean();

        const hasMore = products.length > limit;
        if (hasMore) products.pop();

        const enrichedProducts = await enrichProductsUnified(products, promotions);

        const countKey = `cat:products:total:${brandSlug}:${JSON.stringify(finalFilter)}`;
        let totalProducts = await redis.get(countKey);

        if (!totalProducts) {
            totalProducts = await Product.countDocuments(finalFilter);
            await redis.set(countKey, totalProducts, "EX", 300);
        }

        totalProducts = Number(totalProducts);


        const nextCursor =
            products.length > 0 ? products[products.length - 1][field] : null;

        let message = null;
        if (!enrichedProducts.length && cursor)
            message = "🎉 You’ve reached the end! No more products to show.";

        if (!enrichedProducts.length && !cursor)
            message = "No products found for this brand and category.";

        const brandData = {

            _id: brand._id,
            name: brand.name,
            slug: brand.slug,
            logo: brand.logo || null,
            banner: brand.banner || null
        };

        const response = {
            titleMessage: totalProducts > 0
                ? `${totalProducts} products found`
                : "No products found",
            brand: brandData,
            category,
            products: enrichedProducts,
            pagination: {
                hasMore,
                nextCursor
            },
            message
        };

        // ---------------------------------------------
        // 🔥 SAVE TO REDIS (60 sec cache)
        // ---------------------------------------------
        await redis.set(redisKey, JSON.stringify(response), "EX", 60);

        return res.status(200).json(response);

    } catch (err) {
        console.error("🔥 Error in getBrandCategoryProducts:", err);
        res.status(500).json({ message: "Failed to fetch category products", error: err.message });
    }
};

export const getBrandLanding = async (req, res) => {
    try {
        const { brandSlug } = req.params;

        let { limit = 9, sort = "recent", cursor, ...queryFilters } = req.query;
        limit = Math.min(Number(limit) || 9, 50);
        // ---------------------------------------------
        // 🔥 CACHED VERSION
        // ---------------------------------------------
        const redis = getRedis();   // <-- 🔥 IMPORTANT
        const redisKey = `brandLanding:v2:${brandSlug}:${JSON.stringify(req.query)}`;

        const cached = await redis.get(redisKey);
        if (cached) {
            return res.status(200).json(JSON.parse(cached));
        }


        const brand = await Brand.findOne({ slug: brandSlug, isActive: true })
            .select("banner name logo slug")
            .lean();
        if (!brand) return res.status(404).json({ message: "Brand not found" });

        const filters = normalizeFilters(queryFilters);
        if (filters.skinTypes?.length) {
            const skinDocs = await SkinType.find({
                name: { $in: filters.skinTypes.map(s => new RegExp(`^${s}$`, "i")) }
            }).select("_id").lean();
            filters.skinTypes = skinDocs.map(s => s._id.toString());
        }

        filters.brandIds = [brand._id.toString()];

        const finalFilter = await applyDynamicFilters(filters);
        finalFilter.isPublished = true;

        const sortConfig = {
            recent: { field: "_id", order: -1 },
            priceLowToHigh: { field: "minPrice", order: 1 },
            priceHighToLow: { field: "maxPrice", order: -1 },
            rating: { field: "avgRating", order: -1 }
        };

        const { field, order } = sortConfig[sort] || sortConfig.recent;

        if (cursor) {
            finalFilter[field] = order === -1
                ? { $lt: cursor }
                : { $gt: cursor };
        }

        const total = await Product.countDocuments(finalFilter);

        const products = await Product.find(finalFilter)
            .populate("brand", "name slug isActive")
            .populate("category", "name slug banner isActive")
            .populate("formulation", "name slug isActive")
            .populate("skinTypes", "name slug isActive")
            .sort({ [field]: order })
            .limit(limit + 1)
            .lean();

        const hasMore = products.length > limit;
        if (hasMore) products.pop();


        const now = new Date();
        const promotions = await Promotion.find({
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).lean();

        const enrichedProducts = await enrichProductsUnified(products, promotions);

        const uniqueCategoryIds = await Product.distinct("category", { brand: brand._id, isPublished: true });
        const categories = await Category.find({ _id: { $in: uniqueCategoryIds }, isActive: true })
            .select("name slug")
            .lean();


        const countKey = `cat:products:total:${brandSlug}:${JSON.stringify(finalFilter)}`;
        let totalProducts = await redis.get(countKey);

        if (!totalProducts) {
            totalProducts = await Product.countDocuments(finalFilter);
            await redis.set(countKey, totalProducts, "EX", 300);
        }

        totalProducts = Number(totalProducts);

        const nextCursor =
            products.length > 0 ? products[products.length - 1][field] : null;

        let message = null;
        if (!enrichedProducts.length && cursor)
            message = "🎉 You’ve reached the end! No more products to show.";

        if (!enrichedProducts.length && !cursor)
            message = `No products available for ${brand.name}.`;


        const response = {
            titleMessage: totalProducts > 0
                ? `${totalProducts} products found`
                : "No products found",
            brand: { _id: brand._id, name: brand.name, logo: brand.logo, banner: brand.banner },
            products: enrichedProducts,
            categories,
            pagination: {
                hasMore,
                nextCursor
            },
            message
        };

        // ---------------------------------------------
        // 🔥 SAVE TO REDIS (60 sec cache)
        // ---------------------------------------------
        await redis.set(redisKey, JSON.stringify(response), "EX", 60);

        return res.status(200).json(response);

    } catch (err) {
        console.error("🔥 Error in getBrandLanding:", err);
        res.status(500).json({ message: "Failed to fetch brand details", error: err.message });
    }
};
