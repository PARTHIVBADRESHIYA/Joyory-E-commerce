import express from 'express';
import { addProductController, getAllProducts, getSingleProductById, updateProductStock, updateProductById, deleteProduct ,updateVariantImages} from '../controllers/productController.js';
import { verifyAdminOrTeamMember } from '../middlewares/authMiddleware.js';
import { uploadProduct } from '../middlewares/upload.js';

const router = express.Router();

// Admin-only routes
router.post('/products/add-product', verifyAdminOrTeamMember, uploadProduct.array('images', 5),  // 👈 Accept up to 5 images
    addProductController);
router.get('/products', verifyAdminOrTeamMember, getAllProducts);
router.get('/products/:id', verifyAdminOrTeamMember, getSingleProductById);
router.patch('/products/:id', verifyAdminOrTeamMember, uploadProduct.array('images', 5), updateProductById);
router.put('/products/:id/stock', verifyAdminOrTeamMember, updateProductStock);
router.delete('/products/:id', verifyAdminOrTeamMember, deleteProduct);
// Update images of a specific foundationVariant (by SKU)
router.patch(
    "/products/:id/variants/:sku/images",
    verifyAdminOrTeamMember,
    uploadProduct.array("images", 5), // allow up to 5 images
    updateVariantImages
);

export default router; 