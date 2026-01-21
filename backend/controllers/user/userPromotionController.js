// controllers/user/promotionController.js
import Promotion from "../../models/Promotion.js";
import Product from "../../models/Product.js";
import Brand from "../../models/Brand.js";
import Category from "../../models/Category.js";
import SkinType from "../../models/SkinType.js";
import mongoose from "mongoose";
import { normalizeFilters, applyDynamicFilters } from "../../controllers/user/userProductController.js";
import { applyPromotions } from "../../middlewares/services/promotionEngine.js";
import { enrichProductsUnified } from "../../middlewares/services/productHelpers.js";
import { getRedis } from "../../middlewares/utils/redis.js";

const ObjectId = mongoose.Types.ObjectId; // ✅ Fix for ReferenceError


/* ----------------------------- HELPERS ----------------------------- */
export const escapeRegex = (str = "") => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const isObjectId = (s) => typeof s === "string" && /^[0-9a-fA-F]{24}$/.test(s);
export const getCountdown = (endDate) => {
    const now = new Date();
    const end = new Date(endDate);
    const diff = end - now;
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return { days, hours, minutes, seconds };
};

export const productMatchesPromo = (product, promo) => {
    // scope = product
    if (promo.scope === "product" && Array.isArray(promo.products) && promo.products.length) {
        const pid = product._id?.toString?.() || product._id;
        return promo.products.some((p) => p.toString() === pid);
    }

    // scope = category
    if (promo.scope === "category" && Array.isArray(promo.categories) && promo.categories.length) {
        const catId = product.category?._id?.toString?.() ||
            product.category?.toString?.() ||
            null;
        const matchesCat = promo.categories.some((c) => c?.category?.toString?.() === catId);
        const matchesHierarchy = Array.isArray(product.categoryHierarchy)
            ? product.categoryHierarchy.some((cid) => {
                const hierarchyId =
                    cid?._id?.toString?.() || cid?.toString?.();
                return promo.categories.some(
                    (c) => c?.category?.toString?.() === hierarchyId
                );
            })
            : false;

        if (!matchesCat && !matchesHierarchy) {
        }

        return matchesCat || matchesHierarchy;
    }

    // scope = brand
    if (promo.scope === "brand" && Array.isArray(promo.brands) && promo.brands.length) {
        const productBrandId = product.brand?._id?.toString?.() || product.brand?.toString?.();
        return promo.brands.some((b) => {
            const bId = b?.brand?._id?.toString?.() || b?.brand?.toString?.();
            return bId && bId === productBrandId;
        });
    }

    return false;
};

export const asMoney = (num) => {
    if (!num || isNaN(num)) return "0";
    return Number(num).toLocaleString("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
};
/* --------------------------- PRICE HELPERS --------------------------- */
export const applyFlatDiscount = (mrp, promotion) => {
    if (promotion.promotionType !== "discount" || !promotion.discountValue) {
        return { price: mrp, discountAmount: 0, discountPercent: 0 };
    }
    let price = mrp;
    if (promotion.discountUnit === "percent") {
        price = Math.max(0, mrp - (mrp * promotion.discountValue) / 100);
    } else {
        price = Math.max(0, mrp - promotion.discountValue);
    }
    const discountAmount = Math.max(0, mrp - price);
    const discountPercent = mrp > 0 ? Math.floor((discountAmount / mrp) * 100) : 0;
    return { price: Math.round(price), discountAmount: Math.round(discountAmount), discountPercent };
};

export const bestTierForQty = (tiers, qty) =>
    tiers
        .filter((t) => qty >= t.minQty)
        .sort((a, b) => b.discountPercent - a.discountPercent)[0] || null;

export const getActivePromotionsForUsers = async (req, res) => {
    try {
        const redis = getRedis();  // 🔥 REQUIRED

        const now = new Date();
        const section = (req.query.section || "all").toString().toLowerCase();
        // allowed: 'product', 'banner', 'offers', 'all'

        // Try Redis cache first (cache per section)
        const cacheKey = `promos:active:section:${section}`;
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                return res.json(JSON.parse(cached));
            }
        } catch (e) {
            // Redis may be down — continue and fetch from DB
            // console.warn("Redis get failed for active promos:", e.message);
        }

        // ✅ Only active promotions (not scheduled, not expired)
        const baseFilter = {
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now },
        };

        const promos = await Promotion.find(baseFilter)
            .select(
                " slug campaignName description images promotionType promotionConfig discountUnit discountValue scope startDate endDate targetAudience categories brands products tags displaySection"
            )
            .populate("categories.category", "name slug")
            .populate("brands.brand", "name slug")
            .lean();

        // ✅ Strict filtering by displaySection
        let filtered = promos;
        if (section !== "all") {
            filtered = promos.filter(
                (p) => Array.isArray(p.displaySection) && p.displaySection.includes(section)
            );
        }

        // ✅ Normalize for frontend
        const payload = filtered.map((p) => {
            let discountPercent = null;
            let discountAmount = null;
            let discountLabel = "";

            if (p.promotionType === "discount" && p.discountValue) {
                if (p.discountUnit === "percent") {
                    discountPercent = Number(p.discountValue) || 0;
                    discountLabel = `${discountPercent}% OFF`;
                } else {
                    discountAmount = Number(p.discountValue) || 0;
                    discountLabel = `₹${asMoney(discountAmount)} OFF`;
                }
            } else if (p.promotionType === "tieredDiscount") {
                const tiers = Array.isArray(p.promotionConfig?.tiers)
                    ? p.promotionConfig.tiers
                    : [];
                const top = tiers.length
                    ? tiers.reduce((s, t) => Math.max(s, Number(t.discountPercent || 0)), 0)
                    : 0;
                discountLabel = top ? `Buy More, Save up to ${top}%` : "Buy More, Save More";
            } else if (p.promotionType === "bogo") {
                const bq = p.promotionConfig?.buyQty ?? 1;
                const gq = p.promotionConfig?.getQty ?? 1;
                discountLabel = `BOGO ${bq}+${gq}`;
            } else if (p.promotionType === "paymentOffer") {
                const provider = p.promotionConfig?.provider || "";
                const pct = Number(p.promotionConfig?.discountPercent || 0);
                discountLabel = provider ? `${provider} ${pct}% off` : `Payment Offer ${pct}%`;
            } else if (p.promotionType === "newUser") {
                discountLabel = `New User ${p.promotionConfig?.discountPercent || ""}%`;
            } else if (p.promotionType === "freeShipping") {
                discountLabel = `Free Shipping over ₹${p.promotionConfig?.minOrderValue || 0}`;
            }

            const isScheduled = p.startDate > now;

            return {
                _id: p._id,
                slug: p.slug || "",
                title: p.campaignName,
                description: p.description || "",
                images: p.images || [],
                type: p.promotionType,
                tags: p.tags || [],
                scope: p.scope,
                discountPercent,
                discountAmount,
                discountLabel,
                isScheduled,
                countdown: getCountdown(p.endDate),
                promoMeta: {
                    categories: (p.categories || []).map((c) => ({
                        id: c.category?._id,
                        slug: c.slug || c.category?.slug,
                        name: c.category?.name,
                    })),
                    brands: (p.brands || []).map((b) => ({
                        id: b.brand?._id,
                        slug: b.slug || b.brand?.slug,
                        name: b.brand?.name,
                    })),
                    products: (p.products || []).map((x) =>
                        typeof x === "object" ? String(x._id ?? x) : String(x)
                    ),
                    promotionConfig: p.promotionConfig || {},
                    startDate: p.startDate,
                    endDate: p.endDate,
                },
            };
        });

        // Cache the payload in Redis for a short period (freshness important)
        try {
            await redis.set(cacheKey, JSON.stringify(payload), "EX", 30); // 30s
        } catch (e) {
            // ignore redis set errors
        }

        return res.json(payload);
    } catch (err) {
        console.error("getActivePromotionsForUsers error:", err);
        return res.status(500).json({ message: "Failed to load promotions", error: err.message });
    }
};

// export const getPromotionProducts = async (req, res) => {
//     try {
//         const redis = getRedis();  // 🔥 REQUIRED
//         const { idOrSlug } = req.params;

//         let promoQuery;
//         if (isObjectId(idOrSlug)) {
//             promoQuery = { _id: idOrSlug };
//         } else {
//             promoQuery = { slug: idOrSlug };
//         }


//         let { page = 1, limit = 12, sort = "recent", search = "", ...queryFilters } = req.query;
//         page = Number(page) || 1;
//         limit = Math.min(Number(limit) || 12, 50);
//         search = search.trim();

//         const redisKey = `promo:products:${idOrSlug}:${JSON.stringify(req.query)}`;
//         try {
//             const cached = await redis.get(redisKey);
//             if (cached) return res.status(200).json(JSON.parse(cached));
//         } catch { }

//         // 🔹 Fetch promotion
//         const promo = await Promotion.findOne(promoQuery)
//             .populate("categories.category", "_id name slug")
//             .populate("products", "_id name category")
//             .populate("brands.brand", "_id name slug")
//             .lean();

//         if (!promo) return res.status(404).json({ message: "Promotion not found" });

//         // ----------------------------------------------
//         // 🔥 BASE MATCH
//         // ----------------------------------------------
//         const baseMatch = { isPublished: true };

//         // ----------------------------------------------
//         // 🔥 PROMOTION PRICE FILTER FIXED
//         // ----------------------------------------------
//         if (promo.promotionConfig) {
//             const cfg = promo.promotionConfig;

//             // We check each product variant's FINAL effective price
//             const priceFilter = {};

//             if (cfg.maxProductPrice) {
//                 priceFilter.$lte = cfg.maxProductPrice;
//             }
//             if (cfg.minProductPrice) {
//                 priceFilter.$gte = cfg.minProductPrice;
//             }
//             if (Object.keys(priceFilter).length > 0) {
//                 baseMatch["variants.discountedPrice"] = {
//                     ...priceFilter,
//                     $ne: 0,            // 🚫 exclude zero price
//                     $exists: true       // ✔ ensure field exists
//                 };
//             }
//         }

//         // ----------------------------------------------
//         // 🔥 Scope Filters
//         // ----------------------------------------------
//         if (promo.scope === "category" && promo.categories?.length) {
//             baseMatch.category = {
//                 $in: promo.categories
//                     .map(c => c?.category?._id)
//                     .filter(Boolean)
//             };
//         }

//         if (promo.scope === "product" && promo.products?.length) {
//             baseMatch._id = {
//                 $in: promo.products.map(p => p._id)
//             };
//         }

//         if (promo.scope === "brand" && promo.brands?.length) {
//             baseMatch.brand = {
//                 $in: promo.brands.map(b => b?.brand?._id)
//             };
//         }

//         // ----------------------------------------------
//         // 🔹 TEXT SEARCH
//         // ----------------------------------------------
//         if (search) baseMatch.name = { $regex: escapeRegex(search), $options: "i" };

//         // ----------------------------------------------
//         // 🔹 NORMAL FILTERS
//         // ----------------------------------------------
//         const filters = normalizeFilters(queryFilters);

//         // category, brand, skinTypes resolver…
//         if (filters.categoryIds?.length) {
//             const cats = await Category.find({
//                 $or: [
//                     { _id: { $in: filters.categoryIds.filter(isObjectId) } },
//                     { slug: { $in: filters.categoryIds.filter(i => !isObjectId(i)) } }
//                 ],
//                 isActive: true
//             }).select("_id");
//             baseMatch.category = { $in: cats.map(c => c._id) };
//         }

//         if (filters.brandIds?.length) {
//             const br = await Brand.find({
//                 $or: [
//                     { _id: { $in: filters.brandIds.filter(isObjectId) } },
//                     { slug: { $in: filters.brandIds.filter(i => !isObjectId(i)) } }
//                 ],
//                 isActive: true
//             }).select("_id");
//             baseMatch.brand = { $in: br.map(b => b._id) };
//         }

//         // SkinTypes resolver
//         if (filters.skinTypes?.length) {
//             const st = await SkinType.find({
//                 name: { $in: filters.skinTypes.map(s => new RegExp(`^${s}$`, "i")) }
//             }).select("_id");
//             filters.skinTypes = st.map(s => s._id.toString());
//         }

//         // dynamic filters
//         const dynamicFilters = await applyDynamicFilters(filters);
//         const finalFilter = { ...baseMatch, ...dynamicFilters };

//         // ----------------------------------------------
//         // 🔹 SORTING
//         // ----------------------------------------------
//         const sortOptions = {
//             recent: { createdAt: -1 },
//             priceLowToHigh: { "variants.effectiveFinalPrice": 1 },
//             priceHighToLow: { "variants.effectiveFinalPrice": -1 },
//             rating: { avgRating: -1 },
//             discount: { discountPercent: -1 }
//         };

//         // ----------------------------------------------
//         // 🔹 Count & Fetch
//         // ----------------------------------------------
//         const total = await Product.countDocuments(finalFilter);

//         const rawProducts = await Product.find(finalFilter)
//             .populate("brand", "name slug logo isActive")
//             .populate("category", "name slug banner isActive")
//             .populate("skinTypes", "name slug isActive")
//             .populate("formulation", "name slug isActive")
//             .sort(sortOptions[sort] || { createdAt: -1 })
//             .skip((page - 1) * limit)
//             .limit(limit)
//             .lean();

//         // ----------------------------------------------
//         // 🔹 Promotion Application
//         // ----------------------------------------------
//         let activePromotions = [];
//         try {
//             const cachedPromos = await redis.get(`promotions:active`);
//             if (cachedPromos) {
//                 activePromotions = JSON.parse(cachedPromos);
//             } else {
//                 const now = new Date();
//                 activePromotions = await Promotion.find({
//                     status: "active",
//                     startDate: { $lte: now },
//                     endDate: { $gte: now }
//                 }).lean();
//                 await redis.set("promotions:active", JSON.stringify(activePromotions), "EX", 5);
//             }
//         } catch { }

//         const enrichedProducts = await enrichProductsUnified(rawProducts, [
//             promo,
//             ...activePromotions
//         ]);

//         // attach relations
//         const productsWithRelations = enrichedProducts.map((p, i) => ({
//             ...p,
//             brand: rawProducts[i].brand,
//             category: rawProducts[i].category,
//             skinTypes: rawProducts[i].skinTypes,
//             formulation: rawProducts[i].formulation
//         }));

//         // add badge
//         productsWithRelations.forEach(p => {
//             const maxD = Math.max(...(p.variants?.map(v => v.discountPercent) || [0]));
//             p.badge = maxD > 0 ? `${maxD}% Off` : null;
//             p.promoMessage = p.badge ? `Save ${p.badge} on this product` : null;
//         });

//         // ----------------------------------------------
//         // 🔹 Sidebar Filter Values (categories/brands)
//         // ----------------------------------------------
//         const uniqueCategoryIds = await Product.distinct("category", finalFilter);
//         const uniqueBrandIds = await Product.distinct("brand", finalFilter);

//         const [categories, brands] = await Promise.all([
//             Category.find({ _id: { $in: uniqueCategoryIds }, isActive: true }).select("name slug").lean(),
//             Brand.find({ _id: { $in: uniqueBrandIds }, isActive: true }).select("name slug logo").lean()
//         ]);

//         const payload = {
//             promoMeta: {
//                 ...promo,
//                 slug: promo.slug || null
//             },
//             products: productsWithRelations,
//             categories,
//             brands,
//             pagination: {
//                 page,
//                 limit,
//                 total,
//                 totalPages: Math.ceil(total / limit),
//                 hasMore: page < Math.ceil(total / limit)
//             },
//             message: productsWithRelations.length
//                 ? `Showing products for promotion - "${promo.campaignName}"`
//                 : "No products found under this promotion"
//         };

//         await redis.set(redisKey, JSON.stringify(payload), "EX", 60);

//         return res.status(200).json(payload);

//     } catch (err) {
//         console.error("🔥 getPromotionProducts error:", err);
//         return res.status(500).json({ message: "Failed to fetch promotion products", error: err.message });
//     }
// };


export const getPromotionProducts = async (req, res) => {
    try {
        const redis = getRedis();  // 🔥 REQUIRED
        const { idOrSlug } = req.params;

        let promoQuery;
        if (isObjectId(idOrSlug)) {
            promoQuery = { _id: idOrSlug };
        } else {
            promoQuery = { slug: idOrSlug };
        }


        let { limit = 9, sort = "recent", cursor, search = "", ...queryFilters } = req.query;
        limit = Math.min(Number(limit) || 9, 50);

        search = search.trim();

        const redisKey = `promo:products:${idOrSlug}:${JSON.stringify(req.query)}`;
        try {
            const cached = await redis.get(redisKey);
            if (cached) return res.status(200).json(JSON.parse(cached));
        } catch { }

        // 🔹 Fetch promotion
        const promo = await Promotion.findOne(promoQuery)
            .populate("categories.category", "_id name slug")
            .populate("products", "_id name category")
            .populate("brands.brand", "_id name slug")
            .lean();

        if (!promo) return res.status(404).json({ message: "Promotion not found" });

        // ----------------------------------------------
        // 🔥 BASE MATCH
        // ----------------------------------------------
        const baseMatch = { isPublished: true };

        // ----------------------------------------------
        // 🔥 PROMOTION PRICE FILTER FIXED
        // ----------------------------------------------
        if (promo.promotionConfig) {
            const cfg = promo.promotionConfig;

            // We check each product variant's FINAL effective price
            const priceFilter = {};

            if (cfg.maxProductPrice) {
                priceFilter.$lte = cfg.maxProductPrice;
            }
            if (cfg.minProductPrice) {
                priceFilter.$gte = cfg.minProductPrice;
            }
            if (Object.keys(priceFilter).length > 0) {
                baseMatch["variants.discountedPrice"] = {
                    ...priceFilter,
                    $ne: 0,            // 🚫 exclude zero price
                    $exists: true       // ✔ ensure field exists
                };
            }
        }

        // ----------------------------------------------
        // 🔥 Scope Filters
        // ----------------------------------------------
        if (promo.scope === "category" && promo.categories?.length) {
            baseMatch.category = {
                $in: promo.categories
                    .map(c => c?.category?._id)
                    .filter(Boolean)
            };
        }

        if (promo.scope === "product" && promo.products?.length) {
            baseMatch._id = {
                $in: promo.products.map(p => p._id)
            };
        }

        if (promo.scope === "brand" && promo.brands?.length) {
            baseMatch.brand = {
                $in: promo.brands.map(b => b?.brand?._id)
            };
        }

        // ----------------------------------------------
        // 🔹 TEXT SEARCH
        // ----------------------------------------------
        if (search) baseMatch.name = { $regex: escapeRegex(search), $options: "i" };

        // ----------------------------------------------
        // 🔹 NORMAL FILTERS
        // ----------------------------------------------
        const filters = normalizeFilters(queryFilters);

        // category, brand, skinTypes resolver…
        if (filters.categoryIds?.length) {
            const cats = await Category.find({
                $or: [
                    { _id: { $in: filters.categoryIds.filter(isObjectId) } },
                    { slug: { $in: filters.categoryIds.filter(i => !isObjectId(i)) } }
                ],
                isActive: true
            }).select("_id");
            baseMatch.category = { $in: cats.map(c => c._id) };
        }

        if (filters.brandIds?.length) {
            const br = await Brand.find({
                $or: [
                    { _id: { $in: filters.brandIds.filter(isObjectId) } },
                    { slug: { $in: filters.brandIds.filter(i => !isObjectId(i)) } }
                ],
                isActive: true
            }).select("_id");
            baseMatch.brand = { $in: br.map(b => b._id) };
        }

        // SkinTypes resolver
        if (filters.skinTypes?.length) {
            const st = await SkinType.find({
                name: { $in: filters.skinTypes.map(s => new RegExp(`^${s}$`, "i")) }
            }).select("_id");
            filters.skinTypes = st.map(s => s._id.toString());
        }

        // dynamic filters
        const dynamicFilters = await applyDynamicFilters(filters);
        const finalFilter = { ...baseMatch, ...dynamicFilters };

        const sortConfig = {
            recent: { field: "_id", order: -1 },
            priceLowToHigh: { field: "variants.effectiveFinalPrice", order: 1 },
            priceHighToLow: { field: "variants.effectiveFinalPrice", order: -1 },
            rating: { field: "avgRating", order: -1 },
            discount: { field: "discountPercent", order: -1 }
        };

        const { field, order } = sortConfig[sort] || sortConfig.recent;

        if (cursor) {
            finalFilter[field] = order === -1
                ? { $lt: cursor }
                : { $gt: cursor };
        }


        // ----------------------------------------------
        // 🔹 Count & Fetch
        // ----------------------------------------------
        const total = await Product.countDocuments(finalFilter);

        const rawProducts = await Product.find(finalFilter)
            .populate("brand", "name slug logo isActive")
            .populate("category", "name slug banner isActive")
            .populate("skinTypes", "name slug isActive")
            .populate("formulation", "name slug isActive")
            .sort({ [field]: order })
            .limit(limit + 1)
            .lean();

        // ----------------------------------------------
        // 🔹 Promotion Application
        // ----------------------------------------------
        let activePromotions = [];
        try {
            const cachedPromos = await redis.get(`promotions:active`);
            if (cachedPromos) {
                activePromotions = JSON.parse(cachedPromos);
            } else {
                const now = new Date();
                activePromotions = await Promotion.find({
                    status: "active",
                    startDate: { $lte: now },
                    endDate: { $gte: now }
                }).lean();
                await redis.set("promotions:active", JSON.stringify(activePromotions), "EX", 5);
            }
        } catch { }

        const hasMore = rawProducts.length > limit;
        if (hasMore) rawProducts.pop();



        const enrichedProducts = await enrichProductsUnified(rawProducts, [
            promo,
            ...activePromotions
        ]);


        // attach relations
        const productsWithRelations = enrichedProducts.map((p, i) => ({
            ...p,
            brand: rawProducts[i].brand,
            category: rawProducts[i].category,
            skinTypes: rawProducts[i].skinTypes,
            formulation: rawProducts[i].formulation
        }));

        // add badge
        productsWithRelations.forEach(p => {
            const maxD = Math.max(...(p.variants?.map(v => v.discountPercent) || [0]));
            p.badge = maxD > 0 ? `${maxD}% Off` : null;
            p.promoMessage = p.badge ? `Save ${p.badge} on this product` : null;
        });

        // ----------------------------------------------
        // 🔹 Sidebar Filter Values (categories/brands)
        // ----------------------------------------------
        const uniqueCategoryIds = await Product.distinct("category", finalFilter);
        const uniqueBrandIds = await Product.distinct("brand", finalFilter);

        const [categories, brands] = await Promise.all([
            Category.find({ _id: { $in: uniqueCategoryIds }, isActive: true }).select("name slug").lean(),
            Brand.find({ _id: { $in: uniqueBrandIds }, isActive: true }).select("name slug logo").lean()
        ]);


        const nextCursor =
            rawProducts.length > 0 ? rawProducts[rawProducts.length - 1][field] : null;

        let message = null;

        if (!rawProducts.length && cursor) {
            message = "🎉 You’ve reached the end! No more products to show.";
        }

        if (!rawProducts.length && !cursor) {
            message = "No products found under this promotion.";
        }

        const payload = {
            promoMeta: {
                ...promo,
                slug: promo.slug || null
            },
            products: productsWithRelations,
            categories,
            brands,
            pagination: {
                hasMore,
                nextCursor
            },
            message
        };

        await redis.set(redisKey, JSON.stringify(payload), "EX", 60);

        return res.status(200).json(payload);

    } catch (err) {
        console.error("🔥 getPromotionProducts error:", err);
        return res.status(500).json({ message: "Failed to fetch promotion products", error: err.message });
    }
};