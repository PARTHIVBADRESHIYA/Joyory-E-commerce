// middlewares/utils/recommendationService.js
import mongoose from "mongoose";
import Product from "../../models/Product.js";
import Category from "../../models/Category.js";
import Order from "../../models/Order.js";
import ProductViewLog from "../../models/ProductViewLog.js";
import { buildOptions, normalizeImages } from "../../controllers/user/userProductController.js";

/**
 * Format a single product into a full card
 */
export const formatProductCard = async (product) => {
    if (!product) return null;

    let categoryObj = null;
    if (mongoose.Types.ObjectId.isValid(product.category)) {
        categoryObj = await Category.findById(product.category).select("name slug").lean();
    }

    const { shadeOptions, colorOptions } = buildOptions(product);

    return {
        _id: product._id,
        name: product.name,
        brand: product.brand,
        variant: product.variant,
        price: product.price,
        mrp: product.mrp,
        discountPercent: product.mrp ? Math.round(((product.mrp - product.price) / product.mrp) * 100) : 0,
        summary: product.summary || product.description?.slice(0, 100) || "",
        images: normalizeImages(product.images || []),
        category: categoryObj,
        shadeOptions,
        colorOptions,
        foundationVariants: product.foundationVariants || [],
        avgRating: product.avgRating || 0,
        totalRatings: product.commentsCount || 0,
        inStock: product.inStock ?? true
    };
};

/**
 * Universal Recommendation Service
 */
export const getRecommendations = async ({ mode, productId, categorySlug, userId, limit = 6 }) => {
    try {
        let products = [];
        let message = "";

        // Helper: trending products
        const getTrending = async () => {
            return await Product.find({ sales: { $gt: 0 } })
                .sort({ sales: -1 })
                .limit(Number(limit))
                .lean();
        };

        switch (mode) {
            case "moreLikeThis": {
                const product = await Product.findById(productId).lean();
                if (!product) return { success: false, products: [], message: "Product not found" };

                products = await Product.find({
                    _id: { $ne: product._id },
                    category: product.category,
                    brand: product.brand
                }).sort({ sales: -1 }).limit(Number(limit)).lean();

                // Fallbacks
                if (!products.length) {
                    products = await Product.find({
                        _id: { $ne: product._id },
                        category: product.category
                    }).sort({ sales: -1 }).limit(Number(limit)).lean();
                }
                if (!products.length) products = await getTrending();
                message = "More like this";
                break;
            }

            case "alsoViewed": {
                const logs = await ProductViewLog.aggregate([
                    { $match: { productId: new mongoose.Types.ObjectId(productId) } },
                    { $group: { _id: "$userId" } },
                    {
                        $lookup: {
                            from: "productviewlogs",
                            localField: "_id",
                            foreignField: "userId",
                            as: "otherViews"
                        }
                    },
                    { $unwind: "$otherViews" },
                    { $match: { "otherViews.productId": { $ne: new mongoose.Types.ObjectId(productId) } } },
                    { $group: { _id: "$otherViews.productId", count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: Number(limit) }
                ]);

                const productIds = logs.map(l => l._id);
                products = await Product.find({ _id: { $in: productIds } }).lean();

                if (!products.length) products = (await getRecommendations({ mode: "moreLikeThis", productId, limit })).products;
                if (!products.length) products = await getTrending();
                message = "Customers also viewed";
                break;
            }

            case "boughtTogether": {
                const orders = await Order.aggregate([
                    { $unwind: "$products" },
                    { $match: { "products.productId": { $ne: new mongoose.Types.ObjectId(productId) }, "products.productId": { $exists: true } } },
                    { $group: { _id: "$products.productId", count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: Number(limit) }
                ]);

                const productIds = orders.map(o => o._id);
                products = await Product.find({ _id: { $in: productIds } }).lean();

                if (!products.length) {
                    const prod = await Product.findById(productId).lean();
                    if (prod?.category) {
                        products = await Product.find({
                            _id: { $ne: prod._id },
                            category: prod.category
                        }).sort({ sales: -1 }).limit(Number(limit)).lean();
                    }
                }

                if (!products.length) products = await getTrending();
                message = "Frequently bought together";
                break;
            }

            case "topSelling": {
                const category = await Category.findOne({ slug: categorySlug }).lean();
                if (!category) return { success: false, products: [], message: "Category not found" };

                products = await Product.find({ category: category._id }).sort({ sales: -1 }).limit(Number(limit)).lean();
                if (!products.length) products = await getTrending();
                message = `Top selling in ${category.name}`;
                break;
            }

            case "trending": {
                products = await getTrending();
                message = "Trending now";
                break;
            }

            case "recentlyViewed": {
                const viewed = await ProductViewLog.find({ userId })
                    .sort({ createdAt: -1 })
                    .limit(Number(limit))
                    .populate("productId")
                    .lean();

                products = viewed.map(v => v.productId);
                if (!products.length) products = await getTrending();
                message = "Recently viewed by you";
                break;
            }

            default:
                return { success: false, products: [], message: "Invalid mode" };
        }

        // Format all products fully
        products = await Promise.all(products.map(p => formatProductCard(p)));

        return { success: true, products, message };
    } catch (err) {
        console.error("❌ Recommendation service error:", err);
        return { success: false, products: [], message: "Server error" };
    }
};
