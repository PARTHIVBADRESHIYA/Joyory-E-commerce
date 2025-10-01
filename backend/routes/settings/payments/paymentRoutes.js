import express from 'express';
import { verifyAdminOrTeamMember, authenticateUser, verifyOrderOwnership } from '../../../middlewares/authMiddleware.js';
import { createPayment, filterPaymentsByDate, getPaymentMethodById,getDashboardSummary, getPaymentsFiltered, payForOrder ,createRazorpayOrder ,verifyRazorpayPayment,getActivePaymentMethods} from '../../../controllers/settings/payments/paymentController.js';

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
router.post('/razorpay/order', authenticateUser, createRazorpayOrder);
router.post('/razorpay/verify', authenticateUser, verifyRazorpayPayment);
router.get('/methods', getActivePaymentMethods);

router.get('/:id', getPaymentMethodById);


// routes

export default router;