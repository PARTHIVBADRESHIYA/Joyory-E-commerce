import Product from '../../models/Product.js';
import ProductViewLog from "../../models/ProductViewLog.js";
import Promotion from '../../models/Promotion.js';
import User from '../../models/User.js';
import Review from '../../models/Review.js';
import Order from '../../models/Order.js';
import SkinType from '../../models/SkinType.js';
import Category from '../../models/Category.js';
import { getDescendantCategoryIds, getCategoryFallbackChain } from '../../middlewares/utils/categoryUtils.js';
import { getRecommendations } from '../../middlewares/utils/recommendationService.js';
import { formatProductCard } from '../../middlewares/utils/recommendationService.js';
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

// ✅ Normalize query filters
export const normalizeFilters = (query) => ({
    brandIds: query.brandIds ? query.brandIds.split(",") : [],
    skinTypes: query.skinTypes ? query.skinTypes.split(",") : [],
    skinConcerns: query.skinConcerns ? query.skinConcerns.split(",") : [],
    shades: query.shades ? query.shades.split(",") : [],
    formulations: query.formulations ? query.formulations.split(",") : [],
    finishes: query.finishes ? query.finishes.split(",") : [],
    ingredients: query.ingredients ? query.ingredients.split(",") : [],
    freeFrom: query.freeFrom ? query.freeFrom.split(",") : [],
    tags: query.tags ? query.tags.split(",") : [],
    colorFamilies: query.colorFamilies ? query.colorFamilies.split(",") : [],
    gender: query.gender,
    ageGroup: query.ageGroup,
    occasion: query.occasion,
    minPrice: query.minPrice ? Number(query.minPrice) : undefined,
    maxPrice: query.maxPrice ? Number(query.maxPrice) : undefined,
    discountMin: query.discountMin ? Number(query.discountMin) : undefined,
    ratingMin: query.ratingMin ? Number(query.ratingMin) : undefined,
});

// ✅ Apply only filtering logic from fetchProducts
export const applyDynamicFilters = (baseFilter, filters) => {
    const f = { ...baseFilter };
    if (filters.brandIds?.length) f.brand = { $in: filters.brandIds };
    if (filters.minPrice || filters.maxPrice) {
        f.price = {};
        if (filters.minPrice) f.price.$gte = filters.minPrice;
        if (filters.maxPrice) f.price.$lte = filters.maxPrice;
    }
    if (filters.discountMin) f.discountPercent = { $gte: filters.discountMin };
    if (filters.ratingMin) f.rating = { $gte: filters.ratingMin };
    if (filters.skinTypes?.length) f.skinType = { $in: filters.skinTypes };
    if (filters.skinConcerns?.length) f.skinConcern = { $in: filters.skinConcerns };
    if (filters.shades?.length) f.shade = { $in: filters.shades };
    if (filters.formulations?.length) f.formulation = { $in: filters.formulations };
    if (filters.finishes?.length) f.finish = { $in: filters.finishes };
    if (filters.ingredients?.length) f.ingredients = { $in: filters.ingredients };
    if (filters.freeFrom?.length) f.freeFrom = { $in: filters.freeFrom };
    if (filters.gender) f.gender = filters.gender;
    if (filters.ageGroup) f.ageGroup = filters.ageGroup;
    if (filters.occasion) f.occasion = filters.occasion;
    if (filters.tags?.length) f.tags = { $in: filters.tags };
    if (filters.colorFamilies?.length) f.colorFamily = { $in: filters.colorFamilies };
    return f;
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

        // 3) Category info
        let categoryObj = null;
        if (mongoose.Types.ObjectId.isValid(product.category)) {
            categoryObj = await Category.findById(product.category)
                .select("name slug parent")
                .lean();
        }

        // 4) Ratings
        const [{ avg = 0, count = 0 } = {}] = await Review.aggregate([
            { $match: { productId: product._id, status: "Active" } },
            { $group: { _id: "$productId", avg: { $avg: "$rating" }, count: { $sum: 1 } } }
        ]);
        const avgRating = Math.round((avg || 0) * 10) / 10;

        // 5) Promotions
        const now = new Date();
        const promotions = await Promotion.find({
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).lean();

        const originalPrice = Number(product.price ?? product.mrp ?? 0) || 0;
        const mrp = Number(product.mrp ?? product.price ?? 0) || 0;

        // 6) Best promo logic
        let bestPromo = null;
        let bestPrice = originalPrice;
        let bestDiscountAmount = 0;
        let bestDiscountPercent = 0;

        for (const promo of promotions) {
            if (!productMatchesPromo(product, promo)) continue;
            const type = promo.promotionType;

            if (type === "discount") {
                const unit = promo.discountUnit;
                const val = Number(promo.discountValue || 0);

                if (unit === "percent" && val > 0) {
                    const price = Math.max(0, mrp - (mrp * val) / 100);
                    const da = mrp - price;
                    const dp = mrp > 0 ? Math.floor((da / mrp) * 100) : 0;

                    const isBetter =
                        da > bestDiscountAmount || (da === bestDiscountAmount && dp > bestDiscountPercent);
                    if (isBetter) {
                        bestPromo = promo;
                        bestPrice = price;
                        bestDiscountAmount = da;
                        bestDiscountPercent = dp;
                    }
                } else if (unit === "amount" && val > 0) {
                    const price = Math.max(0, mrp - val);
                    const da = mrp - price;
                    const dp = mrp > 0 ? Math.floor((da / mrp) * 100) : 0;

                    const isBetter =
                        da > bestDiscountAmount || (da === bestDiscountAmount && dp > bestDiscountPercent);
                    if (isBetter) {
                        bestPromo = promo;
                        bestPrice = price;
                        bestDiscountAmount = da;
                        bestDiscountPercent = dp;
                    }
                }
            }
        }

        // 7) Badge/message
        let badge = null;
        let promoMessage = null;

        if (bestPromo) {
            badge =
                bestPromo.discountUnit === "percent"
                    ? `${bestPromo.discountValue}% Off`
                    : `₹${asMoney(bestPromo.discountValue)} Off`;
            promoMessage = `Save ${badge} on this product`;
        } else {
            const awareness =
                promotions
                    .filter(p => productMatchesPromo(product, p))
                    .sort((a, b) => {
                        const order = { tieredDiscount: 1, bogo: 2, buy1get1: 2, bundle: 3, gift: 4, discount: 5 };
                        return (order[a.promotionType] || 99) - (order[b.promotionType] || 99);
                    })[0] || null;

            if (awareness) {
                const t = awareness.promotionType;
                if (t === "tieredDiscount") {
                    const tiers = awareness.promotionConfig?.tiers || [];
                    const top = tiers.length
                        ? Math.max(...tiers.map(ti => Number(ti.discountPercent || 0)))
                        : 0;
                    badge = `Buy More Save More${top ? ` (Up to ${top}%)` : ""}`;
                    promoMessage = `Add more to save up to ${top}%`;
                } else if (t === "bogo" || t === "buy1get1") {
                    const bq = awareness.promotionConfig?.buyQty ?? 1;
                    const gq = awareness.promotionConfig?.getQty ?? 1;
                    badge = `BOGO ${bq}+${gq}`;
                    promoMessage = `Buy ${bq}, Get ${gq} Free`;
                } else if (t === "bundle") {
                    badge = "Bundle Deal";
                    promoMessage = "Special price when bought together";
                } else if (t === "gift") {
                    badge = "Free Gift";
                    promoMessage = "Get a free gift on qualifying order";
                }
            }
        }

        // 8) Recommendations
        const [moreLikeThis, boughtTogether, alsoViewed] = await Promise.all([
            getRecommendations({ mode: "moreLikeThis", productId, userId: req.user?.id }),
            getRecommendations({ mode: "boughtTogether", productId, userId: req.user?.id }),
            getRecommendations({ mode: "alsoViewed", productId, userId: req.user?.id })
        ]);

        // 9) Response
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
            mrp: Math.round(mrp),
            price: Math.round(bestPrice),
            discountPercent: Math.max(0, Math.round(bestDiscountPercent)),
            discountAmount: Math.max(0, Math.round(bestDiscountAmount)),
            badge,
            promoMessage,
            images: normalizeImages(product.images || []),
            category: categoryObj,
            shadeOptions: buildOptions(product).shadeOptions,
            colorOptions: buildOptions(product).colorOptions,
            variants: product.variants || [],
            avgRating,
            totalRatings: count || 0,
            // ✅ Add this
            inStock: product.inStock ?? true,
            // ✅ Added recommendation sections
            recommendations: {
                moreLikeThis,
                boughtTogether,
                alsoViewed
            }
        });
    } catch (err) {
        console.error("❌ getSingleProduct error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

export const getProductsByCategory = async (req, res) => {
    try {
        const slug = req.params.slug.toLowerCase();
        let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;
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
        if (req.user?.id) {
            await User.findByIdAndUpdate(req.user.id, { $pull: { recentCategories: category._id } });
            await User.findByIdAndUpdate(req.user.id, {
                $push: { recentCategories: { $each: [category._id], $position: 0, $slice: 20 } }
            });
        }

        // 🔹 Fetch descendant categories
        const descendantIds = (await getDescendantCategoryIds(category._id))
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));
        descendantIds.push(category._id);

        // 🔹 Base category filter ($or)
        const baseCategoryFilter = {
            $or: [
                { category: { $in: descendantIds } },
                { categories: { $in: descendantIds } },
            ]
        };

        // 🔹 Apply dynamic filters from query
        const filters = normalizeFilters(queryFilters);
        const finalFilter = applyDynamicFilters(baseCategoryFilter, filters);
        finalFilter.isPublished = true;   // 👈 add here


        // 🔹 Sorting options
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

        const cards = await Promise.all(products.map(p => formatProductCard(p)));

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

        // 🔹 Recommendations
        const firstProduct = products[0] || await Product.findOne({ category: category._id }).lean();
        let [topSelling, moreLikeThis, trending] = await Promise.all([
            getRecommendations({ mode: "topSelling", categorySlug: category.slug, limit: 6 }),
            firstProduct ? getRecommendations({ mode: "moreLikeThis", productId: firstProduct._id, limit: 6 }) : Promise.resolve({ products: [] }),
            getRecommendations({ mode: "trending", limit: 6 })
        ]);

        // 🔹 Remove duplicate recommendations
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

        // 🔹 Friendly message like in promotions
        let message = null;
        if (total === 0) {
            if (queryFilters.search) {
                message = `No products found matching “${queryFilters.search}” in this category.`;
            } else if (filters.minPrice || filters.maxPrice || filters.brandIds?.length) {
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
            message,
            recommendations: {
                topSelling: filterUnique(topSelling),
                moreLikeThis: filterUnique(moreLikeThis),
                trending: filterUnique(trending)
            },
        });

    } catch (err) {
        console.error("❌ getProductsByCategory error:", err);
        return res.status(500).json({ message: "Server error", error: err.message });
    }
};


// 🔥 Top Selling Products
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

export const getProductsBySkinType = async (req, res) => {
    try {
        const slug = req.params.slug.toLowerCase();
        let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;
        page = Number(page) || 1;
        limit = Number(limit) || 12;

        // 🔹 Fetch skin type
        const skinType = await SkinType.findOne({ slug, isDeleted: false }).lean();
        if (!skinType) return res.status(404).json({ message: "Skin type not found" });

        // 🔹 Find related categories (Makeup + Skincare)
        const categories = await Category.find({ slug: { $in: ["makeup", "skincare"] } })
            .select("_id slug")
            .lean();
        const categoryIds = categories.map(c => c._id);

        // 🔹 Base filter for skin type
        const baseFilter = {
            skinTypes: skinType._id,
            isDeleted: { $ne: true },
            category: { $in: categoryIds },
            isPublished: true   // 👈 add here
        };

        // 🔹 Apply dynamic filters from query
        const filters = normalizeFilters(queryFilters);
        const finalFilter = applyDynamicFilters(baseFilter, filters);

        const sortOptions = {
            recent: { createdAt: -1 },
            priceLow: { price: 1 },
            priceHigh: { price: -1 },
            popular: { totalSales: -1 },
        };

        // 🔹 Fetch main products for this skin type
        const products = await Product.find(finalFilter)
            .sort(sortOptions[sort] || { createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const total = await Product.countDocuments(finalFilter);
        const mainProductIds = products.map(p => p._id);

        // 🔹 Fetch top-selling recommendations (Makeup + Skincare, excluding main products)
        const topSelling = await Product.find({
            category: { $in: categoryIds },
            isDeleted: { $ne: true },
            isPublished: true,   // 👈 add this
            _id: { $nin: mainProductIds }
        })
            .sort({ totalSales: -1 })
            .limit(5)
            .lean();

        const excludeIds = [...mainProductIds, ...topSelling.map(p => p._id)];

        // 🔹 Random recommendations
        const randomProducts = await Product.aggregate([
            {
                $match: {
                    category: { $in: categoryIds },
                    isDeleted: { $ne: true },
                    isPublished: true,   // 👈 add this
                    _id: { $nin: excludeIds }
                }
            },
            { $sample: { size: 5 } }
        ]);

        // 🔹 Format all products consistently
        const formattedProducts = await Promise.all(products.map(p => formatProductCard(p)));
        const formattedTopSelling = await Promise.all(topSelling.map(p => formatProductCard(p)));
        const formattedRandom = await Promise.all(randomProducts.map(p => formatProductCard(p)));

        // 🔹 Friendly message like in promotions
        let message = null;
        if (total === 0) {
            if (queryFilters.search) {
                message = `No products found matching “${queryFilters.search}” in this category.`;
            } else if (filters.minPrice || filters.maxPrice || filters.brandIds?.length) {
                message = `No products found with the selected filters in this category.`;
            } else {
                message = `No products available in ${category.name} at the moment.`;
            }
        }

        res.json({
            success: true,
            skinType: skinType.name,
            products: formattedProducts,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit)
            },
            message,
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
