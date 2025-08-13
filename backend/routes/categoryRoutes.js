// categoryRoutes.js
import express from 'express';
import {
    addCategory,
    getCategories,
    updateCategory,
    deleteCategory
} from '../controllers/categoryController.js';
import { verifyAdminOrTeamMember } from '../middlewares/authMiddleware.js';
import { uploadCategoryBanner, uploadCategoryThumbnail } from '../middlewares/upload.js';

const router = express.Router();

// Add category with banner + thumbnail upload
router.post(
    '/',
    verifyAdminOrTeamMember,
    uploadCategoryBanner.single('bannerImage'),
    addCategory
);

router.get('/', verifyAdminOrTeamMember, getCategories);

// Update category (optional banner image update)
router.put(
    '/:id',
    verifyAdminOrTeamMember,
    uploadCategoryBanner.single('bannerImage'),
    updateCategory
);

router.delete('/:id', verifyAdminOrTeamMember, deleteCategory);

export default router;
