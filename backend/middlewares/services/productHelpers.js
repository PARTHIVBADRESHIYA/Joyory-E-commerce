// // helpers/productHelpers.js
// import { productMatchesPromo } from "../../controllers/user/userPromotionController.js";
// import Product from "../../models/Product.js";
// import Review from "../../models/Review.js";
// import { buildOptions, normalizeImages } from "../../controllers/user/userProductController.js";
// import { calculateVariantPrices } from "../../middlewares/services/promotionHelper.js";
// import { getPseudoVariant } from "../utils/recommendationService.js";

// export const enrichProductWithStockAndOptions = (product, promotions = []) => {
//     const { shadeOptions, colorOptions } = buildOptions(product);
//     const baseMrp = Number(product.mrp ?? product.price ?? 0);
//     const basePrice = Number(product.price ?? 0);

//     let variants = [];

//     // 🔹 Case: Product has variants
//     if (Array.isArray(product.variants) && product.variants.length > 0) {
//         variants = product.variants.map((v) => {
//             let status, message;
//             if (v.stock === 0) {
//                 status = "outOfStock";
//                 message = "No stock available now, please try again later";
//             } else if (v.stock < (v.thresholdValue || 5)) {
//                 status = "lowStock";
//                 message = `Few left (${v.stock})`;
//             } else {
//                 status = "inStock";
//                 message = "In-stock";
//             }

//             // ✅ Determine base values
//             const variantMrp = Number(v.mrp ?? baseMrp ?? v.price ?? basePrice);
//             const variantStaticPrice = Number(v.discountedPrice ?? v.price ?? basePrice);

//             // ✅ Calculate promo price (always on MRP)
//             let promoPrice = variantMrp;
//             let promoApplied = false;
//             for (const promo of promotions) {
//                 if (!productMatchesPromo(product, promo)) continue;
//                 if (promo.promotionType !== "discount") continue;

//                 const val = Number(promo.discountValue || 0);
//                 if (promo.discountUnit === "percent" && val > 0) {
//                     promoPrice = Math.round(variantMrp * (1 - val / 100));
//                     promoApplied = true;
//                 } else if (promo.discountUnit === "amount" && val > 0) {
//                     promoPrice = Math.max(0, variantMrp - val);
//                     promoApplied = true;
//                 }
//             }

//             // ✅ Final display = lower of static discounted vs promo
//             const finalDisplay = Math.min(variantStaticPrice, promoPrice);
//             const discountPercent =
//                 variantMrp > finalDisplay
//                     ? Math.round(((variantMrp - finalDisplay) / variantMrp) * 100)
//                     : 0;

//             return {
//                 ...v,
//                 shadeName: v.shadeName || product.variant || "Default",
//                 status,
//                 message,
//                 originalPrice: variantMrp,
//                 displayPrice: finalDisplay,
//                 discountAmount: variantMrp - finalDisplay,
//                 discountPercent,
//                 promoApplied: promoApplied && finalDisplay < variantStaticPrice,
//                 promoMessage:
//                     promoApplied && finalDisplay < variantStaticPrice
//                         ? `Save ${discountPercent}% under current promotion`
//                         : null,
//             };
//         });
//     } else {
//         // 🔹 Case: Single-variant fallback
//         const singleMrp = Number(product.mrp ?? product.price ?? 0);
//         const singleStaticPrice = Number(product.price ?? singleMrp);

//         let promoPrice = singleMrp;
//         let promoApplied = false;
//         for (const promo of promotions) {
//             if (!productMatchesPromo(product, promo)) continue;
//             if (promo.promotionType !== "discount") continue;

//             const val = Number(promo.discountValue || 0);
//             if (promo.discountUnit === "percent" && val > 0) {
//                 promoPrice = Math.round(singleMrp * (1 - val / 100));
//                 promoApplied = true;
//             } else if (promo.discountUnit === "amount" && val > 0) {
//                 promoPrice = Math.max(0, singleMrp - val);
//                 promoApplied = true;
//             }
//         }

//         const finalDisplay = Math.min(singleStaticPrice, promoPrice);
//         const discountPercent =
//             singleMrp > finalDisplay
//                 ? Math.round(((singleMrp - finalDisplay) / singleMrp) * 100)
//                 : 0;

//         const singleVariant = {
//             sku: product.sku ?? `${product._id}-default`,
//             shadeName: product.variant || "Default",
//             images: product.images || [],
//             stock: product.quantity ?? 0,
//             sales: product.sales ?? 0,
//             thresholdValue: product.thresholdValue ?? 0,
//             isActive: true,
//             toneKeys: [],
//             undertoneKeys: [],
//             originalPrice: singleMrp,
//             discountedPrice: singleStaticPrice,
//             displayPrice: finalDisplay,
//             discountAmount: singleMrp - finalDisplay,
//             discountPercent,
//             promoApplied: promoApplied && finalDisplay < singleStaticPrice,
//             promoMessage:
//                 promoApplied && finalDisplay < singleStaticPrice
//                     ? `Save ${discountPercent}% under current promotion`
//                     : null,
//             status: product.quantity > 0 ? "inStock" : "outOfStock",
//             message: product.quantity > 0 ? "In-stock" : "No stock available",
//         };

//         variants = [singleVariant];
//     }

//     return {
//         ...product,
//         variants,
//         shadeOptions,
//         colorOptions,
//         selectedVariant: variants[0] || null,
//         variant: variants[0]?.shadeName || product.variant || null,
//     };
// };

// export const enrichProductsUnified = async (products, promotions = [], options = {}) => {
//     const list = Array.isArray(products) ? products : [products];
//     const enrichedList = await Promise.all(
//         list.map(async (p) => {
//             const enriched = enrichProductWithStockAndOptions(p, promotions);

//             // 🔹 Normalize variants
//             let normalizedVariants = [];
//             if (Array.isArray(enriched.variants) && enriched.variants.length > 0) {
//                 normalizedVariants = calculateVariantPrices(enriched.variants, enriched, promotions);
//             } else if (enriched.variant && (!enriched.variants || !enriched.variants.length)) {
//                 const legacyVariant = {
//                     sku: enriched.sku ?? `${enriched._id}-default`,
//                     shadeName: enriched.variant || "Default",
//                     hex: null,
//                     images: normalizeImages(enriched.images || []),
//                     stock: enriched.quantity ?? 0,
//                     sales: enriched.sales ?? 0,
//                     thresholdValue: 0,
//                     isActive: true,
//                     toneKeys: [],
//                     undertoneKeys: [],
//                     originalPrice: enriched.mrp ?? enriched.price ?? 0,
//                     discountedPrice: enriched.price ?? 0,
//                     displayPrice: enriched.price ?? 0,
//                     discountAmount:
//                         enriched.mrp && enriched.price ? enriched.mrp - enriched.price : 0,
//                     discountPercent:
//                         enriched.mrp && enriched.mrp > enriched.price
//                             ? Math.round(((enriched.mrp - enriched.price) / enriched.mrp) * 100)
//                             : 0,
//                     createdAt: new Date(),
//                     status: enriched.quantity > 0 ? "inStock" : "outOfStock",
//                     message: enriched.quantity > 0 ? "In-stock" : "No stock available",
//                 };

//                 await Product.updateOne(
//                     { _id: enriched._id, "variants.sku": { $ne: legacyVariant.sku } },
//                     { $push: { variants: legacyVariant } }
//                 );

//                 normalizedVariants = calculateVariantPrices([legacyVariant], enriched, promotions);
//             } else {
//                 normalizedVariants = calculateVariantPrices(
//                     [getPseudoVariant(enriched)],
//                     enriched,
//                     promotions
//                 );
//             }

//             // 🔹 Ensure promo logic consistency after normalization
//             normalizedVariants = normalizedVariants.map((v) => {
//                 const variantMrp = Number(v.originalPrice ?? enriched.mrp ?? 0);
//                 const staticPrice = Number(v.discountedPrice ?? v.price ?? variantMrp);

//                 let promoPrice = variantMrp;
//                 let promoApplied = false;
//                 for (const promo of promotions) {
//                     if (!productMatchesPromo(enriched, promo)) continue;
//                     if (promo.promotionType !== "discount") continue;

//                     const val = Number(promo.discountValue || 0);
//                     if (promo.discountUnit === "percent" && val > 0) {
//                         promoPrice = Math.round(variantMrp * (1 - val / 100));
//                         promoApplied = true;
//                     } else if (promo.discountUnit === "amount" && val > 0) {
//                         promoPrice = Math.max(0, variantMrp - val);
//                         promoApplied = true;
//                     }
//                 }

//                 const finalDisplay = Math.min(staticPrice, promoPrice);
//                 const discountPercent =
//                     variantMrp > finalDisplay
//                         ? Math.round(((variantMrp - finalDisplay) / variantMrp) * 100)
//                         : 0;

//                 return {
//                     ...v,
//                     displayPrice: finalDisplay,
//                     discountPercent,
//                     discountAmount: variantMrp - finalDisplay,
//                     promoApplied: promoApplied && finalDisplay < staticPrice,
//                     promoMessage:
//                         promoApplied && finalDisplay < staticPrice
//                             ? `Save ${discountPercent}% under current promotion`
//                             : null,
//                 };
//             });

//             enriched.variants = normalizedVariants;

//             // 🔹 Shade options
//             enriched.shadeOptions = normalizedVariants.map((v) => ({
//                 name: v.shadeName || enriched.variant || "Default",
//                 sku: v.sku,
//                 image:
//                     Array.isArray(v.images) && v.images.length
//                         ? v.images[0]
//                         : enriched.thumbnail || null,
//                 price: v.displayPrice,
//                 status: v.status || "inStock",
//             }));

//             // 🔹 Select main display variant
//             const displayVariant =
//                 normalizedVariants.find((v) => v.sku === options.selectedSku) ||
//                 normalizedVariants.find((v) => v.stock > 0 && v.isActive) ||
//                 normalizedVariants[0] ||
//                 {};

//             const price = displayVariant.displayPrice ?? enriched.price ?? 0;
//             const mrp = displayVariant.originalPrice ?? enriched.mrp ?? enriched.price ?? 0;
//             const discountPercent =
//                 mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;

//             const status =
//                 displayVariant.status || (enriched.quantity > 0 ? "inStock" : "outOfStock");
//             const message =
//                 displayVariant.message ||
//                 (enriched.quantity > 0 ? "In-stock" : "No stock available");

//             // 🔹 Aggregate rating info
//             const [{ avg = 0, count = 0 } = {}] = await Review.aggregate([
//                 { $match: { productId: enriched._id, status: "Active" } },
//                 {
//                     $group: {
//                         _id: "$productId",
//                         avg: { $avg: "$rating" },
//                         count: { $sum: 1 },
//                     },
//                 },
//             ]);

//             const avgRating = Math.round((avg || 0) * 10) / 10;

//             return {
//                 _id: enriched._id,
//                 name: enriched.name,
//                 brand: enriched.brand || null,
//                 mrp,
//                 price,
//                 discountPercent,
//                 discountAmount: mrp - price,
//                 images: normalizeImages(enriched.images || []),
//                 variants: normalizedVariants,
//                 shadeOptions: enriched.shadeOptions || [],
//                 status,
//                 message,
//                 avgRating,
//                 totalRatings: count || 0,
//                 inStock: displayVariant.stock > 0 || enriched.quantity > 0,
//                 selectedVariant: displayVariant,
//             };
//         })
//     );

//     return Array.isArray(products) ? enrichedList : enrichedList[0];
// };




// helpers/productHelpers.js
import { productMatchesPromo } from "../../controllers/user/userPromotionController.js";
import Product from "../../models/Product.js";
import Review from "../../models/Review.js";
import { buildOptions, normalizeImages } from "../../controllers/user/userProductController.js";
import { calculateVariantPrices } from "../../middlewares/services/promotionHelper.js";
import { getPseudoVariant } from "../utils/recommendationService.js";
import { getRedis } from "../utils/redis.js";

// Cache TTLs (shorter to reflect promo expiry quickly)
const PRODUCT_PROMO_TTL = 5; // 5 seconds for promo freshness
const ENRICHED_PRODUCT_TTL = 5; // 5 seconds to auto-refresh after expiry

export const enrichProductWithStockAndOptions = (product, promotions = []) => {
    const { shadeOptions, colorOptions } = buildOptions(product);
    const baseMrp = Number(product.mrp ?? product.price ?? 0);
    const basePrice = Number(product.price ?? 0);

    let variants = [];

    if (Array.isArray(product.variants) && product.variants.length > 0) {
        variants = product.variants.map((v) => {
            let status, message;
            if (v.stock === 0) {
                status = "outOfStock";
                message = "No stock available now, please try again later";
            } else if (v.stock < (v.thresholdValue || 5)) {
                status = "lowStock";
                message = `Few left (${v.stock})`;
            } else {
                status = "inStock";
                message = "In-stock";
            }

            const variantMrp = Number(v.mrp ?? baseMrp ?? v.price ?? basePrice);
            const variantStaticPrice = Number(v.discountedPrice ?? v.price ?? basePrice);

            let promoPrice = variantMrp;
            let promoApplied = false;
            for (const promo of promotions) {
                if (!productMatchesPromo(product, promo)) continue;
                if (promo.promotionType !== "discount") continue;

                const val = Number(promo.discountValue || 0);
                if (promo.discountUnit === "percent" && val > 0) {
                    promoPrice = Math.round(variantMrp * (1 - val / 100));
                    promoApplied = true;
                } else if (promo.discountUnit === "amount" && val > 0) {
                    promoPrice = Math.max(0, variantMrp - val);
                    promoApplied = true;
                }
            }

            const finalDisplay = Math.min(variantStaticPrice, promoPrice);
            const discountPercent =
                variantMrp > finalDisplay
                    ? Math.round(((variantMrp - finalDisplay) / variantMrp) * 100)
                    : 0;

            return {
                ...v,
                shadeName: v.shadeName || product.variant || "Default",
                status,
                message,
                originalPrice: variantMrp,
                displayPrice: finalDisplay,
                discountAmount: variantMrp - finalDisplay,
                discountPercent,
                promoApplied: promoApplied && finalDisplay < variantStaticPrice,
                promoMessage:
                    promoApplied && finalDisplay < variantStaticPrice
                        ? `Save ${discountPercent}% under current promotion`
                        : null,
            };
        });
    } else {
        const singleMrp = Number(product.mrp ?? product.price ?? 0);
        const singleStaticPrice = Number(product.price ?? singleMrp);

        let promoPrice = singleMrp;
        let promoApplied = false;
        for (const promo of promotions) {
            if (!productMatchesPromo(product, promo)) continue;
            if (promo.promotionType !== "discount") continue;

            const val = Number(promo.discountValue || 0);
            if (promo.discountUnit === "percent" && val > 0) {
                promoPrice = Math.round(singleMrp * (1 - val / 100));
                promoApplied = true;
            } else if (promo.discountUnit === "amount" && val > 0) {
                promoPrice = Math.max(0, singleMrp - val);
                promoApplied = true;
            }
        }

        const finalDisplay = Math.min(singleStaticPrice, promoPrice);
        const discountPercent =
            singleMrp > finalDisplay
                ? Math.round(((singleMrp - finalDisplay) / singleMrp) * 100)
                : 0;

        variants = [
            {
                sku: product.sku ?? `${product._id}-default`,
                shadeName: product.variant || "Default",
                images: product.images || [],
                stock: product.quantity ?? 0,
                sales: product.sales ?? 0,
                thresholdValue: product.thresholdValue ?? 0,
                isActive: true,
                toneKeys: [],
                undertoneKeys: [],
                originalPrice: singleMrp,
                discountedPrice: singleStaticPrice,
                displayPrice: finalDisplay,
                discountAmount: singleMrp - finalDisplay,
                discountPercent,
                promoApplied: promoApplied && finalDisplay < singleStaticPrice,
                promoMessage:
                    promoApplied && finalDisplay < singleStaticPrice
                        ? `Save ${discountPercent}% under current promotion`
                        : null,
                status: product.quantity > 0 ? "inStock" : "outOfStock",
                message: product.quantity > 0 ? "In-stock" : "No stock available",
            },
        ];
    }

    return {
        ...product,
        variants,
        shadeOptions,
        colorOptions,
        selectedVariant: variants[0] || null,
        variant: variants[0]?.shadeName || product.variant || null,
    };
};

export const enrichProductsUnified = async (products, promotions = [], options = {}) => {
    const redis = getRedis();     // 🔥 FIX

    const list = Array.isArray(products) ? products : [products];
    const productIds = list.map(p => p._id.toString());

    const cacheKeys = productIds.map(id => `enrichedProduct:${id}`);
    const cachedProducts = cacheKeys.length
        ? await redis.mget(...cacheKeys)
        : [];
    const enrichedList = [];
    const missingProducts = [];

    for (let i = 0; i < list.length; i++) {
        if (cachedProducts[i]) {
            enrichedList.push(JSON.parse(cachedProducts[i]));
        } else {
            missingProducts.push(list[i]);
        }
    }

    if (missingProducts.length > 0) {
        const reviewStats = await Review.aggregate([
            { $match: { productId: { $in: missingProducts.map(p => p._id) }, status: "Active" } },
            { $group: { _id: "$productId", avg: { $avg: "$rating" }, count: { $sum: 1 } } }
        ]);
        const reviewMap = {};
        for (const r of reviewStats) reviewMap[r._id.toString()] = r;

        for (const p of missingProducts) {
            const enriched = enrichProductWithStockAndOptions(p, promotions);

            let normalizedVariants = [];
            if (Array.isArray(enriched.variants) && enriched.variants.length > 0) {
                normalizedVariants = calculateVariantPrices(enriched.variants, enriched, promotions);
            } else if (enriched.variant && (!enriched.variants || !enriched.variants.length)) {
                normalizedVariants = calculateVariantPrices([getPseudoVariant(enriched)], enriched, promotions);
            }

            normalizedVariants = normalizedVariants.map(v => {
                const variantMrp = Number(v.originalPrice ?? enriched.mrp ?? 0);
                const staticPrice = Number(v.discountedPrice ?? v.price ?? variantMrp);

                let promoPrice = variantMrp;
                let promoApplied = false;
                for (const promo of promotions) {
                    if (!productMatchesPromo(enriched, promo)) continue;
                    if (promo.promotionType !== "discount") continue;
                    const val = Number(promo.discountValue || 0);
                    if (promo.discountUnit === "percent" && val > 0) promoPrice = Math.round(variantMrp * (1 - val / 100)), promoApplied = true;
                    else if (promo.discountUnit === "amount" && val > 0) promoPrice = Math.max(0, variantMrp - val), promoApplied = true;
                }

                const finalDisplay = Math.min(staticPrice, promoPrice);
                const discountPercent = variantMrp > finalDisplay ? Math.round(((variantMrp - finalDisplay) / variantMrp) * 100) : 0;

                return {
                    ...v,
                    displayPrice: finalDisplay,
                    discountPercent,
                    discountAmount: variantMrp - finalDisplay,
                    promoApplied: promoApplied && finalDisplay < staticPrice,
                    promoMessage: promoApplied && finalDisplay < staticPrice ? `Save ${discountPercent}% under current promotion` : null,
                };
            });

            enriched.variants = normalizedVariants;
            enriched.shadeOptions = normalizedVariants.map(v => ({
                name: v.shadeName || enriched.variant || "Default",
                sku: v.sku,
                image: Array.isArray(v.images) && v.images.length ? v.images[0] : enriched.thumbnail || null,
                price: v.displayPrice,
                status: v.status || "inStock",
            }));

            const displayVariant = normalizedVariants.find(v => v.sku === options.selectedSku) ||
                normalizedVariants.find(v => v.stock > 0 && v.isActive) ||
                normalizedVariants[0] || {};

            const price = displayVariant.displayPrice ?? enriched.price ?? 0;
            const mrp = displayVariant.originalPrice ?? enriched.mrp ?? enriched.price ?? 0;
            const discountPercent = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
            const status = displayVariant.status || (enriched.quantity > 0 ? "inStock" : "outOfStock");
            const message = displayVariant.message || (enriched.quantity > 0 ? "In-stock" : "No stock available");

            const review = reviewMap[p._id.toString()] || {};
            const avgRating = Math.round((review.avg || 0) * 10) / 10;
            const totalRatings = review.count || 0;

            const finalEnriched = {
                _id: enriched._id,
                name: enriched.name,
                brand: enriched.brand || null,
                mrp,
                price,
                discountPercent,
                discountAmount: mrp - price,
                // 🔹 ADD THESE FIELDS
                description: enriched.description || "",
                howToUse: enriched.howToUse || "",
                ingredients: enriched.ingredients || "",
                features: enriched.features || "",
                images: normalizeImages(enriched.images || []),
                variants: normalizedVariants,
                shadeOptions: enriched.shadeOptions,
                status,
                message,
                avgRating,
                totalRatings,
                inStock: displayVariant.stock > 0 || enriched.quantity > 0,
                selectedVariant: displayVariant,
            };

            // 🔹 Short TTL to reflect promo changes immediately
            await redis.set(`enrichedProduct:${p._id}`, JSON.stringify(finalEnriched), "EX", ENRICHED_PRODUCT_TTL);
            enrichedList.push(finalEnriched);
        }
    }

    return Array.isArray(products) ? enrichedList : enrichedList[0];
};
