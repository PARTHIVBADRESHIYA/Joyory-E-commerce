// controllers/user/promotionController.js
import Promotion from "../../models/Promotion.js";
import Product from "../../models/Product.js";
import mongoose from "mongoose";
import { formatProductCard } from "../../middlewares/utils/recommendationService.js";

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

/* --------- GET Active Promotions (for homepage / banners) --------- */
/**
 * Query:
 *  - ?section=product  (carousel: product-level promotions like discount, tieredDiscount, bogo, bundle, gift)
 *  - ?section=banner   (sitewide/banner promos: newUser, paymentOffer, freeShipping, global discount banners)
 *  - default: all active promos
 */
// export const getActivePromotionsForUsers = async (req, res) => {
//     try {
//         const now = new Date();
//         const section = (req.query.section || "").toString().toLowerCase(); // 'product'|'banner'|'all'
//         const baseFilter = {
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now },
//         };

//         const promos = await Promotion.find(baseFilter)
//             .select(
//                 "campaignName description images promotionType promotionConfig discountUnit discountValue scope startDate endDate targetAudience categories products"
//             )
//             .populate("categories.category", "name slug")
//             .lean();

//         // split by purpose
//         const productTypes = new Set(["discount", "tieredDiscount", "bogo", "bundle", "gift"]);
//         const bannerTypes = new Set(["newUser", "paymentOffer", "freeShipping", "discount"]);

//         let filtered = promos;
//         if (section === "product") {
//             filtered = promos.filter((p) => productTypes.has(p.promotionType));
//         } else if (section === "banner") {
//             filtered = promos.filter((p) => bannerTypes.has(p.promotionType));
//         }

//         // Map to lightweight payload for front-end cards
//         const payload = filtered.map((p) => {
//             // compute simple label / badge
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
//                 const tiers = Array.isArray(p.promotionConfig?.tiers) ? p.promotionConfig.tiers : [];
//                 const top = tiers.length ? tiers.reduce((s, t) => Math.max(s, Number(t.discountPercent || 0)), 0) : 0;
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

//             return {
//                 _id: p._id,
//                 title: p.campaignName,
//                 description: p.description || "",
//                 images: p.images || [],
//                 type: p.promotionType,
//                 scope: p.scope,
//                 discountPercent,
//                 discountAmount,
//                 discountLabel,
//                 countdown: getCountdown(p.endDate),
//                 // pass small metadata so frontend can choose CTA behavior
//                 promoMeta: {
//                     categories: (p.categories || []).map((c) => ({ id: c.category?._id, slug: c.slug || c.category?.slug, name: c.category?.name })),
//                     products: (p.products || []).map((x) => (typeof x === "object" ? String(x._id ?? x) : String(x))),
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



export const getActivePromotionsForUsers = async (req, res) => {
    try {
        const now = new Date();
        const section = (req.query.section || "").toString().toLowerCase(); // 'product'|'banner'|'offers'|'all'

        // ✅ Only running, active promotions
        const baseFilter = {
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now },
        };

        const promos = await Promotion.find(baseFilter)
            .select(
                "campaignName description images promotionType promotionConfig discountUnit discountValue scope startDate endDate targetAudience categories brands products tags"
            )
            .populate("categories.category", "name slug")
            .populate("brands.brand", "name slug")
            .lean();

        // ✅ Separate by purpose
        const productTypes = new Set(["discount", "tieredDiscount", "bogo", "bundle", "gift"]);
        const bannerTypes = new Set(["newUser", "paymentOffer", "freeShipping", "discount"]);

        let filtered = promos;

        if (section === "product") {
            filtered = promos.filter((p) => productTypes.has(p.promotionType));
        } else if (section === "banner") {
            filtered = promos.filter((p) => bannerTypes.has(p.promotionType));
        } else if (section === "offers") {
            // 👉 Offers section = GenZ / Combo / Trending etc. based on tags
            filtered = promos.filter(
                (p) =>
                    Array.isArray(p.tags) &&
                    (p.tags.includes("special") ||
                        p.tags.includes("combo") ||
                        p.tags.includes("trending"))
            );
        }
        // else = "all" → no filter

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
                const tiers = Array.isArray(p.promotionConfig?.tiers) ? p.promotionConfig.tiers : [];
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


/* --------- GET Promotion Products (user clicks a promo card) --------- */
/**
 * Returns products for a given promotion and accurate discounted prices where applicable.
 * - For 'discount' promos -> exact discounted price applied.
 * - For 'tieredDiscount' -> show indicative price using the best tier and include tier info in promoMeta.
 * - For 'bogo'/'bundle' -> price remains original; frontend should show badge and promoMeta to explain set rules; cart-level will apply real savings.
 *
 * Query params: page, limit, category, brand, minPrice, maxPrice, search, sort (price_asc|price_desc|newest|discount)
 */

// export const getPromotionProducts = async (req, res) => {
//     try {
//         const { id } = req.params;
//         if (!isObjectId(id)) return res.status(400).json({ message: "Invalid promotion id" });

//         const page = Math.max(1, parseInt(req.query.page ?? "1", 10));
//         const rawLimit = parseInt(req.query.limit ?? "24", 10);
//         const limit = Math.min(Math.max(1, rawLimit), 60);

//         const search = (req.query.search ?? "").toString().trim();
//         const sort = (req.query.sort ?? "newest").toString().trim();

//         // 🔹 Load promo
//         const promo = await Promotion.findById(id)
//             .populate("categories.category", "_id name slug")
//             .populate("products", "_id name category")
//             .lean();

//         if (!promo) return res.status(404).json({ message: "Promotion not found" });

//         const promoType = promo.promotionType;

//         /* ---------- ✅ Special Case: Bundle Promotions ---------- */
//         if (promoType === "bundle") {
//             const bundleProductIds = promo.promotionConfig?.bundleProducts?.length
//                 ? promo.promotionConfig.bundleProducts
//                 : promo.products?.map(p => p._id ?? p) || [];

//             const bundleProducts = await Product.find({ _id: { $in: bundleProductIds } })
//                 .select("_id name images brand mrp price")
//                 .lean();

//             const totalMrp = bundleProducts.reduce((sum, p) => sum + (p.mrp || p.price || 0), 0);
//             const bundlePrice = Number(promo.promotionConfig?.bundlePrice || 0);

//             const product = {
//                 _id: promo._id, // bundle id = promo id
//                 name: promo.campaignName,
//                 description: promo.description,
//                 image: promo.images?.[0] || (bundleProducts[0]?.images?.[0] ?? ""),
//                 brand: "Combo Offer",
//                 mrp: Math.round(totalMrp),
//                 price: Math.round(bundlePrice),
//                 discountPercent: bundlePrice > 0 ? Math.round(100 - ((bundlePrice / totalMrp) * 100)) : 0,
//                 discountAmount: bundlePrice > 0 ? totalMrp - bundlePrice : 0,
//                 badge: "Bundle Deal",
//                 promoMessage: "Special price when bought together",
//                 display: {
//                     mrpLabel: `₹${totalMrp}`,
//                     priceLabel: `₹${bundlePrice}`,
//                     discountLabel: "Bundle Deal",
//                 },
//                 bundleItems: bundleProducts.map(p => ({
//                     _id: p._id,
//                     name: p.name,
//                     image: Array.isArray(p.images) && p.images.length ? p.images[0] : "",
//                     brand: p.brand,
//                     mrp: p.mrp,
//                     price: p.price,
//                 })),
//             };

//             return res.json({
//                 products: [product],
//                 pagination: { page: 1, limit: 1, total: 1, pages: 1 },
//             });
//         }


//         /* ---------- 🔹 Regular Promo Flow (discount, tiered, bogo, etc.) ---------- */
//         const baseOr = [];
//         if (promo.scope === "category" && promo.categories?.length) {
//             const catIds = promo.categories.map((c) => c?.category?._id).filter(Boolean).map(id => new ObjectId(id));
//             if (catIds.length) {
//                 baseOr.push({ category: { $in: catIds } });
//                 baseOr.push({ categoryHierarchy: { $in: catIds } });
//             }
//         } else if (promo.scope === "product" && promo.products?.length) {
//             const pids = promo.products.map((p) => new ObjectId(p._id ?? p));
//             baseOr.push({ _id: { $in: pids } });
//         } else if (promo.scope === "brand" && promo.brands?.length) {
//             const brandIds = promo.brands.map((b) => new ObjectId(b?.brand?._id ?? b?.brand)).filter(Boolean);
//             if (brandIds.length) {
//                 baseOr.push({ brand: { $in: brandIds } });
//             }
//         }

//         const match = {};
//         if (baseOr.length) match.$or = baseOr;
//         if (search) match.name = { $regex: escapeRegex(search), $options: "i" };

//         // Promo setup
//         const promoValue = Number(promo.discountValue || 0);
//         const promoIsPercent = promoType === "discount" && promo.discountUnit === "percent" && promoValue > 0;
//         const promoIsAmount = promoType === "discount" && promo.discountUnit === "amount" && promoValue > 0;

//         const tiers = Array.isArray(promo.promotionConfig?.tiers) ? promo.promotionConfig.tiers : [];
//         const bestTierPercent = tiers.length ? Math.max(...tiers.map((t) => Number(t.discountPercent || 0))) : 0;

//         const addFieldsStage = {
//             $addFields: {
//                 mrpEff: { $ifNull: ["$mrp", "$price"] },
//                 discountedPrice: {
//                     $let: {
//                         vars: { mrpEff: { $ifNull: ["$mrp", "$price"] } },
//                         in:
//                             promoType === "discount"
//                                 ? promoIsPercent
//                                     ? { $max: [0, { $subtract: ["$$mrpEff", { $divide: [{ $multiply: ["$$mrpEff", promoValue] }, 100] }] }] }
//                                     : { $max: [0, { $subtract: ["$$mrpEff", promoValue] }] }
//                                 : promoType === "tieredDiscount"
//                                     ? { $max: [0, { $subtract: ["$$mrpEff", { $divide: [{ $multiply: ["$$mrpEff", bestTierPercent] }, 100] }] }] }
//                                     : "$price",
//                     },
//                 },
//             },
//         };

//         const addDiscountFieldsStage = {
//             $addFields: {
//                 discountAmount: { $max: [0, { $subtract: ["$mrpEff", "$discountedPrice"] }] },
//                 discountPercent: {
//                     $cond: [
//                         { $gt: ["$mrpEff", 0] },
//                         { $floor: { $multiply: [{ $divide: [{ $subtract: ["$mrpEff", "$discountedPrice"] }, "$mrpEff"] }, 100] } },
//                         0,
//                     ],
//                 },
//             },
//         };

//         let sortStage = { $sort: { createdAt: -1, _id: 1 } };
//         if (sort === "price_asc") sortStage = { $sort: { discountedPrice: 1, _id: 1 } };
//         else if (sort === "price_desc") sortStage = { $sort: { discountedPrice: -1, _id: 1 } };
//         else if (sort === "discount") sortStage = { $sort: { discountPercent: -1, discountAmount: -1, _id: 1 } };

//         const pipeline = [
//             { $match: match },
//             addFieldsStage,
//             addDiscountFieldsStage,
//             {
//                 $project: {
//                     name: 1,
//                     brand: 1,
//                     images: 1,
//                     mrp: "$mrpEff",
//                     price: "$discountedPrice",
//                     discount: "$discountAmount",
//                     discountPercent: 1,
//                     createdAt: 1,
//                 },
//             },
//             sortStage,
//             { $facet: { data: [{ $skip: (page - 1) * limit }, { $limit: limit }], totalArr: [{ $count: "count" }] } },
//         ];

//         const [aggResult] = await Product.aggregate(pipeline).collation({ locale: "en", strength: 2 });

//         const products = (aggResult?.data ?? []).map((p) => {
//             let badge = null;
//             let promoMessage = null;

//             if (promoType === "discount") {
//                 badge = promoIsPercent ? `${promoValue}% Off` : `₹${asMoney(promoValue)} Off`;
//                 promoMessage = `Save ${badge} on this product`;
//             } else if (promoType === "tieredDiscount") {
//                 badge = `Buy More Save More (Up to ${bestTierPercent}%)`;
//                 promoMessage = `Add more to save up to ${bestTierPercent}%`;
//             } else if (promoType === "bogo" || promoType === "buy1get1") {
//                 const bq = promo.promotionConfig?.buyQty ?? 1;
//                 const gq = promo.promotionConfig?.getQty ?? 1;
//                 badge = `BOGO ${bq}+${gq}`;
//                 promoMessage = `Buy ${bq}, Get ${gq} Free`;
//             } else if (promoType === "gift") {
//                 badge = "Free Gift";
//                 promoMessage = "Get a free gift on qualifying order";
//             }

//             return {
//                 _id: p._id,
//                 name: p.name,
//                 image: Array.isArray(p.images) && p.images.length ? p.images[0] : "",
//                 brand: p.brand || "",
//                 mrp: Math.round(p.mrp ?? 0),
//                 price: Math.round(p.price ?? 0),
//                 discountPercent: Math.max(0, Math.round(p.discountPercent ?? 0)),
//                 discountAmount: Math.max(0, Math.round(p.discount ?? 0)),
//                 badge,
//                 promoMessage,
//                 display: {
//                     mrpLabel: `₹${Math.round(p.mrp ?? 0)}`,
//                     priceLabel: `₹${Math.round(p.price ?? 0)}`,
//                     discountLabel: badge || "",
//                 },
//             };
//         });

//         const total = aggResult?.totalArr?.[0]?.count ?? 0;

//         res.json({
//             products,
//             pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
//             promoMeta: promo,
//         });
//     } catch (err) {
//         console.error("getPromotionProducts error:", err);
//         res.status(500).json({ message: "Failed to fetch promotion products", error: err.message });
//     }
// };

export const getPromotionProducts = async (req, res) => {
    try {
        const { id } = req.params;
        if (!isObjectId(id))
            return res.status(400).json({ message: "Invalid promotion id" });

        const page = Math.max(1, parseInt(req.query.page ?? "1", 10));
        const rawLimit = parseInt(req.query.limit ?? "24", 10);
        const limit = Math.min(Math.max(1, rawLimit), 60);

        const search = (req.query.search ?? "").toString().trim();
        const sort = (req.query.sort ?? "newest").toString().trim();

        // 🔹 Load promo
        const promo = await Promotion.findById(id)
            .populate("categories.category", "_id name slug")
            .populate("products", "_id name category")
            .lean();

        if (!promo)
            return res.status(404).json({ message: "Promotion not found" });

        const promoType = promo.promotionType;

        /* ---------- ✅ Special Case: Bundle Promotions ---------- */
        if (promoType === "bundle") {
            const bundleProductIds = promo.promotionConfig?.bundleProducts?.length
                ? promo.promotionConfig.bundleProducts
                : promo.products?.map((p) => p._id ?? p) || [];

            const bundleProducts = await Product.find({ _id: { $in: bundleProductIds } })
                .lean();

            if (!bundleProducts.length) {
                return res.json({
                    products: [],
                    pagination: { page: 1, limit: 1, total: 0, pages: 0 },
                });
            }

            const totalMrp = bundleProducts.reduce(
                (sum, p) => sum + (p.mrp || p.price || 0),
                0
            );
            const bundlePrice = Number(promo.promotionConfig?.bundlePrice || 0);

            const discountAmount = bundlePrice > 0 ? totalMrp - bundlePrice : 0;
            const discountPercent =
                bundlePrice > 0 ? Math.round((discountAmount / totalMrp) * 100) : 0;

            // 🔹 Format bundle items using your formatProductCard
            const bundleItems = await Promise.all(
                bundleProducts.map(async (p) => {
                    const card = await formatProductCard(p);
                    return {
                        ...card,
                        effectivePrice: Math.round(
                            totalMrp > 0 ? ((p.mrp || p.price || 0) / totalMrp) * bundlePrice : 0
                        ),
                    };
                })
            );

            const product = {
                _id: promo._id,
                name: promo.campaignName,
                description: promo.description,
                image: promo.images?.[0] || (bundleProducts[0]?.images?.[0] ?? ""),
                brand: "Combo Offer",
                mrp: Math.round(totalMrp),
                price: Math.round(bundlePrice),
                discountPercent,
                discountAmount,
                badge: "Bundle Deal",
                promoMessage:
                    promo.promotionConfig?.promoMessage ||
                    "Special price when bought together",
                display: {
                    mrpLabel: `₹${Math.round(totalMrp)}`,
                    priceLabel: `₹${Math.round(bundlePrice)}`,
                    discountLabel: `${discountPercent}% off`,
                    savingsLabel: `You save ₹${discountAmount}`,
                },
                extra: {
                    complimentaryGift: promo.promotionConfig?.giftText || null,
                },
                bundleItems,
            };

            return res.json({
                products: [product],
                pagination: { page: 1, limit: 1, total: 1, pages: 1 },
                promoMeta: promo,
            });
        }

        /* ---------- 🔹 Regular Promo Flow (discount, tiered, bogo, etc.) ---------- */
        const baseOr = [];
        if (promo.scope === "category" && promo.categories?.length) {
            const catIds = promo.categories
                .map((c) => c?.category?._id)
                .filter(Boolean)
                .map((id) => new ObjectId(id));
            if (catIds.length) {
                baseOr.push({ category: { $in: catIds } });
                baseOr.push({ categoryHierarchy: { $in: catIds } });
            }
        } else if (promo.scope === "product" && promo.products?.length) {
            const pids = promo.products.map((p) => new ObjectId(p._id ?? p));
            baseOr.push({ _id: { $in: pids } });
        } else if (promo.scope === "brand" && promo.brands?.length) {
            const brandIds = promo.brands
                .map((b) => new ObjectId(b?.brand?._id ?? b?.brand))
                .filter(Boolean);
            if (brandIds.length) {
                baseOr.push({ brand: { $in: brandIds } });
            }
        }

        const match = {};
        if (baseOr.length) match.$or = baseOr;
        if (search) match.name = { $regex: escapeRegex(search), $options: "i" };

        // Promo setup
        const promoValue = Number(promo.discountValue || 0);
        const promoIsPercent =
            promoType === "discount" &&
            promo.discountUnit === "percent" &&
            promoValue > 0;
        const promoIsAmount =
            promoType === "discount" &&
            promo.discountUnit === "amount" &&
            promoValue > 0;

        const tiers = Array.isArray(promo.promotionConfig?.tiers)
            ? promo.promotionConfig.tiers
            : [];
        const bestTierPercent = tiers.length
            ? Math.max(...tiers.map((t) => Number(t.discountPercent || 0)))
            : 0;

        const pipeline = [
            { $match: match },
            {
                $addFields: {
                    mrpEff: { $ifNull: ["$mrp", "$price"] },
                },
            },
            {
                $addFields: {
                    discountedPrice: {
                        $let: {
                            vars: { mrpEff: { $ifNull: ["$mrp", "$price"] } },
                            in:
                                promoType === "discount"
                                    ? promoIsPercent
                                        ? {
                                            $max: [
                                                0,
                                                {
                                                    $subtract: [
                                                        "$$mrpEff",
                                                        {
                                                            $divide: [
                                                                { $multiply: ["$$mrpEff", promoValue] },
                                                                100,
                                                            ],
                                                        },
                                                    ],
                                                },
                                            ],
                                        }
                                        : { $max: [0, { $subtract: ["$$mrpEff", promoValue] }] }
                                    : promoType === "tieredDiscount"
                                        ? {
                                            $max: [
                                                0,
                                                {
                                                    $subtract: [
                                                        "$$mrpEff",
                                                        {
                                                            $divide: [
                                                                { $multiply: ["$$mrpEff", bestTierPercent] },
                                                                100,
                                                            ],
                                                        },
                                                    ],
                                                },
                                            ],
                                        }
                                        : "$price",
                        },
                    },
                },
            },
            {
                $addFields: {
                    discountAmount: { $max: [0, { $subtract: ["$mrpEff", "$discountedPrice"] }] },
                    discountPercent: {
                        $cond: [
                            { $gt: ["$mrpEff", 0] },
                            {
                                $floor: {
                                    $multiply: [
                                        { $divide: [{ $subtract: ["$mrpEff", "$discountedPrice"] }, "$mrpEff"] },
                                        100,
                                    ],
                                },
                            },
                            0,
                        ],
                    },
                },
            },
            {
                $project: {
                    name: 1,
                    brand: 1,
                    variant: 1,
                    category: 1,
                    images: 1,
                    mrp: "$mrpEff",
                    price: "$discountedPrice",
                    discount: "$discountAmount",
                    discountPercent: 1,
                    avgRating: 1,
                    commentsCount: 1,
                },
            },
            { $sort: sort === "price_asc" ? { price: 1 } :
                     sort === "price_desc" ? { price: -1 } :
                     sort === "discount" ? { discountPercent: -1, discount: -1 } :
                     { createdAt: -1 } },
            {
                $facet: {
                    data: [
                        { $skip: (page - 1) * limit },
                        { $limit: limit },
                    ],
                    totalArr: [{ $count: "count" }],
                },
            },
        ];

        const [aggResult] = await Product.aggregate(pipeline).collation({ locale: "en", strength: 2 });

        // 🔹 Format each product with formatProductCard
        const rawProducts = aggResult?.data ?? [];
        const products = await Promise.all(
            rawProducts.map(async (p) => {
                const card = await formatProductCard(p);

                let badge = null;
                let promoMessage = null;
                if (promoType === "discount") {
                    badge = promoIsPercent ? `${promoValue}% Off` : `₹${asMoney(promoValue)} Off`;
                    promoMessage = `Save ${badge} on this product`;
                } else if (promoType === "tieredDiscount") {
                    badge = `Buy More Save More (Up to ${bestTierPercent}%)`;
                    promoMessage = `Add more to save up to ${bestTierPercent}%`;
                } else if (promoType === "bogo" || promoType === "buy1get1") {
                    const bq = promo.promotionConfig?.buyQty ?? 1;
                    const gq = promo.promotionConfig?.getQty ?? 1;
                    badge = `BOGO ${bq}+${gq}`;
                    promoMessage = `Buy ${bq}, Get ${gq} Free`;
                } else if (promoType === "gift") {
                    badge = "Free Gift";
                    promoMessage = "Get a free gift on qualifying order";
                }

                return {
                    ...card,
                    discountPercent: Math.max(0, Math.round(p.discountPercent ?? 0)),
                    discountAmount: Math.max(0, Math.round(p.discount ?? 0)),
                    badge,
                    promoMessage,
                };
            })
        );

        const total = aggResult?.totalArr?.[0]?.count ?? 0;

        res.json({
            products,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit) || 1,
            },
            promoMeta: promo,
        });
    } catch (err) {
        console.error("getPromotionProducts error:", err);
        res.status(500).json({
            message: "Failed to fetch promotion products",
            error: err.message,
        });
    }
};



/**
 * POST /api/promotions/apply
 * Body: { items: [{ productId, qty }], paymentMethod?: "card|upi|wallet", userContext?: { isNewUser: boolean } }
 * Returns cart-level application for discount, tieredDiscount, bogo (Phase 1).
 */

// ------------------------------
// MAIN FUNCTION
// ------------------------------
export const applyPromotionsToCart = async (req, res) => {
    try {
        const now = new Date();
        const promos = await Promotion.find({
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now },
        })
            .select(
                "+promotionType +promotionConfig +scope +categories +products +discountUnit +discountValue"
            )
            .lean();

        // Load products in cart
        const itemsInput = Array.isArray(req.body.items) ? req.body.items : [];
        const ids = itemsInput.map((i) => i.productId).filter(isObjectId);
        const dbProducts = await Product.find({ _id: { $in: ids } })
            .select("_id name images brand price mrp category categoryHierarchy")
            .lean();

        const productMap = new Map(dbProducts.map((p) => [p._id.toString(), p]));

        // Build cart rows
        const cart = itemsInput
            .map((i) => {
                const p = productMap.get(i.productId);
                if (!p) return null;
                const mrp = asMoney(p.mrp ?? p.price);
                return {
                    productId: p._id.toString(),
                    name: p.name,
                    image: Array.isArray(p.images) && p.images[0] ? p.images[0] : "",
                    brand: p.brand || "",
                    qty: Math.max(1, Number(i.qty || 1)),
                    basePrice: asMoney(p.price),
                    mrp,
                    category: p.category?.toString?.(),
                    product: p,
                    price: asMoney(p.price), // adjusted later
                    discounts: [], // {promoId, type, amount, note}
                    freebies: [], // {promoId, productId, qty}
                };
            })
            .filter(Boolean);

        // helper: attach discount to line
        const addLineDiscount = (line, promoId, type, amount, note) => {
            const amt = asMoney(amount);
            if (amt > 0) {
                line.discounts.push({ promoId, type, amount: amt, note });
                line.price = Math.max(0, line.price - amt / line.qty);
            }
        };

        // ------------------------------
        // STEP 1: Apply product-level promos
        // ------------------------------
        for (const promo of promos) {
            if (promo.promotionType === "discount") {
                for (const line of cart) {
                    if (!productMatchesPromo(line.product, promo)) continue;
                    const { price: newUnitPrice, discountAmount } = applyFlatDiscount(
                        line.mrp,
                        promo
                    );
                    const totalDiscount = (line.mrp - newUnitPrice) * line.qty;
                    addLineDiscount(
                        line,
                        promo._id,
                        "discount",
                        totalDiscount,
                        "Flat discount"
                    );
                }
            }

            if (promo.promotionType === "tieredDiscount") {
                const tiers = (promo.promotionConfig?.tiers || []).sort(
                    (a, b) => a.minQty - b.minQty
                );
                const scope =
                    promo.promotionConfig?.tierScope === "perOrder"
                        ? "perOrder"
                        : "perProduct";

                if (scope === "perProduct") {
                    for (const line of cart) {
                        if (!productMatchesPromo(line.product, promo)) continue;
                        const tier = bestTierForQty(tiers, line.qty);
                        if (!tier) continue;
                        const unitOff = Math.floor((line.mrp * tier.discountPercent) / 100);
                        addLineDiscount(
                            line,
                            promo._id,
                            "tieredDiscount",
                            unitOff * line.qty,
                            `Buy ${tier.minQty}+ Save ${tier.discountPercent}%`
                        );
                    }
                } else {
                    const eligibleLines = cart.filter((l) =>
                        productMatchesPromo(l.product, promo)
                    );
                    const totalQty = eligibleLines.reduce((s, l) => s + l.qty, 0);
                    const tier = bestTierForQty(tiers, totalQty);
                    if (tier) {
                        const subtotal = eligibleLines.reduce(
                            (s, l) => s + l.mrp * l.qty,
                            0
                        );
                        for (const line of eligibleLines) {
                            const lineBase = line.mrp * line.qty;
                            const share = subtotal > 0 ? lineBase / subtotal : 0;
                            const lineDiscount = Math.floor(
                                lineBase * (tier.discountPercent / 100) * share
                            );
                            addLineDiscount(
                                line,
                                promo._id,
                                "tieredDiscount",
                                lineDiscount,
                                `Cart ${tier.minQty}+ Save ${tier.discountPercent}%`
                            );
                        }
                    }
                }
            }

            if (promo.promotionType === "bundle") {
                const bp = (promo.promotionConfig?.bundleProducts || []).map(String);
                const bundlePrice = Number(promo.promotionConfig?.bundlePrice || 0);
                if (bp.length >= 2 && bundlePrice > 0) {
                    const lines = cart.filter((l) => bp.includes(l.productId));
                    if (lines.length === bp.length) {
                        const bundleQty = Math.min(
                            ...bp.map(
                                (id) => cart.find((l) => l.productId === id)?.qty || 0
                            )
                        );
                        if (bundleQty > 0) {
                            const bundleMrp = lines.reduce((s, l) => s + l.mrp, 0);
                            const bundleUnitDiscount = Math.max(0, bundleMrp - bundlePrice);
                            const totalBase = lines.reduce((s, l) => s + l.mrp, 0);
                            for (const l of lines) {
                                const share = totalBase > 0 ? l.mrp / totalBase : 0;
                                const lineDiscount =
                                    Math.floor(bundleUnitDiscount * share) * bundleQty;
                                if (lineDiscount > 0) {
                                    addLineDiscount(
                                        l,
                                        promo._id,
                                        "bundle",
                                        lineDiscount,
                                        "Bundle deal"
                                    );
                                }
                            }
                        }
                    }
                }
            }

            if (promo.promotionType === "gift") {
                const minOrderValue = Number(promo.promotionConfig?.minOrderValue || 0);
                const giftProductId = promo.promotionConfig?.giftProductId;
                if (minOrderValue > 0 && isObjectId(giftProductId || "")) {
                    const cartMrp = cart.reduce((s, l) => s + l.mrp * l.qty, 0);
                    if (cartMrp >= minOrderValue) {
                        cart[0].freebies.push({
                            promoId: promo._id,
                            productId: giftProductId,
                            qty: 1,
                        });
                    }
                }
            }

            if (promo.promotionType === "bogo") {
                const buyQty = Number(promo.promotionConfig?.buyQty || 1);
                const getQty = Number(promo.promotionConfig?.getQty || 1);
                const same = !!promo.promotionConfig?.sameProduct;
                const freePid = promo.promotionConfig?.freeProductId;

                if (same) {
                    for (const line of cart) {
                        if (!productMatchesPromo(line.product, promo)) continue;
                        const sets =
                            Math.floor(line.qty / (buyQty + getQty)) ||
                            Math.floor(line.qty / buyQty);
                        const freeUnits = Math.max(0, sets * getQty);
                        if (freeUnits > 0) {
                            const unitPrice = asMoney(line.price / line.qty);
                            const freeValue = unitPrice * freeUnits;
                            addLineDiscount(
                                line,
                                promo._id,
                                "bogo",
                                freeValue,
                                `BOGO ${buyQty}+${getQty}`
                            );
                        }
                    }
                } else if (isObjectId(freePid || "")) {
                    const buyLines = cart.filter((l) =>
                        productMatchesPromo(l.product, promo)
                    );
                    if (buyLines.length) {
                        const totalBuyQty = buyLines.reduce((s, l) => s + l.qty, 0);
                        const freeUnits = Math.floor(totalBuyQty / buyQty) * getQty;
                        if (freeUnits > 0) {
                            const freeLine = cart.find((l) => l.productId === freePid);
                            if (freeLine) {
                                const unitPrice = asMoney(
                                    freeLine.price / Math.max(1, freeLine.qty)
                                );
                                const freeValue = unitPrice * freeUnits;
                                addLineDiscount(
                                    freeLine,
                                    promo._id,
                                    "bogo",
                                    freeValue,
                                    `Free with ${buyQty} bought`
                                );
                                freeLine.freebies.push({
                                    promoId: promo._id,
                                    productId: freePid,
                                    qty: freeUnits,
                                });
                            }
                        }
                    }
                }
            }
        }

        // ------------------------------
        // STEP 2: Compute base summary
        // ------------------------------
        let summary = cart.reduce(
            (acc, l) => {
                const lineBase = asMoney(l.mrp * l.qty);
                const linePrice = asMoney(l.price * l.qty);
                const lineDiscounts = l.discounts.reduce(
                    (s, d) => s + asMoney(d.amount),
                    0
                );
                acc.mrpTotal += lineBase;
                acc.savings += lineDiscounts;
                acc.payable += linePrice;
                return acc;
            },
            { mrpTotal: 0, savings: 0, payable: 0 }
        );

        // ------------------------------
        // STEP 3: Apply cart-level promos
        // ------------------------------
        const ctx = req.body || {};
        const isNewUser = !!ctx.userContext?.isNewUser;
        const paymentMethod = (ctx.paymentMethod || "").trim();

        const newUserPromo = promos.find(
            (p) =>
                p.promotionType === "newUser" &&
                (p.targetAudience === "new" || p.targetAudience === "all")
        );
        if (newUserPromo && isNewUser) {
            const dp = Number(newUserPromo.promotionConfig?.discountPercent || 0);
            const cap = Number(newUserPromo.promotionConfig?.maxDiscount || 0);
            if (dp > 0) {
                const discount = Math.floor((summary.payable * dp) / 100);
                const applied = Math.min(discount, cap || discount);
                summary.savings += applied;
                summary.payable = Math.max(0, summary.payable - applied);
            }
        }

        const paymentPromo = promos.find((p) => p.promotionType === "paymentOffer");
        if (paymentPromo) {
            const methods = paymentPromo.promotionConfig?.methods || [];
            const mov = Number(paymentPromo.promotionConfig?.minOrderValue || 0);
            if (methods.includes(paymentMethod) && summary.payable >= mov) {
                const dp = Number(paymentPromo.promotionConfig?.discountPercent || 0);
                const cap = Number(paymentPromo.promotionConfig?.maxDiscount || 0);
                if (dp > 0) {
                    const discount = Math.floor((summary.payable * dp) / 100);
                    const applied = Math.min(discount, cap || discount);
                    summary.savings += applied;
                    summary.payable = Math.max(0, summary.payable - applied);
                }
            }
        }

        // freeShipping can be added here based on summary.payable

        // ------------------------------
        // Response
        // ------------------------------
        res.json({
            items: cart,
            summary,
            appliedPromotions: promos.map((p) => ({
                _id: p._id,
                type: p.promotionType,
            })),
        });
    } catch (err) {
        console.error("applyPromotions error:", err);
        res.status(500).json({ message: "Failed to apply promotions" });
    }
};