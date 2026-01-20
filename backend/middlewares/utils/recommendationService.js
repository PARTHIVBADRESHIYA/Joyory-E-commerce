// middlewares/utils/recommendationService.js
import mongoose from "mongoose";
import Product from "../../models/Product.js";
import Promotion from "../../models/Promotion.js";
import Category from "../../models/Category.js";
import Order from "../../models/Order.js";
import User from "../../models/User.js";
import ProductViewLog from "../../models/ProductViewLog.js";
import SkinType from "../../models/SkinType.js";
import { buildOptions, normalizeImages } from "../../controllers/user/userProductController.js";
import { getCategoryFallbackChain } from "../../middlewares/utils/categoryUtils.js";
import { calculateVariantPrices } from "../../middlewares/services/promotionHelper.js";
import { enrichProductsUnified } from "../../middlewares/services/productHelpers.js";
import { getRedis } from "../utils/redis.js";


export const VARIANT_SALES_EXPR = {
    $sum: {
        $map: {
            input: "$variants",
            as: "v",
            in: { $ifNull: ["$$v.sales", 0] }
        }
    }
};

export const hydrateProducts = async (products) => {
    const ids = products.map(p => p._id);

    return await Product.find({ _id: { $in: ids } })
        .populate("brand", "name slug")
        .populate("category", "name slug")
        .populate("formulation", "name slug")
        .populate("skinTypes", "name slug")
        .lean();
};

/**
 * Pseudo variant helper
 */
export const getPseudoVariant = (product) => ({
    sku: product._id.toString(),
    stock: product.quantity || 0,
    price: product.price || 0,
    discountedPrice: product.discountedPrice || product.price || 0,
    originalPrice: product.price || 0,
    displayPrice: product.discountedPrice || product.price || 0,
    discountAmount: (product.price || 0) - (product.discountedPrice || product.price || 0),
    discountPercent: product.discountPercent || 0,
    status: product.quantity > 0 ? "inStock" : "outOfStock",
    message: product.quantity > 0 ? "In-stock" : "No stock available",
    images: product.images || [],
});

/**
 * Format single product card
 */
export const formatProductCard = async (product, promotions = []) => {
    if (!product) return null;

    let categoryObj = null;
    if (mongoose.Types.ObjectId.isValid(product.category)) {
        categoryObj = await Category.findById(product.category).select("name slug").lean();
    }

    const { shadeOptions, colorOptions } = buildOptions(product);
    let variantsArray = [];

    if (Array.isArray(product.variants) && product.variants.length > 0) {
        variantsArray = calculateVariantPrices(product.variants, product, promotions);
    } else if (product.variant && (!product.variants || !product.variants.length)) {
        const legacyVariant = {
            name: product.variant,
            sku: product.sku ?? `${product._id}-default`,
            stock: product.quantity ?? 0,
            originalPrice: product.mrp ?? product.price ?? 0,
            displayPrice: product.price ?? 0,
            discountPercent: product.mrp && product.mrp > product.price
                ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
                : 0,
            message: product.quantity > 0 ? "In-stock" : "No stock available",
            status: product.quantity > 0 ? "inStock" : "outOfStock",
            images: normalizeImages(product.images || []),
        };
        variantsArray = calculateVariantPrices([legacyVariant], product, promotions);
    }

    const displayVariant = variantsArray[0];
    const price = displayVariant?.displayPrice ?? product.price ?? 0;
    const mrp = displayVariant?.originalPrice ?? product.mrp ?? product.price ?? 0;
    const discountPercent = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
    const status = displayVariant?.status || (product.quantity > 0 ? "inStock" : "outOfStock");
    const message = displayVariant?.message || (product.quantity > 0 ? "In-stock" : "No stock available");
    const inStock = displayVariant?.stock > 0 || product.quantity > 0;

    return {
        _id: product._id,
        name: product.name,
        brand: product.brand,
        variant: product.variant ?? null,
        price,
        mrp,
        discountPercent,
        discountAmount: mrp - price,
        images: normalizeImages(product.images || []),
        shadeOptions,
        colorOptions,
        avgRating: product.avgRating || 0,
        totalRatings: product.commentsCount || 0,
        status,
        message,
        inStock,
        variants: variantsArray,
        selectedVariant: null,
        category: categoryObj
            ? { _id: categoryObj._id, name: categoryObj.name, slug: categoryObj.slug }
            : null,
    };
};

/**
 * Active promotions ⚡ cache 5 mins
 */
export const getActivePromotions = async () => {
    const redis = getRedis();
    const redisKey = "activePromotions";
    const cached = await redis.get(redisKey);
    if (cached) return JSON.parse(cached);

    const now = new Date();
    const promotions = await Promotion.find({
        status: "active",
        startDate: { $lte: now },
        endDate: { $gte: now }
    }).lean();

    await redis.set(redisKey, JSON.stringify(promotions), "EX", 300);
    return promotions;
};


export const getTrendingProducts = async (limit) => {
    const redis = getRedis();
    const redisKey = "trendingProducts:top50";

    const cached = await redis.get(redisKey);
    if (cached) return JSON.parse(cached).slice(0, limit);

    const products = await Product.aggregate([
        {
            $match: {
                isDeleted: { $ne: true },
                isPublished: true
            }
        },
        {
            $addFields: {
                totalSales: VARIANT_SALES_EXPR
            }
        },
        { $match: { totalSales: { $gt: 0 } } },
        { $sort: { totalSales: -1 } },
        { $limit: 50 }
    ]);

    await redis.set(redisKey, JSON.stringify(products), "EX", 120);
    return products.slice(0, limit);
};

/**
 * Batch fetch products by IDs
 */
const getProductsByIds = async (ids, limit) => {
    if (!ids.length) return [];
    const products = await Product.find({
        _id: { $in: ids },
        isDeleted: { $ne: true },
        isPublished: true
    }).lean();

    return ids
        .map(id => products.find(p => p._id.toString() === id.toString()))
        .filter(Boolean)
        .slice(0, limit);

};

/**
 * Fallback category chain products
 */

const getFallbackProducts = async (categoryId, limit) => {
    const chain = await getCategoryFallbackChain(
        await Category.findById(categoryId).lean()
    );

    for (const cat of chain) {
        const products = await Product.aggregate([
            {
                $match: {
                    category: cat._id,
                    isDeleted: { $ne: true },
                    isPublished: true
                }
            },
            {
                $addFields: {
                    totalSales: VARIANT_SALES_EXPR
                }
            },
            { $sort: { totalSales: -1 } },
            { $limit: limit }
        ]);

        if (products.length) {
            return { products, fallbackFrom: cat.name };
        }
    }

    return { products: [], fallbackFrom: null };
};



const getSkinTypeProducts = async (skinTypeId, categoryIds = [], limit) => {
    const match = {
        skinTypes: skinTypeId,
        isDeleted: { $ne: true },
        isPublished: true
    };

    if (categoryIds.length) match.category = { $in: categoryIds };

    return await Product.aggregate([
        { $match: match },
        {
            $addFields: {
                totalSales: VARIANT_SALES_EXPR
            }
        },
        { $sort: { totalSales: -1 } },
        { $limit: limit }
    ]);
};

/**
 * Main recommendations service ⚡ optimized
 */
export const getRecommendations = async ({ mode, productId, categorySlug, skinTypeSlug, userId, limit = 6 }) => {
    try {
        const promotions = await getActivePromotions();
        let products = [];
        let message = "";

        const fallbackCategoryChain = async (categoryId) => getFallbackProducts(categoryId, limit);
        const trendingProducts = async () => getTrendingProducts(limit);

        switch (mode) {
            case "moreLikeThis": {
                const product = await Product.findById(productId).lean();
                if (!product) return { success: false, products: [], message: "Product not found" };

                products = await Product.aggregate([
                    {
                        $match: {
                            _id: { $ne: product._id },
                            category: product.category,
                            isDeleted: { $ne: true },
                            isPublished: true
                        }
                    },
                    {
                        $addFields: {
                            totalSales: VARIANT_SALES_EXPR
                        }
                    },
                    { $sort: { totalSales: -1 } },
                    { $limit: limit }
                ]);

                let fallbackFrom = null;
                if (!products.length) {
                    products = await Product.aggregate([
                        {
                            $match: {
                                _id: { $ne: product._id },
                                category: product.category,
                                isDeleted: { $ne: true },
                                isPublished: true
                            }
                        },
                        {
                            $addFields: {
                                totalSales: VARIANT_SALES_EXPR
                            }
                        },
                        { $sort: { totalSales: -1 } },
                        { $limit: limit }
                    ]);

                    fallbackFrom = "same category";
                }


                if (!products.length && product.category) {
                    const fallback = await fallbackCategoryChain(product.category);
                    products = fallback.products;
                    fallbackFrom = fallback.fallbackFrom ? `parent category: ${fallback.fallbackFrom}` : null;
                }

                if (!products.length) {
                    products = await trendingProducts();
                    fallbackFrom = "trending products";
                }

                message = fallbackFrom ? `More like this (showing from ${fallbackFrom})` : "More like this";
                break;
            }
            case "boughtTogether": {
                const pid = new mongoose.Types.ObjectId(productId);

                // 1️⃣ Real "bought together" aggregation
                const boughtTogetherAgg = await Order.aggregate([
                    {
                        // Orders that REALLY include this product
                        $match: {
                            "products.productId": pid
                        }
                    },
                    {
                        // Expand products inside those orders
                        $unwind: "$products"
                    },
                    {
                        // Exclude the same product
                        $match: {
                            "products.productId": { $ne: pid }
                        }
                    },
                    {
                        // Weight by quantity (stronger signal)
                        $group: {
                            _id: "$products.productId",
                            score: { $sum: "$products.quantity" }
                        }
                    },
                    {
                        $sort: { score: -1 }
                    },
                    {
                        $limit: limit
                    }
                ]);

                products = await getProductsByIds(
                    boughtTogetherAgg.map(o => o._id),
                    limit
                );

                // 2️⃣ Fallback → category chain (ONLY if empty)
                let fallbackFrom = null;

                if (!products.length && productId) {
                    const prod = await Product.findById(productId).lean();
                    if (prod?.category) {
                        const fallback = await fallbackCategoryChain(prod.category);
                        products = fallback.products;
                        fallbackFrom = fallback.fallbackFrom
                            ? `parent category: ${fallback.fallbackFrom}`
                            : "same category";
                    }
                }

                // 3️⃣ LAST fallback → trending
                if (!products.length) {
                    products = await trendingProducts();
                    fallbackFrom = "trending products";
                }

                message = fallbackFrom
                    ? `Frequently bought together (showing from ${fallbackFrom})`
                    : "Frequently bought together";

                break;
            }

            case "alsoViewed": {
                const user = await User.findById(userId)
                    .select("recentlyViewed recentCategoryViews")
                    .lean();

                let fallbackFrom = null;

                /* ----------------------------------
                   1️⃣ Recently viewed products
                ---------------------------------- */
                if (user?.recentlyViewed?.length) {
                    const viewedProductIds = user.recentlyViewed
                        .sort((a, b) => new Date(b.viewedAt) - new Date(a.viewedAt))
                        .map(v => v.product)
                        .filter(Boolean);

                    products = await getProductsByIds(viewedProductIds, limit);
                }

                /* ----------------------------------
                   2️⃣ Recently viewed categories
                ---------------------------------- */
                if (!products.length && user?.recentCategoryViews?.length) {
                    const categoryIds = user.recentCategoryViews
                        .sort((a, b) => new Date(b.viewedAt) - new Date(a.viewedAt))
                        .map(c => c.category)
                        .filter(Boolean);

                    for (const catId of categoryIds) {
                        const categoryProducts = await Product.aggregate([
                            {
                                $match: {
                                    category: mongoose.Types.ObjectId(catId),
                                    isDeleted: { $ne: true },
                                    isPublished: true
                                }
                            },
                            {
                                $addFields: {
                                    totalSales: VARIANT_SALES_EXPR
                                }
                            },
                            { $sort: { totalSales: -1 } },
                            { $limit: limit }
                        ]);

                        if (categoryProducts.length) {
                            products = categoryProducts;
                            fallbackFrom = "recently viewed category";
                            break;
                        }
                    }
                }

                /* ----------------------------------
                   3️⃣ Final fallback → Trending
                ---------------------------------- */
                if (!products.length) {
                    products = await trendingProducts();
                    fallbackFrom = "trending products";
                }

                message = fallbackFrom
                    ? ` showing from ${fallbackFrom})`
                    : "You May Also Like";

                break;
            }


            case "skinType": {
                const skinType = await SkinType.findOne({ slug: skinTypeSlug, isDeleted: false }).lean();
                if (!skinType) return { success: false, products: [], message: "Skin type not found" };

                let fallbackFrom = null;
                let categoryIds = [];
                if (categorySlug) {
                    const cat = await Category.findOne({ slug: categorySlug }).lean();
                    if (cat) categoryIds = [cat._id];
                }

                products = await getSkinTypeProducts(skinType._id, categoryIds, limit);

                if (!products.length && categoryIds.length) {
                    products = await getSkinTypeProducts(skinType._id, [], limit);
                    fallbackFrom = `skin type: ${skinType.name}`;
                }

                if (!products.length) {
                    products = await trendingProducts();
                    fallbackFrom = "trending products";
                }

                message = fallbackFrom ? `Recommended for ${skinType.name} (showing from ${fallbackFrom})` : `Recommended for ${skinType.name}`;
                break;
            }

            case "categoryTopSelling": {
                const cat = await Category.findOne({ slug: categorySlug }).lean();
                if (!cat) return { success: false, products: [], message: "Category not found" };

                // products = await Product.find({ category: cat._id, isDeleted: { $ne: true }, isPublished: true })
                //     .sort({ sales: -1 }).limit(limit).lean();
                products = await Product.aggregate([
                    {
                        $match: {
                            category: cat._id,
                            isDeleted: { $ne: true },
                            isPublished: true
                        }
                    },
                    {
                        $addFields: {
                            totalSales: VARIANT_SALES_EXPR
                        }
                    },
                    { $sort: { totalSales: -1 } },
                    { $limit: limit }
                ]);

                let fallbackFrom = null;
                if (!products.length) {
                    const fallback = await fallbackCategoryChain(cat._id);
                    products = fallback.products;
                    fallbackFrom = fallback.fallbackFrom;
                }

                if (!products.length) {
                    products = await trendingProducts();
                    fallbackFrom = "trending products";
                }

                message = fallbackFrom ? `Top selling (showing from ${fallbackFrom})` : `Top selling in ${cat.name}`;
                break;
            }

            default: {
                products = await trendingProducts();
                message = "Trending products";
            }
        }

        products = await hydrateProducts(products);

        const enrichedProducts = await enrichProductsUnified(products, promotions);
        return { success: true, products: enrichedProducts, message };

    } catch (err) {
        console.error("❌ Recommendation service error:", err);
        return { success: false, products: [], message: "Server error", error: err.message };
    }
};









