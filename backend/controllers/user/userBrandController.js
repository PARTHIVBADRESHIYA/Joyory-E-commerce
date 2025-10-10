// controllers/user/userBrandController.js
import mongoose from "mongoose";
import Product from "../../models/Product.js";
import Category from "../../models/Category.js";
import Brand from "../../models/Brand.js";
import User from "../../models/User.js";
import Promotion from "../../models/Promotion.js";
import SkinType from "../../models/SkinType.js";

// 🔹 helpers (same as category controller)
import { formatProductCard, getPseudoVariant } from '../../middlewares/utils/recommendationService.js';
import { enrichProductWithStockAndOptions } from "../../middlewares/services/productHelpers.js";
import { normalizeFilters, applyDynamicFilters ,normalizeImages} from "../../controllers/user/userProductController.js";
import { calculateVariantPrices } from "../../middlewares/services/promotionHelper.js";

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

// export const getBrandCategoryProducts = async (req, res) => {
//     try {
//         const { brandSlug, categorySlug } = req.params;
//         let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;
//         page = Number(page);
//         limit = Number(limit);

//         const brand = await Brand.findOne({ slug: brandSlug, isActive: true }).lean();
//         if (!brand) return res.status(404).json({ message: "Brand not found" });

//         const category = await Category.findOne({ slug: categorySlug, isActive: true }).lean();
//         if (!category) return res.status(404).json({ message: "Category not found" });

//         if (req.user?.id) {
//             await User.findByIdAndUpdate(req.user.id, { $pull: { recentBrands: brand._id } });
//             await User.findByIdAndUpdate(req.user.id, {
//                 $push: { recentBrands: { $each: [brand._id], $position: 0, $slice: 20 } }
//             });
//         }

//         const filters = normalizeFilters(queryFilters);

//         // 🔹 Convert skin type names to ObjectIds & track invalid skin types
//         let invalidSkinTypes = [];
//         if (filters.skinTypes?.length) {
//             const skinDocs = await SkinType.find({
//                 name: { $in: filters.skinTypes.map(s => new RegExp(`^${s}$`, "i")) }
//             }).select("_id name").lean();

//             const matchedSkinNames = skinDocs.map(s => s.name.toLowerCase());
//             invalidSkinTypes = filters.skinTypes.filter(s => !matchedSkinNames.includes(s.toLowerCase()));

//             filters.skinTypes = skinDocs.map(s => s._id.toString());
//         }

//         filters.brandIds = [brand._id.toString()];
//         filters.categoryIds = [category._id.toString()];
//         const finalFilter = applyDynamicFilters(filters);

//         const sortOptions = {
//             recent: { createdAt: -1 },
//             priceLowToHigh: { price: 1 },
//             priceHighToLow: { price: -1 },
//             rating: { avgRating: -1 }
//         };

//         const total = await Product.countDocuments(finalFilter);
//         const products = await Product.find(finalFilter)
//             .sort(sortOptions[sort] || { createdAt: -1 })
//             .skip((page - 1) * limit)
//             .limit(limit)
//             .lean();

//         const now = new Date();
//         const promotions = await Promotion.find({
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now }
//         }).lean();

//         const productsWithStock = products.map(p => enrichProductWithStockAndOptions(p, promotions));
//         const cards = await Promise.all(productsWithStock.map(p => formatProductCard(p)));

//         // 🔹 Generate user-friendly message
//         let message = "";
//         if (invalidSkinTypes.length) {
//             message = `No products found for the selected skin type(s): ${invalidSkinTypes.join(", ")}`;
//         } else if (products.length === 0) {
//             if (queryFilters.search) {
//                 message = `No products found matching “${queryFilters.search}” in ${brand.name} - ${category.name}.`;
//             } else if (filters.minPrice || filters.maxPrice) {
//                 message = `No products found with the selected filters.`;
//             } else {
//                 message = `No products available in ${brand.name} - ${category.name} at the moment.`;
//             }
//         } else if (queryFilters.search) {
//             message = `Showing search results for “${queryFilters.search}”.`;
//         } else {
//             message = `Showing products in ${brand.name} - ${category.name}.`;
//         }

//         res.status(200).json({
//             brand: { _id: brand._id, name: brand.name, logo: brand.logo },
//             category: { _id: category._id, name: category.name, slug: category.slug },
//             message,
//             products: cards,
//             pagination: {
//                 page,
//                 limit,
//                 total,
//                 totalPages: Math.ceil(total / limit),
//                 hasMore: page < Math.ceil(total / limit)
//             },
//         });

//     } catch (err) {
//         console.error("🔥 Error in getBrandCategoryProducts:", err);
//         res.status(500).json({ message: "Failed to fetch category products", error: err.message });
//     }
// };

// // ==================== GET BRAND LANDING ====================
// export const getBrandLanding = async (req, res) => {
//     try {
//         const { brandSlug } = req.params;
//         let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;
//         page = Number(page);
//         limit = Number(limit);

//         const brand = await Brand.findOne({ slug: brandSlug, isActive: true })
//             .select("banner name logo slug")
//             .lean();
//         if (!brand) return res.status(404).json({ message: "Brand not found" });

//         const filters = normalizeFilters(queryFilters);

//         // 🔹 Convert skin type names to ObjectIds
//         let invalidSkinTypes = [];
//         if (filters.skinTypes?.length) {
//             const skinDocs = await SkinType.find({
//                 name: { $in: filters.skinTypes.map(s => new RegExp(`^${s}$`, "i")) }
//             }).select("_id name").lean();

//             const matchedSkinTypeNames = skinDocs.map(s => s.name.toLowerCase());
//             invalidSkinTypes = filters.skinTypes.filter(s => !matchedSkinTypeNames.includes(s.toLowerCase()));

//             filters.skinTypes = skinDocs.map(s => s._id.toString());
//         }

//         filters.brandIds = [brand._id.toString()];
//         const finalFilter = applyDynamicFilters(filters);

//         const sortOptions = {
//             recent: { createdAt: -1 },
//             priceLowToHigh: { price: 1 },
//             priceHighToLow: { price: -1 },
//             rating: { avgRating: -1 }
//         };

//         const total = await Product.countDocuments(finalFilter);
//         const products = await Product.find(finalFilter)
//             .sort(sortOptions[sort] || { createdAt: -1 })
//             .skip((page - 1) * limit)
//             .limit(limit)
//             .lean();

//         const now = new Date();
//         const promotions = await Promotion.find({
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now }
//         }).lean();

//         const productsWithStock = products.map(p => enrichProductWithStockAndOptions(p, promotions));
//         const cards = await Promise.all(productsWithStock.map(p => formatProductCard(p)));

//         const uniqueCategoryIds = await Product.distinct("category", { brand: brand._id, isPublished: true });
//         const categories = await Category.find({ _id: { $in: uniqueCategoryIds }, isActive: true })
//             .select("name slug")
//             .lean();

//         // 🔹 Generate user-friendly message
//         let message = "";
//         if (invalidSkinTypes.length) {
//             message = `No products found for the selected skin type(s): ${invalidSkinTypes.join(", ")}`;
//         } else if (products.length === 0) {
//             if (queryFilters.search) {
//                 message = `No products found matching “${queryFilters.search}” for this brand.`;
//             } else if (filters.minPrice || filters.maxPrice) {
//                 message = `No products found with the selected price range.`;
//             } else {
//                 message = `No products available for ${brand.name} at the moment.`;
//             }
//         } else if (queryFilters.search) {
//             message = `Showing search results for “${queryFilters.search}”.`;
//         } else {
//             message = `Showing products for ${brand.name}.`;
//         }

//         res.status(200).json({
//             brandBanner: brand.banner || null,
//             brand: { _id: brand._id, name: brand.name, logo: brand.logo },
//             message,
//             products: cards,
//             categories,
//             pagination: {
//                 page,
//                 limit,
//                 total,
//                 totalPages: Math.ceil(total / limit),
//                 hasMore: page < Math.ceil(total / limit)
//             },
//         });

//     } catch (err) {
//         console.error("🔥 Error in getBrandLanding:", err);
//         res.status(500).json({ message: "Failed to fetch brand details", error: err.message });
//     }
// };



// // 🔹 BRAND CATEGORY PRODUCTS
// export const getBrandCategoryProducts = async (req, res) => {
//     try {
//         const { brandSlug, categorySlug } = req.params;
//         let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;
//         page = Number(page) || 1;
//         limit = Number(limit) || 12;

//         const brand = await Brand.findOne({ slug: brandSlug, isActive: true }).lean();
//         if (!brand) return res.status(404).json({ message: "Brand not found" });

//         const category = await Category.findOne({ slug: categorySlug, isActive: true }).lean();
//         if (!category) return res.status(404).json({ message: "Category not found" });

//         // Track recent brands
//         if (req.user?.id) {
//             await User.findByIdAndUpdate(req.user.id, { $pull: { recentBrands: brand._id } });
//             await User.findByIdAndUpdate(req.user.id, {
//                 $push: { recentBrands: { $each: [brand._id], $position: 0, $slice: 20 } }
//             });
//         }

//         const filters = normalizeFilters(queryFilters);

//         // Convert skin types to ObjectId
//         let invalidSkinTypes = [];
//         if (filters.skinTypes?.length) {
//             const skinDocs = await SkinType.find({
//                 name: { $in: filters.skinTypes.map(s => new RegExp(`^${s}$`, "i")) }
//             }).select("_id name").lean();

//             const matchedNames = skinDocs.map(s => s.name.toLowerCase());
//             invalidSkinTypes = filters.skinTypes.filter(s => !matchedNames.includes(s.toLowerCase()));

//             filters.skinTypes = skinDocs.map(s => s._id.toString());
//         }

//         filters.brandIds = [brand._id.toString()];
//         filters.categoryIds = [category._id.toString()];

//         const finalFilter = await applyDynamicFilters(filters);

//         const sortOptions = {
//             recent: { createdAt: -1 },
//             priceLowToHigh: { price: 1 },
//             priceHighToLow: { price: -1 },
//             rating: { avgRating: -1 }
//         };

//         const total = await Product.countDocuments(finalFilter);
//         const products = await Product.find(finalFilter)
//             .sort(sortOptions[sort] || { createdAt: -1 })
//             .skip((page - 1) * limit)
//             .limit(limit)
//             .lean();

//         const now = new Date();
//         const promotions = await Promotion.find({
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now }
//         }).lean();

//         // Enrich products & calculate variants
//         const enrichedProducts = products.map(p => {
//             const enriched = enrichProductWithStockAndOptions(p, promotions);
//             enriched.variants = enriched.variants && enriched.variants.length
//                 ? calculateVariantPrices(enriched.variants, enriched, promotions)
//                 : calculateVariantPrices([getPseudoVariant(enriched)], enriched, promotions);
//             return enriched;
//         });

//         const cards = await Promise.all(enrichedProducts.map(p => formatProductCard(p, promotions)));

//         // Friendly message
//         let message = "";
//         if (invalidSkinTypes.length) {
//             message = `No products found for the selected skin type(s): ${invalidSkinTypes.join(", ")}`;
//         } else if (products.length === 0) {
//             if (queryFilters.search) message = `No products found matching “${queryFilters.search}” in ${brand.name} - ${category.name}.`;
//             else if (filters.minPrice || filters.maxPrice) message = `No products found with the selected filters.`;
//             else message = `No products available in ${brand.name} - ${category.name} at the moment.`;
//         } else if (queryFilters.search) message = `Showing search results for “${queryFilters.search}”.`;
//         else message = `Showing products in ${brand.name} - ${category.name}.`;

//         return res.status(200).json({
//             brand: { _id: brand._id, name: brand.name, logo: brand.logo },
//             category: { _id: category._id, name: category.name, slug: category.slug },
//             message,
//             products: cards,
//             pagination: {
//                 page,
//                 limit,
//                 total,
//                 totalPages: Math.ceil(total / limit),
//                 hasMore: page < Math.ceil(total / limit)
//             },
//         });

//     } catch (err) {
//         console.error("🔥 Error in getBrandCategoryProducts:", err);
//         res.status(500).json({ message: "Failed to fetch category products", error: err.message });
//     }
// };

// // 🔹 BRAND LANDING
// export const getBrandLanding = async (req, res) => {
//     try {
//         const { brandSlug } = req.params;
//         let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;
//         page = Number(page) || 1;
//         limit = Number(limit) || 12;

//         const brand = await Brand.findOne({ slug: brandSlug, isActive: true })
//             .select("banner name logo slug")
//             .lean();
//         if (!brand) return res.status(404).json({ message: "Brand not found" });

//         const filters = normalizeFilters(queryFilters);

//         // Convert skin types to ObjectId
//         let invalidSkinTypes = [];
//         if (filters.skinTypes?.length) {
//             const skinDocs = await SkinType.find({
//                 name: { $in: filters.skinTypes.map(s => new RegExp(`^${s}$`, "i")) }
//             }).select("_id name").lean();

//             const matchedNames = skinDocs.map(s => s.name.toLowerCase());
//             invalidSkinTypes = filters.skinTypes.filter(s => !matchedNames.includes(s.toLowerCase()));

//             filters.skinTypes = skinDocs.map(s => s._id.toString());
//         }

//         filters.brandIds = [brand._id.toString()];
//         const finalFilter = await applyDynamicFilters(filters);

//         const sortOptions = {
//             recent: { createdAt: -1 },
//             priceLowToHigh: { price: 1 },
//             priceHighToLow: { price: -1 },
//             rating: { avgRating: -1 }
//         };

//         const total = await Product.countDocuments(finalFilter);
//         const products = await Product.find(finalFilter)
//             .sort(sortOptions[sort] || { createdAt: -1 })
//             .skip((page - 1) * limit)
//             .limit(limit)
//             .lean();

//         const now = new Date();
//         const promotions = await Promotion.find({
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now }
//         }).lean();

//         const enrichedProducts = products.map(p => {
//             const enriched = enrichProductWithStockAndOptions(p, promotions);
//             enriched.variants = enriched.variants && enriched.variants.length
//                 ? calculateVariantPrices(enriched.variants, enriched, promotions)
//                 : calculateVariantPrices([getPseudoVariant(enriched)], enriched, promotions);
//             return enriched;
//         });

//         const cards = await Promise.all(enrichedProducts.map(p => formatProductCard(p, promotions)));

//         const uniqueCategoryIds = await Product.distinct("category", { brand: brand._id, isPublished: true });
//         const categories = await Category.find({ _id: { $in: uniqueCategoryIds }, isActive: true })
//             .select("name slug")
//             .lean();

//         let message = "";
//         if (invalidSkinTypes.length) message = `No products found for the selected skin type(s): ${invalidSkinTypes.join(", ")}`;
//         else if (products.length === 0) {
//             if (queryFilters.search) message = `No products found matching “${queryFilters.search}” for this brand.`;
//             else if (filters.minPrice || filters.maxPrice) message = `No products found with the selected price range.`;
//             else message = `No products available for ${brand.name} at the moment.`;
//         } else if (queryFilters.search) message = `Showing search results for “${queryFilters.search}”.`;
//         else message = `Showing products for ${brand.name}.`;

//         return res.status(200).json({
//             brandBanner: brand.banner || null,
//             brand: { _id: brand._id, name: brand.name, logo: brand.logo },
//             message,
//             products: cards,
//             categories,
//             pagination: {
//                 page,
//                 limit,
//                 total,
//                 totalPages: Math.ceil(total / limit),
//                 hasMore: page < Math.ceil(total / limit)
//             },
//         });

//     } catch (err) {
//         console.error("🔥 Error in getBrandLanding:", err);
//         res.status(500).json({ message: "Failed to fetch brand details", error: err.message });
//     }
// };





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
        let invalidSkinTypes = [];
        if (filters.skinTypes?.length) {
            const skinDocs = await SkinType.find({
                name: { $in: filters.skinTypes.map(s => new RegExp(`^${s}$`, "i")) }
            }).select("_id name").lean();

            const matchedNames = skinDocs.map(s => s.name.toLowerCase());
            invalidSkinTypes = filters.skinTypes.filter(s => !matchedNames.includes(s.toLowerCase()));
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
            let msg = queryFilters.search
                ? `No products found matching “${queryFilters.search}” in ${brand.name} - ${category.name}.`
                : filters.minPrice || filters.maxPrice
                    ? `No products found with the selected filters.`
                    : `No products available in ${brand.name} - ${category.name} at the moment.`;

            return res.status(200).json({
                brand,
                category,
                products: [],
                pagination: { page, limit, total: 0, totalPages: 0, hasMore: false },
                message: msg
            });
        }

        // 🔹 Active promotions
        const now = new Date();
        const promotions = await Promotion.find({
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).lean();

        // 🔹 Enrich + Normalize Variants
        const enrichedProducts = await Promise.all(
            products.map(async (p) => {
                const enriched = enrichProductWithStockAndOptions(p, promotions);

                // ✅ Normalize variants (like category route)
                let normalizedVariants = [];
                if (Array.isArray(enriched.variants) && enriched.variants.length > 0) {
                    normalizedVariants = calculateVariantPrices(enriched.variants, enriched, promotions);
                } else if (enriched.variant && (!enriched.variants || !enriched.variants.length)) {
                    const legacyVariant = {
                        sku: enriched.sku ?? `${enriched._id}-default`,
                        shadeName: enriched.variant || "Default",
                        images: normalizeImages(enriched.images || []),
                        stock: enriched.quantity ?? 0,
                        sales: enriched.sales ?? 0,
                        originalPrice: enriched.mrp ?? enriched.price ?? 0,
                        discountedPrice: enriched.price ?? 0,
                        displayPrice: enriched.price ?? 0,
                        discountAmount:
                            enriched.mrp && enriched.price ? enriched.mrp - enriched.price : 0,
                        discountPercent:
                            enriched.mrp && enriched.mrp > enriched.price
                                ? Math.round(((enriched.mrp - enriched.price) / enriched.mrp) * 100)
                                : 0,
                        status: enriched.quantity > 0 ? "inStock" : "outOfStock",
                        message: enriched.quantity > 0 ? "In-stock" : "No stock available"
                    };
                    normalizedVariants = calculateVariantPrices([legacyVariant], enriched, promotions);
                } else {
                    normalizedVariants = calculateVariantPrices([getPseudoVariant(enriched)], enriched, promotions);
                }

                enriched.variants = normalizedVariants;

                // ✅ Build shade options
                enriched.shadeOptions = normalizedVariants.map(v => ({
                    name: v.name || "Default",
                    sku: v.sku,
                    image: Array.isArray(v.images) && v.images.length ? v.images[0] : (enriched.thumbnail || null),
                    price: v.displayPrice,
                    status: v.status || "inStock"
                }));

                // ✅ Price & stock summary
                const displayVariant = normalizedVariants?.[0] || {};
                const price = displayVariant.displayPrice ?? enriched.price ?? 0;
                const mrp = displayVariant.originalPrice ?? enriched.mrp ?? enriched.price ?? 0;
                const discountPercent = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
                const status = displayVariant.status || (enriched.quantity > 0 ? "inStock" : "outOfStock");

                // ✅ Rating aggregation
                const [{ avg = 0, count = 0 } = {}] = await Review.aggregate([
                    { $match: { productId: enriched._id, status: "Active" } },
                    { $group: { _id: "$productId", avg: { $avg: "$rating" }, count: { $sum: 1 } } }
                ]);
                const avgRating = Math.round((avg || 0) * 10) / 10;

                return {
                    _id: enriched._id,
                    name: enriched.name,
                    brand: enriched.brand || null,
                    mrp,
                    price,
                    discountPercent,
                    discountAmount: mrp - price,
                    images: normalizeImages(enriched.images || []),
                    variants: normalizedVariants,
                    shadeOptions: enriched.shadeOptions || [],
                    status,
                    avgRating,
                    totalRatings: count || 0,
                    inStock: displayVariant.stock > 0 || enriched.quantity > 0
                };
            })
        );

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
        let invalidSkinTypes = [];

        if (filters.skinTypes?.length) {
            const skinDocs = await SkinType.find({
                name: { $in: filters.skinTypes.map(s => new RegExp(`^${s}$`, "i")) }
            }).select("_id name").lean();

            const matchedNames = skinDocs.map(s => s.name.toLowerCase());
            invalidSkinTypes = filters.skinTypes.filter(s => !matchedNames.includes(s.toLowerCase()));
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

        // Enrich and normalize
        const enrichedProducts = await Promise.all(
            products.map(async (p) => {
                const enriched = enrichProductWithStockAndOptions(p, promotions);
                let normalizedVariants = [];

                if (Array.isArray(enriched.variants) && enriched.variants.length > 0) {
                    normalizedVariants = calculateVariantPrices(enriched.variants, enriched, promotions);
                } else if (enriched.variant && (!enriched.variants || !enriched.variants.length)) {
                    const legacyVariant = {
                        sku: enriched.sku ?? `${enriched._id}-default`,
                        shadeName: enriched.variant || "Default",
                        images: normalizeImages(enriched.images || []),
                        stock: enriched.quantity ?? 0,
                        sales: enriched.sales ?? 0,
                        originalPrice: enriched.mrp ?? enriched.price ?? 0,
                        discountedPrice: enriched.price ?? 0,
                        displayPrice: enriched.price ?? 0,
                        discountAmount:
                            enriched.mrp && enriched.price ? enriched.mrp - enriched.price : 0,
                        discountPercent:
                            enriched.mrp && enriched.mrp > enriched.price
                                ? Math.round(((enriched.mrp - enriched.price) / enriched.mrp) * 100)
                                : 0,
                        status: enriched.quantity > 0 ? "inStock" : "outOfStock",
                        message: enriched.quantity > 0 ? "In-stock" : "No stock available"
                    };
                    normalizedVariants = calculateVariantPrices([legacyVariant], enriched, promotions);
                } else {
                    normalizedVariants = calculateVariantPrices([getPseudoVariant(enriched)], enriched, promotions);
                }

                enriched.variants = normalizedVariants;

                enriched.shadeOptions = normalizedVariants.map(v => ({
                    name: v.name || "Default",
                    sku: v.sku,
                    image: Array.isArray(v.images) && v.images.length ? v.images[0] : (enriched.thumbnail || null),
                    price: v.displayPrice,
                    status: v.status || "inStock"
                }));

                const displayVariant = normalizedVariants?.[0] || {};
                const price = displayVariant.displayPrice ?? enriched.price ?? 0;
                const mrp = displayVariant.originalPrice ?? enriched.mrp ?? enriched.price ?? 0;
                const discountPercent = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;

                return {
                    _id: enriched._id,
                    name: enriched.name,
                    brand: enriched.brand || null,
                    mrp,
                    price,
                    discountPercent,
                    discountAmount: mrp - price,
                    images: normalizeImages(enriched.images || []),
                    variants: normalizedVariants,
                    shadeOptions: enriched.shadeOptions || [],
                    inStock: displayVariant.stock > 0 || enriched.quantity > 0
                };
            })
        );

        const uniqueCategoryIds = await Product.distinct("category", { brand: brand._id, isPublished: true });
        const categories = await Category.find({ _id: { $in: uniqueCategoryIds }, isActive: true })
            .select("name slug")
            .lean();

        const message = invalidSkinTypes.length
            ? `No products found for the selected skin type(s): ${invalidSkinTypes.join(", ")}`
            : products.length === 0
                ? `No products available for ${brand.name} at the moment.`
                : `Showing products for ${brand.name}.`;

        return res.status(200).json({
            brandBanner: brand.banner || null,
            brand: { _id: brand._id, name: brand.name, logo: brand.logo },
            message,
            products: enrichedProducts,
            categories,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit)
            },
        });

    } catch (err) {
        console.error("🔥 Error in getBrandLanding:", err);
        res.status(500).json({ message: "Failed to fetch brand details", error: err.message });
    }
};
