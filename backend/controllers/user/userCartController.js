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
import { enrichProductWithStockAndOptions, enrichProductsUnified } from "../../middlewares/services/productHelpers.js";
import { getRedis } from "../../middlewares/utils/redis.js";
import crypto from "crypto";

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
//               userId: req.user._id
//             });

//             return {
//               code: d.code,
//               label: d.name,
//               type: d.type,
//               value: d.value,
//               status: "Applicable",
//               message: `Apply code ${d.code}`
//             };

//           } catch {
//             return {
//               code: d.code,
//               label: d.name,
//               type: d.type,
//               value: d.value,
//               status: "Not applicable",
//               message: "Not valid for current cart"
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
//             userId: req.user._id
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
//     let pointsUsed = 0, pointsDiscount = 0, pointsMessage = "";

//     if (req.user && req.user._id && req.query.pointsToUse) {
//       const wallet = await getOrCreateWallet(req.user._id);
//       const requestedPoints = Number(req.query.pointsToUse);

//       // Rule: Reward points allowed only if cart value >= 599 (before points)
//       const payableBeforePoints = summary.payable - discountFromCoupon;

//       if (payableBeforePoints < 599) {
//         pointsMessage = "⚠️ Reward points can be used only on orders above ₹599.";
//       } else {
//         pointsUsed = Math.min(requestedPoints, wallet.rewardPoints);
//         pointsDiscount = pointsUsed * 0.1;
//         pointsMessage = pointsUsed
//           ? `🎉 You used ${pointsUsed} points! Discount ₹${pointsDiscount}`
//           : "";
//       }
//     }


//     // -------------------- Gift Card --------------------
//     let giftCardApplied = null, giftCardDiscount = 0;

//     if (req.query.giftCardCode && req.query.giftCardPin) {
//       const giftCard = await GiftCard.findOne({
//         code: req.query.giftCardCode.trim(),
//         pin: req.query.giftCardPin.trim()
//       });

//       if (!giftCard || giftCard.expiryDate < new Date() || giftCard.balance <= 0) {
//         giftCardApplied = { status: "Invalid", message: "❌ Gift card not valid" };
//       } else {

//         // Rule: Gift card allowed only if cart value >= 599 (before GC usage)
//         const payableBeforeGC = summary.payable - discountFromCoupon - pointsDiscount;

//         if (payableBeforeGC < 599) {
//           giftCardApplied = {
//             status: "Blocked",
//             message: "⚠️ Gift cards can be used only on orders above ₹599."
//           };
//           giftCardDiscount = 0; // just making it explicit
//         } else {
//           const requested = Number(req.query.giftCardAmount || 0);
//           const maxRedeemable = Math.min(
//             requested,
//             giftCard.balance,
//             payableBeforeGC
//           );

//           giftCardDiscount = maxRedeemable;
//           giftCardApplied = {
//             status: "Applied",
//             code: giftCard.code,
//             appliedAmount: giftCardDiscount,
//             remainingBalance: giftCard.balance - giftCardDiscount,
//             message: `🎉 Applied ₹${giftCardDiscount} from gift card`
//           };
//         }
//       }
//     }

//     // -------------------- Final Cart Build --------------------
//     const round2 = n => Math.round(n * 100) / 100;
//     const now = new Date();
//     const activePromotions = await Promotion.find({
//       status: "active",
//       startDate: { $lte: now },
//       endDate: { $gte: now }
//     }).lean();

//     const finalCart = await Promise.all(
//       validCartItems.map(async item => {
//         const productFromDB = await Product.findById(item.product._id).lean();
//         if (!productFromDB) throw new Error(`Product not found: ${item.product._id}`);

//         const enriched = enrichProductWithStockAndOptions(productFromDB, activePromotions);
//         const enrichedVariant =
//           enriched.variants.find(v =>
//             String(v.sku).trim().toLowerCase() ===
//             String(item.selectedVariant?.sku || "").trim().toLowerCase()
//           ) || enriched.variants[0];

//         const displayPrice = enrichedVariant.displayPrice;
//         const stock = enrichedVariant.stock ?? 0;

//         let stockStatus = "in_stock";
//         let stockMessage = "";

//         if (stock <= 0) {
//           stockStatus = "out_of_stock";
//           stockMessage = "⚠️ This item is currently out of stock.";
//         } else if (stock < item.quantity) {
//           stockStatus = "limited_stock";
//           stockMessage = `Only ${stock} left in stock.`;
//         }
//         return {
//           _id: item._id,
//           product: productFromDB._id,
//           name: enrichedVariant?.shadeName
//             ? `${productFromDB.name} - ${enrichedVariant.shadeName}`
//             : productFromDB.name,
//           quantity: item.quantity || 1,
//           stockStatus,
//           stockMessage,
//           canCheckout: stock > 0 && stock >= item.quantity,
//           variant: {
//             sku: enrichedVariant.sku,
//             shadeName: enrichedVariant.shadeName,
//             hex: enrichedVariant.hex,
//             image:
//               enrichedVariant.images?.[0] ||
//               productFromDB.images?.[0] ||
//               null,
//             stock,
//             originalPrice: enrichedVariant.originalPrice,
//             discountedPrice: displayPrice,
//             displayPrice,
//             discountPercent: enrichedVariant.discountPercent,
//             discountAmount: enrichedVariant.discountAmount,
//           }
//         };
//       })
//     );

//     // -------------------- Price Calculations --------------------
//     const bagMrp = round2(finalCart.reduce((sum, i) =>
//       sum + (i.variant.originalPrice || 0) * i.quantity, 0));

//     const bagPayable = round2(finalCart.reduce((sum, i) =>
//       sum + (i.variant.displayPrice || 0) * i.quantity, 0));

//     const totalSavings = round2(
//       bagMrp - bagPayable + discountFromCoupon + pointsDiscount + giftCardDiscount
//     );

//     let grandTotal = round2(
//       bagPayable - discountFromCoupon - pointsDiscount - giftCardDiscount
//     );

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
//       error: error.message
//     });
//   }
// };

// Module-level tiny caches


// export const getCartSummary = async (req, res) => {
//   try {
//     // -------------------- Redis request cache --------------------
//     const cartKeySnapshot = (() => {
//       try {
//         // build minimal cart snapshot & relevant query flags that affect output
//         const cartItemsSnapshot = (req.user && req.user._id && req.user.cart)
//           ? req.user.cart.map(i => ({
//             product: String(i.product?._id || i.product),
//             qty: i.quantity,
//             sku: i.selectedVariant?.sku || null
//           }))
//           : (req.session?.guestCart || []).map(i => ({
//             product: String(i.product),
//             qty: i.quantity,
//             sku: i.selectedVariant?.sku || null
//           }));

//         const keyObj = {
//           userId: req.user?._id ? String(req.user._id) : null,
//           sessionId: req.sessionID || null,
//           items: cartItemsSnapshot,
//           q: {
//             discount: req.query.discount || null,
//             pointsToUse: req.query.pointsToUse || null,
//             giftCardCode: req.query.giftCardCode || null,
//             giftCardPin: req.query.giftCardPin || null,
//             giftCardAmount: req.query.giftCardAmount || null
//           }
//         };
//         return JSON.stringify(keyObj);
//       } catch (e) {
//         return null;
//       }
//     })();

//     const redisKey = `cart:${req.user?._id || req.sessionID}:${cartKeySnapshot || Date.now()}`;

//     const cached = await redis.get(redisKey);
//     if (cached) {
//       return res.status(200).json(JSON.parse(cached));
//     }

//     // -------------------- Determine Cart Source (optimized) --------------------
//     let cartSource;
//     let isGuest = false;

//     if (req.user && req.user._id) {
//       // DON'T populate here: we'll preload products in one query below.
//       const user = await User.findById(req.user._id).select('cart').lean();
//       if (!user) return res.status(404).json({ message: "User not found" });
//       // cart items might have product populated originally — keep same shape: item.product may be object or id
//       cartSource = (user.cart || []).filter(item => item && item.product);
//     } else if (req.session && req.session.guestCart && req.session.guestCart.length) {
//       isGuest = true;
//       cartSource = req.session.guestCart;
//     } else {
//       return res.status(400).json({ message: "Cart is empty" });
//     }

//     const validCartItems = cartSource;
//     if (!validCartItems.length) return res.status(400).json({ message: "Cart is empty" });

//     // -------------------- Build itemsInput for promotions --------------------
//     const itemsInput = validCartItems.map(i => ({
//       productId: String(i.product?._id || i.product),
//       qty: i.quantity,
//       selectedVariant: i.selectedVariant || null,
//     }));

//     // -------------------- Apply Promotions (unchanged) --------------------
//     const promoResult = await applyPromotions(itemsInput, {
//       userContext: req.user ? { isNewUser: req.user.isNewUser } : {},
//     });
//     const { items: promoItems, summary, appliedPromotions } = promoResult;

//     // -------------------- Load Discounts (cached) --------------------
//     let allDiscountDocs;
//     const nowTS = Date.now();
//     if (_couponCache.data && (nowTS - _couponCache.ts) < _couponCache.ttl) {
//       allDiscountDocs = _couponCache.data;
//     } else {
//       allDiscountDocs = await Discount.find({ status: "Active" }).lean();
//       _couponCache = { data: allDiscountDocs, ts: Date.now(), ttl: 5000 };
//     }

//     // -------------------- Coupons evaluation (same logic, using cached discounts) --------------------
//     let applicableCoupons = [], inapplicableCoupons = [], appliedCoupon = null, discountFromCoupon = 0;
//     if (req.user && req.user._id) {
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
//               userId: req.user._id
//             });

//             return {
//               code: d.code,
//               label: d.name,
//               type: d.type,
//               value: d.value,
//               status: "Applicable",
//               message: `Apply code ${d.code}`
//             };

//           } catch {
//             return {
//               code: d.code,
//               label: d.name,
//               type: d.type,
//               value: d.value,
//               status: "Not applicable",
//               message: "Not valid for current cart"
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
//             userId: req.user._id
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
//     let pointsUsed = 0, pointsDiscount = 0, pointsMessage = "";

//     if (req.user && req.user._id && req.query.pointsToUse) {
//       const wallet = await getOrCreateWallet(req.user._id);
//       const requestedPoints = Number(req.query.pointsToUse);

//       // Rule: Reward points allowed only if cart value >= 599 (before points)
//       const payableBeforePoints = summary.payable - discountFromCoupon;

//       if (payableBeforePoints < 599) {
//         pointsMessage = "⚠️ Reward points can be used only on orders above ₹599.";
//       } else {
//         pointsUsed = Math.min(requestedPoints, wallet.rewardPoints);
//         pointsDiscount = pointsUsed * 0.1;
//         pointsMessage = pointsUsed
//           ? `🎉 You used ${pointsUsed} points! Discount ₹${pointsDiscount}`
//           : "";
//       }
//     }

//     // -------------------- Gift Card --------------------
//     let giftCardApplied = null, giftCardDiscount = 0;

//     if (req.query.giftCardCode && req.query.giftCardPin) {
//       const giftCard = await GiftCard.findOne({
//         code: req.query.giftCardCode.trim(),
//         pin: req.query.giftCardPin.trim()
//       });

//       if (!giftCard || giftCard.expiryDate < new Date() || giftCard.balance <= 0) {
//         giftCardApplied = { status: "Invalid", message: "❌ Gift card not valid" };
//       } else {
//         // Rule: Gift card allowed only if cart value >= 599 (before GC usage)
//         const payableBeforeGC = summary.payable - discountFromCoupon - pointsDiscount;

//         if (payableBeforeGC < 599) {
//           giftCardApplied = {
//             status: "Blocked",
//             message: "⚠️ Gift cards can be used only on orders above ₹599."
//           };
//           giftCardDiscount = 0;
//         } else {
//           const requested = Number(req.query.giftCardAmount || 0);
//           const maxRedeemable = Math.min(
//             requested,
//             giftCard.balance,
//             payableBeforeGC
//           );

//           giftCardDiscount = maxRedeemable;
//           giftCardApplied = {
//             status: "Applied",
//             code: giftCard.code,
//             appliedAmount: giftCardDiscount,
//             remainingBalance: giftCard.balance - giftCardDiscount,
//             message: `🎉 Applied ₹${giftCardDiscount} from gift card`
//           };
//         }
//       }
//     }

//     // -------------------- Active Promotions (cached) --------------------
//     let activePromotions;
//     const now = Date.now();
//     if (_promoCache.data && (now - _promoCache.ts) < _promoCache.ttl) {
//       activePromotions = _promoCache.data;
//     } else {
//       const dbNow = new Date();
//       activePromotions = await Promotion.find({
//         status: "active",
//         startDate: { $lte: dbNow },
//         endDate: { $gte: dbNow }
//       }).lean();
//       _promoCache = { data: activePromotions, ts: Date.now(), ttl: 5000 };
//     }

//     // -------------------- Preload all products in ONE query --------------------
//     const productIds = validCartItems.map(i => String(i.product?._id || i.product));
//     const uniqueIds = Array.from(new Set(productIds));
//     const allProducts = await Product.find({ _id: { $in: uniqueIds } }).lean();
//     const productMap = new Map(allProducts.map(p => [String(p._id), p]));

//     // If any guest-cart items were unresolved earlier (e.g. product missing) we keep similar behavior:
//     // we will throw later if product missing when building finalCart (same as original).
//     // -------------------- Final Cart Build (uses preloaded products) --------------------
//     const round2 = n => Math.round(n * 100) / 100;

//     const finalCart = await Promise.all(
//       validCartItems.map(async item => {
//         const productIdStr = String(item.product?._id || item.product);
//         const productFromDB = productMap.get(productIdStr);

//         if (!productFromDB) throw new Error(`Product not found: ${productIdStr}`);

//         const enriched = enrichProductWithStockAndOptions(productFromDB, activePromotions);
//         const enrichedVariant =
//           enriched.variants.find(v =>
//             String(v.sku).trim().toLowerCase() ===
//             String(item.selectedVariant?.sku || "").trim().toLowerCase()
//           ) || enriched.variants[0];

//         const displayPrice = enrichedVariant.displayPrice;
//         const stock = enrichedVariant.stock ?? 0;

//         let stockStatus = "in_stock";
//         let stockMessage = "";

//         if (stock <= 0) {
//           stockStatus = "out_of_stock";
//           stockMessage = "⚠️ This item is currently out of stock.";
//         } else if (stock < item.quantity) {
//           stockStatus = "limited_stock";
//           stockMessage = `Only ${stock} left in stock.`;
//         }
//         return {
//           _id: item._id,
//           product: productFromDB._id,
//           name: enrichedVariant?.shadeName
//             ? `${productFromDB.name} - ${enrichedVariant.shadeName}`
//             : productFromDB.name,
//           quantity: item.quantity || 1,
//           stockStatus,
//           stockMessage,
//           canCheckout: stock > 0 && stock >= item.quantity,
//           variant: {
//             sku: enrichedVariant.sku,
//             shadeName: enrichedVariant.shadeName,
//             hex: enrichedVariant.hex,
//             image:
//               enrichedVariant.images?.[0] ||
//               productFromDB.images?.[0] ||
//               null,
//             stock,
//             originalPrice: enrichedVariant.originalPrice,
//             discountedPrice: displayPrice,
//             displayPrice,
//             discountPercent: enrichedVariant.discountPercent,
//             discountAmount: enrichedVariant.discountAmount,
//           }
//         };
//       })
//     );

//     // -------------------- Price Calculations --------------------
//     const bagMrp = round2(finalCart.reduce((sum, i) =>
//       sum + (i.variant.originalPrice || 0) * i.quantity, 0));

//     const bagPayable = round2(finalCart.reduce((sum, i) =>
//       sum + (i.variant.displayPrice || 0) * i.quantity, 0));

//     const totalSavings = round2(
//       bagMrp - bagPayable + discountFromCoupon + pointsDiscount + giftCardDiscount
//     );

//     let grandTotal = round2(
//       bagPayable - discountFromCoupon - pointsDiscount - giftCardDiscount
//     );

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

//     // -------------------- Response Build --------------------
//     const responseData = {
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
//     };

//     // -------------------- Cache final response in Redis (short TTL) --------------------
//     try {
//       await redis.set(redisKey, JSON.stringify(responseData), "EX", 20); // 20s TTL
//     } catch (cacheErr) {
//       console.error("Redis set error (cart):", cacheErr);
//     }

//     return res.json(responseData);

//   } catch (error) {
//     console.error("❌ getCartSummary error:", error);
//     return res.status(500).json({
//       message: "Failed to get cart summary",
//       error: error.message
//     });
//   }
// };

// export const getCartSummary = async (req, res) => {
//   try {
//     // -------------------- Redis request cache --------------------
//     const cartKeySnapshot = (() => {
//       try {
//         const cartItemsSnapshot = (req.user && req.user._id && req.user.cart)
//           ? req.user.cart.map(i => ({
//               product: String(i.product?._id || i.product),
//               qty: i.quantity,
//               sku: i.selectedVariant?.sku || null,
//             }))
//           : (req.session?.guestCart || []).map(i => ({
//               product: String(i.product),
//               qty: i.quantity,
//               sku: i.selectedVariant?.sku || null,
//             }));

//         const keyObj = {
//           userId: req.user?._id ? String(req.user._id) : null,
//           sessionId: req.sessionID || null,
//           items: cartItemsSnapshot,
//           q: {
//             discount: req.query.discount || null,
//           },
//         };

//         return JSON.stringify(keyObj);
//       } catch {
//         return null;
//       }
//     })();

//     const snapshotHash = crypto
//       .createHash("md5")
//       .update(cartKeySnapshot || "")
//       .digest("hex");

//     const redisKey = `cart:${req.user?._id || req.sessionID}:${snapshotHash}`;

//     let cached = null;
//     try {
//       cached = await redis.get(redisKey);
//     } catch (err) {
//       console.error("Redis get failed:", err);
//     }

//     if (cached) {
//       return res.status(200).json(JSON.parse(cached));
//     }

//     // -------------------- Determine Cart Source --------------------
//     let cartSource;
//     let isGuest = false;

//     if (req.user && req.user._id) {
//       const user = await User.findById(req.user._id).select("cart").lean();
//       if (!user) return res.status(404).json({ message: "User not found" });

//       cartSource = (user.cart || []).filter(item => item && item.product);
//     } else if (req.session?.guestCart?.length) {
//       isGuest = true;
//       cartSource = req.session.guestCart;
//     } else {
//       return res.status(400).json({ message: "Cart is empty" });
//     }

//     if (!cartSource.length) {
//       return res.status(400).json({ message: "Cart is empty" });
//     }

//     const validCartItems = cartSource;

//     // -------------------- Build itemsInput for promotions --------------------
//     const itemsInput = validCartItems.map(i => ({
//       productId: String(i.product?._id || i.product),
//       qty: i.quantity,
//       selectedVariant: i.selectedVariant || null,
//     }));

//     // -------------------- Apply Promotions --------------------
//     const promoResult = await applyPromotions(itemsInput, {
//       userContext: req.user ? { isNewUser: req.user.isNewUser } : {},
//     });

//     const { items: promoItems, summary, appliedPromotions } = promoResult;

//     // -------------------- Load Coupons --------------------
//     let allDiscountDocs;
//     const nowTS = Date.now();

//     if (_couponCache.data && nowTS - _couponCache.ts < _couponCache.ttl) {
//       allDiscountDocs = _couponCache.data;
//     } else {
//       allDiscountDocs = await Discount.find({ status: "Active" }).lean();
//       _couponCache = {
//         data: allDiscountDocs,
//         ts: Date.now(),
//         ttl: 5000,
//       };
//     }

//     // -------------------- Coupons Evaluation --------------------
//     let applicableCoupons = [],
//       inapplicableCoupons = [],
//       appliedCoupon = null,
//       discountFromCoupon = 0;

//     if (req.user && req.user._id) {
//       const nonPromoItemsInput = promoItems
//         .filter(i => !i.discounts?.length)
//         .map(i => ({
//           productId: i.productId,
//           qty: i.qty,
//         }));

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
//               message: `Apply code ${d.code}`,
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

//           const CAP = result.discount.maxCap || 500;
//           discountFromCoupon = Math.min(result.priced.discountAmount, CAP);

//           appliedCoupon = {
//             code: result.discount.code,
//             discount: discountFromCoupon,
//           };
//         } catch {
//           appliedCoupon = null;
//           discountFromCoupon = 0;
//         }
//       }
//     }

//     // -------------------- Active Promotions --------------------
//     let activePromotions;
//     const now = Date.now();

//     if (_promoCache.data && now - _promoCache.ts < _promoCache.ttl) {
//       activePromotions = _promoCache.data;
//     } else {
//       const dbNow = new Date();
//       activePromotions = await Promotion.find({
//         status: "active",
//         startDate: { $lte: dbNow },
//         endDate: { $gte: dbNow },
//       }).lean();
//       _promoCache = {
//         data: activePromotions,
//         ts: Date.now(),
//         ttl: 5000,
//       };
//     }

//     // -------------------- Preload all products --------------------
//     const productIds = validCartItems.map(i => String(i.product?._id || i.product));
//     const uniqueIds = [...new Set(productIds)];

//     const allProducts = await Product.find({ _id: { $in: uniqueIds } }).lean();

//     const productMap = new Map(allProducts.map(p => [String(p._id), p]));

//     // -------------------- Build Final Cart --------------------
//     const round2 = n => Math.round(n * 100) / 100;

//     const finalCart = await Promise.all(
//       validCartItems.map(async item => {
//         const productIdStr = String(item.product?._id || item.product);
//         const productFromDB = productMap.get(productIdStr);

//         // ---------- FIX: product deleted ----------
//         if (!productFromDB) {
//           return {
//             _id: item._id,
//             product: null,
//             name: "Product unavailable",
//             quantity: item.quantity || 1,
//             stockStatus: "deleted",
//             stockMessage: "❌ This product was removed by admin.",
//             canCheckout: false,
//             variant: {
//               sku: item.selectedVariant?.sku || null,
//               shadeName: null,
//               hex: null,
//               image: null,
//               stock: 0,
//               originalPrice: 0,
//               discountedPrice: 0,
//               displayPrice: 0,
//               discountPercent: 0,
//               discountAmount: 0,
//             },
//           };
//         }

//         const enriched = enrichProductWithStockAndOptions(
//           productFromDB,
//           activePromotions
//         );

//         const enrichedVariant =
//           enriched.variants.find(
//             v =>
//               String(v.sku).trim().toLowerCase() ===
//               String(item.selectedVariant?.sku || "").trim().toLowerCase()
//           ) || enriched.variants[0];

//         const stock = enrichedVariant.stock ?? 0;
//         let stockStatus = "in_stock";
//         let stockMessage = "";

//         if (stock <= 0) {
//           stockStatus = "out_of_stock";
//           stockMessage = "⚠️ This item is currently out of stock.";
//         } else if (stock < item.quantity) {
//           stockStatus = "limited_stock";
//           stockMessage = `Only ${stock} left in stock.`;
//         }

//         return {
//           _id: item._id,
//           product: productFromDB._id,
//           name: enrichedVariant.shadeName
//             ? `${productFromDB.name} - ${enrichedVariant.shadeName}`
//             : productFromDB.name,
//           quantity: item.quantity || 1,
//           stockStatus,
//           stockMessage,
//           canCheckout: stock > 0 && stock >= item.quantity,
//           variant: {
//             sku: enrichedVariant.sku,
//             shadeName: enrichedVariant.shadeName,
//             hex: enrichedVariant.hex,
//             image:
//               enrichedVariant.images?.[0] ||
//               productFromDB.images?.[0] ||
//               null,
//             stock,
//             originalPrice: enrichedVariant.originalPrice,
//             discountedPrice: enrichedVariant.displayPrice,
//             displayPrice: enrichedVariant.displayPrice,
//             discountPercent: enrichedVariant.discountPercent,
//             discountAmount: enrichedVariant.discountAmount,
//           },
//         };
//       })
//     );

//     // -------------------- Price Calculation --------------------
//     const activeItems = finalCart.filter(i => i.stockStatus !== "deleted");

//     const bagMrp = round2(
//       activeItems.reduce((sum, i) => sum + (i.variant.originalPrice || 0) * i.quantity, 0)
//     );

//     const bagPayable = round2(
//       activeItems.reduce((sum, i) => sum + (i.variant.displayPrice || 0) * i.quantity, 0)
//     );

//     const totalSavings = round2(
//       bagMrp - bagPayable + discountFromCoupon
//     );

//     let grandTotal = round2(bagPayable - discountFromCoupon);

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

//     // -------------------- Final Response --------------------
//     const responseData = {
//       cart: finalCart,
//       priceDetails: {
//         bagMrp,
//         totalSavings,
//         bagDiscount: round2(bagMrp - bagPayable),
//         autoDiscount: round2(bagMrp - bagPayable),
//         couponDiscount: round2(discountFromCoupon),
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
//       grandTotal,
//       isGuest,
//     };

//     try {
//       await redis.set(redisKey, JSON.stringify(responseData), "EX", 20);
//     } catch (err) {
//       console.error("Redis set failed:", err);
//     }

//     return res.json(responseData);
//   } catch (error) {
//     console.error("❌ getCartSummary error:", error);
//     return res.status(500).json({
//       message: "Failed to get cart summary",
//       error: error.message,
//     });
//   }
// };

// --- CACHES / TTLs ---
let _promoCache = { data: null, ts: 0, ttl: 5000 };   // existing (kept)
let _couponCache = { data: null, ts: 0, ttl: 5000 };  // existing (kept)

const PRODUCT_CACHE_TTL = 300;        // 5 minutes for raw product doc
const ENRICHED_PRODUCT_TTL = 20;      // 20 seconds for enriched product (max-speed)
const PROMO_CACHE_TTL = 20;           // 20s promo cache in redis layer
const COUPON_CACHE_TTL = 20;          // 20s coupon cache in redis layer
const CART_CACHE_TTL = 60;            // 60s cart snapshot cache

// ---------- helper: get raw product from cache/db ----------
async function getCachedProduct(productId) {
  if (!productId) return null;

  const redis = getRedis();   // 🔥 REQUIRED

  const key = `prod:${productId}`;
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
  } catch (e) {
    // swallow redis parse errors and fallback to DB
    console.error("redis.get prod failed", e);
  }

  const doc = await Product.findById(productId).lean();
  if (doc) {
    try {
      await redis.set(key, JSON.stringify(doc), "EX", PRODUCT_CACHE_TTL);
    } catch (e) {
      console.error("redis.set prod failed", e);
    }
  }
  return doc;
}

// batch fetch raw products (redis-first)
async function getMultipleProducts(ids = []) {
  if (!ids || !ids.length) return [];
  // fetch in parallel
  const proms = ids.map(id => getCachedProduct(id));
  return Promise.all(proms);
}

// ---------- helper: get enriched product (cache per promoHash) ----------
async function getEnrichedProduct(product, promoHash, activePromotions) {
  if (!product) return null;
  const redis = getRedis();  // 🔥 REQUIRED

  const id = String(product._id);
  const key = `enriched:product:${id}:${promoHash || "nopromo"}`;

  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
  } catch (e) {
    console.error("redis.get enriched failed", e);
  }

  // enrich synchronously using your function
  // NOTE: enrichProductWithStockAndOptions is synchronous in your code
  let enriched;
  try {
    enriched = enrichProductWithStockAndOptions(product, activePromotions || []);
  } catch (err) {
    // fallback to a minimal enriched structure preserving fields
    console.error("enrichProductWithStockAndOptions error:", err);
    enriched = {
      ...product,
      variants: product.variants?.map(v => ({
        ...v,
        originalPrice: Number(v.mrp ?? v.price ?? product.mrp ?? product.price ?? 0),
        displayPrice: Number(v.discountedPrice ?? v.price ?? product.price ?? 0),
        discountPercent: 0,
        discountAmount: 0,
      })) || [],
      selectedVariant: product.variants?.[0] || null,
    };
  }

  try {
    await redis.set(key, JSON.stringify(enriched), "EX", ENRICHED_PRODUCT_TTL);
  } catch (e) {
    console.error("redis.set enriched failed", e);
  }
  return enriched;
}

// ---------- small util to hash promotions (stable) ----------
function promoHashFromPromos(promos = []) {
  try {
    // Use promo ids + updatedAt if available to make key sensitive to changes
    const arr = (promos || []).map(p => {
      const id = p._id ? String(p._id) : JSON.stringify(p);
      const t = p.updatedAt ? String(new Date(p.updatedAt).getTime()) : (p.ts || "");
      return id + ":" + t;
    });
    const raw = arr.sort().join("|");
    return crypto.createHash("md5").update(raw || "").digest("hex");
  } catch (err) {
    return "nopromohash";
  }
}

// ---------- MAIN optimized controller (drop-in) ----------
export const getCartSummary = async (req, res) => {
  try {

    const redis = getRedis();  // 🔥 REQUIRED FIX

    // -------------------- Redis snapshot cache --------------------
    const cartKeySnapshot = (() => {
      try {
        const cartItemsSnapshot = (req.user && req.user._id && req.user.cart)
          ? req.user.cart.map(i => ({
            product: String(i.product?._id || i.product),
            qty: i.quantity,
            sku: i.selectedVariant?.sku || null,
          }))
          : (req.session?.guestCart || []).map(i => ({
            product: String(i.product),
            qty: i.quantity,
            sku: i.selectedVariant?.sku || null,
          }));

        return JSON.stringify({
          userId: req.user?._id ? String(req.user._id) : null,
          sessionId: req.sessionID || null,
          items: cartItemsSnapshot,
          q: {
            discount: req.query.discount || null,
          },
        });
      } catch {
        return null;
      }
    })();

    const snapshotHash = crypto
      .createHash("md5")
      .update(cartKeySnapshot || "")
      .digest("hex");


    const redisKey = `cart:${req.user?._id || req.sessionID}:${snapshotHash}`;

    // Try fast path: return cached cart snapshot
    try {
      const cached = await redis.get(redisKey);
      if (cached) return res.status(200).json(JSON.parse(cached));
    } catch (err) {
      console.error("Redis get failed:", err);
      // degrade gracefully
    }

    // -------------------- Determine Cart Source --------------------
    let cartSource;
    let isGuest = false;

    if (req.user && req.user._id) {
      const user = await User.findById(req.user._id).select("cart").lean();
      if (!user) return res.status(404).json({ message: "User not found" });
      cartSource = (user.cart || []).filter(item => item && item.product);
    } else if (req.session?.guestCart?.length) {
      isGuest = true;
      cartSource = req.session.guestCart;
    } else {
      return res.status(400).json({ message: "Cart is empty" });
    }

    if (!cartSource.length) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const validCartItems = cartSource;

    // -------------------- Build itemsInput for promotions --------------------
    const itemsInput = validCartItems.map(i => ({
      productId: String(i.product?._id || i.product),
      qty: i.quantity,
      selectedVariant: i.selectedVariant || null,
    }));

    // Normalize SKU case to avoid mismatches during applyPromotions
    itemsInput.forEach(i => {
      if (i.selectedVariant && i.selectedVariant.sku) {
        i.selectedVariant.sku = String(i.selectedVariant.sku).trim().toLowerCase();
      }
    });

    // Precompute product id list for parallel DB ops
    const productIds = validCartItems.map(i => String(i.product?._id || i.product));
    const uniqueIds = [...new Set(productIds)];

    // -------------------- Kick off parallel loads (optimized) --------------------
    // don't change helpers — we call them as-is
    const applyPromotionsPromise = applyPromotions(itemsInput, {
      userContext: req.user ? { isNewUser: req.user.isNewUser } : {},
    });

    // Coupon docs (cache layer)
    const loadCouponsPromise = (async () => {
      try {
        const now = Date.now();
        if (_couponCache.data && now - _couponCache.ts < (_couponCache.ttl || COUPON_CACHE_TTL * 1000)) {
          return _couponCache.data;
        }
        const docs = await Discount.find({ status: "Active" }).lean();
        _couponCache = { data: docs, ts: Date.now(), ttl: COUPON_CACHE_TTL * 1000 };
        return docs;
      } catch (err) {
        console.error("Failed to load coupons:", err);
        return [];
      }
    })();

    // Promotions (cache layer)
    const loadActivePromotionsPromise = (async () => {
      try {
        const now = Date.now();
        if (_promoCache.data && now - _promoCache.ts < (_promoCache.ttl || PROMO_CACHE_TTL * 1000)) {
          return _promoCache.data;
        }
        const dbNow = new Date();
        const promos = await Promotion.find({
          status: "active",
          startDate: { $lte: dbNow },
          endDate: { $gte: dbNow },
        }).lean();
        _promoCache = { data: promos, ts: Date.now(), ttl: PROMO_CACHE_TTL * 1000 };
        return promos;
      } catch (err) {
        console.error("Failed to load promotions:", err);
        return [];
      }
    })();

    // Raw products loaded via redis-first helper
    const loadProductsPromise = getMultipleProducts(uniqueIds);

    // Run heavy loads in parallel
    const [promoResult, allDiscountDocs, activePromotions, allProducts] = await Promise.all([
      applyPromotionsPromise,
      loadCouponsPromise,
      loadActivePromotionsPromise,
      loadProductsPromise,
    ]);

    const {
      items: promoItems,
      summary,
      appliedPromotions,
      freebies = []
    } = promoResult || {
      items: [],
      summary: {},
      appliedPromotions: [],
      freebies: []
    };

    // -------------------- Coupons Evaluation (unchanged logic) --------------------
    let applicableCoupons = [],
      inapplicableCoupons = [],
      appliedCoupon = null,
      discountFromCoupon = 0;

    if (req.user && req.user._id) {
      const nonPromoItemsInput = (promoItems || [])
        .filter(i => !i.discounts?.length)
        .map(i => ({
          productId: i.productId,
          qty: i.qty,
        }));

      if (nonPromoItemsInput.length && Array.isArray(allDiscountDocs) && allDiscountDocs.length) {
        const couponsChecked = await Promise.all(
          allDiscountDocs.map(async d => {
            try {
              await validateDiscountForCartInternal({
                code: d.code,
                cart: nonPromoItemsInput,
                userId: req.user._id,
              });

              return {
                code: d.code,
                label: d.name,
                type: d.type,
                value: d.value,
                status: "Applicable",
                message: `Apply code ${d.code}`,
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

        applicableCoupons = couponsChecked.filter(c => c.status === "Applicable");
        inapplicableCoupons = couponsChecked.filter(c => c.status !== "Applicable");

        if (req.query.discount && nonPromoItemsInput.length) {
          try {
            const result = await validateDiscountForCartInternal({
              code: req.query.discount.trim(),
              cart: nonPromoItemsInput,
              userId: req.user._id,
            });

            const CAP = result.discount.maxCap || 500;
            discountFromCoupon = Math.min(result.priced.discountAmount, CAP);

            appliedCoupon = {
              code: result.discount.code,
              discount: discountFromCoupon,
            };
          } catch {
            appliedCoupon = null;
            discountFromCoupon = 0;
          }
        }
      } else {
        applicableCoupons = [];
        inapplicableCoupons = Array.isArray(allDiscountDocs) ? allDiscountDocs.map(d => ({
          code: d.code,
          label: d.name,
          type: d.type,
          value: d.value,
          status: "Not applicable",
          message: "Not valid for current cart",
        })) : [];
      }
    }

    // -------------------- Enrich products (cached per promotion state) --------------------
    const promoHash = promoHashFromPromos(activePromotions || []);

    // allProducts may contain nulls for missing; ensure clean list
    const rawProducts = (allProducts || []).filter(Boolean);

    // Pre-enrich all products in parallel (caches per promoHash)
    const enrichedPromises = rawProducts.map(p => getEnrichedProduct(p, promoHash, activePromotions || []));
    const enrichedProducts = await Promise.all(enrichedPromises);

    // Build product map from enriched products (keep ids as strings)
    const productMap = new Map((enrichedProducts || []).filter(Boolean).map(p => [String(p._id), p]));

    // -------------------- Build Final Cart (synchronous mapping) --------------------
    const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

    const finalCart = validCartItems.map(item => {
      const productIdStr = String(item.product?._id || item.product);
      const productFromDB = productMap.get(productIdStr);

      // product removed
      if (!productFromDB) {
        return {
          _id: item._id,
          product: null,
          name: "Product unavailable",
          quantity: item.quantity || 1,
          stockStatus: "deleted",
          stockMessage: "❌ This product was removed by admin.",
          canCheckout: false,
          variant: {
            sku: item.selectedVariant?.sku || null,
            shadeName: null,
            hex: null,
            image: null,
            stock: 0,
            originalPrice: 0,
            discountedPrice: 0,
            displayPrice: 0,
            discountPercent: 0,
            discountAmount: 0,
          },
        };
      }

      const enriched = productFromDB; // already enriched
      const enrichedVariant =
        enriched.variants.find(
          v => String(v.sku || "").trim().toLowerCase() === String(item.selectedVariant?.sku || "").trim().toLowerCase()
        ) || enriched.variants[0];

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
        name: enrichedVariant.shadeName
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
          image: enrichedVariant.images?.[0] || productFromDB.images?.[0] || null,
          stock,
          originalPrice: enrichedVariant.originalPrice,
          discountedPrice: enrichedVariant.displayPrice,
          displayPrice: enrichedVariant.displayPrice,
          discountPercent: enrichedVariant.discountPercent,
          discountAmount: enrichedVariant.discountAmount,
        },
        freebies: item.freebies || [],   // 🔥 ADD THIS

      };
    });

    // -------------------- Price Calculation --------------------
    const activeItems = finalCart.filter(i => i.stockStatus !== "deleted");

    const bagMrp = round2(
      activeItems.reduce(
        (sum, i) => sum + i.variant.originalPrice * i.quantity,
        0
      )
    );

    const sellingTotal = round2(
      activeItems.reduce(
        (sum, i) => sum + i.variant.displayPrice * i.quantity,
        0
      )
    );

    const productDiscount = round2(bagMrp - sellingTotal);

    const bogoDiscount = round2(
      promoItems.reduce((s, i) => s + (i._bogoFreeAmount || 0), 0)
    );

    const bagPayable = round2(sellingTotal - bogoDiscount);



    const totalSavings = round2(
      bagMrp - bagPayable + discountFromCoupon
    );

    let grandTotal = round2(bagPayable - discountFromCoupon);

    // -------------------- Shipping --------------------
    const SHIPPING_CHARGE = 70;
    const FREE_SHIPPING_THRESHOLD = 499;

    let shippingCharge = 0;
    let shippingMessage = "";

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

    // -------------------- GST Calculation --------------------
    const GST_RATE = 0.12; // 12%

    const taxableAmount = round2(bagPayable - discountFromCoupon);

    const gstAmount = round2(taxableAmount * GST_RATE);

    const payableWithGST = round2(taxableAmount + gstAmount);


    // Friendly message (frontend ready)
    const gstMessage = `🧾 Includes 12% GST (₹${gstAmount})`;


    // -------------------- Final Response --------------------
    const responseData = {
      cart: finalCart,
      // 👇👇 ADD THIS
      freebies: freebies.map(f => ({
        productId: f.productId,
        name: f.name || "",
        qty: f.qty || f.quantity || 1,
        variant: f.variant || null,
        price: 0,
        message: f.message || "Free item"
      })),
      priceDetails: {
        bagMrp,
        totalSavings,
        bagDiscount: round2(bagMrp - bagPayable),
        autoDiscount: round2(bagMrp - bagPayable),
        couponDiscount: round2(discountFromCoupon),
        shippingCharge: round2(shippingCharge),
        shippingMessage,
        taxableAmount,       // 🔥 important
        gstRate: "12%",
        gstAmount,
        gstMessage,
        payable: payableWithGST,
        promoFreeShipping: !!summary.freeShipping,
        savingsMessage:
          totalSavings > 0 ? `🎉 You saved ₹${totalSavings} on this order!` : "",
      },
      appliedCoupon,
      appliedPromotions,

      // 👇 include raw freebies here too for debugging
      rawFreebies: freebies,
      applicableCoupons,
      inapplicableCoupons,
      grandTotal: payableWithGST,
      isGuest,
    };

    // Cache the final response (longer TTL)
    try {
      await redis.set(redisKey, JSON.stringify(responseData), "EX", CART_CACHE_TTL);
    } catch (err) {
      console.error("Redis set failed:", err);
    }

    return res.json(responseData);
  } catch (error) {
    console.error("❌ getCartSummary error:", error);
    return res.status(500).json({
      message: "Failed to get cart summary",
      error: error.message,
    });
  }
};

