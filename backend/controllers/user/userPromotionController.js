// controllers/user/promotionController.js
import Promotion from "../../models/Promotion.js";
import Product from "../../models/Product.js";
import mongoose from "mongoose";
import { formatProductCard } from "../../middlewares/utils/recommendationService.js";
import { fetchProducts } from "../../middlewares/services/productQueryBuilder.js";
import { normalizeFilters, applyDynamicFilters } from "../../controllers/user/userProductController.js";
import { applyPromotions } from "../../middlewares/services/promotionEngine.js";

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


// export const getActivePromotionsForUsers = async (req, res) => {
//     try {
//         const now = new Date();
//         const section = (req.query.section || "").toString().toLowerCase(); // 'product'|'banner'|'offers'|'all'

//         // ✅ Only active promotions (not scheduled, not expired)
//         const baseFilter = {
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now },
//         };

//         const promos = await Promotion.find(baseFilter)
//             .select(
//                 "campaignName description images promotionType promotionConfig discountUnit discountValue scope startDate endDate targetAudience categories brands products tags"
//             )
//             .populate("categories.category", "name slug")
//             .populate("brands.brand", "name slug")
//             .lean();

//         // ✅ Separate by purpose
//         const productTypes = new Set(["discount", "tieredDiscount", "bogo", "bundle", "gift"]);
//         const bannerTypes = new Set(["newUser", "paymentOffer", "freeShipping", "discount"]);

//         let filtered = promos;

//         if (section === "product") {
//             filtered = promos.filter((p) => productTypes.has(p.promotionType));
//         } else if (section === "banner") {
//             filtered = promos.filter((p) => bannerTypes.has(p.promotionType));
//         } else if (section === "offers") {
//             // 👉 Offers section = GenZ / Combo / Trending etc. based on tags
//             filtered = promos.filter(
//                 (p) =>
//                     Array.isArray(p.tags) &&
//                     (p.tags.includes("special") ||
//                         p.tags.includes("combo") ||
//                         p.tags.includes("trending"))
//             );
//         }
//         // else = "all" → no filter

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
//                 const tiers = Array.isArray(p.promotionConfig?.tiers) ? p.promotionConfig.tiers : [];
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

//             // ✅ Add isScheduled flag
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
//                 isScheduled, // 👈 added here
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



// export const getActivePromotionsForUsers = async (req, res) => {
//     try {
//         const now = new Date();
//         const section = (req.query.section || "").toString().toLowerCase(); // 'product'|'banner'|'offers'|'all'

//         // ✅ Only running, active promotions
//         const baseFilter = {
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now },
//         };

//         const promos = await Promotion.find(baseFilter)
//             .select(
//                 "campaignName description images promotionType promotionConfig discountUnit discountValue scope startDate endDate targetAudience categories brands products tags"
//             )
//             .populate("categories.category", "name slug")
//             .populate("brands.brand", "name slug")
//             .lean();

//         // ✅ Separate by purpose
//         const productTypes = new Set(["discount", "tieredDiscount", "bogo", "bundle", "gift"]);
//         const bannerTypes = new Set(["newUser", "paymentOffer", "freeShipping", "discount"]);

//         let filtered = promos;

//         if (section === "product") {
//             filtered = promos.filter((p) => productTypes.has(p.promotionType));
//         } else if (section === "banner") {
//             filtered = promos.filter((p) => bannerTypes.has(p.promotionType));
//         } else if (section === "offers") {
//             // 👉 Offers section = GenZ / Combo / Trending etc. based on tags
//             filtered = promos.filter(
//                 (p) =>
//                     Array.isArray(p.tags) &&
//                     (p.tags.includes("special") ||
//                         p.tags.includes("combo") ||
//                         p.tags.includes("trending"))
//             );
//         }
//         // else = "all" → no filter

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
//                 const tiers = Array.isArray(p.promotionConfig?.tiers) ? p.promotionConfig.tiers : [];
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
//         if (!isObjectId(id))
//             return res.status(400).json({ message: "Invalid promotion id" });

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

//         if (!promo)
//             return res.status(404).json({ message: "Promotion not found" });

//         const promoType = promo.promotionType;

//         /* ---------- ✅ Special Case: Collection Promotions ---------- */
//         if (promoType === "collection") {
//             const maxPrice = Number(promo.promotionConfig?.maxProductPrice || 0);

//             const match = {};
//             if (maxPrice > 0) {
//                 match.price = { $lte: maxPrice };
//             }
//             if (search) {
//                 match.name = { $regex: escapeRegex(search), $options: "i" };
//             }

//             const [aggResult] = await Product.aggregate([
//                 { $match: match },
//                 {
//                     $sort: sort === "price_asc" ? { price: 1 } :
//                         sort === "price_desc" ? { price: -1 } :
//                             { createdAt: -1 }
//                 },
//                 {
//                     $facet: {
//                         data: [
//                             { $skip: (page - 1) * limit },
//                             { $limit: limit },
//                         ],
//                         totalArr: [{ $count: "count" }],
//                     },
//                 },
//             ]);

//             const rawProducts = aggResult?.data ?? [];
//             const products = await Promise.all(
//                 rawProducts.map(async (p) => {
//                     const card = await formatProductCard(p);
//                     return {
//                         ...card,
//                         badge: `Under ₹${maxPrice}`,
//                         promoMessage: `Part of the ${promo.campaignName} collection`,
//                     };
//                 })
//             );

//             const total = aggResult?.totalArr?.[0]?.count ?? 0;

//             return res.json({
//                 products,
//                 pagination: {
//                     page,
//                     limit,
//                     total,
//                     pages: Math.ceil(total / limit) || 1,
//                 },
//                 promoMeta: promo,
//             });
//         }


//         /* ---------- ✅ Special Case: Bundle Promotions ---------- */
//         if (promoType === "bundle") {
//             const bundleProductIds = promo.promotionConfig?.bundleProducts?.length
//                 ? promo.promotionConfig.bundleProducts
//                 : promo.products?.map((p) => p._id ?? p) || [];

//             const bundleProducts = await Product.find({ _id: { $in: bundleProductIds } })
//                 .lean();

//             if (!bundleProducts.length) {
//                 return res.json({
//                     products: [],
//                     pagination: { page: 1, limit: 1, total: 0, pages: 0 },
//                 });
//             }

//             const totalMrp = bundleProducts.reduce(
//                 (sum, p) => sum + (p.mrp || p.price || 0),
//                 0
//             );
//             const bundlePrice = Number(promo.promotionConfig?.bundlePrice || 0);

//             const discountAmount = bundlePrice > 0 ? totalMrp - bundlePrice : 0;
//             const discountPercent =
//                 bundlePrice > 0 ? Math.round((discountAmount / totalMrp) * 100) : 0;

//             // 🔹 Format bundle items using your formatProductCard
//             const bundleItems = await Promise.all(
//                 bundleProducts.map(async (p) => {
//                     const card = await formatProductCard(p);
//                     return {
//                         ...card,
//                         effectivePrice: Math.round(
//                             totalMrp > 0 ? ((p.mrp || p.price || 0) / totalMrp) * bundlePrice : 0
//                         ),
//                     };
//                 })
//             );

//             const product = {
//                 _id: promo._id,
//                 name: promo.campaignName,
//                 description: promo.description,
//                 image: promo.images?.[0] || (bundleProducts[0]?.images?.[0] ?? ""),
//                 brand: "Combo Offer",
//                 mrp: Math.round(totalMrp),
//                 price: Math.round(bundlePrice),
//                 discountPercent,
//                 discountAmount,
//                 badge: "Bundle Deal",
//                 promoMessage:
//                     promo.promotionConfig?.promoMessage ||
//                     "Special price when bought together",
//                 display: {
//                     mrpLabel: `₹${Math.round(totalMrp)}`,
//                     priceLabel: `₹${Math.round(bundlePrice)}`,
//                     discountLabel: `${discountPercent}% off`,
//                     savingsLabel: `You save ₹${discountAmount}`,
//                 },
//                 extra: {
//                     complimentaryGift: promo.promotionConfig?.giftText || null,
//                 },
//                 bundleItems,
//             };

//             return res.json({
//                 products: [product],
//                 pagination: { page: 1, limit: 1, total: 1, pages: 1 },
//                 promoMeta: promo,
//             });
//         }

//         /* ---------- 🔹 Regular Promo Flow (discount, tiered, bogo, etc.) ---------- */
//         const baseOr = [];
//         if (promo.scope === "category" && promo.categories?.length) {
//             const catIds = promo.categories
//                 .map((c) => c?.category?._id)
//                 .filter(Boolean)
//                 .map((id) => new ObjectId(id));
//             if (catIds.length) {
//                 baseOr.push({ category: { $in: catIds } });
//                 baseOr.push({ categoryHierarchy: { $in: catIds } });
//             }
//         } else if (promo.scope === "product" && promo.products?.length) {
//             const pids = promo.products.map((p) => new ObjectId(p._id ?? p));
//             baseOr.push({ _id: { $in: pids } });
//         } else if (promo.scope === "brand" && promo.brands?.length) {
//             const brandIds = promo.brands
//                 .map((b) => new ObjectId(b?.brand?._id ?? b?.brand))
//                 .filter(Boolean);
//             if (brandIds.length) {
//                 baseOr.push({ brand: { $in: brandIds } });
//             }
//         }

//         const match = {};
//         if (baseOr.length) match.$or = baseOr;
//         if (search) match.name = { $regex: escapeRegex(search), $options: "i" };

//         // Promo setup
//         const promoValue = Number(promo.discountValue || 0);
//         const promoIsPercent =
//             promoType === "discount" &&
//             promo.discountUnit === "percent" &&
//             promoValue > 0;
//         const promoIsAmount =
//             promoType === "discount" &&
//             promo.discountUnit === "amount" &&
//             promoValue > 0;

//         const tiers = Array.isArray(promo.promotionConfig?.tiers)
//             ? promo.promotionConfig.tiers
//             : [];
//         const bestTierPercent = tiers.length
//             ? Math.max(...tiers.map((t) => Number(t.discountPercent || 0)))
//             : 0;

//         const pipeline = [
//             { $match: match },
//             {
//                 $addFields: {
//                     mrpEff: { $ifNull: ["$mrp", "$price"] },
//                 },
//             },
//             {
//                 $addFields: {
//                     discountedPrice: {
//                         $let: {
//                             vars: { mrpEff: { $ifNull: ["$mrp", "$price"] } },
//                             in:
//                                 promoType === "discount"
//                                     ? promoIsPercent
//                                         ? {
//                                             $max: [
//                                                 0,
//                                                 {
//                                                     $subtract: [
//                                                         "$$mrpEff",
//                                                         {
//                                                             $divide: [
//                                                                 { $multiply: ["$$mrpEff", promoValue] },
//                                                                 100,
//                                                             ],
//                                                         },
//                                                     ],
//                                                 },
//                                             ],
//                                         }
//                                         : { $max: [0, { $subtract: ["$$mrpEff", promoValue] }] }
//                                     : promoType === "tieredDiscount"
//                                         ? {
//                                             $max: [
//                                                 0,
//                                                 {
//                                                     $subtract: [
//                                                         "$$mrpEff",
//                                                         {
//                                                             $divide: [
//                                                                 { $multiply: ["$$mrpEff", bestTierPercent] },
//                                                                 100,
//                                                             ],
//                                                         },
//                                                     ],
//                                                 },
//                                             ],
//                                         }
//                                         : "$price",
//                         },
//                     },
//                 },
//             },
//             {
//                 $addFields: {
//                     discountAmount: { $max: [0, { $subtract: ["$mrpEff", "$discountedPrice"] }] },
//                     discountPercent: {
//                         $cond: [
//                             { $gt: ["$mrpEff", 0] },
//                             {
//                                 $floor: {
//                                     $multiply: [
//                                         { $divide: [{ $subtract: ["$mrpEff", "$discountedPrice"] }, "$mrpEff"] },
//                                         100,
//                                     ],
//                                 },
//                             },
//                             0,
//                         ],
//                     },
//                 },
//             },
//             {
//                 $project: {
//                     name: 1,
//                     brand: 1,
//                     variant: 1,
//                     category: 1,
//                     images: 1,
//                     mrp: "$mrpEff",
//                     price: "$discountedPrice",
//                     discount: "$discountAmount",
//                     discountPercent: 1,
//                     avgRating: 1,
//                     commentsCount: 1,
//                 },
//             },
//             {
//                 $sort: sort === "price_asc" ? { price: 1 } :
//                     sort === "price_desc" ? { price: -1 } :
//                         sort === "discount" ? { discountPercent: -1, discount: -1 } :
//                             { createdAt: -1 }
//             },
//             {
//                 $facet: {
//                     data: [
//                         { $skip: (page - 1) * limit },
//                         { $limit: limit },
//                     ],
//                     totalArr: [{ $count: "count" }],
//                 },
//             },
//         ];

//         const [aggResult] = await Product.aggregate(pipeline).collation({ locale: "en", strength: 2 });

//         // 🔹 Format each product with formatProductCard
//         const rawProducts = aggResult?.data ?? [];
//         const products = await Promise.all(
//             rawProducts.map(async (p) => {
//                 const card = await formatProductCard(p);

//                 let badge = null;
//                 let promoMessage = null;
//                 if (promoType === "discount") {
//                     badge = promoIsPercent ? `${promoValue}% Off` : `₹${asMoney(promoValue)} Off`;
//                     promoMessage = `Save ${badge} on this product`;
//                 } else if (promoType === "tieredDiscount") {
//                     badge = `Buy More Save More (Up to ${bestTierPercent}%)`;
//                     promoMessage = `Add more to save up to ${bestTierPercent}%`;
//                 } else if (promoType === "bogo" || promoType === "buy1get1") {
//                     const bq = promo.promotionConfig?.buyQty ?? 1;
//                     const gq = promo.promotionConfig?.getQty ?? 1;
//                     badge = `BOGO ${bq}+${gq}`;
//                     promoMessage = `Buy ${bq}, Get ${gq} Free`;
//                 } else if (promoType === "gift") {
//                     badge = "Free Gift";
//                     promoMessage = "Get a free gift on qualifying order";
//                 }

//                 return {
//                     ...card,
//                     mrp: Math.round(p.mrp),                      // ✅ round mrp
//                     price: Math.round(p.price),                  // ✅ round price
//                     discountPercent: Math.max(0, Math.round(p.discountPercent ?? 0)),
//                     discountAmount: Math.max(0, Math.round(p.discount ?? 0)),
//                     badge,
//                     promoMessage,
//                 };
//             })
//         );

//         const total = aggResult?.totalArr?.[0]?.count ?? 0;

//         res.json({
//             products,
//             pagination: {
//                 page,
//                 limit,
//                 total,
//                 pages: Math.ceil(total / limit) || 1,
//             },
//             promoMeta: promo,
//         });
//     } catch (err) {
//         console.error("getPromotionProducts error:", err);
//         res.status(500).json({
//             message: "Failed to fetch promotion products",
//             error: err.message,
//         });
//     }
// };
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

        /* ---------- ✅ Special Case: Collection Promotions ---------- */
        if (promoType === "collection") {
            const maxPrice = Number(promo.promotionConfig?.maxProductPrice || 0);

            const baseMatch = {};
            if (maxPrice > 0) {
                baseMatch.price = { $lte: maxPrice };
            }
            if (search) {
                baseMatch.name = { $regex: escapeRegex(search), $options: "i" };
            }

            // ✅ Apply dynamic filters here
            const filters = normalizeFilters(req.query);
            const match = applyDynamicFilters(baseMatch, filters);

            const [aggResult] = await Product.aggregate([
                { $match: match },
                {
                    $sort: sort === "price_asc" ? { price: 1 } :
                        sort === "price_desc" ? { price: -1 } :
                            { createdAt: -1 }
                },
                {
                    $facet: {
                        data: [
                            { $skip: (page - 1) * limit },
                            { $limit: limit },
                        ],
                        totalArr: [{ $count: "count" }],
                    },
                },
            ]);

            const rawProducts = aggResult?.data ?? [];
            const products = await Promise.all(
                rawProducts.map(async (p) => {
                    const card = await formatProductCard(p);
                    return {
                        ...card,
                        badge: `Under ₹${maxPrice}`,
                        promoMessage: `Part of the ${promo.campaignName} collection`,
                    };
                })
            );

            const total = aggResult?.totalArr?.[0]?.count ?? 0;

            // ✅ Friendly message
            let message = null;
            if (total === 0) {
                if (search) {
                    message = `No products found matching “${search}” in this collection.`;
                } else if (filters.minPrice || filters.maxPrice || filters.brandIds?.length) {
                    message = `No products found with the selected filters for this collection.`;
                } else {
                    message = `No products available under ₹${maxPrice} at the moment.`;
                }
            }

            return res.json({
                products,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit) || 1,
                },
                promoMeta: promo,
                message,   // 👈 add this line
            });
        }

        /* ---------- ✅ Special Case: Bundle Promotions ---------- */
        if (promoType === "bundle") {
            // (no change – filtering doesn’t apply here since bundle products are explicit)
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

        const baseMatch = {};
        if (baseOr.length) baseMatch.$or = baseOr;
        if (search) baseMatch.name = { $regex: escapeRegex(search), $options: "i" };

        // ✅ Apply dynamic filters here too
        const filters = normalizeFilters(req.query);
        const match = applyDynamicFilters(baseMatch, filters);

        // (rest of aggregation pipeline unchanged)
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
            { $match: match },   // ✅ now uses dynamic filters
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
            {
                $sort: sort === "price_asc" ? { price: 1 } :
                    sort === "price_desc" ? { price: -1 } :
                        sort === "discount" ? { discountPercent: -1, discount: -1 } :
                            { createdAt: -1 }
            },
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
                    mrp: Math.round(p.mrp),
                    price: Math.round(p.price),
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