// controllers/user/userBrandController.js
import mongoose from "mongoose";
import Product from "../../models/Product.js";
import Category from "../../models/Category.js";
import Brand from "../../models/Brand.js";
import User from "../../models/User.js";
import Promotion from "../../models/Promotion.js";
import SkinType from "../../models/SkinType.js";

// 🔹 helpers (same as category controller)
import {  enrichProductsUnified } from "../../middlewares/services/productHelpers.js";
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
// 🔹 BRAND CATEGORY PRODUCTS
export const getBrandCategoryProducts = async (req, res) => {
    try {
        const { brandSlug, categorySlug } = req.params;
        let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;
        page = Number(page) || 1;
        limit = Number(limit) || 12;

        const brand = await Brand.findOne({ slug: brandSlug, isActive: true }).lean();
        if (!brand) return res.status(404).json({ message: "Brand not found" });

        const category = await Category.findOne({ slug: categorySlug, isActive: true }).lean();
        if (!category) return res.status(404).json({ message: "Category not found" });

        // 🔹 Track recent brands
        if (req.user?.id) {
            await User.findByIdAndUpdate(req.user.id, { $pull: { recentBrands: brand._id } });
            await User.findByIdAndUpdate(req.user.id, {
                $push: { recentBrands: { $each: [brand._id], $position: 0, $slice: 20 } }
            });
        }

        // 🔹 Normalize filters
        const filters = normalizeFilters(queryFilters);

        // 🔹 Skin types → ObjectId
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

        // 🔹 Sorting
        const sortOptions = {
            recent: { createdAt: -1 },
            priceLowToHigh: { price: 1 },
            priceHighToLow: { price: -1 },
            rating: { avgRating: -1 }
        };

        // 🔹 Fetch products
        const total = await Product.countDocuments(finalFilter);
        const products = await Product.find(finalFilter)
            .sort(sortOptions[sort] || { createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        if (!products.length) {
            return res.status(200).json({
                brand,
                category,
                products: [],
                pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
                message: "No products available for this brand and category at the moment."
            });
        }

        // 🔹 Active promotions
        const now = new Date();
        const promotions = await Promotion.find({
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).lean();

        // 🔹 Enrich products using central helper
        const enrichedProducts = await enrichProductsUnified(products, promotions);

        return res.status(200).json({
            brand,
            category,
            products: enrichedProducts,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit)
            },
            message: null
        });

    } catch (err) {
        console.error("🔥 Error in getBrandCategoryProducts:", err);
        res.status(500).json({ message: "Failed to fetch category products", error: err.message });
    }
};

// 🔹 BRAND LANDING
export const getBrandLanding = async (req, res) => {
    try {
        const { brandSlug } = req.params;
        let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;
        page = Number(page) || 1;
        limit = Number(limit) || 12;

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

        const sortOptions = {
            recent: { createdAt: -1 },
            priceLowToHigh: { price: 1 },
            priceHighToLow: { price: -1 },
            rating: { avgRating: -1 }
        };

        const total = await Product.countDocuments(finalFilter);
        const products = await Product.find(finalFilter)
            .sort(sortOptions[sort] || { createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const now = new Date();
        const promotions = await Promotion.find({
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).lean();

        // 🔹 Enrich products using central helper
        const enrichedProducts = await enrichProductsUnified(products, promotions);

        const uniqueCategoryIds = await Product.distinct("category", { brand: brand._id, isPublished: true });
        const categories = await Category.find({ _id: { $in: uniqueCategoryIds }, isActive: true })
            .select("name slug")
            .lean();

        return res.status(200).json({
            brandBanner: brand.banner || null,
            brand: { _id: brand._id, name: brand.name, logo: brand.logo },
            products: enrichedProducts,
            categories,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit)
            },
            message: products.length ? `Showing products for ${brand.name}.` : `No products available for ${brand.name}.`
        });

    } catch (err) {
        console.error("🔥 Error in getBrandLanding:", err);
        res.status(500).json({ message: "Failed to fetch brand details", error: err.message });
    }
};
