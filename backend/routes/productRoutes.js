import express from 'express';
import { addProductController, getAllProducts, updateProductStock, updateProductById } from '../controllers/productController.js';
import { verifyAdminOrTeamMember } from '../middlewares/authMiddleware.js';
import { uploadProduct } from '../middlewares/upload.js';

const router = express.Router();


// Admin-only routes
router.post('/add-product', verifyAdminOrTeamMember, uploadProduct.array('images', 5),  // 👈 Accept up to 5 images
    addProductController);
router.get('/products', verifyAdminOrTeamMember, getAllProducts);
router.patch('/products/:id', verifyAdminOrTeamMember, uploadProduct.array('images', 5), updateProductById);
router.put('/products/:id/stock', verifyAdminOrTeamMember, updateProductStock);





export default router;