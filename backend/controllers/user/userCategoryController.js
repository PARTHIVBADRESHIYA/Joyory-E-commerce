import mongoose from "mongoose";
// controllers/user/categoryController.js
import Category from '../../models/Category.js';
import Product from '../../models/Product.js';
import { buildCategoryHierarchy } from '../../middlewares/utils/categoryUtils.js';

export const getCategoryTree = async (req, res) => {
    try {
        const maxDepth = req.query.maxDepth ? parseInt(req.query.maxDepth, 10) : null;

        if (maxDepth && maxDepth < 1) {
            return res.status(400).json({ message: 'maxDepth must be >= 1' });
        }

        const categories = await Category.find(
            { isActive: true },
            { _id: 1, name: 1, slug: 1, parent: 1, bannerImage: 1, thumbnailImage: 1 }
        ).sort({ name: 1 }).lean();

        let tree = buildCategoryHierarchy(categories);

        const cleanTree = (nodes, depth = 1) => {
            return nodes.map(({ _id, name, slug, bannerImage, thumbnailImage, subCategories }) => ({
                _id,
                name,
                slug,
                bannerImage,
                thumbnailImage,
                subCategories:
                    maxDepth && depth >= maxDepth
                        ? []
                        : (subCategories && subCategories.length > 0
                            ? cleanTree(subCategories, depth + 1)
                            : [])
            }));
        };

        res.json(cleanTree(tree));
    } catch (err) {
        console.error("❌ getCategoryTree error:", err);
        res.status(500).json({ message: err.message });
    }
};




// 1. Homepage: get all brands (top-level categories)
export const getBrands = async (req, res) => {
    try {
        const brands = await Category.aggregate([
            { $match: { parent: null, isActive: true } },
            // Check if this category has products
            {
                $lookup: {
                    from: "products",
                    localField: "_id",
                    foreignField: "brand", // adjust to your schema
                    as: "products"
                }
            },
            // Check if this category has child categories
            {
                $lookup: {
                    from: "categories",
                    localField: "_id",
                    foreignField: "parent",
                    as: "children"
                }
            },
            // Keep only if products or children exist
            {
                $match: {
                    $or: [
                        { "products.0": { $exists: true } },
                        { "children.0": { $exists: true } }
                    ]
                }
            },
            {
                $project: {
                    products: 0,
                    children: 0
                }
            }
        ]);

        res.json({
            type: "brands",
            data: brands.length > 0 ? brands : []  // if no brands → return []
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// 2. Brand page: categories + products
export const getBrandWithCategories = async (req, res) => {
    try {
        const brand = await Category.findOne({ slug: req.params.brandSlug, parent: null });
        if (!brand) return res.status(404).json({ message: "Brand not found" });

        const categories = await Category.find({ parent: brand._id });
        const products = await Product.find({ brand: brand._id }).limit(10);

        res.json({ brand, categories, products });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 3. Category inside brand → products only
export const getProductsByBrandAndCategory = async (req, res) => {
    try {
        const brand = await Category.findOne({ slug: req.params.brandSlug, parent: null });
        if (!brand) return res.status(404).json({ message: "Brand not found" });

        const category = await Category.findOne({ slug: req.params.categorySlug, parent: brand._id });
        if (!category) return res.status(404).json({ message: "Category not found in this brand" });

        const products = await Product.find({ category: category._id });
        res.json({ brand, category, products });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
