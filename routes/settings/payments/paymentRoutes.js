import express from 'express';
import { verifyAdminOrTeamMember, authenticateUser, verifyOrderOwnership } from '../../../middlewares/authMiddleware.js';
import { createPayment, filterPaymentsByDate, getDashboardSummary, getPaymentsFiltered, payForOrder } from '../../../controllers/settings/payments/paymentController.js';
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

export default router;