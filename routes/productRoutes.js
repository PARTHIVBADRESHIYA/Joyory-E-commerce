import express from 'express';
const router = express.Router();
import { addProductController, getAllProducts, updateProductStock } from '../controllers/productController.js';
import { verifyAdminOrTeamMember } from '../middlewares/authMiddleware.js';

// Admin-only routes
router.post('/add-product', verifyAdminOrTeamMember, addProductController);
router.get('/products', verifyAdminOrTeamMember, getAllProducts);
router.put('/product/:id/stock', verifyAdminOrTeamMember, updateProductStock);


export default router;