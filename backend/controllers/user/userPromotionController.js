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
export const productMatchesPromo = (product, promo) => {
    if (!product || !promo) return false;

    // 🧠 Normalize IDs safely
    const pid = String(product._id || "");
    const categoryId = String(product.category?._id || product.category || "");
    const brandId = String(product.brand?._id || product.brand || "");

    // Normalize promo arrays
    const promoProducts = (promo.products || []).map(p => String(p.product || p));
    const promoCategories = (promo.categories || []).map(c => String(c.category || c));
    const promoBrands = (promo.brands || []).map(b => String(b.brand || b));

    // ✅ 1️⃣ Product-specific match
    if (promoProducts.length && promoProducts.includes(pid)) {
        console.log(`✅ Matched by Product: ${product.name}`);
        return true;
    }

    // ✅ 2️⃣ Category match (handles nested hierarchy)
    if (promoCategories.length) {
        const productCatIds = new Set();

        // Add direct category
        if (categoryId) productCatIds.add(String(categoryId));

        // Add all hierarchy categories
        if (Array.isArray(product.categoryHierarchy)) {
            product.categoryHierarchy.forEach(c => {
                const cid = String(c._id || c.id || c.category || c);
                if (cid) productCatIds.add(cid);
            });
        }

        // Match check
        const matched = [...productCatIds].some(cid => promoCategories.includes(cid));

        if (matched) {
            console.log(`✅ Matched by Category: ${product.name}`);
            return true;
        } else if (process.env.NODE_ENV === "development") {
            console.log("❌ Not matched category", {
                promoCats: promoCategories,
                productCats: [...productCatIds],
                productName: product.name,
            });
        }
    }

    // ✅ 3️⃣ Brand match
    if (promoBrands.length && brandId) {
        const matched = promoBrands.includes(String(brandId));
        if (matched) {
            console.log(`✅ Matched by Brand: ${product.name}`);
            return true;
        }
    }

    // ✅ 4️⃣ Global promo (applies to all products)
    const isGlobal = !promoProducts.length && !promoCategories.length && !promoBrands.length;
    if (isGlobal) {
        console.log("✅ Global Promo applies to all products");
        return true;
    }

    // ❌ No match found
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
                const bq = p.promotionConfig?.buyQty || p.promotionConfig?.buy || 1;
                const gq = p.promotionConfig?.getQty || p.promotionConfig?.get || 1;
                discountLabel = `Buy ${bq} Get ${gq} Free`;
            } else if (p.promotionType === "cartValue") {
                discountLabel = `Extra ${p.promotionConfig?.discountPercent || 0}% off on orders over ₹${p.promotionConfig?.minOrderValue || p.conditions?.minOrderValue || 0}`;
            } else if (p.promotionType === "gift") {
                discountLabel = `Free gift on orders over ₹${p.promotionConfig?.minOrderValue || p.conditions?.minOrderValue || 0}`;
            } else if (p.promotionType === "freeShipping") {
                discountLabel = `Free shipping over ₹${p.promotionConfig?.minOrderValue || p.conditions?.minOrderValue || 0}`;
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
                    conditions: p.conditions || {},
                    allowStacking: !!p.allowStacking,
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

//         const promo = await Promotion.findById(id)
//             .populate("categories.category", "_id name slug")
//             .populate("products", "_id name category")
//             .lean();
//         if (!promo) return res.status(404).json({ message: "Promotion not found" });

//         // 🔹 Base filter
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
//             .populate("brand", "name slug isActive")
//             .populate("category", "name slug  isActive")
//             .populate("skinTypes", "name slug isActive")
//             .populate("formulation", "name slug isActive")
//             .sort(
//                 sort === "price_asc" ? { price: 1 } :
//                     sort === "price_desc" ? { price: -1 } :
//                         sort === "discount" ? { discountPercent: -1 } :
//                             { createdAt: -1 }
//             )
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

//         // 🔹 Enrich products using the unified helper
//         const products = await enrichProductsUnified(rawProducts, [promo, ...activePromotions]);

//         // ✅ Reattach brand, category, skinTypes, and formulation
//         const productsWithRelations = products.map((prod, i) => ({
//             ...prod,
//             brand: rawProducts[i].brand || null,
//             category: rawProducts[i].category || null,
//             skinTypes: rawProducts[i].skinTypes || [],
//             formulation: rawProducts[i].formulation || null,
//         }));


//         // 🔹 Optional: add promo badge
//         products.forEach(p => {
//             const maxDiscountPercent = Math.max(...(p.variants?.map(v => v.discountPercent) || [0]));
//             p.badge = maxDiscountPercent > 0 ? `${maxDiscountPercent}% Off` : null;
//             p.promoMessage = p.badge ? `Save ${p.badge} on this product` : null;
//         });

//         return res.json({
//             products: productsWithRelations,
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
        if (!isObjectId(id)) {
            return res.status(400).json({ message: "Invalid promotion id" });
        }

        let { page = 1, limit = 12, sort = "recent", search = "", ...queryFilters } = req.query;
        page = Number(page) || 1;
        limit = Math.min(Number(limit) || 12, 50);
        search = search.trim();

        // 🔹 Fetch promotion with populated refs
        const promo = await Promotion.findById(id)
            .populate("categories.category", "_id name slug")
            .populate("products", "_id name category")
            .populate("brands.brand", "_id name slug")
            .lean();

        if (!promo) return res.status(404).json({ message: "Promotion not found" });

        // 🔹 Base filter setup
        const baseMatch = { isPublished: true };

        if (promo.scope === "category" && promo.categories?.length) {
            const catIds = promo.categories
                .map(c => c?.category?._id ?? c)
                .filter(Boolean)
                .map(id => new mongoose.Types.ObjectId(id));
            if (catIds.length) baseMatch.category = { $in: catIds };
        } else if (promo.scope === "product" && promo.products?.length) {
            const prodIds = promo.products
                .map(p => p._id ?? p)
                .filter(Boolean)
                .map(id => new mongoose.Types.ObjectId(id));
            if (prodIds.length) baseMatch._id = { $in: prodIds };
        } else if (promo.scope === "brand" && promo.brands?.length) {
            const brandIds = promo.brands
                .map(b => b?.brand?._id ?? b._id ?? b)
                .filter(Boolean)
                .map(id => new mongoose.Types.ObjectId(id));
            if (brandIds.length) baseMatch.brand = { $in: brandIds };
        }

        // 🔹 Text search
        if (search) baseMatch.name = { $regex: escapeRegex(search), $options: "i" };

        // 🔹 Normalize filters
        const filters = normalizeFilters(queryFilters);

        // ✅ Resolve categoryIds (could be slugs or ObjectIds)
        if (filters.categoryIds?.length) {
            const catResolved = await Category.find({
                $or: [
                    { _id: { $in: filters.categoryIds.filter(isObjectId).map(id => new mongoose.Types.ObjectId(id)) } },
                    { slug: { $in: filters.categoryIds.filter(id => !isObjectId(id)) } }
                ],
                isActive: true
            }).select("_id");
            if (catResolved.length) baseMatch.category = { $in: catResolved.map(c => c._id) };
        }

        // ✅ Resolve brandIds (could be slugs or ObjectIds)
        if (filters.brandIds?.length) {
            const brandResolved = await Brand.find({
                $or: [
                    { _id: { $in: filters.brandIds.filter(isObjectId).map(id => new mongoose.Types.ObjectId(id)) } },
                    { slug: { $in: filters.brandIds.filter(id => !isObjectId(id)) } }
                ],
                isActive: true
            }).select("_id");
            if (brandResolved.length) baseMatch.brand = { $in: brandResolved.map(b => b._id) };
        }

        // ✅ Resolve skinTypes (if present)
        if (filters.skinTypes?.length) {
            const skinDocs = await SkinType.find({
                name: { $in: filters.skinTypes.map(s => new RegExp(`^${s}$`, "i")) }
            }).select("_id").lean();
            filters.skinTypes = skinDocs.map(s => s._id.toString());
        }

        // 🔹 Combine with dynamic filters
        const dynamicFilters = await applyDynamicFilters(filters);
        const finalFilter = { ...baseMatch, ...dynamicFilters };

        // 🔹 Sorting logic
        const sortOptions = {
            recent: { createdAt: -1 },
            priceLowToHigh: { price: 1 },
            priceHighToLow: { price: -1 },
            rating: { avgRating: -1 },
            discount: { discountPercent: -1 }
        };

        // 🔹 Count & Fetch
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

        // 🔹 Active promotions
        const now = new Date();
        const activePromotions = await Promotion.find({
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now }
        }).lean();

        // 🔹 Enrich products
        const enrichedProducts = await enrichProductsUnified(rawProducts, [promo, ...activePromotions]);

        // 🔹 Attach brand/category/etc.
        const productsWithRelations = enrichedProducts.map((prod, i) => ({
            ...prod,
            brand: rawProducts[i].brand || null,
            category: rawProducts[i].category || null,
            skinTypes: rawProducts[i].skinTypes || [],
            formulation: rawProducts[i].formulation || null
        }));

        // 🔹 Add promo badge
        productsWithRelations.forEach(p => {
            const maxDiscountPercent = Math.max(...(p.variants?.map(v => v.discountPercent) || [0]));
            p.badge = maxDiscountPercent > 0 ? `${maxDiscountPercent}% Off` : null;
            p.promoMessage = p.badge ? `Save ${p.badge} on this product` : null;
        });

        // 🔹 Collect unique categories & brands
        const uniqueCategoryIds = await Product.distinct("category", finalFilter);
        const uniqueBrandIds = await Product.distinct("brand", finalFilter);

        const [categories, brands] = await Promise.all([
            Category.find({ _id: { $in: uniqueCategoryIds }, isActive: true }).select("name slug").lean(),
            Brand.find({ _id: { $in: uniqueBrandIds }, isActive: true }).select("name slug logo").lean()
        ]);

        // ✅ Final response
        return res.status(200).json({
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
                ? `Showing products for promotion "${promo.name || "Offer"}".`
                : `No products found under this promotion.`
        });

    } catch (err) {
        console.error("🔥 getPromotionProducts error:", err);
        return res.status(500).json({
            message: "Failed to fetch promotion products",
            error: err.message
        });
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