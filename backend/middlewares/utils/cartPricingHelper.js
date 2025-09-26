// helpers/cartCalculator.js
import Discount from "../../models/Discount.js";
import GiftCard from "../../models/GiftCard.js";
import { validateDiscountForCartInternal } from "../../controllers/user/userDiscountController.js";
import { applyPromotions } from "../../middlewares/services/promotionEngine.js";
import { getOrCreateWallet } from "../../middlewares/utils/walletHelpers.js";

// export const calculateCartSummary = async (user, query = {}) => {
//     const validCartItems = (user.cart || []).filter((item) => item.product);
//     if (!validCartItems.length) throw new Error("Cart is empty");

//     const itemsInput = validCartItems.map((i) => ({
//         productId: String(i.product._id),
//         qty: i.quantity,
//     }));

//     const promoResult = await applyPromotions(itemsInput, {
//         userContext: { isNewUser: user.isNewUser },
//     });

//     const { items, summary, appliedPromotions } = promoResult;

//     /* ---------- Coupons ---------- */
//     const allDiscountDocs = await Discount.find({ status: "Active" }).lean();

//     const nonPromoItemsInput = items
//         .filter((i) => !i.discounts || i.discounts.length === 0)
//         .map((i) => ({ productId: i.productId, qty: i.qty }));

//     // check each coupon applicability
//     const couponsChecked = await Promise.all(
//         allDiscountDocs.map(async (d) => {
//             try {
//                 if (!nonPromoItemsInput.length) {
//                     return {
//                         code: d.code,
//                         label: d.name,
//                         type: d.type,
//                         value: d.value,
//                         status: "Not applicable",
//                         message: "All items already on offer – coupons not applicable 🎉",
//                     };
//                 }

//                 await validateDiscountForCartInternal({
//                     code: d.code,
//                     cart: nonPromoItemsInput,
//                     userId: user._id,
//                 });

//                 return {
//                     code: d.code,
//                     label: d.name,
//                     type: d.type,
//                     value: d.value,
//                     status: "Applicable",
//                     message: `Apply code ${d.code} and save ${d.type === "Percentage" ? d.value + "%" : "₹" + d.value
//                         } on non-promotional items`,
//                 };
//             } catch {
//                 return {
//                     code: d.code,
//                     label: d.name,
//                     type: d.type,
//                     value: d.value,
//                     status: "Not applicable",
//                     message: "Not valid for current cart",
//                 };
//             }
//         })
//     );

//     const applicableCoupons = couponsChecked.filter((c) => c.status === "Applicable");
//     const inapplicableCoupons = couponsChecked.filter((c) => c.status !== "Applicable");

//     // selected coupon
//     let appliedCoupon = null;
//     let discountFromCoupon = 0;

//     if (query.discount && nonPromoItemsInput.length) {
//         try {
//             const result = await validateDiscountForCartInternal({
//                 code: query.discount.trim(),
//                 cart: nonPromoItemsInput,
//                 userId: user._id,
//             });

//             const COUPON_MAX_CAP = result.discount.maxCap || 500;
//             discountFromCoupon = Math.min(result.priced.discountAmount, COUPON_MAX_CAP);

//             appliedCoupon = {
//                 code: result.discount.code,
//                 discount: discountFromCoupon,
//             };
//         } catch {
//             appliedCoupon = null;
//             discountFromCoupon = 0;
//         }
//     }

//     /* ---------- Referral Points ---------- */
//     let pointsUsed = 0;
//     let pointsDiscount = 0;
//     let pointsMessage = "";

//     const wallet = await getOrCreateWallet(user._id);

//     if (query.pointsToUse) {
//         pointsUsed = Number(query.pointsToUse);
//         if (!isNaN(pointsUsed) && pointsUsed > 0 && wallet.rewardPoints > 0) {
//             if (pointsUsed > wallet.rewardPoints) pointsUsed = wallet.rewardPoints;
//             pointsDiscount = pointsUsed * 0.1;
//             pointsMessage = `🎉 You used ${pointsUsed} points from your wallet! Discount applied: ₹${pointsDiscount}`;
//         }
//     }

//     /* ---------- Gift Card ---------- */
//     let giftCardApplied = null;
//     let giftCardDiscount = 0;

//     if (query.giftCardCode && query.giftCardPin) {
//         const giftCard = await GiftCard.findOne({
//             code: query.giftCardCode.trim(),
//             pin: query.giftCardPin.trim(),
//         });

//         if (!giftCard) {
//             giftCardApplied = { status: "Invalid", message: "❌ Invalid gift card code or PIN" };
//         } else if (giftCard.expiryDate < new Date()) {
//             giftCardApplied = { status: "Invalid", message: "⏰ Gift card has expired" };
//         } else if (giftCard.balance <= 0) {
//             giftCardApplied = { status: "Invalid", message: "⚠️ Gift card has no balance left" };
//         } else {
//             const amountRequested = Number(query.giftCardAmount);
//             const payableBeforeGC = Math.max(0, summary.payable - discountFromCoupon - pointsDiscount);

//             if (!amountRequested || amountRequested <= 0) {
//                 giftCardApplied = { status: "Invalid", message: "⚠️ Enter valid amount to redeem" };
//             } else if (amountRequested > giftCard.balance) {
//                 giftCardApplied = {
//                     status: "Invalid",
//                     message: `⚠️ Insufficient balance. Your card has only ₹${giftCard.balance} left`,
//                 };
//             } else if (amountRequested > payableBeforeGC) {
//                 giftCardApplied = {
//                     status: "Invalid",
//                     message: `⚠️ You tried to apply ₹${amountRequested}, but payable amount is only ₹${payableBeforeGC}`,
//                 };
//             } else {
//                 giftCardDiscount = amountRequested;
//                 giftCardApplied = {
//                     status: "Applied",
//                     code: giftCard.code,
//                     appliedAmount: giftCardDiscount,
//                     remainingBalance: giftCard.balance - giftCardDiscount,
//                     message: `🎉 Successfully applied ₹${giftCardDiscount} from your gift card!`,
//                 };
//             }
//         }
//     }

//     /* ---------- Final Totals ---------- */
//     const round2 = (n) => Math.round(n * 100) / 100;
//     const grandTotal = round2(
//         Math.max(0, summary.payable - discountFromCoupon - pointsDiscount - giftCardDiscount)
//     );

//     return {
//         cart: items,
//         priceDetails: {
//             bagMrp: round2(summary.mrpTotal),
//             bagDiscount: round2(summary.savings),
//             autoDiscount: round2(summary.savings),
//             couponDiscount: round2(discountFromCoupon),
//             referralPointsDiscount: round2(pointsDiscount),
//             giftCardDiscount: round2(giftCardDiscount),
//             shipping: 0,
//             payable: grandTotal,
//         },
//         appliedCoupon,
//         appliedPromotions,
//         applicableCoupons,
//         inapplicableCoupons,
//         pointsUsed,
//         pointsDiscount,
//         pointsMessage,
//         giftCardApplied,
//         grandTotal,
//     };
// };

export const calculateCartSummary = async (user, query = {}) => {
    const validCartItems = (user.cart || []).filter((item) => item.product);
    if (!validCartItems.length) throw new Error("Cart is empty");

    // Prepare items for promotions
    const itemsInput = validCartItems.map((i) => ({
        productId: String(i.product._id),
        qty: i.quantity,
        selectedVariant: i.selectedVariant || null,
    }));

    const promoResult = await applyPromotions(itemsInput, {
        userContext: { isNewUser: user.isNewUser },
    });

    const { items: promoItems, summary, appliedPromotions } = promoResult;

    // ---------------- Coupons ----------------
    const allDiscountDocs = await Discount.find({ status: "Active" }).lean();
    const nonPromoItemsInput = promoItems
        .filter((i) => !i.discounts || i.discounts.length === 0)
        .map((i) => ({ productId: i.productId, qty: i.qty }));

    const couponsChecked = await Promise.all(
        allDiscountDocs.map(async (d) => {
            try {
                if (!nonPromoItemsInput.length) throw new Error("No items");
                await validateDiscountForCartInternal({
                    code: d.code,
                    cart: nonPromoItemsInput,
                    userId: user._id,
                });
                return {
                    code: d.code,
                    label: d.name,
                    type: d.type,
                    value: d.value,
                    status: "Applicable",
                    message: `Apply code ${d.code} and save ${d.type === "Percentage" ? d.value + "%" : "₹" + d.value
                        } on non-promotional items`,
                };
            } catch {
                return {
                    code: d.code,
                    label: d.name,
                    type: d.type,
                    value: d.value,
                    status: "Not applicable",
                    message: "Not valid for current cart",
                };
            }
        })
    );

    const applicableCoupons = couponsChecked.filter((c) => c.status === "Applicable");
    const inapplicableCoupons = couponsChecked.filter((c) => c.status !== "Applicable");

    let appliedCoupon = null;
    let discountFromCoupon = 0;

    if (query.discount && nonPromoItemsInput.length) {
        try {
            const result = await validateDiscountForCartInternal({
                code: query.discount.trim(),
                cart: nonPromoItemsInput,
                userId: user._id,
            });
            const COUPON_MAX_CAP = result.discount.maxCap || 500;
            discountFromCoupon = Math.min(result.priced.discountAmount, COUPON_MAX_CAP);
            appliedCoupon = { code: result.discount.code, discount: discountFromCoupon };
        } catch {
            appliedCoupon = null;
            discountFromCoupon = 0;
        }
    }

    // ---------------- Referral Points ----------------
    const wallet = await getOrCreateWallet(user._id);
    let pointsUsed = 0;
    let pointsDiscount = 0;
    let pointsMessage = "";
    if (query.pointsToUse) {
        pointsUsed = Math.min(Number(query.pointsToUse), wallet.rewardPoints);
        pointsDiscount = pointsUsed * 0.1;
        pointsMessage = pointsUsed
            ? `🎉 You used ${pointsUsed} points from your wallet! Discount applied: ₹${pointsDiscount}`
            : "";
    }

    // ---------------- Gift Card ----------------
    let giftCardApplied = null;
    let giftCardDiscount = 0;

    if (query.giftCardCode && query.giftCardPin) {
        const giftCard = await GiftCard.findOne({
            code: query.giftCardCode.trim(),
            pin: query.giftCardPin.trim(),
        });

        if (!giftCard || giftCard.expiryDate < new Date() || giftCard.balance <= 0) {
            giftCardApplied = { status: "Invalid", message: "❌ Gift card not valid" };
        } else {
            const requested = Number(query.giftCardAmount || 0);
            const maxRedeemable = Math.min(
                requested,
                giftCard.balance,
                summary.payable - discountFromCoupon - pointsDiscount
            );
            giftCardDiscount = maxRedeemable;
            giftCardApplied = {
                status: "Applied",
                code: giftCard.code,
                appliedAmount: giftCardDiscount,
                remainingBalance: giftCard.balance - giftCardDiscount,
                message: `🎉 Successfully applied ₹${giftCardDiscount} from your gift card!`,
            };
        }
    }

    // ---------------- Final Cart Items (Variant-based) ----------------
    const round2 = (n) => Math.round(n * 100) / 100;

    const finalCart = validCartItems.map((item) => {
        const productDoc = item.product;
        const variant = productDoc.variants?.find((v) => v.sku === item.selectedVariant?.sku);

        const originalPrice = variant?.originalPrice || productDoc.price || 0;
        const discountedPrice = variant?.discountedPrice || originalPrice;
        const discountPercent =
            originalPrice > discountedPrice
                ? `${Math.round(((originalPrice - discountedPrice) / originalPrice) * 100)}% off`
                : null;

        return {
            _id: item._id,
            product: productDoc._id,
            name: variant?.shadeName ? `${productDoc.name} - ${variant.shadeName}` : productDoc.name,
            quantity: item.quantity,
            variant: {
                sku: variant?.sku,
                shadeName: variant?.shadeName,
                hex: variant?.hex,
                image: variant?.images?.[0] || productDoc.images?.[0],
                stock: variant?.stock,
                originalPrice,
                discountedPrice,
                discountPercent,
            },
        };
    });

    // ---------------- Price Calculations ----------------
    const bagMrp = round2(
        finalCart.reduce((sum, item) => sum + (item.variant.originalPrice || 0) * item.quantity, 0)
    );
    const bagPayable = round2(
        finalCart.reduce((sum, item) => sum + (item.variant.discountedPrice || 0) * item.quantity, 0)
    );
    const totalSavings = round2(
        bagMrp - bagPayable + discountFromCoupon + pointsDiscount + giftCardDiscount
    );

    // ---------------- Shipping ----------------
    const SHIPPING_FEE = 70;
    let shipping = SHIPPING_FEE;
    let shippingDiscount = 0;
    let shippingMessage = "";

    if (bagPayable >= 499) {
        shippingDiscount = SHIPPING_FEE;
        shipping = 0;
        shippingMessage = `🎉 Yay! You’ve unlocked Free Shipping and saved ₹${SHIPPING_FEE}.`;
    }

    const grandTotal = round2(bagPayable - discountFromCoupon - pointsDiscount - giftCardDiscount + shipping);

    return {
        cart: finalCart,
        priceDetails: {
            bagMrp,
            totalSavings,
            bagDiscount: round2(bagMrp - bagPayable),
            autoDiscount: round2(bagMrp - bagPayable),
            couponDiscount: round2(discountFromCoupon),
            referralPointsDiscount: round2(pointsDiscount),
            giftCardDiscount: round2(giftCardDiscount),
            shippingFee: SHIPPING_FEE,
            shippingDiscount,
            shipping,
            payable: grandTotal,
            shippingMessage,
            savingsMessage: totalSavings > 0 ? `🎉 You saved ₹${totalSavings} on this order!` : "",
        },
        appliedCoupon,
        appliedPromotions,
        applicableCoupons,
        inapplicableCoupons,
        pointsUsed,
        pointsDiscount,
        pointsMessage,
        giftCardApplied,
        grandTotal,
    };
};