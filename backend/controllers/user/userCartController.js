// import User from "../../models/User.js";
// import Discount from "../../models/Discount.js";
// import Affiliate from "../../models/Affiliate.js";
// import { validateDiscount } from "../../middlewares/validateDiscount.js";
// import {
//   fetchProductsForCart,
//   pickCartProducts,
//   cartSubtotal,
//   validateDiscountForCartInternal,
//   computeEligibleDiscountsForCart   } from "../../controllers/user/userDiscountController.js"; // import helpers

// export const addToCart = async (req, res) => {
//   const { productId, quantity } = req.body;
//   const user = await User.findById(req.user._id);

//   const existing = user.cart.find(item => item.product.toString() === productId);
//   if (existing) {
//     existing.quantity += quantity;
//   } else {
//     user.cart.push({ product: productId, quantity });
//   }

//   await user.save();
//   res.status(200).json({ message: "✅ Added to cart", cart: user.cart });
// };

// export const getCart = async (req, res) => {
//   const user = await User.findById(req.user._id).populate('cart.product');
//   res.status(200).json({ cart: user.cart });
// };

// export const updateCartItem = async (req, res) => {
//   const { productId, quantity } = req.body;
//   const user = await User.findById(req.user._id);

//   const item = user.cart.find(p => p.product.toString() === productId);
//   if (!item) return res.status(404).json({ message: "Product not in cart" });

//   item.quantity = quantity;
//   await user.save();

//   res.status(200).json({ message: "✅ Cart updated", cart: user.cart });
// };

// export const removeFromCart = async (req, res) => {
//   try {
//     const { productId } = req.params;
//     const user = await User.findById(req.user._id);

//     if (!user) return res.status(404).json({ message: "User not found" });

//     console.log("Removing productId:", productId);
//     console.log("Before remove:", user.cart.map(i => String(i.product)));

//     const updatedCart = user.cart.filter(p => String(p.product) !== String(productId));
//     user.cart = updatedCart;

//     await user.save();

//     console.log("After remove:", updatedCart.map(i => String(i.product)));

//     res.status(200).json({ message: "❌ Removed from cart", cart: user.cart });
//   } catch (err) {
//     res.status(500).json({ message: "Error removing from cart", error: err.message });
//   }
// };

// export const getCartSummary = async (req, res) => {
//   try {
//     if (!req.user || !req.user._id) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }

//     const user = await User.findById(req.user._id).populate("cart.product");
//     if (!user) return res.status(404).json({ message: "User not found" });

//     const validCartItems = (user.cart || []).filter(item => item.product);
//     if (!validCartItems.length) {
//       return res.status(400).json({ message: "Cart is empty" });
//     }

//     // Client-facing cart items
//     const cartItems = validCartItems.map(item => {
//       const product = item.product;
//       const displayImage =
//         product.image ||
//         (Array.isArray(product.images) && product.images.length
//           ? product.images[0]
//           : null);
//       return {
//         productId: product._id,
//         name: product.name,
//         image: displayImage,
//         quantity: item.quantity,
//         price: product.price,
//         subTotal: product.price * item.quantity,
//       };
//     });

//     // Server-safe lines for pricing/discounts
//     const cartForDiscount = validCartItems.map(i => ({
//       productId: String(i.product._id),
//       qty: i.quantity,
//     }));
//     const products = await fetchProductsForCart(cartForDiscount);
//     const lines = pickCartProducts(products, cartForDiscount);
//     const subtotal = cartSubtotal(lines);

//     // ✅ 1. Get ALL eligible discounts for this cart (use helper, not express handler)
//     const { discounts: availableDiscounts } = await computeEligibleDiscountsForCart(
//       cartForDiscount,
//       req.user
//     );

//     // ✅ 2. If user passed a specific code, preview it
//     let discountCode = null;
//     let discountAmount = 0;
//     if (req.query.discount) {
//       try {
//         const result = await validateDiscountForCartInternal({
//           code: req.query.discount.trim(),
//           cart: cartForDiscount,
//           userId: req.user._id,
//         });
//         discountAmount = result.priced.discountAmount;
//         discountCode = result.discount.code;
//       } catch (err) {
//         discountAmount = 0;
//         discountCode = null;
//       }
//     }

//     // ✅ 3. Handle referral/affiliate
//     let buyerDiscountAmount = 0;
//     let affiliateUsed = null;
//     if (req.query.ref) {
//       const affiliate = await Affiliate.findOne({
//         referralCode: req.query.ref,
//         status: "approved",
//       });
//       if (affiliate) {
//         buyerDiscountAmount = Math.round(subtotal * 0.1);
//         affiliateUsed = { id: affiliate._id, name: affiliate.name };
//       }
//     }

//     // ✅ 4. Final total
//     const finalAmount = Math.max(
//       0,
//       subtotal - discountAmount - buyerDiscountAmount
//     );

//     res.status(200).json({
//       cart: cartItems,
//       subtotal,
//       discountCode,
//       discountAmount,
//       buyerDiscountAmount,
//       affiliate: affiliateUsed,
//       finalAmount,
//       availableDiscounts, // 🔥 all possible codes for the frontend
//       savingsBreakdown: {
//         fromCoupon: discountAmount,
//         fromReferral: buyerDiscountAmount,
//         totalSavings: discountAmount + buyerDiscountAmount,
//       },
//     });
//   } catch (error) {
//     console.error("getCartSummary error:", error);
//     res.status(500).json({
//       message: "Failed to get cart summary",
//       error: error.message,
//     });
//   }
// };
















import User from "../../models/User.js";
import Discount from "../../models/Discount.js";
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

// ✅ Add to Cart with shade/variant selection
export const addToCart = async (req, res) => {
  const { productId, quantity, variantSku } = req.body;
  const user = await User.findById(req.user._id);
  const product = await Product.findById(productId);

  if (!product) return res.status(404).json({ message: "Product not found" });

  let selectedVariant = null;
  if (variantSku) {
    const variant = product.foundationVariants.find(v => v.sku === variantSku);
    if (variant) {
      selectedVariant = {
        sku: variant.sku,
        shadeName: variant.shadeName,
        hex: variant.hex,
        image: variant.images?.[0] || product.images?.[0] || null
      };
    }
  }

  // Check if already exists in cart with same variant
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

  await user.save();
  res.status(200).json({ message: "✅ Added to cart", cart: user.cart });
};

// ✅ Get full cart
export const getCart = async (req, res) => {
  const user = await User.findById(req.user._id).populate("cart.product");
  res.status(200).json({ cart: user.cart });
};

// ✅ Update item quantity
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

// ✅ Cart Summary with shade info
export const getCartSummary = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(req.user._id).populate("cart.product");
    if (!user) return res.status(404).json({ message: "User not found" });

    const validCartItems = (user.cart || []).filter(item => item.product);
    if (!validCartItems.length) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // Client-facing cart items
    const cartItems = validCartItems.map(item => {
      const product = item.product;
      const displayImage =
        item.selectedVariant?.image ||
        product.image ||
        (Array.isArray(product.images) && product.images.length
          ? product.images[0]
          : null);

      return {
        productId: product._id,
        name: product.name,
        image: displayImage,
        quantity: item.quantity,
        price: product.price,
        subTotal: product.price * item.quantity,
        selectedVariant: item.selectedVariant
          ? {
            sku: item.selectedVariant.sku,
            shadeName: item.selectedVariant.shadeName,
            hex: item.selectedVariant.hex
          }
          : null
      };
    });

    // Server-safe lines for pricing/discounts
    const cartForDiscount = validCartItems.map(i => ({
      productId: String(i.product._id),
      qty: i.quantity
    }));
    const products = await fetchProductsForCart(cartForDiscount);
    const lines = pickCartProducts(products, cartForDiscount);
    const subtotal = cartSubtotal(lines);

    // ✅ Discounts
    const { discounts: availableDiscounts } = await computeEligibleDiscountsForCart(
      cartForDiscount,
      req.user
    );

    let discountCode = null;
    let discountAmount = 0;
    if (req.query.discount) {
      try {
        const result = await validateDiscountForCartInternal({
          code: req.query.discount.trim(),
          cart: cartForDiscount,
          userId: req.user._id
        });
        discountAmount = result.priced.discountAmount;
        discountCode = result.discount.code;
      } catch {
        discountAmount = 0;
        discountCode = null;
      }
    }

    // ✅ Referral
    let buyerDiscountAmount = 0;
    let affiliateUsed = null;
    if (req.query.ref) {
      const affiliate = await Affiliate.findOne({
        referralCode: req.query.ref,
        status: "approved"
      });
      if (affiliate) {
        buyerDiscountAmount = Math.round(subtotal * 0.1);
        affiliateUsed = { id: affiliate._id, name: affiliate.name };
      }
    }

    // ✅ Final
    const finalAmount = Math.max(
      0,
      subtotal - discountAmount - buyerDiscountAmount
    );

    res.status(200).json({
      cart: cartItems,
      subtotal,
      discountCode,
      discountAmount,
      buyerDiscountAmount,
      affiliate: affiliateUsed,
      finalAmount,
      availableDiscounts,
      savingsBreakdown: {
        fromCoupon: discountAmount,
        fromReferral: buyerDiscountAmount,
        totalSavings: discountAmount + buyerDiscountAmount
      }
    });
  } catch (error) {
    console.error("getCartSummary error:", error);
    res.status(500).json({
      message: "Failed to get cart summary",
      error: error.message
    });
  }
};
