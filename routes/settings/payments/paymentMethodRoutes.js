import express from 'express';
import { verifyAdminOrTeamMember } from '../../../middlewares/authMiddleware.js';
import { createPaymentMethod, toggleMethodStatus, getAllPaymentMethods,getMethodDetails } from '../../../controllers/settings/payments/paymentMethodController.js';
const router = express.Router();

router.post('/', verifyAdminOrTeamMember, createPaymentMethod);
router.patch('/:id/toggle', verifyAdminOrTeamMember, toggleMethodStatus);
router.get('/', verifyAdminOrTeamMember, getAllPaymentMethods);
router.get('/:id', verifyAdminOrTeamMember, getMethodDetails);

export default router;