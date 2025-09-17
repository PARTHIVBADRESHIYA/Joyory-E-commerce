// routes/attributeRoutes.js
import express from 'express';
import { createAttribute, getAllAttributes, updateAttribute ,getAttributesByCategory} from '../controllers/attributeController.js';
import {  isAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/',  isAdmin, createAttribute);
router.get('/', getAllAttributes);
router.put('/:id', isAdmin, updateAttribute);
router.get("/category/:category", getAttributesByCategory);

export default router;
