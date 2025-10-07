import User from "../../models/User.js";
import Discount from "../../models/Discount.js";
import {
  validateDiscountForCartInternal} from "../../controllers/user/userDiscountController.js"; // import helpers
import Product from "../../models/Product.js";
import { getOrCreateWallet } from "../../middlewares/utils/walletHelpers.js";
import { applyPromotions } from "../../middlewares/services/promotionEngine.js";
import GiftCard from "../../models/GiftCard.js";

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

    // /* -------------------- 🚚 Shipping -------------------- */
    // const SHIPPING_FEE = 70;
    // let shipping = SHIPPING_FEE;
    // let shippingDiscount = 0;
    // let shippingMessage = "";

    // if (bagPayable >= 499) {
    //   shippingDiscount = SHIPPING_FEE;
    //   shipping = 0;
    //   shippingMessage = `🎉 Yay! You’ve unlocked Free Shipping and saved ₹${SHIPPING_FEE}.`;
    // }

    const grandTotal = round2(bagPayable - discountFromCoupon - pointsDiscount - giftCardDiscount );

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

