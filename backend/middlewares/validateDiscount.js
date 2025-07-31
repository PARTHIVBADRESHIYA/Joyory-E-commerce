import Discount from '../models/Discount.js';
import User from '../models/User.js';

export const validateDiscount = async (req, res, next) => {
  try {
    const discountCode = req.body?.discountCode || req.query?.discount;
    if (!discountCode) return next(); // no discount passed

    // console.log("🧾 Checking Discount Code:", discountCode);

    const discount = await Discount.findOne({
      code: new RegExp(`^${discountCode}$`, 'i'),
      status: "Active",
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
    });

    if (!discount) {
      return res.status(400).json({ message: "Invalid or expired discount code" });
    }

    // Dynamically calculate order amount if not provided
    let amount = req.body?.amount;

    if (!amount && req.user) {
      const user = await User.findById(req.user._id).populate('cart.product');
      if (user && user.cart.length) {
        amount = user.cart.reduce((acc, item) => {
          if (item.product) {
            return acc + item.product.price * item.quantity;
          }
          return acc;
        }, 0);
      }
    }

    if (amount < (discount.minimumOrderAmount || 0)) {
      return res.status(400).json({
        message: `Order amount ₹${amount} is below minimum ₹${discount.minimumOrderAmount}`
      });
    }

    req.discount = discount;
    next();
  } catch (err) {
    console.error("🔥 Discount validation error:", err);
    res.status(500).json({ message: "Discount validation failed" });
  }
};





