// routes/attributeRoutes.js
import express from 'express';
import { createAttribute, getAllAttributes, updateAttribute ,getAttributesByCategory,deleteAttribute,getSingleAttribute} from '../controllers/attributeController.js';
import {  isAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/',  isAdmin, createAttribute);
router.get('/', getAllAttributes);
router.get('/:id', getSingleAttribute);
router.put('/:id', isAdmin, updateAttribute);
router.delete('/:id', isAdmin, deleteAttribute);
router.get("/category/:category", getAttributesByCategory);

export default router;
