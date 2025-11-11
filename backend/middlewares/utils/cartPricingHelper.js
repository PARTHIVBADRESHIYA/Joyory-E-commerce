// helpers/cartCalculator.js
import Discount from "../../models/Discount.js";
import GiftCard from "../../models/GiftCard.js";
import Product from "../../models/Product.js";
import { validateDiscountForCartInternal } from "../../controllers/user/userDiscountController.js";
import { applyPromotions } from "../../middlewares/services/promotionEngine.js";
import { getOrCreateWallet } from "../../middlewares/utils/walletHelpers.js";
import Promotion from "../../models/Promotion.js";
import { calculateVariantPrices } from "../../middlewares/services/promotionHelper.js";
import { enrichProductWithStockAndOptions } from "../../middlewares/services/productHelpers.js";

// export const calculateCartSummary = async (user, query = {}) => {
//   const validCartItems = (user.cart || []).filter(item => item.product);
//   if (!validCartItems.length) throw new Error("Cart is empty");

//   const itemsInput = validCartItems.map(i => ({
//     productId: String(i.product._id),
//     qty: i.quantity,
//     selectedVariant: i.selectedVariant || null,
//   }));

//   const promoResult = await applyPromotions(itemsInput, { userContext: { isNewUser: user.isNewUser } });
//   const { items: promoItems, summary, appliedPromotions } = promoResult;

//   const allDiscountDocs = await Discount.find({ status: "Active" }).lean();

//   const nonPromoItemsInput = promoItems.filter(i => !i.discounts?.length)
//     .map(i => ({
//       productId: i.productId,
//       qty: i.qty,
//       selectedVariant: i.selectedVariant || null,
//     }));

//   const couponsChecked = await Promise.all(allDiscountDocs.map(async (d) => {
//     try {
//       if (!nonPromoItemsInput.length) throw new Error("No items");
//       await validateDiscountForCartInternal({ code: d.code, cart: nonPromoItemsInput, userId: user._id });
//       return { code: d.code, label: d.name, type: d.type, value: d.value, status: "Applicable", message: `Apply code ${d.code} and save ${d.type === "Percentage" ? d.value + "%" : "₹" + d.value}` };
//     } catch {
//       return { code: d.code, label: d.name, type: d.type, value: d.value, status: "Not applicable", message: "Not valid for current cart" };
//     }
//   }));

//   const applicableCoupons = couponsChecked.filter(c => c.status === "Applicable");
//   const inapplicableCoupons = couponsChecked.filter(c => c.status !== "Applicable");

//   let appliedCoupon = null, discountFromCoupon = 0;
//   if (query.discount && nonPromoItemsInput.length) {
//     try {
//       const result = await validateDiscountForCartInternal({ code: query.discount.trim(), cart: nonPromoItemsInput, userId: user._id });
//       const COUPON_MAX_CAP = result.discount.maxCap || 500;
//       discountFromCoupon = Math.min(result.priced.discountAmount, COUPON_MAX_CAP);
//       appliedCoupon = { code: result.discount.code, discount: discountFromCoupon };
//     } catch { appliedCoupon = null; discountFromCoupon = 0; }
//   }

//   const wallet = await getOrCreateWallet(user._id);
//   let pointsUsed = 0, pointsDiscount = 0, pointsMessage = "";
//   if (query.pointsToUse) {
//     pointsUsed = Math.min(Number(query.pointsToUse), wallet.rewardPoints);
//     pointsDiscount = pointsUsed * 0.1;
//     pointsMessage = pointsUsed ? `🎉 You used ${pointsUsed} points from your wallet! Discount applied: ₹${pointsDiscount}` : "";
//   }

//   let giftCardApplied = null, giftCardDiscount = 0;
//   if (query.giftCardCode && query.giftCardPin) {
//     const giftCard = await GiftCard.findOne({ code: query.giftCardCode.trim(), pin: query.giftCardPin.trim() });
//     if (giftCard && giftCard.expiryDate >= new Date() && giftCard.balance > 0) {
//       const requested = Number(query.giftCardAmount || 0);
//       const maxRedeemable = Math.min(requested, giftCard.balance, summary.payable - discountFromCoupon - pointsDiscount);
//       giftCardDiscount = maxRedeemable;
//       giftCardApplied = {
//         status: "Applied",
//         code: giftCard.code,
//         appliedAmount: giftCardDiscount,
//         remainingBalance: giftCard.balance - giftCardDiscount,
//         message: `🎉 Successfully applied ₹${giftCardDiscount} from your gift card!`,
//       };
//     } else {
//       giftCardApplied = { status: "Invalid", message: "❌ Gift card not valid" };
//     }
//   }

//   const round2 = n => Math.round((n || 0) * 100) / 100;
//   const now = new Date();
//   const activePromotions = await Promotion.find({ status: "active", startDate: { $lte: now }, endDate: { $gte: now } }).lean();

//   // ✅ FIXED: Always recalc variant fresh from DB
//   const finalCart = await Promise.all(validCartItems.map(async item => {
//     const productFromDB = await Product.findById(item.product._id).lean();
//     if (!productFromDB) throw new Error(`Product not found: ${item.product._id}`);

//     const promoItem = promoItems.find(p => p.productId === String(productFromDB._id));

//     // ✅ Match variant by SKU OR ObjectId (like getCartSummary)
//     const matchedVariant =
//       (productFromDB.variants || []).find(v =>
//         String(v.sku).trim().toLowerCase() === String(item.selectedVariant?.sku || "").trim().toLowerCase()
//       ) ||
//       (productFromDB.variants || []).find(v =>
//         v._id?.toString() === item.selectedVariant?._id?.toString()
//       ) ||
//       null;

//     // ✅ Use correct variant for pricing
//     const calcVariant = matchedVariant
//       ? calculateVariantPrices([matchedVariant], productFromDB, activePromotions)[0]
//       : calculateVariantPrices([getPseudoVariant(productFromDB)], productFromDB, activePromotions)[0];

//     const enrichedVariant = {
//       ...calcVariant,
//       images:
//         Array.isArray(matchedVariant?.images) && matchedVariant.images.length
//           ? matchedVariant.images
//           : Array.isArray(calcVariant.images) && calcVariant.images.length
//             ? calcVariant.images
//             : Array.isArray(productFromDB.images) && productFromDB.images.length
//               ? productFromDB.images
//               : [],
//       shadeName: calcVariant?.shadeName || matchedVariant?.shadeName || null,
//       hex: calcVariant?.hex || matchedVariant?.hex || null,
//       sku: matchedVariant?.sku || calcVariant?.sku || null,
//     };

//     const displayPrice = item.isFreeItem ? 0 : enrichedVariant.displayPrice;

//     console.log("🧾 VARIANT DEBUG:", {
//       product: productFromDB.name,
//       selectedSku: item.selectedVariant?.sku,
//       matchedSku: matchedVariant?.sku,
//       usedPrice: displayPrice,
//       variantName: enrichedVariant.shadeName,
//     });

//     return {
//       _id: item._id,
//       product: productFromDB._id,
//       productSnapshot: { id: productFromDB._id, name: productFromDB.name },
//       name: item.isFreeItem
//         ? `${productFromDB.name} (Free Item)`
//         : enrichedVariant?.shadeName
//           ? `${productFromDB.name} - ${enrichedVariant.shadeName}`
//           : productFromDB.name,
//       quantity: item.quantity || 1,
//       variant: {
//         sku: enrichedVariant.sku,
//         shadeName: enrichedVariant.shadeName,
//         hex: enrichedVariant.hex,
//         image: enrichedVariant.images?.[0] || null,
//         stock: matchedVariant?.stock ?? 0,
//         originalPrice: item.isFreeItem ? 0 : enrichedVariant.originalPrice,
//         discountedPrice: displayPrice,
//         displayPrice,
//         discountPercent: item.isFreeItem ? 100 : enrichedVariant.discountPercent,
//         discountAmount: item.isFreeItem
//           ? enrichedVariant.originalPrice
//           : enrichedVariant.discountAmount,
//       },
//       isFreeItem: !!item.isFreeItem,
//       promoTag: item.promoTag || null,
//     };
//   }));

//   const bagMrp = round2(finalCart.reduce((sum, item) => sum + item.variant.originalPrice * item.quantity, 0));
//   const bagPayable = round2(finalCart.reduce((sum, item) => sum + item.variant.discountedPrice * item.quantity, 0));
//   const totalSavings = round2(bagMrp - bagPayable + discountFromCoupon + pointsDiscount + giftCardDiscount);
//   let grandTotal = round2(bagPayable - discountFromCoupon - pointsDiscount - giftCardDiscount);

//   const FREE_SHIPPING_THRESHOLD = 499;
//   const SHIPPING_CHARGE = 70;
//   let shippingCharge = 0, shippingMessage = "";

//   if (grandTotal >= FREE_SHIPPING_THRESHOLD) {
//     shippingCharge = 0;
//     shippingMessage = "🎉 Hurray! You get FREE shipping on your order!";
//   } else {
//     shippingCharge = SHIPPING_CHARGE;
//     const amountToFree = round2(FREE_SHIPPING_THRESHOLD - grandTotal);
//     shippingMessage = `📦 Add just ₹${amountToFree} more to your order to enjoy FREE shipping!`;
//     grandTotal += SHIPPING_CHARGE;
//   }

//   return {
//     cart: finalCart,
//     priceDetails: {
//       bagMrp,
//       totalSavings,
//       bagDiscount: round2(bagMrp - bagPayable),
//       autoDiscount: round2(bagMrp - bagPayable),
//       couponDiscount: round2(discountFromCoupon),
//       referralPointsDiscount: round2(pointsDiscount),
//       giftCardDiscount: round2(giftCardDiscount),
//       shippingCharge: round2(shippingCharge),
//       shippingMessage,
//       payable: grandTotal,
//       savingsMessage: totalSavings > 0 ? `🎉 You saved ₹${totalSavings} on this order!` : "",
//     },
//     appliedCoupon,
//     appliedPromotions,
//     applicableCoupons,
//     inapplicableCoupons,
//     pointsUsed,
//     pointsDiscount,
//     pointsMessage,
//     giftCardApplied,
//     grandTotal,
//   };
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
    .map(i => ({
      productId: i.productId,
      qty: i.qty,
      selectedVariant: i.selectedVariant || null,
    }));

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

  // ✅ Reward Points Logic (Same as getCartSummary)
  const wallet = await getOrCreateWallet(user._id);
  let pointsUsed = 0, pointsDiscount = 0, pointsMessage = "";

  if (query.pointsToUse) {
    const requestedPoints = Number(query.pointsToUse);

    // Rule: Points allowed only if cart >= 599 BEFORE points
    const payableBeforePoints = summary.payable - discountFromCoupon;

    if (payableBeforePoints < 599) {
      pointsMessage = "⚠️ Reward points can be used only on orders above ₹599.";
      pointsUsed = 0;
      pointsDiscount = 0;
    } else {
      pointsUsed = Math.min(requestedPoints, wallet.rewardPoints);
      pointsDiscount = pointsUsed * 0.1;
      pointsMessage = pointsUsed
        ? `🎉 You used ${pointsUsed} points! Discount ₹${pointsDiscount}`
        : "";
    }
  }
  // ✅ Gift Card Logic (Same as getCartSummary)
  let giftCardApplied = null, giftCardDiscount = 0;

  if (query.giftCardCode && query.giftCardPin) {
    const giftCard = await GiftCard.findOne({
      code: query.giftCardCode.trim(),
      pin: query.giftCardPin.trim()
    });

    if (!giftCard || giftCard.expiryDate < new Date() || giftCard.balance <= 0) {
      giftCardApplied = { status: "Invalid", message: "❌ Gift card not valid" };

    } else {
      // Rule: Gift card allowed only if cart >= 599 BEFORE GC usage
      const payableBeforeGC = summary.payable - discountFromCoupon - pointsDiscount;

      if (payableBeforeGC < 599) {
        giftCardApplied = {
          status: "Blocked",
          message: "⚠️ Gift cards can be used only on orders above ₹599."
        };
        giftCardDiscount = 0;

      } else {
        const requested = Number(query.giftCardAmount || 0);

        const maxRedeemable = Math.min(
          requested,
          giftCard.balance,
          payableBeforeGC
        );

        giftCardDiscount = maxRedeemable;
        giftCardApplied = {
          status: "Applied",
          code: giftCard.code,
          appliedAmount: giftCardDiscount,
          remainingBalance: giftCard.balance - giftCardDiscount,
          message: `🎉 Applied ₹${giftCardDiscount} from gift card`
        };
      }
    }
  }

  const round2 = n => Math.round((n || 0) * 100) / 100;
  const now = new Date();
  const activePromotions = await Promotion.find({ status: "active", startDate: { $lte: now }, endDate: { $gte: now } }).lean();

  // ✅ FIXED: Unified enrichment logic for promo pricing sync
  const finalCart = await Promise.all(validCartItems.map(async item => {
    const productFromDB = await Product.findById(item.product._id).lean();
    if (!productFromDB) throw new Error(`Product not found: ${item.product._id}`);

    const enriched = enrichProductWithStockAndOptions(productFromDB, activePromotions);
    const enrichedVariant =
      enriched.variants.find(v =>
        String(v.sku).trim().toLowerCase() === String(item.selectedVariant?.sku || "").trim().toLowerCase()
      ) || enriched.variants[0];

    const displayPrice = item.isFreeItem ? 0 : enrichedVariant.displayPrice;


    return {
      _id: item._id,
      product: productFromDB._id,
      productSnapshot: { id: productFromDB._id, name: productFromDB.name },
      name: item.isFreeItem
        ? `${productFromDB.name} (Free Item)`
        : enrichedVariant?.shadeName
          ? `${productFromDB.name} - ${enrichedVariant.shadeName}`
          : productFromDB.name,
      quantity: item.quantity || 1,
      variant: {
        sku: enrichedVariant.sku,
        shadeName: enrichedVariant.shadeName,
        hex: enrichedVariant.hex,
        image: enrichedVariant.images?.[0] || null,
        stock: enrichedVariant.stock ?? 0,
        originalPrice: item.isFreeItem ? 0 : enrichedVariant.originalPrice,
        discountedPrice: displayPrice,
        displayPrice,
        discountPercent: item.isFreeItem ? 100 : enrichedVariant.discountPercent,
        discountAmount: item.isFreeItem
          ? enrichedVariant.originalPrice
          : enrichedVariant.discountAmount,
      },
      isFreeItem: !!item.isFreeItem,
      promoTag: item.promoTag || null,
    };
  }));

  const bagMrp = round2(finalCart.reduce((sum, item) => sum + item.variant.originalPrice * item.quantity, 0));
  const bagPayable = round2(finalCart.reduce((sum, item) => sum + item.variant.discountedPrice * item.quantity, 0));
  const totalSavings = round2(bagMrp - bagPayable + discountFromCoupon + pointsDiscount + giftCardDiscount);
  let grandTotal = round2(bagPayable - discountFromCoupon - pointsDiscount - giftCardDiscount);

  const FREE_SHIPPING_THRESHOLD = 499;
  const SHIPPING_CHARGE = 70;
  let shippingCharge = 0, shippingMessage = "";

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