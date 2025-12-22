// routes/user/promotionRoutes.js
import express from "express";
import {
    getActivePromotionsForUsers,
    getPromotionProducts,
} from "../../controllers/user/userPromotionController.js";

const router = express.Router();

router.get("/active", getActivePromotionsForUsers);
router.get("/:idOrSlug/products", getPromotionProducts);

export default router;
