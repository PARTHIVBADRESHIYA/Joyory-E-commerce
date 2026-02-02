import express from 'express';
import { addProductController, getAllProducts, getSingleProductById, updateProductStock,getProductFilterOptions, updateProductById, deleteProduct, updateVariantImages } from '../controllers/productController.js';
import { verifyAdminOrTeamMember } from '../middlewares/authMiddleware.js';
import { uploadProduct, uploadProductWithVariants } from '../middlewares/upload.js';
import { checkPermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Admin-only routes
router.post('/products/add-product', verifyAdminOrTeamMember,checkPermission('products:create'),
    uploadProductWithVariants,
    addProductController);
router.get('/products', verifyAdminOrTeamMember, checkPermission('products:view'), getAllProducts);
router.get('/products/filters', verifyAdminOrTeamMember, checkPermission('products:view'), getProductFilterOptions);
router.get('/products/:id', verifyAdminOrTeamMember,checkPermission("products:view"), getSingleProductById);
router.patch('/products/:id', verifyAdminOrTeamMember, uploadProduct.any(), // Accept any file dynamically
    checkPermission("products:update"),updateProductById);
router.put('/products/:id/stock', verifyAdminOrTeamMember,checkPermission("products:update") ,updateProductStock);
router.delete('/products/:id', verifyAdminOrTeamMember,checkPermission("products:delete"), deleteProduct);
// Update images of a specific foundationVariant (by SKU)
router.patch(
    "/products/:id/variants/:sku/images",
    verifyAdminOrTeamMember,
    uploadProduct.array("images", 250), // allow up to 5 images
    checkPermission("products:update"),
    updateVariantImages
);



export default router; 