import User from "../../models/User.js";
import Discount from "../../models/Discount.js";
import Affiliate from "../../models/Affiliate.js";  
import { validateDiscount } from "../../middlewares/validateDiscount.js";

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
    const { productId } = req.params;
    const user = await User.findById(req.user._id);

    user.cart = user.cart.filter(p => p.product.toString() !== productId);
    await user.save();

    res.status(200).json({ message: "❌ Removed from cart", cart: user.cart });
};


export const getCartSummary = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('cart.product');
    if (!user) return res.status(404).json({ message: "❌ User not found" });
    if (!user.cart.length) return res.status(400).json({ message: "🛒 Cart is empty" });

    let totalAmount = 0;
    const cartItems = user.cart.map(item => {
      const product = item.product;
      const subTotal = product.price * item.quantity;
      totalAmount += subTotal;
      return {
        productId: product._id,
        title: product.title,
        quantity: item.quantity,
        price: product.price,
        subTotal
      };
    });

    // 🧾 Discount logic
    let discount = null;
    let discountAmount = 0;
    const discountCode = req.query.discount;

    if (discountCode) {
      const fakeReq = {
        body: {
          discountCode: discountCode,
          amount: totalAmount
        }
      };
      const fakeRes = {
        status: () => ({
          json: () => { }
        })
      };
      await validateDiscount(fakeReq, fakeRes, () => {
        discount = fakeReq.discount;
      });

      if (discount) {
        discountAmount = discount.type === 'Flat'
          ? discount.value
          : Math.round((discount.value / 100) * totalAmount);
      }
    }

    // 🤝 Affiliate logic (optional)
    let buyerDiscountAmount = 0;
    let affiliateUsed = null;
    const refCode = req.query.ref;
    if (refCode) {
      const affiliate = await Affiliate.findOne({ referralCode: refCode, status: 'approved' });
      if (affiliate) {
        buyerDiscountAmount = Math.round(totalAmount * 0.10); // 10% discount
        affiliateUsed = {
          id: affiliate._id,
          name: affiliate.name
        };
      }
    }

    const finalAmount = totalAmount - discountAmount - buyerDiscountAmount;

    res.status(200).json({
      cart: cartItems,
      totalAmount,
      discountCode: discount?.code || null,
      discountAmount,
      buyerDiscountAmount,
      affiliate: affiliateUsed,
      finalAmount
    });

  } catch (error) {
    console.error("🔥 Failed to get cart summary:", error);
    res.status(500).json({
      message: "Failed to get cart summary",
      error: error.message
    });
  }
};


