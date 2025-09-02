import Product from '../../models/Product.js';
import ProductViewLog from "../../models/ProductViewLog.js";
import Promotion from '../../models/Promotion.js';
import User from '../../models/User.js';
import Review from '../../models/Review.js';
import Order from '../../models/Order.js';
import SkinType from '../../models/SkinType.js';
import Category from '../../models/Category.js';
import { getDescendantCategoryIds,getCategoryFallbackChain } from '../../middlewares/utils/categoryUtils.js';
import { getRecommendations } from '../../middlewares/utils/recommendationService.js';
import { formatProductCard } from '../../middlewares/utils/recommendationService.js';
import { applyFlatDiscount, asMoney, productMatchesPromo } from '../../controllers/user/userPromotionController.js'; // reuse helpers

import mongoose from 'mongoose';

// 🔧 Centralized helper for shades/colors
export const buildOptions = (product) => {
    if (!product) return { shadeOptions: [], colorOptions: [] };

    if (product.foundationVariants && product.foundationVariants.length > 0) {
        const shadeOptions = product.foundationVariants.map(v => v.shadeName).filter(Boolean);
        const colorOptions = product.foundationVariants.map(v => v.hex).filter(Boolean);
        return { shadeOptions, colorOptions };
    }

    return {
        shadeOptions: product.shadeOptions || [],
        colorOptions: product.colorOptions || []
    };
};

export const normalizeImages = (images = []) => {
    return images.map(img =>
        img.startsWith('http') ? img : `${process.env.BASE_URL}/${img}`
    );
};

// ✅ Filtered products with recommendations (trending)
export const getAllFilteredProducts = async (req, res) => {
    try {
        const {
            priceMin, priceMax, brand, category, discount,
            preference, ingredients, benefits, concern, skinType,
            makeupFinish, formulation, color, skinTone, gender, age,
            conscious, shade, page = 1, limit = 12
        } = req.query;

        const filter = {};
        let trackedCategoryId = null;

        if (brand) filter.brand = brand;

        if (category && category.trim() !== '') {
            let catDoc = null;
            if (mongoose.Types.ObjectId.isValid(category)) {
                catDoc = await Category.findById(category).lean();
            } else {
                catDoc = await Category.findOne({ slug: category.toLowerCase() }).lean();
            }

            if (catDoc?._id) {
                trackedCategoryId = catDoc._id;
                const ids = await getDescendantCategoryIds(catDoc._id);
                const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
                if (validIds.length) {
                    filter.$or = [
                        { categories: { $in: validIds } },
                        { category: { $in: validIds } }
                    ];
                }
            }
        }

        if (color) {
            filter.$or = [
                ...(filter.$or || []),
                { colorOptions: { $in: [color] } },
                { "foundationVariants.hex": { $in: [color] } }
            ];
        }
        if (shade) {
            filter.$or = [
                ...(filter.$or || []),
                { shadeOptions: { $in: [shade] } },
                { "foundationVariants.shadeName": { $in: [shade] } }
            ];
        }

        if (priceMin || priceMax) {
            filter.price = {};
            if (priceMin) filter.price.$gte = Number(priceMin);
            if (priceMax) filter.price.$lte = Number(priceMax);
        }

        const tagFilters = [
            skinType, formulation, makeupFinish, benefits, concern,
            skinTone, gender, age, conscious, preference, ingredients, discount
        ].filter(Boolean);
        if (tagFilters.length > 0) filter.productTags = { $all: tagFilters };

        const currentPage = Number(page);
        const perPage = Number(limit);
        const skip = (currentPage - 1) * perPage;

        const total = await Product.countDocuments(filter);

        const products = await Product.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(perPage)
            .select("name variant price brand category summary description status images commentsCount avgRating foundationVariants shadeOptions colorOptions")
            .lean();

        if (req.user && req.user.id && trackedCategoryId) {
            await User.findByIdAndUpdate(req.user.id, {
                $push: {
                    recentCategories: { $each: [trackedCategoryId], $position: 0, $slice: 20 }
                }
            });
        }

        const categoryIds = [...new Set(products.map(p => p.category).filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => String(id)))];

        const categoryMap = categoryIds.length
            ? new Map((await Category.find({ _id: { $in: categoryIds } }).select('name slug').lean()).map(c => [String(c._id), c]))
            : new Map();

        const cards = products.map(p => {
            const { shadeOptions, colorOptions } = buildOptions(p);
            return {
                _id: p._id,
                name: p.name,
                variant: p.variant,
                price: p.price,
                brand: p.brand,
                category: mongoose.Types.ObjectId.isValid(p.category) ? categoryMap.get(String(p.category)) || null : null,
                summary: p.summary || p.description?.slice(0, 100) || '',
                status: p.status,
                image: p.images?.length > 0 ? normalizeImages([p.images[0]])[0] : null,
                shadeOptions,
                colorOptions,
                commentsCount: p.commentsCount || 0,
                avgRating: p.avgRating || 0
            };
        });

        const totalPages = Math.ceil(total / perPage);

        // 🔥 Attach trending recommendations
        const trending = await getRecommendations({ mode: "trending", limit: 6 });

        res.status(200).json({
            products: cards,
            total,
            currentPage,
            totalPages,
            hasMore: currentPage < totalPages,
            nextPage: currentPage < totalPages ? currentPage + 1 : null,
            prevPage: currentPage > 1 ? currentPage - 1 : null,
            recommendations: trending.products || []
        });

    } catch (err) {
        console.error('❌ Filter error:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};
// ✅ Single product with recommendations, messages & parent category fallback

export const getSingleProduct = async (req, res) => {
    try {
        const productId = req.params.id;

        // 🔹 Fetch product and increment views
        const product = await Product.findByIdAndUpdate(
            productId,
            { $inc: { views: 1 } },
            { new: true, lean: true }
        );
        if (!product) return res.status(404).json({ message: 'Product not found' });

        // 🔹 Track recent products & categories
        if (req.user?.id) {
            const categoryValue = mongoose.Types.ObjectId.isValid(product.category)
                ? product.category
                : product.category?.slug || product.category?.toString();

            await User.findByIdAndUpdate(req.user.id, {
                $pull: { recentProducts: product._id, recentCategories: categoryValue }
            });

            await User.findByIdAndUpdate(req.user.id, {
                $push: {
                    recentProducts: { $each: [product._id], $position: 0, $slice: 20 },
                    recentCategories: { $each: [categoryValue], $position: 0, $slice: 20 }
                }
            });
        }

        // 🔹 Fetch category details
        let categoryObj = null;
        if (mongoose.Types.ObjectId.isValid(product.category)) {
            categoryObj = await Category.findById(product.category)
                .select("name slug parent")
                .lean();
        }

        // 🔹 Calculate average rating
        const reviews = await Review.find({ productId: product._id, status: "Active" }).select("rating");
        const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
        const avgRating = reviews.length ? parseFloat((totalRating / reviews.length).toFixed(1)) : 0;

        // 🔹 Fetch all promotions
        const promotions = await Promotion.find({}).lean();

        // 🔹 Find best applicable promotion for this product
        let bestPromo = null;
        let discountedPrice = product.price ?? product.mrp ?? 0;
        let discountPercent = 0;
        let discountAmount = 0;
        let badge = null;
        let promoMessage = null;

        promotions.forEach((promo) => {
            if (productMatchesPromo(product, promo)) {
                const { price, discountAmount: da, discountPercent: dp } = applyFlatDiscount(product.mrp ?? product.price, promo);
                if (!bestPromo || dp > discountPercent) {
                    bestPromo = promo;
                    discountedPrice = price;
                    discountPercent = dp;
                    discountAmount = da;
                }
            }
        });

        // 🔹 Set badge & promoMessage
        if (bestPromo) {
            const promoType = bestPromo.promotionType;
            if (promoType === "discount") {
                badge = bestPromo.discountUnit === "percent"
                    ? `${bestPromo.discountValue}% Off`
                    : `₹${asMoney(bestPromo.discountValue)} Off`;
                promoMessage = `Save ${badge} on this product`;
            } else if (promoType === "tieredDiscount") {
                const tiers = Array.isArray(bestPromo.promotionConfig?.tiers) ? bestPromo.promotionConfig.tiers : [];
                const bestTierPercent = tiers.length ? Math.max(...tiers.map(t => t.discountPercent || 0)) : 0;
                badge = `Buy More Save More (Up to ${bestTierPercent}%)`;
                promoMessage = `Add more to save up to ${bestTierPercent}%`;
            } else if (promoType === "bogo" || promoType === "buy1get1") {
                const bq = bestPromo.promotionConfig?.buyQty ?? 1;
                const gq = bestPromo.promotionConfig?.getQty ?? 1;
                badge = `BOGO ${bq}+${gq}`;
                promoMessage = `Buy ${bq}, Get ${gq} Free`;
            } else if (promoType === "bundle") {
                badge = "Bundle Deal";
                promoMessage = "Special price when bought together";
            } else if (promoType === "gift") {
                badge = "Free Gift";
                promoMessage = "Get a free gift on qualifying order";
            }
        }

        // 🔹 Return product
        res.status(200).json({
            _id: product._id,
            name: product.name,
            brand: product.brand,
            variant: product.variant,
            description: product.description || "",
            summary: product.summary || "",
            features: product.features || [],
            howToUse: product.howToUse || "",
            ingredients: product.ingredients || [],
            price: Math.round(discountedPrice),
            mrp: Math.round(product.mrp ?? product.price),
            discountPercent: Math.max(0, Math.round(discountPercent)),
            discountAmount: Math.max(0, Math.round(discountAmount)),
            badge,
            promoMessage,
            images: normalizeImages(product.images || []),
            category: categoryObj,
            shadeOptions: buildOptions(product).shadeOptions,
            colorOptions: buildOptions(product).colorOptions,
            foundationVariants: product.foundationVariants || [],
            avgRating,
            totalRatings: reviews.length,
        });

    } catch (err) {
        console.error("❌ getSingleProduct error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
};



// ✅ Products by category with full recommendations
export const getProductsByCategory = async (req, res) => {
    try {
        const slug = req.params.slug.toLowerCase();
        let { page = 1, limit = 12, sort = "recent" } = req.query;
        page = Number(page) || 1;
        limit = Number(limit) || 12;

        // 🔹 Fetch category by slug or ObjectId
        let category = null;
        if (mongoose.Types.ObjectId.isValid(slug)) {
            category = await Category.findById(slug)
                .select("name slug bannerImage thumbnailImage ancestors")
                .lean();
        } else {
            category = await Category.findOne({ slug })
                .select("name slug bannerImage thumbnailImage ancestors")
                .lean();
        }
        if (!category) return res.status(404).json({ message: "Category not found" });

        // 🔹 Track user's recent categories
        if (req.user && req.user.id) {
            await User.findByIdAndUpdate(req.user.id, { $pull: { recentCategories: category._id } });
            await User.findByIdAndUpdate(req.user.id, {
                $push: { recentCategories: { $each: [category._id], $position: 0, $slice: 20 } }
            });
        }

        // 🔹 Fetch descendant categories
        const ids = (await getDescendantCategoryIds(category._id))
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));
        ids.push(category._id);

        const filter = { $or: [{ categories: { $in: ids } }, { category: { $in: ids } }] };

        const sortOptions = {
            recent: { createdAt: -1 },
            priceLowToHigh: { price: 1 },
            priceHighToLow: { price: -1 },
            rating: { avgRating: -1 }
        };

        const total = await Product.countDocuments(filter);
        const products = await Product.find(filter)
            .sort(sortOptions[sort] || { createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const cards = await Promise.all(products.map(p => formatProductCard(p)));

        // 🔹 Breadcrumb from ancestors
        let ancestors = [];
        if (Array.isArray(category.ancestors) && category.ancestors.length) {
            const ancestorDocs = await Category.find({ _id: { $in: category.ancestors } })
                .select("name slug").lean();
            ancestors = category.ancestors.map(id => ancestorDocs.find(a => String(a._id) === String(id))).filter(Boolean);
        }

        // 🔹 Fetch recommendations in parallel
        const firstProduct = products[0] || await Product.findOne({ category: category._id }).lean();

        let [topSelling, moreLikeThis, trending] = await Promise.all([
            getRecommendations({ mode: "topSelling", categorySlug: category.slug, limit: 6 }),
            firstProduct ? getRecommendations({ mode: "moreLikeThis", productId: firstProduct._id, limit: 6 }) : Promise.resolve({ products: [] }),
            getRecommendations({ mode: "trending", limit: 6 })
        ]);

        // 🔹 Filter out duplicates
        const usedIds = new Set();
        const filterUnique = (rec) => {
            if (!rec?.products?.length) return [];
            return rec.products.filter(p => {
                const id = p._id.toString();
                if (usedIds.has(id)) return false;
                usedIds.add(id);
                return true;
            });
        };

        return res.status(200).json({
            category,
            breadcrumb: ancestors,
            products: cards,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit)
            }
        });

    } catch (err) {
        console.error("❌ getProductsByCategory error:", err);
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};


// 🔥 Top Selling Products
export const getTopSellingProducts = async (req, res) => {
    try {
        const topProducts = await Product.find()
            .sort({ sales: -1 })
            .limit(10)
            .select("name images foundationVariants shadeOptions colorOptions")
            .lean();

        res.status(200).json({
            success: true,
            products: topProducts.map(p => {
                const shadeOptions = (p.foundationVariants?.length > 0)
                    ? p.foundationVariants.map(v => v.shadeName).filter(Boolean)
                    : (p.shadeOptions || []);
                const colorOptions = (p.foundationVariants?.length > 0)
                    ? p.foundationVariants.map(v => v.hex).filter(Boolean)
                    : (p.colorOptions || []);

                return {
                    _id: p._id,
                    name: p.name,
                    image: p.image || (p.images?.[0] || null),
                    shadeOptions,
                    colorOptions
                };
            })
        });
    } catch (error) {
        console.error("🔥 Failed to fetch top sellers:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch top selling products",
            error: error.message
        });
    }
};

export const getTopSellingProductsByCategory = async (req, res) => {
    try {
        const { categorySlug } = req.query;

        // ✅ Use global recommendation system
        const { products, category, message } = await getRecommendations({
            categorySlug,
        });

        return res.status(200).json({
            success: true,
            category,
            message,
            products
        });
    } catch (error) {
        console.error("🔥 Failed to fetch top selling products:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch top selling products",
            error: error.message
        });
    }
};

// 🔥 Product Details + Related
export const getProductWithRelated = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id)
            .populate("category")
            .lean();

        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        // Normalize shades + colors from foundationVariants
        let shadeOptions = [];
        let colorOptions = [];
        if (Array.isArray(product.foundationVariants) && product.foundationVariants.length > 0) {
            shadeOptions = product.foundationVariants.map(v => v.shadeName).filter(Boolean);
            colorOptions = product.foundationVariants.map(v => v.hex).filter(Boolean);
        } else {
            shadeOptions = product.shadeOptions || [];
            colorOptions = product.colorOptions || [];
        }

        const responseProduct = {
            ...product,
            image: product.image || (product.images?.[0] || null),
            shadeOptions,
            colorOptions,
        };

        res.status(200).json({
            success: true,
            product: responseProduct
        });
    } catch (error) {
        console.error("🔥 Failed to fetch product:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch product",
            error: error.message
        });
    }
};

// 🔥 Top Categories (most popular categories – based on product count)
export const getTopCategories = async (req, res) => {
    try {
        const BASE_SLUGS = ['lipcare', 'eyecare', 'facecare', 'fragrance'];

        // 1️⃣ Get base categories
        const baseCategories = await Category.find({ slug: { $in: BASE_SLUGS } })
            .select('name slug thumbnailImage')
            .lean();

        // 2️⃣ Aggregate orders to get top-selling categories
        const topFromOrders = await Order.aggregate([
            { $unwind: "$items" },
            {
                $lookup: {
                    from: "products",
                    localField: "items.productId",
                    foreignField: "_id",
                    as: "product"
                }
            },
            { $unwind: "$product" },
            {
                $group: {
                    _id: "$product.category",
                    totalOrders: { $sum: "$items.qty" }
                }
            },
            { $sort: { totalOrders: -1 } },
            { $limit: 10 } // get more than needed in case some are duplicates
        ]);

        const orderedCategoryIds = topFromOrders.map(o => o._id);

        // 3️⃣ Get category docs for ordered categories
        const orderedCategories = await Category.find({ _id: { $in: orderedCategoryIds } })
            .select("name slug thumbnailImage")
            .lean();

        // 4️⃣ Merge base + dynamic categories (avoid duplicate slugs)
        const mergedMap = new Map();

        baseCategories.forEach(c => {
            mergedMap.set(c.slug, {
                _id: c._id,
                name: c.name,
                slug: c.slug,
                image: c.thumbnailImage || null,
                _sortValue: 0
            });
        });

        orderedCategories.forEach(c => {
            const totalOrders = topFromOrders.find(o => String(o._id) === String(c._id))?.totalOrders || 0;
            mergedMap.set(c.slug, {
                _id: c._id,
                name: c.name,
                slug: c.slug,
                image: c.thumbnailImage || null,
                _sortValue: totalOrders
            });
        });

        // 5️⃣ Sort by totalOrders and limit to top 6
        const result = Array.from(mergedMap.values())
            .sort((a, b) => b._sortValue - a._sortValue)
            .slice(0, 6)
            .map(({ _sortValue, ...rest }) => rest); // remove _sortValue from final result

        res.status(200).json({
            success: true,
            categories: result
        });

    } catch (err) {
        console.error("🔥 Failed to fetch top categories:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch top categories",
            error: err.message
        });
    }
};

// ✅ 1. Get all skin types (for homepage listing)
export const getAllSkinTypes = async (req, res) => {
    try {
        const { q = "", isActive, page = 1, limit = 20 } = req.query;
        const filters = { isDeleted: false };

        if (q) filters.name = { $regex: q, $options: "i" };
        if (typeof isActive !== "undefined") filters.isActive = isActive === "true";

        const pg = Math.max(parseInt(page, 10) || 1, 1);
        const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

        const pipeline = [
            { $match: filters },
            {
                $lookup: {
                    from: "products",
                    let: { sid: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $in: ["$$sid", { $ifNull: ["$skinTypes", []] }] },
                                isDeleted: { $ne: true }
                            }
                        },
                        { $count: "count" },
                    ],
                    as: "stats",
                },
            },
            {
                $addFields: {
                    productCount: {
                        $ifNull: [{ $arrayElemAt: ["$stats.count", 0] }, 0]
                    }
                }
            },
            { $project: { stats: 0 } },
            { $sort: { name: 1 } },
            { $skip: (pg - 1) * lim },
            { $limit: lim },
        ];

        const [rows, total] = await Promise.all([
            SkinType.aggregate(pipeline),
            SkinType.countDocuments(filters),
        ]);

        return res.json({
            success: true,
            data: rows,
            pagination: { page: pg, limit: lim, total }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};


// ✅ Products by Skin Type with Recommendations
export const getProductsBySkinType = async (req, res) => {
    try {
        const slug = req.params.slug.toLowerCase();
        let { page = 1, limit = 12, sort = "recent" } = req.query;
        page = Number(page) || 1;
        limit = Number(limit) || 12;

        // 🔹 Fetch skin type
        const skinType = await SkinType.findOne({ slug, isDeleted: false }).lean();
        if (!skinType) return res.status(404).json({ message: "Skin type not found" });

        // 🔹 Find related categories (Makeup + Skincare)
        const categories = await Category.find({ slug: { $in: ["makeup", "skincare"] } }).select("_id slug").lean();
        const categoryIds = categories.map(c => c._id);

        const sortOptions = {
            recent: { createdAt: -1 },
            priceLow: { price: 1 },
            priceHigh: { price: -1 },
            popular: { totalSales: -1 },
        };

        // 🔹 Fetch main products for this skin type
        const products = await Product.find({
            skinTypes: skinType._id,
            isDeleted: { $ne: true }
        })
            .sort(sortOptions[sort] || { createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const total = await Product.countDocuments({
            skinTypes: skinType._id,
            isDeleted: { $ne: true }
        });

        const mainProductIds = products.map(p => p._id);

        // 🔹 Fetch top-selling recommendations (Makeup + Skincare, excluding main products)
        const topSelling = await Product.find({
            category: { $in: categoryIds },
            isDeleted: { $ne: true },
            _id: { $nin: mainProductIds }
        }).sort({ totalSales: -1 }).limit(5).lean();

        const excludeIds = [...mainProductIds, ...topSelling.map(p => p._id)];

        // 🔹 Random recommendations
        const randomProducts = await Product.aggregate([
            { $match: { category: { $in: categoryIds }, isDeleted: { $ne: true }, _id: { $nin: excludeIds } } },
            { $sample: { size: 5 } }
        ]);

        // 🔹 Format all products consistently
        const formattedProducts = await Promise.all(products.map(p => formatProductCard(p)));
        const formattedTopSelling = await Promise.all(topSelling.map(p => formatProductCard(p)));
        const formattedRandom = await Promise.all(randomProducts.map(p => formatProductCard(p)));

        res.json({
            success: true,
            skinType: skinType.name,
            products: formattedProducts,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page < Math.ceil(total / limit) },
            recommendations: {
                topSelling: formattedTopSelling,
                random: formattedRandom
            }
        });

    } catch (err) {
        console.error("❌ getProductsBySkinType error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getProductDetail = async (req, res) => {
    try {
        const { id } = req.params;

        // 🔹 Fetch product
        const product = await Product.findById(id).lean();
        if (!product) return res.status(404).json({ success: false, message: "Product not found" });

        // 🔹 Track user product view
        if (req.user && req.user._id) {
            await ProductViewLog.create({
                userId: req.user._id,
                productId: id,
            });
        }

        // 🔹 Get product recommendations
        const [moreLikeThis, alsoViewed, boughtTogether] = await Promise.all([
            getRecommendations({ mode: "moreLikeThis", productId: product._id, limit: 6 }),
            getRecommendations({ mode: "alsoViewed", productId: product._id, limit: 6 }),
            getRecommendations({ mode: "boughtTogether", productId: product._id, limit: 6 })
        ]);

        // 🔹 Format product for frontend
        const formattedProduct = await formatProductCard(product);

        res.json({
            success: true,
            product: formattedProduct,
            recommendations: {
                moreLikeThis: moreLikeThis.products || [],
                alsoViewed: alsoViewed.products || [],
                boughtTogether: boughtTogether.products || []
            }
        });

    } catch (err) {
        console.error("❌ getProductDetail error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
