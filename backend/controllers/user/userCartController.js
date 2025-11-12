import User from "../../models/User.js";
import Discount from "../../models/Discount.js";
import {
  validateDiscountForCartInternal
} from "../../controllers/user/userDiscountController.js"; // import helpers
import Product from "../../models/Product.js";
import { getOrCreateWallet } from "../../middlewares/utils/walletHelpers.js";
import { applyPromotions } from "../../middlewares/services/promotionEngine.js";
import GiftCard from "../../models/GiftCard.js";
import { calculateVariantPrices } from "../../middlewares/services/promotionHelper.js";
import Promotion from "../../models/Promotion.js";
import { getPseudoVariant } from "../../middlewares/utils/recommendationService.js";
import { enrichProductWithStockAndOptions } from "../../middlewares/services/productHelpers.js";

export const getCart = async (req, res) => {
  const user = await User.findById(req.user._id).populate("cart.product");
  res.status(200).json({ cart: user.cart });
};

export const updateCartItem = async (req, res) => {
  const { productId, quantity, variantSku } = req.body;
  const user = await User.findById(req.user._id);

  const item = user.cart.find(
    p =>
      p.product.toString() === productId &&
      (!variantSku || p.selectedVariant?.sku === variantSku)
  );
  if (!item) return res.status(404).json({ message: "Product not in cart" });

  item.quantity = quantity;
  await user.save();

  res.status(200).json({ message: "✅ Cart updated", cart: user.cart });
};

export const removeFromCart = async (req, res) => {
  try {
    const { productId } = req.params;
    const { variantSku } = req.query; // ✅ read from query
    const user = await User.findById(req.user._id);

    if (!user) return res.status(404).json({ message: "User not found" });

    // Filter cart items
    const updatedCart = user.cart.filter(item => {
      // Keep items with different product
      if (String(item.product) !== String(productId)) return true;

      // If variantSku is provided, remove only that variant
      if (variantSku) return item.selectedVariant?.sku !== variantSku;

      // If no variantSku, remove all variants of the product
      return false;
    });

    // Save updated cart
    user.cart = updatedCart;
    await user.save();

    const removedMessage = variantSku
      ? `Variant ${variantSku} removed from cart`
      : `All variants of product removed from cart`;

    res.status(200).json({ message: removedMessage, cart: user.cart });
  } catch (err) {
    console.error("removeFromCart error:", err);
    res.status(500).json({ message: "Error removing from cart", error: err.message });
  }
};

export const mergeGuestCart = async (userId, guestCart = []) => {
  if (!guestCart.length) return;

  const user = await User.findById(userId);
  if (!user) return;

  for (const guestItem of guestCart) {
    const existing = user.cart.find(
      i => i.product.toString() === guestItem.product.toString() &&
        i.selectedVariant?.sku === guestItem.selectedVariant?.sku
    );

    if (existing) existing.quantity += guestItem.quantity;
    else user.cart.push(guestItem);
  }

  await user.save();
};

export const addToCart = async (req, res) => {
  try {
    const { productId, variants = [], quantity: qty = 1 } = req.body;
    const product = await Product.findById(productId);
    if (!product)
      return res.status(404).json({ success: false, message: "Product not found." });

    let cart;

    try {
      if (req.user?._id) {
        // Logged-in user flow
        const user = await User.findById(req.user._id);
        cart = await handleCart(user.cart, product, variants, qty);
        user.cart = cart;
        await user.save();
      } else {
        // Guest flow
        cart = await handleCart(req.session.guestCart, product, variants, qty);
        req.session.guestCart = cart;
        await new Promise((resolve, reject) => {
          req.session.save(err => (err ? reject(err) : resolve()));
        });
      }
    } catch (validationErr) {
      // 🧠 Known validation issue (like stock or variant error)
      return res.status(400).json({
        success: false,
        message: validationErr.message,
      });
    }

    res.status(200).json({
      success: true,
      message: "✅ Added to cart successfully!",
      cart,
    });
  } catch (err) {
    console.error("❌ addToCart server error:", err);
    res.status(500).json({
      success: false,
      message: "Oops! Something went wrong. Please try again later.",
    });
  }
};

// Helper to add/update cart items
async function handleCart(cart, product, variants, qty) {
  if (!Array.isArray(cart)) cart = [];

  // 🧩 CASE 1 — Non-variant product
  if (variants.length === 0) {
    const stock = Number(product.quantity ?? 0);

    if (stock <= 0) {
      throw new Error("This product is currently out of stock.");
    }

    if (qty > stock) {
      throw new Error(`Only ${stock} item(s) available in stock.`);
    }

    const existing = cart.find(
      item => item.product.toString() === product._id.toString() && !item.selectedVariant
    );

    if (existing) {
      if (existing.quantity + qty > stock) {
        const canAdd = Math.max(0, stock - existing.quantity);
        throw new Error(
          `You can only add ${canAdd} more item${canAdd !== 1 ? "s" : ""} for this product.`
        );
      }
      existing.quantity += qty;
    } else {
      cart.push({ product: product._id, quantity: qty, selectedVariant: null });
    }

    return cart;
  }

  // 🧩 CASE 2 — Variant product
  for (const { variantSku, quantity } of variants) {
    if (!quantity || quantity <= 0) continue;

    const variant = product.variants.find(v => v.sku === variantSku);
    if (!variant)
      throw new Error(`This product variant is no longer available.`);

    const stock = Number(variant.stock ?? 0);

    if (stock <= 0) {
      throw new Error(`${variant.shadeName || "This variant"} is out of stock.`);
    }

    // 🛑 Stock check — prevent adding beyond available
    if (quantity > stock) {
      throw new Error(
        `Only ${stock} item(s) available for ${variant.shadeName || variantSku}.`
      );
    }

    const existing = cart.find(
      item =>
        item.product.toString() === product._id.toString() &&
        item.selectedVariant?.sku === variantSku
    );

    if (existing) {
      if (existing.quantity >= stock) {
        // already at or above stock
        throw new Error(
          `Only ${stock} item${stock !== 1 ? "s" : ""} available for ${variant.shadeName || variantSku}.`
        );
      }

      if (existing.quantity + quantity > stock) {
        const canAdd = Math.max(0, stock - existing.quantity);
        throw new Error(
          `You can only add ${canAdd} more item${canAdd !== 1 ? "s" : ""} for ${variant.shadeName || variantSku}.`
        );
      }

      existing.quantity += quantity;
    }
    else {
      const selectedVariant = {
        sku: variant.sku,
        shadeName: variant.shadeName || null,
        hex: variant.hex || null,
        images: variant.images?.length ? variant.images : product.images || [],
        price: variant.price ?? product.price,
        discountedPrice: variant.discountedPrice ?? product.discountedPrice ?? product.price,
        stock,
      };

      cart.push({ product: product._id, quantity, selectedVariant });
    }
  }

  return cart;
}

// export const getCartSummary = async (req, res) => {
//   try {
//     let cartSource;
//     let isGuest = false;

//     // -------------------- Determine Cart Source --------------------
//     if (req.user && req.user._id) {
//       const user = await User.findById(req.user._id).populate("cart.product");
//       if (!user) return res.status(404).json({ message: "User not found" });
//       cartSource = user.cart.filter(item => item.product);
//     } else if (req.session.guestCart && req.session.guestCart.length) {
//       isGuest = true;
//       cartSource = req.session.guestCart;

//       const productIds = cartSource.map(i => i.product);
//       const products = await Product.find({ _id: { $in: productIds } }).lean();

//       cartSource = cartSource.map(item => {
//         const productDoc = products.find(p => p._id.toString() === item.product.toString());
//         return {
//           ...item,
//           product: productDoc || { _id: item.product },
//         };
//       });
//     } else {
//       return res.status(400).json({ message: "Cart is empty" });
//     }

//     const validCartItems = cartSource;
//     if (!validCartItems.length) return res.status(400).json({ message: "Cart is empty" });

//     // -------------------- Apply Promotions --------------------
//     const itemsInput = validCartItems.map(i => ({
//       productId: String(i.product?._id || i.product),
//       qty: i.quantity,
//       selectedVariant: i.selectedVariant || null,
//     }));

//     const promoResult = await applyPromotions(itemsInput, {
//       userContext: req.user ? { isNewUser: req.user.isNewUser } : {},
//     });
//     const { items: promoItems, summary, appliedPromotions } = promoResult;

//     // -------------------- Coupons --------------------
//     let applicableCoupons = [], inapplicableCoupons = [], appliedCoupon = null, discountFromCoupon = 0;
//     if (req.user && req.user._id) {
//       const allDiscountDocs = await Discount.find({ status: "Active" }).lean();
//       const nonPromoItemsInput = promoItems.filter(i => !i.discounts?.length).map(i => ({ productId: i.productId, qty: i.qty }));

//       const couponsChecked = await Promise.all(
//         allDiscountDocs.map(async d => {
//           try {
//             if (!nonPromoItemsInput.length) throw new Error("No items");
//             await validateDiscountForCartInternal({ code: d.code, cart: nonPromoItemsInput, userId: req.user._id });
//             return { code: d.code, label: d.name, type: d.type, value: d.value, status: "Applicable", message: `Apply code ${d.code}` };
//           } catch {
//             return { code: d.code, label: d.name, type: d.type, value: d.value, status: "Not applicable", message: "Not valid for current cart" };
//           }
//         })
//       );

//       applicableCoupons = couponsChecked.filter(c => c.status === "Applicable");
//       inapplicableCoupons = couponsChecked.filter(c => c.status !== "Applicable");

//       if (req.query.discount && nonPromoItemsInput.length) {
//         try {
//           const result = await validateDiscountForCartInternal({ code: req.query.discount.trim(), cart: nonPromoItemsInput, userId: req.user._id });
//           const COUPON_MAX_CAP = result.discount.maxCap || 500;
//           discountFromCoupon = Math.min(result.priced.discountAmount, COUPON_MAX_CAP);
//           appliedCoupon = { code: result.discount.code, discount: discountFromCoupon };
//         } catch {
//           appliedCoupon = null;
//           discountFromCoupon = 0;
//         }
//       }
//     }

//     // -------------------- Referral Points --------------------
//     let pointsUsed = 0, pointsDiscount = 0, pointsMessage = "";
//     if (req.user && req.user._id && req.query.pointsToUse) {
//       const wallet = await getOrCreateWallet(req.user._id);
//       pointsUsed = Math.min(Number(req.query.pointsToUse), wallet.rewardPoints);
//       pointsDiscount = pointsUsed * 0.1;
//       pointsMessage = pointsUsed ? `🎉 You used ${pointsUsed} points! Discount ₹${pointsDiscount}` : "";
//     }

//     // -------------------- Gift Card --------------------
//     let giftCardApplied = null, giftCardDiscount = 0;
//     if (req.query.giftCardCode && req.query.giftCardPin) {
//       const giftCard = await GiftCard.findOne({ code: req.query.giftCardCode.trim(), pin: req.query.giftCardPin.trim() });
//       if (!giftCard || giftCard.expiryDate < new Date() || giftCard.balance <= 0) {
//         giftCardApplied = { status: "Invalid", message: "❌ Gift card not valid" };
//       } else {
//         const requested = Number(req.query.giftCardAmount || 0);
//         const maxRedeemable = Math.min(requested, giftCard.balance, summary.payable - discountFromCoupon - pointsDiscount);
//         giftCardDiscount = maxRedeemable;
//         giftCardApplied = { status: "Applied", code: giftCard.code, appliedAmount: giftCardDiscount, remainingBalance: giftCard.balance - giftCardDiscount, message: `🎉 Applied ₹${giftCardDiscount} from gift card` };
//       }
//     }

//     // -------------------- Final Cart Build --------------------
//     const round2 = n => Math.round(n * 100) / 100;
//     const now = new Date();
//     const activePromotions = await Promotion.find({ status: "active", startDate: { $lte: now }, endDate: { $gte: now } }).lean();

//     // ✅ FIXED: Unified enrichment logic for promo pricing sync
//     const finalCart = await Promise.all(validCartItems.map(async item => {
//       const productFromDB = await Product.findById(item.product._id).lean();
//       if (!productFromDB) throw new Error(`Product not found: ${item.product._id}`);

//       const enriched = enrichProductWithStockAndOptions(productFromDB, activePromotions);
//       const enrichedVariant =
//         enriched.variants.find(v =>
//           String(v.sku).trim().toLowerCase() === String(item.selectedVariant?.sku || "").trim().toLowerCase()
//         ) || enriched.variants[0];

//       const displayPrice = enrichedVariant.displayPrice;


//       return {
//         _id: item._id,
//         product: productFromDB._id,
//         name: item.isFreeItem
//           ? `${productFromDB.name} (Free Item)`
//           : enrichedVariant?.shadeName
//             ? `${productFromDB.name} - ${enrichedVariant.shadeName}`
//             : productFromDB.name,
//         quantity: item.quantity || 1,
//         variant: {
//           sku: enrichedVariant.sku,
//           shadeName: enrichedVariant.shadeName,
//           hex: enrichedVariant.hex,
//           image: enrichedVariant.images?.[0] || null,
//           stock: enrichedVariant.stock ?? 0,
//           originalPrice: item.isFreeItem ? 0 : enrichedVariant.originalPrice,
//           discountedPrice: displayPrice,
//           displayPrice,
//           discountPercent: item.isFreeItem ? 100 : enrichedVariant.discountPercent,
//           discountAmount: item.isFreeItem
//             ? enrichedVariant.originalPrice
//             : enrichedVariant.discountAmount,
//         }
//       };
//     }));

//     // -------------------- Price Calculations --------------------
//     const bagMrp = round2(finalCart.reduce((sum, i) => sum + (i.variant.originalPrice || 0) * i.quantity, 0));
//     const bagPayable = round2(finalCart.reduce((sum, i) => sum + (i.variant.displayPrice || 0) * i.quantity, 0));
//     const totalSavings = round2(bagMrp - bagPayable + discountFromCoupon + pointsDiscount + giftCardDiscount);
//     let grandTotal = round2(bagPayable - discountFromCoupon - pointsDiscount - giftCardDiscount);

//     // -------------------- Shipping --------------------
//     const SHIPPING_CHARGE = 70;
//     const FREE_SHIPPING_THRESHOLD = 499;
//     let shippingCharge = 0, shippingMessage = "";

//     if (summary.freeShipping) {
//       shippingCharge = 0;
//       shippingMessage = "🚚 Free shipping via promotion!";
//     } else if (grandTotal >= FREE_SHIPPING_THRESHOLD) {
//       shippingCharge = 0;
//       shippingMessage = "🎉 Free shipping on your order!";
//     } else {
//       shippingCharge = SHIPPING_CHARGE;
//       const amountToFree = round2(FREE_SHIPPING_THRESHOLD - grandTotal);
//       shippingMessage = `📦 Add ₹${amountToFree} more for free shipping!`;
//       grandTotal += SHIPPING_CHARGE;
//     }

//     // -------------------- Response --------------------
//     res.json({
//       cart: finalCart,
//       priceDetails: {
//         bagMrp,
//         totalSavings,
//         bagDiscount: round2(bagMrp - bagPayable),
//         autoDiscount: round2(bagMrp - bagPayable),
//         couponDiscount: round2(discountFromCoupon),
//         referralPointsDiscount: round2(pointsDiscount),
//         giftCardDiscount: round2(giftCardDiscount),
//         shippingCharge: round2(shippingCharge),
//         shippingMessage,
//         payable: grandTotal,
//         promoFreeShipping: !!summary.freeShipping,
//         savingsMessage: totalSavings > 0 ? `🎉 You saved ₹${totalSavings} on this order!` : "",
//       },
//       appliedCoupon,
//       appliedPromotions,
//       applicableCoupons,
//       inapplicableCoupons,
//       pointsUsed,
//       pointsDiscount,
//       pointsMessage,
//       giftCardApplied,
//       grandTotal,
//       isGuest,
//     });
//   } catch (error) {
//     console.error("❌ getCartSummary error:", error);
//     res.status(500).json({ message: "Failed to get cart summary", error: error.message });
//   }
// };


// export const getCartSummary = async (req, res) => {
//   try {
//     let cartSource;
//     let isGuest = false;

//     // -------------------- Determine Cart Source --------------------
//     if (req.user && req.user._id) {
//       console.log("👤 Logged-in user cart detected");
//       const user = await User.findById(req.user._id).populate("cart.product");
//       if (!user) return res.status(404).json({ message: "User not found" });
//       cartSource = user.cart.filter(item => item.product);
//     } else if (req.session.guestCart && req.session.guestCart.length) {
//       console.log("🧑‍🦰 Guest cart detected");
//       isGuest = true;
//       cartSource = req.session.guestCart;

//       const productIds = cartSource.map(i => i.product);
//       const products = await Product.find({ _id: { $in: productIds } }).lean();

//       cartSource = cartSource.map(item => {
//         const productDoc = products.find(p => p._id.toString() === item.product.toString());
//         return {
//           ...item,
//           product: productDoc || { _id: item.product },
//         };
//       });
//     } else {
//       return res.status(400).json({ message: "Cart is empty" });
//     }

//     const validCartItems = cartSource;
//     if (!validCartItems.length) return res.status(400).json({ message: "Cart is empty" });
//     console.log("✅ Cart items found:", validCartItems.length);

//     // -------------------- Apply Promotions --------------------
//     console.log("🎯 Applying promotions...");

//     const itemsInput = validCartItems.map(i => ({
//       productId: String(i.product?._id || i.product),
//       qty: i.quantity,
//       selectedVariant: i.selectedVariant || null,
//     }));

//     const promos = await Promotion.find({ status: "active" }).lean();
//     const promoResult = await applyPromotions(itemsInput, {
//       userContext: req.user ? { isNewUser: req.user.isNewUser } : {},
//     });

//     const { items: promoItems, summary, appliedPromotions } = promoResult;

//     // -------------------- 🔥 Auto-add BOGO / Freebie Items --------------------
//     const currentProductIds = new Set(validCartItems.map(i => String(i.product?._id || i.product)));
//     const freeProductAdds = [];

//     for (const promo of appliedPromotions) {
//       if (promo.type === "bogo" || promo.type === "freebie") {
//         console.log("🧠 Processing promo:", promo.campaignName);

//         const triggerProducts = [];
//         const freeProducts = [];

//         if (promo.products?.length) triggerProducts.push(...promo.products.map(p => String(p.product || p)));
//         if (promo.freeProducts?.length) freeProducts.push(...promo.freeProducts.map(p => String(p.product || p)));

//         if (promo.promotionConfig) {
//           if (promo.promotionConfig.triggerProductId)
//             triggerProducts.push(String(promo.promotionConfig.triggerProductId));
//           if (promo.promotionConfig.triggerProducts?.length)
//             triggerProducts.push(...promo.promotionConfig.triggerProducts.map(String));
//           if (promo.promotionConfig.freeProductId)
//             freeProducts.push(String(promo.promotionConfig.freeProductId));
//           if (promo.promotionConfig.freeProducts?.length)
//             freeProducts.push(...promo.promotionConfig.freeProducts.map(String));
//         }

//         const uniq = arr => [...new Set(arr)];
//         const triggers = uniq(triggerProducts);
//         const freebies = uniq(freeProducts);

//         console.log("🔍 PROMO MAP (normalized):", {
//           campaign: promo.campaignName,
//           triggerProducts: triggers,
//           freeProducts: freebies,
//           currentCart: [...currentProductIds],
//         });

//         if (!triggers.length || !freebies.length) continue;

//         const hasTrigger = triggers.some(id => currentProductIds.has(id));
//         if (!hasTrigger) continue;

//         for (const freeId of freebies) {
//           if (!currentProductIds.has(freeId)) {
//             const freeProduct = await Product.findById(freeId).lean();
//             if (!freeProduct) continue;
//             console.log(`🎁 Auto-added free product: ${freeProduct.name} from ${promo.campaignName}`);
//             freeProductAdds.push({
//               _id: new mongoose.Types.ObjectId(),
//               product: freeProduct,
//               quantity: 1,
//               selectedVariant: freeProduct.variants?.[0] || null,
//               isFreeItem: true,
//               promoTag: promo.campaignName,
//             });
//             currentProductIds.add(freeId);
//           }
//         }
//       }
//     }

//     // ✅ Merge freebies and persist
//     if (freeProductAdds.length) {
//       console.log("🧾 Freebies to add:", freeProductAdds.length);
//       validCartItems.push(...freeProductAdds);

//       if (req.user && req.user._id) {
//         await User.findByIdAndUpdate(req.user._id, {
//           $push: {
//             cart: {
//               $each: freeProductAdds.map(f => ({
//                 product: f.product._id,
//                 quantity: f.quantity,
//                 selectedVariant: f.selectedVariant,
//                 isFreeItem: true,
//                 promoTag: f.promoTag,
//               })),
//             },
//           },
//         });
//       } else if (req.session) {
//         req.session.guestCart = [
//           ...(req.session.guestCart || []),
//           ...freeProductAdds.map(f => ({
//             product: f.product._id,
//             quantity: f.quantity,
//             selectedVariant: f.selectedVariant,
//             isFreeItem: true,
//             promoTag: f.promoTag,
//           })),
//         ];
//         await new Promise((resolve, reject) => req.session.save(err => (err ? reject(err) : resolve())));
//       }
//     }

//     // -------------------- Coupons --------------------
//     let applicableCoupons = [];
//     let inapplicableCoupons = [];
//     let appliedCoupon = null;
//     let discountFromCoupon = 0;

//     if (req.user && req.user._id) {
//       const allDiscountDocs = await Discount.find({ status: "Active" }).lean();
//       const nonPromoItemsInput = promoItems
//         .filter(i => !i.discounts?.length)
//         .map(i => ({ productId: i.productId, qty: i.qty }));

//       const couponsChecked = await Promise.all(
//         allDiscountDocs.map(async d => {
//           try {
//             if (!nonPromoItemsInput.length) throw new Error("No items");
//             await validateDiscountForCartInternal({
//               code: d.code,
//               cart: nonPromoItemsInput,
//               userId: req.user._id,
//             });
//             return {
//               code: d.code,
//               label: d.name,
//               type: d.type,
//               value: d.value,
//               status: "Applicable",
//               message: `Apply code ${d.code} and save ${d.type === "Percentage" ? d.value + "%" : "₹" + d.value
//                 }`,
//             };
//           } catch {
//             return {
//               code: d.code,
//               label: d.name,
//               type: d.type,
//               value: d.value,
//               status: "Not applicable",
//               message: "Not valid for current cart",
//             };
//           }
//         })
//       );

//       applicableCoupons = couponsChecked.filter(c => c.status === "Applicable");
//       inapplicableCoupons = couponsChecked.filter(c => c.status !== "Applicable");

//       if (req.query.discount && nonPromoItemsInput.length) {
//         try {
//           const result = await validateDiscountForCartInternal({
//             code: req.query.discount.trim(),
//             cart: nonPromoItemsInput,
//             userId: req.user._id,
//           });
//           const COUPON_MAX_CAP = result.discount.maxCap || 500;
//           discountFromCoupon = Math.min(result.priced.discountAmount, COUPON_MAX_CAP);
//           appliedCoupon = { code: result.discount.code, discount: discountFromCoupon };
//         } catch {
//           appliedCoupon = null;
//           discountFromCoupon = 0;
//         }
//       }
//     }

//     // -------------------- Referral Points --------------------
//     let pointsUsed = 0,
//       pointsDiscount = 0,
//       pointsMessage = "";
//     if (req.user && req.user._id && req.query.pointsToUse) {
//       const wallet = await getOrCreateWallet(req.user._id);
//       pointsUsed = Math.min(Number(req.query.pointsToUse), wallet.rewardPoints);
//       pointsDiscount = pointsUsed * 0.1;
//       pointsMessage = pointsUsed
//         ? `🎉 You used ${pointsUsed} points! Discount ₹${pointsDiscount}`
//         : "";
//     }

//     // -------------------- Gift Card --------------------
//     let giftCardApplied = null,
//       giftCardDiscount = 0;
//     if (req.query.giftCardCode && req.query.giftCardPin) {
//       const giftCard = await GiftCard.findOne({
//         code: req.query.giftCardCode.trim(),
//         pin: req.query.giftCardPin.trim(),
//       });
//       if (!giftCard || giftCard.expiryDate < new Date() || giftCard.balance <= 0) {
//         giftCardApplied = { status: "Invalid", message: "❌ Gift card not valid" };
//       } else {
//         const requested = Number(req.query.giftCardAmount || 0);
//         const maxRedeemable = Math.min(
//           requested,
//           giftCard.balance,
//           summary.payable - discountFromCoupon - pointsDiscount
//         );
//         giftCardDiscount = maxRedeemable;
//         giftCardApplied = {
//           status: "Applied",
//           code: giftCard.code,
//           appliedAmount: giftCardDiscount,
//           remainingBalance: giftCard.balance - giftCardDiscount,
//           message: `🎉 Applied ₹${giftCardDiscount} from gift card`,
//         };
//       }
//     }

//     // -------------------- Final Cart Build --------------------
//     const round2 = n => Math.round(n * 100) / 100;
//     const now = new Date();
//     const activePromotions = await Promotion.find({
//       status: "active",
//       startDate: { $lte: now },
//       endDate: { $gte: now },
//     }).lean();

//     const finalCart = validCartItems.map(item => {
//       const productDoc = item.product?._id
//         ? item.product
//         : { _id: item.product, name: "Unknown Product", variants: [], images: [] };

//       // 🧩 Determine correct variant (from cart or first available)
//       const variantFromProduct = item.selectedVariant?.sku
//         ? productDoc.variants.find(v => v.sku === item.selectedVariant.sku)
//         : null;

//       // 🧮 Apply full enrichment but merge images + variant data
//       const enrichedVariantList = enrichProductWithStockAndOptions(productDoc, activePromotions).variants;
//       const calcVariant =
//         enrichedVariantList.find(v => v.sku === variantFromProduct?.sku) ||
//         enrichedVariantList[0] ||
//         variantFromProduct;

//       // ✅ Merge variant fields & image fallbacks
//       const enrichedVariant = {
//         ...calcVariant,
//         images:
//           Array.isArray(variantFromProduct?.images) && variantFromProduct.images.length
//             ? variantFromProduct.images
//             : Array.isArray(calcVariant?.images) && calcVariant.images.length
//               ? calcVariant.images
//               : Array.isArray(productDoc.images) && productDoc.images.length
//                 ? productDoc.images
//                 : [],
//         shadeName: calcVariant?.shadeName || variantFromProduct?.shadeName || null,
//         hex: calcVariant?.hex || variantFromProduct?.hex || null,
//         sku: variantFromProduct?.sku || calcVariant?.sku || null,
//       };

//       const displayPrice = item.isFreeItem ? 0 : enrichedVariant.displayPrice;

//       return {
//         _id: item._id,
//         product: productDoc._id,
//         name: item.isFreeItem
//           ? `${productDoc.name} (Free Item)`
//           : enrichedVariant?.shadeName
//             ? `${productDoc.name} - ${enrichedVariant.shadeName}`
//             : productDoc.name,
//         quantity: item.quantity,
//         variant: {
//           sku: enrichedVariant.sku,
//           shadeName: enrichedVariant.shadeName,
//           hex: enrichedVariant.hex,
//           image: enrichedVariant.images[0] || null,
//           stock: enrichedVariant.stock,
//           originalPrice: item.isFreeItem ? 0 : enrichedVariant.originalPrice,
//           discountedPrice: displayPrice,
//           displayPrice,
//           discountPercent: item.isFreeItem ? 100 : enrichedVariant.discountPercent,
//           discountAmount: item.isFreeItem
//             ? enrichedVariant.originalPrice
//             : enrichedVariant.discountAmount,
//         },
//         isFreeItem: !!item.isFreeItem,
//         promoTag: item.promoTag || null,
//       };
//     });


//     // -------------------- Price Calculations --------------------
//     const bagMrp = round2(
//       finalCart.reduce((sum, item) => sum + (item.variant.originalPrice || 0) * item.quantity, 0)
//     );
//     const bagPayable = round2(
//       finalCart.reduce((sum, item) => sum + (item.variant.displayPrice || 0) * item.quantity, 0)
//     );
//     const totalSavings = round2(
//       bagMrp - bagPayable + discountFromCoupon + pointsDiscount + giftCardDiscount
//     );
//     let grandTotal = round2(bagPayable - discountFromCoupon - pointsDiscount - giftCardDiscount);

//     // -------------------- Shipping --------------------
//     const SHIPPING_CHARGE = 70;
//     const FREE_SHIPPING_THRESHOLD = 499;
//     let shippingCharge = 0;
//     let shippingMessage = "";

//     if (summary.freeShipping) {
//       shippingCharge = 0;
//       shippingMessage = "🚚 Free shipping via promotion!";
//     } else if (grandTotal >= FREE_SHIPPING_THRESHOLD) {
//       shippingCharge = 0;
//       shippingMessage = "🎉 Free shipping on your order!";
//     } else {
//       shippingCharge = SHIPPING_CHARGE;
//       const amountToFree = round2(FREE_SHIPPING_THRESHOLD - grandTotal);
//       shippingMessage = `📦 Add ₹${amountToFree} more for free shipping!`;
//       grandTotal += SHIPPING_CHARGE;
//     }

//     // -------------------- Response --------------------
//     res.json({
//       cart: finalCart,
//       priceDetails: {
//         bagMrp,
//         totalSavings,
//         bagDiscount: round2(bagMrp - bagPayable),
//         autoDiscount: round2(bagMrp - bagPayable),
//         couponDiscount: round2(discountFromCoupon),
//         referralPointsDiscount: round2(pointsDiscount),
//         giftCardDiscount: round2(giftCardDiscount),
//         shippingCharge: round2(shippingCharge),
//         shippingMessage,
//         payable: grandTotal,
//         promoFreeShipping: !!summary.freeShipping,
//         savingsMessage:
//           totalSavings > 0 ? `🎉 You saved ₹${totalSavings} on this order!` : "",
//       },
//       appliedCoupon,
//       appliedPromotions,
//       applicableCoupons,
//       inapplicableCoupons,
//       pointsUsed,
//       pointsDiscount,
//       pointsMessage,
//       giftCardApplied,
//       grandTotal,
//       isGuest,
//     });
//   } catch (error) {
//     console.error("❌ getCartSummary error:", error);
//     res.status(500).json({
//       message: "Failed to get cart summary",
//       error: error.message,
//     });
//   }
// };

// export const getCartSummary = async (req, res) => {
//   try {

//     let cartSource;
//     let isGuest = false;

//     // -------------------- Determine Cart Source --------------------
//     if (req.user && req.user._id) {
//       console.log("👤 Logged-in user cart detected");
//       const user = await User.findById(req.user._id).populate("cart.product");
//       if (!user) return res.status(404).json({ message: "User not found" });
//       cartSource = user.cart.filter(item => item.product);
//     } else if (req.session.guestCart && req.session.guestCart.length) {
//       console.log("🧑‍🦰 Guest cart detected");
//       isGuest = true;
//       cartSource = req.session.guestCart;

//       const productIds = cartSource.map(i => i.product);
//       const products = await Product.find({ _id: { $in: productIds } }).lean();

//       cartSource = cartSource.map(item => {
//         const productDoc = products.find(p => p._id.toString() === item.product.toString());
//         return {
//           ...item,
//           product: productDoc || { _id: item.product },
//         };
//       });
//     } else {
//       return res.status(400).json({ message: "Cart is empty" });
//     }

//     const validCartItems = cartSource;
//     if (!validCartItems.length) return res.status(400).json({ message: "Cart is empty" });
//     console.log("✅ Cart items found:", validCartItems.length);

//     // -------------------- Apply Promotions --------------------
//     console.log("🎯 Applying promotions...");

//     const itemsInput = validCartItems.map(i => ({
//       productId: String(i.product?._id || i.product),
//       qty: i.quantity,
//       selectedVariant: i.selectedVariant || null,
//     }));

//     const promos = await Promotion.find({ status: "active" }).lean();

//     console.log("🧾 Promo check before applyPromotions:", promos.map(p => ({
//       name: p.campaignName,
//       trigger: p.promotionConfig?.triggerProductId,
//       free: p.promotionConfig?.freeProductId,
//     })));

//     const promoResult = await applyPromotions(itemsInput, {
//       userContext: req.user ? { isNewUser: req.user.isNewUser } : {},
//     });

//     const { items: promoItems, summary, appliedPromotions } = promoResult;
//     console.log("✅ Promotions applied:", appliedPromotions.map(p => p.campaignName));

//     // -------------------- 🔥 Auto-add BOGO / Freebie Items --------------------
//     const currentProductIds = new Set(validCartItems.map(i => String(i.product?._id || i.product)));
//     const freeProductAdds = [];

//     for (const promo of appliedPromotions) {
//       if (promo.type === "bogo" || promo.type === "freebie") {
//         console.log("🧠 Processing promo:", promo.campaignName);

//         const triggerProducts = [];
//         const freeProducts = [];

//         if (promo.products?.length) triggerProducts.push(...promo.products.map(p => String(p.product || p)));
//         if (promo.freeProducts?.length) freeProducts.push(...promo.freeProducts.map(p => String(p.product || p)));

//         if (promo.promotionConfig) {
//           if (promo.promotionConfig.triggerProductId)
//             triggerProducts.push(String(promo.promotionConfig.triggerProductId));
//           if (promo.promotionConfig.triggerProducts?.length)
//             triggerProducts.push(...promo.promotionConfig.triggerProducts.map(String));
//           if (promo.promotionConfig.freeProductId)
//             freeProducts.push(String(promo.promotionConfig.freeProductId));
//           if (promo.promotionConfig.freeProducts?.length)
//             freeProducts.push(...promo.promotionConfig.freeProducts.map(String));
//         }

//         const uniq = arr => [...new Set(arr)];
//         const triggers = uniq(triggerProducts);
//         const freebies = uniq(freeProducts);

//         console.log("🔍 PROMO MAP (normalized):", {
//           campaign: promo.campaignName,
//           triggerProducts: triggers,
//           freeProducts: freebies,
//           currentCart: [...currentProductIds],
//         });

//         if (!triggers.length || !freebies.length) continue;

//         const hasTrigger = triggers.some(id => currentProductIds.has(id));
//         if (!hasTrigger) continue;

//         for (const freeId of freebies) {
//           if (!currentProductIds.has(freeId)) {
//             const freeProduct = await Product.findById(freeId).lean();
//             if (!freeProduct) continue;
//             console.log(`🎁 Auto-added free product: ${freeProduct.name} from ${promo.campaignName}`);
//             freeProductAdds.push({
//               _id: new mongoose.Types.ObjectId(),
//               product: freeProduct,
//               quantity: 1,
//               selectedVariant: freeProduct.variants?.[0] || null,
//               isFreeItem: true,
//               promoTag: promo.campaignName,
//             });
//             currentProductIds.add(freeId);
//           }
//         }
//       }
//     }

//     // ✅ Merge freebies and persist
//     if (freeProductAdds.length) {
//       console.log("🧾 Freebies to add:", freeProductAdds.length);
//       validCartItems.push(...freeProductAdds);

//       if (req.user && req.user._id) {
//         await User.findByIdAndUpdate(req.user._id, {
//           $push: {
//             cart: {
//               $each: freeProductAdds.map(f => ({
//                 product: f.product._id,
//                 quantity: f.quantity,
//                 selectedVariant: f.selectedVariant,
//                 isFreeItem: true,
//                 promoTag: f.promoTag,
//               })),
//             },
//           },
//         });
//       } else if (req.session) {
//         req.session.guestCart = [
//           ...(req.session.guestCart || []),
//           ...freeProductAdds.map(f => ({
//             product: f.product._id,
//             quantity: f.quantity,
//             selectedVariant: f.selectedVariant,
//             isFreeItem: true,
//             promoTag: f.promoTag,
//           })),
//         ];
//         await new Promise((resolve, reject) => req.session.save(err => (err ? reject(err) : resolve())));
//       }
//     }

//     // -------------------- Coupons --------------------
//     let applicableCoupons = [];
//     let inapplicableCoupons = [];
//     let appliedCoupon = null;
//     let discountFromCoupon = 0;

//     if (req.user && req.user._id) {
//       console.log("🎟 Checking available coupons...");
//       const allDiscountDocs = await Discount.find({ status: "Active" }).lean();
//       const nonPromoItemsInput = promoItems
//         .filter(i => !i.discounts?.length)
//         .map(i => ({ productId: i.productId, qty: i.qty }));

//       const couponsChecked = await Promise.all(
//         allDiscountDocs.map(async d => {
//           try {
//             if (!nonPromoItemsInput.length) throw new Error("No items");
//             await validateDiscountForCartInternal({
//               code: d.code,
//               cart: nonPromoItemsInput,
//               userId: req.user._id,
//             });
//             return {
//               code: d.code,
//               label: d.name,
//               type: d.type,
//               value: d.value,
//               status: "Applicable",
//               message: `Apply code ${d.code} and save ${
//                 d.type === "Percentage" ? d.value + "%" : "₹" + d.value
//               }`,
//             };
//           } catch {
//             return {
//               code: d.code,
//               label: d.name,
//               type: d.type,
//               value: d.value,
//               status: "Not applicable",
//               message: "Not valid for current cart",
//             };
//           }
//         })
//       );

//       applicableCoupons = couponsChecked.filter(c => c.status === "Applicable");
//       inapplicableCoupons = couponsChecked.filter(c => c.status !== "Applicable");

//       if (req.query.discount && nonPromoItemsInput.length) {
//         console.log("🎯 Applying coupon:", req.query.discount);
//         try {
//           const result = await validateDiscountForCartInternal({
//             code: req.query.discount.trim(),
//             cart: nonPromoItemsInput,
//             userId: req.user._id,
//           });
//           const COUPON_MAX_CAP = result.discount.maxCap || 500;
//           discountFromCoupon = Math.min(result.priced.discountAmount, COUPON_MAX_CAP);
//           appliedCoupon = { code: result.discount.code, discount: discountFromCoupon };
//         } catch {
//           appliedCoupon = null;
//           discountFromCoupon = 0;
//         }
//       }
//     }

//     // -------------------- Referral Points --------------------
//     let pointsUsed = 0,
//       pointsDiscount = 0,
//       pointsMessage = "";
//     if (req.user && req.user._id && req.query.pointsToUse) {
//       const wallet = await getOrCreateWallet(req.user._id);
//       pointsUsed = Math.min(Number(req.query.pointsToUse), wallet.rewardPoints);
//       pointsDiscount = pointsUsed * 0.1;
//       pointsMessage = pointsUsed
//         ? `🎉 You used ${pointsUsed} points! Discount ₹${pointsDiscount}`
//         : "";
//     }

//     // -------------------- Gift Card --------------------
//     let giftCardApplied = null,
//       giftCardDiscount = 0;
//     if (req.query.giftCardCode && req.query.giftCardPin) {
//       const giftCard = await GiftCard.findOne({
//         code: req.query.giftCardCode.trim(),
//         pin: req.query.giftCardPin.trim(),
//       });
//       if (!giftCard || giftCard.expiryDate < new Date() || giftCard.balance <= 0) {
//         giftCardApplied = { status: "Invalid", message: "❌ Gift card not valid" };
//       } else {
//         const requested = Number(req.query.giftCardAmount || 0);
//         const maxRedeemable = Math.min(
//           requested,
//           giftCard.balance,
//           summary.payable - discountFromCoupon - pointsDiscount
//         );
//         giftCardDiscount = maxRedeemable;
//         giftCardApplied = {
//           status: "Applied",
//           code: giftCard.code,
//           appliedAmount: giftCardDiscount,
//           remainingBalance: giftCard.balance - giftCardDiscount,
//           message: `🎉 Applied ₹${giftCardDiscount} from gift card`,
//         };
//       }
//     }

//     // -------------------- Final Cart Build --------------------
//     console.log("🧮 Building final cart items...");
//     const round2 = n => Math.round(n * 100) / 100;
//     const now = new Date();
//     const activePromotions = await Promotion.find({
//       status: "active",
//       startDate: { $lte: now },
//       endDate: { $gte: now },
//     }).lean();

//     const finalCart = validCartItems.map(item => {
//       const productDoc = item.product?._id
//         ? item.product
//         : { _id: item.product, name: "Unknown Product", variants: [], images: [] };

//       const variantFromProduct = item.selectedVariant?.sku
//         ? productDoc.variants.find(v => v.sku === item.selectedVariant.sku)
//         : null;

//       const calcVariant = variantFromProduct
//         ? calculateVariantPrices([variantFromProduct], productDoc, activePromotions)[0]
//         : calculateVariantPrices([getPseudoVariant(productDoc)], productDoc, activePromotions)[0];

//       const enrichedVariant = {
//         ...calcVariant,
//         images:
//           Array.isArray(variantFromProduct?.images) && variantFromProduct.images.length
//             ? variantFromProduct.images
//             : Array.isArray(calcVariant.images) && calcVariant.images.length
//             ? calcVariant.images
//             : Array.isArray(productDoc.images) && productDoc.images.length
//             ? productDoc.images
//             : [],
//         shadeName: calcVariant?.shadeName || variantFromProduct?.shadeName || null,
//         hex: calcVariant?.hex || variantFromProduct?.hex || null,
//         sku: variantFromProduct?.sku || calcVariant?.sku || null,
//       };

//       const displayPrice = item.isFreeItem ? 0 : enrichedVariant.displayPrice;

//       return {
//         _id: item._id,
//         product: productDoc._id,
//         name: item.isFreeItem
//           ? `${productDoc.name} (Free Item)`
//           : enrichedVariant?.shadeName
//           ? `${productDoc.name} - ${enrichedVariant.shadeName}`
//           : productDoc.name,
//         quantity: item.quantity,
//         variant: {
//           sku: enrichedVariant.sku,
//           shadeName: enrichedVariant.shadeName,
//           hex: enrichedVariant.hex,
//           image: enrichedVariant.images[0] || null,
//           stock: enrichedVariant.stock,
//           originalPrice: item.isFreeItem ? 0 : enrichedVariant.originalPrice,
//           discountedPrice: displayPrice,
//           displayPrice,
//           discountPercent: item.isFreeItem ? 100 : enrichedVariant.discountPercent,
//           discountAmount: item.isFreeItem
//             ? enrichedVariant.originalPrice
//             : enrichedVariant.discountAmount,
//         },
//         isFreeItem: !!item.isFreeItem,
//         promoTag: item.promoTag || null,
//       };
//     });

//     // -------------------- Price Calculations --------------------
//     const bagMrp = round2(
//       finalCart.reduce((sum, item) => sum + (item.variant.originalPrice || 0) * item.quantity, 0)
//     );
//     const bagPayable = round2(
//       finalCart.reduce((sum, item) => sum + (item.variant.displayPrice || 0) * item.quantity, 0)
//     );
//     const totalSavings = round2(
//       bagMrp - bagPayable + discountFromCoupon + pointsDiscount + giftCardDiscount
//     );
//     let grandTotal = round2(bagPayable - discountFromCoupon - pointsDiscount - giftCardDiscount);

//     // -------------------- Shipping --------------------
//     const SHIPPING_CHARGE = 70;
//     const FREE_SHIPPING_THRESHOLD = 499;
//     let shippingCharge = 0;
//     let shippingMessage = "";

//     if (summary.freeShipping) {
//       shippingCharge = 0;
//       shippingMessage = "🚚 Free shipping via promotion!";
//     } else if (grandTotal >= FREE_SHIPPING_THRESHOLD) {
//       shippingCharge = 0;
//       shippingMessage = "🎉 Free shipping on your order!";
//     } else {
//       shippingCharge = SHIPPING_CHARGE;
//       const amountToFree = round2(FREE_SHIPPING_THRESHOLD - grandTotal);
//       shippingMessage = `📦 Add ₹${amountToFree} more for free shipping!`;
//       grandTotal += SHIPPING_CHARGE;
//     }

//     // -------------------- Response --------------------
//     res.json({
//       cart: finalCart,
//       priceDetails: {
//         bagMrp,
//         totalSavings,
//         bagDiscount: round2(bagMrp - bagPayable),
//         autoDiscount: round2(bagMrp - bagPayable),
//         couponDiscount: round2(discountFromCoupon),
//         referralPointsDiscount: round2(pointsDiscount),
//         giftCardDiscount: round2(giftCardDiscount),
//         shippingCharge: round2(shippingCharge),
//         shippingMessage,
//         payable: grandTotal,
//         promoFreeShipping: !!summary.freeShipping,
//         savingsMessage:
//           totalSavings > 0 ? `🎉 You saved ₹${totalSavings} on this order!` : "",
//       },
//       appliedCoupon,
//       appliedPromotions,
//       applicableCoupons,
//       inapplicableCoupons,
//       pointsUsed,
//       pointsDiscount,
//       pointsMessage,
//       giftCardApplied,
//       grandTotal,
//       isGuest,
//     });
//   } catch (error) {
//     console.error("❌ getCartSummary error:", error);
//     res.status(500).json({
//       message: "Failed to get cart summary",
//       error: error.message,
//     });
//   }
// };


export const getCartSummary = async (req, res) => {
  try {
    let cartSource;
    let isGuest = false;

    // -------------------- Determine Cart Source --------------------
    if (req.user && req.user._id) {
      const user = await User.findById(req.user._id).populate("cart.product");
      if (!user) return res.status(404).json({ message: "User not found" });
      cartSource = user.cart.filter(item => item.product);
    } else if (req.session.guestCart && req.session.guestCart.length) {
      isGuest = true;
      cartSource = req.session.guestCart;

      const productIds = cartSource.map(i => i.product);
      const products = await Product.find({ _id: { $in: productIds } }).lean();

      cartSource = cartSource.map(item => {
        const productDoc = products.find(p => p._id.toString() === item.product.toString());
        return {
          ...item,
          product: productDoc || { _id: item.product },
        };
      });
    } else {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const validCartItems = cartSource;
    if (!validCartItems.length) return res.status(400).json({ message: "Cart is empty" });

    // -------------------- Apply Promotions --------------------
    const itemsInput = validCartItems.map(i => ({
      productId: String(i.product?._id || i.product),
      qty: i.quantity,
      selectedVariant: i.selectedVariant || null,
    }));

    const promoResult = await applyPromotions(itemsInput, {
      userContext: req.user ? { isNewUser: req.user.isNewUser } : {},
    });
    const { items: promoItems, summary, appliedPromotions } = promoResult;

    // -------------------- Coupons --------------------
    let applicableCoupons = [], inapplicableCoupons = [], appliedCoupon = null, discountFromCoupon = 0;
    if (req.user && req.user._id) {
      const allDiscountDocs = await Discount.find({ status: "Active" }).lean();
      const nonPromoItemsInput = promoItems
        .filter(i => !i.discounts?.length)
        .map(i => ({ productId: i.productId, qty: i.qty }));

      const couponsChecked = await Promise.all(
        allDiscountDocs.map(async d => {
          try {
            if (!nonPromoItemsInput.length) throw new Error("No items");
            await validateDiscountForCartInternal({
              code: d.code,
              cart: nonPromoItemsInput,
              userId: req.user._id
            });

            return {
              code: d.code,
              label: d.name,
              type: d.type,
              value: d.value,
              status: "Applicable",
              message: `Apply code ${d.code}`
            };

          } catch {
            return {
              code: d.code,
              label: d.name,
              type: d.type,
              value: d.value,
              status: "Not applicable",
              message: "Not valid for current cart"
            };
          }
        })
      );

      applicableCoupons = couponsChecked.filter(c => c.status === "Applicable");
      inapplicableCoupons = couponsChecked.filter(c => c.status !== "Applicable");

      if (req.query.discount && nonPromoItemsInput.length) {
        try {
          const result = await validateDiscountForCartInternal({
            code: req.query.discount.trim(),
            cart: nonPromoItemsInput,
            userId: req.user._id
          });

          const COUPON_MAX_CAP = result.discount.maxCap || 500;
          discountFromCoupon = Math.min(result.priced.discountAmount, COUPON_MAX_CAP);
          appliedCoupon = { code: result.discount.code, discount: discountFromCoupon };
        } catch {
          appliedCoupon = null;
          discountFromCoupon = 0;
        }
      }
    }

    // -------------------- Referral Points --------------------
    let pointsUsed = 0, pointsDiscount = 0, pointsMessage = "";

    if (req.user && req.user._id && req.query.pointsToUse) {
      const wallet = await getOrCreateWallet(req.user._id);
      const requestedPoints = Number(req.query.pointsToUse);

      // Rule: Reward points allowed only if cart value >= 599 (before points)
      const payableBeforePoints = summary.payable - discountFromCoupon;

      if (payableBeforePoints < 599) {
        pointsMessage = "⚠️ Reward points can be used only on orders above ₹599.";
      } else {
        pointsUsed = Math.min(requestedPoints, wallet.rewardPoints);
        pointsDiscount = pointsUsed * 0.1;
        pointsMessage = pointsUsed
          ? `🎉 You used ${pointsUsed} points! Discount ₹${pointsDiscount}`
          : "";
      }
    }


    // -------------------- Gift Card --------------------
    let giftCardApplied = null, giftCardDiscount = 0;

    if (req.query.giftCardCode && req.query.giftCardPin) {
      const giftCard = await GiftCard.findOne({
        code: req.query.giftCardCode.trim(),
        pin: req.query.giftCardPin.trim()
      });

      if (!giftCard || giftCard.expiryDate < new Date() || giftCard.balance <= 0) {
        giftCardApplied = { status: "Invalid", message: "❌ Gift card not valid" };
      } else {

        // Rule: Gift card allowed only if cart value >= 599 (before GC usage)
        const payableBeforeGC = summary.payable - discountFromCoupon - pointsDiscount;

        if (payableBeforeGC < 599) {
          giftCardApplied = {
            status: "Blocked",
            message: "⚠️ Gift cards can be used only on orders above ₹599."
          };
          giftCardDiscount = 0; // just making it explicit
        } else {
          const requested = Number(req.query.giftCardAmount || 0);
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

    // -------------------- Final Cart Build --------------------
    const round2 = n => Math.round(n * 100) / 100;
    const now = new Date();
    const activePromotions = await Promotion.find({
      status: "active",
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).lean();

    const finalCart = await Promise.all(
      validCartItems.map(async item => {
        const productFromDB = await Product.findById(item.product._id).lean();
        if (!productFromDB) throw new Error(`Product not found: ${item.product._id}`);

        const enriched = enrichProductWithStockAndOptions(productFromDB, activePromotions);
        const enrichedVariant =
          enriched.variants.find(v =>
            String(v.sku).trim().toLowerCase() ===
            String(item.selectedVariant?.sku || "").trim().toLowerCase()
          ) || enriched.variants[0];

        const displayPrice = enrichedVariant.displayPrice;
        const stock = enrichedVariant.stock ?? 0;

        let stockStatus = "in_stock";
        let stockMessage = "";

        if (stock <= 0) {
          stockStatus = "out_of_stock";
          stockMessage = "⚠️ This item is currently out of stock.";
        } else if (stock < item.quantity) {
          stockStatus = "limited_stock";
          stockMessage = `Only ${stock} left in stock.`;
        }
        return {
          _id: item._id,
          product: productFromDB._id,
          name: enrichedVariant?.shadeName
            ? `${productFromDB.name} - ${enrichedVariant.shadeName}`
            : productFromDB.name,
          quantity: item.quantity || 1,
          stockStatus,
          stockMessage,
          canCheckout: stock > 0 && stock >= item.quantity,
          variant: {
            sku: enrichedVariant.sku,
            shadeName: enrichedVariant.shadeName,
            hex: enrichedVariant.hex,
            image: enrichedVariant.images?.[0] || null,
            stock,
            originalPrice: enrichedVariant.originalPrice,
            discountedPrice: displayPrice,
            displayPrice,
            discountPercent: enrichedVariant.discountPercent,
            discountAmount: enrichedVariant.discountAmount,
          }
        };
      })
    );

    // -------------------- Price Calculations --------------------
    const bagMrp = round2(finalCart.reduce((sum, i) =>
      sum + (i.variant.originalPrice || 0) * i.quantity, 0));

    const bagPayable = round2(finalCart.reduce((sum, i) =>
      sum + (i.variant.displayPrice || 0) * i.quantity, 0));

    const totalSavings = round2(
      bagMrp - bagPayable + discountFromCoupon + pointsDiscount + giftCardDiscount
    );

    let grandTotal = round2(
      bagPayable - discountFromCoupon - pointsDiscount - giftCardDiscount
    );

    // -------------------- Shipping --------------------
    const SHIPPING_CHARGE = 70;
    const FREE_SHIPPING_THRESHOLD = 499;
    let shippingCharge = 0, shippingMessage = "";

    if (summary.freeShipping) {
      shippingCharge = 0;
      shippingMessage = "🚚 Free shipping via promotion!";
    } else if (grandTotal >= FREE_SHIPPING_THRESHOLD) {
      shippingCharge = 0;
      shippingMessage = "🎉 Free shipping on your order!";
    } else {
      shippingCharge = SHIPPING_CHARGE;
      const amountToFree = round2(FREE_SHIPPING_THRESHOLD - grandTotal);
      shippingMessage = `📦 Add ₹${amountToFree} more for free shipping!`;
      grandTotal += SHIPPING_CHARGE;
    }

    // -------------------- Response --------------------
    res.json({
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
        promoFreeShipping: !!summary.freeShipping,
        savingsMessage:
          totalSavings > 0 ? `🎉 You saved ₹${totalSavings} on this order!` : "",
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
      isGuest,
    });

  } catch (error) {
    console.error("❌ getCartSummary error:", error);
    res.status(500).json({
      message: "Failed to get cart summary",
      error: error.message
    });
  }
};

