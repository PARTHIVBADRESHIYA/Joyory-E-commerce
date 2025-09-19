import express from 'express';
import { addOrder, getAllOrders, getOrderSummary ,getOrderById,updateOrderStatus} from '../controllers/orderController.js';
import { isAdmin } from '../middlewares/authMiddleware.js';
import { validateDiscount } from '../middlewares/validateDiscount.js';
import { validatePromotion } from '../middlewares/utils/validatePromotion.js';
import { trackPromotionView } from '../middlewares/utils/trackPromotionView.js';


const router = express.Router();

router.post('/add', isAdmin,trackPromotionView,validatePromotion, validateDiscount, addOrder);
router.get('/', isAdmin,getAllOrders);
router.get('/summary',isAdmin, getOrderSummary);
router.get("/:id",isAdmin, getOrderById);  // view details of one order
router.put("/:id/status", isAdmin, updateOrderStatus); 


export default router;
    