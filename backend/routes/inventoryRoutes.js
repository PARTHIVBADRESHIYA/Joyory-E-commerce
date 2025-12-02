import express from 'express';
import { getInventoryItems, getInventorySummary, getInventoryByBrand, deleteVariant, deleteProduct, updateVariantStock } from "./../controllers/inventoryController.js";
import { verifyAdminOrTeamMember } from '../middlewares/authMiddleware.js';
import { checkPermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', verifyAdminOrTeamMember, checkPermission('inventory:view'), getInventoryItems);
router.get('/summary', verifyAdminOrTeamMember, checkPermission('inventory:view'), getInventorySummary);
router.get('/brand/:brandId', verifyAdminOrTeamMember, checkPermission('inventory:view'), getInventoryByBrand);

router.delete('/product/:productId', verifyAdminOrTeamMember, checkPermission('inventory:delete'), deleteProduct);
router.delete(
    '/product/:productId/variant/:sku',
    verifyAdminOrTeamMember,
    checkPermission('inventory:delete'),
    deleteVariant
);
router.put(
    '/product/:productId/variant/:sku/stock',
    verifyAdminOrTeamMember,
    checkPermission('inventory:update'),
    updateVariantStock
);


export default router;

