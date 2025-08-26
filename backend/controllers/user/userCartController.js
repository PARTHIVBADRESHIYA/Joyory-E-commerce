import User from "../../models/User.js";
import Discount from "../../models/Discount.js";
import Affiliate from "../../models/Affiliate.js";
import { validateDiscount } from "../../middlewares/validateDiscount.js";
import {
  fetchProductsForCart,
  pickCartProducts,
  cartSubtotal,
  validateDiscountForCartInternal,
  computeEligibleDiscountsForCart   } from "../../controllers/user/userDiscountController.js"; // import helpers

export const addToCart = async (req, res) => {
  const { productId, quantity } = req.body;
  const user = await User.findById(req.user._id);

  const existing = user.cart.find(item => item.product.toString() === productId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    user.cart.push({ product: productId, quantity });
  }

  await user.save();
  res.status(200).json({ message: "✅ Added to cart", cart: user.cart });
};

export const getCart = async (req, res) => {
  const user = await User.findById(req.user._id).populate('cart.product');
  res.status(200).json({ cart: user.cart });
};

export const updateCartItem = async (req, res) => {
  const { productId, quantity } = req.body;
  const user = await User.findById(req.user._id);

  const item = user.cart.find(p => p.product.toString() === productId);
  if (!item) return res.status(404).json({ message: "Product not in cart" });

  item.quantity = quantity;
  await user.save();

  res.status(200).json({ message: "✅ Cart updated", cart: user.cart });
};

export const removeFromCart = async (req, res) => {
  try {
    const { productId } = req.params;
    const user = await User.findById(req.user._id);

    if (!user) return res.status(404).json({ message: "User not found" });

    console.log("Removing productId:", productId);
    console.log("Before remove:", user.cart.map(i => String(i.product)));

    const updatedCart = user.cart.filter(p => String(p.product) !== String(productId));
    user.cart = updatedCart;

    await user.save();

    console.log("After remove:", updatedCart.map(i => String(i.product)));

    res.status(200).json({ message: "❌ Removed from cart", cart: user.cart });
  } catch (err) {
    res.status(500).json({ message: "Error removing from cart", error: err.message });
  }
};


// export const getCartSummary = async (req, res) => {
//   try {
//     const user = await User.findById(req.user._id).populate("cart.product");
//     if (!user) return res.status(404).json({ message: "❌ User not found" });
//     if (!user.cart.length)
//       return res.status(400).json({ message: "🛒 Cart is empty" });

//     // ✅ Skip items whose product is null (deleted by admin)
//     const validCartItems = user.cart.filter(item => item.product);

//     if (validCartItems.length === 0) {
//       return res.status(400).json({ message: "🛒 Cart is empty" });
//     }

//     let totalAmount = 0;

//     const cartItems = validCartItems.map(item => {
//       const product = item.product;
//       const subTotal = product.price * item.quantity;
//       totalAmount += subTotal;

//       // ✅ Get first image safely
//       const displayImage =
//         product.image ||
//         (Array.isArray(product.images) && product.images.length > 0
//           ? product.images[0]
//           : null);

//       return {
//         productId: product._id,
//         name: product.name,
//         image: product.image,          // keep as-is
//         images: displayImage,          // keep as-is
//         quantity: item.quantity,
//         price: product.price,
//         subTotal
//       };
//     });

//     // 🧾 Discount logic
//     let discount = null;
//     let discountAmount = 0;
//     const discountCode = req.query.discount;

//     if (discountCode) {
//       const fakeReq = {
//         body: { discountCode, amount: totalAmount }
//       };
//       const fakeRes = { status: () => ({ json: () => { } }) };
//       await validateDiscount(fakeReq, fakeRes, () => {
//         discount = fakeReq.discount;
//       });

//       if (discount) {
//         discountAmount =
//           discount.type === "Flat"
//             ? discount.value
//             : Math.round((discount.value / 100) * totalAmount);
//       }
//     }

//     // 🤝 Affiliate logic (optional)
//     let buyerDiscountAmount = 0;
//     let affiliateUsed = null;
//     const refCode = req.query.ref;
//     if (refCode) {
//       const affiliate = await Affiliate.findOne({
//         referralCode: refCode,
//         status: "approved"
//       });
//       if (affiliate) {
//         buyerDiscountAmount = Math.round(totalAmount * 0.1);
//         affiliateUsed = { id: affiliate._id, name: affiliate.name };
//       }
//     }

//     const finalAmount = totalAmount - discountAmount - buyerDiscountAmount;

//     res.status(200).json({
//       cart: cartItems,
//       totalAmount,
//       discountCode: discount?.code || null,
//       discountAmount,
//       buyerDiscountAmount,
//       affiliate: affiliateUsed,
//       finalAmount
//     });
//   } catch (error) {
//     console.error("🔥 Failed to get cart summary:", error);
//     res.status(500).json({
//       message: "Failed to get cart summary",
//       error: error.message
//     });
//   }
// };




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
      };
    });

    // Server-safe lines for pricing/discounts
    const cartForDiscount = validCartItems.map(i => ({
      productId: String(i.product._id),
      qty: i.quantity,
    }));
    const products = await fetchProductsForCart(cartForDiscount);
    const lines = pickCartProducts(products, cartForDiscount);
    const subtotal = cartSubtotal(lines);

    // ✅ 1. Get ALL eligible discounts for this cart (use helper, not express handler)
    const { discounts: availableDiscounts } = await computeEligibleDiscountsForCart(
      cartForDiscount,
      req.user
    );

    // ✅ 2. If user passed a specific code, preview it
    let discountCode = null;
    let discountAmount = 0;
    if (req.query.discount) {
      try {
        const result = await validateDiscountForCartInternal({
          code: req.query.discount.trim(),
          cart: cartForDiscount,
          userId: req.user._id,
        });
        discountAmount = result.priced.discountAmount;
        discountCode = result.discount.code;
      } catch (err) {
        discountAmount = 0;
        discountCode = null;
      }
    }

    // ✅ 3. Handle referral/affiliate
    let buyerDiscountAmount = 0;
    let affiliateUsed = null;
    if (req.query.ref) {
      const affiliate = await Affiliate.findOne({
        referralCode: req.query.ref,
        status: "approved",
      });
      if (affiliate) {
        buyerDiscountAmount = Math.round(subtotal * 0.1);
        affiliateUsed = { id: affiliate._id, name: affiliate.name };
      }
    }

    // ✅ 4. Final total
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
      availableDiscounts, // 🔥 all possible codes for the frontend
      savingsBreakdown: {
        fromCoupon: discountAmount,
        fromReferral: buyerDiscountAmount,
        totalSavings: discountAmount + buyerDiscountAmount,
      },
    });
  } catch (error) {
    console.error("getCartSummary error:", error);
    res.status(500).json({
      message: "Failed to get cart summary",
      error: error.message,
    });
  }
};
