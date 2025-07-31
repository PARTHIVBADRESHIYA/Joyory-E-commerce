import Promotion from '../../models/Promotion.js';

// middlewares/validatePromotion.js


export const validatePromotion = async (req, res, next) => {
    const { promoCode } = req.body;

    if (!promoCode) return next(); // No code? skip

    try {
        const now = new Date();

        const promotion = await Promotion.findOne({
            promoCodes: promoCode,
            status: 'active',
            startDate: { $lte: now },
            endDate: { $gte: now }
        });

        if (promotion) {
            req.promotion = promotion; // ✅ Set it here
        } else {
            console.log("❌ No valid promotion found for:", promoCode);
        }

        next();
    } catch (err) {
        console.error("🔥 Promotion validation error:", err);
        res.status(500).json({ message: "Promotion validation failed", error: err.message });
    }
};

