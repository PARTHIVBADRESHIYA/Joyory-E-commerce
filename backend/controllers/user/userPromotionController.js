// controllers/user/promotionController.js
import Promotion from "../../models/Promotion.js";
import Product from "../../models/Product.js";
import Brand from "../../models/Brand.js";
import mongoose from "mongoose";
import { formatProductCard } from "../../middlewares/utils/recommendationService.js";
import { fetchProducts } from "../../middlewares/services/productQueryBuilder.js";
import { normalizeFilters, applyDynamicFilters } from "../../controllers/user/userProductController.js";
import { applyPromotions } from "../../middlewares/services/promotionEngine.js";
import { enrichProductWithStockAndOptions } from "../../middlewares/services/productHelpers.js";
import { calculateVariantPrices } from "../../middlewares/services/promotionHelper.js";

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

        return res.json(payload);
    } catch (err) {
        console.error("getActivePromotionsForUsers error:", err);
        return res.status(500).json({ message: "Failed to load promotions", error: err.message });
    }
};

// export const getPromotionProducts = async (req, res) => {
//     try {
//         const { id } = req.params;
//         if (!isObjectId(id)) return res.status(400).json({ message: "Invalid promotion id" });

//         const page = Math.max(1, parseInt(req.query.page ?? "1", 10));
//         const rawLimit = parseInt(req.query.limit ?? "12", 10);
//         const limit = Math.min(Math.max(1, rawLimit), 12);
//         const search = (req.query.search ?? "").toString().trim();
//         const sort = (req.query.sort ?? "recent").toString().trim();

//         // 🔹 Load promotion
//         const promo = await Promotion.findById(id)
//             .populate("categories.category", "_id name slug")
//             .populate("products", "_id name category")
//             .lean();
//         if (!promo) return res.status(404).json({ message: "Promotion not found" });

//         const promoType = promo.promotionType;
//         const promoValue = Number(promo.discountValue || 0);

//         // 🔹 Build product filter
//         const baseMatch = { isPublished: true };
//         if (promo.scope === "category" && promo.categories?.length) {
//             const catIds = promo.categories
//                 .map(c => c?.category?._id ?? c)
//                 .filter(Boolean)
//                 .map(id => new mongoose.Types.ObjectId(id));
//             if (catIds.length) baseMatch.category = { $in: catIds };
//         } else if (promo.scope === "product" && promo.products?.length) {
//             const prodIds = promo.products.map(p => p._id ?? p).filter(Boolean).map(id => new mongoose.Types.ObjectId(id));
//             if (prodIds.length) baseMatch._id = { $in: prodIds };
//         } else if (promo.scope === "brand" && promo.brands?.length) {
//             const brandIds = promo.brands
//                 .map(b => b?.brand?._id ?? b._id ?? b)
//                 .filter(Boolean)
//                 .map(id => new mongoose.Types.ObjectId(id));
//             if (brandIds.length) baseMatch.brand = { $in: brandIds };
//         }

//         if (search) baseMatch.name = { $regex: escapeRegex(search), $options: "i" };

//         const filters = normalizeFilters(req.query);
//         const dynamicFilters = applyDynamicFilters(filters);
//         const finalFilter = { ...baseMatch, ...dynamicFilters };

//         // 🔹 Fetch products
//         const total = await Product.countDocuments(finalFilter);
//         const rawProducts = await Product.find(finalFilter)
//             .sort(
//                 sort === "price_asc" ? { price: 1 } :
//                 sort === "price_desc" ? { price: -1 } :
//                 sort === "discount" ? { discountPercent: -1 } :
//                 { createdAt: -1 }
//             )
//             .skip((page - 1) * limit)
//             .limit(limit)
//             .lean();

//         const now = new Date();
//         const promotions = await Promotion.find({
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now }
//         }).lean();

//         // 🔹 Process products & variants
//         const products = await Promise.all(rawProducts.map(async p => {
//             const enrichedProduct = enrichProductWithStockAndOptions(p, promotions);

//             const variants = (enrichedProduct.variants?.length ? enrichedProduct.variants : [{
//                 sku: p._id.toString(),
//                 shadeName: p.variant || "",
//                 images: p.images?.length ? p.images : [],
//                 stock: p.quantity ?? 0,
//                 price: p.price,
//                 discountedPrice: p.discountedPrice ?? p.price
//             }]).map(v => {
//                 const basePrice = v.price ?? p.price;
//                 const variantDiscounted = v.discountedPrice ?? basePrice;
//                 const priceFloor = p.buyingPrice ?? 0;

//                 let finalDiscountedPrice = variantDiscounted;

//                 // 🔹 Promotion logic: apply only if better than current variant discounted price
//                 if (promoType === "discount" && promoValue > 0) {
//                     let promoPrice;
//                     if (promo.discountUnit === "percent") {
//                         promoPrice = basePrice * (1 - promoValue / 100);
//                     } else {
//                         promoPrice = basePrice - promoValue;
//                     }

//                     promoPrice = Math.max(promoPrice, priceFloor);

//                     if (promoPrice < variantDiscounted) {
//                         finalDiscountedPrice = promoPrice;
//                     }
//                 }

//                 // Stock status
//                 let status = "inStock";
//                 let message = "In-stock";
//                 if (v.stock <= 0) { status = "outOfStock"; message = "No stock available"; }
//                 else if (v.thresholdValue && v.stock <= v.thresholdValue) { status = "lowStock"; message = `Few left (${v.stock})`; }

//                 return {
//                     ...v,
//                     originalPrice: Math.round(basePrice),
//                     discountedPrice: Math.round(finalDiscountedPrice),
//                     displayPrice: Math.round(finalDiscountedPrice),
//                     discountAmount: Math.max(0, Math.round(basePrice - finalDiscountedPrice)),
//                     discountPercent: basePrice > 0 ? Math.floor(((basePrice - finalDiscountedPrice) / basePrice) * 100) : 0,
//                     status,
//                     message
//                 };
//             });

//             const card = await formatProductCard({ ...enrichedProduct, variants });

//             // Badge / promo message
//             let badge = null, promoMessage = null;
//             const maxDiscountPercent = Math.max(...variants.map(v => v.discountPercent));
//             if (maxDiscountPercent > 0) {
//                 badge = `${maxDiscountPercent}% Off`;
//                 promoMessage = `Save ${badge} on this product`;
//             }

//             return {
//                 ...card,
//                 brand: p.brand ? await Brand.findById(p.brand).select("_id name slug").lean() : null,
//                 variants,
//                 badge,
//                 promoMessage
//             };
//         }));

//         return res.json({
//             products,
//             pagination: {
//                 page,
//                 limit,
//                 total,
//                 totalPages: Math.ceil(total / limit),
//                 hasMore: page < Math.ceil(total / limit)
//             },
//             promoMeta: promo
//         });

//     } catch (err) {
//         console.error("getPromotionProducts error:", err);
//         return res.status(500).json({ message: "Failed to fetch promotion products", error: err.message });
//     }
// };
export const getPromotionProducts = async (req, res) => {
    try {
        const { id } = req.params;
        if (!isObjectId(id)) return res.status(400).json({ message: "Invalid promotion id" });

        const page = Math.max(1, parseInt(req.query.page ?? "1", 10));
        const rawLimit = parseInt(req.query.limit ?? "12", 10);
        const limit = Math.min(Math.max(1, rawLimit), 12);
        const search = (req.query.search ?? "").toString().trim();
        const sort = (req.query.sort ?? "recent").toString().trim();

        const promo = await Promotion.findById(id)
            .populate("categories.category", "_id name slug")
            .populate("products", "_id name category")
            .lean();
        if (!promo) return res.status(404).json({ message: "Promotion not found" });

        const baseMatch = { isPublished: true };
        if (promo.scope === "category" && promo.categories?.length) {
            const catIds = promo.categories
                .map(c => c?.category?._id ?? c)
                .filter(Boolean)
                .map(id => new mongoose.Types.ObjectId(id));
            if (catIds.length) baseMatch.category = { $in: catIds };
        } else if (promo.scope === "product" && promo.products?.length) {
            const prodIds = promo.products.map(p => p._id ?? p).filter(Boolean).map(id => new mongoose.Types.ObjectId(id));
            if (prodIds.length) baseMatch._id = { $in: prodIds };
        } else if (promo.scope === "brand" && promo.brands?.length) {
            const brandIds = promo.brands
                .map(b => b?.brand?._id ?? b._id ?? b)
                .filter(Boolean)
                .map(id => new mongoose.Types.ObjectId(id));
            if (brandIds.length) baseMatch.brand = { $in: brandIds };
        }

        if (search) baseMatch.name = { $regex: escapeRegex(search), $options: "i" };

        const filters = normalizeFilters(req.query);
        const dynamicFilters = applyDynamicFilters(filters);
        const finalFilter = { ...baseMatch, ...dynamicFilters };

        const total = await Product.countDocuments(finalFilter);
        const rawProducts = await Product.find(finalFilter)
            .sort(
                sort === "price_asc" ? { price: 1 } :
                sort === "price_desc" ? { price: -1 } :
                sort === "discount" ? { discountPercent: -1 } :
                { createdAt: -1 }
            )
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const now = new Date();
        const promotions = await Promotion.find({
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).lean();

        const products = await Promise.all(rawProducts.map(async p => {
            const enrichedProduct = enrichProductWithStockAndOptions(p, promotions);

            // 🔹 Use helper to calculate variants
            const variants = calculateVariantPrices(enrichedProduct.variants, enrichedProduct, [promo, ...promotions]);

            const card = await formatProductCard({ ...enrichedProduct, variants });

            let badge = null, promoMessage = null;
            const maxDiscountPercent = Math.max(...variants.map(v => v.discountPercent));
            if (maxDiscountPercent > 0) {
                badge = `${maxDiscountPercent}% Off`;
                promoMessage = `Save ${badge} on this product`;
            }

            return {
                ...card,
                brand: p.brand ? await Brand.findById(p.brand).select("_id name slug").lean() : null,
                variants,
                badge,
                promoMessage
            };
        }));

        return res.json({
            products,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit)
            },
            promoMeta: promo
        });

    } catch (err) {
        console.error("getPromotionProducts error:", err);
        return res.status(500).json({ message: "Failed to fetch promotion products", error: err.message });
    }
};
export const applyPromotionsToCart = async (req, res) => {
    try {
        const itemsInput = Array.isArray(req.body.items) ? req.body.items : [];
        const ctx = {
            userContext: req.body.userContext || {},
            paymentMethod: req.body.paymentMethod || "",
        };

        const result = await applyPromotions(itemsInput, ctx);
        res.json(result);
    } catch (err) {
        console.error("applyPromotionsToCart error:", err);
        res.status(500).json({ message: "Failed to apply promotions" });
    }
};