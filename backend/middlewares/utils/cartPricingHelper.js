// helpers/cartCalculator.js
import Discount from "../../models/Discount.js";
import GiftCard from "../../models/GiftCard.js";
import { validateDiscountForCartInternal } from "../../controllers/user/userDiscountController.js";
import { applyPromotions } from "../../middlewares/services/promotionEngine.js";
import { getOrCreateWallet } from "../../middlewares/utils/walletHelpers.js";
import Promotion from "../../models/Promotion.js";
import { calculateVariantPrices } from "../../middlewares/services/promotionHelper.js";

// export const calculateCartSummary = async (user, query = {}) => {
//     const validCartItems = (user.cart || []).filter((item) => item.product);
//     if (!validCartItems.length) throw new Error("Cart is empty");

//     const itemsInput = validCartItems.map((i) => ({
//         productId: String(i.product._id),
//         qty: i.quantity,
//         selectedVariant: i.selectedVariant || null,
//     }));

//     const promoResult = await applyPromotions(itemsInput, {
//         userContext: { isNewUser: user.isNewUser },
//     });

//     const { items: promoItems, summary, appliedPromotions } = promoResult;

//     const allDiscountDocs = await Discount.find({ status: "Active" }).lean();
//     const nonPromoItemsInput = promoItems
//         .filter((i) => !i.discounts || i.discounts.length === 0)
//         .map((i) => ({ productId: i.productId, qty: i.qty }));

//     const couponsChecked = await Promise.all(
//         allDiscountDocs.map(async (d) => {
//             try {
//                 if (!nonPromoItemsInput.length) throw new Error("No items");
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
//             appliedCoupon = { code: result.discount.code, discount: discountFromCoupon };
//         } catch {
//             appliedCoupon = null;
//             discountFromCoupon = 0;
//         }
//     }

//     const wallet = await getOrCreateWallet(user._id);
//     let pointsUsed = 0;
//     let pointsDiscount = 0;
//     let pointsMessage = "";
//     if (query.pointsToUse) {
//         pointsUsed = Math.min(Number(query.pointsToUse), wallet.rewardPoints);
//         pointsDiscount = pointsUsed * 0.1;
//         pointsMessage = pointsUsed
//             ? `🎉 You used ${pointsUsed} points from your wallet! Discount applied: ₹${pointsDiscount}`
//             : "";
//     }

//     let giftCardApplied = null;
//     let giftCardDiscount = 0;

//     if (query.giftCardCode && query.giftCardPin) {
//         const giftCard = await GiftCard.findOne({
//             code: query.giftCardCode.trim(),
//             pin: query.giftCardPin.trim(),
//         });

//         if (!giftCard || giftCard.expiryDate < new Date() || giftCard.balance <= 0) {
//             giftCardApplied = { status: "Invalid", message: "❌ Gift card not valid" };
//         } else {
//             const requested = Number(query.giftCardAmount || 0);
//             const maxRedeemable = Math.min(
//                 requested,
//                 giftCard.balance,
//                 summary.payable - discountFromCoupon - pointsDiscount
//             );
//             giftCardDiscount = maxRedeemable;
//             giftCardApplied = {
//                 status: "Applied",
//                 code: giftCard.code,
//                 appliedAmount: giftCardDiscount,
//                 remainingBalance: giftCard.balance - giftCardDiscount,
//                 message: `🎉 Successfully applied ₹${giftCardDiscount} from your gift card!`,
//             };
//         }
//     }

//     const round2 = (n) => Math.round(n * 100) / 100;

//     const finalCart = validCartItems.map((item) => {
//         const productDoc = item.product;
//         const variant = productDoc.variants?.find((v) => v.sku === item.selectedVariant?.sku);

//         const originalPrice = variant?.originalPrice || productDoc.price || 0;
//         const discountedPrice = variant?.discountedPrice || originalPrice;
//         const discountPercent =
//             originalPrice > discountedPrice
//                 ? `${Math.round(((originalPrice - discountedPrice) / originalPrice) * 100)}% off`
//                 : null;

//         return {
//             _id: item._id,
//             product: productDoc._id,
//             name: variant?.shadeName ? `${productDoc.name} - ${variant.shadeName}` : productDoc.name,
//             quantity: item.quantity,
//             variant: {
//                 sku: variant?.sku,
//                 shadeName: variant?.shadeName,
//                 hex: variant?.hex,
//                 image: variant?.images?.[0] || productDoc.images?.[0],
//                 stock: variant?.stock,
//                 originalPrice,
//                 discountedPrice,
//                 discountPercent,
//             },
//         };
//     });

//     const bagMrp = round2(
//         finalCart.reduce((sum, item) => sum + (item.variant.originalPrice || 0) * item.quantity, 0)
//     );
//     const bagPayable = round2(
//         finalCart.reduce((sum, item) => sum + (item.variant.discountedPrice || 0) * item.quantity, 0)
//     );

//     const totalSavings = round2(
//         bagMrp - bagPayable + discountFromCoupon + pointsDiscount + giftCardDiscount
//     );

//     // const SHIPPING_FEE = 70;
//     // let shipping = SHIPPING_FEE;
//     // let shippingDiscount = 0;
//     // let shippingMessage = "";
//     // if (bagPayable >= 499) {
//     //   shippingDiscount = SHIPPING_FEE;
//     //   shipping = 0;
//     //   shippingMessage = `🎉 Yay! You’ve unlocked Free Shipping and saved ₹${SHIPPING_FEE}.`;
//     // }

//     const grandTotal = round2(bagPayable - discountFromCoupon - pointsDiscount - giftCardDiscount /* + shipping */);

//     return {
//         cart: finalCart,
//         priceDetails: {
//             bagMrp,
//             totalSavings,
//             bagDiscount: round2(bagMrp - bagPayable),
//             autoDiscount: round2(bagMrp - bagPayable),
//             couponDiscount: round2(discountFromCoupon),
//             referralPointsDiscount: round2(pointsDiscount),
//             giftCardDiscount: round2(giftCardDiscount),
//             // shippingFee: SHIPPING_FEE,
//             // shippingDiscount,
//             // shipping,
//             payable: grandTotal,
//             // shippingMessage,
//             savingsMessage: totalSavings > 0 ? `🎉 You saved ₹${totalSavings} on this order!` : "",
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
    const validCartItems = (user.cart || []).filter(item => item.product);
    if (!validCartItems.length) throw new Error("Cart is empty");

    const itemsInput = validCartItems.map(i => ({
        productId: String(i.product._id),
        qty: i.quantity,
        selectedVariant: i.selectedVariant || null,
    }));

    const promoResult = await applyPromotions(itemsInput, { userContext: { isNewUser: user.isNewUser } });
    const { items: promoItems, summary, appliedPromotions } = promoResult;

    const allDiscountDocs = await Discount.find({ status: "Active" }).lean();
    const nonPromoItemsInput = promoItems.filter(i => !i.discounts?.length)
        .map(i => ({ productId: i.productId, qty: i.qty }));

    const couponsChecked = await Promise.all(allDiscountDocs.map(async (d) => {
        try {
            if (!nonPromoItemsInput.length) throw new Error("No items");
            await validateDiscountForCartInternal({ code: d.code, cart: nonPromoItemsInput, userId: user._id });
            return { code: d.code, label: d.name, type: d.type, value: d.value, status: "Applicable", message: `Apply code ${d.code} and save ${d.type === "Percentage" ? d.value + "%" : "₹" + d.value}` };
        } catch {
            return { code: d.code, label: d.name, type: d.type, value: d.value, status: "Not applicable", message: "Not valid for current cart" };
        }
    }));

    const applicableCoupons = couponsChecked.filter(c => c.status === "Applicable");
    const inapplicableCoupons = couponsChecked.filter(c => c.status !== "Applicable");

    let appliedCoupon = null, discountFromCoupon = 0;
    if (query.discount && nonPromoItemsInput.length) {
        try {
            const result = await validateDiscountForCartInternal({ code: query.discount.trim(), cart: nonPromoItemsInput, userId: user._id });
            const COUPON_MAX_CAP = result.discount.maxCap || 500;
            discountFromCoupon = Math.min(result.priced.discountAmount, COUPON_MAX_CAP);
            appliedCoupon = { code: result.discount.code, discount: discountFromCoupon };
        } catch { appliedCoupon = null; discountFromCoupon = 0; }
    }

    const wallet = await getOrCreateWallet(user._id);
    let pointsUsed = 0, pointsDiscount = 0, pointsMessage = "";
    if (query.pointsToUse) {
        pointsUsed = Math.min(Number(query.pointsToUse), wallet.rewardPoints);
        pointsDiscount = pointsUsed * 0.1;
        pointsMessage = pointsUsed ? `🎉 You used ${pointsUsed} points from your wallet! Discount applied: ₹${pointsDiscount}` : "";
    }

    let giftCardApplied = null, giftCardDiscount = 0;
    if (query.giftCardCode && query.giftCardPin) {
        const giftCard = await GiftCard.findOne({ code: query.giftCardCode.trim(), pin: query.giftCardPin.trim() });
        if (giftCard && giftCard.expiryDate >= new Date() && giftCard.balance > 0) {
            const requested = Number(query.giftCardAmount || 0);
            const maxRedeemable = Math.min(requested, giftCard.balance, summary.payable - discountFromCoupon - pointsDiscount);
            giftCardDiscount = maxRedeemable;
            giftCardApplied = {
                status: "Applied",
                code: giftCard.code,
                appliedAmount: giftCardDiscount,
                remainingBalance: giftCard.balance - giftCardDiscount,
                message: `🎉 Successfully applied ₹${giftCardDiscount} from your gift card!`,
            };
        } else {
            giftCardApplied = { status: "Invalid", message: "❌ Gift card not valid" };
        }
    }

    const round2 = n => Math.round(n * 100) / 100;
    const now = new Date();
    const activePromotions = await Promotion.find({ status: "active", startDate: { $lte: now }, endDate: { $gte: now } }).lean();

    const finalCart = validCartItems.map(item => {
        const productDoc = item.product;
        let enrichedVariant;

        if (item.selectedVariant) {
            const calcVariant = calculateVariantPrices([item.selectedVariant], productDoc, activePromotions)[0];
            const variantFromProduct = productDoc.variants.find(v => v.sku === item.selectedVariant.sku);
            enrichedVariant = {
                ...calcVariant,
                images: (variantFromProduct?.images?.length ? variantFromProduct.images : productDoc.images) || []
            };
        } else {
            enrichedVariant = calculateVariantPrices([getPseudoVariant(productDoc)], productDoc, activePromotions)[0];
            enrichedVariant.images = enrichedVariant.images || productDoc.images || [];
        }

        return {
            _id: item._id,
            product: productDoc._id,
            name: enrichedVariant?.shadeName ? `${productDoc.name} - ${enrichedVariant.shadeName}` : productDoc.name,
            quantity: item.quantity,
            variant: {
                sku: enrichedVariant?.sku,
                shadeName: enrichedVariant?.shadeName || productDoc.variant || null,
                hex: enrichedVariant?.hex || null,
                image: enrichedVariant.images[0] || null,
                stock: enrichedVariant?.stock,
                originalPrice: enrichedVariant?.originalPrice,
                discountedPrice: enrichedVariant?.displayPrice,
                displayPrice: enrichedVariant?.displayPrice,
                discountPercent: enrichedVariant?.discountPercent,
                discountAmount: enrichedVariant?.discountAmount,
            },
        };
    });

    const bagMrp = round2(finalCart.reduce((sum, item) => sum + (item.variant.originalPrice || 0) * item.quantity, 0));
    const bagPayable = round2(finalCart.reduce((sum, item) => sum + (item.variant.displayPrice || 0) * item.quantity, 0));
    const totalSavings = round2(bagMrp - bagPayable + discountFromCoupon + pointsDiscount + giftCardDiscount);

    // Shipping
    const FREE_SHIPPING_THRESHOLD = 499;
    const SHIPPING_CHARGE = 70;
    let shippingCharge = 0, shippingMessage = "";
    let grandTotal = round2(bagPayable - discountFromCoupon - pointsDiscount - giftCardDiscount);

    if (grandTotal >= FREE_SHIPPING_THRESHOLD) {
        shippingCharge = 0;
        shippingMessage = "🎉 Hurray! You get FREE shipping on your order!";
    } else {
        shippingCharge = SHIPPING_CHARGE;
        const amountToFree = round2(FREE_SHIPPING_THRESHOLD - grandTotal);
        shippingMessage = `📦 Add just ₹${amountToFree} more to your order to enjoy FREE shipping!`;
        grandTotal += SHIPPING_CHARGE;
    }

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
            shippingCharge: round2(shippingCharge),
            shippingMessage,
            payable: grandTotal,
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
