import express from 'express';
import {
    addCategory,
    getCategories,
    updateCategory,
    deleteCategory
} from '../controllers/categoryController.js';
import { verifyAdminOrTeamMember } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Category routes

router.post('/',verifyAdminOrTeamMember, addCategory);
router.get('/',verifyAdminOrTeamMember, getCategories);
router.put('/:id',verifyAdminOrTeamMember, updateCategory);
router.delete('/:id',verifyAdminOrTeamMember, deleteCategory);
export default router;
