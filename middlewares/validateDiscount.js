import Discount from '../models/Discount.js';

export const validateDiscount = async (req, res, next) => {
  const { discountCode, amount } = req.body;

  if (!discountCode) return next(); // No discount provided

  try {
    console.log("🧾 Checking Discount Code:", discountCode);

    const discount = await Discount.findOne({
      code: new RegExp(`^${discountCode}$`, 'i'),
      status: "Active",
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
    });

    if (!discount) {
      console.log("❌ Discount not found or inactive/expired.");
      return res.status(400).json({ message: "Invalid or expired discount code" });
    }

    if (amount < (discount.minimumOrderAmount || 0)) {
      console.log(`❌ Order amount ${amount} below minimum required ${discount.minimumOrderAmount}`);
      return res.status(400).json({ message: "Order amount too low for this discount" });
    }

    // Attach discount to req
    req.discount = discount;
    next();
  } catch (error) {
    console.error("🔥 Discount validation error:", error);
    res.status(500).json({ message: "Discount validation failed" });
  }
};
