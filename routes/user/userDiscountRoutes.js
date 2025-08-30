import express from 'express';
import { protect } from '../../middlewares/authMiddleware.js';
import {
    getEligibleDiscountsForCart,
    validateDiscountForCart
} from '../../controllers/user/userDiscountController.js';

const router = express.Router();

// Returns all active & applicable discounts for the current cart/user
router.post('/eligible', protect, getEligibleDiscountsForCart);

// Validates one code and prices the cart accordingly
router.post('/validate', protect, validateDiscountForCart);

export default router;
