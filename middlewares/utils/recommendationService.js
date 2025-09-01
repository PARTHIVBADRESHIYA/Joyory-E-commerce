import Product from "../../models/Product.js";
import Category from "../../models/Category.js";
import { getCategoryFallbackChain } from "./categoryUtils.js"; // assuming you already have this

/**
 * Universal Recommendation System
 * @param {Object} options 
 * @param {String} [options.categorySlug] - Category slug to start from
 * @param {Number} [options.limit=3] - Number of products to fetch
 * @returns {Object} { products, category, message }
 */
export const getRecommendedProducts = async ({ categorySlug, limit = 3 }) => {
    let categoriesToCheck = [];
    let baseCategory = null;

    // 1️⃣ Step 1: Build fallback chain from provided category
    if (categorySlug) {
        baseCategory = await Category.findOne({ slug: categorySlug })
            .select("_id name slug thumbnailImage parent")
            .lean();

        if (baseCategory) {
            categoriesToCheck = await getCategoryFallbackChain(baseCategory);
        }
    }

    let finalCategory = null;
    let products = [];
    let message = "";

    // 2️⃣ Step 2: Try category → parent → grandparent
    for (const cat of categoriesToCheck) {
        products = await Product.find({ category: cat._id, sales: { $gt: 0 } })
            .sort({ sales: -1 })
            .limit(Number(limit))
            .populate("category", "name slug thumbnailImage")
            .select("name image images foundationVariants shadeOptions colorOptions sales category")
            .lean();

        if (products.length) {
            finalCategory = cat;
            message = `Showing top selling products in ${cat.name}`;
            break;
        }
    }

    // 3️⃣ Step 3: Fallback → Global best sellers
    if (!products.length) {
        products = await Product.find({ sales: { $gt: 0 } })
            .sort({ sales: -1 })
            .limit(Number(limit))
            .populate("category", "name slug thumbnailImage")
            .select("name image images foundationVariants shadeOptions colorOptions sales category")
            .lean();

        if (products.length) {
            finalCategory = products[0].category;
            message = "No top sellers found in this category. Showing global best sellers.";
        }
    }

    // 4️⃣ Step 4: Fallback → Random picks
    if (!products.length) {
        products = await Product.aggregate([
            { $sample: { size: Number(limit) } },
            {
                $lookup: {
                    from: "categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "category"
                }
            },
            { $unwind: "$category" },
            {
                $project: {
                    name: 1,
                    image: 1,
                    images: 1,
                    foundationVariants: 1,
                    shadeOptions: 1,
                    colorOptions: 1,
                    category: { _id: 1, name: 1, slug: 1, thumbnailImage: 1 }
                }
            }
        ]);
        finalCategory = null;
        message = "No sales data found. Showing some popular picks for you.";
    }

    // 5️⃣ Step 5: Format product response
    const formattedProducts = products.map(p => {
        const shadeOptions = p.foundationVariants?.length
            ? p.foundationVariants.map(v => v.shadeName).filter(Boolean)
            : (p.shadeOptions || []);

        const colorOptions = p.foundationVariants?.length
            ? p.foundationVariants.map(v => v.hex).filter(Boolean)
            : (p.colorOptions || []);

        return {
            _id: p._id,
            name: p.name,
            sales: p.sales || 0,
            image: p.image || (p.images?.[0] || null),
            shadeOptions,
            colorOptions
        };
    });

    return {
        products: formattedProducts,
        category: finalCategory
            ? {
                _id: finalCategory._id,
                name: finalCategory.name,
                slug: finalCategory.slug,
                image: finalCategory.thumbnailImage || null
            }
            : null,
        message
    };
};
