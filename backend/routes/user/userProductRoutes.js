import express from 'express';
import { getAllFilteredProducts, getSingleProduct } from '../../controllers/user/userProductController.js';

const router = express.Router();

router.get('/', getAllFilteredProducts); // /api/user/products
router.get('/:id', getSingleProduct);    // /api/user/products/:id




export default router;
        