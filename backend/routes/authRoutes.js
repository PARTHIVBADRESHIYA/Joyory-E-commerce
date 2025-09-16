// routes/adminRoutes.js

import express from 'express';
import { verifyAdminOrTeamMember } from '../middlewares/authMiddleware.js';
import { ipWhitelistMiddleware } from '../middlewares/ipWhitelist.js';//(after ready all the things use ipwishlist use in route )
import { adminLoginLimiter } from '../middlewares/security/rateLimiter.js';
import { validate } from '../middlewares/validations/validate.js';
import { adminLoginSchema, adminSignupSchema } from '../middlewares/validations/adminValidator.js';

import {
    manuallyAddCustomer,
    adminRegister,
    adminLogin,
    getAllUsers,
    getUserById,
    updateUserByAdmin,
    deleteUser,
    getUserAnalytics,
    getFullCustomerAnalytics,
    listSellers,
    approveProduct,
    changeSellerStatus
} from './../controllers/authController.js';

import { addProductController } from './../controllers/productController.js';

const router = express.Router();

// 🔐 Apply IP lock to all admin routes(after ready all the things use ipwishlist use in route )

// ✅ Auth
router.post('/register', validate(adminSignupSchema), adminRegister);
router.post('/login', validate(adminLoginSchema), adminLogin);

// ✅ User management
router.get('/users', verifyAdminOrTeamMember, getAllUsers);
router.get('/users/analytics/full', verifyAdminOrTeamMember, getFullCustomerAnalytics);
router.get('/users/analytics/:id', verifyAdminOrTeamMember, getUserAnalytics);
router.get('/users/:id', verifyAdminOrTeamMember, getUserById);
router.put('/users/:id', verifyAdminOrTeamMember, updateUserByAdmin);
router.delete('/users/:id', verifyAdminOrTeamMember, deleteUser);

// ✅ Customers & Products
router.post('/add-customer', verifyAdminOrTeamMember, manuallyAddCustomer);
router.post('/add-product', verifyAdminOrTeamMember, addProductController);

// ✅ Sellers
router.get('/sellers', verifyAdminOrTeamMember, listSellers);
router.put('/sellers/:id/approve', verifyAdminOrTeamMember, approveProduct);
router.put('/sellers/:id/status', verifyAdminOrTeamMember, changeSellerStatus);

export default router;