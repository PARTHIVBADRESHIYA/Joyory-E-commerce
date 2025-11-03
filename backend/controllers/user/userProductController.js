import Product from '../../models/Product.js';
import ProductViewLog from "../../models/ProductViewLog.js";
import Promotion from '../../models/Promotion.js';
import User from '../../models/User.js';
import Order from '../../models/Order.js';
import Brand from '../../models/Brand.js';
import SkinType from '../../models/SkinType.js';
import Formulation from "../../models/shade/Formulation.js";
import Category from '../../models/Category.js';
import { getDescendantCategoryIds } from '../../middlewares/utils/categoryUtils.js';
import { getRecommendations } from '../../middlewares/utils/recommendationService.js';
import { formatProductCard } from '../../middlewares/utils/recommendationService.js';

import { enrichProductWithStockAndOptions, enrichProductsUnified } from "../../middlewares/services/productHelpers.js";
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
        // 1️⃣ --- Fetch master data
        const [brands, categories, skinTypes, formulations] = await Promise.all([
            Brand.find({ isActive: true }).select("_id name slug").lean(),
            Category.find({ isActive: true }).select("_id name slug").lean(),
            SkinType.find({ isDeleted: false }).select("_id name slug").lean(),
            Formulation.find({}).select("_id name slug").lean()  // 👈 Changed here
        ]);

        // 2️⃣ --- Normalize filters
        const filters = normalizeFilters(req.query);

        // 3️⃣ --- Hide filters based on page context
        const hideCategoryFilter = !!req.params.categorySlug;
        const hideBrandFilter = !!req.params.brandSlug;
        const hideSkinTypeFilter = !!req.params.skinSlug;

        // 4️⃣ --- Build base query
        const baseFilter = await applyDynamicFilters(filters);
        baseFilter.isPublished = true;

        // 5️⃣ --- Aggregations
        const [brandCounts, categoryCounts, skinTypeCounts, formulationCounts] = await Promise.all([
            Product.aggregate([
                { $match: baseFilter },
                { $group: { _id: "$brand", count: { $sum: 1 } } }
            ]),
            Product.aggregate([
                { $match: baseFilter },
                { $group: { _id: "$category", count: { $sum: 1 } } }
            ]),
            Product.aggregate([
                { $match: baseFilter },
                { $unwind: "$skinTypes" },
                { $group: { _id: "$skinTypes", count: { $sum: 1 } } }
            ]),
            Product.aggregate([
                { $match: { ...baseFilter, formulation: { $ne: null } } },
                { $group: { _id: "$formulation", count: { $sum: 1 } } } // ❌ remove $toString
            ])
        ]);

        // 6️⃣ --- Map counts
        const mapCounts = arr => Object.fromEntries(arr.map(i => [String(i._id), i.count]));

        const brandCountMap = mapCounts(brandCounts);
        const categoryCountMap = mapCounts(categoryCounts);
        const skinTypeCountMap = mapCounts(skinTypeCounts);
        const formulationCountMap = mapCounts(formulationCounts);

        // 7️⃣ --- Build a merged formulation list
        const productFormulationIds = Object.keys(formulationCountMap);

        const allFormulationsMap = {};
        formulations.forEach(f => { allFormulationsMap[f._id.toString()] = f; });

        const mergedFormulations = productFormulationIds.map(fid => {
            const f = allFormulationsMap[fid];
            return {
                _id: fid,
                name: f ? f.name : "Unknown Formulation",
                slug: f ? f.slug : "",
                count: formulationCountMap[fid] || 0
            };
        });

        // Optional: add formulations with 0 count from master list if needed
        formulations.forEach(f => {
            if (!productFormulationIds.includes(f._id.toString())) {
                mergedFormulations.push({
                    _id: f._id,
                    name: f.name,
                    slug: f.slug,
                    count: 0
                });
            }
        });

        // 8️⃣ --- Construct final response
        const filtersResponse = {
            brands: hideBrandFilter ? [] : brands.map(b => ({
                _id: b._id,
                name: b.name,
                slug: b.slug,
                count: brandCountMap[b._id?.toString()] || 0
            })),
            categories: hideCategoryFilter ? [] : categories.map(c => ({
                _id: c._id,
                name: c.name,
                slug: c.slug,
                count: categoryCountMap[c._id?.toString()] || 0
            })),
            skinTypes: hideSkinTypeFilter ? [] : skinTypes.map(s => ({
                _id: s._id,
                name: s.name,
                slug: s.slug,
                count: skinTypeCountMap[s._id?.toString()] || 0
            })),
            formulations: mergedFormulations,
            priceRanges: [
                { label: "Rs. 0 - Rs. 499", min: 0, max: 499 },
                { label: "Rs. 500 - Rs. 999", min: 500, max: 999 },
                { label: "Rs. 1000 - Rs. 1999", min: 1000, max: 1999 },
                { label: "Rs. 2000 - Rs. 3999", min: 2000, max: 3999 },
                { label: "Rs. 4000 & Above", min: 4000, max: null }
            ]
        };

        res.status(200).json({ success: true, filters: filtersResponse });

    } catch (err) {
        console.error("❌ getFilterMetadata error:", err);
        res.status(500).json({ success: false, message: "Failed to load filters", error: err.message });
    }
};

const toObjectId = (id) => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;

export const normalizeFilters = (query = {}) => ({
    search: query.search || undefined,

    brandIds: query.brandIds
        ? Array.isArray(query.brandIds)
            ? query.brandIds
            : query.brandIds.split(",")
        : [],

    categoryIds: query.categoryIds
        ? Array.isArray(query.categoryIds)
            ? query.categoryIds
            : query.categoryIds.split(",")
        : [],

    skinTypes: query.skinTypes
        ? Array.isArray(query.skinTypes)
            ? query.skinTypes
            : query.skinTypes.split(",")
        : [],

    formulations: query.formulations
        ? Array.isArray(query.formulations)
            ? query.formulations
            : query.formulations.split(",")
        : [],

    finishes: query.finishes
        ? Array.isArray(query.finishes)
            ? query.finishes
            : query.finishes.split(",")
        : [],

    minPrice: query.minPrice ? Number(query.minPrice) : undefined,
    maxPrice: query.maxPrice ? Number(query.maxPrice) : undefined,
    discountMin: query.discountMin ? Number(query.discountMin) : undefined,
    ratingMin: query.ratingMin ? Number(query.ratingMin) : undefined,
});

export const applyDynamicFilters = async (filters = {}) => {
    const f = { isPublished: true };

    const resolveIds = async (Model, values) => {
        if (!values?.length) return [];

        // ✅ Convert valid ObjectId strings
        const objectIds = values
            .filter(v => mongoose.Types.ObjectId.isValid(v))
            .map(v => new mongoose.Types.ObjectId(v));

        // Lookup non-ObjectId strings in DB
        const stringsToResolve = values.filter(v => !mongoose.Types.ObjectId.isValid(v));
        let resolvedFromDB = [];
        if (stringsToResolve.length) {
            const query = [{ slug: { $in: stringsToResolve } }, { name: { $in: stringsToResolve } }];
            if (Model.modelName === "Formulation") query.push({ key: { $in: stringsToResolve } });
            const docs = await Model.find({ $or: query }).select("_id").lean();
            resolvedFromDB = docs.map(d => d._id);
        }

        return [...objectIds, ...resolvedFromDB];
    };

    const andFilters = [];

    // Brand
    if (filters.brandIds?.length) {
        const ids = await resolveIds(Brand, filters.brandIds);
        if (ids.length) andFilters.push({ brand: { $in: ids } });
    }

    // Category
    if (filters.categoryIds?.length) {
        const ids = await resolveIds(Category, filters.categoryIds);
        if (ids.length) andFilters.push({ category: { $in: ids } });
    }

    // Price
    if (filters.minPrice || filters.maxPrice) {
        const priceFilter = {};
        if (filters.minPrice) priceFilter.$gte = filters.minPrice;
        if (filters.maxPrice) priceFilter.$lte = filters.maxPrice;
        andFilters.push({ $or: [{ price: priceFilter }, { "variants.price": priceFilter }] });
    }

    // SkinTypes
    if (filters.skinTypes?.length) {
        const ids = await resolveIds(SkinType, filters.skinTypes);
        if (ids.length) {
            const objectIds = ids.map(id => new mongoose.Types.ObjectId(id));
            andFilters.push({ skinTypes: { $in: objectIds } });
        }
    }

    // Formulations
    if (filters.formulations?.length) {
        const ids = await resolveIds(Formulation, filters.formulations);
        if (ids.length) andFilters.push({ formulation: { $in: ids } });
    }

    // Finishes
    if (filters.finishes?.length) {
        andFilters.push({ finish: { $in: filters.finishes.map(v => new RegExp(`^${v}$`, "i")) } });
    }

    // Discount & Rating
    if (filters.discountMin) andFilters.push({ discountPercent: { $gte: filters.discountMin } });
    if (filters.ratingMin) andFilters.push({ avgRating: { $gte: filters.ratingMin } });

    // Text search
    if (filters.search) andFilters.push({ $text: { $search: filters.search } });

    // Apply all filters together using $and
    if (andFilters.length) {
        f.$and = andFilters;
    }
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

//         // 🔹 Convert string query params to array if needed
//         if (queryFilters.skinTypes && typeof queryFilters.skinTypes === "string") {
//             queryFilters.skinTypes = [queryFilters.skinTypes];
//         }
//         if (queryFilters.brandIds && typeof queryFilters.brandIds === "string") {
//             queryFilters.brandIds = [queryFilters.brandIds];
//         }
//         if (queryFilters.formulations && typeof queryFilters.formulations === "string") {
//             queryFilters.formulations = [queryFilters.formulations];
//         }
//         if (queryFilters.finishes && typeof queryFilters.finishes === "string") {
//             queryFilters.finishes = [queryFilters.finishes];
//         }

//         // 🔹 1. Fetch category
//         const category = mongoose.Types.ObjectId.isValid(slug)
//             ? await Category.findById(slug)
//                 .select("name slug bannerImage thumbnailImage ancestors")
//                 .lean()
//             : await Category.findOne({ slug })
//                 .select("name slug bannerImage thumbnailImage ancestors")
//                 .lean();

//         if (!category)
//             return res.status(404).json({ message: "Category not found" });

//         // 🔹 2. Track user recent categories
//         if (req.user?.id) {
//             await User.findByIdAndUpdate(req.user.id, { $pull: { recentCategories: category._id } });
//             await User.findByIdAndUpdate(req.user.id, {
//                 $push: {
//                     recentCategories: { $each: [category._id], $position: 0, $slice: 20 },
//                 },
//             });
//         }

//         // 🔹 3. Get descendant categories
//         const descendantIds = (await getDescendantCategoryIds(category._id))
//             .filter((id) => mongoose.Types.ObjectId.isValid(id))
//             .map((id) => new mongoose.Types.ObjectId(id));
//         descendantIds.push(category._id);

//         // 🔹 4. Normalize & apply filters
//         const filters = normalizeFilters(queryFilters);
//         filters.categoryIds = descendantIds.map((id) => id.toString());
//         const finalFilter = await applyDynamicFilters(filters);
//         finalFilter.isPublished = true;

//         // 🔹 5. Sorting
//         const sortOptions = {
//             recent: { createdAt: -1 },
//             priceLowToHigh: { price: 1 },
//             priceHighToLow: { price: -1 },
//             rating: { avgRating: -1 },
//         };

//         // 🔹 6. Fetch products
//         const total = await Product.countDocuments(finalFilter);
//         const products = await Product.find(finalFilter)
//             .populate("skinTypes", "name slug isActive")
//             .populate("formulation", "name slug isActive")
//             .sort(sortOptions[sort] || { createdAt: -1 })
//             .skip((page - 1) * limit)
//             .limit(limit)
//             .lean();

//         if (!products.length) {
//             const msg = queryFilters.search
//                 ? `No products found matching “${queryFilters.search}” in this category.`
//                 : filters.minPrice ||
//                     filters.maxPrice ||
//                     filters.brandIds?.length
//                     ? `No products found with the selected filters in this category.`
//                     : `No products available in ${category.name} at the moment.`;

//             return res.status(200).json({
//                 category,
//                 breadcrumb: [],
//                 products: [],
//                 pagination: {
//                     page,
//                     limit,
//                     total: 0,
//                     totalPages: 0,
//                     hasMore: false,
//                 },
//                 message: msg,
//             });
//         }

//         // 🔹 7. Active promotions
//         const now = new Date();
//         const promotions = await Promotion.find({
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now },
//         }).lean();

//         // 🔹 8. Enrich all products
//         const enrichedProducts = await enrichProductsUnified(products, promotions);

//         // 🩷 User-friendly, attractive stock messages (only this part changed)
//         const enrichedWithStockMsg = enrichedProducts.map((prod) => {
//             // Per-variant stock message
//             if (Array.isArray(prod.variants) && prod.variants.length) {
//                 prod.variants = prod.variants.map((v) => {
//                     const vStock = v.stock ?? 0;
//                     if (vStock <= 0) {
//                         v.stockMessage = "⛔ Currently out of stock — check back soon!";
//                     } else if (vStock === 1) {
//                         v.stockMessage = "🔥 Almost gone! Only 1 left in stock.";
//                     } else if (vStock <= 3) {
//                         v.stockMessage = `⚡ Hurry! Just ${vStock} piece${vStock > 1 ? "s" : ""} remaining.`;
//                     } else if (vStock < 10) {
//                         v.stockMessage = `💨 Only a few left — ${vStock} available!`;
//                     } else {
//                         v.stockMessage = null;
//                     }
//                     return v;
//                 });
//             }

//             return prod;
//         });

//         // ✅ Reattach skinTypes & formulation to each product
//         const productsWithRelations = enrichedWithStockMsg.map((prod, i) => ({
//             ...prod,
//             skinTypes: products[i].skinTypes || [],
//             formulation: products[i].formulation || null,
//         }));

//         // 🔹 9. Breadcrumbs
//         let ancestors = [];
//         if (Array.isArray(category.ancestors) && category.ancestors.length) {
//             const ancestorDocs = await Category.find({
//                 _id: { $in: category.ancestors },
//             })
//                 .select("name slug")
//                 .lean();
//             ancestors = category.ancestors
//                 .map((id) => ancestorDocs.find((a) => String(a._id) === String(id)))
//                 .filter(Boolean);
//         }

//         // ✅ 10. Final response
//         return res.status(200).json({
//             category,
//             breadcrumb: ancestors,
//             products: productsWithRelations,
//             pagination: {
//                 page,
//                 limit,
//                 total,
//                 totalPages: Math.ceil(total / limit),
//                 hasMore: page < Math.ceil(total / limit),
//             },
//             message: null,
//         });
//     } catch (err) {
//         console.error("❌ getProductsByCategory error:", err);
//         return res
//             .status(500)
//             .json({
//                 message: "Oops! Something went wrong while fetching products. Please try again.",
//             });
//     }
// };

export const getProductsByCategory = async (req, res) => {
    try {
        const slug = req.params.slug.toLowerCase();
        let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;
        page = Number(page) || 1;
        limit = Number(limit) || 12;

        // Convert filters to arrays if needed
        ["skinTypes", "brandIds", "formulations", "finishes"].forEach(key => {
            if (queryFilters[key] && typeof queryFilters[key] === "string") {
                queryFilters[key] = [queryFilters[key]];
            }
        });

        // 1️⃣ Find category
        const category = mongoose.Types.ObjectId.isValid(slug)
            ? await Category.findById(slug).select("name slug bannerImage thumbnailImage ancestors").lean()
            : await Category.findOne({ slug }).select("name slug bannerImage thumbnailImage ancestors").lean();

        if (!category)
            return res.status(404).json({ message: "Category not found" });

        // 2️⃣ Track user’s recent categories
        if (req.user?.id) {
            await User.findByIdAndUpdate(req.user.id, { $pull: { recentCategories: category._id } });
            await User.findByIdAndUpdate(req.user.id, {
                $push: { recentCategories: { $each: [category._id], $position: 0, $slice: 20 } },
            });
        }

        // 3️⃣ Descendants
        const descendantIds = (await getDescendantCategoryIds(category._id))
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));
        descendantIds.push(category._id);

        // 4️⃣ Filters
        const filters = normalizeFilters(queryFilters);
        filters.categoryIds = descendantIds.map(id => id.toString());
        const finalFilter = await applyDynamicFilters(filters);
        finalFilter.isPublished = true;

        // 5️⃣ Sorting
        const sortOptions = {
            recent: { createdAt: -1 },
            priceLowToHigh: { price: 1 },
            priceHighToLow: { price: -1 },
            rating: { avgRating: -1 },
        };

        // 6️⃣ Fetch products (include all needed fields & relations)
        const total = await Product.countDocuments(finalFilter);
        const products = await Product.find(finalFilter)
            .populate("brand", "name slug isActive") // ✅ brand
            .populate("category", "name slug") // ✅ category
            .populate("skinTypes", "name slug isActive") // ✅ skin types
            .populate("formulation", "name slug isActive") // ✅ formulation
            .sort(sortOptions[sort] || { createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        if (!products.length) {
            const msg = queryFilters.search
                ? `No products found matching “${queryFilters.search}” in this category.`
                : (filters.minPrice || filters.maxPrice || filters.brandIds?.length)
                    ? `No products found with the selected filters in this category.`
                    : `No products available in ${category.name} at the moment.`;

            return res.status(200).json({
                category,
                breadcrumb: [],
                products: [],
                pagination: {
                    page,
                    limit,
                    total: 0,
                    totalPages: 0,
                    hasMore: false,
                },
                message: msg,
            });
        }

        // 7️⃣ Active promotions
        const now = new Date();
        const promotions = await Promotion.find({
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now },
        }).lean();

        // 8️⃣ Enrich products
        const enrichedProducts = await enrichProductsUnified(products, promotions);

        // 9️⃣ Stock messages
        const enrichedWithStockMsg = enrichedProducts.map(prod => {
            if (Array.isArray(prod.variants) && prod.variants.length) {
                prod.variants = prod.variants.map(v => {
                    const vStock = v.stock ?? 0;
                    if (vStock <= 0) v.stockMessage = "⛔ Currently out of stock — check back soon!";
                    else if (vStock === 1) v.stockMessage = "🔥 Almost gone! Only 1 left in stock.";
                    else if (vStock <= 3) v.stockMessage = `⚡ Hurry! Just ${vStock} piece${vStock > 1 ? "s" : ""} remaining.`;
                    else if (vStock < 10) v.stockMessage = `💨 Only a few left — ${vStock} available!`;
                    else v.stockMessage = null;
                    return v;
                });
            }
            return prod;
        });

        // 🔟 Ensure slug exists
        const { generateUniqueSlug } = await import("../../middlewares/utils/slug.js");
        for (const prod of enrichedWithStockMsg) {
            if (!prod.slug) {
                const newSlug = await generateUniqueSlug(Product, prod.name);
                await Product.findByIdAndUpdate(prod._id, { slug: newSlug });
                prod.slug = newSlug;
            }
        }

        // 11️⃣ Reattach relations (to ensure they persist)
        const productsWithRelations = enrichedWithStockMsg.map((prod, i) => ({
            ...prod,
            brand: products[i].brand || null,
            category: products[i].category || null,
            skinTypes: products[i].skinTypes || [],
            formulation: products[i].formulation || null,
        }));

        // 12️⃣ Breadcrumbs
        let ancestors = [];
        if (Array.isArray(category.ancestors) && category.ancestors.length) {
            const ancestorDocs = await Category.find({ _id: { $in: category.ancestors } })
                .select("name slug")
                .lean();
            ancestors = category.ancestors
                .map(id => ancestorDocs.find(a => String(a._id) === String(id)))
                .filter(Boolean);
        }

        // ✅ 13️⃣ Final response
        return res.status(200).json({
            category,
            breadcrumb: ancestors,
            products: productsWithRelations.map(p => ({
                ...p,
                slug: p.slug,
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit),
            },
            message: null,
        });

    } catch (err) {
        console.error("❌ getProductsByCategory error:", err);
        return res.status(500).json({
            message: "Oops! Something went wrong while fetching products. Please try again.",
        });
    }
};


// export const getSingleProduct = async (req, res) => {
//     try {
//         const productId = req.params.id;
//         const selectedSku = req.query.variant; // Selected variant SKU (optional)

//         if (!mongoose.Types.ObjectId.isValid(productId)) {
//             return res
//                 .status(400)
//                 .json({ message: "⚠️ Invalid product ID. Please check and try again." });
//         }

//         // 1️⃣ Load product + increment views
//         const product = await Product.findOneAndUpdate(
//             { _id: productId, isPublished: true },
//             { $inc: { views: 1 } },
//             { new: true, lean: true }
//         );

//         if (!product)
//             return res
//                 .status(404)
//                 .json({ message: "❌ Product not found or may have been removed." });

//         // 2️⃣ Active promotions
//         const now = new Date();
//         const promotions = await Promotion.find({
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now },
//         }).lean();

//         // 3️⃣ Enrich using the SAME helper you already have
//         const enrichedProduct = await enrichProductsUnified(product, promotions, {
//             selectedSku,
//         });

//         // Per-variant stock messages (keep same logic, only friendly text)
//         if (Array.isArray(enrichedProduct.variants) && enrichedProduct.variants.length) {
//             enrichedProduct.variants = enrichedProduct.variants.map((v) => {
//                 const vStock = v.stock ?? 0;
//                 if (vStock <= 0) {
//                     v.stockMessage = "⛔ Currently out of stock — check back soon!";
//                 } else if (vStock === 1) {
//                     v.stockMessage = "🔥 Almost gone! Only 1 left in stock.";
//                 } else if (vStock <= 3) {
//                     v.stockMessage = `⚡ Hurry! Just ${vStock} piece${vStock > 1 ? "s" : ""} remaining.`;
//                 } else if (vStock < 10) {
//                     v.stockMessage = `💨 Only a few left — ${vStock} available!`;
//                 } else {
//                     v.stockMessage = null;
//                 }
//                 return v;
//             });
//         }

//         // 4️⃣ Get recommendations (same as before)
//         const modes = ["moreLikeThis", "boughtTogether", "alsoViewed"];
//         const recommendations = {};
//         for (const mode of modes) {
//             const rec = await getRecommendations({
//                 mode,
//                 productId: enrichedProduct._id,
//                 categorySlug: enrichedProduct.categorySlug,
//                 userId: req.user?._id,
//                 limit: 6,
//             });
//             recommendations[mode] = {
//                 name: rec.message || mode,
//                 products: rec.success ? rec.products : [],
//             };
//         }

//         // 5️⃣ Final response (exact same structure)
//         return res.status(200).json({
//             _id: enrichedProduct._id,
//             name: enrichedProduct.name,
//             brand: enrichedProduct.brand || null,
//             mrp: enrichedProduct.mrp,
//             price: enrichedProduct.price,
//             discountPercent: enrichedProduct.discountPercent,
//             discountAmount: enrichedProduct.discountAmount,
//             images: enrichedProduct.images,
//             variants: enrichedProduct.variants,
//             shadeOptions: enrichedProduct.shadeOptions || [],
//             status: enrichedProduct.status,
//             message: enrichedProduct.stockMessage || null,
//             avgRating: enrichedProduct.avgRating,
//             totalRatings: enrichedProduct.totalRatings,
//             inStock: enrichedProduct.inStock,
//             selectedVariant: enrichedProduct.selectedVariant,
//             recommendations,
//         });
//     } catch (err) {
//         console.error("❌ getSingleProduct error:", err);
//         return res.status(500).json({
//             message:
//                 "🚫 Oops! Something went wrong while fetching product details. Please try again shortly.",
//         });
//     }
// };
export const getSingleProduct = async (req, res) => {
    try {
        const { idOrSlug } = req.params; // ✅ works for both slug or id
        const selectedSku = req.query.variant; // optional

        // 🧩 Detect whether it's an ObjectId or slug
        const query = mongoose.Types.ObjectId.isValid(idOrSlug)
            ? { _id: idOrSlug }
            : { slug: idOrSlug };

        // 1️⃣ Find product + increment views
        const product = await Product.findOneAndUpdate(
            { ...query, isPublished: true },
            { $inc: { views: 1 } },
            { new: true, lean: true }
        );

        if (!product) {
            return res.status(404).json({
                message: "❌ Product not found or may have been removed.",
            });
        }

        // 2️⃣ Fetch active promotions
        const now = new Date();
        const promotions = await Promotion.find({
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now },
        }).lean();

        // 3️⃣ Enrich product data (using your existing helper)
        const enrichedProduct = await enrichProductsUnified(product, promotions, {
            selectedSku,
        });

        // 4️⃣ Handle per-variant stock messages (same logic, cleaned)
        if (Array.isArray(enrichedProduct.variants) && enrichedProduct.variants.length) {
            enrichedProduct.variants = enrichedProduct.variants.map((v) => {
                const vStock = v.stock ?? 0;
                if (vStock <= 0) {
                    v.stockMessage = "⛔ Currently out of stock — check back soon!";
                } else if (vStock === 1) {
                    v.stockMessage = "🔥 Almost gone! Only 1 left in stock.";
                } else if (vStock <= 3) {
                    v.stockMessage = `⚡ Hurry! Just ${vStock} piece${vStock > 1 ? "s" : ""} remaining.`;
                } else if (vStock < 10) {
                    v.stockMessage = `💨 Only a few left — ${vStock} available!`;
                } else {
                    v.stockMessage = null;
                }
                return v;
            });
        }

        // 5️⃣ Generate recommendations
        const modes = ["moreLikeThis", "boughtTogether", "alsoViewed"];
        const recommendations = {};

        for (const mode of modes) {
            const rec = await getRecommendations({
                mode,
                productId: enrichedProduct._id,
                categorySlug: enrichedProduct.categorySlug,
                userId: req.user?._id,
                limit: 6,
            });
            recommendations[mode] = {
                name: rec.message || mode,
                products: rec.success ? rec.products : [],
            };
        }

        // 6️⃣ Final clean response
        return res.status(200).json({
            _id: enrichedProduct._id,
            name: enrichedProduct.name,
            slug: enrichedProduct.slug, // ✅ include slug in response
            brand: enrichedProduct.brand || null,
            mrp: enrichedProduct.mrp,
            price: enrichedProduct.price,
            discountPercent: enrichedProduct.discountPercent,
            discountAmount: enrichedProduct.discountAmount,
            images: enrichedProduct.images,
            variants: enrichedProduct.variants,
            shadeOptions: enrichedProduct.shadeOptions || [],
            status: enrichedProduct.status,
            message: enrichedProduct.stockMessage || null,
            avgRating: enrichedProduct.avgRating,
            totalRatings: enrichedProduct.totalRatings,
            inStock: enrichedProduct.inStock,
            selectedVariant: enrichedProduct.selectedVariant,
            recommendations,
        });
    } catch (err) {
        console.error("❌ getSingleProduct error:", err);
        return res.status(500).json({
            message:
                "🚫 Oops! Something went wrong while fetching product details. Please try again shortly.",
            error: err.message,
        });
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
//         const { slug } = req.params;
//         let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;
//         page = Number(page) || 1;
//         limit = Number(limit) || 12;

//         // 🔹 Find SkinType
//         const skinType = await SkinType.findOne({ slug: slug.toLowerCase(), isDeleted: false })
//             .select("name slug _id")
//             .lean();
//         if (!skinType) return res.status(404).json({ message: "Skin type not found" });

//         // 🔹 Normalize filters
//         const filters = normalizeFilters(queryFilters);
//         filters.skinTypes = [skinType._id.toString()];

//         // 🔹 Apply category-wise filtering
//         // If user passed category names/slugs in query, resolve them to _ids
//         if (filters.categorySlugs?.length) {
//             const categoryDocs = await Category.find({
//                 slug: { $in: filters.categorySlugs.map(s => s.toLowerCase()) },
//                 isActive: true
//             }).select("_id").lean();
//             filters.categoryIds = categoryDocs.map(c => c._id.toString());
//         }

//         // 🔹 Apply dynamic filters (includes brand, price range, search, etc.)
//         const finalFilter = await applyDynamicFilters(filters);
//         finalFilter.isPublished = true;

//         // 🔹 Sorting options
//         const sortOptions = {
//             recent: { createdAt: -1 },
//             priceLowToHigh: { price: 1 },
//             priceHighToLow: { price: -1 },
//             rating: { avgRating: -1 }
//         };

//         // 🔹 Count total results
//         const total = await Product.countDocuments(finalFilter);

//         // 🔹 Fetch filtered products
//         const products = await Product.find(finalFilter)
//             .populate("category", "name slug isActive")
//             .populate("formulation", "name slug isActive")
//             .populate("brand", "name slug isActive")
//             .sort(sortOptions[sort] || { createdAt: -1 })
//             .skip((page - 1) * limit)
//             .limit(limit)
//             .lean();

//         // 🔹 Fetch active promotions
//         const now = new Date();
//         const promotions = await Promotion.find({
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now }
//         }).lean();

//         // 🔹 Enrich products (discounts, stock, etc.)
//         const enrichedProducts = await enrichProductsUnified(products, promotions);

//         // ✅ Reattach relations to ensure population consistency
//         const productsWithRelations = enrichedProducts.map((prod, i) => ({
//             ...prod,
//             category: products[i].category || null,
//             formulation: products[i].formulation || null,
//             skinTypes: products[i].skinTypes || [],
//             brand: products[i].brand || null
//         }));

//         // 🔹 Derive unique categories for filter options (like brand landing)
//         const uniqueCategoryIds = await Product.distinct("category", {
//             skinTypes: skinType._id,
//             isPublished: true
//         });
//         const categories = await Category.find({
//             _id: { $in: uniqueCategoryIds },
//             isActive: true
//         }).select("name slug").lean();

//         // 🔹 Prepare response message
//         const message = products.length
//             ? `Showing products for ${skinType.name} skin type.`
//             : `No products available for ${skinType.name} skin type.`;

//         // 🔹 Final response
//         return res.status(200).json({
//             success: true,
//             skinType: { _id: skinType._id, name: skinType.name, slug: skinType.slug },
//             products: productsWithRelations,
//             categories,
//             pagination: {
//                 page,
//                 limit,
//                 total,
//                 totalPages: Math.ceil(total / limit),
//                 hasMore: page < Math.ceil(total / limit)
//             },
//             message
//         });

//     } catch (err) {
//         console.error("🔥 Error in getProductsBySkinType:", err);
//         res.status(500).json({ success: false, message: "Failed to fetch skin type details", error: err.message });
//     }
// };
export const getProductsBySkinType = async (req, res) => {
    try {
        const { slug } = req.params;
        let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;
        page = Number(page) || 1;
        limit = Number(limit) || 12;

        // 🔹 Find SkinType
        const skinType = await SkinType.findOne({ slug: slug.toLowerCase(), isDeleted: false })
            .select("name slug _id")
            .lean();
        if (!skinType)
            return res
                .status(404)
                .json({ message: "❌ Skin type not found or may have been removed." });

        // 🔹 Normalize filters
        const filters = normalizeFilters(queryFilters);
        filters.skinTypes = [skinType._id.toString()];

        // 🔹 Apply category-wise filtering
        if (filters.categorySlugs?.length) {
            const categoryDocs = await Category.find({
                slug: { $in: filters.categorySlugs.map((s) => s.toLowerCase()) },
                isActive: true,
            })
                .select("_id")
                .lean();
            filters.categoryIds = categoryDocs.map((c) => c._id.toString());
        }

        // 🔹 Apply dynamic filters (includes brand, price range, search, etc.)
        const finalFilter = await applyDynamicFilters(filters);
        finalFilter.isPublished = true;

        // 🔹 Sorting options
        const sortOptions = {
            recent: { createdAt: -1 },
            priceLowToHigh: { price: 1 },
            priceHighToLow: { price: -1 },
            rating: { avgRating: -1 },
        };

        // 🔹 Count total results
        const total = await Product.countDocuments(finalFilter);

        // 🔹 Fetch filtered products
        const products = await Product.find(finalFilter)
            .populate("category", "name slug isActive")
            .populate("formulation", "name slug isActive")
            .populate("brand", "name slug isActive")
            .sort(sortOptions[sort] || { createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        // 🔹 Fetch active promotions
        const now = new Date();
        const promotions = await Promotion.find({
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now },
        }).lean();

        // 🔹 Enrich products (discounts, stock, etc.)
        const enrichedProducts = await enrichProductsUnified(products, promotions);

        // 🩷 Add user-friendly stock messages (like in category & single product)
        const enrichedWithStockMsg = enrichedProducts.map((prod) => {
            if (Array.isArray(prod.variants) && prod.variants.length) {
                prod.variants = prod.variants.map((v) => {
                    const vStock = v.stock ?? 0;
                    if (vStock <= 0) {
                        v.stockMessage = "Out of stock";
                    } else if (vStock === 1) {
                        v.stockMessage = "🔥 Only 1 left!";
                    } else if (vStock <= 3) {
                        v.stockMessage = `⚡ Just ${vStock} left — selling fast!`;
                    } else if (vStock < 10) {
                        v.stockMessage = `💨 Few left (${vStock} in stock)`;
                    } else {
                        v.stockMessage = null;
                    }
                    return v;
                });
            }

            return prod;
        });

        // ✅ Reattach relations to ensure population consistency
        const productsWithRelations = enrichedWithStockMsg.map((prod, i) => ({
            ...prod,
            category: products[i].category || null,
            formulation: products[i].formulation || null,
            skinTypes: products[i].skinTypes || [],
            brand: products[i].brand || null,
        }));

        // 🔹 Derive unique categories for filter options
        const uniqueCategoryIds = await Product.distinct("category", {
            skinTypes: skinType._id,
            isPublished: true,
        });
        const categories = await Category.find({
            _id: { $in: uniqueCategoryIds },
            isActive: true,
        })
            .select("name slug")
            .lean();

        // 🔹 Prepare response message
        const message = products.length
            ? `✨ Showing curated products specially for ${skinType.name} skin type.`
            : `😔 No products available for ${skinType.name} skin type right now — we're adding new ones soon!`;

        // 🔹 Final response
        return res.status(200).json({
            success: true,
            skinType: { _id: skinType._id, name: skinType.name, slug: skinType.slug },
            products: productsWithRelations,
            categories,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit),
            },
            message,
        });
    } catch (err) {
        console.error("🔥 Error in getProductsBySkinType:", err);
        res.status(500).json({
            success: false,
            message: "🚫 Oops! Something went wrong while fetching products for this skin type. Please try again later.",
            error: err.message,
        });
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

