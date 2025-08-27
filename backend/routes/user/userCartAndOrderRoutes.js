import express from 'express';
import {
    addToCart,
    updateCartItem,
    removeFromCart,
    getCart,
    getCartSummary
} from '../../controllers/user/userCartController.js';

import {
    getUserOrders,
    initiateOrderFromCart,
    getOrderTracking,
    testShiprocket
} from '../../controllers/user/userOrderController.js';

import { protect } from '../../middlewares/authMiddleware.js';
import { validateDiscount } from '../../middlewares/validateDiscount.js';

const router = express.Router();

// 🛒 Cart Routes
router.post('/add', protect, addToCart);
router.put('/update', protect, updateCartItem);
router.delete('/remove/:productId', protect, removeFromCart);
router.get('/', protect, getCart);
router.get('/summary', protect,validateDiscount, getCartSummary);

// 📦 Order from Cart Route
// NEW - Initiate Order from Cart
router.post('/order/initiate', protect, validateDiscount, initiateOrderFromCart);

// 📦 Order from Cart Route
router.get('/orders', protect, getUserOrders);
// routes/orderRoutes.js
router.get("/tracking/:id", protect, getOrderTracking);

router.post("/test-shiprocket", testShiprocket);
export default router;
