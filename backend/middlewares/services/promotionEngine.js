// // // services/promotionEngine.js
// // import Promotion from "../../models/Promotion.js";
// // import Product from "../../models/Product.js";
// // import {
// //     productMatchesPromo,
// //     applyFlatDiscount,
// //     bestTierForQty,
// //     isObjectId,
// // } from "../../controllers/user/userPromotionController.js";


// // function productMatchesConditions(product, conditions = {}) {
// //     // if no conditions -> match everything
// //     if (!conditions || Object.keys(conditions).length === 0) return true;

// //     // Example conditions we support:
// //     // { isBestSeller: true, minRating: 4, tags: ['trending'], categoryIds: ['id1'], brandIds: ['id2'] }

// //     if (conditions.isBestSeller && !product.isBestSeller) return false;
// //     if (conditions.minRating && (product.avgRating || 0) < Number(conditions.minRating)) return false;
// //     if (Array.isArray(conditions.tags) && conditions.tags.length) {
// //         const prodTags = Array.isArray(product.tags) ? product.tags.map(t => String(t).toLowerCase()) : [];
// //         const required = conditions.tags.map(t => String(t).toLowerCase());
// //         if (!required.some(r => prodTags.includes(r))) return false;
// //     }
// //     if (Array.isArray(conditions.categoryIds) && conditions.categoryIds.length) {
// //         if (!conditions.categoryIds.includes(String(product.category))) return false;
// //     }
// //     if (Array.isArray(conditions.brandIds) && conditions.brandIds.length) {
// //         if (!conditions.brandIds.includes(String(product.brand?._id ?? product.brand))) return false;
// //     }

// //     // custom predicate (advanced): if condition provides a JS-like predicate, you can evaluate safely here
// //     // keep simple for now
// //     return true;
// // }


// // export const applyPromotions = async (itemsInput, ctx = {}) => {
// //     try {
// //         if (!Array.isArray(itemsInput)) {
// //             throw new Error("applyPromotions: itemsInput must be an array of cart items");
// //         }

// //         const now = new Date();
// //         const promos = await Promotion.find({
// //             status: "active",
// //             startDate: { $lte: now },
// //             endDate: { $gte: now },
// //         })
// //             .select(
// //                 "+promotionType +promotionConfig +scope +categories +products +discountUnit +discountValue"
// //             )
// //             .lean();

// //         /* ---------------- Load products in cart ---------------- */
// //         const ids = itemsInput.map((i) => i.productId).filter(isObjectId);
// //         const dbProducts = await Product.find({ _id: { $in: ids } })
// //             .select("_id name images brand price mrp category categoryHierarchy discountPercent")
// //             .lean();

// //         const productMap = new Map(dbProducts.map((p) => [p._id.toString(), p]));

// //         /* ---------------- Build cart lines ---------------- */
// //         const cart = itemsInput
// //             .map((i) => {
// //                 const p = productMap.get(i.productId);
// //                 if (!p) return null;

// //                 const mrp = Number(p.mrp ?? p.price);

// //                 const basePrice =
// //                     typeof i.basePrice === "number"
// //                         ? i.basePrice
// //                         : p.discountPercent
// //                             ? Math.round(mrp - (mrp * p.discountPercent) / 100)
// //                             : Number(p.price);

// //                 return {
// //                     productId: p._id.toString(),
// //                     name: p.name,
// //                     image: Array.isArray(p.images) && p.images[0] ? p.images[0] : "",
// //                     brand: p.brand || "",
// //                     qty: Math.max(1, Number(i.qty || 1)),
// //                     mrp,
// //                     basePrice,
// //                     discounts: [], // will only keep best one
// //                     freebies: [],
// //                     product: p,
// //                 };
// //             })
// //             .filter(Boolean);

// //         const appliedPromotions = [];

// //         /* ---------------- STEP 1: Product-level promos ---------------- */
// //         for (const promo of promos) {
// //             // temporary collection of candidate discounts for each line
// //             for (const line of cart) {
// //                 if (!productMatchesPromo(line.product, promo)) continue;

// //                 let candidateDiscount = null;

// //                 // Flat discount
// //                 if (promo.promotionType === "discount") {
// //                     const { price: newUnitPrice } = applyFlatDiscount(line.basePrice, promo);
// //                     const totalDiscount = (line.basePrice - newUnitPrice) * line.qty;
// //                     if (totalDiscount > 0) {
// //                         candidateDiscount = {
// //                             promoId: promo._id,
// //                             type: "discount",
// //                             amount: totalDiscount,
// //                             note: "Flat discount",
// //                         };
// //                     }
// //                 }

// //                 // Tiered discount
// //                 if (promo.promotionType === "tieredDiscount") {
// //                     const tiers = (promo.promotionConfig?.tiers || []).sort(
// //                         (a, b) => a.minQty - b.minQty
// //                     );
// //                     const scope =
// //                         promo.promotionConfig?.tierScope === "perOrder" ? "perOrder" : "perProduct";

// //                     if (scope === "perProduct") {
// //                         const tier = bestTierForQty(tiers, line.qty);
// //                         if (tier) {
// //                             const unitOff = Math.floor((line.basePrice * tier.discountPercent) / 100);
// //                             const totalDiscount = unitOff * line.qty;
// //                             if (totalDiscount > 0) {
// //                                 candidateDiscount = {
// //                                     promoId: promo._id,
// //                                     type: "tieredDiscount",
// //                                     amount: totalDiscount,
// //                                     note: `Buy ${tier.minQty}+ Save ${tier.discountPercent}%`,
// //                                 };
// //                             }
// //                         }
// //                     }
// //                     // ⚠️ perOrder tier handled separately below
// //                 }

// //                 // Bundle discount
// //                 if (promo.promotionType === "bundle") {
// //                     const bp = (promo.promotionConfig?.bundleProducts || []).map(String);
// //                     const bundlePrice = Number(promo.promotionConfig?.bundlePrice || 0);

// //                     if (bp.length >= 2 && bundlePrice > 0) {
// //                         const lines = cart.filter((l) => bp.includes(l.productId));
// //                         if (lines.length === bp.length) {
// //                             const bundleQty = Math.min(
// //                                 ...bp.map((id) => cart.find((l) => l.productId === id)?.qty || 0)
// //                             );
// //                             if (bundleQty > 0) {
// //                                 const bundleMrp = lines.reduce((s, l) => s + l.basePrice, 0);
// //                                 const bundleUnitDiscount = Math.max(0, bundleMrp - bundlePrice);
// //                                 const totalBase = lines.reduce((s, l) => s + l.basePrice, 0);

// //                                 const share = totalBase > 0 ? line.basePrice / totalBase : 0;
// //                                 const lineDiscount =
// //                                     Math.floor(bundleUnitDiscount * share) * bundleQty;
// //                                 if (lineDiscount > 0) {
// //                                     candidateDiscount = {
// //                                         promoId: promo._id,
// //                                         type: "bundle",
// //                                         amount: lineDiscount,
// //                                         note: "Bundle deal",
// //                                     };
// //                                 }
// //                             }
// //                         }
// //                     }
// //                 }

// //                 // ✅ keep only the BEST discount (highest amount)
// //                 if (candidateDiscount) {
// //                     const currentBest = line.discounts[0];
// //                     if (!currentBest || candidateDiscount.amount > currentBest.amount) {
// //                         line.discounts = [candidateDiscount];
// //                     }
// //                 }
// //             }
// //         }

// //         // Collect applied promos
// //         for (const line of cart) {
// //             if (line.discounts.length > 0) {
// //                 const d = line.discounts[0];
// //                 if (!appliedPromotions.find((p) => p._id.toString() === d.promoId.toString())) {
// //                     const promo = promos.find((p) => p._id.toString() === d.promoId.toString());
// //                     if (promo) {
// //                         appliedPromotions.push({
// //                             _id: promo._id,
// //                             name: promo.campaignName,
// //                             type: promo.promotionType,
// //                         });
// //                     }
// //                 }
// //             }
// //         }

// //         /* ---------------- STEP 2: Base summary ---------------- */
// //         const summary = cart.reduce(
// //             (acc, l) => {
// //                 const lineBase = l.basePrice * l.qty;
// //                 const lineDiscounts = l.discounts.reduce((s, d) => s + d.amount, 0);

// //                 acc.mrpTotal += l.mrp * l.qty;
// //                 acc.savings += lineDiscounts;
// //                 acc.payable += Math.max(0, lineBase - lineDiscounts);

// //                 return acc;
// //             },
// //             { mrpTotal: 0, savings: 0, payable: 0 }
// //         );

// //         /* ---------------- STEP 3: Cart-level promos ---------------- */
// //         const isNewUser = !!ctx.userContext?.isNewUser;
// //         const paymentMethod = (ctx.paymentMethod || "").trim();

// //         const cartPromos = ["newUser", "paymentOffer"];
// //         for (const type of cartPromos) {
// //             const promo = promos.find((p) => p.promotionType === type);
// //             if (!promo) continue;

// //             if (type === "newUser" && isNewUser) {
// //                 const dp = Number(promo.promotionConfig?.discountPercent || 0);
// //                 const cap = Number(promo.promotionConfig?.maxDiscount || 0);
// //                 if (dp > 0) {
// //                     const discount = Math.floor((summary.payable * dp) / 100);
// //                     const applied = Math.min(discount, cap || discount);
// //                     summary.savings += applied;
// //                     summary.payable = Math.max(0, summary.payable - applied);
// //                     appliedPromotions.push({
// //                         _id: promo._id,
// //                         name: promo.campaignName,
// //                         type,
// //                     });
// //                 }
// //             }

// //             if (type === "paymentOffer") {
// //                 const methods = promo.promotionConfig?.methods || [];
// //                 const minOrderValue = Number(promo.promotionConfig?.minOrderValue || 0);

// //                 if (methods.includes(paymentMethod) && summary.payable >= minOrderValue) {
// //                     const dp = Number(promo.promotionConfig?.discountPercent || 0);
// //                     const cap = Number(promo.promotionConfig?.maxDiscount || 0);
// //                     if (dp > 0) {
// //                         const discount = Math.floor((summary.payable * dp) / 100);
// //                         const applied = Math.min(discount, cap || discount);
// //                         summary.savings += applied;
// //                         summary.payable = Math.max(0, summary.payable - applied);
// //                         appliedPromotions.push({
// //                             _id: promo._id,
// //                             name: promo.campaignName,
// //                             type,
// //                         });
// //                     }
// //                 }
// //             }
// //         }

// //         return { items: cart, summary, appliedPromotions };
// //     } catch (err) {
// //         console.error("applyPromotions helper error:", err);
// //         throw err;
// //     }
// // };













// // // services/promotionEngine.js
// // import Promotion from "../../models/Promotion.js";
// // import Product from "../../models/Product.js";
// // import {
// //     productMatchesPromo,
// //     applyFlatDiscount,
// //     bestTierForQty,
// //     isObjectId,
// // } from "../../controllers/user/userPromotionController.js";

// // /**
// //  * Checks product-level conditions attached to a promotion.
// //  * Supported conditions:
// //  *  - isBestSeller: true
// //  *  - minRating: number
// //  *  - tags: [string]
// //  *  - categoryIds: [id]
// //  *  - brandIds: [id]
// //  */
// // function productMatchesConditions(product, conditions = {}) {
// //     if (!conditions || Object.keys(conditions).length === 0) return true;

// //     if (conditions.isBestSeller && !product.isBestSeller) return false;
// //     if (conditions.minRating && (product.avgRating || 0) < Number(conditions.minRating)) return false;

// //     if (Array.isArray(conditions.tags) && conditions.tags.length) {
// //         const prodTags = Array.isArray(product.tags) ? product.tags.map(t => String(t).toLowerCase()) : [];
// //         const required = conditions.tags.map(t => String(t).toLowerCase());
// //         if (!required.some(r => prodTags.includes(r))) return false;
// //     }

// //     if (Array.isArray(conditions.categoryIds) && conditions.categoryIds.length) {
// //         const prodCat = String(product.category ?? "");
// //         if (!conditions.categoryIds.map(String).includes(prodCat)) return false;
// //     }

// //     if (Array.isArray(conditions.brandIds) && conditions.brandIds.length) {
// //         const prodBrand = String(product.brand?._id ?? product.brand ?? "");
// //         if (!conditions.brandIds.map(String).includes(prodBrand)) return false;
// //     }

// //     return true;
// // }

// // /**
// //  * Main promotion engine: computes discounts/freebies & cart summary
// //  * Input: itemsInput = [{ productId, qty, basePrice? }]
// //  * ctx: { userContext: { isNewUser }, paymentMethod }
// //  */
// // export const applyPromotions = async (itemsInput, ctx = {}) => {
// //     try {
// //         if (!Array.isArray(itemsInput)) {
// //             throw new Error("applyPromotions: itemsInput must be an array of cart items");
// //         }

// //         const now = new Date();
// //         const promos = await Promotion.find({
// //             status: "active",
// //             startDate: { $lte: now },
// //             endDate: { $gte: now },
// //         })
// //             .select(
// //                 "+promotionType +promotionConfig +scope +categories +products +discountUnit +discountValue +conditions +allowStacking"
// //             )
// //             .lean();

// //         /* ---------------- Load products in cart ---------------- */
// //         const ids = itemsInput.map((i) => i.productId).filter(isObjectId);
// //         const dbProducts = await Product.find({ _id: { $in: ids } })
// //             .select("_id name images brand price mrp category categoryHierarchy discountPercent tags isBestSeller avgRating")
// //             .lean();

// //         const productMap = new Map(dbProducts.map((p) => [p._id.toString(), p]));

// //         /* ---------------- Build cart lines ---------------- */
// //         const cart = itemsInput
// //             .map((i) => {
// //                 const p = productMap.get(i.productId);
// //                 if (!p) return null;

// //                 const mrp = Number(p.mrp ?? p.price);

// //                 const basePrice =
// //                     typeof i.basePrice === "number"
// //                         ? i.basePrice
// //                         : p.discountPercent
// //                             ? Math.round(mrp - (mrp * p.discountPercent) / 100)
// //                             : Number(p.price);

// //                 return {
// //                     productId: p._id.toString(),
// //                     name: p.name,
// //                     image: Array.isArray(p.images) && p.images[0] ? p.images[0] : "",
// //                     brand: p.brand || "",
// //                     qty: Math.max(1, Number(i.qty || 1)),
// //                     mrp,
// //                     basePrice,
// //                     discounts: [], // will keep best discount object(s)
// //                     freebies: [],  // promotional free units
// //                     product: p,
// //                 };
// //             })
// //             .filter(Boolean);

// //         const appliedPromotions = [];

// //         /* ---------------- STEP 1: Product-level promos ---------------- */
// //         for (const promo of promos) {
// //             // For each promo, evaluate candidate discounts/freebies per cart line
// //             for (const line of cart) {
// //                 // First check existing product matching logic (explicit scope) then conditions
// //                 // If either denies, skip
// //                 if (!productMatchesPromo(line.product, promo)) continue;
// //                 if (!productMatchesConditions(line.product, promo.conditions)) continue;

// //                 let candidateDiscount = null;

// //                 // --------- 1) Flat discount (existing) ----------
// //                 if (promo.promotionType === "discount") {
// //                     const { price: newUnitPrice } = applyFlatDiscount(line.basePrice, promo);
// //                     const totalDiscount = (line.basePrice - newUnitPrice) * line.qty;
// //                     if (totalDiscount > 0) {
// //                         candidateDiscount = {
// //                             promoId: promo._id,
// //                             type: "discount",
// //                             amount: totalDiscount,
// //                             note: "Flat discount",
// //                         };
// //                     }
// //                 }

// //                 // --------- 2) Tiered discount (improved) ----------
// //                 if (promo.promotionType === "tieredDiscount") {
// //                     const tiers = (promo.promotionConfig?.tiers || []).sort((a, b) => a.minQty - b.minQty);
// //                     const scope = promo.promotionConfig?.tierScope === "perOrder" ? "perOrder" : "perProduct";

// //                     if (scope === "perProduct") {
// //                         const tier = bestTierForQty(tiers, line.qty);
// //                         if (tier) {
// //                             const unitOff = Math.floor((line.basePrice * (tier.discountPercent || 0)) / 100);
// //                             let totalDiscount = unitOff * line.qty;

// //                             // support optional extraPercent (stacking extra percent on top of tier)
// //                             const extraPct = Number(tier.extraPercent ?? promo.promotionConfig?.extraPercent ?? 0);
// //                             if (extraPct > 0) {
// //                                 // apply extra percent on the price after unitOff
// //                                 const extraOffPerUnit = Math.floor(((line.basePrice - unitOff) * extraPct) / 100);
// //                                 totalDiscount += extraOffPerUnit * line.qty;
// //                             }

// //                             if (totalDiscount > 0) {
// //                                 candidateDiscount = {
// //                                     promoId: promo._id,
// //                                     type: "tieredDiscount",
// //                                     amount: totalDiscount,
// //                                     note: `Buy ${tier.minQty}+ Save ${tier.discountPercent}%`,
// //                                 };
// //                             }
// //                         }
// //                     }
// //                     // perOrder tier handling remains in cart-level promos
// //                 }

// //                 // --------- 3) BOGO (Buy X Get Y free) ----------
// //                 if (promo.promotionType === "bogo") {
// //                     const buyQty = Number(promo.promotionConfig?.buyQty || promo.promotionConfig?.buy || 1);
// //                     const getQty = Number(promo.promotionConfig?.getQty || promo.promotionConfig?.get || 1);
// //                     if (buyQty <= 0) continue;

// //                     // Use group-size approach: group = buyQty + getQty
// //                     // freebies apply per completed group
// //                     const groupSize = buyQty + getQty;
// //                     if (line.qty >= buyQty) {
// //                         const freebies = Math.floor(line.qty / groupSize) * getQty;
// //                         // As fallback, at least apply floor(line.qty / buyQty) - but this may give freebies for single qty, so we avoid it
// //                         const freeUnits = Math.max(0, freebies);
// //                         const totalDiscount = freeUnits * line.basePrice;
// //                         if (totalDiscount > 0) {
// //                             line.freebies = line.freebies || [];
// //                             line.freebies.push({ promoId: promo._id, freeUnits, note: `BOGO ${buyQty}+${getQty}` });
// //                             candidateDiscount = {
// //                                 promoId: promo._id,
// //                                 type: "bogo",
// //                                 amount: totalDiscount,
// //                                 note: `BOGO ${buyQty}+${getQty}`,
// //                             };
// //                         }
// //                     }
// //                 }

// //                 // --------- 4) Bundle discount (existing but robust) ----------
// //                 if (promo.promotionType === "bundle") {
// //                     const bp = (promo.promotionConfig?.bundleProducts || []).map(String);
// //                     const bundlePrice = Number(promo.promotionConfig?.bundlePrice || 0);

// //                     if (bp.length >= 2 && bundlePrice > 0) {
// //                         const lines = cart.filter((l) => bp.includes(l.productId));
// //                         if (lines.length === bp.length) {
// //                             const bundleQty = Math.min(...bp.map((id) => cart.find((l) => l.productId === id)?.qty || 0));
// //                             if (bundleQty > 0) {
// //                                 const bundleMrp = lines.reduce((s, l) => s + l.basePrice, 0);
// //                                 const bundleUnitDiscount = Math.max(0, bundleMrp - bundlePrice);
// //                                 const totalBase = lines.reduce((s, l) => s + l.basePrice, 0);

// //                                 const share = totalBase > 0 ? line.basePrice / totalBase : 0;
// //                                 const lineDiscount = Math.floor(bundleUnitDiscount * share) * bundleQty;
// //                                 if (lineDiscount > 0) {
// //                                     candidateDiscount = {
// //                                         promoId: promo._id,
// //                                         type: "bundle",
// //                                         amount: lineDiscount,
// //                                         note: "Bundle deal",
// //                                     };
// //                                 }
// //                             }
// //                         }
// //                     }
// //                 }

// //                 // --------- Keep only the BEST discount for this line ----------
// //                 if (candidateDiscount) {
// //                     const currentBest = line.discounts[0];
// //                     if (!currentBest || candidateDiscount.amount > currentBest.amount) {
// //                         line.discounts = [candidateDiscount];
// //                     }
// //                 }
// //             } // end for lines
// //         } // end for promos

// //         // Collect applied promos (unique)
// //         for (const line of cart) {
// //             if (line.discounts.length > 0) {
// //                 const d = line.discounts[0];
// //                 if (!appliedPromotions.some((p) => String(p._id) === String(d.promoId))) {
// //                     const promo = promos.find((p) => String(p._id) === String(d.promoId));
// //                     if (promo) {
// //                         appliedPromotions.push({
// //                             _id: promo._id,
// //                             name: promo.campaignName,
// //                             type: promo.promotionType,
// //                         });
// //                     }
// //                 }
// //             }
// //             // also register promos that gave freebies even if discounts array is empty
// //             if (Array.isArray(line.freebies) && line.freebies.length) {
// //                 for (const f of line.freebies) {
// //                     if (!appliedPromotions.some((p) => String(p._id) === String(f.promoId))) {
// //                         const promo = promos.find((p) => String(p._id) === String(f.promoId));
// //                         if (promo) {
// //                             appliedPromotions.push({
// //                                 _id: promo._id,
// //                                 name: promo.campaignName,
// //                                 type: promo.promotionType,
// //                             });
// //                         }
// //                     }
// //                 }
// //             }
// //         }

// //         /* ---------------- STEP 2: Base summary ---------------- */
// //         const summary = cart.reduce(
// //             (acc, l) => {
// //                 const lineBase = l.basePrice * l.qty;
// //                 const lineDiscounts = l.discounts.reduce((s, d) => s + d.amount, 0);

// //                 acc.mrpTotal += l.mrp * l.qty;
// //                 acc.savings += lineDiscounts;
// //                 acc.payable += Math.max(0, lineBase - lineDiscounts);

// //                 // freebies don't reduce qty/payable here because we already reflected freebies as discounts above (bogo added discount)
// //                 return acc;
// //             },
// //             { mrpTotal: 0, savings: 0, payable: 0 }
// //         );

// //         /* ---------------- STEP 3: Cart-level promos ---------------- */
// //         const isNewUser = !!ctx.userContext?.isNewUser;
// //         const paymentMethod = (ctx.paymentMethod || "").trim();

// //         // extended cart promo types
// //         const cartPromos = ["newUser", "paymentOffer", "cartValue", "gift", "freeShipping"];
// //         for (const type of cartPromos) {
// //             const promo = promos.find((p) => p.promotionType === type);
// //             if (!promo) continue;

// //             // NEW USER (existing)
// //             if (type === "newUser" && isNewUser) {
// //                 const dp = Number(promo.promotionConfig?.discountPercent || 0);
// //                 const cap = Number(promo.promotionConfig?.maxDiscount || 0);
// //                 if (dp > 0) {
// //                     const discount = Math.floor((summary.payable * dp) / 100);
// //                     const applied = Math.min(discount, cap || discount);
// //                     summary.savings += applied;
// //                     summary.payable = Math.max(0, summary.payable - applied);
// //                     appliedPromotions.push({
// //                         _id: promo._id,
// //                         name: promo.campaignName,
// //                         type,
// //                     });
// //                 }
// //             }

// //             // PAYMENT OFFER (existing)
// //             if (type === "paymentOffer") {
// //                 const methods = promo.promotionConfig?.methods || [];
// //                 const minOrderValue = Number(promo.promotionConfig?.minOrderValue || 0);

// //                 if (methods.includes(paymentMethod) && summary.payable >= minOrderValue) {
// //                     const dp = Number(promo.promotionConfig?.discountPercent || 0);
// //                     const cap = Number(promo.promotionConfig?.maxDiscount || 0);
// //                     if (dp > 0) {
// //                         const discount = Math.floor((summary.payable * dp) / 100);
// //                         const applied = Math.min(discount, cap || discount);
// //                         summary.savings += applied;
// //                         summary.payable = Math.max(0, summary.payable - applied);
// //                         appliedPromotions.push({
// //                             _id: promo._id,
// //                             name: promo.campaignName,
// //                             type,
// //                         });
// //                     }
// //                 }
// //             }

// //             // CART VALUE (new) - extra % off when cart >= minOrderValue
// //             if (type === "cartValue") {
// //                 const min = Number(promo.promotionConfig?.minOrderValue || promo.conditions?.minOrderValue || 0);
// //                 const dp = Number(promo.promotionConfig?.discountPercent || 0);
// //                 const cap = Number(promo.promotionConfig?.maxDiscount || 0);
// //                 if (dp > 0 && summary.payable >= min) {
// //                     const discount = Math.floor((summary.payable * dp) / 100);
// //                     const applied = Math.min(discount, cap || discount);
// //                     summary.savings += applied;
// //                     summary.payable = Math.max(0, summary.payable - applied);
// //                     appliedPromotions.push({ _id: promo._id, name: promo.campaignName, type });
// //                 }
// //             }

// //             // GIFT (new) - free gift when cart >= minOrderValue
// //             if (type === "gift") {
// //                 const min = Number(promo.promotionConfig?.minOrderValue || promo.conditions?.minOrderValue || 0);
// //                 if (summary.payable >= min) {
// //                     summary.freeGifts = summary.freeGifts || [];
// //                     summary.freeGifts.push({
// //                         promoId: promo._id,
// //                         productId: promo.promotionConfig?.giftProduct || null,
// //                     });
// //                     appliedPromotions.push({ _id: promo._id, name: promo.campaignName, type });
// //                 }
// //             }

// //             // FREE SHIPPING (new) - promotion-driven free shipping
// //             if (type === "freeShipping") {
// //                 const min = Number(promo.promotionConfig?.minOrderValue || promo.conditions?.minOrderValue || 0);
// //                 if (summary.payable >= min) {
// //                     summary.freeShipping = true;
// //                     appliedPromotions.push({ _id: promo._id, name: promo.campaignName, type });
// //                 }
// //             }
// //         }

// //         // return enriched items, summary and applied promotions
// //         return { items: cart, summary, appliedPromotions };
// //     } catch (err) {
// //         console.error("applyPromotions helper error:", err);
// //         throw err;
// //     }
// // };











// // import Promotion from "../../models/Promotion.js";
// // import Product from "../../models/Product.js";
// // import {
// //     productMatchesPromo,
// //     applyFlatDiscount,
// //     bestTierForQty,
// //     isObjectId,
// // } from "../../controllers/user/userPromotionController.js";

// // function productMatchesConditions(product, conditions = {}) {
// //     if (!conditions || Object.keys(conditions).length === 0) return true;

// //     if (conditions.isBestSeller && !product.isBestSeller) return false;
// //     if (conditions.minRating && (product.avgRating || 0) < Number(conditions.minRating)) return false;

// //     if (Array.isArray(conditions.tags) && conditions.tags.length) {
// //         const prodTags = Array.isArray(product.tags)
// //             ? product.tags.map((t) => String(t).toLowerCase())
// //             : [];
// //         const required = conditions.tags.map((t) => String(t).toLowerCase());
// //         if (!required.some((r) => prodTags.includes(r))) return false;
// //     }

// //     if (Array.isArray(conditions.categoryIds) && conditions.categoryIds.length) {
// //         const prodCat = String(product.category ?? "");
// //         if (!conditions.categoryIds.map(String).includes(prodCat)) return false;
// //     }

// //     if (Array.isArray(conditions.brandIds) && conditions.brandIds.length) {
// //         const prodBrand = String(product.brand?._id ?? product.brand ?? "");
// //         if (!conditions.brandIds.map(String).includes(prodBrand)) return false;
// //     }

// //     return true;
// // }

// // export const applyPromotions = async (itemsInput, ctx = {}) => {
// //     try {
// //         if (!Array.isArray(itemsInput)) throw new Error("applyPromotions: itemsInput must be array");

// //         const now = new Date();

// //         const promos = await Promotion.find({
// //             status: "active",
// //             startDate: { $lte: now },
// //             endDate: { $gte: now },
// //         })
// //             .select(
// //                 "+promotionType +promotionConfig +scope +categories +products +discountUnit +discountValue +conditions +allowStacking"
// //             )
// //             .lean();

// //         // ---------- Load Products ----------
// //         const ids = itemsInput.map((i) => i.productId).filter(isObjectId);
// //         const dbProducts = await Product.find({ _id: { $in: ids } })
// //             .select("_id name images brand price mrp category categoryHierarchy discountPercent tags isBestSeller avgRating")
// //             .lean();

// //         const productMap = new Map(dbProducts.map((p) => [p._id.toString(), p]));

// //         // ---------- Build Cart Lines ----------
// //         const cart = itemsInput
// //             .map((i) => {
// //                 const p = productMap.get(i.productId);
// //                 if (!p) return null;

// //                 const mrp = Number(p.mrp ?? p.price);
// //                 const basePrice =
// //                     typeof i.basePrice === "number"
// //                         ? i.basePrice
// //                         : p.discountPercent
// //                             ? Math.round(mrp - (mrp * p.discountPercent) / 100)
// //                             : Number(p.price);

// //                 return {
// //                     productId: p._id.toString(),
// //                     name: p.name,
// //                     image: Array.isArray(p.images) && p.images[0] ? p.images[0] : "",
// //                     brand: p.brand || "",
// //                     qty: Math.max(1, Number(i.qty || 1)),
// //                     mrp,
// //                     basePrice,
// //                     discounts: [],
// //                     freebies: [],
// //                     product: p,
// //                 };


// //             })
// //             .filter(Boolean);

// //         const appliedPromotions = [];

// //         // =====================================================
// //         // STEP 1: PRODUCT-LEVEL PROMOTIONS
// //         // =====================================================
// //         for (const promo of promos) {
// //             for (const line of cart) {
// //                 if (!productMatchesPromo(line.product, promo)) continue;
// //                 if (!productMatchesConditions(line.product, promo.conditions)) continue;

// //                 let candidateDiscount = null;

// //                 // 1️⃣ Simple Discount
// //                 if (promo.promotionType === "discount") {
// //                     const minQty = Number(promo.conditions?.buyQuantity || 0);
// //                     const requiredCategory = promo.conditions?.category || null;

// //                     const inCategory =
// //                         !requiredCategory ||
// //                         String(line.product.categoryHierarchy?.[0]?.slug || line.product.category) ===
// //                         String(requiredCategory);

// //                     if (inCategory && (minQty === 0 || line.qty >= minQty)) {
// //                         const { price: newUnitPrice } = applyFlatDiscount(line.basePrice, promo);
// //                         const totalDiscount = (line.basePrice - newUnitPrice) * line.qty;
// //                         if (totalDiscount > 0) {
// //                             candidateDiscount = {
// //                                 promoId: promo._id,
// //                                 type: "discount",
// //                                 amount: totalDiscount,
// //                                 note: `Flat ${promo.discountValue}${promo.discountUnit === "percent" ? "%" : "₹"
// //                                     } off`,
// //                             };
// //                         }
// //                     }
// //                 }

// //                 // 2️⃣ Tiered Discount
// //                 if (promo.promotionType === "tieredDiscount") {
// //                     const tiers = (promo.promotionConfig?.tiers || []).sort((a, b) => a.minQty - b.minQty);
// //                     const tier = bestTierForQty(tiers, line.qty);
// //                     if (tier) {
// //                         const unitOff = Math.floor((line.basePrice * (tier.discountPercent || 0)) / 100);
// //                         let totalDiscount = unitOff * line.qty;
// //                         const extraPct = Number(
// //                             tier.extraPercent ?? promo.promotionConfig?.extraPercent ?? 0
// //                         );
// //                         if (extraPct > 0) {
// //                             const extraOffPerUnit = Math.floor(
// //                                 ((line.basePrice - unitOff) * extraPct) / 100
// //                             );
// //                             totalDiscount += extraOffPerUnit * line.qty;
// //                         }
// //                         if (totalDiscount > 0) {
// //                             candidateDiscount = {
// //                                 promoId: promo._id,
// //                                 type: "tieredDiscount",
// //                                 amount: totalDiscount,
// //                                 note: `Buy ${tier.minQty}+ Save ${tier.discountPercent}%`,
// //                             };
// //                         }
// //                     }
// //                 }

// //                 // 3️⃣ BOGO (Buy X Get Y)
// //                 if (promo.promotionType === "bogo") {
// //                     const buyQty = Number(promo.promotionConfig?.buyQty || 1);
// //                     const getQty = Number(promo.promotionConfig?.getQty || 1);
// //                     const sameProduct = promo.promotionConfig?.sameProduct !== false; // default true
// //                     const freeProductId = promo.promotionConfig?.freeProductId || null;

// //                     // 🔹 Handle both product & category scope
// //                     const isApplicable = productMatchesPromo(line.product, promo);
// //                     if (!isApplicable) continue;

// //                     // ✅ Count total eligible quantity (for category promos too)
// //                     const totalQty = line.qty;
// //                     if (totalQty < buyQty) continue;

// //                     const totalSets = Math.floor(totalQty / buyQty);
// //                     const freeQty = totalSets * getQty;

// //                     if (freeQty <= 0) continue;

// //                     if (sameProduct) {
// //                         // 💄 Same-product BOGO (Buy X Get Y Free on same item)
// //                         const totalUnits = line.qty + freeQty;
// //                         const totalPaidPrice = line.basePrice * line.qty;
// //                         const effectiveUnitPrice = totalPaidPrice / totalUnits;
// //                         const totalDiscount = freeQty * line.basePrice;

// //                         line.freebies.push({
// //                             promoId: promo._id,
// //                             freeUnits: freeQty,
// //                             note: `Buy ${buyQty} Get ${getQty} Free (${freeQty} extra units)`,
// //                         });

// //                         line.discounts.push({
// //                             promoId: promo._id,
// //                             type: "bogo",
// //                             amount: totalDiscount,
// //                             note: `Buy ${buyQty} Get ${getQty} Free`,
// //                         });

// //                         line.finalQty = totalUnits;
// //                         line.bogoFreeQty = freeQty;
// //                         line.effectiveUnitPrice = Math.round(effectiveUnitPrice);
// //                         line.promoApplied = "BOGO";

// //                         appliedPromotions.push({
// //                             _id: promo._id,
// //                             name: promo.campaignName,
// //                             type: "bogo",
// //                         });
// //                     } else if (isObjectId(freeProductId)) {
// //                         // 🎁 Cross-product BOGO (Buy X Get Y product free)
// //                         const freebie = await Product.findById(freeProductId)
// //                             .select("_id name images price mrp")
// //                             .lean();

// //                         if (freebie) {
// //                             line.freebies.push({
// //                                 promoId: promo._id,
// //                                 productId: freebie._id,
// //                                 name: freebie.name,
// //                                 image: freebie.images?.[0] || "",
// //                                 freeUnits: freeQty,
// //                                 note: `Free ${freeQty} × ${freebie.name}`,
// //                             });

// //                             line.discounts.push({
// //                                 promoId: promo._id,
// //                                 type: "bogo",
// //                                 amount: freeQty * (freebie.price || 0),
// //                                 note: `Buy ${buyQty} Get ${getQty} Free (${freebie.name})`,
// //                             });

// //                             appliedPromotions.push({
// //                                 _id: promo._id,
// //                                 name: promo.campaignName,
// //                                 type: "bogo",
// //                             });
// //                         }
// //                     }
// //                 }


// //                 // 4️⃣ Bundle Combo
// //                 if (promo.promotionType === "bundle") {
// //                     const bp = (promo.promotionConfig?.bundleProducts || []).map(String);
// //                     const bundlePrice = Number(promo.promotionConfig?.bundlePrice || 0);
// //                     if (bp.length >= 2 && bundlePrice > 0) {
// //                         const lines = cart.filter((l) => bp.includes(l.productId));
// //                         if (lines.length === bp.length) {
// //                             const bundleQty = Math.min(
// //                                 ...bp.map((id) => cart.find((l) => l.productId === id)?.qty || 0)
// //                             );
// //                             const bundleMrp = lines.reduce((s, l) => s + l.basePrice, 0);
// //                             const bundleUnitDiscount = Math.max(0, bundleMrp - bundlePrice);
// //                             const totalBase = lines.reduce((s, l) => s + l.basePrice, 0);
// //                             const share = totalBase > 0 ? line.basePrice / totalBase : 0;
// //                             const lineDiscount = Math.floor(bundleUnitDiscount * share) * bundleQty;
// //                             if (lineDiscount > 0) {
// //                                 candidateDiscount = {
// //                                     promoId: promo._id,
// //                                     type: "bundle",
// //                                     amount: lineDiscount,
// //                                     note: "Bundle Combo",
// //                                 };
// //                             }
// //                         }
// //                     }
// //                 }

// //                 // ✅ Keep best discount for line
// //                 if (candidateDiscount) {
// //                     const currentBest = line.discounts[0];
// //                     if (!currentBest || candidateDiscount.amount > currentBest.amount) {
// //                         line.discounts = [candidateDiscount];
// //                     }
// //                 }


// //             }
// //         }

// //         // =====================================================
// //         // STEP 2: BASE SUMMARY
// //         // =====================================================
// //         const summary = cart.reduce(
// //             (acc, l) => {
// //                 const lineBase = l.basePrice * l.qty;
// //                 const lineDiscounts = l.discounts.reduce((s, d) => s + d.amount, 0);
// //                 const bogoDiscount = l.bogoFreeQty ? l.bogoFreeQty * l.basePrice : 0;

// //                 acc.mrpTotal += l.mrp * l.qty;
// //                 acc.savings += lineDiscounts + bogoDiscount;
// //                 acc.payable += Math.max(0, lineBase - lineDiscounts - bogoDiscount);
// //                 return acc;
// //             },
// //             { mrpTotal: 0, savings: 0, payable: 0 }
// //         );

// //         const addPromoRecord = (promo, type) => {
// //             if (!appliedPromotions.some((p) => String(p._id) === String(promo._id))) {
// //                 appliedPromotions.push({ _id: promo._id, name: promo.campaignName, type });
// //             }
// //         };

// //         // =====================================================
// //         // STEP 3: CART-LEVEL PROMOTIONS
// //         // =====================================================
// //         const isNewUser = !!ctx.userContext?.isNewUser;
// //         const paymentMethod = (ctx.paymentMethod || "").trim();

// //         for (const promo of promos) {
// //             const type = promo.promotionType;

// //             // 🆕 New User
// //             if (type === "newUser" && isNewUser) {
// //                 const dp = Number(promo.promotionConfig?.discountPercent || 0);
// //                 const cap = Number(promo.promotionConfig?.maxDiscount || 0);
// //                 const discount = Math.min((summary.payable * dp) / 100, cap || Infinity);
// //                 summary.savings += discount;
// //                 summary.payable -= discount;
// //                 addPromoRecord(promo, type);
// //             }

// //             // 💳 Payment Offer
// //             if (type === "paymentOffer") {
// //                 const methods = promo.promotionConfig?.methods || [];
// //                 const min = Number(promo.promotionConfig?.minOrderValue || 0);
// //                 const dp = Number(promo.promotionConfig?.discountPercent || 0);
// //                 const cap = Number(promo.promotionConfig?.maxDiscount || 0);
// //                 if (methods.includes(paymentMethod) && summary.payable >= min) {
// //                     const discount = Math.min((summary.payable * dp) / 100, cap || Infinity);
// //                     summary.savings += discount;
// //                     summary.payable -= discount;
// //                     addPromoRecord(promo, type);
// //                 }
// //             }

// //             // 🛒 Cart Value
// //             if (type === "cartValue") {
// //                 const min = Number(
// //                     promo.promotionConfig?.minOrderValue || promo.conditions?.minOrderValue || 0
// //                 );
// //                 const dp = Number(promo.promotionConfig?.discountPercent || 0);
// //                 const cap = Number(promo.promotionConfig?.maxDiscount || 0);
// //                 if (summary.payable >= min) {
// //                     const discount = Math.min((summary.payable * dp) / 100, cap || Infinity);
// //                     summary.savings += discount;
// //                     summary.payable -= discount;
// //                     addPromoRecord(promo, type);
// //                 }
// //             }

// //             // 🎁 Gift
// //             if (type === "gift") {
// //                 const min = Number(
// //                     promo.promotionConfig?.minOrderValue || promo.conditions?.minOrderValue || 0
// //                 );
// //                 if (summary.payable >= min) {
// //                     summary.freeGifts = summary.freeGifts || [];
// //                     summary.freeGifts.push({
// //                         promoId: promo._id,
// //                         productId: promo.promotionConfig?.giftProduct || null,
// //                     });
// //                     addPromoRecord(promo, type);
// //                 }
// //             }

// //             // 🚚 Free Shipping
// //             if (type === "freeShipping") {
// //                 const min = Number(
// //                     promo.promotionConfig?.minOrderValue || promo.conditions?.minOrderValue || 0
// //                 );
// //                 if (summary.payable >= min) {
// //                     summary.freeShipping = true;
// //                     addPromoRecord(promo, type);
// //                 }
// //             }
// //         }

// //         // =====================================================
// //         // FINAL OUTPUT
// //         // =====================================================
// //         return { items: cart, summary, appliedPromotions };
// //     } catch (err) {
// //         console.error("applyPromotions error:", err);
// //         throw err;
// //     }
// // };

// // export const isPromoEligibleForProduct = (product, promo) => {
// //     if (!product || !promo) return false;

// //     // 1️⃣ Basic match (brand/category/product/tag)
// //     const matches =
// //         (!promo.products?.length || promo.products.some(p => String(p.product || p) === String(product._id))) ||
// //         (!promo.categories?.length || promo.categories.some(c => String(c.category || c) === String(product.category))) ||
// //         (!promo.brands?.length || promo.brands.some(b => String(b.brand || b) === String(product.brand)));

// //     if (!matches) return false;

// //     // 2️⃣ Exclusion rules
// //     const excluded =
// //         promo.conditions?.excludedProducts?.some(p => String(p) === String(product._id)) ||
// //         promo.conditions?.excludedCategories?.some(c => String(c) === String(product.category)) ||
// //         promo.conditions?.excludedBrands?.some(b => String(b) === String(product.brand));
// //     if (excluded) return false;

// //     // 3️⃣ Tag / rating / misc rules
// //     if (promo.conditions?.requiredTags?.length) {
// //         const productTags = product.tags?.map(t => t.toLowerCase()) || [];
// //         const requiredTags = promo.conditions.requiredTags.map(t => t.toLowerCase());
// //         const tagMatch = requiredTags.some(t => productTags.includes(t));
// //         if (!tagMatch) return false;
// //     }

// //     return true;
// // };





// import Promotion from "../../models/Promotion.js";
// import Product from "../../models/Product.js";
// import {
//     productMatchesPromo,
//     applyFlatDiscount,
//     bestTierForQty,
//     isObjectId,
// } from "../../controllers/user/userPromotionController.js";

// const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// export const isPromoEligibleForProduct = (product, promo) => {
//     if (!product || !promo) return false;

//     // If promo explicitly lists products/categories/brands, product must match at least one of them.
//     const hasPromoProducts = Array.isArray(promo.products) && promo.products.length;
//     const hasPromoCategories = Array.isArray(promo.categories) && promo.categories.length;
//     const hasPromoBrands = Array.isArray(promo.brands) && promo.brands.length;

//     const pid = String(product._id);
//     const productMatched =
//         !hasPromoProducts ||
//         promo.products.some((p) => {
//             const val = String(p.product || p);
//             return val === pid;
//         });

//     const catMatched =
//         !hasPromoCategories ||
//         promo.categories.some((c) => {
//             const val = String(c.category || c);
//             const prodCat = String(product.category ?? "");
//             // also allow matching via categoryHierarchy items if provided
//             if (val === prodCat) return true;
//             if (Array.isArray(product.categoryHierarchy)) {
//                 return product.categoryHierarchy.some((ch) => {
//                     const cid = String(ch._id || ch.id || ch.category || ch);
//                     return cid === val;
//                 });
//             }
//             return false;
//         });

//     const brandMatched =
//         !hasPromoBrands ||
//         promo.brands.some((b) => {
//             const val = String(b.brand || b);
//             const prodBrand = String(product.brand?._id ?? product.brand ?? "");
//             return val === prodBrand;
//         });

//     if (!(productMatched && catMatched && brandMatched)) return false;

//     // Exclusion rules (conditions.excluded*)
//     const excluded =
//         (promo.conditions?.excludedProducts || []).some((x) => String(x) === pid) ||
//         (promo.conditions?.excludedCategories || []).some((x) => String(x) === String(product.category)) ||
//         (promo.conditions?.excludedBrands || []).some((x) => String(x) === String(product.brand?._id ?? product.brand));

//     if (excluded) return false;

//     // Tag/rating-specific requirements
//     if (Array.isArray(promo.conditions?.requiredTags) && promo.conditions.requiredTags.length) {
//         const productTags = (product.tags || []).map((t) => String(t).toLowerCase());
//         const required = promo.conditions.requiredTags.map((t) => String(t).toLowerCase());
//         if (!required.some((r) => productTags.includes(r))) return false;
//     }

//     if (promo.conditions?.minRating && (product.avgRating || 0) < Number(promo.conditions.minRating)) {
//         return false;
//     }

//     return true;
// };
// export const productMatchesConditions = (product, conditions = {}) => {
//     if (!product) return false;

//     // ✅ Minimum price condition
//     if (conditions.minPrice && Number(product.price || 0) < Number(conditions.minPrice)) {
//         return false;
//     }

//     // ✅ Maximum price condition
//     if (conditions.maxPrice && Number(product.price || 0) > Number(conditions.maxPrice)) {
//         return false;
//     }

//     // ✅ Minimum rating condition
//     if (conditions.minRating && (product.avgRating || 0) < Number(conditions.minRating)) {
//         return false;
//     }

//     // ✅ Required tags (if promo says must have these)
//     if (Array.isArray(conditions.requiredTags) && conditions.requiredTags.length > 0) {
//         const productTags = (product.tags || []).map((t) => String(t).toLowerCase());
//         const required = conditions.requiredTags.map((t) => String(t).toLowerCase());
//         if (!required.some((r) => productTags.includes(r))) return false;
//     }

//     // ✅ Optional: check for required category or brand
//     if (conditions.requiredCategories?.length) {
//         const prodCat = String(product.category ?? "");
//         if (!conditions.requiredCategories.some((c) => String(c) === prodCat)) return false;
//     }

//     if (conditions.requiredBrands?.length) {
//         const prodBrand = String(product.brand?._id ?? product.brand ?? "");
//         if (!conditions.requiredBrands.some((b) => String(b) === prodBrand)) return false;
//     }

//     return true;
// };

// export const applyPromotions = async (itemsInput, ctx = {}) => {
//     try {
//         if (!Array.isArray(itemsInput)) throw new Error("applyPromotions: itemsInput must be array");
//         const now = new Date();

//         // 1) Load active promotions
//         let promos = await Promotion.find({
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now },
//         })
//             .select(
//                 "+promotionType +promotionConfig +scope +categories +products +discountUnit +discountValue +conditions +allowStacking +priority"
//             )
//             .lean();

//         // Sort promos by priority (lower number = higher priority)
//         promos = promos.sort((a, b) => (Number(a.priority || 10) - Number(b.priority || 10)));

//         // 2) Prefetch products in cart
//         const ids = itemsInput.map((i) => i.productId).filter(isObjectId);
//         const dbProducts = await Product.find({ _id: { $in: ids } })
//             .select("_id name images brand price mrp category categoryHierarchy discountPercent tags isBestSeller avgRating variants")
//             .lean();
//         const productMap = new Map(dbProducts.map((p) => [String(p._id), p]));

//         // 3) Preload freebies needed by promos (collect unique freeProductIds used by BOGO cross-product promos)
//         const freeProductIds = new Set();
//         promos.forEach((promo) => {
//             if (promo.promotionType === "bogo" && promo.promotionConfig?.freeProductId) {
//                 const fid = String(promo.promotionConfig.freeProductId);
//                 if (isObjectId(fid)) freeProductIds.add(fid);
//             }
//             if (promo.promotionType === "bundle") {
//                 const bp = (promo.promotionConfig?.bundleProducts || []).map(String).filter(isObjectId);
//                 bp.forEach((b) => freeProductIds.add(b));
//             }
//         });
//         const freebiesMap = new Map();
//         if (freeProductIds.size) {
//             const freebies = await Product.find({ _id: { $in: Array.from(freeProductIds) } })
//                 .select("_id name images price mrp")
//                 .lean();
//             freebies.forEach((f) => freebiesMap.set(String(f._id), f));
//         }

//         // 4) Build cart lines
//         const cart = itemsInput
//             .map((i) => {
//                 const p = productMap.get(String(i.productId));
//                 if (!p) return null;
//                 const mrp = Number(p.mrp ?? p.price ?? 0);
//                 const basePrice =
//                     typeof i.basePrice === "number"
//                         ? i.basePrice
//                         : p.discountPercent
//                             ? Math.round(mrp - (mrp * p.discountPercent) / 100)
//                             : Number(p.price ?? 0);

//                 return {
//                     productId: String(p._id),
//                     name: p.name,
//                     image: Array.isArray(p.images) && p.images[0] ? p.images[0] : "",
//                     brand: p.brand || "",
//                     qty: Math.max(1, Number(i.qty || 1)),
//                     mrp,
//                     basePrice,
//                     discounts: [], // finalized discount entries (after resolution)
//                     candidateDiscounts: [], // collect all candidates first
//                     freebies: [],
//                     product: p,
//                     finalQty: Number(i.qty || 1),
//                 };


//             })
//             .filter(Boolean);

//         const appliedPromotions = [];
//         const appliedPromoIds = new Set();

//         // -------- STEP 1: PRODUCT-LEVEL PROMO CANDIDATE COLLECTION ----------
//         // For each promo -> for each line: collect candidate discounts (but don't finalize yet)
//         for (const promo of promos) {
//             // quick skip if promo doesn't apply to products (cart-only promos)
//             const isProductLevel =
//                 ["discount", "tieredDiscount", "bogo", "bundle", "collection"].includes(promo.promotionType) ||
//                 promo.scope === "product";
//             if (!isProductLevel) continue;

//             for (const line of cart) {

//                 if (!productMatchesPromo(line.product, promo)) {
//                     continue;
//                 }
//                 if (!isPromoEligibleForProduct(line.product, promo)) {
//                     continue;
//                 }
//                 if (!productMatchesConditions(line.product, promo.conditions)) {
//                     continue;
//                 }


//                 // prepare candidate container
//                 let candidate = null;

//                 // ---------- discount ----------
//                 if (promo.promotionType === "discount") {
//                     const minQty = Number(promo.conditions?.buyQuantity || 0);
//                     const inCategory =
//                         !promo.conditions?.category ||
//                         String(line.product.categoryHierarchy?.[0]?.slug || line.product.category) === String(promo.conditions?.category);

//                     if (inCategory && (minQty === 0 || line.qty >= minQty)) {
//                         const { price: newUnitPrice } = applyFlatDiscount(line.basePrice, promo);
//                         const totalDiscount = Math.max(0, (line.basePrice - newUnitPrice) * line.qty);
//                         if (totalDiscount > 0) {
//                             candidate = {
//                                 promoId: promo._id,
//                                 campaignName: promo.campaignName || promo.name,
//                                 type: "discount",
//                                 amount: Math.floor(totalDiscount),
//                                 allowStacking: !!promo.allowStacking,
//                                 priority: Number(promo.priority || 10),
//                                 note: `Flat ${promo.discountValue}${promo.discountUnit === "percent" ? "%" : "₹"} off`,
//                             };
//                         }
//                     }
//                 }

//                 // ---------- tieredDiscount ----------
//                 if (promo.promotionType === "tieredDiscount") {
//                     const tiers = (promo.promotionConfig?.tiers || []).slice().sort((a, b) => a.minQty - b.minQty);
//                     const tier = bestTierForQty(tiers, line.qty);
//                     if (tier) {
//                         const unitOff = Math.floor((line.basePrice * (tier.discountPercent || 0)) / 100);
//                         let totalDiscount = unitOff * line.qty;
//                         const extraPct = Number(tier.extraPercent ?? promo.promotionConfig?.extraPercent ?? 0);
//                         if (extraPct > 0) {
//                             const extraOffPerUnit = Math.floor(((line.basePrice - unitOff) * extraPct) / 100);
//                             totalDiscount += extraOffPerUnit * line.qty;
//                         }
//                         if (totalDiscount > 0) {
//                             candidate = {
//                                 promoId: promo._id,
//                                 campaignName: promo.campaignName || promo.name,
//                                 type: "tieredDiscount",
//                                 amount: Math.floor(totalDiscount),
//                                 allowStacking: !!promo.allowStacking,
//                                 priority: Number(promo.priority || 10),
//                                 note: `Buy ${tier.minQty}+ Save ${tier.discountPercent}%`,
//                             };
//                         }
//                     }
//                 }

//                 // ---------- bogo ----------
//                 if (promo.promotionType === "bogo") {
//                     const buyQty = Number(promo.promotionConfig?.buyQty || 1);
//                     const getQty = Number(promo.promotionConfig?.getQty || 1);
//                     const sameProduct = promo.promotionConfig?.sameProduct !== false;
//                     const freeProductId = promo.promotionConfig?.freeProductId || null;
//                     const triggerProductId = promo.promotionConfig?.triggerProductId || null;

//                     // ✅ Only apply BOGO if this product is the trigger
//                     if (triggerProductId && String(line.productId) !== String(triggerProductId)) continue;
//                     const totalQty = line.qty;
//                     if (totalQty >= buyQty) {
//                         const totalSets = Math.floor(totalQty / buyQty);
//                         const freeQty = totalSets * getQty;
//                         if (freeQty > 0) {
//                             if (sameProduct) {
//                                 const totalDiscount = Math.floor(freeQty * line.basePrice);
//                                 candidate = {
//                                     promoId: promo._id,
//                                     campaignName: promo.campaignName || promo.name,
//                                     type: "bogo",
//                                     amount: totalDiscount,
//                                     allowStacking: !!promo.allowStacking,
//                                     priority: Number(promo.priority || 10),
//                                     note: `Buy ${buyQty} Get ${getQty} Free`,
//                                     meta: { freeQty, sameProduct: true },
//                                 };
//                             } else if (isObjectId(freeProductId)) {
//                                 const freebie = freebiesMap.get(String(freeProductId));
//                                 if (freebie) {
//                                     const totalDiscount = Math.floor(freeQty * (freebie.price || 0));
//                                     // ✅ Inject free item into cart
//                                     const existingFreeLine = cart.find(l => l.productId === String(freebie._id) && l.isFree);
//                                     if (existingFreeLine) {
//                                         existingFreeLine.qty += freeQty;
//                                         existingFreeLine.finalQty += freeQty;
//                                     } else {
//                                         cart.push({
//                                             productId: String(freebie._id),
//                                             name: freebie.name,
//                                             image: Array.isArray(freebie.images) && freebie.images[0] ? freebie.images[0] : "",
//                                             brand: freebie.brand || "",
//                                             qty: freeQty,
//                                             mrp: Number(freebie.mrp ?? freebie.price ?? 0),
//                                             basePrice: 0, // free item, price zero
//                                             discounts: [],
//                                             freebies: [],
//                                             isFree: true,
//                                             promoId: promo._id,
//                                             promoNote: `Free with ${line.name}`,
//                                             product: freebie,
//                                             finalQty: freeQty,
//                                         });
//                                     }

//                                     candidate = {
//                                         promoId: promo._id,
//                                         campaignName: promo.campaignName || promo.name,
//                                         type: "bogo",
//                                         amount: totalDiscount,
//                                         allowStacking: !!promo.allowStacking,
//                                         priority: Number(promo.priority || 10),
//                                         note: `Buy ${buyQty} Get ${getQty} Free (${freebie.name})`,
//                                         meta: { freeQty, freeProductId: String(freebie._id), freeProductName: freebie.name },
//                                     };
//                                 }
//                             }
//                         }
//                     }
//                 }

//                 // ---------- bundle ----------
//                 if (promo.promotionType === "bundle") {
//                     const bp = (promo.promotionConfig?.bundleProducts || []).map(String).filter(isObjectId);
//                     const bundlePrice = Number(promo.promotionConfig?.bundlePrice || 0);
//                     if (bp.length >= 2 && bundlePrice > 0) {
//                         // all bundle product lines present?
//                         const lines = cart.filter((l) => bp.includes(l.productId));
//                         if (lines.length === bp.length) {
//                             // total base price for one set
//                             const totalBaseOneSet = lines.reduce((s, l) => s + l.basePrice, 0);
//                             if (totalBaseOneSet > bundlePrice) {
//                                 // how many sets can be formed
//                                 const bundleSets = Math.min(...bp.map((id) => cart.find((l) => l.productId === id)?.qty || 0));
//                                 // total discount for one set
//                                 const bundleUnitDiscount = Math.max(0, totalBaseOneSet - bundlePrice);
//                                 // allocate share to this line proportionally
//                                 const share = line.basePrice / totalBaseOneSet;
//                                 const lineDiscount = Math.floor(bundleUnitDiscount * share) * bundleSets;
//                                 if (lineDiscount > 0) {
//                                     candidate = {
//                                         promoId: promo._id,
//                                         campaignName: promo.campaignName || promo.name,
//                                         type: "bundle",
//                                         amount: Math.floor(lineDiscount),
//                                         allowStacking: !!promo.allowStacking,
//                                         priority: Number(promo.priority || 10),
//                                         note: "Bundle Combo",
//                                     };
//                                 }
//                             }
//                         }
//                     }
//                 }

//                 // ---------- collection (example: collection limit price based) ----------
//                 if (promo.promotionType === "collection" && promo.promotionConfig?.maxProductPrice) {
//                     if (line.basePrice <= Number(promo.promotionConfig.maxProductPrice)) {
//                         // This promo might be treated as a tag-highlighter for frontend; here we may give flat discountValue if present
//                         if (promo.discountValue > 0) {
//                             const amt = promo.discountUnit === "percent"
//                                 ? Math.floor((line.basePrice * Number(promo.discountValue || 0)) / 100) * line.qty
//                                 : Math.floor(Number(promo.discountValue || 0)) * line.qty;
//                             if (amt > 0) {
//                                 candidate = {
//                                     promoId: promo._id,
//                                     campaignName: promo.campaignName || promo.name,
//                                     type: "collection",
//                                     amount: Math.floor(amt),
//                                     allowStacking: !!promo.allowStacking,
//                                     priority: Number(promo.priority || 10),
//                                     note: `Collection Offer`,
//                                 };
//                             }
//                         }
//                     }
//                 }

//                 // If candidate found, push to line.candidateDiscounts
//                 if (candidate) {
//                     line.candidateDiscounts = line.candidateDiscounts || [];
//                     line.candidateDiscounts.push(candidate);
//                     // record appliedPromotions (unique)
//                     if (!appliedPromotions.some((p) => String(p._id) === String(promo._id))) {
//                         appliedPromotions.push({
//                             _id: promo._id,
//                             campaignName: promo.campaignName,
//                             type: promo.promotionType,
//                             scope: promo.scope,
//                             promotionConfig: promo.promotionConfig || {},
//                             products: (promo.products || []).map(String),
//                             categories: (promo.categories || []).map(String),
//                             brands: (promo.brands || []).map(String),
//                         });
//                     }

//                 }


//             } // end for each line
//         } // end for each promo

//         // -------- STEP 1b: FINALIZE per-line discount — stacking vs best-only ----------
//         for (const line of cart) {
//             const candidates = line.candidateDiscounts || [];
//             if (!candidates.length) {
//                 line.discounts = [];
//                 continue;
//             }

//             // separate stackable and non-stackable
//             const stackable = candidates.filter((c) => c.allowStacking);
//             const nonStackable = candidates.filter((c) => !c.allowStacking);

//             // If any stackable exists, combine them (sum amounts). But if a non-stackable single candidate gives more than stacked sum — choose that.
//             const stackedAmount = stackable.reduce((s, c) => s + Number(c.amount || 0), 0);
//             const bestNonStackable = nonStackable.length
//                 ? nonStackable.reduce((best, cur) => (!best || cur.amount > best.amount ? cur : best), null)
//                 : null;

//             if (bestNonStackable && bestNonStackable.amount > stackedAmount) {
//                 line.discounts = [bestNonStackable];
//             } else if (stackedAmount > 0) {
//                 line.discounts = [
//                     {
//                         promoIds: stackable.map((s) => s.promoId),
//                         type: "stacked",
//                         amount: Math.floor(stackedAmount),
//                         note: "Stacked promotions",
//                     },
//                 ];
//             } else if (bestNonStackable) {
//                 line.discounts = [bestNonStackable];
//             } else {
//                 line.discounts = [];
//             }
//         }

//         // -------- STEP 2: BASE SUMMARY from per-line discounts ----------
//         const summary = cart.reduce(
//             (acc, l) => {
//                 const lineBase = l.basePrice * l.qty;
//                 const lineDiscounts = (l.discounts || []).reduce((s, d) => s + Number(d.amount || 0), 0);
//                 const bogoDiscount = l.candidateDiscounts?.some((c) => c.type === "bogo" && c.meta?.sameProduct)
//                     ? l.candidateDiscounts
//                         .filter((c) => c.type === "bogo" && c.meta?.sameProduct)
//                         .reduce((s, c) => s + Number(c.amount || 0), 0)
//                     : 0;

//                 acc.mrpTotal += Number(l.mrp || 0) * l.qty;
//                 acc.savings += lineDiscounts + bogoDiscount;
//                 acc.payable += Math.max(0, lineBase - lineDiscounts - bogoDiscount);
//                 return acc;


//             },
//             { mrpTotal: 0, savings: 0, payable: 0 }
//         );

//         // small safety normalization
//         summary.mrpTotal = round2(summary.mrpTotal);
//         summary.savings = round2(summary.savings);
//         summary.payable = round2(summary.payable);

//         // internal helper to record applied promo for cart-level ones too
//         const addPromoRecord = (promo, type) => {
//             if (!appliedPromotions.some((p) => String(p._id) === String(promo._id))) {
//                 appliedPromotions.push({
//                     _id: promo._id,
//                     campaignName: promo.campaignName,
//                     type: promo.promotionType,
//                     scope: promo.scope,
//                     promotionConfig: promo.promotionConfig || {},
//                     products: (promo.products || []).map(String),
//                     categories: (promo.categories || []).map(String),
//                     brands: (promo.brands || []).map(String),
//                 });
//             }

//         };

//         // -------- STEP 3: CART-LEVEL PROMOTIONS (apply after item-level discounts) ----------
//         const isNewUser = !!ctx.userContext?.isNewUser;
//         const paymentMethod = (ctx.paymentMethod || "").trim();

//         for (const promo of promos) {
//             const type = promo.promotionType;

//             // skip product-level promos here
//             const isCartLevel = ["newUser", "paymentOffer", "cartValue", "gift", "freeShipping", "categorySpend", "brandSpend"].includes(type);
//             if (!isCartLevel) continue;

//             // newUser
//             if (type === "newUser" && isNewUser) {
//                 const dp = Number(promo.promotionConfig?.discountPercent || 0);
//                 const cap = Number(promo.promotionConfig?.maxDiscount || Infinity);
//                 if (dp > 0) {
//                     const discount = Math.min(Math.floor((summary.payable * dp) / 100), cap || Infinity);
//                     if (discount > 0) {
//                         summary.savings = round2(summary.savings + discount);
//                         summary.payable = round2(Math.max(0, summary.payable - discount));
//                         addPromoRecord(promo, type);
//                     }
//                 }
//             }

//             // paymentOffer
//             if (type === "paymentOffer") {
//                 const methods = promo.promotionConfig?.methods || [];
//                 const min = Number(promo.promotionConfig?.minOrderValue || 0);
//                 const dp = Number(promo.promotionConfig?.discountPercent || 0);
//                 const cap = Number(promo.promotionConfig?.maxDiscount || Infinity);
//                 if (methods.includes(paymentMethod) && summary.payable >= min && dp > 0) {
//                     const discount = Math.min(Math.floor((summary.payable * dp) / 100), cap || Infinity);
//                     if (discount > 0) {
//                         summary.savings = round2(summary.savings + discount);
//                         summary.payable = round2(Math.max(0, summary.payable - discount));
//                         addPromoRecord(promo, type);
//                     }
//                 }
//             }

//             // cartValue (generic cart-level percent/flat)
//             if (type === "cartValue") {
//                 const min = Number(promo.promotionConfig?.minOrderValue || promo.conditions?.minOrderValue || 0);
//                 const dp = Number(promo.promotionConfig?.discountPercent || 0);
//                 const flat = Number(promo.promotionConfig?.flatDiscount || 0);
//                 const cap = Number(promo.promotionConfig?.maxDiscount || Infinity);

//                 if (summary.payable >= min) {
//                     let discount = 0;
//                     if (dp > 0) discount = Math.min(Math.floor((summary.payable * dp) / 100), cap || Infinity);
//                     else if (flat > 0) discount = Math.floor(flat);
//                     if (discount > 0) {
//                         summary.savings = round2(summary.savings + discount);
//                         summary.payable = round2(Math.max(0, summary.payable - discount));
//                         addPromoRecord(promo, type);
//                     }
//                 }


//             }

//             // categorySpend (example: spend X in listed categories -> percent off on those categories)
//             if (type === "categorySpend") {
//                 const catIds = (promo.categories || []).map((c) => String(c.category || c));
//                 if (catIds.length) {
//                     const catLines = cart.filter((l) => {
//                         const prodCat = String(l.product.category ?? "");
//                         if (catIds.includes(prodCat)) return true;
//                         if (Array.isArray(l.product.categoryHierarchy)) {
//                             return l.product.categoryHierarchy.some((ch) => {
//                                 const cid = String(ch._id || ch.id || ch.category || ch);
//                                 return catIds.includes(cid);
//                             });
//                         }
//                         return false;
//                     });
//                     const catTotal = catLines.reduce((s, l) => s + l.basePrice * l.qty, 0);
//                     const minSpend = Number(promo.promotionConfig?.minSpend || 0);
//                     const dp = Number(promo.promotionConfig?.discountPercent || 0);
//                     if (catTotal >= minSpend && dp > 0) {
//                         const discount = Math.floor((catTotal * dp) / 100);
//                         summary.savings = round2(summary.savings + discount);
//                         summary.payable = round2(Math.max(0, summary.payable - discount));
//                         addPromoRecord(promo, type);
//                     }
//                 }
//             }

//             // brandSpend (example: spend X in listed brands -> flat off)
//             if (type === "brandSpend") {
//                 const brandIds = (promo.brands || []).map((b) => String(b.brand || b));
//                 if (brandIds.length) {
//                     const brandLines = cart.filter((l) => brandIds.includes(String(l.product.brand ?? "")));
//                     const brandTotal = brandLines.reduce((s, l) => s + l.basePrice * l.qty, 0);
//                     const minSpend = Number(promo.promotionConfig?.minSpend || 0);
//                     const flatDiscount = Number(promo.promotionConfig?.flatDiscount || 0);
//                     if (brandTotal >= minSpend && flatDiscount > 0) {
//                         const discount = Math.floor(flatDiscount);
//                         summary.savings = round2(summary.savings + discount);
//                         summary.payable = round2(Math.max(0, summary.payable - discount));
//                         addPromoRecord(promo, type);
//                     }
//                 }
//             }

//             // gift
//             if (type === "gift") {
//                 const min = Number(promo.promotionConfig?.minOrderValue || promo.conditions?.minOrderValue || 0);
//                 if (summary.payable >= min) {
//                     summary.freeGifts = summary.freeGifts || [];
//                     // unify key name giftProductId in promotionConfig if possible
//                     const giftPid = promo.promotionConfig?.giftProductId || promo.promotionConfig?.giftProduct || null;
//                     summary.freeGifts.push({
//                         promoId: promo._id,
//                         productId: giftPid,
//                     });
//                     addPromoRecord(promo, type);
//                 }
//             }

//             // freeShipping
//             if (type === "freeShipping") {
//                 const min = Number(promo.promotionConfig?.minOrderValue || promo.conditions?.minOrderValue || 0);
//                 if (summary.payable >= min) {
//                     summary.freeShipping = true;
//                     addPromoRecord(promo, type);
//                 }
//             }
//         } // end cart-level promos

//         // Safety guards
//         summary.payable = round2(Math.max(0, summary.payable));
//         summary.savings = round2(Math.min(summary.savings, summary.mrpTotal));

//         // OPTIONAL: update promotions stats (appliedCount / lastAppliedAt) for those applied
//         try {
//             if (appliedPromotions.length) {
//                 // create update promises
//                 const updates = appliedPromotions.map((p) =>
//                     Promotion.findByIdAndUpdate(String(p._id), { $inc: { appliedCount: 1, usageCount: 1 }, $set: { lastAppliedAt: new Date() } }).exec()
//                 );
//                 // do not block main flow too long — await but it's fine (you can remove await to fire & forget)
//                 await Promise.all(updates);
//             }
//         } catch (uErr) {
//             // don't fail the whole function when telemetry update fails
//             console.warn("promo usage update failed:", uErr?.message || uErr);
//         }

//         // Final output
//         return { items: cart, summary, appliedPromotions };
//     } catch (err) {
//         console.error("applyPromotions error:", err);
//         throw err;
//     }
// };
















// // services/promotionEngine.js
// import Promotion from "../../models/Promotion.js";
// import Product from "../../models/Product.js";
// import { productMatchesPromo, asMoney, applyFlatDiscount, bestTierForQty, isObjectId } from "../../controllers/user/userPromotionController.js"; // or move them here


// export const applyPromotions = async (itemsInput, ctx = {}) => {
//     try {
//         // ✅ Always ensure it's an array
//         if (!Array.isArray(itemsInput)) {
//             throw new Error("applyPromotions: itemsInput must be an array of cart items");
//         }

//         const now = new Date();
//         const promos = await Promotion.find({
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now },
//         })
//             .select(
//                 "+promotionType +promotionConfig +scope +categories +products +discountUnit +discountValue"
//             )
//             .lean();

//         // Load products in cart
//         const ids = itemsInput.map((i) => i.productId).filter(isObjectId);
//         const dbProducts = await Product.find({ _id: { $in: ids } })
//             .select("_id name images brand price mrp category categoryHierarchy")
//             .lean();

//         const productMap = new Map(dbProducts.map((p) => [p._id.toString(), p]));

//         // Build cart rows
//         const cart = itemsInput
//             .map((i) => {
//                 const p = productMap.get(i.productId);
//                 if (!p) return null;
//                 const mrp = Number(p.mrp ?? p.price);
//                 return {
//                     productId: p._id.toString(),
//                     name: p.name,
//                     image: Array.isArray(p.images) && p.images[0] ? p.images[0] : "",
//                     brand: p.brand || "",
//                     qty: Math.max(1, Number(i.qty || 1)),
//                     basePrice: Number(p.price),
//                     mrp,
//                     category: p.category?.toString?.(),
//                     product: p,
//                     price: Number(p.price), // adjusted later
//                     discounts: [], // {promoId, type, amount, note}
//                     freebies: [], // {promoId, productId, qty}
//                 };
//             })
//             .filter(Boolean);

//         // helper: attach discount to line
//         const addLineDiscount = (line, promo, type, amount, note) => {
//             const amt = Number(amount);
//             if (amt > 0) {
//                 line.discounts.push({ promoId: promo._id, type, amount: amt, note });
//                 line.price = Math.max(0, line.price - amt / line.qty);
//             }
//         };

//         const appliedPromotions = [];

//         /* ---------------- STEP 1: Product-level promos ---------------- */
//         for (const promo of promos) {
//             let promoApplied = false;

//             if (promo.promotionType === "discount") {
//                 for (const line of cart) {
//                     if (!productMatchesPromo(line.product, promo)) continue;
//                     const { price: newUnitPrice } = applyFlatDiscount(line.mrp, promo);
//                     const totalDiscount = (line.mrp - newUnitPrice) * line.qty;
//                     if (totalDiscount > 0) {
//                         addLineDiscount(line, promo, "discount", totalDiscount, "Flat discount");
//                         promoApplied = true;
//                     }
//                 }
//             }

//             if (promo.promotionType === "tieredDiscount") {
//                 const tiers = (promo.promotionConfig?.tiers || []).sort(
//                     (a, b) => a.minQty - b.minQty
//                 );
//                 const scope =
//                     promo.promotionConfig?.tierScope === "perOrder" ? "perOrder" : "perProduct";

//                 if (scope === "perProduct") {
//                     for (const line of cart) {
//                         if (!productMatchesPromo(line.product, promo)) continue;
//                         const tier = bestTierForQty(tiers, line.qty);
//                         if (!tier) continue;
//                         const unitOff = Math.floor((line.mrp * tier.discountPercent) / 100);
//                         addLineDiscount(
//                             line,
//                             promo,
//                             "tieredDiscount",
//                             unitOff * line.qty,
//                             `Buy ${tier.minQty}+ Save ${tier.discountPercent}%`
//                         );
//                         promoApplied = true;
//                     }
//                 } else {
//                     const eligibleLines = cart.filter((l) => productMatchesPromo(l.product, promo));
//                     const totalQty = eligibleLines.reduce((s, l) => s + l.qty, 0);
//                     const tier = bestTierForQty(tiers, totalQty);
//                     if (tier) {
//                         const subtotal = eligibleLines.reduce((s, l) => s + l.mrp * l.qty, 0);
//                         for (const line of eligibleLines) {
//                             const lineBase = line.mrp * line.qty;
//                             const share = subtotal > 0 ? lineBase / subtotal : 0;
//                             const lineDiscount = Math.floor(
//                                 lineBase * (tier.discountPercent / 100) * share
//                             );
//                             addLineDiscount(
//                                 line,
//                                 promo,
//                                 "tieredDiscount",
//                                 lineDiscount,
//                                 `Cart ${tier.minQty}+ Save ${tier.discountPercent}%`
//                             );
//                             promoApplied = true;
//                         }
//                     }
//                 }
//             }

//             if (promo.promotionType === "bundle") {
//                 const bp = (promo.promotionConfig?.bundleProducts || []).map(String);
//                 const bundlePrice = Number(promo.promotionConfig?.bundlePrice || 0);
//                 if (bp.length >= 2 && bundlePrice > 0) {
//                     const lines = cart.filter((l) => bp.includes(l.productId));
//                     if (lines.length === bp.length) {
//                         const bundleQty = Math.min(
//                             ...bp.map((id) => cart.find((l) => l.productId === id)?.qty || 0)
//                         );
//                         if (bundleQty > 0) {
//                             const bundleMrp = lines.reduce((s, l) => s + l.mrp, 0);
//                             const bundleUnitDiscount = Math.max(0, bundleMrp - bundlePrice);
//                             const totalBase = lines.reduce((s, l) => s + l.mrp, 0);
//                             for (const l of lines) {
//                                 const share = totalBase > 0 ? l.mrp / totalBase : 0;
//                                 const lineDiscount = Math.floor(bundleUnitDiscount * share) * bundleQty;
//                                 if (lineDiscount > 0) {
//                                     addLineDiscount(l, promo, "bundle", lineDiscount, "Bundle deal");
//                                     promoApplied = true;
//                                 }
//                             }
//                         }
//                     }
//                 }
//             }

//             if (promoApplied) {
//                 appliedPromotions.push({
//                     _id: promo._id,
//                     name: promo.campaignName,
//                     type: promo.promotionType,
//                 });
//             }
//         }

//         /* ---------------- STEP 2: Base summary ---------------- */
//         let summary = cart.reduce(
//             (acc, l) => {
//                 const lineBase = l.mrp * l.qty;
//                 const linePrice = l.price * l.qty;
//                 const lineDiscounts = l.discounts.reduce((s, d) => s + d.amount, 0);
//                 acc.mrpTotal += lineBase;
//                 acc.savings += lineDiscounts;
//                 acc.payable += linePrice;
//                 return acc;
//             },
//             { mrpTotal: 0, savings: 0, payable: 0 }
//         );

//         /* ---------------- STEP 3: Cart-level promos ---------------- */
//         const isNewUser = !!ctx.userContext?.isNewUser;
//         const paymentMethod = (ctx.paymentMethod || "").trim();

//         const newUserPromo = promos.find(
//             (p) =>
//                 p.promotionType === "newUser" &&
//                 (p.targetAudience === "new" || p.targetAudience === "all")
//         );
//         if (newUserPromo && isNewUser) {
//             const dp = Number(newUserPromo.promotionConfig?.discountPercent || 0);
//             const cap = Number(newUserPromo.promotionConfig?.maxDiscount || 0);
//             if (dp > 0) {
//                 const discount = Math.floor((summary.payable * dp) / 100);
//                 const applied = Math.min(discount, cap || discount);
//                 summary.savings += applied;
//                 summary.payable = Math.max(0, summary.payable - applied);
//                 appliedPromotions.push({
//                     _id: newUserPromo._id,
//                     name: newUserPromo.campaignName,
//                     type: "newUser",
//                 });
//             }
//         }

//         const paymentPromo = promos.find((p) => p.promotionType === "paymentOffer");
//         if (paymentPromo) {
//             const methods = paymentPromo.promotionConfig?.methods || [];
//             const mov = Number(paymentPromo.promotionConfig?.minOrderValue || 0);
//             if (methods.includes(paymentMethod) && summary.payable >= mov) {
//                 const dp = Number(paymentPromo.promotionConfig?.discountPercent || 0);
//                 const cap = Number(paymentPromo.promotionConfig?.maxDiscount || 0);
//                 if (dp > 0) {
//                     const discount = Math.floor((summary.payable * dp) / 100);
//                     const applied = Math.min(discount, cap || discount);
//                     summary.savings += applied;
//                     summary.payable = Math.max(0, summary.payable - applied);
//                     appliedPromotions.push({
//                         _id: paymentPromo._id,
//                         name: paymentPromo.campaignName,
//                         type: "paymentOffer",
//                     });
//                 }
//             }
//         }

//         return {
//             items: cart,
//             summary,
//             appliedPromotions,
//         };
//     } catch (err) {
//         console.error("applyPromotions helper error:", err);
//         throw err;
//     }
// };




// services/promotionEngine.js
import Promotion from "../../models/Promotion.js";
import Product from "../../models/Product.js";
import {
    productMatchesPromo,
    applyFlatDiscount,
    bestTierForQty,
    isObjectId,
} from "../../controllers/user/userPromotionController.js";

export const applyPromotions = async (itemsInput, ctx = {}) => {
    try {
        if (!Array.isArray(itemsInput)) {
            throw new Error("applyPromotions: itemsInput must be an array of cart items");
        }

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

        /* ---------------- Load products in cart ---------------- */
        const ids = itemsInput.map((i) => i.productId).filter(isObjectId);
        const dbProducts = await Product.find({ _id: { $in: ids } })
            .select("_id name images brand price mrp category categoryHierarchy discountPercent")
            .lean();

        const productMap = new Map(dbProducts.map((p) => [p._id.toString(), p]));

        /* ---------------- Build cart lines ---------------- */
        const cart = itemsInput
            .map((i) => {
                const p = productMap.get(i.productId);
                if (!p) return null;

                const mrp = Number(p.mrp ?? p.price);

                const basePrice =
                    typeof i.basePrice === "number"
                        ? i.basePrice
                        : p.discountPercent
                            ? Math.round(mrp - (mrp * p.discountPercent) / 100)
                            : Number(p.price);

                return {
                    productId: p._id.toString(),
                    name: p.name,
                    image: Array.isArray(p.images) && p.images[0] ? p.images[0] : "",
                    brand: p.brand || "",
                    qty: Math.max(1, Number(i.qty || 1)),
                    mrp,
                    basePrice,
                    discounts: [], // will only keep best one
                    freebies: [],
                    product: p,
                };
            })
            .filter(Boolean);

        const appliedPromotions = [];

        /* ---------------- STEP 1: Product-level promos ---------------- */
        for (const promo of promos) {
            // temporary collection of candidate discounts for each line
            for (const line of cart) {
                if (!productMatchesPromo(line.product, promo)) continue;

                let candidateDiscount = null;

                // Flat discount
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

                // Tiered discount
                if (promo.promotionType === "tieredDiscount") {
                    const tiers = (promo.promotionConfig?.tiers || []).sort(
                        (a, b) => a.minQty - b.minQty
                    );
                    const scope =
                        promo.promotionConfig?.tierScope === "perOrder" ? "perOrder" : "perProduct";

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
                    // ⚠️ perOrder tier handled separately below
                }

                // Bundle discount
                if (promo.promotionType === "bundle") {
                    const bp = (promo.promotionConfig?.bundleProducts || []).map(String);
                    const bundlePrice = Number(promo.promotionConfig?.bundlePrice || 0);

                    if (bp.length >= 2 && bundlePrice > 0) {
                        const lines = cart.filter((l) => bp.includes(l.productId));
                        if (lines.length === bp.length) {
                            const bundleQty = Math.min(
                                ...bp.map((id) => cart.find((l) => l.productId === id)?.qty || 0)
                            );
                            if (bundleQty > 0) {
                                const bundleMrp = lines.reduce((s, l) => s + l.basePrice, 0);
                                const bundleUnitDiscount = Math.max(0, bundleMrp - bundlePrice);
                                const totalBase = lines.reduce((s, l) => s + l.basePrice, 0);

                                const share = totalBase > 0 ? line.basePrice / totalBase : 0;
                                const lineDiscount =
                                    Math.floor(bundleUnitDiscount * share) * bundleQty;
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

                // ✅ keep only the BEST discount (highest amount)
                if (candidateDiscount) {
                    const currentBest = line.discounts[0];
                    if (!currentBest || candidateDiscount.amount > currentBest.amount) {
                        line.discounts = [candidateDiscount];
                    }
                }
            }
        }

        // Collect applied promos
        for (const line of cart) {
            if (line.discounts.length > 0) {
                const d = line.discounts[0];
                if (!appliedPromotions.find((p) => p._id.toString() === d.promoId.toString())) {
                    const promo = promos.find((p) => p._id.toString() === d.promoId.toString());
                    if (promo) {
                        appliedPromotions.push({
                            _id: promo._id,
                            name: promo.campaignName,
                            type: promo.promotionType,
                        });
                    }
                }
            }
        }

        /* ---------------- STEP 2: Base summary ---------------- */
        const summary = cart.reduce(
            (acc, l) => {
                const lineBase = l.basePrice * l.qty;
                const lineDiscounts = l.discounts.reduce((s, d) => s + d.amount, 0);

                acc.mrpTotal += l.mrp * l.qty;
                acc.savings += lineDiscounts;
                acc.payable += Math.max(0, lineBase - lineDiscounts);

                return acc;
            },
            { mrpTotal: 0, savings: 0, payable: 0 }
        );

        /* ---------------- STEP 3: Cart-level promos ---------------- */
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
                    appliedPromotions.push({
                        _id: promo._id,
                        name: promo.campaignName,
                        type,
                    });
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
                        appliedPromotions.push({
                            _id: promo._id,
                            name: promo.campaignName,
                            type,
                        });
                    }
                }
            }
        }

        return { items: cart, summary, appliedPromotions };
    } catch (err) {
        console.error("applyPromotions helper error:", err);
        throw err;
    }
};
