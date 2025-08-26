
// controllers/user/userBrandController.js
import Product from "../../models/Product.js";
import Category from "../../models/Category.js";
import Brand from "../../models/Brand.js";
import mongoose from "mongoose";
// Assuming slugToRegex is a valid utility, keeping it for robustness,
// but the main logic is now simplified.
import { slugToRegex } from "../../middlewares/utils/slug.js";

/**
 * GET /api/brands
 * Returns all active brands with product counts
 */
export const getAllBrands = async (req, res) => {
    try {
        const brands = await Brand.find({ isActive: true })
            .select("_id name logo banner description slug")
            .sort({ name: 1 })
            .lean();

        // Simplified aggregation to count products for each brand
        // It now relies on the brand's ObjectId, as your migration ensures consistency.
        const counts = await Product.aggregate([
            {
                $match: {
                    brand: { $in: brands.map(b => b._id) }
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

/**
 * GET /api/brands/:brandSlug
 * Returns brand info + all products + all categories for that brand
 */
export const getBrandLanding = async (req, res) => {
    try {
        const { brandSlug } = req.params;

        // Find the brand document first by its slug
        const brand = await Brand.findOne({ slug: brandSlug }).lean();

        if (!brand) {
            return res.status(404).json({ message: "Brand not found" });
        }

        // Fetch all products for the brand
        const products = await Product.find({ brand: brand._id })
            .populate("category", "name slug")
            .lean();

        // Fetch all unique categories for this brand's products
        const uniqueCategoryIds = await Product.distinct("category", { brand: brand._id });
        const categories = await Category.find({ _id: { $in: uniqueCategoryIds }, isActive: true })
            .select("name slug")
            .lean();

        // Return brand details, all its products, and all associated categories
        res.json({ brand, products, categories });
    } catch (err) {
        console.error("🔥 Error in getBrandLanding:", err);
        res.status(500).json({
            message: "Failed to fetch brand details",
            error: err.message
        });
    }
};

/**
 * GET /api/brands/:brandSlug/:categorySlug
 * Returns products for a brand inside a specific category
 */
export const getBrandCategoryProducts = async (req, res) => {
    try {
        const { brandSlug, categorySlug } = req.params;

        // Find brand by slug, simplified logic
        const brand = await Brand.findOne({ slug: brandSlug, isActive: true }).lean();
        if (!brand) return res.status(404).json({ message: "Brand not found" });

        // Find category by slug, simplified logic
        const category = await Category.findOne({ slug: categorySlug, isActive: true }).lean();
        if (!category) return res.status(404).json({ message: "Category not found" });

        // Create the filter using the ObjectIds
        const filter = {
            brand: brand._id,
            category: category._id
        };

        const products = await Product.find(filter)
            .populate("category", "name slug")
            .populate("brand", "name logo")
            .lean();

        res.json({ brand, category, products });
    } catch (err) {
        console.error("🔥 Error in getBrandCategoryProducts:", err);
        res.status(500).json({
            message: "Failed to fetch category products",
            error: err.message
        });
    }
};
