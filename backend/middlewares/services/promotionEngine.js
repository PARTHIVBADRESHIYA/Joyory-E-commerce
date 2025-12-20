
// // services/promotionEngine.js
// import Promotion from "../../models/Promotion.js";
// import Product from "../../models/Product.js";
// import {
//     productMatchesPromo,
//     applyFlatDiscount,
//     bestTierForQty,
//     isObjectId,
// } from "../../controllers/user/userPromotionController.js";
// import { enrichProductsUnified } from "../../middlewares/services/productHelpers.js";
// import {getRedis} from "../../middlewares/utils/redis.js"; // ✅ Added Redis

// export const applyPromotions = async (itemsInput, ctx = {}) => {
//     try {
//         if (!Array.isArray(itemsInput)) {
//             throw new Error("applyPromotions: itemsInput must be an array of cart items");
//         }
//         const redis = getRedis();  // 🔥 REQUIRED

//         /* ---------------------------------------------------------
//          🔥 PROMO CACHE (5 seconds TTL)
//         ---------------------------------------------------------- */
//         const promoCacheKey = "activePromotions";
//         let promos = [];

//         const cachedPromos = await redis.get(promoCacheKey);
//         if (cachedPromos) {
//             promos = JSON.parse(cachedPromos);
//         } else {
//             const now = new Date();
//             promos = await Promotion.find({
//                 status: "active",
//                 startDate: { $lte: now },
//                 endDate: { $gte: now },
//             })
//                 .select(
//                     "+promotionType +promotionConfig +scope +categories +products +discountUnit +discountValue +campaignName"
//                 )
//                 .lean();

//             await redis.set(promoCacheKey, JSON.stringify(promos), "EX", 5);
//         }

//         /* ---------------------------------------------------------
//          🔥 PRODUCT CACHE (per-product key | TTL 5 sec)
//         ---------------------------------------------------------- */
//         const ids = itemsInput.map((i) => i.productId).filter(isObjectId);

//         const productCacheKeys = ids.map((id) => `promoProduct:${id}`);
//         const cachedProducts = productCacheKeys.length
//             ? await redis.mget(...productCacheKeys)
//             : [];

//         let dbProducts = [];
//         let missingIds = [];

//         // Use cached products
//         for (let i = 0; i < ids.length; i++) {
//             if (cachedProducts[i]) {
//                 dbProducts.push(JSON.parse(cachedProducts[i]));
//             } else {
//                 missingIds.push(ids[i]);
//             }
//         }

//         // Fetch remaining from DB
//         if (missingIds.length > 0) {
//             const freshProducts = await Product.find({ _id: { $in: missingIds } })
//                 .select(
//                     "_id name images brand price mrp category categoryHierarchy variants sku quantity sales thresholdValue"
//                 )
//                 .lean();

//             for (const p of freshProducts) {
//                 await redis.set(`promoProduct:${p._id}`, JSON.stringify(p), "EX", 5);
//                 dbProducts.push(p);
//             }
//         }

//         /* ---------------------------------------------------------
//          🔥 Enrich products (already cached internally)
//         ---------------------------------------------------------- */
//         const enrichedProducts = await enrichProductsUnified(dbProducts, promos);
//         const productMap = new Map(enrichedProducts.map((p) => [p._id.toString(), p]));

//         /* ---------------------------------------------------------
//          🔥 Build Cart Lines
//         ---------------------------------------------------------- */
//         const cart = itemsInput
//             .map((i) => {
//                 const p = productMap.get(i.productId);
//                 if (!p) return null;

//                 const selectedSku = i.selectedVariant?.sku || i.sku;

//                 let variant =
//                     p.variants?.find((v) => v.sku === selectedSku) ||
//                     p.selectedVariant ||
//                     p.variants?.[0];

//                 if (!variant) {
//                     variant = {
//                         originalPrice: p.mrp ?? p.price ?? 0,
//                         displayPrice: p.price ?? 0,
//                     };
//                 }

//                 const variantMrp = Number(variant.originalPrice ?? p.mrp ?? 0);
//                 const variantBasePrice = Number(variant.displayPrice ?? variantMrp);

//                 // Apply product-level promotions
//                 let promoPrice = variantMrp;

//                 for (const promo of promos) {
//                     if (!productMatchesPromo(p, promo)) continue;
//                     if (promo.promotionType !== "discount") continue;

//                     const val = Number(promo.discountValue || 0);

//                     if (promo.discountUnit === "percent" && val > 0) {
//                         promoPrice = Math.round(variantMrp * (1 - val / 100));
//                     } else if (promo.discountUnit === "amount" && val > 0) {
//                         promoPrice = Math.max(0, variantMrp - val);
//                     }
//                 }

//                 const finalDisplay = Math.min(variantBasePrice, promoPrice);

//                 return {
//                     productId: p._id.toString(),
//                     name: p.name,
//                     image: Array.isArray(p.images) && p.images[0] ? p.images[0] : variant.images?.[0] || "",
//                     brand: p.brand || "",
//                     qty: Math.max(1, Number(i.qty || 1)),
//                     mrp: variantMrp,
//                     basePrice: finalDisplay,
//                     discounts: [],
//                     freebies: [],
//                     product: p,
//                 };
//             })
//             .filter(Boolean);

//         const appliedPromotions = [];

//         /* ---------------------------------------------------------
//          🔥 STEP 1: Product-level Promotions
//         ---------------------------------------------------------- */
//         for (const promo of promos) {
//             for (const line of cart) {
//                 if (!productMatchesPromo(line.product, promo)) continue;

//                 let candidateDiscount = null;

//                 // Flat
//                 if (promo.promotionType === "discount") {
//                     const { price: newUnitPrice } = applyFlatDiscount(line.basePrice, promo);
//                     const totalDiscount = (line.basePrice - newUnitPrice) * line.qty;

//                     if (totalDiscount > 0) {
//                         candidateDiscount = {
//                             promoId: promo._id,
//                             type: "discount",
//                             amount: totalDiscount,
//                             note: "Flat discount",
//                         };
//                     }
//                 }

//                 // Tiered
//                 if (promo.promotionType === "tieredDiscount") {
//                     const tiers = (promo.promotionConfig?.tiers || []).sort((a, b) => a.minQty - b.minQty);
//                     const scope = promo.promotionConfig?.tierScope === "perOrder" ? "perOrder" : "perProduct";

//                     if (scope === "perProduct") {
//                         const tier = bestTierForQty(tiers, line.qty);
//                         if (tier) {
//                             const unitOff = Math.floor((line.basePrice * tier.discountPercent) / 100);
//                             const totalDiscount = unitOff * line.qty;

//                             if (totalDiscount > 0) {
//                                 candidateDiscount = {
//                                     promoId: promo._id,
//                                     type: "tieredDiscount",
//                                     amount: totalDiscount,
//                                     note: `Buy ${tier.minQty}+ Save ${tier.discountPercent}%`,
//                                 };
//                             }
//                         }
//                     }
//                 }

//                 // Bundle
//                 if (promo.promotionType === "bundle") {
//                     const bp = (promo.promotionConfig?.bundleProducts || []).map(String);
//                     const bundlePrice = Number(promo.promotionConfig?.bundlePrice || 0);

//                     if (bp.length >= 2 && bundlePrice > 0) {
//                         const lines = cart.filter((l) => bp.includes(l.productId));
//                         if (lines.length === bp.length) {
//                             const bundleQty = Math.min(...bp.map((id) => cart.find((l) => l.productId === id)?.qty || 0));

//                             if (bundleQty > 0) {
//                                 const bundleMrp = lines.reduce((s, l) => s + l.basePrice, 0);
//                                 const bundleUnitDiscount = Math.max(0, bundleMrp - bundlePrice);
//                                 const totalBase = lines.reduce((s, l) => s + l.basePrice, 0);

//                                 const share = totalBase > 0 ? line.basePrice / totalBase : 0;
//                                 const lineDiscount = Math.floor(bundleUnitDiscount * share) * bundleQty;

//                                 if (lineDiscount > 0) {
//                                     candidateDiscount = {
//                                         promoId: promo._id,
//                                         type: "bundle",
//                                         amount: lineDiscount,
//                                         note: "Bundle deal",
//                                     };
//                                 }
//                             }
//                         }
//                     }
//                 }

//                 // Best discount only
//                 if (candidateDiscount) {
//                     const currentBest = line.discounts[0];
//                     if (!currentBest || candidateDiscount.amount > currentBest.amount) {
//                         line.discounts = [candidateDiscount];
//                     }
//                 }
//             }
//         }

//         // Collect applied promotions
//         for (const line of cart) {
//             if (line.discounts.length > 0) {
//                 const d = line.discounts[0];
//                 if (!appliedPromotions.find((p) => p._id.toString() === d.promoId.toString())) {
//                     const promo = promos.find((p) => p._id.toString() === d.promoId.toString());
//                     if (promo) {
//                         appliedPromotions.push({
//                             _id: promo._id,
//                             name: promo.campaignName,
//                             type: promo.promotionType,
//                         });
//                     }
//                 }
//             }
//         }

//         /* ---------------------------------------------------------
//          🔥 STEP 2: Summary
//         ---------------------------------------------------------- */
//         const summary = cart.reduce(
//             (acc, l) => {
//                 const lineBase = l.basePrice * l.qty;
//                 const lineDiscounts = l.discounts.reduce((s, d) => s + d.amount, 0);

//                 acc.mrpTotal += l.mrp * l.qty;
//                 acc.savings += lineDiscounts;
//                 acc.payable += Math.max(0, lineBase - lineDiscounts);

//                 return acc;
//             },
//             { mrpTotal: 0, savings: 0, payable: 0 }
//         );

//         /* ---------------------------------------------------------
//          🔥 STEP 3: Cart-Level Promotions (newUser, paymentOffer)
//         ---------------------------------------------------------- */
//         const isNewUser = !!ctx.userContext?.isNewUser;
//         const paymentMethod = (ctx.paymentMethod || "").trim();

//         const cartPromos = ["newUser", "paymentOffer"];

//         for (const type of cartPromos) {
//             const promo = promos.find((p) => p.promotionType === type);
//             if (!promo) continue;

//             if (type === "newUser" && isNewUser) {
//                 const dp = Number(promo.promotionConfig?.discountPercent || 0);
//                 const cap = Number(promo.promotionConfig?.maxDiscount || 0);

//                 if (dp > 0) {
//                     const discount = Math.floor((summary.payable * dp) / 100);
//                     const applied = Math.min(discount, cap || discount);

//                     summary.savings += applied;
//                     summary.payable = Math.max(0, summary.payable - applied);

//                     appliedPromotions.push({
//                         _id: promo._id,
//                         name: promo.campaignName,
//                         type,
//                     });
//                 }
//             }

//             if (type === "paymentOffer") {
//                 const methods = promo.promotionConfig?.methods || [];
//                 const minOrderValue = Number(promo.promotionConfig?.minOrderValue || 0);

//                 if (methods.includes(paymentMethod) && summary.payable >= minOrderValue) {
//                     const dp = Number(promo.promotionConfig?.discountPercent || 0);
//                     const cap = Number(promo.promotionConfig?.maxDiscount || 0);

//                     if (dp > 0) {
//                         const discount = Math.floor((summary.payable * dp) / 100);
//                         const applied = Math.min(discount, cap || discount);

//                         summary.savings += applied;
//                         summary.payable = Math.max(0, summary.payable - applied);

//                         appliedPromotions.push({
//                             _id: promo._id,
//                             name: promo.campaignName,
//                             type,
//                         });
//                     }
//                 }
//             }
//         }

//         return { items: cart, summary, appliedPromotions };
//     } catch (err) {
//         console.error("applyPromotions helper error:", err);
//         throw err;
//     }
// };










//the above part is complete till ,.. 20/12/2025 ,.. for the first phase






// services/promotionEngine.js
import Promotion from "../../models/Promotion.js";
import Product from "../../models/Product.js";
import {
    productMatchesPromo,
    applyFlatDiscount,
    bestTierForQty,
    isObjectId,
} from "../../controllers/user/userPromotionController.js";
import { enrichProductsUnified } from "../../middlewares/services/productHelpers.js";
import { getRedis } from "../../middlewares/utils/redis.js"; // ✅ Added Redis

export const applyPromotions = async (itemsInput, ctx = {}) => {
    try {
        if (!Array.isArray(itemsInput)) {
            throw new Error("applyPromotions: itemsInput must be an array of cart items");
        }
        const redis = getRedis();  // 🔥 REQUIRED

        /* ---------------------------------------------------------
         🔥 PROMO CACHE (5 seconds TTL)
        ---------------------------------------------------------- */
        const promoCacheKey = "activePromotions";
        let promos = [];

        const cachedPromos = await redis.get(promoCacheKey);
        if (cachedPromos) {
            promos = JSON.parse(cachedPromos);
        } else {
            const now = new Date();
            promos = await Promotion.find({
                status: "active",
                startDate: { $lte: now },
                endDate: { $gte: now },
            })
                .select(
                    "+promotionType +promotionConfig +scope +categories +products +discountUnit +discountValue +campaignName"
                )
                .lean();

            await redis.set(promoCacheKey, JSON.stringify(promos), "EX", 5);
        }

        /* ---------------------------------------------------------
         🔥 PRODUCT CACHE (per-product key | TTL 5 sec)
        ---------------------------------------------------------- */
        const ids = itemsInput.map((i) => i.productId).filter(isObjectId);

        const productCacheKeys = ids.map((id) => `promoProduct:${id}`);
        const cachedProducts = productCacheKeys.length
            ? await redis.mget(...productCacheKeys)
            : [];

        let dbProducts = [];
        let missingIds = [];

        // Use cached products
        for (let i = 0; i < ids.length; i++) {
            if (cachedProducts[i]) {
                dbProducts.push(JSON.parse(cachedProducts[i]));
            } else {
                missingIds.push(ids[i]);
            }
        }

        // Fetch remaining from DB
        if (missingIds.length > 0) {
            const freshProducts = await Product.find({ _id: { $in: missingIds } })
                .select(
                    "_id name images brand price mrp category categoryHierarchy variants sku quantity sales thresholdValue"
                )
                .lean();

            for (const p of freshProducts) {
                await redis.set(`promoProduct:${p._id}`, JSON.stringify(p), "EX", 5);
                dbProducts.push(p);
            }
        }

        /* ---------------------------------------------------------
         🔥 Enrich products (already cached internally)
        ---------------------------------------------------------- */
        const enrichedProducts = await enrichProductsUnified(dbProducts, promos);
        const productMap = new Map(enrichedProducts.map((p) => [p._id.toString(), p]));

        /* ---------------------------------------------------------
         🔥 Build Cart Lines
        ---------------------------------------------------------- */
        const cart = itemsInput
            .map((i) => {
                const p = productMap.get(i.productId);
                if (!p) return null;

                const selectedSku = i.selectedVariant?.sku || i.sku;

                let variant =
                    p.variants?.find((v) => v.sku === selectedSku) ||
                    p.selectedVariant ||
                    p.variants?.[0];

                if (!variant) {
                    variant = {
                        originalPrice: p.mrp ?? p.price ?? 0,
                        displayPrice: p.price ?? 0,
                    };
                }

                const variantMrp = Number(variant.originalPrice ?? p.mrp ?? 0);
                const variantBasePrice = Number(variant.displayPrice ?? variantMrp);

                // Apply product-level promotions
                let promoPrice = variantMrp;

                for (const promo of promos) {
                    if (!productMatchesPromo(p, promo)) continue;
                    if (promo.promotionType !== "discount") continue;

                    const val = Number(promo.discountValue || 0);

                    if (promo.discountUnit === "percent" && val > 0) {
                        promoPrice = Math.round(variantMrp * (1 - val / 100));
                    } else if (promo.discountUnit === "amount" && val > 0) {
                        promoPrice = Math.max(0, variantMrp - val);
                    }
                }

                const finalDisplay = Math.min(variantBasePrice, promoPrice);

                return {
                    productId: p._id.toString(),
                    name: p.name,
                    image: Array.isArray(p.images) && p.images[0] ? p.images[0] : variant.images?.[0] || "",
                    brand: p.brand || "",
                    qty: Math.max(1, Number(i.qty || 1)),
                    mrp: variantMrp,
                    basePrice: finalDisplay,
                    discounts: [],
                    freebies: [],
                    product: p,
                };
            })
            .filter(Boolean);

        const appliedPromotions = [];

        const appliedPromoIds = new Set();


        /* ---------------------------------------------------------
         🔥 STEP 1: Product-level Promotions
        ---------------------------------------------------------- */
        for (const promo of promos) {
            for (const line of cart) {
                if (!productMatchesPromo(line.product, promo)) continue;

                let candidateDiscount = null;

                // Flat
                if (promo.promotionType === "discount") {
                    const { price: newUnitPrice } = applyFlatDiscount(line.basePrice, promo);
                    const totalDiscount = (line.basePrice - newUnitPrice) * line.qty;

                    if (totalDiscount > 0) {
                        candidateDiscount = {
                            promoId: promo._id,
                            type: "discount",
                            amount: totalDiscount,
                            note: "Flat discount",
                        };
                    }
                }

                // Tiered
                if (promo.promotionType === "tieredDiscount") {
                    const tiers = (promo.promotionConfig?.tiers || []).sort((a, b) => a.minQty - b.minQty);
                    const scope = promo.promotionConfig?.tierScope === "perOrder" ? "perOrder" : "perProduct";

                    if (scope === "perProduct") {
                        const tier = bestTierForQty(tiers, line.qty);
                        if (tier) {
                            const unitOff = Math.floor((line.basePrice * tier.discountPercent) / 100);
                            const totalDiscount = unitOff * line.qty;

                            if (totalDiscount > 0) {
                                candidateDiscount = {
                                    promoId: promo._id,
                                    type: "tieredDiscount",
                                    amount: totalDiscount,
                                    note: `Buy ${tier.minQty}+ Save ${tier.discountPercent}%`,
                                };
                            }
                        }
                    }
                }

                // Bundle
                if (promo.promotionType === "bundle") {
                    const bp = (promo.promotionConfig?.bundleProducts || []).map(String);
                    const bundlePrice = Number(promo.promotionConfig?.bundlePrice || 0);

                    if (bp.length >= 2 && bundlePrice > 0) {
                        const lines = cart.filter((l) => bp.includes(l.productId));
                        if (lines.length === bp.length) {
                            const bundleQty = Math.min(...bp.map((id) => cart.find((l) => l.productId === id)?.qty || 0));

                            if (bundleQty > 0) {
                                const bundleMrp = lines.reduce((s, l) => s + l.basePrice, 0);
                                const bundleUnitDiscount = Math.max(0, bundleMrp - bundlePrice);
                                const totalBase = lines.reduce((s, l) => s + l.basePrice, 0);

                                const share = totalBase > 0 ? line.basePrice / totalBase : 0;
                                const lineDiscount = Math.floor(bundleUnitDiscount * share) * bundleQty;

                                if (lineDiscount > 0) {
                                    candidateDiscount = {
                                        promoId: promo._id,
                                        type: "bundle",
                                        amount: lineDiscount,
                                        note: "Bundle deal",
                                    };
                                }
                            }
                        }
                    }
                }

                // BOGO (Buy X Get Y Free)
                if (promo.promotionType === "bogo") {
                    const cfg = promo.promotionConfig || {};
                    const buyQty = Number(cfg.buyQty || 0);
                    const getQty = Number(cfg.getQty || 0);
                    const same = cfg.sameProduct ?? true;
                    const freeProductId = cfg.freeProductId ? String(cfg.freeProductId) : null;

                    if (buyQty > 0 && getQty > 0) {
                        const eligibleSets = Math.floor(line.qty / buyQty);
                        const freeCount = eligibleSets * getQty;

                        if (freeCount > 0) {

                            line._eligibleBogoPromoId = String(promo._id); // 🔥 IMPORTANT

                            if (same) {
                                // Free same product variant
                                line.freebies.push({
                                    productId: line.productId,
                                    qty: freeCount,
                                });

                            } else if (freeProductId) {
                                // Free different product
                                line.freebies.push({
                                    productId: freeProductId,
                                    qty: freeCount,
                                });
                            }

                            if (!appliedPromoIds.has(String(promo._id))) {
                                appliedPromotions.push({
                                    _id: promo._id,
                                    name: promo.campaignName,
                                    type: "bogo",
                                });
                                appliedPromoIds.add(String(promo._id));
                            }

                        }
                    }

                    // ⛔ IMPORTANT: BOGO does NOT affect price; skip discount logic
                    continue;
                }

                // Best discount only
                if (candidateDiscount) {
                    const currentBest = line.discounts[0];
                    if (!currentBest || candidateDiscount.amount > currentBest.amount) {
                        line.discounts = [candidateDiscount];
                    }
                }
            }
        }



        // Collect applied promotions
        for (const line of cart) {
            if (line.discounts.length > 0) {
                const d = line.discounts[0];
                if (!appliedPromotions.find((p) => p._id.toString() === d.promoId.toString())) {
                    const promo = promos.find((p) => p._id.toString() === d.promoId.toString());
                    if (promo) {
                        if (!appliedPromoIds.has(String(promo._id))) {
                            appliedPromotions.push({
                                _id: promo._id,
                                name: promo.campaignName,
                                type: promo.promotionType,
                            });
                            appliedPromoIds.add(String(promo._id));
                        }

                    }
                }
            }
        }

        /* ---------------------------------------------------------
           BOGO PRICE RULE : GLOBAL PRICE ADJUST (highest paid)
        ---------------------------------------------------------- */

        (function applyNykaaStyleBOGO() {
            const unitPool = [];

            for (const line of cart) {
                if (!line._eligibleBogoPromoId) continue; // ✅ ONLY BOGO ITEMS

                const qty = Number(line.qty || 0);
                const mrp = Number(line.mrp || 0);

                if (qty <= 0 || mrp <= 0) continue;

                for (let i = 0; i < qty; i++) {
                    unitPool.push({
                        line,
                        price: mrp,
                    });
                }
            }

            if (unitPool.length < 2) return;

            // 🔥 Nykaa rule: highest price paid
            unitPool.sort((a, b) => b.price - a.price);

            const freeUnits = [];
            for (let i = 1; i < unitPool.length; i += 2) {
                freeUnits.push(unitPool[i]);
            }

            const lineFreeMap = new Map();

            for (const u of freeUnits) {
                lineFreeMap.set(
                    u.line,
                    (lineFreeMap.get(u.line) || 0) + u.price
                );
            }

            for (const [line, freeAmount] of lineFreeMap.entries()) {
                line._bogoFreeAmount = freeAmount;
            }
        })();

        /* ---------------------------------------------------------
         🔥 STEP 2: Summary
        ---------------------------------------------------------- */
        const summary = cart.reduce((acc, l) => {
            const totalLineMRP = l.mrp * l.qty;
            const totalLinePrice = l.basePrice * l.qty;

            const productLevelDiscounts = Array.isArray(l.discounts)
                ? l.discounts.reduce((s, d) => s + d.amount, 0)
                : 0;

            const bogoFree = Number(l._bogoFreeAmount || 0);

            const totalLineDiscounts = productLevelDiscounts + bogoFree;

            const payable = Math.max(0, totalLinePrice - totalLineDiscounts);

            acc.mrpTotal += totalLineMRP;
            acc.savings += totalLineDiscounts;
            acc.payable += payable;

            return acc;
        }, { mrpTotal: 0, savings: 0, payable: 0 });



        /* ---------------------------------------------------------
         🔥 STEP 3: Cart-Level Promotions (newUser, paymentOffer)
        ---------------------------------------------------------- */
        const isNewUser = !!ctx.userContext?.isNewUser;
        const paymentMethod = (ctx.paymentMethod || "").trim();

        const cartPromos = ["newUser", "paymentOffer"];

        for (const type of cartPromos) {
            const promo = promos.find((p) => p.promotionType === type);
            if (!promo) continue;

            if (type === "newUser" && isNewUser) {
                const dp = Number(promo.promotionConfig?.discountPercent || 0);
                const cap = Number(promo.promotionConfig?.maxDiscount || 0);

                if (dp > 0) {
                    const discount = Math.floor((summary.payable * dp) / 100);
                    const applied = Math.min(discount, cap || discount);

                    summary.savings += applied;
                    summary.payable = Math.max(0, summary.payable - applied);

                    if (!appliedPromoIds.has(String(promo._id))) {
                        appliedPromotions.push({
                            _id: promo._id,
                            name: promo.campaignName,
                            type,
                        });
                        appliedPromoIds.add(String(promo._id));
                    }

                }
            }

            if (type === "paymentOffer") {
                const methods = promo.promotionConfig?.methods || [];
                const minOrderValue = Number(promo.promotionConfig?.minOrderValue || 0);

                if (methods.includes(paymentMethod) && summary.payable >= minOrderValue) {
                    const dp = Number(promo.promotionConfig?.discountPercent || 0);
                    const cap = Number(promo.promotionConfig?.maxDiscount || 0);

                    if (dp > 0) {
                        const discount = Math.floor((summary.payable * dp) / 100);
                        const applied = Math.min(discount, cap || discount);

                        summary.savings += applied;
                        summary.payable = Math.max(0, summary.payable - applied);

                        if (!appliedPromoIds.has(String(promo._id))) {
                            appliedPromotions.push({
                                _id: promo._id,
                                name: promo.campaignName,
                                type,
                            });
                            appliedPromoIds.add(String(promo._id));
                        }

                    }
                }
            }
        }

        // Collect all freebies across cart lines
        const allFreebies = cart
            .flatMap(line => line.freebies || [])
            .reduce((acc, f) => {
                const existing = acc.find(a => a.productId === f.productId);
                if (existing) {
                    existing.qty += f.qty;
                } else {
                    acc.push({ ...f });
                }
                return acc;
            }, []);

        return { items: cart, summary, appliedPromotions, freebies: allFreebies };
    } catch (err) {
        console.error("applyPromotions helper error:", err);
        throw err;
    }
};
