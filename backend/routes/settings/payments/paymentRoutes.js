import express from 'express';
import { verifyAdminOrTeamMember, authenticateUser, verifyOrderOwnership } from '../../../middlewares/authMiddleware.js';
import { filterPaymentsByDate, getDashboardSummary, getPaymentsFiltered, payForOrder, createWalletPayment,createGiftCardPayment,cancelOrder, setRefundMethod, setPaymentMethod, getActivePaymentMethods, createCodOrder, confirmCodOrder, createRazorpayOrder, verifyRazorpayPayment } from '../../../controllers/settings/payments/paymentController.js';
// import { userPaymentValidation } from "../../../middlewares/paymentValidation.js";

const router = express.Router();


router.post('/set-payment-method', authenticateUser, setPaymentMethod);

router.post(
    '/pay/:orderId',
    authenticateUser,
    verifyOrderOwnership,
    payForOrder
);
router.get('/filter/:range', verifyAdminOrTeamMember, filterPaymentsByDate);
router.get('/summary', verifyAdminOrTeamMember, getDashboardSummary);
router.get('/payments', verifyAdminOrTeamMember, getPaymentsFiltered);
router.post('/razorpay/order', authenticateUser,  // ✅ Validate UPI/Card/Wallet input here
    createRazorpayOrder);
router.post('/razorpay/verify', authenticateUser, verifyRazorpayPayment);

router.post('/cod', authenticateUser, createCodOrder);

router.post('/cod/confirm', authenticateUser, confirmCodOrder);

router.post('/wallet', authenticateUser, createWalletPayment);

router.post('/giftcard', authenticateUser, createGiftCardPayment);

router.post('/cancel', authenticateUser, cancelOrder);

router.post('/refund-method', authenticateUser, setRefundMethod);

router.get('/methods', authenticateUser, getActivePaymentMethods);


// routes

export default router;