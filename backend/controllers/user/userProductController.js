// import Product from '../../models/Product.js';
// import ProductViewLog from "../../models/ProductViewLog.js";
// import Promotion from '../../models/Promotion.js';
// import User from '../../models/User.js';
// import Order from '../../models/Order.js';
// import Brand from '../../models/Brand.js';
// import SkinType from '../../models/SkinType.js';
// import Formulation from "../../models/shade/Formulation.js";
// import Category from '../../models/Category.js';
// import { getDescendantCategoryIds } from '../../middlewares/utils/categoryUtils.js';
// import { getRecommendations } from '../../middlewares/utils/recommendationService.js';
// import { formatProductCard } from '../../middlewares/utils/recommendationService.js';

// import { enrichProductWithStockAndOptions, enrichProductsUnified } from "../../middlewares/services/productHelpers.js";
// import mongoose from 'mongoose';

// // 🔧 Centralized helper for shades/colors
// export const buildOptions = (product) => {
//     if (!product) return { shadeOptions: [], colorOptions: [] };

//     if (product.variants && product.variants.length > 0) {
//         const shadeOptions = product.variants.map(v => v.shadeName).filter(Boolean);
//         const colorOptions = product.variants.map(v => v.hex).filter(Boolean);
//         return { shadeOptions, colorOptions };
//     }

//     return {
//         shadeOptions: product.shadeOptions || [],
//         colorOptions: product.colorOptions || []
//     };
// };

// export const getFilterMetadata = async (req, res) => {
//     try {
//         // 1️⃣ --- Fetch master data
//         const [brands, categories, skinTypes, formulations] = await Promise.all([
//             Brand.find({ isActive: true }).select("_id name slug").lean(),
//             Category.find({ isActive: true }).select("_id name slug").lean(),
//             SkinType.find({ isDeleted: false }).select("_id name slug").lean(),
//             Formulation.find({}).select("_id name slug").lean()  // 👈 Changed here
//         ]);

//         // 2️⃣ --- Normalize filters
//         const filters = normalizeFilters(req.query);

//         // 3️⃣ --- Hide filters based on page context
//         const hideCategoryFilter = !!req.params.categorySlug;
//         const hideBrandFilter = !!req.params.brandSlug;
//         const hideSkinTypeFilter = !!req.params.skinSlug;

//         // 4️⃣ --- Build base query
//         const baseFilter = await applyDynamicFilters(filters);
//         baseFilter.isPublished = true;

//         // 5️⃣ --- Aggregations
//         const [brandCounts, categoryCounts, skinTypeCounts, formulationCounts] = await Promise.all([
//             Product.aggregate([
//                 { $match: baseFilter },
//                 { $group: { _id: "$brand", count: { $sum: 1 } } }
//             ]),
//             Product.aggregate([
//                 { $match: baseFilter },
//                 { $group: { _id: "$category", count: { $sum: 1 } } }
//             ]),
//             Product.aggregate([
//                 { $match: baseFilter },
//                 { $unwind: "$skinTypes" },
//                 { $group: { _id: "$skinTypes", count: { $sum: 1 } } }
//             ]),
//             Product.aggregate([
//                 { $match: { ...baseFilter, formulation: { $ne: null } } },
//                 { $group: { _id: "$formulation", count: { $sum: 1 } } } // ❌ remove $toString
//             ])
//         ]);

//         // 6️⃣ --- Map counts
//         const mapCounts = arr => Object.fromEntries(arr.map(i => [String(i._id), i.count]));

//         const brandCountMap = mapCounts(brandCounts);
//         const categoryCountMap = mapCounts(categoryCounts);
//         const skinTypeCountMap = mapCounts(skinTypeCounts);
//         const formulationCountMap = mapCounts(formulationCounts);

//         // 7️⃣ --- Build a merged formulation list
//         const productFormulationIds = Object.keys(formulationCountMap);

//         const allFormulationsMap = {};
//         formulations.forEach(f => { allFormulationsMap[f._id.toString()] = f; });

//         const mergedFormulations = productFormulationIds.map(fid => {
//             const f = allFormulationsMap[fid];
//             return {
//                 _id: fid,
//                 name: f ? f.name : "Unknown Formulation",
//                 slug: f ? f.slug : "",
//                 count: formulationCountMap[fid] || 0
//             };
//         });

//         // Optional: add formulations with 0 count from master list if needed
//         formulations.forEach(f => {
//             if (!productFormulationIds.includes(f._id.toString())) {
//                 mergedFormulations.push({
//                     _id: f._id,
//                     name: f.name,
//                     slug: f.slug,
//                     count: 0
//                 });
//             }
//         });

//         // 8️⃣ --- Construct final response
//         const filtersResponse = {
//             brands: hideBrandFilter ? [] : brands.map(b => ({
//                 _id: b._id,
//                 name: b.name,
//                 slug: b.slug,
//                 count: brandCountMap[b._id?.toString()] || 0
//             })),
//             categories: hideCategoryFilter ? [] : categories.map(c => ({
//                 _id: c._id,
//                 name: c.name,
//                 slug: c.slug,
//                 count: categoryCountMap[c._id?.toString()] || 0
//             })),
//             skinTypes: hideSkinTypeFilter ? [] : skinTypes.map(s => ({
//                 _id: s._id,
//                 name: s.name,
//                 slug: s.slug,
//                 count: skinTypeCountMap[s._id?.toString()] || 0
//             })),
//             formulations: mergedFormulations,
//             priceRanges: [
//                 { label: "Rs. 0 - Rs. 499", min: 0, max: 499 },
//                 { label: "Rs. 500 - Rs. 999", min: 500, max: 999 },
//                 { label: "Rs. 1000 - Rs. 1999", min: 1000, max: 1999 },
//                 { label: "Rs. 2000 - Rs. 3999", min: 2000, max: 3999 },
//                 { label: "Rs. 4000 & Above", min: 4000, max: null }
//             ]
//         };

//         res.status(200).json({ success: true, filters: filtersResponse });

//     } catch (err) {
//         console.error("❌ getFilterMetadata error:", err);
//         res.status(500).json({ success: false, message: "Failed to load filters", error: err.message });
//     }
// };

// const toObjectId = (id) => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;

// export const normalizeFilters = (query = {}) => ({
//     search: query.search || undefined,

//     brandIds: query.brandIds
//         ? Array.isArray(query.brandIds)
//             ? query.brandIds
//             : query.brandIds.split(",")
//         : [],

//     categoryIds: query.categoryIds
//         ? Array.isArray(query.categoryIds)
//             ? query.categoryIds
//             : query.categoryIds.split(",")
//         : [],

//     skinTypes: query.skinTypes
//         ? Array.isArray(query.skinTypes)
//             ? query.skinTypes
//             : query.skinTypes.split(",")
//         : [],

//     formulations: query.formulations
//         ? Array.isArray(query.formulations)
//             ? query.formulations
//             : query.formulations.split(",")
//         : [],

//     finishes: query.finishes
//         ? Array.isArray(query.finishes)
//             ? query.finishes
//             : query.finishes.split(",")
//         : [],

//     minPrice: query.minPrice ? Number(query.minPrice) : undefined,
//     maxPrice: query.maxPrice ? Number(query.maxPrice) : undefined,
//     discountMin: query.discountMin ? Number(query.discountMin) : undefined,
//     ratingMin: query.ratingMin ? Number(query.ratingMin) : undefined,
// });

// export const applyDynamicFilters = async (filters = {}) => {
//     const f = { isPublished: true };

//     const resolveIds = async (Model, values) => {
//         if (!values?.length) return [];

//         // ✅ Convert valid ObjectId strings
//         const objectIds = values
//             .filter(v => mongoose.Types.ObjectId.isValid(v))
//             .map(v => new mongoose.Types.ObjectId(v));

//         // Lookup non-ObjectId strings in DB
//         const stringsToResolve = values.filter(v => !mongoose.Types.ObjectId.isValid(v));
//         let resolvedFromDB = [];
//         if (stringsToResolve.length) {
//             const query = [{ slug: { $in: stringsToResolve } }, { name: { $in: stringsToResolve } }];
//             if (Model.modelName === "Formulation") query.push({ key: { $in: stringsToResolve } });
//             const docs = await Model.find({ $or: query }).select("_id").lean();
//             resolvedFromDB = docs.map(d => d._id);
//         }

//         return [...objectIds, ...resolvedFromDB];
//     };

//     const andFilters = [];

//     // Brand
//     if (filters.brandIds?.length) {
//         const ids = await resolveIds(Brand, filters.brandIds);
//         if (ids.length) andFilters.push({ brand: { $in: ids } });
//     }

//     // Category
//     if (filters.categoryIds?.length) {
//         const ids = await resolveIds(Category, filters.categoryIds);
//         if (ids.length) andFilters.push({ category: { $in: ids } });
//     }

//     // Price
//     if (filters.minPrice || filters.maxPrice) {
//         const priceFilter = {};
//         if (filters.minPrice) priceFilter.$gte = filters.minPrice;
//         if (filters.maxPrice) priceFilter.$lte = filters.maxPrice;
//         andFilters.push({ $or: [{ price: priceFilter }, { "variants.price": priceFilter }] });
//     }

//     // SkinTypes
//     if (filters.skinTypes?.length) {
//         const ids = await resolveIds(SkinType, filters.skinTypes);
//         if (ids.length) {
//             const objectIds = ids.map(id => new mongoose.Types.ObjectId(id));
//             andFilters.push({ skinTypes: { $in: objectIds } });
//         }
//     }

//     // Formulations
//     if (filters.formulations?.length) {
//         const ids = await resolveIds(Formulation, filters.formulations);
//         if (ids.length) andFilters.push({ formulation: { $in: ids } });
//     }

//     // Finishes
//     if (filters.finishes?.length) {
//         andFilters.push({ finish: { $in: filters.finishes.map(v => new RegExp(`^${v}$`, "i")) } });
//     }

//     // Discount & Rating
//     if (filters.discountMin) andFilters.push({ discountPercent: { $gte: filters.discountMin } });
//     if (filters.ratingMin) andFilters.push({ avgRating: { $gte: filters.ratingMin } });

//     // Text search
//     if (filters.search) andFilters.push({ $text: { $search: filters.search } });

//     // Apply all filters together using $and
//     if (andFilters.length) {
//         f.$and = andFilters;
//     }
//     return f;
// };

// export const normalizeImages = (images = []) => {
//     return images.map(img =>
//         img.startsWith('http') ? img : `${process.env.BASE_URL}/${img}`
//     );
// };

// export const getAllFilteredProducts = async (req, res) => {
//     try {
//         const {
//             priceMin, priceMax, brand, category, discount,
//             preference, ingredients, benefits, concern, skinType,
//             makeupFinish, formulation, color, skinTone, gender, age,
//             conscious, shade, page = 1, limit = 12
//         } = req.query;

//         const filter = { isPublished: true };
//         let trackedCategoryId = null;

//         if (brand) filter.brand = brand;

//         if (category && category.trim() !== '') {
//             let catDoc = null;
//             if (mongoose.Types.ObjectId.isValid(category)) {
//                 catDoc = await Category.findById(category).lean();
//             } else {
//                 catDoc = await Category.findOne({ slug: category.toLowerCase() }).lean();
//             }

//             if (catDoc?._id) {
//                 trackedCategoryId = catDoc._id;
//                 const ids = await getDescendantCategoryIds(catDoc._id);
//                 const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));
//                 if (validIds.length) {
//                     filter.$or = [
//                         { categories: { $in: validIds } },
//                         { category: { $in: validIds } }
//                     ];
//                 }
//             }
//         }

//         if (color) {
//             filter.$or = [
//                 ...(filter.$or || []),
//                 { colorOptions: { $in: [color] } },
//                 { "variants.hex": { $in: [color] } }
//             ];
//         }
//         if (shade) {
//             filter.$or = [
//                 ...(filter.$or || []),
//                 { shadeOptions: { $in: [shade] } },
//                 { "variants.shadeName": { $in: [shade] } }
//             ];
//         }

//         if (priceMin || priceMax) {
//             filter.price = {};
//             if (priceMin) filter.price.$gte = Number(priceMin);
//             if (priceMax) filter.price.$lte = Number(priceMax);
//         }

//         const tagFilters = [
//             skinType, formulation, makeupFinish, benefits, concern,
//             skinTone, gender, age, conscious, preference, ingredients, discount
//         ].filter(Boolean);
//         if (tagFilters.length > 0) filter.productTags = { $all: tagFilters };

//         const currentPage = Number(page);
//         const perPage = Number(limit);
//         const skip = (currentPage - 1) * perPage;

//         const total = await Product.countDocuments(filter);

//         const products = await Product.find(filter)
//             .sort({ createdAt: -1 })
//             .skip(skip)
//             .limit(perPage)
//             .select("name variant price brand category summary description status images commentsCount avgRating variants shadeOptions colorOptions")
//             .lean();

//         if (req.user && req.user.id && trackedCategoryId) {
//             await User.findByIdAndUpdate(req.user.id, {
//                 $push: {
//                     recentCategories: { $each: [trackedCategoryId], $position: 0, $slice: 20 }
//                 }
//             });
//         }

//         const categoryIds = [...new Set(products.map(p => p.category).filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => String(id)))];

//         const categoryMap = categoryIds.length
//             ? new Map((await Category.find({ _id: { $in: categoryIds } }).select('name slug').lean()).map(c => [String(c._id), c]))
//             : new Map();

//         const cards = products.map(p => {
//             const { shadeOptions, colorOptions } = buildOptions(p);
//             return {
//                 _id: p._id,
//                 name: p.name,
//                 variant: p.variant,
//                 price: p.price,
//                 brand: p.brand,
//                 category: mongoose.Types.ObjectId.isValid(p.category) ? categoryMap.get(String(p.category)) || null : null,
//                 summary: p.summary || p.description?.slice(0, 100) || '',
//                 status: p.status,
//                 image: p.images?.length > 0 ? normalizeImages([p.images[0]])[0] : null,
//                 shadeOptions,
//                 colorOptions,
//                 commentsCount: p.commentsCount || 0,
//                 avgRating: p.avgRating || 0
//             };
//         });

//         const totalPages = Math.ceil(total / perPage);

//         // 🔥 Attach trending recommendations
//         const trending = await getRecommendations({ mode: "trending", limit: 6 });

//         res.status(200).json({
//             products: cards,
//             total,
//             currentPage,
//             totalPages,
//             hasMore: currentPage < totalPages,
//             nextPage: currentPage < totalPages ? currentPage + 1 : null,
//             prevPage: currentPage > 1 ? currentPage - 1 : null,
//             recommendations: trending.products || []
//         });

//     } catch (err) {
//         console.error('❌ Filter error:', err);
//         res.status(500).json({ message: 'Server error', error: err.message });
//     }
// };

// export const getProductsByCategory = async (req, res) => {
//     try {
//         const slug = req.params.slug.toLowerCase();
//         let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;
//         page = Number(page) || 1;
//         limit = Number(limit) || 12;

//         // Convert filters to arrays if needed
//         ["skinTypes", "brandIds", "formulations", "finishes"].forEach(key => {
//             if (queryFilters[key] && typeof queryFilters[key] === "string") {
//                 queryFilters[key] = [queryFilters[key]];
//             }
//         });

//         // 1️⃣ Find category
//         const category = mongoose.Types.ObjectId.isValid(slug)
//             ? await Category.findById(slug).select("name slug bannerImage thumbnailImage ancestors").lean()
//             : await Category.findOne({ slug }).select("name slug bannerImage thumbnailImage ancestors").lean();

//         if (!category)
//             return res.status(404).json({ message: "Category not found" });

//         // 2️⃣ Track user’s recent categories
//         if (req.user?.id) {
//             await User.findByIdAndUpdate(req.user.id, { $pull: { recentCategories: category._id } });
//             await User.findByIdAndUpdate(req.user.id, {
//                 $push: { recentCategories: { $each: [category._id], $position: 0, $slice: 20 } },
//             });
//         }

//         // 3️⃣ Descendants
//         const descendantIds = (await getDescendantCategoryIds(category._id))
//             .filter(id => mongoose.Types.ObjectId.isValid(id))
//             .map(id => new mongoose.Types.ObjectId(id));
//         descendantIds.push(category._id);

//         // 4️⃣ Filters
//         const filters = normalizeFilters(queryFilters);
//         filters.categoryIds = descendantIds.map(id => id.toString());
//         const finalFilter = await applyDynamicFilters(filters);
//         finalFilter.isPublished = true;

//         // 5️⃣ Sorting
//         const sortOptions = {
//             recent: { createdAt: -1 },
//             priceLowToHigh: { price: 1 },
//             priceHighToLow: { price: -1 },
//             rating: { avgRating: -1 },
//         };

//         // 6️⃣ Fetch products (include all needed fields & relations)
//         const total = await Product.countDocuments(finalFilter);
//         const products = await Product.find(finalFilter)
//             .populate("brand", "name slug isActive") // ✅ brand
//             .populate("category", "name slug") // ✅ category
//             .populate("skinTypes", "name slug isActive") // ✅ skin types
//             .populate("formulation", "name slug isActive") // ✅ formulation
//             .sort(sortOptions[sort] || { createdAt: -1 })
//             .skip((page - 1) * limit)
//             .limit(limit)
//             .lean();

//         if (!products.length) {
//             const msg = queryFilters.search
//                 ? `No products found matching “${queryFilters.search}” in this category.`
//                 : (filters.minPrice || filters.maxPrice || filters.brandIds?.length)
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

//         // 7️⃣ Active promotions
//         const now = new Date();
//         const promotions = await Promotion.find({
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now },
//         }).lean();

//         // 8️⃣ Enrich products
//         const enrichedProducts = await enrichProductsUnified(products, promotions);

//         // 9️⃣ Stock messages
//         const enrichedWithStockMsg = enrichedProducts.map(prod => {
//             if (Array.isArray(prod.variants) && prod.variants.length) {
//                 prod.variants = prod.variants.map(v => {
//                     const vStock = v.stock ?? 0;
//                     if (vStock <= 0) v.stockMessage = "⛔ Currently out of stock — check back soon!";
//                     else if (vStock === 1) v.stockMessage = "🔥 Almost gone! Only 1 left in stock.";
//                     else if (vStock <= 3) v.stockMessage = `⚡ Hurry! Just ${vStock} piece${vStock > 1 ? "s" : ""} remaining.`;
//                     else if (vStock < 10) v.stockMessage = `💨 Only a few left — ${vStock} available!`;
//                     else v.stockMessage = null;
//                     return v;
//                 });
//             }
//             return prod;
//         });

//         // 🔟 Ensure slug exists
//         const { generateUniqueSlug } = await import("../../middlewares/utils/slug.js");
//         for (const prod of enrichedWithStockMsg) {
//             if (!prod.slug) {
//                 const newSlug = await generateUniqueSlug(Product, prod.name);
//                 await Product.findByIdAndUpdate(prod._id, { slug: newSlug });
//                 prod.slug = newSlug;
//             }
//         }

//         // 11️⃣ Reattach relations (to ensure they persist)
//         const productsWithRelations = enrichedWithStockMsg.map((prod, i) => ({
//             ...prod,
//             brand: products[i].brand || null,
//             category: products[i].category || null,
//             skinTypes: products[i].skinTypes || [],
//             formulation: products[i].formulation || null,
//         }));

//         // 12️⃣ Breadcrumbs
//         let ancestors = [];
//         if (Array.isArray(category.ancestors) && category.ancestors.length) {
//             const ancestorDocs = await Category.find({ _id: { $in: category.ancestors } })
//                 .select("name slug")
//                 .lean();
//             ancestors = category.ancestors
//                 .map(id => ancestorDocs.find(a => String(a._id) === String(id)))
//                 .filter(Boolean);
//         }

//         // ✅ 13️⃣ Final response
//         return res.status(200).json({
//             category,
//             breadcrumb: ancestors,
//             products: productsWithRelations.map(p => ({
//                 ...p,
//                 slug: p.slug,
//             })),
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
//         return res.status(500).json({
//             message: "Oops! Something went wrong while fetching products. Please try again.",
//         });
//     }
// };

// export const getSingleProduct = async (req, res) => {
//     try {
//         const { idOrSlug } = req.params; // ✅ works for both slug or id
//         const selectedSku = req.query.variant; // optional

//         // 🧩 Detect whether it's an ObjectId or slug
//         const query = mongoose.Types.ObjectId.isValid(idOrSlug)
//             ? { _id: idOrSlug }
//             : { slug: idOrSlug };

//         // 1️⃣ Find product + increment views
//         const product = await Product.findOneAndUpdate(
//             { ...query, isPublished: true },
//             { $inc: { views: 1 } },
//             { new: true, lean: true }
//         );

//         if (!product) {
//             return res.status(404).json({
//                 message: "❌ Product not found or may have been removed.",
//             });
//         }

//         // 2️⃣ Fetch active promotions
//         const now = new Date();
//         const promotions = await Promotion.find({
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now },
//         }).lean();

//         // 3️⃣ Enrich product data (using your existing helper)
//         const enrichedProduct = await enrichProductsUnified(product, promotions, {
//             selectedSku,
//         });

//         // 4️⃣ Handle per-variant stock messages (same logic, cleaned)
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

//         // 5️⃣ Generate recommendations
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

//         // 6️⃣ Final clean response
//         return res.status(200).json({
//             _id: enrichedProduct._id,
//             name: enrichedProduct.name,
//             slug: enrichedProduct.slug, // ✅ include slug in response
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
//             error: err.message,
//         });
//     }
// };

// export const getTopSellingProducts = async (req, res) => {
//     try {
//         const topProducts = await Product.find({ isPublished: true })  // 👈 filter
//             .sort({ sales: -1 })
//             .limit(10)
//             .select("name images variants shadeOptions colorOptions")
//             .lean();

//         res.status(200).json({
//             success: true,
//             products: topProducts.map(p => {
//                 const shadeOptions = (p.variants?.length > 0)
//                     ? p.variants.map(v => v.shadeName).filter(Boolean)
//                     : (p.shadeOptions || []);
//                 const colorOptions = (p.variants?.length > 0)
//                     ? p.variants.map(v => v.hex).filter(Boolean)
//                     : (p.colorOptions || []);

//                 return {
//                     _id: p._id,
//                     name: p.name,
//                     image: p.image || (p.images?.[0] || null),
//                     shadeOptions,
//                     colorOptions
//                 };
//             })
//         });
//     } catch (error) {
//         console.error("🔥 Failed to fetch top sellers:", error);
//         res.status(500).json({
//             success: false,
//             message: "Failed to fetch top selling products",
//             error: error.message
//         });
//     }
// };

// export const getProductWithRelated = async (req, res) => {
//     try {
//         const product = await Product.findOne({ _id: req.params.id, isPublished: true })
//             .populate("category")
//             .lean();

//         if (!product) {
//             return res.status(404).json({ success: false, message: "Product not found" });
//         }

//         // Normalize shades + colors from variants
//         let shadeOptions = [];
//         let colorOptions = [];
//         if (Array.isArray(product.variants) && product.variants.length > 0) {
//             shadeOptions = product.variants.map(v => v.shadeName).filter(Boolean);
//             colorOptions = product.variants.map(v => v.hex).filter(Boolean);
//         } else {
//             shadeOptions = product.shadeOptions || [];
//             colorOptions = product.colorOptions || [];
//         }

//         const responseProduct = {
//             ...product,
//             image: product.image || (product.images?.[0] || null),
//             shadeOptions,
//             colorOptions,
//         };

//         res.status(200).json({
//             success: true,
//             product: responseProduct
//         });
//     } catch (error) {
//         console.error("🔥 Failed to fetch product:", error);
//         res.status(500).json({
//             success: false,
//             message: "Failed to fetch product",
//             error: error.message
//         });
//     }
// };

// export const getTopCategories = async (req, res) => {
//     try {
//         const BASE_SLUGS = ['lips', 'eyes', 'face', 'skin'];

//         // 1️⃣ Get base categories
//         const baseCategories = await Category.find({ slug: { $in: BASE_SLUGS } })
//             .select('name slug thumbnailImage')
//             .lean();

//         // 2️⃣ Aggregate orders to get top-selling categories
//         const topFromOrders = await Order.aggregate([
//             { $unwind: "$items" },
//             {
//                 $lookup: {
//                     from: "products",
//                     localField: "items.productId",
//                     foreignField: "_id",
//                     as: "product"
//                 }
//             },
//             { $unwind: "$product" },
//             {
//                 $group: {
//                     _id: "$product.category",
//                     totalOrders: { $sum: "$items.qty" }
//                 }
//             },
//             { $sort: { totalOrders: -1 } },
//             { $limit: 10 } // get more than needed in case some are duplicates
//         ]);

//         const orderedCategoryIds = topFromOrders.map(o => o._id);

//         // 3️⃣ Get category docs for ordered categories
//         const orderedCategories = await Category.find({ _id: { $in: orderedCategoryIds } })
//             .select("name slug thumbnailImage")
//             .lean();

//         // 4️⃣ Merge base + dynamic categories (avoid duplicate slugs)
//         const mergedMap = new Map();

//         baseCategories.forEach(c => {
//             mergedMap.set(c.slug, {
//                 _id: c._id,
//                 name: c.name,
//                 slug: c.slug,
//                 image: c.thumbnailImage || null,
//                 _sortValue: 0
//             });
//         });

//         orderedCategories.forEach(c => {
//             const totalOrders = topFromOrders.find(o => String(o._id) === String(c._id))?.totalOrders || 0;
//             mergedMap.set(c.slug, {
//                 _id: c._id,
//                 name: c.name,
//                 slug: c.slug,
//                 image: c.thumbnailImage || null,
//                 _sortValue: totalOrders
//             });
//         });

//         // 5️⃣ Sort by totalOrders and limit to top 6
//         const result = Array.from(mergedMap.values())
//             .sort((a, b) => b._sortValue - a._sortValue)
//             .slice(0, 6)
//             .map(({ _sortValue, ...rest }) => rest); // remove _sortValue from final result

//         res.status(200).json({
//             success: true,
//             categories: result
//         });

//     } catch (err) {
//         console.error("🔥 Failed to fetch top categories:", err);
//         res.status(500).json({
//             success: false,
//             message: "Failed to fetch top categories",
//             error: err.message
//         });
//     }
// };

// export const getAllSkinTypes = async (req, res) => {
//     try {
//         const { q = "", isActive, page = 1, limit = 20 } = req.query;
//         const filters = { isDeleted: false };

//         if (q) filters.name = { $regex: q, $options: "i" };
//         if (typeof isActive !== "undefined") filters.isActive = isActive === "true";

//         const pg = Math.max(parseInt(page, 10) || 1, 1);
//         const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

//         const pipeline = [
//             { $match: filters },
//             {
//                 $lookup: {
//                     from: "products",
//                     let: { sid: "$_id" },
//                     pipeline: [
//                         {
//                             $match: {
//                                 $expr: { $in: ["$$sid", { $ifNull: ["$skinTypes", []] }] },
//                                 isDeleted: { $ne: true }
//                             }
//                         },
//                         { $count: "count" },
//                     ],
//                     as: "stats",
//                 },
//             },
//             {
//                 $addFields: {
//                     productCount: {
//                         $ifNull: [{ $arrayElemAt: ["$stats.count", 0] }, 0]
//                     }
//                 }
//             },
//             { $project: { stats: 0 } },
//             { $sort: { name: 1 } },
//             { $skip: (pg - 1) * lim },
//             { $limit: lim },
//         ];

//         const [rows, total] = await Promise.all([
//             SkinType.aggregate(pipeline),
//             SkinType.countDocuments(filters),
//         ]);

//         return res.json({
//             success: true,
//             data: rows,
//             pagination: { page: pg, limit: lim, total }
//         });
//     } catch (err) {
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };

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
//         if (!skinType)
//             return res
//                 .status(404)
//                 .json({ message: "❌ Skin type not found or may have been removed." });

//         // 🔹 Normalize filters
//         const filters = normalizeFilters(queryFilters);
//         filters.skinTypes = [skinType._id.toString()];

//         // 🔹 Apply category-wise filtering
//         if (filters.categorySlugs?.length) {
//             const categoryDocs = await Category.find({
//                 slug: { $in: filters.categorySlugs.map((s) => s.toLowerCase()) },
//                 isActive: true,
//             })
//                 .select("_id")
//                 .lean();
//             filters.categoryIds = categoryDocs.map((c) => c._id.toString());
//         }

//         // 🔹 Apply dynamic filters (includes brand, price range, search, etc.)
//         const finalFilter = await applyDynamicFilters(filters);
//         finalFilter.isPublished = true;

//         // 🔹 Sorting options
//         const sortOptions = {
//             recent: { createdAt: -1 },
//             priceLowToHigh: { price: 1 },
//             priceHighToLow: { price: -1 },
//             rating: { avgRating: -1 },
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
//             endDate: { $gte: now },
//         }).lean();

//         // 🔹 Enrich products (discounts, stock, etc.)
//         const enrichedProducts = await enrichProductsUnified(products, promotions);

//         // 🩷 Add user-friendly stock messages (like in category & single product)
//         const enrichedWithStockMsg = enrichedProducts.map((prod) => {
//             if (Array.isArray(prod.variants) && prod.variants.length) {
//                 prod.variants = prod.variants.map((v) => {
//                     const vStock = v.stock ?? 0;
//                     if (vStock <= 0) {
//                         v.stockMessage = "Out of stock";
//                     } else if (vStock === 1) {
//                         v.stockMessage = "🔥 Only 1 left!";
//                     } else if (vStock <= 3) {
//                         v.stockMessage = `⚡ Just ${vStock} left — selling fast!`;
//                     } else if (vStock < 10) {
//                         v.stockMessage = `💨 Few left (${vStock} in stock)`;
//                     } else {
//                         v.stockMessage = null;
//                     }
//                     return v;
//                 });
//             }

//             return prod;
//         });

//         // ✅ Reattach relations to ensure population consistency
//         const productsWithRelations = enrichedWithStockMsg.map((prod, i) => ({
//             ...prod,
//             category: products[i].category || null,
//             formulation: products[i].formulation || null,
//             skinTypes: products[i].skinTypes || [],
//             brand: products[i].brand || null,
//         }));

//         // 🔹 Derive unique categories for filter options
//         const uniqueCategoryIds = await Product.distinct("category", {
//             skinTypes: skinType._id,
//             isPublished: true,
//         });
//         const categories = await Category.find({
//             _id: { $in: uniqueCategoryIds },
//             isActive: true,
//         })
//             .select("name slug")
//             .lean();

//         // 🔹 Prepare response message
//         const message = products.length
//             ? `✨ Showing curated products specially for ${skinType.name} skin type.`
//             : `😔 No products available for ${skinType.name} skin type right now — we're adding new ones soon!`;

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
//                 hasMore: page < Math.ceil(total / limit),
//             },
//             message,
//         });
//     } catch (err) {
//         console.error("🔥 Error in getProductsBySkinType:", err);
//         res.status(500).json({
//             success: false,
//             message: "🚫 Oops! Something went wrong while fetching products for this skin type. Please try again later.",
//             error: err.message,
//         });
//     }
// };

// export const getProductDetail = async (req, res) => {
//     try {
//         const { id } = req.params;

//         // 🔹 Fetch product
//         const product = await Product.findOne({ _id: id, isPublished: true }).lean();
//         if (!product) return res.status(404).json({ success: false, message: "Product not found" });

//         // 🔹 Track user product view
//         if (req.user && req.user._id) {
//             await ProductViewLog.create({
//                 userId: req.user._id,
//                 productId: id,
//             });
//         }

//         // 🔹 Get product recommendations
//         const [moreLikeThis, alsoViewed, boughtTogether] = await Promise.all([
//             getRecommendations({ mode: "moreLikeThis", productId: product._id, limit: 6 }),
//             getRecommendations({ mode: "alsoViewed", productId: product._id, limit: 6 }),
//             getRecommendations({ mode: "boughtTogether", productId: product._id, limit: 6 })
//         ]);

//         // 🔹 Format product for frontend
//         const formattedProduct = await formatProductCard(product);

//         res.json({
//             success: true,
//             product: formattedProduct,
//             recommendations: {
//                 moreLikeThis: moreLikeThis.products || [],
//                 alsoViewed: alsoViewed.products || [],
//                 boughtTogether: boughtTogether.products || []
//             }
//         });

//     } catch (err) {
//         console.error("❌ getProductDetail error:", err);
//         res.status(500).json({ success: false, message: "Server error" });
//     }
// };



import Product from '../../models/Product.js';
import ProductViewLog from "../../models/ProductViewLog.js";
import Promotion from '../../models/Promotion.js';
import User from '../../models/User.js';
import UserActivity from '../../models/UserActivity.js';
import Order from '../../models/Order.js';
import Brand from '../../models/Brand.js';
import SkinType from '../../models/SkinType.js';
import Formulation from "../../models/shade/Formulation.js";
import Category from '../../models/Category.js';
import { getDescendantCategoryIds } from '../../middlewares/utils/categoryUtils.js';
import { getRecommendations, getTrendingProducts } from '../../middlewares/utils/recommendationService.js';
import { getRedis } from '../../middlewares/utils/redis.js';
import { PRODUCT_CACHE_VERSION } from '../../middlewares/utils/cacheUtils.js';
import { enrichProductsUnified } from "../../middlewares/services/productHelpers.js";
import mongoose from 'mongoose';
import { getEnrichedProductsByIds } from "../../controllers/user/recommendationController.js";


let _promoCache = { ts: 0, data: null, ttl: 5000 }; // ttl in ms (5s)

const sortConfig = {
    recent: { field: "_id", order: -1 },
    priceLowToHigh: { field: "minPrice", order: 1 },
    priceHighToLow: { field: "maxPrice", order: -1 },
    rating: { field: "avgRating", order: -1 },
    discount: { field: "discountPercent", order: -1 }
};


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
        const redis = getRedis();  // 🔥 REQUIRED
        const redisKey = `filters:${JSON.stringify(req.query)}`;
        const cached = await redis.get(redisKey);
        if (cached) {
            return res.status(200).json(JSON.parse(cached));
        }

        // 1️⃣ --- Fetch master data (FAST + LEAN)
        const [brands, categories, skinTypes, formulations] = await Promise.all([
            Brand.find({ isActive: true }).select("_id name slug").lean(),
            Category.find({ isActive: true }).select("_id name slug").lean(),
            SkinType.find({ isDeleted: false }).select("_id name slug").lean(),
            Formulation.find({}).select("_id name slug").lean()
        ]);

        // 2️⃣ --- Normalize filters
        const filters = normalizeFilters(req.query);

        // 3️⃣ --- Hide filters by context
        const hideCategoryFilter = !!req.params.categorySlug;
        const hideBrandFilter = !!req.params.brandSlug;
        const hideSkinTypeFilter = !!req.params.skinSlug;

        // 4️⃣ --- Build base query
        const baseFilter = await applyDynamicFilters(filters);
        baseFilter.isPublished = true;

        // 5️⃣ --- Aggregations (optimized)
        const aggregationMatch = [{ $match: baseFilter }];

        const [
            brandCounts,
            categoryCounts,
            skinTypeCounts,
            formulationCounts
        ] = await Promise.all([
            Product.aggregate([...aggregationMatch, { $group: { _id: "$brand", count: { $sum: 1 } } }]),
            Product.aggregate([...aggregationMatch, { $group: { _id: "$category", count: { $sum: 1 } } }]),
            Product.aggregate([
                ...aggregationMatch,
                { $unwind: "$skinTypes" },
                { $group: { _id: "$skinTypes", count: { $sum: 1 } } }
            ]),
            Product.aggregate([
                { $match: { ...baseFilter, formulation: { $ne: null } } },
                { $group: { _id: "$formulation", count: { $sum: 1 } } }
            ])
        ]);

        // 6️⃣ Map counts fast
        const brandCountMap = Object.fromEntries(brandCounts.map(i => [String(i._id), i.count]));
        const categoryCountMap = Object.fromEntries(categoryCounts.map(i => [String(i._id), i.count]));
        const skinTypeCountMap = Object.fromEntries(skinTypeCounts.map(i => [String(i._id), i.count]));
        const formulationCountMap = Object.fromEntries(formulationCounts.map(i => [String(i._id), i.count]));

        // 7️⃣ Merge formulations (optimized)
        const allFormulationsMap = Object.fromEntries(
            formulations.map(f => [f._id.toString(), f])
        );

        const mergedFormulations = [
            // formulations present in products
            ...Object.keys(formulationCountMap).map(fid => {
                const f = allFormulationsMap[fid];
                return {
                    _id: fid,
                    name: f ? f.name : "Unknown Formulation",
                    slug: f ? f.slug : "",
                    count: formulationCountMap[fid]
                };
            }),
            // formulations with zero count
            ...formulations
                .filter(f => !formulationCountMap[f._id.toString()])
                .map(f => ({
                    _id: f._id,
                    name: f.name,
                    slug: f.slug,
                    count: 0
                }))
        ];

        // 8️⃣ Final response (NO CHANGE)
        const filtersResponse = {
            brands: hideBrandFilter
                ? []
                : brands.map(b => ({
                    _id: b._id,
                    name: b.name,
                    slug: b.slug,
                    count: brandCountMap[b._id.toString()] || 0
                })),

            categories: hideCategoryFilter
                ? []
                : categories.map(c => ({
                    _id: c._id,
                    name: c.name,
                    slug: c.slug,
                    count: categoryCountMap[c._id.toString()] || 0
                })),

            skinTypes: hideSkinTypeFilter
                ? []
                : skinTypes.map(s => ({
                    _id: s._id,
                    name: s.name,
                    slug: s.slug,
                    count: skinTypeCountMap[s._id.toString()] || 0
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

        await redis.set(redisKey, JSON.stringify({
            success: true,
            filters: filtersResponse
        }), "EX", 120);

        res.status(200).json({ success: true, filters: filtersResponse });

    } catch (err) {
        console.error("❌ getFilterMetadata error:", err);
        res.status(500).json({ success: false, message: "Failed to load filters", error: err.message });
    }
};

const toObjectId = (id) => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;

export const normalizeFilters = (query = {}) => {
    const normalizeList = (val) =>
        !val ? [] : Array.isArray(val) ? val : val.split(",");

    return {
        search: query.search || undefined,

        brandIds: normalizeList(query.brandIds),
        categoryIds: normalizeList(query.categoryIds),
        skinTypes: normalizeList(query.skinTypes),
        formulations: normalizeList(query.formulations),
        finishes: normalizeList(query.finishes),

        minPrice: query.minPrice ? Number(query.minPrice) : undefined,
        maxPrice: query.maxPrice ? Number(query.maxPrice) : undefined,
        discountMin: query.discountMin ? Number(query.discountMin) : undefined,
        ratingMin: query.ratingMin ? Number(query.ratingMin) : undefined
    };
};

export const applyDynamicFilters = async (filters = {}) => {
    const f = { isPublished: true };

    // ⚡ FAST helper to convert/resolve IDs & slugs/names
    const resolveIds = async (Model, values) => {
        if (!values?.length) return [];

        const ids = [];
        const stringsToResolve = [];

        // Split valid ObjectIds vs slugs/names
        for (const v of values) {
            if (mongoose.Types.ObjectId.isValid(v)) {
                ids.push(new mongoose.Types.ObjectId(v));
            } else {
                stringsToResolve.push(v);
            }
        }

        // Resolve strings → DB only once
        if (stringsToResolve.length) {
            const orQuery = [
                { slug: { $in: stringsToResolve } },
                { name: { $in: stringsToResolve } }
            ];

            // Formulation supports `key`
            if (Model.modelName === "Formulation") {
                orQuery.push({ key: { $in: stringsToResolve } });
            }

            const docs = await Model.find({ $or: orQuery }).select("_id").lean();
            for (const d of docs) ids.push(d._id);
        }

        return ids;
    };

    const andFilters = [];

    // Brand filter
    if (filters.brandIds?.length) {
        const ids = await resolveIds(Brand, filters.brandIds);
        if (ids.length) andFilters.push({ brand: { $in: ids } });
    }

    // Category filter
    if (filters.categoryIds?.length) {
        const ids = await resolveIds(Category, filters.categoryIds);
        if (ids.length) andFilters.push({ category: { $in: ids } });
    }

    // Price filter
    if (filters.minPrice || filters.maxPrice) {
        const price = {};
        if (filters.minPrice) price.$gte = filters.minPrice;
        if (filters.maxPrice) price.$lte = filters.maxPrice;

        andFilters.push({
            $or: [
                { price },
                { "variants.price": price }
            ]
        });
    }

    // SkinTypes
    if (filters.skinTypes?.length) {
        const ids = await resolveIds(SkinType, filters.skinTypes);
        if (ids.length) andFilters.push({ skinTypes: { $in: ids } });
    }

    // Formulation
    if (filters.formulations?.length) {
        const ids = await resolveIds(Formulation, filters.formulations);
        if (ids.length) andFilters.push({ formulation: { $in: ids } });
    }

    // Finish filter (case-insensitive)
    if (filters.finishes?.length) {
        const regexList = filters.finishes.map((v) => new RegExp(`^${v}$`, "i"));
        andFilters.push({ finish: { $in: regexList } });
    }

    // Discount + rating
    if (filters.discountMin) andFilters.push({ discountPercent: { $gte: filters.discountMin } });
    if (filters.ratingMin) andFilters.push({ avgRating: { $gte: filters.ratingMin } });

    // Search text
    if (filters.search) {
        andFilters.push({ $text: { $search: filters.search } });
    }

    // Apply all filters
    if (andFilters.length) f.$and = andFilters;

    return f;
};

export const normalizeImages = (images = []) => {
    return images.map(img =>
        img.startsWith('http') ? img : `${process.env.BASE_URL}/${img}`
    );
};

// export const getAllProducts = async (req, res) => {
//     try {
//         const redis = getRedis(); // 🔥 REQUIRED

//         /* -------------------------------
//            🔹 Pagination + Sorting + Filters
//         -------------------------------- */
//         let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;

//         page = Number(page) || 1;
//         limit = Math.min(Number(limit) || 12, 50);

//         // Convert comma-fields → arrays
//         ["skinTypes", "brandIds", "formulations", "finishes"].forEach(key => {
//             const val = queryFilters[key];
//             if (val && typeof val === "string") {
//                 queryFilters[key] = [val];
//             }
//         });

//         // 🔹 Normalize dynamic filters
//         const filters = normalizeFilters(queryFilters);

//         /* -------------------------------
//            🔹 Resolve Brand filters
//         -------------------------------- */
//         if (filters.brandIds?.length) {
//             const brandDocs = await Brand.find({
//                 $or: [
//                     { _id: { $in: filters.brandIds.filter(v => mongoose.Types.ObjectId.isValid(v)) } },
//                     { slug: { $in: filters.brandIds.filter(v => !mongoose.Types.ObjectId.isValid(v)) } }
//                 ],
//                 isActive: true
//             }).select("_id");

//             filters.brandIds = brandDocs.map(b => b._id);
//         }

//         /* -------------------------------
//            🔹 Resolve SkinTypes
//         -------------------------------- */
//         if (filters.skinTypes?.length) {
//             const skinDocs = await SkinType.find({
//                 name: { $in: filters.skinTypes.map(v => new RegExp(`^${v}$`, "i")) }
//             }).select("_id");

//             filters.skinTypes = skinDocs.map(s => s._id);
//         }

//         /* -------------------------------
//            🔹 Final Mongo Filter
//         -------------------------------- */
//         const finalFilter = await applyDynamicFilters(filters);
//         finalFilter.isPublished = true;

//         /* -------------------------------
//            🔹 Build Redis Cache Key (FIXED)
//         -------------------------------- */
//         const redisKey = `allProducts:${page}:${limit}:${sort}:${JSON.stringify(finalFilter)}`;

//         const cached = await redis.get(redisKey);
//         if (cached) {
//             return res.status(200).json(JSON.parse(cached));
//         }

//         /* -------------------------------
//            🔹 Sorting (FIXED for variants)
//         -------------------------------- */
//         const sortOptions = {
//             recent: { createdAt: -1 },
//             priceLowToHigh: { minPrice: 1 },
//             priceHighToLow: { maxPrice: -1 },
//             rating: { avgRating: -1 },
//             discount: { discountPercent: -1 }
//         };

//         /* -------------------------------
//            🔹 Count + Query
//         -------------------------------- */
//         const total = await Product.countDocuments(finalFilter);

//         const products = await Product.find(finalFilter)
//             .populate("brand", "name slug logo isActive")
//             .populate("category", "name slug")
//             .populate("skinTypes", "name slug")
//             .populate("formulation", "name slug")
//             .sort(sortOptions[sort] || sortOptions.recent)
//             .skip((page - 1) * limit)
//             .limit(limit)
//             .lean();

//         if (!products.length) {
//             return res.status(200).json({
//                 products: [],
//                 categories: [],
//                 brands: [],
//                 pagination: {
//                     page,
//                     limit,
//                     total: 0,
//                     totalPages: 0,
//                     hasMore: false,
//                     nextPage: null
//                 },
//                 message: "No products found with selected filters."
//             });
//         }

//         /* -------------------------------
//            🔹 Active Promotions
//         -------------------------------- */
//         const now = new Date();
//         const promotions = await Promotion.find({
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now }
//         }).lean();

//         /* -------------------------------
//            🔹 Enrich Products
//         -------------------------------- */
//         const enrichedProducts = await enrichProductsUnified(products, promotions);

//         const productsWithRelations = enrichedProducts.map((p, i) => ({
//             ...p,
//             brand: products[i].brand,
//             category: products[i].category,
//             skinTypes: products[i].skinTypes,
//             formulation: products[i].formulation
//         }));

//         /* -------------------------------
//            🔹 Collect Filters Data
//         -------------------------------- */
//         const [uniqueCategoryIds, uniqueBrandIds] = await Promise.all([
//             Product.distinct("category", finalFilter),
//             Product.distinct("brand", finalFilter)
//         ]);

//         const [categories, brands] = await Promise.all([
//             Category.find({ _id: { $in: uniqueCategoryIds }, isActive: true })
//                 .select("name slug")
//                 .lean(),
//             Brand.find({ _id: { $in: uniqueBrandIds }, isActive: true })
//                 .select("name slug logo")
//                 .lean()
//         ]);

//         /* -------------------------------
//            🔹 Pagination Meta (Infinite Scroll)
//         -------------------------------- */
//         const totalPages = Math.ceil(total / limit);
//         const hasMore = page < totalPages;

//         const response = {
//             products: productsWithRelations,
//             categories,
//             brands,
//             pagination: {
//                 page,
//                 limit,
//                 total,
//                 totalPages,
//                 hasMore,
//                 nextPage: hasMore ? page + 1 : null
//             },
//             message: null
//         };

//         /* -------------------------------
//            🔹 Cache Result (60s)
//         -------------------------------- */
//         await redis.set(redisKey, JSON.stringify(response), "EX", 60);

//         return res.status(200).json(response);

//     } catch (err) {
//         console.error("❌ getAllProducts error:", err);
//         return res.status(500).json({
//             message: "Failed to fetch products.",
//             error: err.message
//         });
//     }
// };

export const getAllProducts = async (req, res) => {
    try {
        const redis = getRedis();

        let {
            limit = 12,
            sort = "recent",
            cursor,
            ...queryFilters
        } = req.query;

        limit = Math.min(Number(limit) || 12, 50);

        ["skinTypes", "brandIds", "formulations", "finishes"].forEach(key => {
            if (typeof queryFilters[key] === "string") {
                queryFilters[key] = [queryFilters[key]];
            }
        });

        const filters = normalizeFilters(queryFilters);

        // Resolve brand + skinType (same as before)
        if (filters.brandIds?.length) {
            const brandDocs = await Brand.find({
                $or: [
                    { _id: { $in: filters.brandIds.filter(mongoose.Types.ObjectId.isValid) } },
                    { slug: { $in: filters.brandIds.filter(v => !mongoose.Types.ObjectId.isValid(v)) } }
                ],
                isActive: true
            }).select("_id");

            filters.brandIds = brandDocs.map(b => b._id);
        }

        if (filters.skinTypes?.length) {
            const skinDocs = await SkinType.find({
                name: { $in: filters.skinTypes.map(v => new RegExp(`^${v}$`, "i")) }
            }).select("_id");

            filters.skinTypes = skinDocs.map(s => s._id);
        }

        const finalFilter = await applyDynamicFilters(filters);
        finalFilter.isPublished = true;

        // 🔥 Cursor logic
        const { field, order } = sortConfig[sort] || sortConfig.recent;

        if (cursor) {
            finalFilter[field] = order === -1
                ? { $lt: cursor }
                : { $gt: cursor };
        }

        // 🔥 Redis cache per cursor
        const redisKey = `products:${sort}:${cursor || "first"}:${limit}:${JSON.stringify(finalFilter)}`;
        const cached = await redis.get(redisKey);
        if (cached) return res.json(JSON.parse(cached));

        // 🔥 Fetch products (limit + 1 to detect hasMore)
        const products = await Product.find(finalFilter)
            .populate("brand", "name slug logo")
            .populate("category", "name slug")
            .populate("skinTypes", "name slug")
            .populate("formulation", "name slug")
            .sort({ [field]: order })
            .limit(limit + 1)
            .lean();

        const hasMore = products.length > limit;
        if (hasMore) products.pop();

        // 🔥 Promotions
        const now = new Date();
        const promotions = await Promotion.find({
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).lean();

        const enriched = await enrichProductsUnified(products, promotions);

        const nextCursor =
            products.length > 0 ? products[products.length - 1][field] : null;

        let message = null;

        if (!enriched.length && cursor) {
            // User scrolled till end
            message = "🎉 You’ve reached the end! No more products to show.";
        }

        if (!enriched.length && !cursor) {
            // First load but no products
            message = "No products found for the selected filters.";
        }

        const response = {
            products: enriched,
            pagination: {
                hasMore,
                nextCursor
            },
            message

        };

        await redis.set(redisKey, JSON.stringify(response), "EX", 120);

        res.json(response);

    } catch (err) {
        console.error("❌ Cursor pagination error:", err);
        res.status(500).json({ message: "Failed to fetch products" });
    }
};

export const getProductsByCategory = async (req, res) => {
    try {
        const slug = req.params.slug.toLowerCase();
        const redis = getRedis();

        const redisKey = `cat:v2:${slug}:${JSON.stringify(req.query)}`;
        const cached = await redis.get(redisKey);
        if (cached) return res.json(JSON.parse(cached));

        let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;
        page = +page || 1;
        limit = +limit || 12;

        // Normalize filters
        ["skinTypes", "brandIds", "formulations", "finishes"].forEach(k => {
            if (typeof queryFilters[k] === "string") queryFilters[k] = [queryFilters[k]];
        });

        // 🔹 Category
        const category = await Category.findOne({ slug })
            .select("name slug ancestors bannerImage thumbnailImage")
            .lean();

        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }

        // 🔥 Track CATEGORY VIEW (non-blocking)
        try {
            if (req.user?._id) {
                UserActivity.create({
                    user: req.user._id,
                    type: "category_view",
                    category: category._id
                }).catch(err => console.error("Category activity log failed:", err));
            }
        } catch (err) {
            console.error("Category activity log error:", err);
        }

        // 🔹 Cached descendants
        const descKey = `cat_desc:${category._id}`;
        let categoryIds = await redis.get(descKey);

        if (!categoryIds) {
            const descendants = await getDescendantCategoryIds(category._id);
            categoryIds = [category._id, ...descendants];
            await redis.set(descKey, JSON.stringify(categoryIds), "EX", 3600);
        } else {
            categoryIds = JSON.parse(categoryIds);
        }

        // 🔹 Filters
        const filters = normalizeFilters(queryFilters);
        filters.categoryIds = categoryIds.map(String);

        const finalFilter = await applyDynamicFilters(filters);
        finalFilter.isPublished = true;

        // 🔹 Sort
        const sortMap = {
            recent: { createdAt: -1 },
            priceLowToHigh: { minPrice: 1 },
            priceHighToLow: { maxPrice: -1 },
            rating: { avgRating: -1 }
        };

        // 🔹 Products (NO writes, lean only)
        const products = await Product.find(finalFilter)
            .select("name slugs  price discountedPrice minPrice maxPrice brand category variants avgRating")
            .populate("brand", "name slug")
            .populate("category", "name slug")
            .sort(sortMap[sort] || sortMap.recent)
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        // 🔹 Promotions (cached)
        let promotions = await redis.get("active_promotions");
        if (!promotions) {
            promotions = await Promotion.find({
                status: "active",
                startDate: { $lte: new Date() },
                endDate: { $gte: new Date() }
            }).lean();
            await redis.set("active_promotions", JSON.stringify(promotions), "EX", 120);
        } else {
            promotions = JSON.parse(promotions);
        }

        const enriched = await enrichProductsUnified(products, promotions);

        const response = {
            category,
            breadcrumb: [],
            products: enriched,
            pagination: {
                page,
                limit,
                total: enriched.length,
                totalPages: Math.ceil(enriched.length / limit),
                hasMore: enriched.length === limit
            }
        };

        await redis.set(redisKey, JSON.stringify(response), "EX", 120);
        return res.json(response);

    } catch (err) {
        console.error("❌ getProductsByCategory:", err);
        return res.status(500).json({ message: "Failed to load products" });
    }
};

// export const getSingleProduct = async (req, res) => {
//     try {
//         const { idOrSlug } = req.params;
//         const variant = req.query.variant ?? "*";

//         let query;
//         let selectedVariantSlug = null;
//         let selectedSku = req.query.variant;

//         // 🔥 Redis
//         const redis = getRedis();
//         const redisKey = `prod:${PRODUCT_CACHE_VERSION}:${idOrSlug}:${variant}`;

//         const cached = await redis.get(redisKey);
//         if (cached) {
//             return res.status(200).json(JSON.parse(cached));
//         }

//         // --------------------------------------------------
//         // 🔥 Decide query (ID / Product slug / Variant slug)
//         // --------------------------------------------------
//         if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
//             query = { _id: idOrSlug };
//         } else {
//             query = {
//                 $or: [
//                     { "variants.slug": idOrSlug }, // 🔥 variant slug
//                     { slugs: { $in: [idOrSlug] } } // product slug fallback
//                 ]
//             };
//             selectedVariantSlug = idOrSlug;
//         }

//         const selectFields = [
//             "_id", "name", "slugs", "mrp", "price", "discountPercent",
//             "discountAmount", "images", "variants", "shadeOptions",
//             "brand", "category", "categorySlug", "avgRating",
//             "totalRatings", "inStock", "selectedVariant", "views",
//             "commentsCount", "productTags", "formulation", "skinTypes",
//             "createdAt", "discountedPrice", "description",
//             "howToUse", "ingredients", "features"
//         ].join(" ");

//         // --------------------------------------------------
//         // 🔥 Fetch product
//         // --------------------------------------------------
//         const product = await Product.findOneAndUpdate(
//             { ...query, isPublished: true },
//             { $inc: { views: 1 } },
//             { new: true }
//         )
//             .select(selectFields)
//             .lean();

//         if (!product) {
//             return res.status(404).json({
//                 message: "❌ Product not found or may have been removed."
//             });
//         }

//         // --------------------------------------------------
//         // 🔥 Track PRODUCT VIEW Activity Log
//         // --------------------------------------------------
//         try {
//             await UserActivity.create({
//                 user: req.user?._id || null,
//                 type: "product_view",
//                 product: product._id
//             });
//         } catch (err) {
//             console.error("Activity log failed:", err);
//         }

//         // --------------------------------------------------
//         // 🔥 AUTO-DETECT SKU FROM VARIANT SLUG (CORRECT PLACE)
//         // --------------------------------------------------
//         if (!selectedSku && selectedVariantSlug && product.variants?.length) {
//             const matchedVariant = product.variants.find(
//                 v => v.slug === selectedVariantSlug
//             );
//             if (matchedVariant) {
//                 selectedSku = matchedVariant.sku;
//             }
//         }

//         // --------------------------------------------------
//         // 🔥 Track recently viewed + USER funnel viewCount
//         // --------------------------------------------------
//         try {
//             if (req.user?._id) {
//                 await User.findByIdAndUpdate(
//                     req.user._id,
//                     [
//                         {
//                             $set: {
//                                 recentlyViewed: {
//                                     $slice: [
//                                         {
//                                             $concatArrays: [
//                                                 [{
//                                                     product: product._id,
//                                                     viewedAt: new Date()
//                                                 }],
//                                                 {
//                                                     $filter: {
//                                                         input: "$recentlyViewed",
//                                                         as: "item",
//                                                         cond: {
//                                                             $ne: ["$$item.product", product._id]
//                                                         }
//                                                     }
//                                                 }
//                                             ]
//                                         },
//                                         20
//                                     ]
//                                 }
//                             }
//                         },
//                         {
//                             // 🔥 Funnel tracking (ADMIN analytics)
//                             $set: {
//                                 "conversionStats.viewCount": {
//                                     $add: [
//                                         { $ifNull: ["$conversionStats.viewCount", 0] },
//                                         1
//                                     ]
//                                 }

//                             }
//                         }
//                     ],
//                     { upsert: false }
//                 );
//             }
//         } catch (err) {
//             console.error("Recently viewed / funnel tracking failed:", err);
//         }

//         // --------------------------------------------------
//         // 🔥 Brand
//         // --------------------------------------------------
//         let brandData = null;
//         if (product.brand) {
//             brandData = await Brand.findById(product.brand)
//                 .select("_id name")
//                 .lean();
//         }

//         // --------------------------------------------------
//         // 🔥 Promotions cache
//         // --------------------------------------------------
//         const now = Date.now();
//         if (!_promoCache.data || now - _promoCache.ts >= _promoCache.ttl) {
//             const dbNow = new Date();
//             const promos = await Promotion.find({
//                 status: "active",
//                 startDate: { $lte: dbNow },
//                 endDate: { $gte: dbNow }
//             }).lean();

//             _promoCache = { ts: now, data: promos, ttl: 5000 };
//         }

//         const promotions = _promoCache.data || [];

//         // --------------------------------------------------
//         // 🔥 Enrich product
//         // --------------------------------------------------
//         const enrichedProduct = await enrichProductsUnified(product, promotions, {
//             selectedSku
//         });

//         // --------------------------------------------------
//         // 🔥 Stock messages
//         // --------------------------------------------------
//         enrichedProduct.variants?.forEach(v => {
//             const stock = v.stock ?? 0;
//             if (stock <= 0) v.stockMessage = "⛔ Out of stock";
//             else if (stock === 1) v.stockMessage = "🔥 Only 1 left";
//             else if (stock <= 3) v.stockMessage = `⚡ Only ${stock} left`;
//         });

//         // --------------------------------------------------
//         // 🔥 Recommendations
//         // --------------------------------------------------
//         const rec = await getRecommendations({
//             mode: "alsoViewed",
//             productId: enrichedProduct._id,
//             categorySlug: enrichedProduct.categorySlug,
//             userId: req.user?._id,
//             limit: 6
//         });

//         const response = {
//             _id: enrichedProduct._id,
//             name: enrichedProduct.name,
//             slugs: enrichedProduct.slugs,
//             brand: brandData,
//             mrp: enrichedProduct.mrp,
//             variants: enrichedProduct.variants,
//             shadeOptions: enrichedProduct.shadeOptions || [],
//             avgRating: enrichedProduct.avgRating,
//             totalRatings: enrichedProduct.totalRatings,
//             selectedVariant: enrichedProduct.selectedVariant,
//             description: enrichedProduct.description,
//             howToUse: enrichedProduct.howToUse,
//             ingredients: enrichedProduct.ingredients,
//             features: enrichedProduct.features,
//             recommendations: {
//                 alsoViewed: {
//                     name: rec?.message || "alsoViewed",
//                     products: rec?.success ? rec.products : []
//                 }
//             }
//         };

//         await redis.set(redisKey, JSON.stringify(response), "EX", 30);
//         return res.status(200).json(response);

//     } catch (err) {
//         console.error("❌ getSingleProduct error:", err);
//         return res.status(500).json({
//             message: "🚫 Failed to fetch product",
//             error: err.message
//         });
//     }
// };

//the above ---> getsingleproduct code is perfect working but slow so changed in bottom code ,. as on 05-01-2026

export const getSingleProduct = async (req, res) => {
    try {
        const { idOrSlug } = req.params;
        const variant = req.query.variant ?? "*";

        let query;
        let selectedVariantSlug = null;
        let selectedSku = req.query.variant;

        // --------------------------------------------------
        // 🔥 Redis (FAST PATH)
        // --------------------------------------------------
        const redis = getRedis();
        const redisKey = `prod:${PRODUCT_CACHE_VERSION}:${idOrSlug}:${variant}`;

        const cached = await redis.get(redisKey);
        if (cached) {
            return res.status(200).json(JSON.parse(cached));
        }

        // --------------------------------------------------
        // 🔥 Decide query (ID / slug / variant slug)
        // --------------------------------------------------
        if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
            query = { _id: idOrSlug };
        } else {
            query = {
                $or: [
                    { "variants.slug": idOrSlug },
                    { slugs: { $in: [idOrSlug] } }
                ]
            };
            selectedVariantSlug = idOrSlug;
        }

        const selectFields = [
            "_id", "name", "slugs", "mrp", "price", "discountPercent",
            "discountAmount", "images", "variants", "shadeOptions",
            "brand", "category", "categorySlug", "avgRating",
            "totalRatings", "inStock", "selectedVariant", "views",
            "commentsCount", "productTags", "formulation", "skinTypes",
            "createdAt", "discountedPrice", "description",
            "howToUse", "ingredients", "features"
        ].join(" ");

        // --------------------------------------------------
        // 🔥 Fetch product (READ ONLY – FAST)
        // --------------------------------------------------
        const product = await Product.findOne({
            ...query,
            isPublished: true
        })
            .select(selectFields)
            .lean();

        if (!product) {
            return res.status(404).json({
                message: "❌ Product not found or may have been removed."
            });
        }

        // --------------------------------------------------
        // 🔥 Increment views ASYNC (NON-BLOCKING)
        // --------------------------------------------------
        setImmediate(() => {
            Product.updateOne(
                { _id: product._id },
                { $inc: { views: 1 } }
            ).catch(() => { });
        });

        // --------------------------------------------------
        // 🔥 Auto-detect SKU from variant slug
        // --------------------------------------------------
        if (!selectedSku && selectedVariantSlug && product.variants?.length) {
            const matchedVariant = product.variants.find(
                v => v.slug === selectedVariantSlug
            );
            if (matchedVariant) {
                selectedSku = matchedVariant.sku;
            }
        }

        // --------------------------------------------------
        // 🔥 Async analytics (DO NOT BLOCK RESPONSE)
        // --------------------------------------------------
        if (req.user?._id) {
            setImmediate(() => {
                UserActivity.create({
                    user: req.user._id,
                    type: "product_view",
                    product: product._id
                }).catch(() => { });

                User.findByIdAndUpdate(
                    req.user._id,
                    [
                        {
                            $set: {
                                recentlyViewed: {
                                    $slice: [
                                        {
                                            $concatArrays: [
                                                [{
                                                    product: product._id,
                                                    viewedAt: new Date()
                                                }],
                                                {
                                                    $filter: {
                                                        input: "$recentlyViewed",
                                                        as: "item",
                                                        cond: {
                                                            $ne: ["$$item.product", product._id]
                                                        }
                                                    }
                                                }
                                            ]
                                        },
                                        20
                                    ]
                                }
                            }
                        },
                        {
                            $set: {
                                "conversionStats.viewCount": {
                                    $add: [
                                        { $ifNull: ["$conversionStats.viewCount", 0] },
                                        1
                                    ]
                                }
                            }
                        }
                    ]
                ).catch(() => { });
            });
        }

        // --------------------------------------------------
        // 🔥 Brand (parallel safe)
        // --------------------------------------------------
        const brandPromise = product.brand
            ? Brand.findById(product.brand).select("_id name").lean()
            : Promise.resolve(null);

        // --------------------------------------------------
        // 🔥 Promotions (IN-MEMORY CACHE)
        // --------------------------------------------------
        const now = Date.now();
        if (!_promoCache.data || now - _promoCache.ts >= _promoCache.ttl) {
            const dbNow = new Date();
            Promotion.find({
                status: "active",
                startDate: { $lte: dbNow },
                endDate: { $gte: dbNow }
            })
                .lean()
                .then(promos => {
                    _promoCache = { data: promos, ts: Date.now(), ttl: 5000 };
                })
                .catch(() => { });
        }

        const promotions = _promoCache.data || [];

        // --------------------------------------------------
        // 🔥 Enrich product (CRITICAL)
        // --------------------------------------------------
        const enrichedProduct = await enrichProductsUnified(product, promotions, {
            selectedSku
        });

        // --------------------------------------------------
        // 🔥 Stock messages
        // --------------------------------------------------
        enrichedProduct.variants?.forEach(v => {
            const stock = v.stock ?? 0;
            if (stock <= 0) v.stockMessage = "⛔ Out of stock";
            else if (stock === 1) v.stockMessage = "🔥 Only 1 left";
            else if (stock <= 3) v.stockMessage = `⚡ Only ${stock} left`;
        });

        // --------------------------------------------------
        // 🔥 Recommendations (ASYNC – DO NOT BLOCK)
        // --------------------------------------------------
        const recommendationsPromise = getRecommendations({
            mode: "alsoViewed",
            productId: enrichedProduct._id,
            categorySlug: enrichedProduct.categorySlug,
            userId: req.user?._id,
            limit: 6
        }).catch(() => null);

        const brandData = await brandPromise;
        const rec = await recommendationsPromise;

        // --------------------------------------------------
        // 🔥 Final response (UNCHANGED STRUCTURE)
        // --------------------------------------------------
        const response = {
            _id: enrichedProduct._id,
            name: enrichedProduct.name,
            slugs: enrichedProduct.slugs,
            brand: brandData,
            mrp: enrichedProduct.mrp,
            variants: enrichedProduct.variants,
            shadeOptions: enrichedProduct.shadeOptions || [],
            avgRating: enrichedProduct.avgRating,
            totalRatings: enrichedProduct.totalRatings,
            selectedVariant: enrichedProduct.selectedVariant,
            description: enrichedProduct.description,
            howToUse: enrichedProduct.howToUse,
            ingredients: enrichedProduct.ingredients,
            features: enrichedProduct.features,
            recommendations: {
                alsoViewed: {
                    name: rec?.message || "alsoViewed",
                    products: rec?.success ? rec.products : []
                }
            }
        };

        // --------------------------------------------------
        // 🔥 Redis cache (LONGER TTL)
        // --------------------------------------------------
        await redis.set(redisKey, JSON.stringify(response), "EX", 300);

        return res.status(200).json(response);

    } catch (err) {
        console.error("❌ getSingleProduct error:", err);
        return res.status(500).json({
            message: "🚫 Failed to fetch product",
            error: err.message
        });
    }
};

export const getTopSellingProducts = async (req, res) => {
    try {
        const redis = getRedis();
        const cacheKey = "top-selling:v2";

        // 1️⃣ Redis cache
        const cached = await redis.get(cacheKey);
        if (cached) {
            return res.json(JSON.parse(cached));
        }

        // 2️⃣ Use SAME LOGIC as before
        const trendingProducts = await getTrendingProducts(10);

        // 3️⃣ Extract ONLY IDs (IMPORTANT)
        const ids = trendingProducts.map(p => p._id);

        // 4️⃣ SAME enrichment as homepage
        const enrichedProducts = await getEnrichedProductsByIds(
            ids,
            "top-selling"
        );

        const response = {
            success: true,
            products: enrichedProducts
        };

        // 5️⃣ Cache final response
        await redis.set(cacheKey, JSON.stringify(response), "EX", 120);

        return res.status(200).json(response);

    } catch (error) {
        console.error("🔥 Failed to fetch top sellers:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch top selling products"
        });
    }
};

export const getTopCategories = async (req, res) => {
    try {
        const categories = await Category.find({
            isTopCategory: true,
            isActive: true
        })
            .sort({ topCategoryOrder: 1 })   // 🔥 THIS IS MANDATORY
            .select("name slug thumbnailImage")
            .lean();

        return res.status(200).json({
            success: true,
            categories
        });

    } catch (err) {
        console.error("🔥 Failed to fetch top categories:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch top categories",
            error: err.message
        });
    }
};

export const getAllSkinTypes = async (req, res) => {
    try {
        const { q = "", isActive, page = 1, limit = 20 } = req.query;

        const filters = { isDeleted: false };

        // -------- NAME SEARCH --------
        if (q) filters.name = { $regex: q, $options: "i" };

        // -------- ACTIVE FILTERING --------
        if (typeof isActive === "undefined") {
            // default → only active types
            filters.isActive = true;
        } else if (isActive === "true") {
            filters.isActive = true;
        } else if (isActive === "false") {
            filters.isActive = false;
        } else if (isActive === "all") {
            // no filter → show all active/inactive
        } else {
            // any invalid value → fallback to only active
            filters.isActive = true;
        }

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
                                $expr: {
                                    $in: ["$$sid", { $ifNull: ["$skinTypes", []] }]
                                },
                                isDeleted: { $ne: true }
                            }
                        },
                        { $count: "count" }
                    ],
                    as: "stats"
                }
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
            { $limit: lim }
        ];

        const [rows, total] = await Promise.all([
            SkinType.aggregate(pipeline),
            SkinType.countDocuments(filters)
        ]);

        return res.json({
            success: true,
            data: rows,
            pagination: { page: pg, limit: lim, total }
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

export const getProductsBySkinType = async (req, res) => {
    try {
        const { slug } = req.params;
        let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;

        page = Number(page) || 1;
        limit = Number(limit) || 12;

        // 🔹 Find SkinType
        const skinType = await SkinType.findOne({
            slug: slug.toLowerCase(),
            isDeleted: false
        })
            .select("name slug _id")
            .lean();

        if (!skinType) {
            return res.status(404).json({
                message: "❌ Skin type not found or may have been removed."
            });
        }

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

        // 🔹 Apply dynamic filters
        const finalFilter = await applyDynamicFilters(filters);
        finalFilter.isPublished = true;

        // 🔹 Sorting options
        const sortOptions = {
            recent: { createdAt: -1 },
            priceLowToHigh: { price: 1 },
            priceHighToLow: { price: -1 },
            rating: { avgRating: -1 },
        };

        // 🚀 Run count + products in parallel
        const [total, products] = await Promise.all([
            Product.countDocuments(finalFilter),
            Product.find(finalFilter)
                .populate("category", "name slug isActive")
                .populate("formulation", "name slug isActive")
                .populate("brand", "name slug isActive")
                .sort(sortOptions[sort] || { createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean()
        ]);

        // 🚀 PROMOTION CACHING (60 seconds)
        let promotions;
        const nowTs = Date.now();

        if (_promoCache.data && nowTs - _promoCache.ts < _promoCache.ttl) {
            promotions = _promoCache.data; // use cache
        } else {
            const freshPromos = await Promotion.find({
                status: "active",
                startDate: { $lte: new Date() },
                endDate: { $gte: new Date() }
            }).lean();

            _promoCache = {
                ts: nowTs,
                data: freshPromos,
                ttl: 60000
            };

            promotions = freshPromos;
        }

        // 🔹 Enrich products
        const enrichedProducts = await enrichProductsUnified(products, promotions);

        // 🔹 Add stock messages
        const enrichedWithStockMsg = enrichedProducts.map((prod) => {
            if (Array.isArray(prod.variants)) {
                prod.variants = prod.variants.map((v) => {
                    const vStock = v.stock ?? 0;

                    if (vStock <= 0) v.stockMessage = "Out of stock";
                    else if (vStock === 1) v.stockMessage = "🔥 Only 1 left!";
                    else if (vStock <= 3) v.stockMessage = `⚡ Just ${vStock} left — selling fast!`;
                    else if (vStock < 10) v.stockMessage = `💨 Few left (${vStock} in stock)`;
                    else v.stockMessage = null;

                    return v;
                });
            }
            return prod;
        });

        // 🔹 Reattach populated relations
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
            isPublished: true
        });

        const categories = await Category.find({
            _id: { $in: uniqueCategoryIds },
            isActive: true
        })
            .select("name slug")
            .lean();

        const message = products.length
            ? `✨ Showing curated products specially for ${skinType.name} skin type.`
            : `😔 No products available for ${skinType.name} skin type right now — we're adding new ones soon!`;

        // 🔹 Final Response
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
        return res.status(500).json({
            success: false,
            message: "🚫 Oops! Something went wrong while fetching products.",
            error: err.message,
        });
    }
};

