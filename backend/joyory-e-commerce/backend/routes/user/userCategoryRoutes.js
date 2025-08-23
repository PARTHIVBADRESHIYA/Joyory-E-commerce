import express from 'express';
import { getProductsByCategory } from '../../controllers/user/userProductController.js';
import { getCategoryTree } from '../../controllers/user/userCategoryController.js';

const router = express.Router();

router.get('/tree', getCategoryTree); // returns nested menu tree
router.get('/category/:slug/products', getProductsByCategory);

export default router;
