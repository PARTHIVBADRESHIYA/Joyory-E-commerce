// middlewares/trackPromotionView.js
import Promotion from "../../models/Promotion.js";

export const trackPromotionView = async (req, res, next) => {
    const { promotionId } = req.query;
    if (promotionId) {
        try {
            const promo = await Promotion.findById(promotionId);
            if (promo) {
                req.promotion = promo; // Attach to request
            }
        } catch (err) {
            console.warn("Invalid promotion ID", promotionId);
        }
    }
    next();
};
