import express from 'express';
import { isAdmin } from '../middlewares/authMiddleware.js';
import { updateProductVTO, getAllVTOProducts, getAllVTOEnabledProducts } from '../controllers/virtualTryOnController.js';
const router = express.Router();

router.get('/enabled', getAllVTOEnabledProducts);
router.put('/:id', updateProductVTO);
router.get('/', getAllVTOProducts);

export default router;