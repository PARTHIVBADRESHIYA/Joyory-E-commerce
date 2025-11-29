import express from 'express';
import { getInventoryItems, getInventorySummary, getInventoryByBrand, deleteVariant, deleteProduct, updateVariantStock } from "./../controllers/inventoryController.js";
import { verifyAdminOrTeamMember } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', verifyAdminOrTeamMember, getInventoryItems);
router.get('/summary', verifyAdminOrTeamMember, getInventorySummary);
router.get('/brand/:brandId', verifyAdminOrTeamMember, getInventoryByBrand);

router.delete('/product/:productId', verifyAdminOrTeamMember, deleteProduct);
router.delete(
    '/product/:productId/variant/:sku',
    verifyAdminOrTeamMember,
    deleteVariant
);
router.put(
    '/product/:productId/variant/:sku/stock',
    verifyAdminOrTeamMember,
    updateVariantStock
);


export default router;

