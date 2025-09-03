// services/promotionEngine.js
import Promotion from "../../models/Promotion.js";
import Product from "../../models/Product.js";
import { productMatchesPromo, asMoney, applyFlatDiscount, bestTierForQty, isObjectId } from "../../controllers/user/userPromotionController.js"; // or move them here


export const applyPromotions = async (itemsInput, ctx = {}) => {
    try {
        // ✅ Always ensure it's an array
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

        // Load products in cart
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
                const mrp = Number(p.mrp ?? p.price);
                return {
                    productId: p._id.toString(),
                    name: p.name,
                    image: Array.isArray(p.images) && p.images[0] ? p.images[0] : "",
                    brand: p.brand || "",
                    qty: Math.max(1, Number(i.qty || 1)),
                    basePrice: Number(p.price),
                    mrp,
                    category: p.category?.toString?.(),
                    product: p,
                    price: Number(p.price), // adjusted later
                    discounts: [], // {promoId, type, amount, note}
                    freebies: [], // {promoId, productId, qty}
                };
            })
            .filter(Boolean);

        // helper: attach discount to line
        const addLineDiscount = (line, promo, type, amount, note) => {
            const amt = Number(amount);
            if (amt > 0) {
                line.discounts.push({ promoId: promo._id, type, amount: amt, note });
                line.price = Math.max(0, line.price - amt / line.qty);
            }
        };

        const appliedPromotions = [];

        /* ---------------- STEP 1: Product-level promos ---------------- */
        for (const promo of promos) {
            let promoApplied = false;

            if (promo.promotionType === "discount") {
                for (const line of cart) {
                    if (!productMatchesPromo(line.product, promo)) continue;
                    const { price: newUnitPrice } = applyFlatDiscount(line.mrp, promo);
                    const totalDiscount = (line.mrp - newUnitPrice) * line.qty;
                    if (totalDiscount > 0) {
                        addLineDiscount(line, promo, "discount", totalDiscount, "Flat discount");
                        promoApplied = true;
                    }
                }
            }

            if (promo.promotionType === "tieredDiscount") {
                const tiers = (promo.promotionConfig?.tiers || []).sort(
                    (a, b) => a.minQty - b.minQty
                );
                const scope =
                    promo.promotionConfig?.tierScope === "perOrder" ? "perOrder" : "perProduct";

                if (scope === "perProduct") {
                    for (const line of cart) {
                        if (!productMatchesPromo(line.product, promo)) continue;
                        const tier = bestTierForQty(tiers, line.qty);
                        if (!tier) continue;
                        const unitOff = Math.floor((line.mrp * tier.discountPercent) / 100);
                        addLineDiscount(
                            line,
                            promo,
                            "tieredDiscount",
                            unitOff * line.qty,
                            `Buy ${tier.minQty}+ Save ${tier.discountPercent}%`
                        );
                        promoApplied = true;
                    }
                } else {
                    const eligibleLines = cart.filter((l) => productMatchesPromo(l.product, promo));
                    const totalQty = eligibleLines.reduce((s, l) => s + l.qty, 0);
                    const tier = bestTierForQty(tiers, totalQty);
                    if (tier) {
                        const subtotal = eligibleLines.reduce((s, l) => s + l.mrp * l.qty, 0);
                        for (const line of eligibleLines) {
                            const lineBase = line.mrp * line.qty;
                            const share = subtotal > 0 ? lineBase / subtotal : 0;
                            const lineDiscount = Math.floor(
                                lineBase * (tier.discountPercent / 100) * share
                            );
                            addLineDiscount(
                                line,
                                promo,
                                "tieredDiscount",
                                lineDiscount,
                                `Cart ${tier.minQty}+ Save ${tier.discountPercent}%`
                            );
                            promoApplied = true;
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
                            ...bp.map((id) => cart.find((l) => l.productId === id)?.qty || 0)
                        );
                        if (bundleQty > 0) {
                            const bundleMrp = lines.reduce((s, l) => s + l.mrp, 0);
                            const bundleUnitDiscount = Math.max(0, bundleMrp - bundlePrice);
                            const totalBase = lines.reduce((s, l) => s + l.mrp, 0);
                            for (const l of lines) {
                                const share = totalBase > 0 ? l.mrp / totalBase : 0;
                                const lineDiscount = Math.floor(bundleUnitDiscount * share) * bundleQty;
                                if (lineDiscount > 0) {
                                    addLineDiscount(l, promo, "bundle", lineDiscount, "Bundle deal");
                                    promoApplied = true;
                                }
                            }
                        }
                    }
                }
            }

            if (promoApplied) {
                appliedPromotions.push({
                    _id: promo._id,
                    name: promo.campaignName,
                    type: promo.promotionType,
                });
            }
        }

        /* ---------------- STEP 2: Base summary ---------------- */
        let summary = cart.reduce(
            (acc, l) => {
                const lineBase = l.mrp * l.qty;
                const linePrice = l.price * l.qty;
                const lineDiscounts = l.discounts.reduce((s, d) => s + d.amount, 0);
                acc.mrpTotal += lineBase;
                acc.savings += lineDiscounts;
                acc.payable += linePrice;
                return acc;
            },
            { mrpTotal: 0, savings: 0, payable: 0 }
        );

        /* ---------------- STEP 3: Cart-level promos ---------------- */
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
                appliedPromotions.push({
                    _id: newUserPromo._id,
                    name: newUserPromo.campaignName,
                    type: "newUser",
                });
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
                    appliedPromotions.push({
                        _id: paymentPromo._id,
                        name: paymentPromo.campaignName,
                        type: "paymentOffer",
                    });
                }
            }
        }

        return {
            items: cart,
            summary,
            appliedPromotions,
        };
    } catch (err) {
        console.error("applyPromotions helper error:", err);
        throw err;
    }
};

