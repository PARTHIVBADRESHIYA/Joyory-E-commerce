import Promotion from "../../models/Promotion.js";
import Product from "../../models/Product.js";
import { isObjectId } from "../../controllers/user/userPromotionController.js";
import { normalizeFilters, applyDynamicFilters } from "../../controllers/user/userProductController.js";
import { escapeRegex, asMoney } from "../../controllers/user/userPromotionController.js";
import { formatProductCard } from "../../middlewares/utils/recommendationService.js";
import { enrichProductWithStockAndOptions } from "../../middlewares/services/productHelpers.js";

import mongoose from "mongoose";
const { ObjectId } = mongoose.Types;

// ✅ Reusable helper
// export const fetchPromotionProductsHelper = async (params) => {
//     const { id, query } = params;

//     if (!isObjectId(id)) {
//         throw new Error("Invalid promotion id");
//     }

//     const page = Math.max(1, parseInt(query.page ?? "1", 10));
//     const rawLimit = parseInt(query.limit ?? "24", 10);
//     const limit = Math.min(Math.max(1, rawLimit), 60);
//     const search = (query.search ?? "").toString().trim();
//     const sort = (query.sort ?? "newest").toString().trim();

//     // 🔹 Load promo
//     const promo = await Promotion.findById(id)
//         .populate("categories.category", "_id name slug")
//         .populate("products", "_id name category")
//         .lean();

//     if (!promo) throw new Error("Promotion not found");

//     const promoType = promo.promotionType;

//     /* ---------- ✅ Special Case: Collection Promotions ---------- */
//     if (promoType === "collection") {
//         const maxPrice = Number(promo.promotionConfig?.maxProductPrice || 0);
//         const baseMatch = {};
//         if (maxPrice > 0) baseMatch.price = { $lte: maxPrice };
//         if (search) baseMatch.name = { $regex: escapeRegex(search), $options: "i" };

//         const filters = normalizeFilters(query);
//         const match = applyDynamicFilters(baseMatch, filters);

//         const [aggResult] = await Product.aggregate([
//             { $match: match },
//             {
//                 $sort: sort === "price_asc" ? { price: 1 } :
//                     sort === "price_desc" ? { price: -1 } :
//                         { createdAt: -1 }
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
//         ]);

//         const rawProducts = aggResult?.data ?? [];
//         const products = await Promise.all(
//             rawProducts.map(async (p) => {
//                 const card = await formatProductCard(p);
//                 return {
//                     ...card,
//                     badge: `Under ₹${maxPrice}`,
//                     promoMessage: `Part of the ${promo.campaignName} collection`,
//                 };
//             })
//         );

//         const total = aggResult?.totalArr?.[0]?.count ?? 0;
//         let message = null;
//         if (total === 0) {
//             if (search) {
//                 message = `No products found matching “${search}” in this collection.`;
//             } else if (filters.minPrice || filters.maxPrice || filters.brandIds?.length) {
//                 message = `No products found with the selected filters for this collection.`;
//             } else {
//                 message = `No products available under ₹${maxPrice} at the moment.`;
//             }
//         }

//         return {
//             products,
//             pagination: {
//                 page,
//                 limit,
//                 total,
//                 pages: Math.ceil(total / limit) || 1,
//             },
//             promoMeta: promo,
//             message,
//         };
//     }

//     /* ---------- ✅ Special Case: Bundle Promotions ---------- */
//     if (promoType === "bundle") {
//         const bundleProductIds = promo.promotionConfig?.bundleProducts?.length
//             ? promo.promotionConfig.bundleProducts
//             : promo.products?.map((p) => p._id ?? p) || [];

//         const bundleProducts = await Product.find({ _id: { $in: bundleProductIds } }).lean();
//         if (!bundleProducts.length) {
//             return {
//                 products: [],
//                 pagination: { page: 1, limit: 1, total: 0, pages: 0 },
//                 promoMeta: promo,
//             };
//         }

//         const totalMrp = bundleProducts.reduce((sum, p) => sum + (p.mrp || p.price || 0), 0);
//         const bundlePrice = Number(promo.promotionConfig?.bundlePrice || 0);
//         const discountAmount = bundlePrice > 0 ? totalMrp - bundlePrice : 0;
//         const discountPercent = bundlePrice > 0 ? Math.round((discountAmount / totalMrp) * 100) : 0;

//         const bundleItems = await Promise.all(
//             bundleProducts.map(async (p) => {
//                 const card = await formatProductCard(p);
//                 return {
//                     ...card,
//                     effectivePrice: Math.round(
//                         totalMrp > 0 ? ((p.mrp || p.price || 0) / totalMrp) * bundlePrice : 0
//                     ),
//                 };
//             })
//         );

//         const product = {
//             _id: promo._id,
//             name: promo.campaignName,
//             description: promo.description,
//             image: promo.images?.[0] || (bundleProducts[0]?.images?.[0] ?? ""),
//             brand: "Combo Offer",
//             mrp: Math.round(totalMrp),
//             price: Math.round(bundlePrice),
//             discountPercent,
//             discountAmount,
//             badge: "Bundle Deal",
//             promoMessage: promo.promotionConfig?.promoMessage || "Special price when bought together",
//             display: {
//                 mrpLabel: `₹${Math.round(totalMrp)}`,
//                 priceLabel: `₹${Math.round(bundlePrice)}`,
//                 discountLabel: `${discountPercent}% off`,
//                 savingsLabel: `You save ₹${discountAmount}`,
//             },
//             extra: {
//                 complimentaryGift: promo.promotionConfig?.giftText || null,
//             },
//             bundleItems,
//         };

//         return {
//             products: [product],
//             pagination: { page: 1, limit: 1, total: 1, pages: 1 },
//             promoMeta: promo,
//         };
//     }

//     /* ---------- 🔹 Regular Promo Flow (discount, tiered, bogo, etc.) ---------- */
//     const baseOr = [];
//     if (promo.scope === "category" && promo.categories?.length) {
//         const catIds = promo.categories.map((c) => c?.category?._id).filter(Boolean).map((id) => new ObjectId(id));
//         if (catIds.length) {
//             baseOr.push({ category: { $in: catIds } });
//             baseOr.push({ categoryHierarchy: { $in: catIds } });
//         }
//     } else if (promo.scope === "product" && promo.products?.length) {
//         const pids = promo.products.map((p) => new ObjectId(p._id ?? p));
//         baseOr.push({ _id: { $in: pids } });
//     } else if (promo.scope === "brand" && promo.brands?.length) {
//         const brandIds = promo.brands.map((b) => new ObjectId(b?.brand?._id ?? b?.brand)).filter(Boolean);
//         if (brandIds.length) baseOr.push({ brand: { $in: brandIds } });
//     }

//     const baseMatch = {};
//     if (baseOr.length) baseMatch.$or = baseOr;
//     if (search) baseMatch.name = { $regex: escapeRegex(search), $options: "i" };

//     const filters = normalizeFilters(query);
//     const match = applyDynamicFilters(baseMatch, filters);

//     const promoValue = Number(promo.discountValue || 0);
//     const promoIsPercent = promoType === "discount" && promo.discountUnit === "percent" && promoValue > 0;
//     const promoIsAmount = promoType === "discount" && promo.discountUnit === "amount" && promoValue > 0;
//     const tiers = Array.isArray(promo.promotionConfig?.tiers) ? promo.promotionConfig.tiers : [];
//     const bestTierPercent = tiers.length ? Math.max(...tiers.map((t) => Number(t.discountPercent || 0))) : 0;

//     const pipeline = [
//         { $match: match },
//         {
//             $addFields: { mrpEff: { $ifNull: ["$mrp", "$price"] } },
//         },
//         {
//             $addFields: {
//                 discountedPrice: {
//                     $let: {
//                         vars: { mrpEff: { $ifNull: ["$mrp", "$price"] } },
//                         in:
//                             promoType === "discount"
//                                 ? promoIsPercent
//                                     ? {
//                                         $max: [0, { $subtract: ["$$mrpEff", { $divide: [{ $multiply: ["$$mrpEff", promoValue] }, 100] }] }],
//                                     }
//                                     : { $max: [0, { $subtract: ["$$mrpEff", promoValue] }] }
//                                 : promoType === "tieredDiscount"
//                                     ? {
//                                         $max: [0, { $subtract: ["$$mrpEff", { $divide: [{ $multiply: ["$$mrpEff", bestTierPercent] }, 100] }] }],
//                                     }
//                                     : "$price",
//                     },
//                 },
//             },
//         },
//         {
//             $addFields: {
//                 discountAmount: { $max: [0, { $subtract: ["$mrpEff", "$discountedPrice"] }] },
//                 discountPercent: {
//                     $cond: [
//                         { $gt: ["$mrpEff", 0] },
//                         {
//                             $floor: {
//                                 $multiply: [
//                                     { $divide: [{ $subtract: ["$mrpEff", "$discountedPrice"] }, "$mrpEff"] },
//                                     100,
//                                 ],
//                             },
//                         },
//                         0,
//                     ],
//                 },
//             },
//         },
//         {
//             $project: {
//                 name: 1,
//                 brand: 1,
//                 variant: 1,
//                 category: 1,
//                 images: 1,
//                 mrp: "$mrpEff",
//                 price: "$discountedPrice",
//                 discount: "$discountAmount",
//                 discountPercent: 1,
//                 avgRating: 1,
//                 commentsCount: 1,
//             },
//         },
//         {
//             $sort: sort === "price_asc" ? { price: 1 } :
//                 sort === "price_desc" ? { price: -1 } :
//                     sort === "discount" ? { discountPercent: -1, discount: -1 } :
//                         { createdAt: -1 },
//         },
//         {
//             $facet: {
//                 data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
//                 totalArr: [{ $count: "count" }],
//             },
//         },
//     ];

//     const [aggResult] = await Product.aggregate(pipeline).collation({ locale: "en", strength: 2 });
//     const rawProducts = aggResult?.data ?? [];

//     const products = await Promise.all(
//         rawProducts.map(async (p) => {
//             const card = await formatProductCard(p);
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
//                 ...card,
//                 mrp: Math.round(p.mrp),
//                 price: Math.round(p.price),
//                 discountPercent: Math.max(0, Math.round(p.discountPercent ?? 0)),
//                 discountAmount: Math.max(0, Math.round(p.discount ?? 0)),
//                 badge,
//                 promoMessage,
//             };
//         })
//     );

//     const total = aggResult?.totalArr?.[0]?.count ?? 0;

//     return {
//         products,
//         pagination: {
//             page,
//             limit,
//             total,
//             pages: Math.ceil(total / limit) || 1,
//         },
//         promoMeta: promo,
//     };
// };

// export const fetchPromotionProductsHelper = async (params) => {
//     const { id, query } = params;

//     if (!isObjectId(id)) throw new Error("Invalid promotion id");

//     const page = Math.max(1, parseInt(query.page ?? "1", 10));
//     const rawLimit = parseInt(query.limit ?? "24", 10);
//     const limit = Math.min(Math.max(1, rawLimit), 60);
//     const search = (query.search ?? "").toString().trim();
//     const sort = (query.sort ?? "newest").toString().trim();

//     // 🔹 Load promo
//     const promo = await Promotion.findById(id)
//         .populate("categories.category", "_id name slug")
//         .populate("products", "_id name category")
//         .lean();

//     if (!promo) throw new Error("Promotion not found");

//     const promoType = promo.promotionType;
//     const promoValue = Number(promo.discountValue || 0);
//     const promoIsPercent = promo.discountUnit === "percent" && promoValue > 0;
//     const promoIsAmount = promo.discountUnit === "amount" && promoValue > 0;

//     const filters = normalizeFilters(query);

//     // ✅ Base match logic
//     const baseOr = [];
//     if (promo.scope === "category" && promo.categories?.length) {
//         const catIds = promo.categories
//             .map((c) => c?.category?._id)
//             .filter(Boolean)
//             .map((id) => new ObjectId(id));
//         baseOr.push({ category: { $in: catIds } }, { categories: { $in: catIds } });
//     } else if (promo.scope === "product" && promo.products?.length) {
//         const pids = promo.products.map((p) => new ObjectId(p._id ?? p));
//         baseOr.push({ _id: { $in: pids } });
//     } else if (promo.scope === "brand" && promo.brands?.length) {
//         const brandIds = promo.brands
//             .map((b) => new ObjectId(b?.brand?._id ?? b?.brand))
//             .filter(Boolean);
//         if (brandIds.length) baseOr.push({ brand: { $in: brandIds } });
//     }

//     const baseMatch = {};
//     if (baseOr.length) baseMatch.$or = baseOr;
//     if (search) baseMatch.name = { $regex: escapeRegex(search), $options: "i" };
//     const match = applyDynamicFilters(baseMatch, filters);
//     match.isPublished = true;

//     // ✅ Sorting
//     const sortOptions = {
//         newest: { createdAt: -1 },
//         priceLowToHigh: { price: 1 },
//         priceHighToLow: { price: -1 },
//         rating: { avgRating: -1 },
//         discount: { discountPercent: -1 },
//     };

//     // ✅ Fetch products
//     const total = await Product.countDocuments(match);
//     const products = await Product.find(match)
//         .sort(sortOptions[sort] || { createdAt: -1 })
//         .skip((page - 1) * limit)
//         .limit(limit)
//         .lean();

//     if (!products.length) {
//         return {
//             promoMeta: promo,
//             products: [],
//             pagination: { page, limit, total: 0, pages: 0 },
//             message: "No products found for this promotion.",
//         };
//     }

//     // ✅ Active promotions (include current one for enrichment)
//     const now = new Date();
//     const activePromos = [
//         promo,
//         ...(await Promotion.find({
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now },
//         }).lean()),
//     ];

//     // ✅ Enrich products like category logic
//     const enriched = products.map((p) => enrichProductWithStockAndOptions(p, activePromos));

//     // ✅ Apply promotion-based pricing for each variant
//     const promoAdjusted = enriched.map((product) => {
//         const updatedVariants = product.variants?.map((variant) => {
//             const basePrice = variant.originalPrice ?? variant.displayPrice ?? product.price ?? 0;
//             let newPrice = basePrice;

//             if (promoIsPercent) newPrice = Math.max(0, basePrice - (basePrice * promoValue) / 100);
//             else if (promoIsAmount) newPrice = Math.max(0, basePrice - promoValue);

//             const discountPercent = Math.round(((basePrice - newPrice) / basePrice) * 100);

//             return {
//                 ...variant,
//                 originalPrice: Math.round(basePrice),
//                 displayPrice: Math.round(newPrice),
//                 discountPercent: `${discountPercent}% off`,
//                 badge: promoIsPercent
//                     ? `${promoValue}% Off`
//                     : promoIsAmount
//                         ? `₹${promoValue} Off`
//                         : null,
//                 promoMessage:
//                     promoIsPercent || promoIsAmount
//                         ? `Save ${promoIsPercent ? `${promoValue}%` : `₹${promoValue}`
//                         } on this variant`
//                         : null,
//             };
//         });

//         return {
//             ...product,
//             variants: updatedVariants,
//             selectedVariant: null,
//         };
//     });

//     // ✅ Format for UI cards
//     const cards = await Promise.all(promoAdjusted.map((p) => formatProductCard(p)));

//     // ✅ Add promo badge/message at product level
//     const finalProducts = cards.map((p) => ({
//         ...p,
//         badge: promoIsPercent
//             ? `${promoValue}% Off`
//             : promoIsAmount
//                 ? `₹${promoValue} Off`
//                 : null,
//         promoMessage:
//             promoIsPercent || promoIsAmount
//                 ? `Save ${promoIsPercent ? `${promoValue}%` : `₹${promoValue}`} on this product`
//                 : null,
//     }));

//     return {
//         promoMeta: promo,
//         products: finalProducts,
//         pagination: {
//             page,
//             limit,
//             total,
//             pages: Math.ceil(total / limit) || 1,
//         },
//         message: null,
//     };
// };


export const fetchPromotionProductsHelper = async (params) => {
    const { id, query } = params;
    if (!isObjectId(id)) throw new Error("Invalid promotion id");

    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const rawLimit = parseInt(query.limit ?? "24", 10);
    const limit = Math.min(Math.max(1, rawLimit), 60);
    const search = (query.search ?? "").trim();
    const sort = (query.sort ?? "newest").trim();

    // Load promotion
    const promo = await Promotion.findById(id)
        .populate("categories.category", "_id name slug")
        .populate("products", "_id name category")
        .lean();

    if (!promo) throw new Error("Promotion not found");

    const promoMaxPrice = Number(promo.promotionConfig?.maxProductPrice || 0); // e.g., 499

    const filters = normalizeFilters(query);

    // Build base query
    const baseOr = [];
    if (promo.scope === "category" && promo.categories?.length) {
        const catIds = promo.categories.map(c => c?.category?._id).filter(Boolean).map(id => new ObjectId(id));
        baseOr.push({ category: { $in: catIds } }, { categories: { $in: catIds } });
    } else if (promo.scope === "product" && promo.products?.length) {
        const pids = promo.products.map(p => new ObjectId(p._id ?? p));
        baseOr.push({ _id: { $in: pids } });
    } else if (promo.scope === "brand" && promo.brands?.length) {
        const brandIds = promo.brands.map(b => new ObjectId(b?.brand?._id ?? b?.brand)).filter(Boolean);
        if (brandIds.length) baseOr.push({ brand: { $in: brandIds } });
    }

    const baseMatch = {};
    if (baseOr.length) baseMatch.$or = baseOr;
    if (search) baseMatch.name = { $regex: escapeRegex(search), $options: "i" };
    const match = applyDynamicFilters(baseMatch, filters);
    match.isPublished = true;

    const sortOptions = {
        newest: { createdAt: -1 },
        priceLowToHigh: { "variants.displayPrice": 1 },
        priceHighToLow: { "variants.displayPrice": -1 },
        rating: { avgRating: -1 },
    };

    const total = await Product.countDocuments(match);
    const products = await Product.find(match)
        .sort(sortOptions[sort] || { createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

    if (!products.length) return {
        promoMeta: promo,
        products: [],
        pagination: { page, limit, total: 0, pages: 0 },
        message: "No products found for this promotion.",
    };

    // Enrich products
    const now = new Date();
    const activePromos = [
        promo,
        ...(await Promotion.find({ status: "active", startDate: { $lte: now }, endDate: { $gte: now } }).lean()),
    ];

    const enriched = products.map(p => enrichProductWithStockAndOptions(p, activePromos));

    // Apply "Under ₹price" logic variant-wise & handle no-variant products
    const promoAdjusted = enriched.map(product => {
        let eligibleVariants = [];

        if (product.variants?.length) {
            // Filter variants that satisfy promoMaxPrice
            eligibleVariants = product.variants
                .filter(v => (v.displayPrice ?? v.originalPrice ?? product.price ?? 0) <= promoMaxPrice)
                .map(v => ({
                    ...v,
                    badge: `Under ₹${promoMaxPrice}`,
                    promoMessage: `Part of ${promo.campaignName} — under ₹${promoMaxPrice}`,
                }));

            if (!eligibleVariants.length) return null; // skip product if no variants eligible
        } else {
            // Product has no variants
            if ((product.price ?? 0) <= promoMaxPrice) {
                eligibleVariants = [{
                    ...product,
                    displayPrice: product.price,
                    originalPrice: product.price,
                    badge: `Under ₹${promoMaxPrice}`,
                    promoMessage: `Part of ${promo.campaignName} — under ₹${promoMaxPrice}`,
                }];
            } else return null; // skip product if price > promoMaxPrice
        }

        // Pick the lowest priced variant/product
        const minVariant = eligibleVariants.reduce((a, b) => (a.displayPrice < b.displayPrice ? a : b));

        // Update variant badges/messages
        const updatedVariants = product.variants?.map(variant => {
            const price = variant.displayPrice ?? variant.originalPrice ?? product.price ?? 0;
            const isEligible = price <= promoMaxPrice;
            return {
                ...variant,
                badge: isEligible ? `Under ₹${promoMaxPrice}` : null,
                promoMessage: isEligible ? `Part of ${promo.campaignName} — under ₹${promoMaxPrice}` : null,
            };
        }) || eligibleVariants; // if no variants, use eligibleVariants array

        return {
            ...product,
            variants: updatedVariants,
            selectedVariant: minVariant,
            basePrice: minVariant.displayPrice,
        };
    }).filter(Boolean);

    // Sort by lowest price
    promoAdjusted.sort((a, b) => a.basePrice - b.basePrice);

    // Format for frontend
    const finalCards = await Promise.all(promoAdjusted.map(p => formatProductCard(p)));

    // Attach promo metadata at product level
    const finalProducts = finalCards.map(p => ({
        ...p,
        badge: `Under ₹${promoMaxPrice}`,
        promoMessage: `Grab deals under ₹${promoMaxPrice}`,
    }));

    return {
        promoMeta: promo,
        products: finalProducts,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
        message: null,
    };
};


