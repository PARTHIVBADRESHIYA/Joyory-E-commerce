import express from 'express';
import {
    createDiscount,
    getAllDiscounts,
    updateDiscount,
    deleteDiscount,
    getDiscountDashboardAnalytics,
    getDiscountById
} from '../controllers/discountController.js';

import { verifyAdminOrTeamMember } from '../middlewares/authMiddleware.js';
import { validateDiscount } from '../middlewares/validateDiscount.js';

const router = express.Router();
// 🔐 Admins Only (Create, Update, Delete)
router.post('/', verifyAdminOrTeamMember, createDiscount);

// 📊 Summary List for Dashboard
router.get('/', verifyAdminOrTeamMember, getAllDiscounts);

// 📈 Dashboard Analytics (active, usage, revenue)
router.get('/dashboard', verifyAdminOrTeamMember, getDiscountDashboardAnalytics);

// ✅ Validate discount during order (optional use)
router.post('/validate', validateDiscount);

// 🔍 Single Discount by ID (keep at the bottom)
router.get('/:id', verifyAdminOrTeamMember, getDiscountById);
router.put('/:id', verifyAdminOrTeamMember, updateDiscount);
router.delete('/:id', verifyAdminOrTeamMember, deleteDiscount);


export default router;
