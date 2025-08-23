// routes/promotionPublicRoutes.js
import express from 'express';
import {
    getActivePromotionsForUsers,
    getPromotionProducts
} from '../../controllers/user/userPromotionController.js';

const router = express.Router();

// List only active promotions
router.get('/active', getActivePromotionsForUsers);

// Get full product listing for a promotion
router.get('/:id/products', getPromotionProducts);

export default router;
