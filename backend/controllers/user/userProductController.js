import Product from '../../models/Product.js';
import ProductViewLog from "../../models/ProductViewLog.js";
import Promotion from '../../models/Promotion.js';
import User from '../../models/User.js';
import Review from '../../models/Review.js';
import Order from '../../models/Order.js';
import Brand from '../../models/Brand.js';
import SkinType from '../../models/SkinType.js';
import Formulation from "../../models/shade/Formulation.js";
import Category from '../../models/Category.js';
import { getDescendantCategoryIds, getCategoryFallbackChain } from '../../middlewares/utils/categoryUtils.js';
import { getRecommendations } from '../../middlewares/utils/recommendationService.js';
import { formatProductCard } from '../../middlewares/utils/recommendationService.js';
import { enrichProductWithStockAndOptions } from "../../middlewares/services/productHelpers.js";
import { applyFlatDiscount, asMoney, productMatchesPromo } from '../../controllers/user/userPromotionController.js'; // reuse helpers
import { fetchProducts } from "../../middlewares/services/productQueryBuilder.js";
import mongoose from 'mongoose';

// 🔧 Centralized helper for shades/colors
export const buildOptions = (product) => {
    if (!product) return { shadeOptions: [], colorOptions: [] };

    if (product.variants && product.variants.length > 0) {
        const shadeOptions = product.variants.map(v => v.shadeName).filter(Boolean);
        const colorOptions = product.variants.map(v => v.hex).filter(Boolean);
        return { shadeOptions, colorOptions };
    }

    return {
        shadeOptions: product.shadeOptions || [],
        colorOptions: product.colorOptions || []
    };
};

export const getFilterMetadata = async (req, res) => {
    try {
        // 🔹 Fetch all master data
        const [brands, categories, skinTypes, formulations] = await Promise.all([
            Brand.find({}, "name").lean(),
            Category.find({}, "name").lean(),
            SkinType.find({}, "name").lean(),
            Formulation.find({}, "name").lean()
        ]);

        // 🔹 Normalize filters from query (optional filters from frontend)
        const filters = normalizeFilters(req.query);

        // 🔹 Count products per brand using dynamic filters
        const brandCountsAgg = await Product.aggregate([
            { $match: applyDynamicFilters(filters) },
            { $group: { _id: "$brand", count: { $sum: 1 } } }
        ]);

        // 🔹 Count products per category using dynamic filters
        const categoryCountsAgg = await Product.aggregate([
            { $match: applyDynamicFilters(filters) },
            { $group: { _id: "$category", count: { $sum: 1 } } }
        ]);

        const countMap = arr => Object.fromEntries(arr.map(i => [i._id?.toString(), i.count]));

        // 🔹 Respond with counts and master data
        res.json({
            brands: brands.map(b => ({
                ...b,
                count: countMap(brandCountsAgg)[b._id?.toString()] || 0
            })),
            categories: categories.map(c => ({
                ...c,
                count: countMap(categoryCountsAgg)[c._id?.toString()] || 0
            })),
            skinTypes,
            formulations,
            priceRanges: [
                { label: "Rs. 0 - Rs. 499", min: 0, max: 499 },
                { label: "Rs. 500 - Rs. 999", min: 500, max: 999 },
                { label: "Rs. 1000 - Rs. 1999", min: 1000, max: 1999 },
                { label: "Rs. 2000 - Rs. 3999", min: 2000, max: 3999 },
                { label: "Rs. 4000 & Above", min: 4000, max: null }
            ]
        });
    } catch (err) {
        console.error("❌ getFilterMetadata error:", err);
        res.status(500).json({ message: "Failed to load filters", error: err.message });
    }
};

const toObjectId = (id) => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;

export const normalizeFilters = (query) => ({
    search: query.search || undefined,
    brandIds: query.brandIds ? query.brandIds.split(",") : [],
    categoryIds: query.categoryIds ? query.categoryIds.split(",") : [],
    skinTypes: query.skinTypes ? query.skinTypes.split(",") : [],
    formulations: query.formulations ? query.formulations.split(",") : [],
    finishes: query.finishes ? query.finishes.split(",") : [],
    minPrice: query.minPrice ? Number(query.minPrice) : undefined,
    maxPrice: query.maxPrice ? Number(query.maxPrice) : undefined,
    discountMin: query.discountMin ? Number(query.discountMin) : undefined,
    ratingMin: query.ratingMin ? Number(query.ratingMin) : undefined,
});

export const applyDynamicFilters = (filters = {}) => {
    const f = { isPublished: true };

    // 🔹 Brand filter
    if (filters.brandIds?.length) {
        const brandIds = filters.brandIds.map(toObjectId).filter(Boolean);
        f.brand = { $in: brandIds };
    }

    // 🔹 Category filter
    if (filters.categoryIds?.length) {
        const categoryIds = filters.categoryIds.map(toObjectId).filter(Boolean);
        if (categoryIds.length) f.category = { $in: categoryIds };
    }

    // 🔹 Price Range filter (supports variants)
    if (filters.minPrice || filters.maxPrice) {
        const priceFilter = {};
        if (filters.minPrice) priceFilter.$gte = filters.minPrice;
        if (filters.maxPrice) priceFilter.$lte = filters.maxPrice;

        // If product has variants, check their prices too
        f.$or = [
            { price: priceFilter }, // product.price
            { "variants.price": priceFilter } // variants.price
        ];
    }

    // 🔹 Skin type & formulation filters
    ["skinTypes", "formulations"].forEach((key) => {
        if (filters[key]?.length) {
            const ids = filters[key].map(toObjectId).filter(Boolean);
            f[key] = { $in: ids };
        }
    });

    // 🔹 Finish filter
    if (filters.finishes?.length) {
        f.finish = { $in: filters.finishes.map(v => new RegExp(`^${v}$`, "i")) };
    }

    // 🔹 Discount & Rating
    if (filters.discountMin) f.discountPercent = { $gte: filters.discountMin };
    if (filters.ratingMin) f.avgRating = { $gte: filters.ratingMin };

    // 🔹 Text search
    if (filters.search) f.$text = { $search: filters.search };

    return f;
};

export const normalizeImages = (images = []) => {
    return images.map(img =>
        img.startsWith('http') ? img : `${process.env.BASE_URL}/${img}`
    );
};

export const getAllFilteredProducts = async (req, res) => {
    try {
        const {
            priceMin, priceMax, brand, category, discount,
            preference, ingredients, benefits, concern, skinType,
            makeupFinish, formulation, color, skinTone, gender, age,
            conscious, shade, page = 1, limit = 12
        } = req.query;

        const filter = { isPublished: true };
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
                { "variants.hex": { $in: [color] } }
            ];
        }
        if (shade) {
            filter.$or = [
                ...(filter.$or || []),
                { shadeOptions: { $in: [shade] } },
                { "variants.shadeName": { $in: [shade] } }
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
            .select("name variant price brand category summary description status images commentsCount avgRating variants shadeOptions colorOptions")
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

// export const getProductsByCategory = async (req, res) => {
//     try {
//         const slug = req.params.slug.toLowerCase();
//         let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;
//         page = Number(page) || 1;
//         limit = Number(limit) || 12;

//         // 🔹 Fetch category
//         let category = mongoose.Types.ObjectId.isValid(slug)
//             ? await Category.findById(slug).select("name slug bannerImage thumbnailImage ancestors").lean()
//             : await Category.findOne({ slug }).select("name slug bannerImage thumbnailImage ancestors").lean();
//         if (!category) return res.status(404).json({ message: "Category not found" });

//         // 🔹 Track user
//         if (req.user?.id) {
//             await User.findByIdAndUpdate(req.user.id, { $pull: { recentCategories: category._id } });
//             await User.findByIdAndUpdate(req.user.id, {
//                 $push: { recentCategories: { $each: [category._id], $position: 0, $slice: 20 } }
//             });
//         }

//         // 🔹 Descendant categories
//         const descendantIds = (await getDescendantCategoryIds(category._id))
//             .filter(id => mongoose.Types.ObjectId.isValid(id))
//             .map(id => new mongoose.Types.ObjectId(id));
//         descendantIds.push(category._id);

//         const baseCategoryFilter = {
//             $or: [
//                 { category: { $in: descendantIds } },
//                 { categories: { $in: descendantIds } },
//             ]
//         };

//         const filters = normalizeFilters(queryFilters);
//         const finalFilter = applyDynamicFilters(baseCategoryFilter, filters);
//         finalFilter.isPublished = true;

//         const sortOptions = {
//             recent: { createdAt: -1 },
//             priceLowToHigh: { price: 1 },
//             priceHighToLow: { price: -1 },
//             rating: { avgRating: -1 }
//         };

//         // 🔹 Fetch products
//         const total = await Product.countDocuments(finalFilter);
//         const products = await Product.find(finalFilter)
//             .sort(sortOptions[sort] || { createdAt: -1 })
//             .skip((page - 1) * limit)
//             .limit(limit)
//             .lean();

//         // 🔹 Fetch active promotions for discounted price
//         const now = new Date();
//         const promotions = await Promotion.find({
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now }
//         }).lean();

//         // 🔹 Enrich products with stock/status/options + discounted price
//         const productsWithStock = products.map(p => enrichProductWithStockAndOptions(p, promotions));

//         const cards = await Promise.all(productsWithStock.map(p => formatProductCard(p)));

//         // 🔹 Breadcrumbs
//         let ancestors = [];
//         if (Array.isArray(category.ancestors) && category.ancestors.length) {
//             const ancestorDocs = await Category.find({ _id: { $in: category.ancestors } })
//                 .select("name slug")
//                 .lean();
//             ancestors = category.ancestors
//                 .map(id => ancestorDocs.find(a => String(a._id) === String(id)))
//                 .filter(Boolean);
//         }

//         // 🔹 Recommendations
//         const firstProduct = products[0] || await Product.findOne({ category: category._id }).lean();
//         let [topSelling, moreLikeThis, trending] = await Promise.all([
//             getRecommendations({ mode: "topSelling", categorySlug: category.slug, limit: 6 }),
//             firstProduct ? getRecommendations({ mode: "moreLikeThis", productId: firstProduct._id, limit: 6 }) : Promise.resolve({ products: [] }),
//             getRecommendations({ mode: "trending", limit: 6 })
//         ]);

//         const handleVariantsForRecs = recProducts => (recProducts || []).map(p => enrichProductWithStockAndOptions(p, promotions));

//         topSelling = handleVariantsForRecs(topSelling.products);
//         moreLikeThis = handleVariantsForRecs(moreLikeThis.products);
//         trending = handleVariantsForRecs(trending.products);

//         const usedIds = new Set();
//         const filterUnique = rec => rec.filter(p => {
//             const id = p._id.toString();
//             if (usedIds.has(id)) return false;
//             usedIds.add(id);
//             return true;
//         });

//         let message = null;
//         if (total === 0) {
//             if (queryFilters.search) {
//                 message = `No products found matching “${queryFilters.search}” in this category.`;
//             } else if (filters.minPrice || filters.maxPrice || filters.brandIds?.length) {
//                 message = `No products found with the selected filters in this category.`;
//             } else {
//                 message = `No products available in ${category.name} at the moment.`;
//             }
//         }

//         return res.status(200).json({
//             category,
//             breadcrumb: ancestors,
//             products: cards,
//             pagination: {
//                 page,
//                 limit,
//                 total,
//                 totalPages: Math.ceil(total / limit),
//                 hasMore: page < Math.ceil(total / limit)
//             },
//             message,
//             recommendations: {
//                 topSelling: filterUnique(topSelling),
//                 moreLikeThis: filterUnique(moreLikeThis),
//                 trending: filterUnique(trending)
//             },
//         });

//     } catch (err) {
//         console.error("❌ getProductsByCategory error:", err);
//         return res.status(500).json({ message: "Server error", error: err.message });
//     }
// };
    export const getProductsByCategory = async (req, res) => {
        try {
            const slug = req.params.slug.toLowerCase();
            let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;
            page = Number(page) || 1;
            limit = Number(limit) || 12;

            // 🔹 Fetch category
            let category = mongoose.Types.ObjectId.isValid(slug)
                ? await Category.findById(slug).select("name slug bannerImage thumbnailImage ancestors").lean()
                : await Category.findOne({ slug }).select("name slug bannerImage thumbnailImage ancestors").lean();
            if (!category) return res.status(404).json({ message: "Category not found" });

            // 🔹 Track user
            if (req.user?.id) {
                await User.findByIdAndUpdate(req.user.id, { $pull: { recentCategories: category._id } });
                await User.findByIdAndUpdate(req.user.id, {
                    $push: { recentCategories: { $each: [category._id], $position: 0, $slice: 20 } }
                });
            }

            // 🔹 Descendant categories
            const descendantIds = (await getDescendantCategoryIds(category._id))
                .filter(id => mongoose.Types.ObjectId.isValid(id))
                .map(id => new mongoose.Types.ObjectId(id));
            descendantIds.push(category._id);

            // 🔹 Normalize filters
            const filters = normalizeFilters(queryFilters);

            // ✅ Include descendant category IDs
            filters.categoryIds = descendantIds.map(id => id.toString());

            // 🔹 Apply filters
            const finalFilter = applyDynamicFilters(filters);
            finalFilter.isPublished = true;

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

            // 🔹 Active promotions
            const now = new Date();
            const promotions = await Promotion.find({
                status: "active",
                startDate: { $lte: now },
                endDate: { $gte: now }
            }).lean();

            // 🔹 Enrich products
            const productsWithStock = products.map(p => enrichProductWithStockAndOptions(p, promotions));
            const cards = await Promise.all(productsWithStock.map(p => formatProductCard(p)));

            // 🔹 Breadcrumbs
            let ancestors = [];
            if (Array.isArray(category.ancestors) && category.ancestors.length) {
                const ancestorDocs = await Category.find({ _id: { $in: category.ancestors } })
                    .select("name slug")
                    .lean();
                ancestors = category.ancestors
                    .map(id => ancestorDocs.find(a => String(a._id) === String(id)))
                    .filter(Boolean);
            }

            // 🔹 Friendly messages
            let message = null;
            if (total === 0) {
                if (queryFilters.search) {
                    message = `No products found matching “${queryFilters.search}” in this category.`;
                } else if (filters.minPrice || filters.maxPrice || filters.brandIds?.length || filters.skinTypes?.length) {
                    message = `No products found with the selected filters in this category.`;
                } else {
                    message = `No products available in ${category.name} at the moment.`;
                }
            }

            return res.status(200).json({
                category,
                breadcrumb: ancestors,
                products: cards,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                    hasMore: page < Math.ceil(total / limit)
                },
                message
            });

        } catch (err) {
            console.error("❌ getProductsByCategory error:", err);
            return res.status(500).json({ message: "Server error", error: err.message });
        }
    };

export const getSingleProduct = async (req, res) => {
    try {
        const productId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ message: "Invalid product id" });
        }

        // 1) Load product + increment views
        const product = await Product.findOneAndUpdate(
            { _id: productId, isPublished: true },
            { $inc: { views: 1 } },
            { new: true, lean: true }
        );
        if (!product) return res.status(404).json({ message: "Product not found" });

        // 2) Save to user's recent history
        if (req.user?.id) {
            const categoryValue = mongoose.Types.ObjectId.isValid(product.category)
                ? product.category
                : product.category?.slug || String(product.category || "");

            await User.bulkWrite([
                {
                    updateOne: {
                        filter: { _id: req.user.id },
                        update: { $pull: { recentProducts: product._id, recentCategories: categoryValue } }
                    }
                },
                {
                    updateOne: {
                        filter: { _id: req.user.id },
                        update: {
                            $push: {
                                recentProducts: { $each: [product._id], $position: 0, $slice: 20 },
                                recentCategories: { $each: [categoryValue], $position: 0, $slice: 20 }
                            }
                        }
                    }
                }
            ]);
        }

        // 3) Category & Brand info
        const categoryObj = mongoose.Types.ObjectId.isValid(product.category)
            ? await Category.findById(product.category).select("name slug parent").lean()
            : null;

        const brandObj = mongoose.Types.ObjectId.isValid(product.brand)
            ? await Brand.findById(product.brand).select("name").lean()
            : null;

        // 4) Ratings
        const [{ avg = 0, count = 0 } = {}] = await Review.aggregate([
            { $match: { productId: product._id, status: "Active" } },
            { $group: { _id: "$productId", avg: { $avg: "$rating" }, count: { $sum: 1 } } }
        ]);
        const avgRating = Math.round((avg || 0) * 10) / 10;

        // 5) Active promotions
        const now = new Date();
        const promotions = await Promotion.find({
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).lean();

        // 6) Enrich product with variants/stock/options/discounts
        const enrichedProduct = enrichProductWithStockAndOptions(product, promotions);

        // 7) Enrich variants with price and discount as string
        enrichedProduct.variants = (enrichedProduct.variants || []).map((v) => {
            const original = Number(v.originalPrice ?? enrichedProduct.price ?? 0);
            const discounted = Number(v.discountedPrice ?? v.displayPrice ?? original);
            const discountPercent = original > 0
                ? Math.round(((original - discounted) / original) * 100)
                : 0;

            return {
                ...v,
                displayPrice: discounted,
                originalPrice: original,
                discountPercent: discountPercent > 0 ? `${discountPercent}%` : "0%",
            };
        });

        // 8) Recommendations
        const [moreLikeThis, boughtTogether, alsoViewed] = await Promise.all([
            getRecommendations({ mode: "moreLikeThis", productId, userId: req.user?.id }),
            getRecommendations({ mode: "boughtTogether", productId, userId: req.user?.id }),
            getRecommendations({ mode: "alsoViewed", productId, userId: req.user?.id })
        ]);

        res.status(200).json({
            _id: enrichedProduct._id,
            name: enrichedProduct.name,
            brand: brandObj ? brandObj.name : enrichedProduct.brand,
            variant: enrichedProduct.variant,
            description: enrichedProduct.description || "",
            summary: enrichedProduct.summary || "",
            features: enrichedProduct.features || [],
            howToUse: enrichedProduct.howToUse || "",
            ingredients: enrichedProduct.ingredients || [],
            mrp: enrichedProduct.originalPrice,
            price: enrichedProduct.displayPrice,
            discountPercent: Math.max(0, enrichedProduct.discountPercent || 0),
            images: normalizeImages(enrichedProduct.images || []),
            category: categoryObj,
            shadeOptions: enrichedProduct.shadeOptions || [],
            colorOptions: enrichedProduct.colorOptions || [],
            variants: enrichedProduct.variants || [],
            status: enrichedProduct.status || null,
            message: enrichedProduct.message || null,
            avgRating,
            totalRatings: count || 0,
            recommendations: { moreLikeThis, boughtTogether, alsoViewed }
        });

    } catch (err) {
        console.error("❌ getSingleProduct error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

export const getTopSellingProducts = async (req, res) => {
    try {
        const topProducts = await Product.find({ isPublished: true })  // 👈 filter
            .sort({ sales: -1 })
            .limit(10)
            .select("name images variants shadeOptions colorOptions")
            .lean();

        res.status(200).json({
            success: true,
            products: topProducts.map(p => {
                const shadeOptions = (p.variants?.length > 0)
                    ? p.variants.map(v => v.shadeName).filter(Boolean)
                    : (p.shadeOptions || []);
                const colorOptions = (p.variants?.length > 0)
                    ? p.variants.map(v => v.hex).filter(Boolean)
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

export const getProductWithRelated = async (req, res) => {
    try {
        const product = await Product.findOne({ _id: req.params.id, isPublished: true })
            .populate("category")
            .lean();

        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        // Normalize shades + colors from variants
        let shadeOptions = [];
        let colorOptions = [];
        if (Array.isArray(product.variants) && product.variants.length > 0) {
            shadeOptions = product.variants.map(v => v.shadeName).filter(Boolean);
            colorOptions = product.variants.map(v => v.hex).filter(Boolean);
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
        const BASE_SLUGS = ['lips', 'eyes', 'face', 'skin'];

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

// export const getProductsBySkinType = async (req, res) => {
//     try {
//         const slug = req.params.slug.toLowerCase();
//         let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;
//         page = Number(page) || 1;
//         limit = Number(limit) || 12;

//         // 🔹 Fetch skin type
//         const skinType = await SkinType.findOne({ slug, isDeleted: false }).lean();
//         if (!skinType) return res.status(404).json({ message: "Skin type not found" });

//         // 🔹 Find related categories (Makeup + Skincare)
//         const categories = await Category.find({ slug: { $in: ["makeup", "skincare"] } })
//             .select("_id slug")
//             .lean();
//         const categoryIds = categories.map(c => c._id);

//         // 🔹 Base filter for skin type
//         const baseFilter = {
//             skinTypes: skinType._id,
//             isDeleted: { $ne: true },
//             category: { $in: categoryIds },
//             isPublished: true   // 👈 add here
//         };

//         // 🔹 Apply dynamic filters from query
//         const filters = normalizeFilters(queryFilters);
//         const finalFilter = applyDynamicFilters(baseFilter, filters);

//         const sortOptions = {
//             recent: { createdAt: -1 },
//             priceLow: { price: 1 },
//             priceHigh: { price: -1 },
//             popular: { totalSales: -1 },
//         };

//         // 🔹 Fetch main products for this skin type
//         const products = await Product.find(finalFilter)
//             .sort(sortOptions[sort] || { createdAt: -1 })
//             .skip((page - 1) * limit)
//             .limit(limit)
//             .lean();

//         const total = await Product.countDocuments(finalFilter);
//         const mainProductIds = products.map(p => p._id);

//         // 🔹 Fetch top-selling recommendations (Makeup + Skincare, excluding main products)
//         const topSelling = await Product.find({
//             category: { $in: categoryIds },
//             isDeleted: { $ne: true },
//             isPublished: true,   // 👈 add this
//             _id: { $nin: mainProductIds }
//         })
//             .sort({ totalSales: -1 })
//             .limit(5)
//             .lean();

//         const excludeIds = [...mainProductIds, ...topSelling.map(p => p._id)];

//         // 🔹 Random recommendations
//         const randomProducts = await Product.aggregate([
//             {
//                 $match: {
//                     category: { $in: categoryIds },
//                     isDeleted: { $ne: true },
//                     isPublished: true,   // 👈 add this
//                     _id: { $nin: excludeIds }
//                 }
//             },
//             { $sample: { size: 5 } }
//         ]);

//         // 🔹 Format all products consistently
//         const formattedProducts = await Promise.all(products.map(p => formatProductCard(p)));
//         const formattedTopSelling = await Promise.all(topSelling.map(p => formatProductCard(p)));
//         const formattedRandom = await Promise.all(randomProducts.map(p => formatProductCard(p)));

//         // 🔹 Friendly message like in promotions
//         let message = null;
//         if (total === 0) {
//             if (queryFilters.search) {
//                 message = `No products found matching “${queryFilters.search}” in this category.`;
//             } else if (filters.minPrice || filters.maxPrice || filters.brandIds?.length) {
//                 message = `No products found with the selected filters in this category.`;
//             } else {
//                 message = `No products available in ${categories.name} at the moment.`;
//             }
//         }

//         res.json({
//             success: true,
//             skinType: skinType.name,
//             products: formattedProducts,
//             pagination: {
//                 page,
//                 limit,
//                 total,
//                 totalPages: Math.ceil(total / limit),
//                 hasMore: page < Math.ceil(total / limit)
//             },
//             message,
//             recommendations: {
//                 topSelling: formattedTopSelling,
//                 random: formattedRandom
//             }
//         });

//     } catch (err) {
//         console.error("❌ getProductsBySkinType error:", err);
//         res.status(500).json({ success: false, message: err.message });
//     }
// };
export const getProductsBySkinType = async (req, res) => {
    try {
        const slug = req.params.slug.toLowerCase();
        let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;
        page = Number(page) || 1;
        limit = Number(limit) || 12;

        // 🔹 Fetch skin type
        const skinType = await SkinType.findOne({ slug, isDeleted: false }).lean();
        if (!skinType) return res.status(404).json({ message: "Skin type not found" });

        // 🔹 Related categories (Makeup + Skincare)
        const categories = await Category.find({ slug: { $in: ["makeup", "skincare"] } })
            .select("_id slug ancestors")
            .lean();
        const categoryIds = categories.map(c => c._id);

        // 🔹 Descendant categories
        const descendantIds = [];
        for (const catId of categoryIds) {
            const descendants = await getDescendantCategoryIds(catId);
            descendantIds.push(...descendants.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id)));
        }
        descendantIds.push(...categoryIds);

        // 🔹 Normalize filters
        const filters = normalizeFilters(queryFilters);

        // ✅ Include skinType & descendant categories
        filters.skinTypes = [skinType._id.toString()];
        filters.categoryIds = descendantIds.map(id => id.toString());

        // 🔹 Apply dynamic filters
        const finalFilter = applyDynamicFilters(filters);
        finalFilter.isPublished = true;

        // 🔹 Sort options
        const sortOptions = {
            recent: { createdAt: -1 },
            priceLowToHigh: { price: 1 },
            priceHighToLow: { price: -1 },
            rating: { avgRating: -1 }
        };

        // 🔹 Fetch main products
        const total = await Product.countDocuments(finalFilter);
        const products = await Product.find(finalFilter)
            .sort(sortOptions[sort] || { createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        // 🔹 Fetch active promotions
        const now = new Date();
        const promotions = await Promotion.find({
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).lean();

        // 🔹 Enrich products (variants + stock + price + discount)
        const productsWithStock = products.map(p => enrichProductWithStockAndOptions(p, promotions));
        const formattedProducts = await Promise.all(productsWithStock.map(p => formatProductCard(p)));

        // 🔹 Breadcrumbs
        let ancestors = [];
        if (categories.length) {
            const ancestorDocs = await Category.find({ _id: { $in: categories.flatMap(c => c.ancestors || []) } })
                .select("name slug")
                .lean();
            ancestors = categories.flatMap(c => (c.ancestors || []).map(id => ancestorDocs.find(a => String(a._id) === String(id)))).filter(Boolean);
        }



        // 🔹 Friendly message
        let message = null;
        if (total === 0) {
            if (queryFilters.search) {
                message = `No products found matching “${queryFilters.search}” for this skin type.`;
            } else if (filters.minPrice || filters.maxPrice || filters.brandIds?.length || filters.skinTypes?.length) {
                message = `No products found with the selected filters for this skin type.`;
            } else {
                message = `No products available for ${skinType.name} at the moment.`;
            }
        }

        res.json({
            success: true,
            skinType: skinType.name,
            products: formattedProducts,
            breadcrumb: ancestors,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit)
            },
            message
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
        const product = await Product.findOne({ _id: id, isPublished: true }).lean();
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

