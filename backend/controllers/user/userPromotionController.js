// // controllers/user/promotionController.js
// import Promotion from "../../models/Promotion.js";
// import Product from "../../models/Product.js";
// import Brand from "../../models/Brand.js";
// import Category from "../../models/Category.js";
// import SkinType from "../../models/SkinType.js";
// import mongoose from "mongoose";
// import { normalizeFilters, applyDynamicFilters } from "../../controllers/user/userProductController.js";
// import { applyPromotions } from "../../middlewares/services/promotionEngine.js";
// import { enrichProductsUnified } from "../../middlewares/services/productHelpers.js";

// const ObjectId = mongoose.Types.ObjectId; // ✅ Fix for ReferenceError


// /* ----------------------------- HELPERS ----------------------------- */
// export const escapeRegex = (str = "") => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// export const isObjectId = (s) => typeof s === "string" && /^[0-9a-fA-F]{24}$/.test(s);
// export const getCountdown = (endDate) => {
//     const now = new Date();
//     const end = new Date(endDate);
//     const diff = end - now;
//     if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
//     const days = Math.floor(diff / 86400000);
//     const hours = Math.floor((diff % 86400000) / 3600000);
//     const minutes = Math.floor((diff % 3600000) / 60000);
//     const seconds = Math.floor((diff % 60000) / 1000);
//     return { days, hours, minutes, seconds };
// };

// export const productMatchesPromo = (product, promo) => {
//     // scope = product
//     if (promo.scope === "product" && Array.isArray(promo.products) && promo.products.length) {
//         const pid = product._id?.toString?.() || product._id;
//         return promo.products.some((p) => p.toString() === pid);
//     }

//     // scope = category
//     if (promo.scope === "category" && Array.isArray(promo.categories) && promo.categories.length) {
//         const catId = product.category?.toString?.();
//         const matchesCat = promo.categories.some((c) => c?.category?.toString?.() === catId);
//         const matchesHierarchy = Array.isArray(product.categoryHierarchy)
//             ? product.categoryHierarchy.some((cid) =>
//                 promo.categories.some((c) => c?.category?.toString?.() === cid?.toString?.())
//             )
//             : false;
//         return matchesCat || matchesHierarchy;
//     }

//     // scope = brand
//     if (promo.scope === "brand" && Array.isArray(promo.brands) && promo.brands.length) {
//         const productBrandId = product.brand?._id?.toString?.() || product.brand?.toString?.();
//         return promo.brands.some((b) => {
//             const bId = b?.brand?._id?.toString?.() || b?.brand?.toString?.();
//             return bId && bId === productBrandId;
//         });
//     }

//     return false;
// };

// export const asMoney = (num) => {
//     if (!num || isNaN(num)) return "0";
//     return Number(num).toLocaleString("en-IN", {
//         minimumFractionDigits: 0,
//         maximumFractionDigits: 0,
//     });
// };
// /* --------------------------- PRICE HELPERS --------------------------- */
// export const applyFlatDiscount = (mrp, promotion) => {
//     if (promotion.promotionType !== "discount" || !promotion.discountValue) {
//         return { price: mrp, discountAmount: 0, discountPercent: 0 };
//     }
//     let price = mrp;
//     if (promotion.discountUnit === "percent") {
//         price = Math.max(0, mrp - (mrp * promotion.discountValue) / 100);
//     } else {
//         price = Math.max(0, mrp - promotion.discountValue);
//     }
//     const discountAmount = Math.max(0, mrp - price);
//     const discountPercent = mrp > 0 ? Math.floor((discountAmount / mrp) * 100) : 0;
//     return { price: Math.round(price), discountAmount: Math.round(discountAmount), discountPercent };
// };

// export const bestTierForQty = (tiers, qty) =>
//     tiers
//         .filter((t) => qty >= t.minQty)
//         .sort((a, b) => b.discountPercent - a.discountPercent)[0] || null;

// export const getActivePromotionsForUsers = async (req, res) => {
//     try {
//         const now = new Date();
//         const section = (req.query.section || "all").toString().toLowerCase();
//         // allowed: 'product', 'banner', 'offers', 'all'

//         // ✅ Only active promotions (not scheduled, not expired)
//         const baseFilter = {
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now },
//         };

//         const promos = await Promotion.find(baseFilter)
//             .select(
//                 "campaignName description images promotionType promotionConfig discountUnit discountValue scope startDate endDate targetAudience categories brands products tags displaySection"
//             )
//             .populate("categories.category", "name slug")
//             .populate("brands.brand", "name slug")
//             .lean();

//         // ✅ Strict filtering by displaySection
//         let filtered = promos;
//         if (section !== "all") {
//             filtered = promos.filter(
//                 (p) => Array.isArray(p.displaySection) && p.displaySection.includes(section)
//             );
//         }

//         // ✅ Normalize for frontend
//         const payload = filtered.map((p) => {
//             let discountPercent = null;
//             let discountAmount = null;
//             let discountLabel = "";

//             if (p.promotionType === "discount" && p.discountValue) {
//                 if (p.discountUnit === "percent") {
//                     discountPercent = Number(p.discountValue) || 0;
//                     discountLabel = `${discountPercent}% OFF`;
//                 } else {
//                     discountAmount = Number(p.discountValue) || 0;
//                     discountLabel = `₹${asMoney(discountAmount)} OFF`;
//                 }
//             } else if (p.promotionType === "tieredDiscount") {
//                 const tiers = Array.isArray(p.promotionConfig?.tiers)
//                     ? p.promotionConfig.tiers
//                     : [];
//                 const top = tiers.length
//                     ? tiers.reduce((s, t) => Math.max(s, Number(t.discountPercent || 0)), 0)
//                     : 0;
//                 discountLabel = top ? `Buy More, Save up to ${top}%` : "Buy More, Save More";
//             } else if (p.promotionType === "bogo") {
//                 const bq = p.promotionConfig?.buyQty ?? 1;
//                 const gq = p.promotionConfig?.getQty ?? 1;
//                 discountLabel = `BOGO ${bq}+${gq}`;
//             } else if (p.promotionType === "paymentOffer") {
//                 const provider = p.promotionConfig?.provider || "";
//                 const pct = Number(p.promotionConfig?.discountPercent || 0);
//                 discountLabel = provider ? `${provider} ${pct}% off` : `Payment Offer ${pct}%`;
//             } else if (p.promotionType === "newUser") {
//                 discountLabel = `New User ${p.promotionConfig?.discountPercent || ""}%`;
//             } else if (p.promotionType === "freeShipping") {
//                 discountLabel = `Free Shipping over ₹${p.promotionConfig?.minOrderValue || 0}`;
//             }

//             const isScheduled = p.startDate > now;

//             return {
//                 _id: p._id,
//                 title: p.campaignName,
//                 description: p.description || "",
//                 images: p.images || [],
//                 type: p.promotionType,
//                 tags: p.tags || [],
//                 scope: p.scope,
//                 discountPercent,
//                 discountAmount,
//                 discountLabel,
//                 isScheduled,
//                 countdown: getCountdown(p.endDate),
//                 promoMeta: {
//                     categories: (p.categories || []).map((c) => ({
//                         id: c.category?._id,
//                         slug: c.slug || c.category?.slug,
//                         name: c.category?.name,
//                     })),
//                     brands: (p.brands || []).map((b) => ({
//                         id: b.brand?._id,
//                         slug: b.slug || b.brand?.slug,
//                         name: b.brand?.name,
//                     })),
//                     products: (p.products || []).map((x) =>
//                         typeof x === "object" ? String(x._id ?? x) : String(x)
//                     ),
//                     promotionConfig: p.promotionConfig || {},
//                     startDate: p.startDate,
//                     endDate: p.endDate,
//                 },
//             };
//         });

//         return res.json(payload);
//     } catch (err) {
//         console.error("getActivePromotionsForUsers error:", err);
//         return res.status(500).json({ message: "Failed to load promotions", error: err.message });
//     }
// };

// export const getPromotionProducts = async (req, res) => {
//     try {
//         const { id } = req.params;
//         if (!isObjectId(id)) {
//             return res.status(400).json({ message: "Invalid promotion id" });
//         }

//         let { page = 1, limit = 12, sort = "recent", search = "", ...queryFilters } = req.query;
//         page = Number(page) || 1;
//         limit = Math.min(Number(limit) || 12, 50);
//         search = search.trim();

//         // 🔹 Fetch promotion with populated refs
//         const promo = await Promotion.findById(id)
//             .populate("categories.category", "_id name slug")
//             .populate("products", "_id name category")
//             .populate("brands.brand", "_id name slug")
//             .lean();

//         if (!promo) return res.status(404).json({ message: "Promotion not found" });

//         // 🔹 Base filter setup
//         const baseMatch = { isPublished: true };

//         if (promo.scope === "category" && promo.categories?.length) {
//             const catIds = promo.categories
//                 .map(c => c?.category?._id ?? c)
//                 .filter(Boolean)
//                 .map(id => new mongoose.Types.ObjectId(id));
//             if (catIds.length) baseMatch.category = { $in: catIds };
//         } else if (promo.scope === "product" && promo.products?.length) {
//             const prodIds = promo.products
//                 .map(p => p._id ?? p)
//                 .filter(Boolean)
//                 .map(id => new mongoose.Types.ObjectId(id));
//             if (prodIds.length) baseMatch._id = { $in: prodIds };
//         } else if (promo.scope === "brand" && promo.brands?.length) {
//             const brandIds = promo.brands
//                 .map(b => b?.brand?._id ?? b._id ?? b)
//                 .filter(Boolean)
//                 .map(id => new mongoose.Types.ObjectId(id));
//             if (brandIds.length) baseMatch.brand = { $in: brandIds };
//         }

//         // 🔹 Text search
//         if (search) baseMatch.name = { $regex: escapeRegex(search), $options: "i" };

//         // 🔹 Normalize filters
//         const filters = normalizeFilters(queryFilters);

//         // ✅ Resolve categoryIds (could be slugs or ObjectIds)
//         if (filters.categoryIds?.length) {
//             const catResolved = await Category.find({
//                 $or: [
//                     { _id: { $in: filters.categoryIds.filter(isObjectId).map(id => new mongoose.Types.ObjectId(id)) } },
//                     { slug: { $in: filters.categoryIds.filter(id => !isObjectId(id)) } }
//                 ],
//                 isActive: true
//             }).select("_id");
//             if (catResolved.length) baseMatch.category = { $in: catResolved.map(c => c._id) };
//         }

//         // ✅ Resolve brandIds (could be slugs or ObjectIds)
//         if (filters.brandIds?.length) {
//             const brandResolved = await Brand.find({
//                 $or: [
//                     { _id: { $in: filters.brandIds.filter(isObjectId).map(id => new mongoose.Types.ObjectId(id)) } },
//                     { slug: { $in: filters.brandIds.filter(id => !isObjectId(id)) } }
//                 ],
//                 isActive: true
//             }).select("_id");
//             if (brandResolved.length) baseMatch.brand = { $in: brandResolved.map(b => b._id) };
//         }

//         // ✅ Resolve skinTypes (if present)
//         if (filters.skinTypes?.length) {
//             const skinDocs = await SkinType.find({
//                 name: { $in: filters.skinTypes.map(s => new RegExp(`^${s}$`, "i")) }
//             }).select("_id").lean();
//             filters.skinTypes = skinDocs.map(s => s._id.toString());
//         }

//         // 🔹 Combine with dynamic filters
//         const dynamicFilters = await applyDynamicFilters(filters);
//         const finalFilter = { ...baseMatch, ...dynamicFilters };

//         // 🔹 Sorting logic
//         const sortOptions = {
//             recent: { createdAt: -1 },
//             priceLowToHigh: { price: 1 },
//             priceHighToLow: { price: -1 },
//             rating: { avgRating: -1 },
//             discount: { discountPercent: -1 }
//         };

//         // 🔹 Count & Fetch
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

//         // 🔹 Active promotions
//         const now = new Date();
//         const activePromotions = await Promotion.find({
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now }
//         }).lean();

//         // 🔹 Enrich products
//         const enrichedProducts = await enrichProductsUnified(rawProducts, [promo, ...activePromotions]);

//         // 🔹 Attach brand/category/etc.
//         const productsWithRelations = enrichedProducts.map((prod, i) => ({
//             ...prod,
//             brand: rawProducts[i].brand || null,
//             category: rawProducts[i].category || null,
//             skinTypes: rawProducts[i].skinTypes || [],
//             formulation: rawProducts[i].formulation || null
//         }));

//         // 🔹 Add promo badge
//         productsWithRelations.forEach(p => {
//             const maxDiscountPercent = Math.max(...(p.variants?.map(v => v.discountPercent) || [0]));
//             p.badge = maxDiscountPercent > 0 ? `${maxDiscountPercent}% Off` : null;
//             p.promoMessage = p.badge ? `Save ${p.badge} on this product` : null;
//         });

//         // 🔹 Collect unique categories & brands
//         const uniqueCategoryIds = await Product.distinct("category", finalFilter);
//         const uniqueBrandIds = await Product.distinct("brand", finalFilter);

//         const [categories, brands] = await Promise.all([
//             Category.find({ _id: { $in: uniqueCategoryIds }, isActive: true }).select("name slug").lean(),
//             Brand.find({ _id: { $in: uniqueBrandIds }, isActive: true }).select("name slug logo").lean()
//         ]);

//         // ✅ Final response
//         return res.status(200).json({
//             promoMeta: promo,
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
//                 ? `Showing products for promotion "${promo.name || "Offer"}".`
//                 : `No products found under this promotion.`
//         });

//     } catch (err) {
//         console.error("🔥 getPromotionProducts error:", err);
//         return res.status(500).json({
//             message: "Failed to fetch promotion products",
//             error: err.message
//         });
//     }
// };



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
import redis from "../../middlewares/utils/redis.js";

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
        const catId = product.category?.toString?.();
        const matchesCat = promo.categories.some((c) => c?.category?.toString?.() === catId);
        const matchesHierarchy = Array.isArray(product.categoryHierarchy)
            ? product.categoryHierarchy.some((cid) =>
                promo.categories.some((c) => c?.category?.toString?.() === cid?.toString?.())
            )
            : false;
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
                "campaignName description images promotionType promotionConfig discountUnit discountValue scope startDate endDate targetAudience categories brands products tags displaySection"
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
//         const { id } = req.params;
//         if (!isObjectId(id)) {
//             return res.status(400).json({ message: "Invalid promotion id" });
//         }

//         let { page = 1, limit = 12, sort = "recent", search = "", ...queryFilters } = req.query;
//         page = Number(page) || 1;
//         limit = Math.min(Number(limit) || 12, 50);
//         search = search.trim();

//         // Redis cache key per promo + incoming query to preserve pagination/filter combination
//         const redisKey = `promo:products:${id}:${JSON.stringify(req.query)}`;
//         try {
//             const cached = await redis.get(redisKey);
//             if (cached) {
//                 return res.status(200).json(JSON.parse(cached));
//             }
//         } catch (e) {
//             // Continue if redis fails
//             // console.warn("Redis get failed for promo products:", e.message);
//         }

//         // 🔹 Fetch promotion with populated refs
//         const promo = await Promotion.findById(id)
//             .populate("categories.category", "_id name slug")
//             .populate("products", "_id name category")
//             .populate("brands.brand", "_id name slug")
//             .lean();

//         if (!promo) return res.status(404).json({ message: "Promotion not found" });

//         // 🔹 Base filter setup
//         const baseMatch = { isPublished: true };


//         // 🔹 Apply promotionConfig filters
//         if (promo.promotionConfig) {
//             if (promo.promotionConfig.maxProductPrice) {
//                 baseMatch.price = { $lte: promo.promotionConfig.maxProductPrice };
//             }
//             if (promo.promotionConfig.minProductPrice) {
//                 baseMatch.price = {
//                     ...baseMatch.price,
//                     $gte: promo.promotionConfig.minProductPrice
//                 };
//             }
//             if (promo.promotionConfig.minDiscount) {
//                 baseMatch.discountPercent = { $gte: promo.promotionConfig.minDiscount };
//             }
//         }


//         if (promo.scope === "category" && promo.categories?.length) {
//             const catIds = promo.categories
//                 .map(c => c?.category?._id ?? c)
//                 .filter(Boolean)
//                 .map(id => new mongoose.Types.ObjectId(id));
//             if (catIds.length) baseMatch.category = { $in: catIds };
//         } else if (promo.scope === "product" && promo.products?.length) {
//             const prodIds = promo.products
//                 .map(p => p._id ?? p)
//                 .filter(Boolean)
//                 .map(id => new mongoose.Types.ObjectId(id));
//             if (prodIds.length) baseMatch._id = { $in: prodIds };
//         } else if (promo.scope === "brand" && promo.brands?.length) {
//             const brandIds = promo.brands
//                 .map(b => b?.brand?._id ?? b._id ?? b)
//                 .filter(Boolean)
//                 .map(id => new mongoose.Types.ObjectId(id));
//             if (brandIds.length) baseMatch.brand = { $in: brandIds };
//         }

//         // 🔹 Text search
//         if (search) baseMatch.name = { $regex: escapeRegex(search), $options: "i" };

//         // 🔹 Normalize filters
//         const filters = normalizeFilters(queryFilters);

//         // ✅ Resolve categoryIds (could be slugs or ObjectIds)
//         if (filters.categoryIds?.length) {
//             const catResolved = await Category.find({
//                 $or: [
//                     { _id: { $in: filters.categoryIds.filter(isObjectId).map(id => new mongoose.Types.ObjectId(id)) } },
//                     { slug: { $in: filters.categoryIds.filter(id => !isObjectId(id)) } }
//                 ],
//                 isActive: true
//             }).select("_id");
//             if (catResolved.length) baseMatch.category = { $in: catResolved.map(c => c._id) };
//         }

//         // ✅ Resolve brandIds (could be slugs or ObjectIds)
//         if (filters.brandIds?.length) {
//             const brandResolved = await Brand.find({
//                 $or: [
//                     { _id: { $in: filters.brandIds.filter(isObjectId).map(id => new mongoose.Types.ObjectId(id)) } },
//                     { slug: { $in: filters.brandIds.filter(id => !isObjectId(id)) } }
//                 ],
//                 isActive: true
//             }).select("_id");
//             if (brandResolved.length) baseMatch.brand = { $in: brandResolved.map(b => b._id) };
//         }

//         // ✅ Resolve skinTypes (if present)
//         if (filters.skinTypes?.length) {
//             const skinDocs = await SkinType.find({
//                 name: { $in: filters.skinTypes.map(s => new RegExp(`^${s}$`, "i")) }
//             }).select("_id").lean();
//             filters.skinTypes = skinDocs.map(s => s._id.toString());
//         }

//         // 🔹 Combine with dynamic filters
//         const dynamicFilters = await applyDynamicFilters(filters);
//         const finalFilter = { ...baseMatch, ...dynamicFilters };

//         // 🔹 Sorting logic
//         const sortOptions = {
//             recent: { createdAt: -1 },
//             priceLowToHigh: { price: 1 },
//             priceHighToLow: { price: -1 },
//             rating: { avgRating: -1 },
//             discount: { discountPercent: -1 }
//         };

//         // 🔹 Count & Fetch
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

//         // 🔹 Active promotions — use shared Redis cache to reduce DB calls
//         const activePromotionsCacheKey = `promotions:active`;
//         let activePromotions = null;
//         try {
//             const cachedPromos = await redis.get(activePromotionsCacheKey);
//             if (cachedPromos) {
//                 activePromotions = JSON.parse(cachedPromos);
//             } else {
//                 const now = new Date();
//                 activePromotions = await Promotion.find({
//                     status: "active",
//                     startDate: { $lte: now },
//                     endDate: { $gte: now }
//                 }).lean();
//                 // very short TTL so expiration/deletes propagate quickly across instances
//                 await redis.set(activePromotionsCacheKey, JSON.stringify(activePromotions), "EX", 5); // 5s
//             }
//         } catch (e) {
//             // if redis fails just fetch from DB
//             const now = new Date();
//             activePromotions = await Promotion.find({
//                 status: "active",
//                 startDate: { $lte: now },
//                 endDate: { $gte: now }
//             }).lean();
//         }

//         // 🔹 Enrich products
//         const enrichedProducts = await enrichProductsUnified(rawProducts, [promo, ...activePromotions]);

//         // 🔹 Attach brand/category/etc.
//         const productsWithRelations = enrichedProducts.map((prod, i) => ({
//             ...prod,
//             brand: rawProducts[i].brand || null,
//             category: rawProducts[i].category || null,
//             skinTypes: rawProducts[i].skinTypes || [],
//             formulation: rawProducts[i].formulation || null
//         }));

//         // 🔹 Add promo badge
//         productsWithRelations.forEach(p => {
//             const maxDiscountPercent = Math.max(...(p.variants?.map(v => v.discountPercent) || [0]));
//             p.badge = maxDiscountPercent > 0 ? `${maxDiscountPercent}% Off` : null;
//             p.promoMessage = p.badge ? `Save ${p.badge} on this product` : null;
//         });

//         // 🔹 Collect unique categories & brands
//         const uniqueCategoryIds = await Product.distinct("category", finalFilter);
//         const uniqueBrandIds = await Product.distinct("brand", finalFilter);

//         const [categories, brands] = await Promise.all([
//             Category.find({ _id: { $in: uniqueCategoryIds }, isActive: true }).select("name slug").lean(),
//             Brand.find({ _id: { $in: uniqueBrandIds }, isActive: true }).select("name slug logo").lean()
//         ]);

//         // prepare final payload (same shape as before)
//         const responsePayload = {
//             promoMeta: promo,
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
//                 ? `Showing products for promotion "${promo.name || "Offer"}".`
//                 : `No products found under this promotion.`
//         };

//         // Cache the response for this promo+query so subsequent identical requests are fast.
//         try {
//             await redis.set(redisKey, JSON.stringify(responsePayload), "EX", 60); // 60s
//         } catch (e) {
//             // ignore redis set errors
//         }

//         // ✅ Final response
//         return res.status(200).json(responsePayload);

//     } catch (err) {
//         console.error("🔥 getPromotionProducts error:", err);
//         return res.status(500).json({
//             message: "Failed to fetch promotion products",
//             error: err.message
//         });
//     }
// };
export const getPromotionProducts = async (req, res) => {
    try {
        const { id } = req.params;
        if (!isObjectId(id)) {
            return res.status(400).json({ message: "Invalid promotion id" });
        }

        let { page = 1, limit = 12, sort = "recent", search = "", ...queryFilters } = req.query;
        page = Number(page) || 1;
        limit = Math.min(Number(limit) || 12, 50);
        search = search.trim();

        const redisKey = `promo:products:${id}:${JSON.stringify(req.query)}`;
        try {
            const cached = await redis.get(redisKey);
            if (cached) return res.status(200).json(JSON.parse(cached));
        } catch { }

        // 🔹 Fetch promotion
        const promo = await Promotion.findById(id)
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

        // ----------------------------------------------
        // 🔹 SORTING
        // ----------------------------------------------
        const sortOptions = {
            recent: { createdAt: -1 },
            priceLowToHigh: { "variants.effectiveFinalPrice": 1 },
            priceHighToLow: { "variants.effectiveFinalPrice": -1 },
            rating: { avgRating: -1 },
            discount: { discountPercent: -1 }
        };

        // ----------------------------------------------
        // 🔹 Count & Fetch
        // ----------------------------------------------
        const total = await Product.countDocuments(finalFilter);

        const rawProducts = await Product.find(finalFilter)
            .populate("brand", "name slug logo isActive")
            .populate("category", "name slug banner isActive")
            .populate("skinTypes", "name slug isActive")
            .populate("formulation", "name slug isActive")
            .sort(sortOptions[sort] || { createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
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

        const payload = {
            promoMeta: promo,
            products: productsWithRelations,
            categories,
            brands,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit)
            },
            message: productsWithRelations.length
                ? `Showing products for promotion "${promo.name}"`
                : "No products found under this promotion"
        };

        await redis.set(redisKey, JSON.stringify(payload), "EX", 60);

        return res.status(200).json(payload);

    } catch (err) {
        console.error("🔥 getPromotionProducts error:", err);
        return res.status(500).json({ message: "Failed to fetch promotion products", error: err.message });
    }
};
