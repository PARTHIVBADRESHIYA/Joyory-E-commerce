import express from 'express';
import { verifyAdminOrTeamMember } from '../middlewares/authMiddleware.js';
import { manuallyAddCustomer, getAllCustomers} from "./../controllers/authController.js";

import {
    addProductController,
    
} from "./../controllers/productController.js";
const router = express.Router();
import {
    userSignup,
    userLogin,
    adminLogin
} from "./../controllers/authController.js";
// import Admin from '../models/Admin.js';

// Customer Signup/Login
router.post('/user/signup', userSignup);
router.post('/user/login', userLogin);

// Admin Signup/Login
router.post('/admin/add-customer',verifyAdminOrTeamMember, manuallyAddCustomer);
router.get('/admin/customers', verifyAdminOrTeamMember, getAllCustomers);



// authenticate Routes
router.post('/add-product', verifyAdminOrTeamMember, addProductController);


// TEMP: Create admin (dev-only)
// router.post('/admin/register', async (req, res) => {
//     try {
//         const { name, email, password } = req.body;

//         const existing = await Admin.findOne({ email });
//         if (existing) return res.status(400).json({ message: 'Admin already exists' });

//         const admin = new Admin({ name, email, password });
//         await admin.save();

//         res.status(201).json({ message: 'Admin created successfully' });
//     } catch (err) {
//         console.error('Admin Register Error:', err);
//         res.status(500).json({ message: 'Admin creation failed', error: err.message });
//     }
// });


// Admin Login
router.post('/admin/login', adminLogin);

export default router;