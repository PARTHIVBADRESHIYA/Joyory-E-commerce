import express from 'express';
import { getProductsByCategory } from '../../controllers/user/userProductController.js';
import { getCategoryTree, getBrands, getBrandWithCategories, getProductsByBrandAndCategory } from '../../controllers/user/userCategoryController.js';

const router = express.Router();

router.get('/tree', getCategoryTree); // returns nested menu tree
router.get('/category/:slug/products', getProductsByCategory);

// routes/categoryRoutes.js
router.get('/brands', getBrands);  
router.get('/:brandSlug', getBrandWithCategories);  
router.get('/:brandSlug/:categorySlug', getProductsByBrandAndCategory);


export default router;
