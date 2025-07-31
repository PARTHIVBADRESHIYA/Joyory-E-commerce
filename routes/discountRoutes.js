import express from 'express';
import {
    createDiscount,
    getAllDiscounts,
    updateDiscount,
    deleteDiscount,
    getDiscountDashboardAnalytics
} from '../controllers/discountController.js';

import { verifyAdminOrTeamMember } from '../middlewares/authMiddleware.js';
import { validateDiscount } from '../middlewares/validateDiscount.js';

const router = express.Router();

// 🔐 Admins Only (Create, Update, Delete)
router.post('/', verifyAdminOrTeamMember, createDiscount);
router.put('/:id', verifyAdminOrTeamMember, updateDiscount);
router.delete('/:id', verifyAdminOrTeamMember, deleteDiscount);

// 📊 Summary List for Dashboard (code, type, discount, usage/limit, expiry, status)
router.get('/', verifyAdminOrTeamMember, getAllDiscounts);

// 📈 Dashboard Analytics (active, usage, revenue)
router.get('/dashboard', verifyAdminOrTeamMember, getDiscountDashboardAnalytics);

// ✅ Validate discount during order (optional use)
router.post('/validate', validateDiscount);  // This is called during order placement

export default router;
