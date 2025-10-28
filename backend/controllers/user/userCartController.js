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

// -------------------- ADD TO CART --------------------
// export const addToCart = async (req, res) => {
//   try {
//     const { productId, variants = [], quantity: qty = 1 } = req.body;
//     const user = await User.findById(req.user._id);
//     const product = await Product.findById(productId);

//     if (!product) return res.status(404).json({ message: "Product not found" });

//     if (variants.length === 0) {
//       const existing = user.cart.find(
//         (item) => item.product.toString() === productId && !item.selectedVariant
//       );
//       if (existing) existing.quantity += qty;
//       else user.cart.push({ product: productId, quantity: qty, selectedVariant: null });
//     } else {
//       for (const { variantSku, quantity } of variants) {
//         if (!quantity || quantity <= 0) continue;

//         const variant = product.variants.find(v => v.sku === variantSku);
//         if (!variant) continue;

//         const selectedVariant = {
//           sku: variant.sku,
//           shadeName: variant.shadeName || null,
//           hex: variant.hex || null,
//           images: variant.images?.length ? variant.images : (product.images?.length ? product.images : []), // ✅ Always has array
//           price: variant.price ?? product.price,
//           discountedPrice: variant.discountedPrice ?? product.discountedPrice ?? product.price,
//           stock: variant.stock ?? 0,
//         };

//         const existing = user.cart.find(
//           (item) => item.product.toString() === productId &&
//             item.selectedVariant?.sku === variantSku
//         );

//         if (existing) existing.quantity += quantity;
//         else user.cart.push({ product: productId, quantity, selectedVariant });
//       }
//     }

//     await user.save();
//     res.status(200).json({ message: "✅ Added to cart", cart: user.cart });
//   } catch (err) {
//     res.status(500).json({ message: "Something went wrong", error: err.message });
//   }
// };


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


// -------------------- GET CART SUMMARY --------------------
// export const getCartSummary = async (req, res) => {
//   try {
//     if (!req.user || !req.user._id)
//       return res.status(401).json({ message: "Unauthorized" });

//     const user = await User.findById(req.user._id).populate("cart.product");
//     if (!user)
//       return res.status(404).json({ message: "User not found" });

//     const validCartItems = (user.cart || []).filter(item => item.product);
//     if (!validCartItems.length)
//       return res.status(400).json({ message: "Cart is empty" });

//     /* -------------------- Apply Promotions -------------------- */
//     const itemsInput = validCartItems.map(i => ({
//       productId: String(i.product._id),
//       qty: i.quantity,
//       selectedVariant: i.selectedVariant || null,
//     }));
//     const promoResult = await applyPromotions(itemsInput, { userContext: { isNewUser: user.isNewUser } });
//     const { items: promoItems, summary, appliedPromotions } = promoResult;

//     /* -------------------- Coupons -------------------- */
//     const allDiscountDocs = await Discount.find({ status: "Active" }).lean();
//     const nonPromoItemsInput = promoItems.filter(i => !i.discounts?.length)
//       .map(i => ({ productId: i.productId, qty: i.qty }));

//     const couponsChecked = await Promise.all(
//       allDiscountDocs.map(async (d) => {
//         try {
//           if (!nonPromoItemsInput.length) throw new Error("No items");
//           await validateDiscountForCartInternal({ code: d.code, cart: nonPromoItemsInput, userId: req.user._id });
//           return { code: d.code, label: d.name, type: d.type, value: d.value, status: "Applicable", message: `Apply code ${d.code} and save ${d.type === "Percentage" ? d.value + "%" : "₹" + d.value}` };
//         } catch {
//           return { code: d.code, label: d.name, type: d.type, value: d.value, status: "Not applicable", message: "Not valid for current cart" };
//         }
//       })
//     );

//     const applicableCoupons = couponsChecked.filter(c => c.status === "Applicable");
//     const inapplicableCoupons = couponsChecked.filter(c => c.status !== "Applicable");

//     let appliedCoupon = null;
//     let discountFromCoupon = 0;
//     if (req.query.discount && nonPromoItemsInput.length) {
//       try {
//         const result = await validateDiscountForCartInternal({ code: req.query.discount.trim(), cart: nonPromoItemsInput, userId: req.user._id });
//         const COUPON_MAX_CAP = result.discount.maxCap || 500;
//         discountFromCoupon = Math.min(result.priced.discountAmount, COUPON_MAX_CAP);
//         appliedCoupon = { code: result.discount.code, discount: discountFromCoupon };
//       } catch { appliedCoupon = null; discountFromCoupon = 0; }
//     }

//     /* -------------------- Referral Points -------------------- */
//     const wallet = await getOrCreateWallet(req.user._id);
//     let pointsUsed = 0, pointsDiscount = 0, pointsMessage = "";
//     if (req.query.pointsToUse) {
//       pointsUsed = Math.min(Number(req.query.pointsToUse), wallet.rewardPoints);
//       pointsDiscount = pointsUsed * 0.1;
//       pointsMessage = pointsUsed ? `🎉 You used ${pointsUsed} points from your wallet! Discount applied: ₹${pointsDiscount}` : "";
//     }

//     /* -------------------- Gift Card -------------------- */
//     let giftCardApplied = null, giftCardDiscount = 0;
//     if (req.query.giftCardCode && req.query.giftCardPin) {
//       const giftCard = await GiftCard.findOne({ code: req.query.giftCardCode.trim(), pin: req.query.giftCardPin.trim() });
//       if (!giftCard || giftCard.expiryDate < new Date() || giftCard.balance <= 0) {
//         giftCardApplied = { status: "Invalid", message: "❌ Gift card not valid" };
//       } else {
//         const requested = Number(req.query.giftCardAmount || 0);
//         const maxRedeemable = Math.min(requested, giftCard.balance, summary.payable - discountFromCoupon - pointsDiscount);
//         giftCardDiscount = maxRedeemable;
//         giftCardApplied = {
//           status: "Applied",
//           code: giftCard.code,
//           appliedAmount: giftCardDiscount,
//           remainingBalance: giftCard.balance - giftCardDiscount,
//           message: `🎉 Successfully applied ₹${giftCardDiscount} from your gift card!`
//         };
//       }
//     }

//     /* -------------------- Variant + Price Build -------------------- */
//     const round2 = n => Math.round(n * 100) / 100;
//     const now = new Date();
//     const activePromotions = await Promotion.find({ status: "active", startDate: { $lte: now }, endDate: { $gte: now } }).lean();

//     const finalCart = validCartItems.map(item => {
//       const productDoc = item.product;
//       let enrichedVariant;

//       // 1️⃣ Get variant from SKU if exists
//       let variantFromProduct = item.selectedVariant?.sku
//         ? productDoc.variants.find(v => v.sku === item.selectedVariant.sku)
//         : null;

//       // 2️⃣ Calculate prices
//       const calcVariant = variantFromProduct
//         ? calculateVariantPrices([variantFromProduct], productDoc, activePromotions)[0]
//         : calculateVariantPrices([getPseudoVariant(productDoc)], productDoc, activePromotions)[0];

//       // 3️⃣ Build enriched variant with images fallback
//       enrichedVariant = {
//         ...calcVariant,
//         images: Array.isArray(variantFromProduct?.images) && variantFromProduct.images.length
//           ? variantFromProduct.images
//           : Array.isArray(calcVariant.images) && calcVariant.images.length
//             ? calcVariant.images
//             : Array.isArray(productDoc.images) && productDoc.images.length
//               ? productDoc.images
//               : [],
//         shadeName: calcVariant?.shadeName || variantFromProduct?.shadeName || productDoc.variant || null,
//         hex: calcVariant?.hex || variantFromProduct?.hex || null,
//         sku: variantFromProduct?.sku || calcVariant?.sku || null,
//       };

//       return {
//         _id: item._id,
//         product: productDoc._id,
//         name: enrichedVariant?.shadeName ? `${productDoc.name} - ${enrichedVariant.shadeName}` : productDoc.name,
//         quantity: item.quantity,
//         variant: {
//           sku: enrichedVariant.sku,
//           shadeName: enrichedVariant.shadeName,
//           hex: enrichedVariant.hex,
//           image: enrichedVariant.images[0] || null,
//           stock: enrichedVariant.stock,
//           originalPrice: enrichedVariant.originalPrice,
//           discountedPrice: enrichedVariant.displayPrice,
//           displayPrice: enrichedVariant.displayPrice,
//           discountPercent: enrichedVariant.discountPercent,
//           discountAmount: enrichedVariant.discountAmount,
//         }
//       };
//     });

//     /* -------------------- Price Calculations -------------------- */
//     const bagMrp = round2(finalCart.reduce((sum, item) => sum + (item.variant.originalPrice || 0) * item.quantity, 0));
//     const bagPayable = round2(finalCart.reduce((sum, item) => sum + (item.variant.displayPrice || 0) * item.quantity, 0));
//     const totalSavings = round2(bagMrp - bagPayable + discountFromCoupon + pointsDiscount + giftCardDiscount);
//     let grandTotal = round2(bagPayable - discountFromCoupon - pointsDiscount - giftCardDiscount);

//     /* -------------------- Shipping -------------------- */
//     const FREE_SHIPPING_THRESHOLD = 499;
//     const SHIPPING_CHARGE = 70;
//     let shippingCharge = 0;
//     let shippingMessage = "";

//     if (grandTotal >= FREE_SHIPPING_THRESHOLD) {
//       shippingCharge = 0;
//       shippingMessage = "🎉 Hurray! You get FREE shipping on your order!";
//     } else {
//       shippingCharge = SHIPPING_CHARGE;
//       const amountToFree = round2(FREE_SHIPPING_THRESHOLD - grandTotal);
//       shippingMessage = `📦 Add just ₹${amountToFree} more to your order to enjoy FREE shipping!`;
//       grandTotal += SHIPPING_CHARGE;
//     }

//     /* -------------------- Response -------------------- */
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
//     });

//   } catch (error) {
//     console.error("getCartSummary error:", error);
//     res.status(500).json({ message: "Failed to get cart summary", error: error.message });
//   }
// };

// export const addToCart = async (req, res) => {
//   try {
//     const { productId, variants = [], quantity: qty = 1 } = req.body;
//     const product = await Product.findById(productId);
//     if (!product) return res.status(404).json({ message: "Product not found" });

//     let cart;
//     if (req.user?._id) {
//       // Logged-in user flow
//       const user = await User.findById(req.user._id);
//       cart = await handleCart(user.cart, product, variants, qty);
//       user.cart = cart;
//       await user.save();
//     } else {
//       // Guest flow
//       cart = await handleCart(req.session.guestCart, product, variants, qty);
//       req.session.guestCart = cart;
//       await new Promise((resolve, reject) => {
//         req.session.save(err => (err ? reject(err) : resolve()));
//       });
//     }

//     res.status(200).json({ message: "✅ Added to cart", cart });
//   } catch (err) {
//     console.error("addToCart error:", err);
//     res.status(500).json({ message: "Something went wrong", error: err.message });
//   }
// };

// // Helper to add/update cart items
// async function handleCart(cart, product, variants, qty) {
//   if (!Array.isArray(cart)) cart = [];

//   // 🧩 CASE 1 — Non-variant product
//   if (variants.length === 0) {
//     const stock = Number(product.quantity ?? 0);

//     if (qty > stock) {
//       throw new Error(`Only ${stock} items available in stock`);
//     }

//     const existing = cart.find(
//       item => item.product.toString() === product._id.toString() && !item.selectedVariant
//     );

//     if (existing) {
//       if (existing.quantity + qty > stock) {
//         throw new Error(`You can only add ${stock - existing.quantity} more items for this product`);
//       }
//       existing.quantity += qty;
//     } else {
//       cart.push({ product: product._id, quantity: qty, selectedVariant: null });
//     }

//     return cart;
//   }

//   // 🧩 CASE 2 — Variant product
//   for (const { variantSku, quantity } of variants) {
//     if (!quantity || quantity <= 0) continue;

//     const variant = product.variants.find(v => v.sku === variantSku);
//     if (!variant) throw new Error(`Variant not found for SKU: ${variantSku}`);

//     const stock = Number(variant.stock ?? 0);

//     // 🛑 Stock check — prevent adding beyond available
//     if (quantity > stock) {
//       throw new Error(`Only ${stock} items available for ${variant.shadeName || variantSku}`);
//     }

//     const existing = cart.find(
//       item => item.product.toString() === product._id.toString() && item.selectedVariant?.sku === variantSku
//     );

//     if (existing) {
//       if (existing.quantity + quantity > stock) {
//         throw new Error(
//           `You can only add ${stock - existing.quantity} more items for ${variant.shadeName || variantSku}`
//         );
//       }
//       existing.quantity += quantity;
//     } else {
//       const selectedVariant = {
//         sku: variant.sku,
//         shadeName: variant.shadeName || null,
//         hex: variant.hex || null,
//         images: variant.images?.length ? variant.images : product.images || [],
//         price: variant.price ?? product.price,
//         discountedPrice: variant.discountedPrice ?? product.discountedPrice ?? product.price,
//         stock: stock,
//       };

//       cart.push({ product: product._id, quantity, selectedVariant });
//     }
//   }

//   return cart;
// }

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
      if (existing.quantity + quantity > stock) {
        const canAdd = Math.max(0, stock - existing.quantity);
        throw new Error(
          `You can only add ${canAdd} more item${canAdd !== 1 ? "s" : ""} for ${variant.shadeName || variantSku}.`
        );
      }
      existing.quantity += quantity;
    } else {
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

// // Helper to add/update cart items
// async function handleCart(cart, product, variants, qty) {
//   if (!Array.isArray(cart)) cart = [];

//   if (variants.length === 0) {
//     const existing = cart.find(item => item.product.toString() === product._id.toString() && !item.selectedVariant);
//     if (existing) existing.quantity += qty;
//     else cart.push({ product: product._id, quantity: qty, selectedVariant: null });
//   } else {
//     for (const { variantSku, quantity } of variants) {
//       if (!quantity || quantity <= 0) continue;
//       const variant = product.variants.find(v => v.sku === variantSku);
//       if (!variant) continue;

//       const selectedVariant = {
//         sku: variant.sku,
//         shadeName: variant.shadeName || null,
//         hex: variant.hex || null,
//         images: variant.images?.length ? variant.images : product.images || [],
//         price: variant.price ?? product.price,
//         discountedPrice: variant.discountedPrice ?? product.discountedPrice ?? product.price,
//         stock: variant.stock ?? 0,
//       };

//       const existing = cart.find(
//         item => item.product.toString() === product._id.toString() && item.selectedVariant?.sku === variantSku
//       );

//       if (existing) existing.quantity += quantity;
//       else cart.push({ product: product._id, quantity, selectedVariant });
//     }
//   }

//   return cart;
// }



export const getCartSummary = async (req, res) => {
  try {
    let cartSource;
    let isGuest = false;

    // -------------------- Determine Cart Source --------------------
    if (req.user && req.user._id) {
      const user = await User.findById(req.user._id).populate("cart.product");
      if (!user) return res.status(404).json({ message: "User not found" });
      cartSource = user.cart.filter(item => item.product); // remove invalid items
    }
    else if (req.session.guestCart && req.session.guestCart.length) {
      isGuest = true;
      cartSource = req.session.guestCart;

      // Populate product details
      const productIds = cartSource.map(i => i.product);
      const products = await Product.find({ _id: { $in: productIds } }).lean();

      cartSource = cartSource.map(item => {
        const productDoc = products.find(p => p._id.toString() === item.product.toString());
        return {
          ...item,
          product: productDoc || { _id: item.product }
        };
      });
    }
    else {
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
      userContext: req.user ? { isNewUser: req.user.isNewUser } : {}
    });
    const { items: promoItems, summary, appliedPromotions } = promoResult;

    // -------------------- Coupons --------------------
    let applicableCoupons = [];
    let inapplicableCoupons = [];
    let appliedCoupon = null;
    let discountFromCoupon = 0;

    if (req.user && req.user._id) {
      const allDiscountDocs = await Discount.find({ status: "Active" }).lean();
      const nonPromoItemsInput = promoItems.filter(i => !i.discounts?.length)
        .map(i => ({ productId: i.productId, qty: i.qty }));

      const couponsChecked = await Promise.all(
        allDiscountDocs.map(async (d) => {
          try {
            if (!nonPromoItemsInput.length) throw new Error("No items");
            await validateDiscountForCartInternal({ code: d.code, cart: nonPromoItemsInput, userId: req.user._id });
            return { code: d.code, label: d.name, type: d.type, value: d.value, status: "Applicable", message: `Apply code ${d.code} and save ${d.type === "Percentage" ? d.value + "%" : "₹" + d.value}` };
          } catch {
            return { code: d.code, label: d.name, type: d.type, value: d.value, status: "Not applicable", message: "Not valid for current cart" };
          }
        })
      );

      applicableCoupons = couponsChecked.filter(c => c.status === "Applicable");
      inapplicableCoupons = couponsChecked.filter(c => c.status !== "Applicable");

      if (req.query.discount && nonPromoItemsInput.length) {
        try {
          const result = await validateDiscountForCartInternal({ code: req.query.discount.trim(), cart: nonPromoItemsInput, userId: req.user._id });
          const COUPON_MAX_CAP = result.discount.maxCap || 500;
          discountFromCoupon = Math.min(result.priced.discountAmount, COUPON_MAX_CAP);
          appliedCoupon = { code: result.discount.code, discount: discountFromCoupon };
        } catch { appliedCoupon = null; discountFromCoupon = 0; }
      }
    }

    // -------------------- Referral Points --------------------
    let pointsUsed = 0, pointsDiscount = 0, pointsMessage = "";
    if (req.user && req.user._id && req.query.pointsToUse) {
      const wallet = await getOrCreateWallet(req.user._id);
      pointsUsed = Math.min(Number(req.query.pointsToUse), wallet.rewardPoints);
      pointsDiscount = pointsUsed * 0.1;
      pointsMessage = pointsUsed ? `🎉 You used ${pointsUsed} points from your wallet! Discount applied: ₹${pointsDiscount}` : "";
    }

    // -------------------- Gift Card --------------------
    let giftCardApplied = null, giftCardDiscount = 0;
    if (req.query.giftCardCode && req.query.giftCardPin) {
      const giftCard = await GiftCard.findOne({ code: req.query.giftCardCode.trim(), pin: req.query.giftCardPin.trim() });
      if (!giftCard || giftCard.expiryDate < new Date() || giftCard.balance <= 0) {
        giftCardApplied = { status: "Invalid", message: "❌ Gift card not valid" };
      } else {
        const requested = Number(req.query.giftCardAmount || 0);
        const maxRedeemable = Math.min(requested, giftCard.balance, summary.payable - discountFromCoupon - pointsDiscount);
        giftCardDiscount = maxRedeemable;
        giftCardApplied = {
          status: "Applied",
          code: giftCard.code,
          appliedAmount: giftCardDiscount,
          remainingBalance: giftCard.balance - giftCardDiscount,
          message: `🎉 Successfully applied ₹${giftCardDiscount} from your gift card!`
        };
      }
    }

    // -------------------- Variant + Price Build --------------------
    const round2 = n => Math.round(n * 100) / 100;
    const now = new Date();
    const activePromotions = await Promotion.find({ status: "active", startDate: { $lte: now }, endDate: { $gte: now } }).lean();

    const finalCart = validCartItems.map(item => {
      const productDoc = item.product?._id ? item.product : { _id: item.product, name: "Unknown Product", variants: [], images: [] };
      const variantFromProduct = item.selectedVariant?.sku
        ? productDoc.variants.find(v => v.sku === item.selectedVariant.sku)
        : null;

      const calcVariant = variantFromProduct
        ? calculateVariantPrices([variantFromProduct], productDoc, activePromotions)[0]
        : calculateVariantPrices([getPseudoVariant(productDoc)], productDoc, activePromotions)[0];

      const enrichedVariant = {
        ...calcVariant,
        images: Array.isArray(variantFromProduct?.images) && variantFromProduct.images.length
          ? variantFromProduct.images
          : Array.isArray(calcVariant.images) && calcVariant.images.length
            ? calcVariant.images
            : Array.isArray(productDoc.images) && productDoc.images.length
              ? productDoc.images
              : [],
        shadeName: calcVariant?.shadeName || variantFromProduct?.shadeName || null,
        hex: calcVariant?.hex || variantFromProduct?.hex || null,
        sku: variantFromProduct?.sku || calcVariant?.sku || null,
      };

      return {
        _id: item._id,
        product: productDoc._id,
        name: enrichedVariant?.shadeName ? `${productDoc.name} - ${enrichedVariant.shadeName}` : productDoc.name,
        quantity: item.quantity,
        variant: {
          sku: enrichedVariant.sku,
          shadeName: enrichedVariant.shadeName,
          hex: enrichedVariant.hex,
          image: enrichedVariant.images[0] || null,
          stock: enrichedVariant.stock,
          originalPrice: enrichedVariant.originalPrice,
          discountedPrice: enrichedVariant.displayPrice,
          displayPrice: enrichedVariant.displayPrice,
          discountPercent: enrichedVariant.discountPercent,
          discountAmount: enrichedVariant.discountAmount,
        }
      };
    });

    // -------------------- Price Calculations --------------------
    const bagMrp = round2(finalCart.reduce((sum, item) => sum + (item.variant.originalPrice || 0) * item.quantity, 0));
    const bagPayable = round2(finalCart.reduce((sum, item) => sum + (item.variant.displayPrice || 0) * item.quantity, 0));
    const totalSavings = round2(bagMrp - bagPayable + discountFromCoupon + pointsDiscount + giftCardDiscount);
    let grandTotal = round2(bagPayable - discountFromCoupon - pointsDiscount - giftCardDiscount);

    // -------------------- Shipping --------------------
    const FREE_SHIPPING_THRESHOLD = 499;
    const SHIPPING_CHARGE = 70;
    let shippingCharge = 0;
    let shippingMessage = "";

    if (grandTotal >= FREE_SHIPPING_THRESHOLD) {
      shippingCharge = 0;
      shippingMessage = "🎉 Hurray! You get FREE shipping on your order!";
    } else {
      shippingCharge = SHIPPING_CHARGE;
      const amountToFree = round2(FREE_SHIPPING_THRESHOLD - grandTotal);
      shippingMessage = `📦 Add just ₹${amountToFree} more to your order to enjoy FREE shipping!`;
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
      isGuest
    });

  } catch (error) {
    console.error("getCartSummary error:", error);
    res.status(500).json({ message: "Failed to get cart summary", error: error.message });
  }
};

