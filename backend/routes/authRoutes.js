// routes/adminRoutes.js

import express from 'express';
import { verifyAdminOrTeamMember } from '../middlewares/authMiddleware.js';
import { ipWhitelistMiddleware } from '../middlewares/ipWhitelist.js';
import { adminLoginLimiter } from '../middlewares/security/rateLimiter.js';
import { validate } from '../middlewares/validations/validate.js';
import { adminLoginSchema,adminSignupSchema } from '../middlewares/validations/adminValidator.js';

import {
    manuallyAddCustomer,
    adminRegister,
    adminLogin,
    getAllUsers,
    getUserById,
    updateUserByAdmin,
    deleteUser,
    getUserAnalytics,
    getFullCustomerAnalytics
} from './../controllers/authController.js';

import { addProductController } from './../controllers/productController.js';

const router = express.Router();

// 🔐 Apply IP lock to all admin routes
router.use(ipWhitelistMiddleware);

// ✅ Admin Register
router.post('/register', validate(adminSignupSchema), adminRegister);

// ✅ Admin Login
router.post('/login', adminLoginLimiter, validate(adminLoginSchema), adminLogin);

// ✅ Admin-only functionalities (requires authentication)
router.post('/add-customer', verifyAdminOrTeamMember, manuallyAddCustomer);
router.post('/add-product', verifyAdminOrTeamMember, addProductController);

router.get('/', verifyAdminOrTeamMember, getAllUsers);
router.get('/customer-analytics', verifyAdminOrTeamMember, getFullCustomerAnalytics);
router.get('/:id', verifyAdminOrTeamMember, getUserById);
router.put('/:id', verifyAdminOrTeamMember, updateUserByAdmin);
router.delete('/:id', verifyAdminOrTeamMember, deleteUser);
router.get('/analytics/:id', verifyAdminOrTeamMember, getUserAnalytics);

export default router;
