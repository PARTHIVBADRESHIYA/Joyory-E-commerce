import User from "../../models/User.js";
import Discount from "../../models/Discount.js";
import Promotion from "../../models/Promotion.js";
import Affiliate from "../../models/Affiliate.js";
import { validateDiscount } from "../../middlewares/validateDiscount.js";
import {
  fetchProductsForCart,
  pickCartProducts,
  cartSubtotal,
  validateDiscountForCartInternal,
  computeEligibleDiscountsForCart
} from "../../controllers/user/userDiscountController.js"; // import helpers
import Product from "../../models/Product.js";
import {
  productMatchesPromo,
  applyFlatDiscount,
  bestTierForQty, isObjectId, asMoney
} from "../../controllers/user/userPromotionController.js";
import { getOrCreateWallet } from "../../middlewares/utils/walletHelpers.js";
import {enrichProductWithStockAndOptions} from "../../middlewares/services/productHelpers.js";

import { applyPromotions } from "../../middlewares/services/promotionEngine.js";
import Referral from "../../models/Referral.js";
import GiftCard from "../../models/GiftCard.js";
import { calculateCartSummary } from "../../middlewares/utils/cartPricingHelper.js";

// // ✅ Add to Cart with shade/variant selection
// export const addToCart = async (req, res) => {
//   const { productId, quantity, variantSku } = req.body;
//   const user = await User.findById(req.user._id);
//   const product = await Product.findById(productId);

//   if (!product) return res.status(404).json({ message: "Product not found" });

//   let selectedVariant = null;
//   if (variantSku) {
//     const variant = product.variants.find(v => v.sku === variantSku);
//     if (variant) {
//       selectedVariant = {
//         sku: variant.sku,
//         shadeName: variant.shadeName,
//         hex: variant.hex,
//         image: variant.images?.[0] || product.images?.[0] || null
//       };
//     }
//   }

//   // Check if already exists in cart with same variant
//   const existing = user.cart.find(
//     item =>
//       item.product.toString() === productId &&
//       (!variantSku || item.selectedVariant?.sku === variantSku)
//   );

//   if (existing) {
//     existing.quantity += quantity;
//   } else {
//     user.cart.push({
//       product: productId,
//       quantity,
//       selectedVariant
//     });
//   }

//   await user.save();
//   res.status(200).json({ message: "✅ Added to cart", cart: user.cart });
// }

export const addToCart = async (req, res) => {
  try {
    const { productId, variants = [], quantity: qty = 1 } = req.body;
    // variants = [{ variantSku: "401", quantity: 1 }, { variantSku: "402", quantity: 2 }]

    const user = await User.findById(req.user._id);
    const product = await Product.findById(productId);

    if (!product) return res.status(404).json({ message: "Product not found" });

    if (variants.length === 0) {
      const existing = user.cart.find(item => item.product.toString() === productId && !item.selectedVariant);
      if (existing) {
        existing.quantity += qty; // now adds the requested quantity
      } else {
        user.cart.push({
          product: productId,
          quantity: qty,  // uses the quantity from request
          selectedVariant: null
        });
      }
    } else {
      for (const { variantSku, quantity } of variants) {
        if (!quantity || quantity <= 0) continue;

        let selectedVariant = null;
        if (variantSku) {
          const variant = product.variants.find(v => v.sku === variantSku);
          if (variant) {
            selectedVariant = {
              sku: variant.sku,
              shadeName: variant.shadeName,
              hex: variant.hex,
              image: variant.images?.[0] || product.images?.[0] || null
            };
          } else {
            continue;
          }
        }

        const existing = user.cart.find(
          item =>
            item.product.toString() === productId &&
            (!variantSku || item.selectedVariant?.sku === variantSku)
        );

        if (existing) {
          existing.quantity += quantity;
        } else {
          user.cart.push({
            product: productId,
            quantity,
            selectedVariant
          });
        }
      }
    }

    await user.save();
    res.status(200).json({ message: "✅ Added to cart", cart: user.cart });
  } catch (err) {
    res.status(500).json({ message: "Something went wrong", error: err.message });
  }
};



// -------------------- ADD TO CART --------------------
// export const addToCart = async (req, res) => {
//   try {
//     const { productId, quantity, variantSku } = req.body;
//     const user = await User.findById(req.user._id);
//     const product = await Product.findById(productId);

//     if (!product)
//       return res.status(404).json({ message: "Product not found" });

//     let selectedVariant = null;
//     let maxAvailable = 0;

//     if (variantSku) {
//       const variant = product.variants.find(v => v.sku === variantSku);
//       if (!variant)
//         return res.status(404).json({ message: "Variant not found" });

//       if (variant.stock <= 0)
//         return res.status(400).json({
//           message: `❌ Variant "${variant.shadeName}" is out of stock.`
//         });

//       selectedVariant = {
//         sku: variant.sku,
//         shadeName: variant.shadeName,
//         hex: variant.hex,
//         image: variant.images?.[0] || product.images?.[0] || null
//       };

//       maxAvailable = variant.stock;
//     } else {
//       if (product.quantity <= 0)
//         return res.status(400).json({ message: "❌ Product is out of stock" });

//       maxAvailable = product.quantity;
//     }

//     // Check current quantity in cart
//     const existing = user.cart.find(
//       item => item.product.toString() === productId &&
//         (!variantSku || item.selectedVariant?.sku === variantSku)
//     );

//     const existingQty = existing ? existing.quantity : 0;

//     // Prevent exceeding stock
//     if (existingQty + quantity > maxAvailable) {
//       return res.status(400).json({
//         message: `❌ Cannot add ${quantity} items. Only ${maxAvailable - existingQty} left in stock.`
//       });
//     }

//     // Add or update cart
//     if (existing) {
//       existing.quantity += quantity;
//     } else {
//       user.cart.push({ product: productId, quantity, selectedVariant });
//     }

//     await user.save();
//     res.status(200).json({ message: "✅ Added to cart", cart: user.cart });

//   } catch (err) {
//     console.error("addToCart error:", err);
//     res.status(500).json({ message: "Failed to add to cart", error: err.message });
//   }
// };

// export const addToCart = async (req, res) => {
//   try {
//     const { productId, quantity = 1, variantSku } = req.body;
//     const user = await User.findById(req.user._id);
//     const product = await Product.findById(productId);

//     if (!product)
//       return res.status(404).json({ message: "Product not found" });

//     let selectedVariant = null;
//     let maxAvailable = 0;

//     // ✅ Variant exists
//     if (product.variants?.length) {
//       if (variantSku) {
//         const variant = product.variants.find(v => v.sku === variantSku);
//         if (!variant)
//           return res.status(404).json({ message: "Variant not found" });

//         if (variant.stock <= 0)
//           return res.status(400).json({
//             message: `❌ Variant "${variant.shadeName}" is out of stock.`
//           });

//         selectedVariant = {
//           sku: variant.sku,
//           shadeName: variant.shadeName,
//           hex: variant.hex,
//           image: variant.images?.[0] || product.images?.[0] || null
//         };
//         maxAvailable = variant.stock;

//       } else {
//         // 🔹 Auto-select first in-stock variant
//         const availableVariant = product.variants.find(v => v.stock > 0);
//         if (!availableVariant)
//           return res.status(400).json({ message: "❌ All variants are out of stock" });

//         selectedVariant = {
//           sku: availableVariant.sku,
//           shadeName: availableVariant.shadeName,
//           hex: availableVariant.hex,
//           image: availableVariant.images?.[0] || product.images?.[0] || null
//         };
//         maxAvailable = availableVariant.stock;
//       }

//     } else {
//       // 🔹 Non-variant product
//       if (product.quantity <= 0)
//         return res.status(400).json({ message: "❌ Product is out of stock" });

//       maxAvailable = product.quantity;
//     }

//     // Check current quantity in cart
//     const existing = user.cart.find(
//       item =>
//         item.product.toString() === productId &&
//         (!variantSku || item.selectedVariant?.sku === selectedVariant?.sku)
//     );

//     const existingQty = existing ? existing.quantity : 0;

//     // Prevent exceeding stock
//     if (existingQty + quantity > maxAvailable) {
//       return res.status(400).json({
//         message: `❌ Cannot add ${quantity} items. Only ${maxAvailable - existingQty} left in stock.`
//       });
//     }

//     // Add or update cart
//     if (existing) {
//       existing.quantity += quantity;
//     } else {
//       user.cart.push({ product: productId, quantity, selectedVariant });
//     }

//     await user.save();
//     res.status(200).json({ message: "✅ Added to cart", cart: user.cart });

//   } catch (err) {
//     console.error("addToCart error:", err);
//     res.status(500).json({ message: "Failed to add to cart", error: err.message });
//   }
// };

// export const addToCart = async (req, res) => {
//   try {
//     const { productId, quantity = 1, variantSku } = req.body;
//     const user = await User.findById(req.user._id);
//     const product = await Product.findById(productId);

//     if (!product)
//       return res.status(404).json({ message: "Product not found" });

//     let selectedVariant = null;
//     let maxAvailable = 0;

//     // ✅ If product has variants → variantSku must be provided
//     if (product.variants?.length) {
//       if (!variantSku) {
//         return res.status(400).json({
//           message: "❌ Please select a variant before adding to cart"
//         });
//       }

//       const variant = product.variants.find(v => v.sku === variantSku);
//       if (!variant)
//         return res.status(404).json({ message: "Variant not found" });

//       if (variant.stock <= 0)
//         return res.status(400).json({
//           message: `❌ Variant "${variant.shadeName}" is out of stock.`
//         });

//       selectedVariant = {
//         sku: variant.sku,
//         shadeName: variant.shadeName,
//         hex: variant.hex,
//         image: variant.images?.[0] || product.images?.[0] || null
//       };
//       maxAvailable = variant.stock;

//     } else {
//       // 🔹 Non-variant product
//       if (product.quantity <= 0)
//         return res.status(400).json({ message: "❌ Product is out of stock" });

//       maxAvailable = product.quantity;
//     }

//     // Check current quantity in cart
//     const existing = user.cart.find(
//       item =>
//         item.product.toString() === productId &&
//         (!variantSku || item.selectedVariant?.sku === selectedVariant?.sku)
//     );

//     const existingQty = existing ? existing.quantity : 0;

//     // Prevent exceeding stock
//     if (existingQty + quantity > maxAvailable) {
//       return res.status(400).json({
//         message: `❌ Cannot add ${quantity} items. Only ${maxAvailable - existingQty} left in stock.`
//       });
//     }

//     // Add or update cart
//     if (existing) {
//       existing.quantity += quantity;
//     } else {
//       user.cart.push({ product: productId, quantity, selectedVariant });
//     }

//     await user.save();
//     res.status(200).json({ message: "✅ Added to cart", cart: user.cart });

//   } catch (err) {
//     console.error("addToCart error:", err);
//     res.status(500).json({ message: "Failed to add to cart", error: err.message });
//   }
// };

// ✅ Get full cart
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

// ✅ Remove from cart
export const removeFromCart = async (req, res) => {
  try {
    const { productId, variantSku } = req.params;
    const user = await User.findById(req.user._id);

    if (!user) return res.status(404).json({ message: "User not found" });

    const updatedCart = user.cart.filter(
      p =>
        String(p.product) !== String(productId) ||
        (variantSku && p.selectedVariant?.sku !== variantSku)
    );

    user.cart = updatedCart;
    await user.save();

    res.status(200).json({ message: "❌ Removed from cart", cart: user.cart });
  } catch (err) {
    res.status(500).json({ message: "Error removing from cart", error: err.message });
  }
};

// export const getCartSummary = async (req, res) => {
//   try {
//     if (!req.user || !req.user._id) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }

//     const user = await User.findById(req.user._id).populate("cart.product");
//     if (!user) return res.status(404).json({ message: "User not found" });

//     const validCartItems = (user.cart || []).filter((item) => item.product);
//     if (!validCartItems.length) {
//       return res.status(400).json({ message: "Cart is empty" });
//     }

//     /* -------------------- 🔥 Apply Promotions -------------------- */
//     const itemsInput = validCartItems.map((i) => ({
//       productId: String(i.product._id),
//       qty: i.quantity,
//       selectedVariant: i.selectedVariant || null, // <-- add this
//     }));

//     const promoResult = await applyPromotions(itemsInput, {
//       userContext: { isNewUser: user.isNewUser },
//     });

//     const { items, summary, appliedPromotions } = promoResult;

//     /* -------------------- 🎟️ Coupon Discounts -------------------- */
//     const allDiscountDocs = await Discount.find({ status: "Active" }).lean();

//     const nonPromoItemsInput = items
//       .filter((i) => !i.discounts || i.discounts.length === 0)
//       .map((i) => ({
//         productId: i.productId,
//         qty: i.qty,
//       }));

//     const couponsChecked = await Promise.all(
//       allDiscountDocs.map(async (d) => {
//         try {
//           if (!nonPromoItemsInput.length) {
//             return {
//               code: d.code,
//               label: d.name,
//               type: d.type,
//               value: d.value,
//               status: "Not applicable",
//               message: "All items already on offer – coupons not applicable 🎉",
//             };
//           }

//           await validateDiscountForCartInternal({
//             code: d.code,
//             cart: nonPromoItemsInput,
//             userId: req.user._id,
//           });

//           return {
//             code: d.code,
//             label: d.name,
//             type: d.type,
//             value: d.value,
//             status: "Applicable",
//             message: `Apply code ${d.code} and save ${d.type === "Percentage" ? d.value + "%" : "₹" + d.value
//               } on non-promotional items`,
//           };
//         } catch {
//           return {
//             code: d.code,
//             label: d.name,
//             type: d.type,
//             value: d.value,
//             status: "Not applicable",
//             message: "Not valid for current cart",
//           };
//         }
//       })
//     );

//     const applicableCoupons = couponsChecked.filter((c) => c.status === "Applicable");
//     const inapplicableCoupons = couponsChecked.filter((c) => c.status !== "Applicable");

//     let appliedCoupon = null;
//     let discountFromCoupon = 0;

//     if (req.query.discount && nonPromoItemsInput.length) {
//       try {
//         const result = await validateDiscountForCartInternal({
//           code: req.query.discount.trim(),
//           cart: nonPromoItemsInput,
//           userId: req.user._id,
//         });

//         const COUPON_MAX_CAP = result.discount.maxCap || 500;
//         discountFromCoupon = Math.min(result.priced.discountAmount, COUPON_MAX_CAP);

//         appliedCoupon = {
//           code: result.discount.code,
//           discount: discountFromCoupon,
//         };
//       } catch {
//         appliedCoupon = null;
//         discountFromCoupon = 0;
//       }
//     }

//     /* -------------------- 💰 Apply Referral Points -------------------- */
//     let pointsUsed = 0;
//     let pointsDiscount = 0;
//     let pointsMessage = "";

//     const wallet = await getOrCreateWallet(req.user._id);

//     if (req.query.pointsToUse) {
//       pointsUsed = Number(req.query.pointsToUse);

//       if (!isNaN(pointsUsed) && pointsUsed > 0 && wallet.rewardPoints > 0) {
//         if (pointsUsed > wallet.rewardPoints) pointsUsed = wallet.rewardPoints;

//         pointsDiscount = pointsUsed * 0.1; // 1 point = ₹0.1
//         pointsMessage = `🎉 You used ${pointsUsed} points from your wallet! Discount applied: ₹${pointsDiscount}`;
//       }
//     }

//     /* -------------------- 🎁 Apply Gift Card -------------------- */
//     /* -------------------- 🎁 Apply Gift Card -------------------- */
//     let giftCardApplied = null;
//     let giftCardDiscount = 0;

//     if (req.query.giftCardCode && req.query.giftCardPin) {
//       const giftCard = await GiftCard.findOne({
//         code: req.query.giftCardCode.trim(),
//         pin: req.query.giftCardPin.trim(),
//       });

//       if (!giftCard) {
//         giftCardApplied = { status: "Invalid", message: "❌ Invalid gift card code or PIN" };
//       } else if (giftCard.expiryDate < new Date()) {
//         giftCardApplied = { status: "Invalid", message: "⏰ Gift card has expired" };
//       } else if (giftCard.balance <= 0) {
//         giftCardApplied = { status: "Invalid", message: "⚠️ Gift card has no balance left" };
//       } else {
//         const amountRequested = Number(req.query.giftCardAmount);

//         if (!amountRequested || amountRequested <= 0) {
//           giftCardApplied = { status: "Invalid", message: "⚠️ Please enter a valid amount to redeem" };
//         } else if (amountRequested > giftCard.balance) {
//           giftCardApplied = {
//             status: "Invalid",
//             message: `⚠️ Insufficient balance. Your card has only ₹${giftCard.balance} left`,
//           };
//         } else {
//           const payableBeforeGC = Math.max(
//             0,
//             summary.payable - discountFromCoupon - pointsDiscount
//           );

//           if (amountRequested > payableBeforeGC) {
//             giftCardApplied = {
//               status: "Invalid",
//               message: `⚠️ You tried to apply ₹${amountRequested}, but payable amount is only ₹${payableBeforeGC}`,
//             };
//           } else {
//             giftCardDiscount = amountRequested;
//             giftCardApplied = {
//               status: "Applied",
//               code: giftCard.code,
//               appliedAmount: giftCardDiscount,
//               remainingBalance: giftCard.balance - giftCardDiscount,
//               message: `🎉 Successfully applied ₹${giftCardDiscount} from your gift card!`,
//             };
//           }
//         }
//       }
//     }

//     /* -------------------- 📊 Final Totals -------------------- */
//     const round2 = (n) => Math.round(n * 100) / 100;
//     const grandTotal = round2(
//       Math.max(0, summary.payable - discountFromCoupon - pointsDiscount - giftCardDiscount)
//     );

//     /* -------------------- ✅ Response -------------------- */
//     res.json({
//       cart: items,
//       priceDetails: {
//         bagMrp: round2(summary.mrpTotal),
//         bagDiscount: round2(summary.savings),
//         autoDiscount: round2(summary.savings),
//         couponDiscount: round2(discountFromCoupon),
//         referralPointsDiscount: round2(pointsDiscount),
//         giftCardDiscount: round2(giftCardDiscount),
//         shipping: 0,
//         payable: grandTotal,
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
//     res.status(500).json({
//       message: "Failed to get cart summary",
//       error: error.message,
//     });
//   }
// };











// export const getCartSummary = async (req, res) => {
//   try {
//     if (!req.user || !req.user._id) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }

//     const user = await User.findById(req.user._id).populate("cart.product");
//     if (!user) return res.status(404).json({ message: "User not found" });

//     const validCartItems = (user.cart || []).filter((item) => item.product);
//     if (!validCartItems.length) {
//       return res.status(400).json({ message: "Cart is empty" });
//     }

//     /* -------------------- 🔥 Apply Promotions -------------------- */
//     const itemsInput = validCartItems.map((i) => ({
//       productId: String(i.product._id),
//       qty: i.quantity,
//       selectedVariant: i.selectedVariant || null,
//     }));

//     const promoResult = await applyPromotions(itemsInput, {
//       userContext: { isNewUser: user.isNewUser },
//     });

//     const { items, summary, appliedPromotions } = promoResult;

//     // ✅ Merge selectedVariant back from user.cart
//     const cartWithVariants = items.map((i) => {
//       const originalItem = validCartItems.find(
//         (v) => String(v.product._id) === i.productId
//       );
//       return {
//         ...i,
//         selectedVariant: originalItem?.selectedVariant || null,
//       };
//     });

//     /* -------------------- 🎟️ Coupon Discounts -------------------- */
//     const allDiscountDocs = await Discount.find({ status: "Active" }).lean();

//     const nonPromoItemsInput = cartWithVariants
//       .filter((i) => !i.discounts || i.discounts.length === 0)
//       .map((i) => ({
//         productId: i.productId,
//         qty: i.qty,
//       }));

//     const couponsChecked = await Promise.all(
//       allDiscountDocs.map(async (d) => {
//         try {
//           if (!nonPromoItemsInput.length) {
//             return {
//               code: d.code,
//               label: d.name,
//               type: d.type,
//               value: d.value,
//               status: "Not applicable",
//               message: "All items already on offer – coupons not applicable 🎉",
//             };
//           }

//           await validateDiscountForCartInternal({
//             code: d.code,
//             cart: nonPromoItemsInput,
//             userId: req.user._id,
//           });

//           return {
//             code: d.code,
//             label: d.name,
//             type: d.type,
//             value: d.value,
//             status: "Applicable",
//             message: `Apply code ${d.code} and save ${d.type === "Percentage" ? d.value + "%" : "₹" + d.value
//               } on non-promotional items`,
//           };
//         } catch {
//           return {
//             code: d.code,
//             label: d.name,
//             type: d.type,
//             value: d.value,
//             status: "Not applicable",
//             message: "Not valid for current cart",
//           };
//         }
//       })
//     );

//     const applicableCoupons = couponsChecked.filter((c) => c.status === "Applicable");
//     const inapplicableCoupons = couponsChecked.filter((c) => c.status !== "Applicable");

//     let appliedCoupon = null;
//     let discountFromCoupon = 0;

//     if (req.query.discount && nonPromoItemsInput.length) {
//       try {
//         const result = await validateDiscountForCartInternal({
//           code: req.query.discount.trim(),
//           cart: nonPromoItemsInput,
//           userId: req.user._id,
//         });

//         const COUPON_MAX_CAP = result.discount.maxCap || 500;
//         discountFromCoupon = Math.min(result.priced.discountAmount, COUPON_MAX_CAP);

//         appliedCoupon = {
//           code: result.discount.code,
//           discount: discountFromCoupon,
//         };
//       } catch {
//         appliedCoupon = null;
//         discountFromCoupon = 0;
//       }
//     }

//     /* -------------------- 💰 Apply Referral Points -------------------- */
//     let pointsUsed = 0;
//     let pointsDiscount = 0;
//     let pointsMessage = "";

//     const wallet = await getOrCreateWallet(req.user._id);

//     if (req.query.pointsToUse) {
//       pointsUsed = Number(req.query.pointsToUse);

//       if (!isNaN(pointsUsed) && pointsUsed > 0 && wallet.rewardPoints > 0) {
//         if (pointsUsed > wallet.rewardPoints) pointsUsed = wallet.rewardPoints;

//         pointsDiscount = pointsUsed * 0.1;
//         pointsMessage = `🎉 You used ${pointsUsed} points from your wallet! Discount applied: ₹${pointsDiscount}`;
//       }
//     }

//     /* -------------------- 🎁 Apply Gift Card -------------------- */
//     let giftCardApplied = null;
//     let giftCardDiscount = 0;

//     if (req.query.giftCardCode && req.query.giftCardPin) {
//       const giftCard = await GiftCard.findOne({
//         code: req.query.giftCardCode.trim(),
//         pin: req.query.giftCardPin.trim(),
//       });

//       if (!giftCard) {
//         giftCardApplied = { status: "Invalid", message: "❌ Invalid gift card code or PIN" };
//       } else if (giftCard.expiryDate < new Date()) {
//         giftCardApplied = { status: "Invalid", message: "⏰ Gift card has expired" };
//       } else if (giftCard.balance <= 0) {
//         giftCardApplied = { status: "Invalid", message: "⚠️ Gift card has no balance left" };
//       } else {
//         const amountRequested = Number(req.query.giftCardAmount);

//         if (!amountRequested || amountRequested <= 0) {
//           giftCardApplied = { status: "Invalid", message: "⚠️ Please enter a valid amount to redeem" };
//         } else if (amountRequested > giftCard.balance) {
//           giftCardApplied = {
//             status: "Invalid",
//             message: `⚠️ Insufficient balance. Your card has only ₹${giftCard.balance} left`,
//           };
//         } else {
//           const payableBeforeGC = Math.max(
//             0,
//             summary.payable - discountFromCoupon - pointsDiscount
//           );

//           if (amountRequested > payableBeforeGC) {
//             giftCardApplied = {
//               status: "Invalid",
//               message: `⚠️ You tried to apply ₹${amountRequested}, but payable amount is only ₹${payableBeforeGC}`,
//             };
//           } else {
//             giftCardDiscount = amountRequested;
//             giftCardApplied = {
//               status: "Applied",
//               code: giftCard.code,
//               appliedAmount: giftCardDiscount,
//               remainingBalance: giftCard.balance - giftCardDiscount,
//               message: `🎉 Successfully applied ₹${giftCardDiscount} from your gift card!`,
//             };
//           }
//         }
//       }
//     }

//     /* -------------------- 📊 Final Totals -------------------- */
//     const round2 = (n) => Math.round(n * 100) / 100;
//     const grandTotal = round2(
//       Math.max(0, summary.payable - discountFromCoupon - pointsDiscount - giftCardDiscount)
//     );

//     const groupedCart = Object.values(
//       cartWithVariants.reduce((acc, item) => {
//         const key = `${item.productId}_${item.selectedVariant?.sku || "default"}`;

//         if (!acc[key]) {
//           acc[key] = {
//             productId: item.productId,
//             product: item.product,
//             variant: {
//               sku: item.selectedVariant?.sku || null,
//               shadeName: item.selectedVariant?.shadeName || null,
//               hex: item.selectedVariant?.hex || null,
//               image: item.selectedVariant?.image || item.product.images?.[0] || null,
//               qty: 0,
//               discounts: [],
//             },
//           };
//         }

//         // merge quantity + discounts
//         acc[key].variant.qty += item.qty;
//         acc[key].variant.discounts = [
//           ...(acc[key].variant.discounts || []),
//           ...(item.discounts || []),
//         ];

//         return acc;
//       }, {})
//     );

//     // reshape into product → variants[]
//     const finalGroupedCart = Object.values(
//       groupedCart.reduce((acc, entry) => {
//         if (!acc[entry.productId]) {
//           acc[entry.productId] = {
//             productId: entry.productId,
//             product: entry.product,
//             variants: [],
//           };
//         }
//         acc[entry.productId].variants.push(entry.variant);
//         return acc;
//       }, {})
//     );


//     /* -------------------- ✅ Response -------------------- */
//     res.json({
//       cart: finalGroupedCart, // ✅ now grouped by product with variants inside
//       priceDetails: {
//         bagMrp: round2(summary.mrpTotal),
//         bagDiscount: round2(summary.savings),
//         autoDiscount: round2(summary.savings),
//         couponDiscount: round2(discountFromCoupon),
//         referralPointsDiscount: round2(pointsDiscount),
//         giftCardDiscount: round2(giftCardDiscount),
//         shipping: 0,
//         payable: grandTotal,
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
//     res.status(500).json({
//       message: "Failed to get cart summary",
//       error: error.message,
//     });
//   }
// };



// export const getCartSummary = async (req, res) => {
//   try {
//     if (!req.user || !req.user._id) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }

//     const user = await User.findById(req.user._id).populate("cart.product");
//     if (!user) return res.status(404).json({ message: "User not found" });

//     const validCartItems = (user.cart || []).filter((item) => item.product);
//     if (!validCartItems.length) {
//       return res.status(400).json({ message: "Cart is empty" });
//     }

//     /* -------------------- 🔥 Apply Promotions -------------------- */
//     const itemsInput = validCartItems.map((i) => ({
//       productId: String(i.product._id),
//       qty: i.quantity,
//       selectedVariant: i.selectedVariant || null,
//     }));

//     const promoResult = await applyPromotions(itemsInput, {
//       userContext: { isNewUser: user.isNewUser },
//     });

//     const { items, summary, appliedPromotions } = promoResult;

//     // ✅ Merge selectedVariant back from user.cart
//     const cartWithVariants = items.map((i) => {
//       const originalItem = validCartItems.find(
//         (v) =>
//           String(v.product._id) === i.productId &&
//           (v.selectedVariant?.sku === i.selectedVariant?.sku ||
//             (!v.selectedVariant && !i.selectedVariant))
//       );
//       return {
//         ...i,
//         selectedVariant: originalItem?.selectedVariant || null,
//         product: originalItem?.product || null, // keep populated product
//       };
//     });

//     /* -------------------- 🎟️ Coupon Discounts -------------------- */
//     const allDiscountDocs = await Discount.find({ status: "Active" }).lean();

//     const nonPromoItemsInput = cartWithVariants
//       .filter((i) => !i.discounts || i.discounts.length === 0)
//       .map((i) => ({
//         productId: i.productId,
//         qty: i.qty,
//       }));

//     const couponsChecked = await Promise.all(
//       allDiscountDocs.map(async (d) => {
//         try {
//           if (!nonPromoItemsInput.length) {
//             return {
//               code: d.code,
//               label: d.name,
//               type: d.type,
//               value: d.value,
//               status: "Not applicable",
//               message: "All items already on offer – coupons not applicable 🎉",
//             };
//           }

//           await validateDiscountForCartInternal({
//             code: d.code,
//             cart: nonPromoItemsInput,
//             userId: req.user._id,
//           });

//           return {
//             code: d.code,
//             label: d.name,
//             type: d.type,
//             value: d.value,
//             status: "Applicable",
//             message: `Apply code ${d.code} and save ${d.type === "Percentage" ? d.value + "%" : "₹" + d.value
//               } on non-promotional items`,
//           };
//         } catch {
//           return {
//             code: d.code,
//             label: d.name,
//             type: d.type,
//             value: d.value,
//             status: "Not applicable",
//             message: "Not valid for current cart",
//           };
//         }
//       })
//     );

//     const applicableCoupons = couponsChecked.filter(
//       (c) => c.status === "Applicable"
//     );
//     const inapplicableCoupons = couponsChecked.filter(
//       (c) => c.status !== "Applicable"
//     );

//     let appliedCoupon = null;
//     let discountFromCoupon = 0;

//     if (req.query.discount && nonPromoItemsInput.length) {
//       try {
//         const result = await validateDiscountForCartInternal({
//           code: req.query.discount.trim(),
//           cart: nonPromoItemsInput,
//           userId: req.user._id,
//         });

//         const COUPON_MAX_CAP = result.discount.maxCap || 500;
//         discountFromCoupon = Math.min(
//           result.priced.discountAmount,
//           COUPON_MAX_CAP
//         );

//         appliedCoupon = {
//           code: result.discount.code,
//           discount: discountFromCoupon,
//         };
//       } catch {
//         appliedCoupon = null;
//         discountFromCoupon = 0;
//       }
//     }

//     /* -------------------- 💰 Apply Referral Points -------------------- */
//     let pointsUsed = 0;
//     let pointsDiscount = 0;
//     let pointsMessage = "";

//     const wallet = await getOrCreateWallet(req.user._id);

//     if (req.query.pointsToUse) {
//       pointsUsed = Number(req.query.pointsToUse);

//       if (!isNaN(pointsUsed) && pointsUsed > 0 && wallet.rewardPoints > 0) {
//         if (pointsUsed > wallet.rewardPoints) pointsUsed = wallet.rewardPoints;

//         pointsDiscount = pointsUsed * 0.1;
//         pointsMessage = `🎉 You used ${pointsUsed} points from your wallet! Discount applied: ₹${pointsDiscount}`;
//       }
//     }

//     /* -------------------- 🎁 Apply Gift Card -------------------- */
//     let giftCardApplied = null;
//     let giftCardDiscount = 0;

//     if (req.query.giftCardCode && req.query.giftCardPin) {
//       const giftCard = await GiftCard.findOne({
//         code: req.query.giftCardCode.trim(),
//         pin: req.query.giftCardPin.trim(),
//       });

//       if (!giftCard) {
//         giftCardApplied = {
//           status: "Invalid",
//           message: "❌ Invalid gift card code or PIN",
//         };
//       } else if (giftCard.expiryDate < new Date()) {
//         giftCardApplied = {
//           status: "Invalid",
//           message: "⏰ Gift card has expired",
//         };
//       } else if (giftCard.balance <= 0) {
//         giftCardApplied = {
//           status: "Invalid",
//           message: "⚠️ Gift card has no balance left",
//         };
//       } else {
//         const amountRequested = Number(req.query.giftCardAmount);

//         if (!amountRequested || amountRequested <= 0) {
//           giftCardApplied = {
//             status: "Invalid",
//             message: "⚠️ Please enter a valid amount to redeem",
//           };
//         } else if (amountRequested > giftCard.balance) {
//           giftCardApplied = {
//             status: "Invalid",
//             message: `⚠️ Insufficient balance. Your card has only ₹${giftCard.balance} left`,
//           };
//         } else {
//           const payableBeforeGC = Math.max(
//             0,
//             summary.payable - discountFromCoupon - pointsDiscount
//           );

//           if (amountRequested > payableBeforeGC) {
//             giftCardApplied = {
//               status: "Invalid",
//               message: `⚠️ You tried to apply ₹${amountRequested}, but payable amount is only ₹${payableBeforeGC}`,
//             };
//           } else {
//             giftCardDiscount = amountRequested;
//             giftCardApplied = {
//               status: "Applied",
//               code: giftCard.code,
//               appliedAmount: giftCardDiscount,
//               remainingBalance: giftCard.balance - giftCardDiscount,
//               message: `🎉 Successfully applied ₹${giftCardDiscount} from your gift card!`,
//             };
//           }
//         }
//       }
//     }

//     /* -------------------- 📊 Final Totals -------------------- */
//     const round2 = (n) => Math.round(n * 100) / 100;
//     const grandTotal = round2(
//       Math.max(
//         0,
//         summary.payable - discountFromCoupon - pointsDiscount - giftCardDiscount
//       )
//     );


//     const groupedCart = Object.values(
//       cartWithVariants.reduce((acc, item) => {
//         const key = `${item.productId}_${item.selectedVariant?.sku || "default"}`;

//         if (!acc[key]) {
//           acc[key] = {
//             productId: item.productId,
//             product: item.product, // ✅ keep full product object
//             variant: {
//               sku: item.selectedVariant?.sku || null,
//               shadeName: item.selectedVariant?.shadeName || null,
//               hex: item.selectedVariant?.hex || null,
//               image: item.selectedVariant?.image || item.product?.images?.[0] || null, // ✅ fallback
//               qty: 0,
//               discounts: [],
//             },
//           };
//         }

//         // merge qty + discounts
//         acc[key].variant.qty += item.qty;
//         acc[key].variant.discounts = [
//           ...(acc[key].variant.discounts || []),
//           ...(item.discounts || []),
//         ];

//         return acc;
//       }, {})
//     );

//     // ✅ reshape into product → variants[]
//     const finalGroupedCart = Object.values(
//       groupedCart.reduce((acc, entry) => {
//         if (!acc[entry.productId]) {
//           acc[entry.productId] = {
//             productId: entry.productId,
//             product: entry.product, // ✅ no more null
//             variants: [],
//           };
//         }
//         acc[entry.productId].variants.push(entry.variant);
//         return acc;
//       }, {})
//     );
//     /* -------------------- ✅ Response -------------------- */
//     res.json({
//       cart: Object.values(finalGroupedCart),
//       priceDetails: {
//         bagMrp: round2(summary.mrpTotal),
//         bagDiscount: round2(summary.savings),
//         autoDiscount: round2(summary.savings),
//         couponDiscount: round2(discountFromCoupon),
//         referralPointsDiscount: round2(pointsDiscount),
//         giftCardDiscount: round2(giftCardDiscount),
//         shipping: 0,
//         payable: grandTotal,
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
//     res.status(500).json({
//       message: "Failed to get cart summary",
//       error: error.message,
//     });
//   }
// };


// export const getCartSummary = async (req, res) => {
//   try {
//     if (!req.user || !req.user._id) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }

//     const user = await User.findById(req.user._id).populate("cart.product");
//     if (!user) return res.status(404).json({ message: "User not found" });

//     const validCartItems = (user.cart || []).filter((item) => item.product);
//     if (!validCartItems.length) {
//       return res.status(400).json({ message: "Cart is empty" });
//     }

//     /* -------------------- 🔥 Apply Promotions -------------------- */
//     const itemsInput = validCartItems.map((i) => ({
//       productId: String(i.product._id),
//       qty: i.quantity,
//       selectedVariant: i.selectedVariant || null,
//     }));

//     const promoResult = await applyPromotions(itemsInput, {
//       userContext: { isNewUser: user.isNewUser },
//     });

//     const { items, summary, appliedPromotions } = promoResult;
//     const cartWithVariants = items.map((i) => {
//       const originalItem = validCartItems.find(
//         (v) => String(v.product._id) === i.productId
//       );

//       return {
//         ...i,
//         // always take variant from DB (user.cart), not from promoResult
//         selectedVariant: originalItem?.selectedVariant || null,
//         product: originalItem?.product || null,
//       };
//     });


//     /* -------------------- 🎟️ Coupon Discounts -------------------- */
//     const allDiscountDocs = await Discount.find({ status: "Active" }).lean();

//     const nonPromoItemsInput = cartWithVariants
//       .filter((i) => !i.discounts || i.discounts.length === 0)
//       .map((i) => ({
//         productId: i.productId,
//         qty: i.qty,
//       }));

//     const couponsChecked = await Promise.all(
//       allDiscountDocs.map(async (d) => {
//         try {
//           if (!nonPromoItemsInput.length) {
//             return {
//               code: d.code,
//               label: d.name,
//               type: d.type,
//               value: d.value,
//               status: "Not applicable",
//               message: "All items already on offer – coupons not applicable 🎉",
//             };
//           }

//           await validateDiscountForCartInternal({
//             code: d.code,
//             cart: nonPromoItemsInput,
//             userId: req.user._id,
//           });

//           return {
//             code: d.code,
//             label: d.name,
//             type: d.type,
//             value: d.value,
//             status: "Applicable",
//             message: `Apply code ${d.code} and save ${d.type === "Percentage" ? d.value + "%" : "₹" + d.value
//               } on non-promotional items`,
//           };
//         } catch {
//           return {
//             code: d.code,
//             label: d.name,
//             type: d.type,
//             value: d.value,
//             status: "Not applicable",
//             message: "Not valid for current cart",
//           };
//         }
//       })
//     );

//     const applicableCoupons = couponsChecked.filter(
//       (c) => c.status === "Applicable"
//     );
//     const inapplicableCoupons = couponsChecked.filter(
//       (c) => c.status !== "Applicable"
//     );

//     let appliedCoupon = null;
//     let discountFromCoupon = 0;

//     if (req.query.discount && nonPromoItemsInput.length) {
//       try {
//         const result = await validateDiscountForCartInternal({
//           code: req.query.discount.trim(),
//           cart: nonPromoItemsInput,
//           userId: req.user._id,
//         });

//         const COUPON_MAX_CAP = result.discount.maxCap || 500;
//         discountFromCoupon = Math.min(
//           result.priced.discountAmount,
//           COUPON_MAX_CAP
//         );

//         appliedCoupon = {
//           code: result.discount.code,
//           discount: discountFromCoupon,
//         };
//       } catch {
//         appliedCoupon = null;
//         discountFromCoupon = 0;
//       }
//     }

//     /* -------------------- 💰 Apply Referral Points -------------------- */
//     let pointsUsed = 0;
//     let pointsDiscount = 0;
//     let pointsMessage = "";

//     const wallet = await getOrCreateWallet(req.user._id);

//     if (req.query.pointsToUse) {
//       pointsUsed = Number(req.query.pointsToUse);

//       if (!isNaN(pointsUsed) && pointsUsed > 0 && wallet.rewardPoints > 0) {
//         if (pointsUsed > wallet.rewardPoints) pointsUsed = wallet.rewardPoints;

//         pointsDiscount = pointsUsed * 0.1;
//         pointsMessage = `🎉 You used ${pointsUsed} points from your wallet! Discount applied: ₹${pointsDiscount}`;
//       }
//     }

//     /* -------------------- 🎁 Apply Gift Card -------------------- */
//     let giftCardApplied = null;
//     let giftCardDiscount = 0;

//     if (req.query.giftCardCode && req.query.giftCardPin) {
//       const giftCard = await GiftCard.findOne({
//         code: req.query.giftCardCode.trim(),
//         pin: req.query.giftCardPin.trim(),
//       });

//       if (!giftCard) {
//         giftCardApplied = {
//           status: "Invalid",
//           message: "❌ Invalid gift card code or PIN",
//         };
//       } else if (giftCard.expiryDate < new Date()) {
//         giftCardApplied = {
//           status: "Invalid",
//           message: "⏰ Gift card has expired",
//         };
//       } else if (giftCard.balance <= 0) {
//         giftCardApplied = {
//           status: "Invalid",
//           message: "⚠️ Gift card has no balance left",
//         };
//       } else {
//         const amountRequested = Number(req.query.giftCardAmount);

//         if (!amountRequested || amountRequested <= 0) {
//           giftCardApplied = {
//             status: "Invalid",
//             message: "⚠️ Please enter a valid amount to redeem",
//           };
//         } else if (amountRequested > giftCard.balance) {
//           giftCardApplied = {
//             status: "Invalid",
//             message: `⚠️ Insufficient balance. Your card has only ₹${giftCard.balance} left`,
//           };
//         } else {
//           const payableBeforeGC = Math.max(
//             0,
//             summary.payable - discountFromCoupon - pointsDiscount
//           );

//           if (amountRequested > payableBeforeGC) {
//             giftCardApplied = {
//               status: "Invalid",
//               message: `⚠️ You tried to apply ₹${amountRequested}, but payable amount is only ₹${payableBeforeGC}`,
//             };
//           } else {
//             giftCardDiscount = amountRequested;
//             giftCardApplied = {
//               status: "Applied",
//               code: giftCard.code,
//               appliedAmount: giftCardDiscount,
//               remainingBalance: giftCard.balance - giftCardDiscount,
//               message: `🎉 Successfully applied ₹${giftCardDiscount} from your gift card!`,
//             };
//           }
//         }
//       }
//     }

//     /* -------------------- 📊 Final Totals -------------------- */
//     const round2 = (n) => Math.round(n * 100) / 100;
//     const grandTotal = round2(
//       Math.max(
//         0,
//         summary.payable - discountFromCoupon - pointsDiscount - giftCardDiscount
//       )
//     );
//     const finalCart = validCartItems.map((item) => {
//       // Product name
//       const productName = item.product?.name || "Unknown Product";

//       // Shade variant (color, etc.)
//       const displayName = item.selectedVariant?.shadeName
//         ? `${productName} - ${item.selectedVariant.shadeName}`
//         : productName;

//       // Variant (size, quantity, etc.), optional
//       const displayVariant = item.product?.variant || null; // e.g., "19g", "50ml"

//       return {
//         _id: item._id,
//         product: item.product?._id,
//         name: displayName,          // Name + shade
//         quantity: item.quantity,
//         selectedVariant: item.selectedVariant
//           ? {
//             sku: item.selectedVariant.sku,
//             shadeName: item.selectedVariant.shadeName,
//             hex: item.selectedVariant.hex,
//             image:
//               item.selectedVariant.image ||
//               item.product?.images?.[0] ||
//               null,
//           }
//           : null,
//         variant: displayVariant,    // size like 19g
//       };
//     });


//     /* -------------------- ✅ Response -------------------- */
//     res.json({
//       cart: finalCart,
//       priceDetails: {
//         bagMrp: round2(summary.mrpTotal),
//         bagDiscount: round2(summary.savings),
//         autoDiscount: round2(summary.savings),
//         couponDiscount: round2(discountFromCoupon),
//         referralPointsDiscount: round2(pointsDiscount),
//         giftCardDiscount: round2(giftCardDiscount),
//         shipping: 0,
//         payable: grandTotal,
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
//     res.status(500).json({
//       message: "Failed to get cart summary",
//       error: error.message,
//     });
//   }
// };


// export const getCartSummary = async (req, res) => {
//   try {
//     if (!req.user || !req.user._id) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }

//     const user = await User.findById(req.user._id).populate("cart.product");
//     if (!user) return res.status(404).json({ message: "User not found" });

//     const validCartItems = (user.cart || []).filter((item) => item.product);
//     if (!validCartItems.length) {
//       return res.status(400).json({ message: "Cart is empty" });
//     }

//     /* -------------------- 🔥 Apply Promotions -------------------- */
//     const itemsInput = validCartItems.map((i) => ({
//       productId: String(i.product._id),
//       qty: i.quantity,
//       selectedVariant: i.selectedVariant || null,
//     }));

//     const promoResult = await applyPromotions(itemsInput, {
//       userContext: { isNewUser: user.isNewUser },
//     });

//     const { items, summary, appliedPromotions } = promoResult;
//     const cartWithVariants = items.map((i) => {
//       const originalItem = validCartItems.find(
//         (v) => String(v.product._id) === i.productId
//       );

//       return {
//         ...i,
//         selectedVariant: originalItem?.selectedVariant || null,
//         product: originalItem?.product || null,
//       };
//     });

//     /* -------------------- 🎟️ Coupon Discounts -------------------- */
//     const allDiscountDocs = await Discount.find({ status: "Active" }).lean();

//     const nonPromoItemsInput = cartWithVariants
//       .filter((i) => !i.discounts || i.discounts.length === 0)
//       .map((i) => ({
//         productId: i.productId,
//         qty: i.qty,
//       }));

//     const couponsChecked = await Promise.all(
//       allDiscountDocs.map(async (d) => {
//         try {
//           if (!nonPromoItemsInput.length) {
//             return {
//               code: d.code,
//               label: d.name,
//               type: d.type,
//               value: d.value,
//               status: "Not applicable",
//               message: "All items already on offer – coupons not applicable 🎉",
//             };
//           }

//           await validateDiscountForCartInternal({
//             code: d.code,
//             cart: nonPromoItemsInput,
//             userId: req.user._id,
//           });

//           return {
//             code: d.code,
//             label: d.name,
//             type: d.type,
//             value: d.value,
//             status: "Applicable",
//             message: `Apply code ${d.code} and save ${d.type === "Percentage" ? d.value + "%" : "₹" + d.value
//               } on non-promotional items`,
//           };
//         } catch {
//           return {
//             code: d.code,
//             label: d.name,
//             type: d.type,
//             value: d.value,
//             status: "Not applicable",
//             message: "Not valid for current cart",
//           };
//         }
//       })
//     );

//     const applicableCoupons = couponsChecked.filter(
//       (c) => c.status === "Applicable"
//     );
//     const inapplicableCoupons = couponsChecked.filter(
//       (c) => c.status !== "Applicable"
//     );

//     let appliedCoupon = null;
//     let discountFromCoupon = 0;

//     if (req.query.discount && nonPromoItemsInput.length) {
//       try {
//         const result = await validateDiscountForCartInternal({
//           code: req.query.discount.trim(),
//           cart: nonPromoItemsInput,
//           userId: req.user._id,
//         });

//         const COUPON_MAX_CAP = result.discount.maxCap || 500;
//         discountFromCoupon = Math.min(
//           result.priced.discountAmount,
//           COUPON_MAX_CAP
//         );

//         appliedCoupon = {
//           code: result.discount.code,
//           discount: discountFromCoupon,
//         };
//       } catch {
//         appliedCoupon = null;
//         discountFromCoupon = 0;
//       }
//     }

//     /* -------------------- 💰 Apply Referral Points -------------------- */
//     let pointsUsed = 0;
//     let pointsDiscount = 0;
//     let pointsMessage = "";

//     const wallet = await getOrCreateWallet(req.user._id);

//     if (req.query.pointsToUse) {
//       pointsUsed = Number(req.query.pointsToUse);

//       if (!isNaN(pointsUsed) && pointsUsed > 0 && wallet.rewardPoints > 0) {
//         if (pointsUsed > wallet.rewardPoints) pointsUsed = wallet.rewardPoints;

//         pointsDiscount = pointsUsed * 0.1;
//         pointsMessage = `🎉 You used ${pointsUsed} points from your wallet! Discount applied: ₹${pointsDiscount}`;
//       }
//     }

//     /* -------------------- 🎁 Apply Gift Card -------------------- */
//     let giftCardApplied = null;
//     let giftCardDiscount = 0;

//     if (req.query.giftCardCode && req.query.giftCardPin) {
//       const giftCard = await GiftCard.findOne({
//         code: req.query.giftCardCode.trim(),
//         pin: req.query.giftCardPin.trim(),
//       });

//       if (!giftCard) {
//         giftCardApplied = {
//           status: "Invalid",
//           message: "❌ Invalid gift card code or PIN",
//         };
//       } else if (giftCard.expiryDate < new Date()) {
//         giftCardApplied = {
//           status: "Invalid",
//           message: "⏰ Gift card has expired",
//         };
//       } else if (giftCard.balance <= 0) {
//         giftCardApplied = {
//           status: "Invalid",
//           message: "⚠️ Gift card has no balance left",
//         };
//       } else {
//         const amountRequested = Number(req.query.giftCardAmount);

//         if (!amountRequested || amountRequested <= 0) {
//           giftCardApplied = {
//             status: "Invalid",
//             message: "⚠️ Please enter a valid amount to redeem",
//           };
//         } else if (amountRequested > giftCard.balance) {
//           giftCardApplied = {
//             status: "Invalid",
//             message: `⚠️ Insufficient balance. Your card has only ₹${giftCard.balance} left`,
//           };
//         } else {
//           const payableBeforeGC = Math.max(
//             0,
//             summary.payable - discountFromCoupon - pointsDiscount
//           );

//           if (amountRequested > payableBeforeGC) {
//             giftCardApplied = {
//               status: "Invalid",
//               message: `⚠️ You tried to apply ₹${amountRequested}, but payable amount is only ₹${payableBeforeGC}`,
//             };
//           } else {
//             giftCardDiscount = amountRequested;
//             giftCardApplied = {
//               status: "Applied",
//               code: giftCard.code,
//               appliedAmount: giftCardDiscount,
//               remainingBalance: giftCard.balance - giftCardDiscount,
//               message: `🎉 Successfully applied ₹${giftCardDiscount} from your gift card!`,
//             };
//           }
//         }
//       }
//     }

//     /* -------------------- 📊 Final Totals -------------------- */
//     const round2 = (n) => Math.round(n * 100) / 100;

//     // Subtotal after all discounts but before shipping
//     let grandTotal = round2(
//       Math.max(
//         0,
//         summary.payable - discountFromCoupon - pointsDiscount - giftCardDiscount
//       )
//     );

//     /* -------------------- 🚚 Shipping Logic -------------------- */
//     const FREE_SHIPPING_THRESHOLD = 499;
//     const SHIPPING_FEE = 70;

//     let shipping = SHIPPING_FEE;
//     let shippingDiscount = 0;
//     let shippingMessage = "";

//     // Case 1: Order qualifies for Free Shipping
//     if (grandTotal >= FREE_SHIPPING_THRESHOLD) {
//       shippingDiscount = SHIPPING_FEE;
//       shipping = 0;
//       shippingMessage = `🎉 Yay! You’ve unlocked Free Shipping and saved ₹${SHIPPING_FEE}.`;

//       // Case 2: Order does NOT qualify for Free Shipping
//     } else {
//       const remaining = FREE_SHIPPING_THRESHOLD - grandTotal;
//       shippingMessage = `✨ Shop for ₹${remaining} more to enjoy Free Shipping.`;
//     }

//     // Add shipping to grand total
//     grandTotal = round2(grandTotal + shipping);



//     const finalCart = validCartItems.map((item) => {
//       const productDoc = item.product;
//       const productName = productDoc?.name || "Unknown Product";

//       // If variant was chosen, find it
//       let variantData = null;
//       if (item.selectedVariant?.sku) {
//         const matchedVariant = productDoc?.variants?.find(v => v.sku === item.selectedVariant.sku);

//         if (matchedVariant) {
//           const originalPrice = matchedVariant.originalPrice || productDoc.price || 0;
//           const discountedPrice = matchedVariant.displayPrice || originalPrice;
//           const discountPercent = originalPrice > 0
//             ? Math.round(((originalPrice - discountedPrice) / originalPrice) * 100)
//             : 0;

//           variantData = {
//             sku: matchedVariant.sku,
//             shadeName: matchedVariant.shadeName,
//             hex: matchedVariant.hex,
//             image: matchedVariant.images?.[0] || productDoc.images?.[0] || null,
//             stock: matchedVariant.stock,
//             originalPrice,
//             discountedPrice,
//             discountPercent: discountPercent > 0 ? `${discountPercent}% off` : null,
//           };
//         }
//       }

//       const displayName = variantData?.shadeName
//         ? `${productName} - ${variantData.shadeName}`
//         : productName;

//       return {
//         _id: item._id,
//         product: productDoc?._id,
//         name: displayName,
//         quantity: item.quantity,
//         variant: variantData,  // 👈 Full enriched variant pricing
//       };
//     });


//     // Calculate total savings from all sources
//     const totalSavings = round2(
//       summary.savings +
//       discountFromCoupon +
//       pointsDiscount +
//       giftCardDiscount +
//       shippingDiscount
//     );

//     const savingsMessage = totalSavings > 0
//       ? `🎉 You saved ₹${totalSavings} on this order!`
//       : '';

//     /* -------------------- ✅ Response -------------------- */
//     res.json({
//       cart: finalCart,
//       priceDetails: {
//         bagMrp: round2(summary.mrpTotal),
//         totalSavings,   // 👈 NEW FIELD,
//         bagDiscount: round2(summary.savings),
//         autoDiscount: round2(summary.savings),
//         couponDiscount: round2(discountFromCoupon),
//         referralPointsDiscount: round2(pointsDiscount),
//         giftCardDiscount: round2(giftCardDiscount),
//         shippingFee: SHIPPING_FEE,        // Always show base fee
//         shippingDiscount,                 // Waived amount if free
//         shipping,                         // Final shipping charged
//         payable: grandTotal,
//         shippingMessage,
//         savingsMessage                      // Added message
//       },
//       appliedCoupon,
//       appliedPromotions,
//       applicableCoupons,
//       inapplicableCoupons,
//       pointsUsed,
//       pointsDiscount,
//       pointsMessage,
//       giftCardApplied,
//       grandTotal, // final amount user pays (includes shipping)
//     });
//   } catch (error) {
//     console.error("getCartSummary error:", error);
//     res.status(500).json({
//       message: "Failed to get cart summary",
//       error: error.message,
//     });
//   }
// };
// export const getCartSummary = async (req, res) => {
//   try {
//     if (!req.user || !req.user._id) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }

//     const user = await User.findById(req.user._id).populate("cart.product");
//     if (!user) return res.status(404).json({ message: "User not found" });

//     const validCartItems = (user.cart || []).filter((item) => item.product);
//     if (!validCartItems.length) {
//       return res.status(400).json({ message: "Cart is empty" });
//     }

//     /* -------------------- 🔥 Fetch Active Promotions -------------------- */
//     const now = new Date();
//     const promotions = await Promotion.find({
//       status: "active",
//       startDate: { $lte: now },
//       endDate: { $gte: now },
//     }).lean();

//     /* -------------------- 🔥 Apply Promotions -------------------- */
//     const itemsInput = validCartItems.map((i) => ({
//       productId: String(i.product._id),
//       qty: i.quantity,
//       selectedVariant: i.selectedVariant || null,
//     }));

//     const promoResult = await applyPromotions(itemsInput, {
//       userContext: { isNewUser: user.isNewUser },
//     });

//     const { items, summary, appliedPromotions } = promoResult;
//     const cartWithVariants = items.map((i) => {
//       const originalItem = validCartItems.find(
//         (v) => String(v.product._id) === i.productId
//       );

//       return {
//         ...i,
//         selectedVariant: originalItem?.selectedVariant || null,
//         product: originalItem?.product || null,
//       };
//     });

//     /* -------------------- 🎟️ Coupon Discounts -------------------- */
//     const allDiscountDocs = await Discount.find({ status: "Active" }).lean();

//     const nonPromoItemsInput = cartWithVariants
//       .filter((i) => !i.discounts || i.discounts.length === 0)
//       .map((i) => ({
//         productId: i.productId,
//         qty: i.qty,
//       }));

//     const couponsChecked = await Promise.all(
//       allDiscountDocs.map(async (d) => {
//         try {
//           if (!nonPromoItemsInput.length) {
//             return {
//               code: d.code,
//               label: d.name,
//               type: d.type,
//               value: d.value,
//               status: "Not applicable",
//               message: "All items already on offer – coupons not applicable 🎉",
//             };
//           }

//           await validateDiscountForCartInternal({
//             code: d.code,
//             cart: nonPromoItemsInput,
//             userId: req.user._id,
//           });

//           return {
//             code: d.code,
//             label: d.name,
//             type: d.type,
//             value: d.value,
//             status: "Applicable",
//             message: `Apply code ${d.code} and save ${
//               d.type === "Percentage" ? d.value + "%" : "₹" + d.value
//             } on non-promotional items`,
//           };
//         } catch {
//           return {
//             code: d.code,
//             label: d.name,
//             type: d.type,
//             value: d.value,
//             status: "Not applicable",
//             message: "Not valid for current cart",
//           };
//         }
//       })
//     );

//     const applicableCoupons = couponsChecked.filter(
//       (c) => c.status === "Applicable"
//     );
//     const inapplicableCoupons = couponsChecked.filter(
//       (c) => c.status !== "Applicable"
//     );

//     let appliedCoupon = null;
//     let discountFromCoupon = 0;

//     if (req.query.discount && nonPromoItemsInput.length) {
//       try {
//         const result = await validateDiscountForCartInternal({
//           code: req.query.discount.trim(),
//           cart: nonPromoItemsInput,
//           userId: req.user._id,
//         });

//         const COUPON_MAX_CAP = result.discount.maxCap || 500;
//         discountFromCoupon = Math.min(
//           result.priced.discountAmount,
//           COUPON_MAX_CAP
//         );

//         appliedCoupon = {
//           code: result.discount.code,
//           discount: discountFromCoupon,
//         };
//       } catch {
//         appliedCoupon = null;
//         discountFromCoupon = 0;
//       }
//     }

//     /* -------------------- 💰 Apply Referral Points -------------------- */
//     let pointsUsed = 0;
//     let pointsDiscount = 0;
//     let pointsMessage = "";

//     const wallet = await getOrCreateWallet(req.user._id);

//     if (req.query.pointsToUse) {
//       pointsUsed = Number(req.query.pointsToUse);

//       if (!isNaN(pointsUsed) && pointsUsed > 0 && wallet.rewardPoints > 0) {
//         if (pointsUsed > wallet.rewardPoints) pointsUsed = wallet.rewardPoints;

//         pointsDiscount = pointsUsed * 0.1;
//         pointsMessage = `🎉 You used ${pointsUsed} points from your wallet! Discount applied: ₹${pointsDiscount}`;
//       }
//     }

//     /* -------------------- 🎁 Apply Gift Card -------------------- */
//     let giftCardApplied = null;
//     let giftCardDiscount = 0;

//     if (req.query.giftCardCode && req.query.giftCardPin) {
//       const giftCard = await GiftCard.findOne({
//         code: req.query.giftCardCode.trim(),
//         pin: req.query.giftCardPin.trim(),
//       });

//       if (!giftCard) {
//         giftCardApplied = {
//           status: "Invalid",
//           message: "❌ Invalid gift card code or PIN",
//         };
//       } else if (giftCard.expiryDate < new Date()) {
//         giftCardApplied = {
//           status: "Invalid",
//           message: "⏰ Gift card has expired",
//         };
//       } else if (giftCard.balance <= 0) {
//         giftCardApplied = {
//           status: "Invalid",
//           message: "⚠️ Gift card has no balance left",
//         };
//       } else {
//         const amountRequested = Number(req.query.giftCardAmount);

//         if (!amountRequested || amountRequested <= 0) {
//           giftCardApplied = {
//             status: "Invalid",
//             message: "⚠️ Please enter a valid amount to redeem",
//           };
//         } else if (amountRequested > giftCard.balance) {
//           giftCardApplied = {
//             status: "Invalid",
//             message: `⚠️ Insufficient balance. Your card has only ₹${giftCard.balance} left`,
//           };
//         } else {
//           const payableBeforeGC = Math.max(
//             0,
//             summary.payable - discountFromCoupon - pointsDiscount
//           );

//           if (amountRequested > payableBeforeGC) {
//             giftCardApplied = {
//               status: "Invalid",
//               message: `⚠️ You tried to apply ₹${amountRequested}, but payable amount is only ₹${payableBeforeGC}`,
//             };
//           } else {
//             giftCardDiscount = amountRequested;
//             giftCardApplied = {
//               status: "Applied",
//               code: giftCard.code,
//               appliedAmount: giftCardDiscount,
//               remainingBalance: giftCard.balance - giftCardDiscount,
//               message: `🎉 Successfully applied ₹${giftCardDiscount} from your gift card!`,
//             };
//           }
//         }
//       }
//     }

//     /* -------------------- 📊 Final Totals -------------------- */
//     const round2 = (n) => Math.round(n * 100) / 100;

//     let grandTotal = round2(
//       Math.max(
//         0,
//         summary.payable - discountFromCoupon - pointsDiscount - giftCardDiscount
//       )
//     );

//     /* -------------------- 🚚 Shipping Logic -------------------- */
//     const FREE_SHIPPING_THRESHOLD = 499;
//     const SHIPPING_FEE = 70;

//     let shipping = SHIPPING_FEE;
//     let shippingDiscount = 0;
//     let shippingMessage = "";

//     if (grandTotal >= FREE_SHIPPING_THRESHOLD) {
//       shippingDiscount = SHIPPING_FEE;
//       shipping = 0;
//       shippingMessage = `🎉 Yay! You’ve unlocked Free Shipping and saved ₹${SHIPPING_FEE}.`;
//     } else {
//       const remaining = FREE_SHIPPING_THRESHOLD - grandTotal;
//       shippingMessage = `✨ Shop for ₹${remaining} more to enjoy Free Shipping.`;
//     }

//     grandTotal = round2(grandTotal + shipping);

//     /* -------------------- 🛒 Final Cart Items (enriched) -------------------- */
//     const finalCart = await Promise.all(
//       validCartItems.map(async (item) => {
//         let enrichedProduct = enrichProductWithStockAndOptions(
//           item.product.toObject ? item.product.toObject() : item.product,
//           promotions
//         );

//         const productName = enrichedProduct?.name || "Unknown Product";

//         let variantData = null;
//         if (item.selectedVariant?.sku) {
//           const matchedVariant = enrichedProduct?.variants?.find(
//             (v) => v.sku === item.selectedVariant.sku
//           );

//           if (matchedVariant) {
//             variantData = {
//               sku: matchedVariant.sku,
//               shadeName: matchedVariant.shadeName,
//               hex: matchedVariant.hex,
//               image:
//                 matchedVariant.images?.[0] ||
//                 enrichedProduct.images?.[0] ||
//                 null,
//               stock: matchedVariant.stock,
//               originalPrice: matchedVariant.originalPrice,
//               discountedPrice: matchedVariant.discountedPrice,
//               discountPercent: matchedVariant.discountPercent,
//             };
//           }
//         }

//         const displayName = variantData?.shadeName
//           ? `${productName} - ${variantData.shadeName}`
//           : productName;

//         return {
//           _id: item._id,
//           product: enrichedProduct?._id,
//           name: displayName,
//           quantity: item.quantity,
//           variant: variantData,
//         };
//       })
//     );

//     /* -------------------- 🧮 Savings -------------------- */
//     const totalSavings = round2(
//       summary.savings +
//         discountFromCoupon +
//         pointsDiscount +
//         giftCardDiscount +
//         shippingDiscount
//     );

//     const savingsMessage =
//       totalSavings > 0
//         ? `🎉 You saved ₹${totalSavings} on this order!`
//         : "";

//     /* -------------------- ✅ Response -------------------- */
//     res.json({
//       cart: finalCart,
//       priceDetails: {
//         bagMrp: round2(summary.mrpTotal),
//         totalSavings,
//         bagDiscount: round2(summary.savings),
//         autoDiscount: round2(summary.savings),
//         couponDiscount: round2(discountFromCoupon),
//         referralPointsDiscount: round2(pointsDiscount),
//         giftCardDiscount: round2(giftCardDiscount),
//         shippingFee: SHIPPING_FEE,
//         shippingDiscount,
//         shipping,
//         payable: grandTotal,
//         shippingMessage,
//         savingsMessage,
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
//     res.status(500).json({
//       message: "Failed to get cart summary",
//       error: error.message,
//     });
//   }
// };






// export const getCartSummary = async (req, res) => {
//   try {
//     if (!req.user || !req.user._id) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }

//     const user = await User.findById(req.user._id).populate("cart.product");
//     if (!user) return res.status(404).json({ message: "User not found" });

//     const validCartItems = (user.cart || []).filter((item) => item.product);
//     if (!validCartItems.length) {
//       return res.status(400).json({ message: "Cart is empty" });
//     }

//     /* -------------------- 🔥 Apply Promotions -------------------- */
//     const itemsInput = validCartItems.map((i) => ({
//       productId: String(i.product._id),
//       qty: i.quantity,
//       selectedVariant: i.selectedVariant || null,
//     }));

//     const promoResult = await applyPromotions(itemsInput, {
//       userContext: { isNewUser: user.isNewUser },
//     });

//     const { items: promoItems, summary, appliedPromotions } = promoResult;

//     /* -------------------- 🎟️ Coupons -------------------- */
//     const allDiscountDocs = await Discount.find({ status: "Active" }).lean();

//     const nonPromoItemsInput = promoItems
//       .filter((i) => !i.discounts || i.discounts.length === 0)
//       .map((i) => ({ productId: i.productId, qty: i.qty }));

//     const couponsChecked = await Promise.all(
//       allDiscountDocs.map(async (d) => {
//         try {
//           if (!nonPromoItemsInput.length) throw new Error("No items");
//           await validateDiscountForCartInternal({
//             code: d.code,
//             cart: nonPromoItemsInput,
//             userId: req.user._id,
//           });
//           return {
//             code: d.code,
//             label: d.name,
//             type: d.type,
//             value: d.value,
//             status: "Applicable",
//             message: `Apply code ${d.code} and save ${
//               d.type === "Percentage" ? d.value + "%" : "₹" + d.value
//             } on non-promotional items`,
//           };
//         } catch {
//           return {
//             code: d.code,
//             label: d.name,
//             type: d.type,
//             value: d.value,
//             status: "Not applicable",
//             message: "Not valid for current cart",
//           };
//         }
//       })
//     );

//     const applicableCoupons = couponsChecked.filter(
//       (c) => c.status === "Applicable"
//     );
//     const inapplicableCoupons = couponsChecked.filter(
//       (c) => c.status !== "Applicable"
//     );

//     let appliedCoupon = null;
//     let discountFromCoupon = 0;

//     if (req.query.discount && nonPromoItemsInput.length) {
//       try {
//         const result = await validateDiscountForCartInternal({
//           code: req.query.discount.trim(),
//           cart: nonPromoItemsInput,
//           userId: req.user._id,
//         });

//         const COUPON_MAX_CAP = result.discount.maxCap || 500;
//         discountFromCoupon = Math.min(result.priced.discountAmount, COUPON_MAX_CAP);

//         appliedCoupon = { code: result.discount.code, discount: discountFromCoupon };
//       } catch {
//         appliedCoupon = null;
//         discountFromCoupon = 0;
//       }
//     }

//     /* -------------------- 💰 Referral Points -------------------- */
//     const wallet = await getOrCreateWallet(req.user._id);
//     let pointsUsed = 0;
//     let pointsDiscount = 0;
//     let pointsMessage = "";

//     if (req.query.pointsToUse) {
//       pointsUsed = Math.min(Number(req.query.pointsToUse), wallet.rewardPoints);
//       pointsDiscount = pointsUsed * 0.1;
//       pointsMessage = pointsUsed
//         ? `🎉 You used ${pointsUsed} points from your wallet! Discount applied: ₹${pointsDiscount}`
//         : "";
//     }

//     /* -------------------- 🎁 Gift Card -------------------- */
//     let giftCardApplied = null;
//     let giftCardDiscount = 0;

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
//           message: `🎉 Successfully applied ₹${giftCardDiscount} from your gift card!`,
//         };
//       }
//     }

//     /* -------------------- 🛒 Final Cart Items (Variant-based pricing) -------------------- */
//     const round2 = (n) => Math.round(n * 100) / 100;

//     const finalCart = validCartItems.map((item) => {
//       const productDoc = item.product;
//       const variant = productDoc.variants?.find(
//         (v) => v.sku === item.selectedVariant?.sku
//       );

//       const originalPrice = variant?.originalPrice || productDoc.price || 0;
//       const discountedPrice = variant?.discountedPrice || originalPrice;
//       const discountPercent =
//         originalPrice > discountedPrice
//           ? `${Math.round(((originalPrice - discountedPrice) / originalPrice) * 100)}% off`
//           : null;

//       return {
//         _id: item._id,
//         product: productDoc._id,
//         name: variant?.shadeName ? `${productDoc.name} - ${variant.shadeName}` : productDoc.name,
//         quantity: item.quantity,
//         variant: {
//           sku: variant?.sku,
//           shadeName: variant?.shadeName,
//           hex: variant?.hex,
//           image: variant?.images?.[0] || productDoc.images?.[0],
//           stock: variant?.stock,
//           originalPrice,
//           discountedPrice,
//           discountPercent,
//         },
//       };
//     });

//     /* -------------------- 💰 Price Calculations -------------------- */
//     const bagMrp = round2(
//       finalCart.reduce((sum, item) => sum + (item.variant.originalPrice || 0) * item.quantity, 0)
//     );
//     const bagPayable = round2(
//       finalCart.reduce((sum, item) => sum + (item.variant.discountedPrice || 0) * item.quantity, 0)
//     );

//     const totalSavings = round2(
//       bagMrp - bagPayable + discountFromCoupon + pointsDiscount + giftCardDiscount
//     );

//     /* -------------------- 🚚 Shipping -------------------- */
//     const SHIPPING_FEE = 70;
//     let shipping = SHIPPING_FEE;
//     let shippingDiscount = 0;
//     let shippingMessage = "";

//     if (bagPayable >= 499) {
//       shippingDiscount = SHIPPING_FEE;
//       shipping = 0;
//       shippingMessage = `🎉 Yay! You’ve unlocked Free Shipping and saved ₹${SHIPPING_FEE}.`;
//     }

//     const grandTotal = round2(bagPayable - discountFromCoupon - pointsDiscount - giftCardDiscount + shipping);

//     /* -------------------- ✅ Response -------------------- */
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
//         shippingFee: SHIPPING_FEE,
//         shippingDiscount,
//         shipping,
//         payable: grandTotal,
//         shippingMessage,
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


export const getCartSummary = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(req.user._id).populate("cart.product");
    if (!user) return res.status(404).json({ message: "User not found" });

    const validCartItems = (user.cart || []).filter((item) => item.product);
    if (!validCartItems.length) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    /* -------------------- 🔥 Apply Promotions -------------------- */
    const itemsInput = validCartItems.map((i) => ({
      productId: String(i.product._id),
      qty: i.quantity,
      selectedVariant: i.selectedVariant || null,
    }));

    const promoResult = await applyPromotions(itemsInput, {
      userContext: { isNewUser: user.isNewUser },
    });

    const { items: promoItems, summary, appliedPromotions } = promoResult;

    /* -------------------- 🎟️ Coupons -------------------- */
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
            userId: req.user._id,
          });
          return {
            code: d.code,
            label: d.name,
            type: d.type,
            value: d.value,
            status: "Applicable",
            message: `Apply code ${d.code} and save ${
              d.type === "Percentage" ? d.value + "%" : "₹" + d.value
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

    const applicableCoupons = couponsChecked.filter(
      (c) => c.status === "Applicable"
    );
    const inapplicableCoupons = couponsChecked.filter(
      (c) => c.status !== "Applicable"
    );

    let appliedCoupon = null;
    let discountFromCoupon = 0;

    if (req.query.discount && nonPromoItemsInput.length) {
      try {
        const result = await validateDiscountForCartInternal({
          code: req.query.discount.trim(),
          cart: nonPromoItemsInput,
          userId: req.user._id,
        });

        const COUPON_MAX_CAP = result.discount.maxCap || 500;
        discountFromCoupon = Math.min(result.priced.discountAmount, COUPON_MAX_CAP);

        appliedCoupon = { code: result.discount.code, discount: discountFromCoupon };
      } catch {
        appliedCoupon = null;
        discountFromCoupon = 0;
      }
    }

    /* -------------------- 💰 Referral Points -------------------- */
    const wallet = await getOrCreateWallet(req.user._id);
    let pointsUsed = 0;
    let pointsDiscount = 0;
    let pointsMessage = "";

    if (req.query.pointsToUse) {
      pointsUsed = Math.min(Number(req.query.pointsToUse), wallet.rewardPoints);
      pointsDiscount = pointsUsed * 0.1;
      pointsMessage = pointsUsed
        ? `🎉 You used ${pointsUsed} points from your wallet! Discount applied: ₹${pointsDiscount}`
        : "";
    }

    /* -------------------- 🎁 Gift Card -------------------- */
    let giftCardApplied = null;
    let giftCardDiscount = 0;

    if (req.query.giftCardCode && req.query.giftCardPin) {
      const giftCard = await GiftCard.findOne({
        code: req.query.giftCardCode.trim(),
        pin: req.query.giftCardPin.trim(),
      });

      if (!giftCard || giftCard.expiryDate < new Date() || giftCard.balance <= 0) {
        giftCardApplied = { status: "Invalid", message: "❌ Gift card not valid" };
      } else {
        const requested = Number(req.query.giftCardAmount || 0);
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

    /* -------------------- 🛒 Final Cart Items (Variant-based pricing) -------------------- */
    const round2 = (n) => Math.round(n * 100) / 100;

    const finalCart = validCartItems.map((item) => {
      const productDoc = item.product;
      const variant = productDoc.variants?.find(
        (v) => v.sku === item.selectedVariant?.sku
      );

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

    /* -------------------- 💰 Price Calculations -------------------- */
    const bagMrp = round2(
      finalCart.reduce((sum, item) => sum + (item.variant.originalPrice || 0) * item.quantity, 0)
    );
    const bagPayable = round2(
      finalCart.reduce((sum, item) => sum + (item.variant.discountedPrice || 0) * item.quantity, 0)
    );

    const totalSavings = round2(
      bagMrp - bagPayable + discountFromCoupon + pointsDiscount + giftCardDiscount
    );

    /* -------------------- 🚚 Shipping -------------------- */
    // const SHIPPING_FEE = 70;
    // let shipping = SHIPPING_FEE;
    // let shippingDiscount = 0;
    // let shippingMessage = "";
    // if (bagPayable >= 499) {
    //   shippingDiscount = SHIPPING_FEE;
    //   shipping = 0;
    //   shippingMessage = `🎉 Yay! You’ve unlocked Free Shipping and saved ₹${SHIPPING_FEE}.`;
    // }

    const grandTotal = round2(bagPayable - discountFromCoupon - pointsDiscount - giftCardDiscount /* + shipping */);

    /* -------------------- ✅ Response -------------------- */
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
        // shippingFee: SHIPPING_FEE,
        // shippingDiscount,
        // shipping,
        payable: grandTotal,
        // shippingMessage,
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
    });
  } catch (error) {
    console.error("getCartSummary error:", error);
    res.status(500).json({ message: "Failed to get cart summary", error: error.message });
  }
};
