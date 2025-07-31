import express from 'express';
import {
    addToCart,
    updateCartItem,
    removeFromCart,
    getCart,
    getCartSummary
} from '../../controllers/user/userCartController.js';

import {
    placeOrderFromCart,
    getUserOrders
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
router.post('/order/from-cart', protect,validateDiscount, placeOrderFromCart);

// 📦 Order from Cart Route
router.get('/user/orders', protect, getUserOrders);

export default router;
