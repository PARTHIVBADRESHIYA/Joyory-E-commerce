// // controllers/promotionController.js
// import Promotion from '../../models/Promotion.js';
// import Product from '../../models/Product.js';
// import mongoose from 'mongoose';

// /* ----------------------------- HELPERS ----------------------------- */

// function applyPromoPrice(promo, product) {
//     const mrp = product.mrp ?? product.price;
//     if (promo.promotionType !== 'discount' || !promo.discountValue) {
//         return { price: product.price, mrp, discount: 0 };
//     }
//     let price = mrp;
//     if (promo.discountUnit === 'percent') {
//         price = Math.max(0, mrp - (mrp * promo.discountValue) / 100);
//     } else {
//         price = Math.max(0, mrp - promo.discountValue);
//     }
//     return {
//         price: Math.round(price),
//         mrp,
//         discount: Math.max(0, mrp - price)
//     };
// }

// function getCountdown(endDate) {
//     const now = new Date();
//     const end = new Date(endDate);
//     const diff = end - now;
//     if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
//     return {
//         days: Math.floor(diff / 86400000),
//         hours: Math.floor((diff % 86400000) / 3600000),
//         minutes: Math.floor((diff % 3600000) / 60000),
//         seconds: Math.floor((diff % 60000) / 1000)
//     };
// }

// function escapeRegex(str = '') {
//     return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// }

// /* --------------------------- CONTROLLERS --------------------------- */
// /**
//  * GET /api/promotions/active
//  * Home page → list active promotions as cards (title, image, discount label, endDate, countdown)
//  */
// export const getActivePromotionsForUsers = async (req, res) => {
//     try {
//         const now = new Date();

//         const promos = await Promotion.find({
//             status: 'active',
//             startDate: { $lte: now },
//             endDate: { $gte: now },
//         })
//             .select('campaignName images discountUnit discountValue endDate promotionType') // add fields you actually store
//             .lean();

//         const payload = promos.map((p) => {
//             // Prefer explicit, truthful labels on homepage cards
//             let discountPercent = null;
//             let discountAmount = null;
//             let discountLabel = '';

//             if (p.promotionType === 'discount' && p.discountValue) {
//                 if (p.discountUnit === 'percent') {
//                     discountPercent = Number(p.discountValue) || 0;
//                     discountLabel = `${discountPercent}% OFF`;
//                 } else {
//                     discountAmount = Number(p.discountValue) || 0;
//                     discountLabel = `₹${discountAmount} OFF`;
//                     // If you MUST force percent for amount promos, you could estimate here,
//                     // but it may be misleading. Better to keep amount label.
//                 }
//             }

//             return {
//                 _id: p._id,
//                 title: p.campaignName,
//                 images: p.images || '',
//                 // keep both; frontend can decide which to show
//                 discountPercent, // null when amount-based
//                 discountAmount,  // null when percent-based
//                 discountLabel,   // always set
//                 endDate: p.endDate,
//                 countdown: getCountdown(p.endDate),
//             };
//         });

//         res.json(payload);
//     } catch (e) {
//         console.error('Error fetching active promotions:', e);
//         res.status(500).json({ message: 'Failed to load active promotions' });
//     }
// };

// /**
//  * GET /api/promotions/:id/products
//  * Query params:
//  *  - page=1&limit=24
//  *  - category=<csv of category ids>
//  *  - brand=<csv of brand names or ids depending on your schema>
//  *  - minPrice=100&maxPrice=5000
//  *  - search=lipstick
//  *  - sort=price_asc|price_desc|newest|discount
//  *
//  * Promo page → list products ONLY (preview), with filters & proper pagination.
//  */
// export const getPromotionProducts = async (req, res) => {
//     try {
//         const { id } = req.params;

//         // --- Parse & sanitize query ---
//         const page = Math.max(1, parseInt(req.query.page ?? '1', 10));
//         const rawLimit = parseInt(req.query.limit ?? '24', 10);
//         const limit = Math.min(Math.max(1, rawLimit), 60); // hard cap to prevent abuse

//         const categoryParam = (req.query.category ?? '').toString().trim();
//         const brandParam = (req.query.brand ?? '').toString().trim();
//         const minPrice = req.query.minPrice ? Number(req.query.minPrice) : undefined;
//         const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined;
//         const search = (req.query.search ?? '').toString().trim();
//         const sort = (req.query.sort ?? 'newest').toString().trim();

//         const promo = await Promotion.findById(id)
//             .populate('categories.category', '_id name slug')
//             .populate('products', '_id name category')
//             .lean();

//         if (!promo) {
//             return res.status(404).json({ message: 'Promotion not found' });
//         }

//         // --- Build base match from promo scope ---
//         const baseOr = [];
//         if (promo.scope === 'category' && Array.isArray(promo.categories) && promo.categories.length) {
//             const catIds = promo.categories
//                 .map((c) => c?.category?._id)
//                 .filter(Boolean)
//                 .map((cid) => new mongoose.Types.ObjectId(cid));
//             if (catIds.length) {
//                 baseOr.push({ category: { $in: catIds } });
//                 baseOr.push({ categoryHierarchy: { $in: catIds } });
//             }
//         } else if (promo.scope === 'product' && Array.isArray(promo.products) && promo.products.length) {
//             const pids = promo.products.map((p) => new mongoose.Types.ObjectId(p._id));
//             baseOr.push({ _id: { $in: pids } });
//         }

//         const match = {};
//         if (baseOr.length) match.$or = baseOr;

//         // --- Apply user filters ---
//         if (categoryParam) {
//             const catIds = categoryParam
//                 .split(',')
//                 .map((s) => s.trim())
//                 .filter(Boolean)
//                 .map((s) => new mongoose.Types.ObjectId(s));
//             match.category = { $in: catIds };
//         }

//         if (brandParam) {
//             // If your schema stores brand as a string name:
//             const brands = brandParam
//                 .split(',')
//                 .map((s) => s.trim())
//                 .filter(Boolean);
//             if (brands.length) {
//                 match.brand = { $in: brands };
//             }
//             // If you store brand IDs, convert to ObjectIds instead.
//         }

//         if (typeof minPrice === 'number' || typeof maxPrice === 'number') {
//             match.price = {};
//             if (typeof minPrice === 'number') match.price.$gte = minPrice;
//             if (typeof maxPrice === 'number') match.price.$lte = maxPrice;
//         }

//         if (search) {
//             match.name = { $regex: escapeRegex(search), $options: 'i' };
//         }

//         // --- Aggregation to compute discount & sort correctly (esp. by discount) ---
//         const promoIsPercent =
//             promo.promotionType === 'discount' && promo.discountUnit === 'percent' && Number(promo.discountValue) > 0;
//         const promoIsAmount =
//             promo.promotionType === 'discount' && promo.discountUnit === 'amount' && Number(promo.discountValue) > 0;
//         const promoValue = Number(promo.discountValue) || 0;

//         // Compute fields server-side:
//         // mrpEff = coalesce(mrp, price)
//         // discountedPrice = based on promo settings (if not discount type, same as price/mrp)
//         // discountAmount = mrpEff - discountedPrice
//         // discountPercent = floor( (discountAmount / mrpEff) * 100 )
//         const addFieldsStage = {
//             $addFields: {
//                 mrpEff: { $ifNull: ['$mrp', '$price'] },
//                 discountedPrice: {
//                     $let: {
//                         vars: { mrpEff: { $ifNull: ['$mrp', '$price'] } },
//                         in: promo.promotionType === 'discount'
//                             ? (
//                                 promoIsPercent
//                                     ? { $max: [0, { $subtract: ['$$mrpEff', { $divide: [{ $multiply: ['$$mrpEff', promoValue] }, 100] }] }] }
//                                     : promoIsAmount
//                                         ? { $max: [0, { $subtract: ['$$mrpEff', promoValue] }] }
//                                         : '$price'
//                             )
//                             : '$price'
//                     }
//                 },
//             }
//         };

//         const addDiscountFieldsStage = {
//             $addFields: {
//                 discountAmount: { $max: [0, { $subtract: ['$mrpEff', '$discountedPrice'] }] },
//                 discountPercent: {
//                     $cond: [
//                         { $gt: ['$mrpEff', 0] },
//                         { $floor: { $multiply: [{ $divide: [{ $subtract: ['$mrpEff', '$discountedPrice'] }, '$mrpEff'] }, 100] } },
//                         0
//                     ]
//                 }
//             }
//         };

//         // Sorting
//         let sortStage = { $sort: { createdAt: -1, _id: 1 } }; // stable tiebreaker on _id
//         if (sort === 'price_asc') sortStage = { $sort: { discountedPrice: 1, _id: 1 } };
//         else if (sort === 'price_desc') sortStage = { $sort: { discountedPrice: -1, _id: 1 } };
//         else if (sort === 'newest') sortStage = { $sort: { createdAt: -1, _id: 1 } };
//         else if (sort === 'discount') sortStage = { $sort: { discountPercent: -1, discountAmount: -1, _id: 1 } };

//         // Main pipeline
//         const pipeline = [
//             { $match: match },
//             addFieldsStage,
//             addDiscountFieldsStage,
//             // project only what the card needs
//             {
//                 $project: {
//                     name: 1,
//                     brand: 1,
//                     images: 1,
//                     mrp: '$mrpEff',
//                     price: '$discountedPrice',
//                     discount: '$discountAmount',
//                     discountPercent: 1,
//                     createdAt: 1,
//                 }
//             },
//             sortStage,
//             {
//                 $facet: {
//                     data: [
//                         { $skip: (page - 1) * limit },
//                         { $limit: limit }
//                     ],
//                     totalArr: [{ $count: 'count' }]
//                 }
//             }
//         ];

//         const [aggResult] = await Product.aggregate(pipeline).collation({ locale: 'en', strength: 2 }); // case-insensitive sort for strings
//         const products = (aggResult?.data ?? []).map((p) => ({
//             _id: p._id,
//             name: p.name,
//             image: Array.isArray(p.images) && p.images.length ? p.images[0] : '',
//             brand: p.brand || '',
//             price: Math.round(p.price ?? 0),
//             mrp: Math.round(p.mrp ?? 0),
//             discount: Math.max(0, Math.round(p.discount ?? 0)),
//             discountPercent: Math.max(0, Math.round(p.discountPercent ?? 0)),
//         }));

//         let total = aggResult?.totalArr?.[0]?.count ?? 0;

//         // --- Fallback: if scope=product yields too few items, top up from related categories (max up to 15) ---
//         if (products.length < 10 && promo.scope === 'product' && Array.isArray(promo.products) && promo.products.length) {
//             const relatedCatIds = promo.products
//                 .map((p) => p?.category?._id)
//                 .filter(Boolean)
//                 .map((cid) => new mongoose.Types.ObjectId(cid));

//             if (relatedCatIds.length) {
//                 const fallbackMatch = {
//                     $or: [{ category: { $in: relatedCatIds } }, { categoryHierarchy: { $in: relatedCatIds } }]
//                 };

//                 const fallbackPipeline = [
//                     { $match: fallbackMatch },
//                     addFieldsStage,
//                     addDiscountFieldsStage,
//                     {
//                         $project: {
//                             name: 1, brand: 1, images: 1,
//                             mrp: '$mrpEff', price: '$discountedPrice',
//                             discount: '$discountAmount', discountPercent: 1, createdAt: 1,
//                         }
//                     },
//                     { $sort: { createdAt: -1, _id: 1 } },
//                     { $limit: Math.max(0, 15 - products.length) }
//                 ];

//                 const fallback = await Product.aggregate(fallbackPipeline).collation({ locale: 'en', strength: 2 });
//                 const mapped = fallback.map((p) => ({
//                     _id: p._id,
//                     name: p.name,
//                     image: Array.isArray(p.images) && p.images.length ? p.images[0] : '',
//                     brand: p.brand || '',
//                     price: Math.round(p.price ?? 0),
//                     mrp: Math.round(p.mrp ?? 0),
//                     discount: Math.max(0, Math.round(p.discount ?? 0)),
//                     discountPercent: Math.max(0, Math.round(p.discountPercent ?? 0)),
//                 }));

//                 products.push(...mapped);
//                 // Do not mutate `total` here; `total` reflects matched (not including fallback top-ups)
//             }
//         }

//         res.json({
//             products,
//             pagination: {
//                 page,
//                 limit,
//                 total,
//                 pages: Math.ceil(total / limit) || 1,
//             },
//         });
//     } catch (err) {
//         console.error('Error fetching promotion products:', err);
//         res.status(500).json({ message: 'Failed to fetch promotion products' });
//     }
// };

























// controllers/user/promotionController.js
import Promotion from "../../models/Promotion.js";
import Product from "../../models/Product.js";
import mongoose from "mongoose";

const ObjectId = mongoose.Types.ObjectId; // ✅ Fix for ReferenceError


/* ----------------------------- HELPERS ----------------------------- */
export const escapeRegex = (str = "") => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const isObjectId = (s) => typeof s === "string" && /^[0-9a-fA-F]{24}$/.test(s);

export const getCountdown = (endDate) => {
    const now = new Date();
    const end = new Date(endDate);
    const diff = end - now;
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    return {
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
    };
};

export const productMatchesPromo = (product, promo) => {
    // scope=product
    if (promo.scope === "product" && Array.isArray(promo.products) && promo.products.length) {
        const pid = product._id?.toString?.() || product._id;
        return promo.products.some((p) => p.toString() === pid);
    }
    // scope=category
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
    return false;
};

export const asMoney = (n) => Math.max(0, Math.round(Number(n || 0)));

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
export const getActivePromotionsForUsers = async (req, res) => {
    try {
        const now = new Date();
        const section = (req.query.section || "").toString().toLowerCase(); // 'product'|'banner'|'all'
        const baseFilter = {
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now },
        };

        const promos = await Promotion.find(baseFilter)
            .select(
                "campaignName description images promotionType promotionConfig discountUnit discountValue scope startDate endDate targetAudience categories products"
            )
            .populate("categories.category", "name slug")
            .lean();

        // split by purpose
        const productTypes = new Set(["discount", "tieredDiscount", "bogo", "bundle", "gift"]);
        const bannerTypes = new Set(["newUser", "paymentOffer", "freeShipping", "discount"]);

        let filtered = promos;
        if (section === "product") {
            filtered = promos.filter((p) => productTypes.has(p.promotionType));
        } else if (section === "banner") {
            filtered = promos.filter((p) => bannerTypes.has(p.promotionType));
        }

        // Map to lightweight payload for front-end cards
        const payload = filtered.map((p) => {
            // compute simple label / badge
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
                const top = tiers.length ? tiers.reduce((s, t) => Math.max(s, Number(t.discountPercent || 0)), 0) : 0;
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
                scope: p.scope,
                discountPercent,
                discountAmount,
                discountLabel,
                countdown: getCountdown(p.endDate),
                // pass small metadata so frontend can choose CTA behavior
                promoMeta: {
                    categories: (p.categories || []).map((c) => ({ id: c.category?._id, slug: c.slug || c.category?.slug, name: c.category?.name })),
                    products: (p.products || []).map((x) => (typeof x === "object" ? String(x._id ?? x) : String(x))),
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

export const getPromotionProducts = async (req, res) => {
    try {
        const { id } = req.params;
        if (!isObjectId(id)) return res.status(400).json({ message: "Invalid promotion id" });

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

        if (!promo) return res.status(404).json({ message: "Promotion not found" });

        // 🔹 Base match
        const baseOr = [];
        if (promo.scope === "category" && promo.categories?.length) {
            const catIds = promo.categories.map((c) => c?.category?._id).filter(Boolean).map((id) => new ObjectId(id));
            if (catIds.length) {
                baseOr.push({ category: { $in: catIds } });
                baseOr.push({ categoryHierarchy: { $in: catIds } });
            }
        } else if (promo.scope === "product" && promo.products?.length) {
            const pids = promo.products.map((p) => new ObjectId(p._id ?? p));
            baseOr.push({ _id: { $in: pids } });
        }

        const match = {};
        if (baseOr.length) match.$or = baseOr;
        if (search) match.name = { $regex: escapeRegex(search), $options: "i" };

        // 🔹 Promo setup
        const promoType = promo.promotionType;
        const promoValue = Number(promo.discountValue || 0);
        const promoIsPercent = promoType === "discount" && promo.discountUnit === "percent" && promoValue > 0;
        const promoIsAmount = promoType === "discount" && promo.discountUnit === "amount" && promoValue > 0;

        const tiers = Array.isArray(promo.promotionConfig?.tiers) ? promo.promotionConfig.tiers : [];
        const bestTierPercent = tiers.length ? Math.max(...tiers.map((t) => Number(t.discountPercent || 0))) : 0;

        // 🔹 Pipeline
        const addFieldsStage = {
            $addFields: {
                mrpEff: { $ifNull: ["$mrp", "$price"] },
                discountedPrice: {
                    $let: {
                        vars: { mrpEff: { $ifNull: ["$mrp", "$price"] } },
                        in:
                            promoType === "discount"
                                ? promoIsPercent
                                    ? { $max: [0, { $subtract: ["$$mrpEff", { $divide: [{ $multiply: ["$$mrpEff", promoValue] }, 100] }] }] }
                                    : { $max: [0, { $subtract: ["$$mrpEff", promoValue] }] }
                                : promoType === "tieredDiscount"
                                    ? { $max: [0, { $subtract: ["$$mrpEff", { $divide: [{ $multiply: ["$$mrpEff", bestTierPercent] }, 100] }] }] }
                                    : "$price",
                    },
                },
            },
        };

        const addDiscountFieldsStage = {
            $addFields: {
                discountAmount: { $max: [0, { $subtract: ["$mrpEff", "$discountedPrice"] }] },
                discountPercent: {
                    $cond: [
                        { $gt: ["$mrpEff", 0] },
                        { $floor: { $multiply: [{ $divide: [{ $subtract: ["$mrpEff", "$discountedPrice"] }, "$mrpEff"] }, 100] } },
                        0,
                    ],
                },
            },
        };

        let sortStage = { $sort: { createdAt: -1, _id: 1 } };
        if (sort === "price_asc") sortStage = { $sort: { discountedPrice: 1, _id: 1 } };
        else if (sort === "price_desc") sortStage = { $sort: { discountedPrice: -1, _id: 1 } };
        else if (sort === "discount") sortStage = { $sort: { discountPercent: -1, discountAmount: -1, _id: 1 } };

        const pipeline = [
            { $match: match },
            addFieldsStage,
            addDiscountFieldsStage,
            {
                $project: {
                    name: 1,
                    brand: 1,
                    images: 1,
                    mrp: "$mrpEff",
                    price: "$discountedPrice",
                    discount: "$discountAmount",
                    discountPercent: 1,
                    createdAt: 1,
                },
            },
            sortStage,
            { $facet: { data: [{ $skip: (page - 1) * limit }, { $limit: limit }], totalArr: [{ $count: "count" }] } },
        ];

        const [aggResult] = await Product.aggregate(pipeline).collation({ locale: "en", strength: 2 });

        // 🔹 Format products like Nykaa
        const products = (aggResult?.data ?? []).map((p) => {
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
            } else if (promoType === "bundle") {
                badge = "Bundle Deal";
                promoMessage = "Special price when bought together";
            } else if (promoType === "gift") {
                badge = "Free Gift";
                promoMessage = "Get a free gift on qualifying order";
            }

            return {
                _id: p._id,
                name: p.name,
                image: Array.isArray(p.images) && p.images.length ? p.images[0] : "",
                brand: p.brand || "",
                mrp: Math.round(p.mrp ?? 0),
                price: Math.round(p.price ?? 0),
                discountPercent: Math.max(0, Math.round(p.discountPercent ?? 0)),
                discountAmount: Math.max(0, Math.round(p.discount ?? 0)),
                badge,
                promoMessage, // 👈 NEW
                display: {
                    mrpLabel: `₹${Math.round(p.mrp ?? 0)}`,
                    priceLabel: `₹${Math.round(p.price ?? 0)}`,
                    discountLabel: badge || "",
                },
            };
        });


        const total = aggResult?.totalArr?.[0]?.count ?? 0;

        res.json({
            products,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
            promoMeta: promo,
        });
    } catch (err) {
        console.error("getPromotionProducts error:", err);
        res.status(500).json({ message: "Failed to fetch promotion products", error: err.message });
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