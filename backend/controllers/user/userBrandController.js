// // controllers/user/userBrandController.js
// import Product from "../../models/Product.js";
// import Category from "../../models/Category.js";
// import Brand from "../../models/Brand.js";
// import Promotion from "../../models/Promotion.js";
// import mongoose from "mongoose";
// import { slugToRegex } from "../../middlewares/utils/slug.js";


// // --- HELPER: apply promotion pricing ---
// function applyPromoPrice(promo, product) {
//     const mrp = product.mrp ?? product.price;
//     if (!promo || promo.promotionType !== "discount" || !promo.discountValue) {
//         return { price: product.price, mrp, discount: 0, discountPercent: 0 };
//     }

//     let price = mrp;
//     if (promo.discountUnit === "percent") {
//         price = Math.max(0, mrp - (mrp * promo.discountValue) / 100);
//     } else {
//         price = Math.max(0, mrp - promo.discountValue);
//     }

//     return {
//         price: Math.round(price),
//         mrp,
//         discount: Math.max(0, mrp - price),
//         discountPercent: mrp > 0 ? Math.floor(((mrp - price) / mrp) * 100) : 0,
//     };
// }

// // --- HELPER: fetch active promotion for product ---
// async function getActivePromoForProduct(product) {
//     const now = new Date();
//     return await Promotion.findOne({
//         status: "active",
//         startDate: { $lte: now },
//         endDate: { $gte: now },
//         $or: [
//             { scope: "product", products: product._id },
//             { scope: "brand", brand: product.brand?._id || product.brand },
//             { scope: "category", "categories.category": product.category?._id || product.category },
//         ],
//     }).lean();
// }


// /**
//  * GET /api/brands
//  * Returns all active brands with product counts
//  */
// export const getAllBrands = async (req, res) => {
//     try {
//         const brands = await Brand.find({ isActive: true })
//             .select("_id name logo banner description slug")
//             .sort({ name: 1 })
//             .lean();

//         const counts = await Product.aggregate([
//             {
//                 $match: {
//                     brand: { $in: brands.map(b => b._id) },
//                     isPublished: true
//                 }
//             },
//             { $group: { _id: "$brand", count: { $sum: 1 } } }
//         ]);

//         const countMap = {};
//         counts.forEach(c => {
//             countMap[c._id.toString()] = c.count;
//         });

//         const enriched = brands.map(b => ({
//             ...b,
//             count: countMap[b._id.toString()] || 0
//         }));

//         res.json(enriched);
//     } catch (err) {
//         console.error("🔥 Error in getAllBrands:", err);
//         res.status(500).json({ message: "Failed to fetch brands", error: err.message });
//     }
// };


// /**
//  * GET /api/brands/:brandSlug/:categorySlug
//  * Brand + Category specific products (with promo pricing + pagination)
//  */
// export const getBrandCategoryProducts = async (req, res) => {
//     try {
//         const { brandSlug, categorySlug } = req.params;
//         const page = parseInt(req.query.page) || 1;
//         const perPage = parseInt(req.query.limit) || 12;

//         const brand = await Brand.findOne({ slug: brandSlug, isActive: true }).lean();
//         if (!brand) return res.status(404).json({ message: "Brand not found" });

//         const category = await Category.findOne({ slug: categorySlug, isActive: true }).lean();
//         if (!category) return res.status(404).json({ message: "Category not found" });

//         const total = await Product.countDocuments({
//             brand: brand._id,
//             category: category._id,
//             isPublished: true
//         });

//         const products = await Product.find({
//             brand: brand._id,
//             category: category._id,
//             isPublished: true
//         })
//             .select("_id name slug price mrp images summary description avgRating totalRatings status colorOptions shadeOptions commentsCount category brand variant")
//             .populate("category", "name slug")
//             .populate("brand", "name logo")
//             .skip((page - 1) * perPage)
//             .limit(perPage)
//             .lean();

//         const categoryMap = new Map();
//         categoryMap.set(String(category._id), { _id: category._id, name: category.name, slug: category.slug });

//         const cards = await Promise.all(products.map(async (p) => {
//             const promo = await getActivePromoForProduct(p);
//             const pricing = applyPromoPrice(promo, p);

//             return {
//                 _id: p._id,
//                 name: p.name,
//                 variant: p.variant,
//                 price: pricing.price,
//                 mrp: pricing.mrp,
//                 discount: pricing.discount,
//                 discountPercent: pricing.discountPercent,
//                 brand: p.brand ? { name: p.brand.name, logo: p.brand.logo } : null,
//                 category: mongoose.Types.ObjectId.isValid(p.category?._id)
//                     ? categoryMap.get(String(p.category._id)) || null
//                     : null,
//                 summary: p.summary || p.description?.slice(0, 100) || '',
//                 status: p.status,
//                 image: p.images?.length > 0
//                     ? (p.images[0].startsWith('http') ? p.images[0] : `${process.env.BASE_URL}/${p.images[0]}`)
//                     : null,
//                 colorOptions: p.colorOptions || [],
//                 shadeOptions: p.shadeOptions || [],
//                 commentsCount: p.commentsCount || 0,
//                 avgRating: p.avgRating || 0
//             };
//         }));

//         const totalPages = Math.ceil(total / perPage);

//         res.status(200).json({
//             brand: { name: brand.name, logo: brand.logo },
//             category: { _id: category._id, name: category.name, slug: category.slug },
//             products: cards,
//             total,
//             currentPage: page,
//             totalPages,
//             hasMore: page < totalPages,
//             nextPage: page < totalPages ? page + 1 : null,
//             prevPage: page > 1 ? page - 1 : null
//         });

//     } catch (err) {
//         console.error("🔥 Error in getBrandCategoryProducts:", err);
//         res.status(500).json({
//             message: "Failed to fetch category products",
//             error: err.message
//         });
//     }
// };

// /**
//  * GET /api/brands/:brandSlug
//  * Brand Landing Page (with promo pricing + pagination)
//  */
// export const getBrandLanding = async (req, res) => {
//     try {
//         const { brandSlug } = req.params;
//         const page = parseInt(req.query.page) || 1;
//         const perPage = parseInt(req.query.limit) || 10;

//         const brand = await Brand.findOne({ slug: brandSlug, isActive: true })
//             .select("banner name logo")
//             .lean();

//         if (!brand) {
//             return res.status(404).json({ message: "Brand not found" });
//         }

//         const total = await Product.countDocuments({ brand: brand._id, isPublished: true });

//         const rawProducts = await Product.find({ brand: brand._id, isPublished: true })
//             .select("_id name slug price mrp images summary description avgRating totalRatings category brand variant status colorOptions shadeOptions commentsCount")
//             .populate("category", "name slug")
//             .populate("brand", "name logo")
//             .skip((page - 1) * perPage)
//             .limit(perPage)
//             .lean();

//         const categoryMap = new Map();
//         rawProducts.forEach(p => {
//             if (p.category && mongoose.Types.ObjectId.isValid(p.category._id)) {
//                 categoryMap.set(String(p.category._id), {
//                     _id: p.category._id,
//                     name: p.category.name,
//                     slug: p.category.slug
//                 });
//             }
//         });

//         const cards = await Promise.all(rawProducts.map(async (p) => {
//             const promo = await getActivePromoForProduct(p);
//             const pricing = applyPromoPrice(promo, p);

//             return {
//                 _id: p._id,
//                 name: p.name,
//                 variant: p.variant,
//                 price: pricing.price,
//                 mrp: pricing.mrp,
//                 discount: pricing.discount,
//                 discountPercent: pricing.discountPercent,
//                 brand: p.brand ? { _id: p.brand._id, name: p.brand.name, logo: p.brand.logo } : null,
//                 category: mongoose.Types.ObjectId.isValid(p.category?._id)
//                     ? categoryMap.get(String(p.category._id)) || null
//                     : null,
//                 summary: p.summary || p.description?.slice(0, 100) || '',
//                 status: p.status,
//                 image: p.images?.length > 0
//                     ? (p.images[0].startsWith('http') ? p.images[0] : `${process.env.BASE_URL}/${p.images[0]}`)
//                     : null,
//                 colorOptions: p.colorOptions || [],
//                 shadeOptions: p.shadeOptions || [],
//                 commentsCount: p.commentsCount || 0,
//                 avgRating: p.avgRating || 0
//             };
//         }));

//         const uniqueCategoryIds = await Product.distinct("category", { brand: brand._id, isPublished: true });
//         const categories = await Category.find({ _id: { $in: uniqueCategoryIds }, isActive: true })
//             .select("name slug")
//             .lean();

//         let relatedProducts = [];
//         if (cards.length < 5 && uniqueCategoryIds.length > 0) {
//             const rawRelated = await Product.find({
//                 category: { $in: uniqueCategoryIds },
//                 brand: { $ne: brand._id },
//                 isPublished: true
//             })
//                 .select("_id name slug price mrp images summary description avgRating totalRatings category brand variant status colorOptions shadeOptions commentsCount")
//                 .populate("category", "name slug")
//                 .populate("brand", "name logo")
//                 .limit(10)
//                 .lean();

//             relatedProducts = await Promise.all(rawRelated.map(async (p) => {
//                 const promo = await getActivePromoForProduct(p);
//                 const pricing = applyPromoPrice(promo, p);

//                 return {
//                     _id: p._id,
//                     name: p.name,
//                     variant: p.variant,
//                     price: pricing.price,
//                     mrp: pricing.mrp,
//                     discount: pricing.discount,
//                     discountPercent: pricing.discountPercent,
//                     brand: p.brand ? { _id: p.brand._id, name: p.brand.name, logo: p.brand.logo } : null,
//                     category: mongoose.Types.ObjectId.isValid(p.category?._id)
//                         ? { _id: p.category._id, name: p.category.name, slug: p.category.slug }
//                         : null,
//                     summary: p.summary || p.description?.slice(0, 100) || '',
//                     status: p.status,
//                     image: p.images?.length > 0
//                         ? (p.images[0].startsWith('http') ? p.images[0] : `${process.env.BASE_URL}/${p.images[0]}`)
//                         : null,
//                     colorOptions: p.colorOptions || [],
//                     shadeOptions: p.shadeOptions || [],
//                     commentsCount: p.commentsCount || 0,
//                     avgRating: p.avgRating || 0
//                 };
//             }));
//         }

//         const totalPages = Math.ceil(total / perPage);

//         res.status(200).json({
//             brandBanner: brand.banner || null,
//             products: cards,
//             categories,
//             relatedProducts,
//             total,
//             currentPage: page,
//             totalPages,
//             hasMore: page < totalPages,
//             nextPage: page < totalPages ? page + 1 : null,
//             prevPage: page > 1 ? page - 1 : null
//         });
//     } catch (err) {
//         console.error("🔥 Error in getBrandLanding:", err);
//         res.status(500).json({
//             message: "Failed to fetch brand details",
//             error: err.message
//         });
//     }
// };













// controllers/user/userBrandController.js
import mongoose from "mongoose";
import Product from "../../models/Product.js";
import Category from "../../models/Category.js";
import Brand from "../../models/Brand.js";
import User from "../../models/User.js";
import Promotion from "../../models/Promotion.js";

// 🔹 helpers (same as category controller)
import { getRecommendations } from '../../middlewares/utils/recommendationService.js';
import { formatProductCard } from '../../middlewares/utils/recommendationService.js';
import { enrichProductWithStockAndOptions } from "../../middlewares/services/productHelpers.js";
import { normalizeFilters, applyDynamicFilters } from "../../controllers/user/userProductController.js";

/**
 * GET /api/brands
 * Returns all active brands with product counts
 */
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
        counts.forEach(c => { countMap[c._id.toString()] = c.count; });

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

/**
 * GET /api/brands/:brandSlug/:categorySlug
 * Brand + Category products (variant-wise + filters + recommendations)
 */
export const getBrandCategoryProducts = async (req, res) => {
    try {
        const { brandSlug, categorySlug } = req.params;
        let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;
        page = Number(page); limit = Number(limit);

        const brand = await Brand.findOne({ slug: brandSlug, isActive: true }).lean();
        if (!brand) return res.status(404).json({ message: "Brand not found" });

        const category = await Category.findOne({ slug: categorySlug, isActive: true }).lean();
        if (!category) return res.status(404).json({ message: "Category not found" });

        // Track recent brand
        if (req.user?.id) {
            await User.findByIdAndUpdate(req.user.id, { $pull: { recentBrands: brand._id } });
            await User.findByIdAndUpdate(req.user.id, {
                $push: { recentBrands: { $each: [brand._id], $position: 0, $slice: 20 } }
            });
        }

        // Base filter
        const baseFilter = { brand: brand._id, category: category._id };
        const filters = normalizeFilters(queryFilters);
        const finalFilter = applyDynamicFilters(baseFilter, filters);
        finalFilter.isPublished = true;

        // Sorting
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

        const productsWithStock = products.map(enrichProductWithStockAndOptions);
        const cards = await Promise.all(productsWithStock.map(p => formatProductCard(p)));

        // Recommendations
        const firstProduct = products[0] || await Product.findOne({ brand: brand._id, category: category._id }).lean();
        let [topSelling, moreLikeThis, trending] = await Promise.all([
            getRecommendations({ mode: "topSelling", brandSlug: brand.slug, limit: 6 }),
            firstProduct ? getRecommendations({ mode: "moreLikeThis", productId: firstProduct._id, limit: 6 }) : Promise.resolve({ products: [] }),
            getRecommendations({ mode: "trending", limit: 6 })
        ]);
        const handleRecs = recs => (recs || []).map(enrichProductWithStockAndOptions);
        topSelling = handleRecs(topSelling.products);
        moreLikeThis = handleRecs(moreLikeThis.products);
        trending = handleRecs(trending.products);

        const usedIds = new Set();
        const filterUnique = rec => rec.filter(p => {
            const id = p._id.toString();
            if (usedIds.has(id)) return false;
            usedIds.add(id);
            return true;
        });

        let message = null;
        if (total === 0) {
            if (queryFilters.search) message = `No products found matching “${queryFilters.search}” for this brand category.`;
            else if (filters.minPrice || filters.maxPrice) message = `No products found with the selected filters.`;
            else message = `No products available in ${brand.name} - ${category.name} at the moment.`;
        }

        res.status(200).json({
            brand: { _id: brand._id, name: brand.name, logo: brand.logo },
            category: { _id: category._id, name: category.name, slug: category.slug },
            products: cards,
            pagination: {
                page, limit, total,
                totalPages: Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit)
            },
            message,
            recommendations: {
                topSelling: filterUnique(topSelling),
                moreLikeThis: filterUnique(moreLikeThis),
                trending: filterUnique(trending)
            }
        });

    } catch (err) {
        console.error("🔥 Error in getBrandCategoryProducts:", err);
        res.status(500).json({ message: "Failed to fetch category products", error: err.message });
    }
};

/**
 * GET /api/brands/:brandSlug
 * Brand Landing Page (variant-wise + filters + relatedProducts)
 */
export const getBrandLanding = async (req, res) => {
    try {
        const { brandSlug } = req.params;
        let { page = 1, limit = 12, sort = "recent", ...queryFilters } = req.query;
        page = Number(page); limit = Number(limit);

        const brand = await Brand.findOne({ slug: brandSlug, isActive: true })
            .select("banner name logo slug")
            .lean();
        if (!brand) return res.status(404).json({ message: "Brand not found" });

        const baseFilter = { brand: brand._id };
        const filters = normalizeFilters(queryFilters);
        const finalFilter = applyDynamicFilters(baseFilter, filters);
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

        const productsWithStock = products.map(enrichProductWithStockAndOptions);
        const cards = await Promise.all(productsWithStock.map(p => formatProductCard(p)));

        // Categories under this brand
        const uniqueCategoryIds = await Product.distinct("category", { brand: brand._id, isPublished: true });
        const categories = await Category.find({ _id: { $in: uniqueCategoryIds }, isActive: true })
            .select("name slug")
            .lean();

        // Related products (other brands in same categories)
        let relatedProducts = [];
        if (cards.length < 5 && uniqueCategoryIds.length > 0) {
            const rawRelated = await Product.find({
                category: { $in: uniqueCategoryIds },
                brand: { $ne: brand._id },
                isPublished: true
            }).limit(10).lean();

            const enriched = rawRelated.map(enrichProductWithStockAndOptions);
            relatedProducts = await Promise.all(enriched.map(p => formatProductCard(p)));
        }

        let message = null;
        if (total === 0) {
            if (queryFilters.search) message = `No products found matching “${queryFilters.search}” for this brand.`;
            else message = `No products available for ${brand.name} at the moment.`;
        }

        res.status(200).json({
            brandBanner: brand.banner || null,
            brand: { _id: brand._id, name: brand.name, logo: brand.logo },
            products: cards,
            categories,
            relatedProducts,
            pagination: {
                page, limit, total,
                totalPages: Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit)
            },
            message
        });

    } catch (err) {
        console.error("🔥 Error in getBrandLanding:", err);
        res.status(500).json({ message: "Failed to fetch brand details", error: err.message });
    }
};
