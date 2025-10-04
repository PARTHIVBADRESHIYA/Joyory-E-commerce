import express from 'express';
import { verifyAdminOrTeamMember, authenticateUser, verifyOrderOwnership } from '../../../middlewares/authMiddleware.js';
import { createPayment, filterPaymentsByDate, getDashboardSummary, getPaymentsFiltered, payForOrder, createRazorpayOrder, razorpayCallback,verifyRazorpayPayment, getActivePaymentMethods } from '../../../controllers/settings/payments/paymentController.js';
import { userPaymentValidation } from "../../../middlewares/paymentValidation.js";

const router = express.Router();

router.post(
    '/pay/:orderId',
    authenticateUser,
    verifyOrderOwnership,
    payForOrder
);
router.get('/filter/:range', verifyAdminOrTeamMember, filterPaymentsByDate);
router.get('/summary', verifyAdminOrTeamMember, getDashboardSummary);
router.get('/payments', verifyAdminOrTeamMember, getPaymentsFiltered);
router.post('/razorpay/order', authenticateUser, userPaymentValidation,  // ✅ Validate UPI/Card/Wallet input here
    createRazorpayOrder);
router.post('/razorpay/verify', authenticateUser, verifyRazorpayPayment);
router.get("/razorpay/callback", razorpayCallback);

router.get('/methods', getActivePaymentMethods);

// routes

export default router;