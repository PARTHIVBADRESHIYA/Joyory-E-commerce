import express from 'express';
import { addOrder, getAllOrders, getOrderSummary } from '../controllers/orderController.js';
import { authenticateUser } from '../middlewares/authMiddleware.js';
import { validateDiscount } from '../middlewares/validateDiscount.js';
import { validatePromotion } from '../middlewares/utils/validatePromotion.js';
import { trackPromotionView } from '../middlewares/utils/trackPromotionView.js';


const router = express.Router();

router.post('/add', authenticateUser,trackPromotionView,validatePromotion, validateDiscount, addOrder);
router.get('/', getAllOrders);
router.get('/summary', getOrderSummary);

export default router;
    