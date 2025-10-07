// categoryRoutes.js
import express from 'express';
import {
    addCategory,
    getCategoryById,
    getCategories,
    updateCategory,
    deleteCategory
} from '../controllers/categoryController.js';
import { verifyAdminOrTeamMember } from '../middlewares/authMiddleware.js';
import { uploadCategory } from '../middlewares/upload.js';

const router = express.Router();

// Add category with banner + thumbnail upload
router.post(
    '/',
    verifyAdminOrTeamMember,
    uploadCategory.fields([
        { name: 'bannerImage', maxCount: 5 },
        { name: 'thumbnailImage', maxCount: 5 },
        { name: 'image', maxCount: 1 }
    ]),
    addCategory
);

router.get('/', verifyAdminOrTeamMember, getCategories);

router.get('/:id', verifyAdminOrTeamMember, getCategoryById);
// Update category (optional banner image update)
router.put(
    '/:id',
    verifyAdminOrTeamMember,
    uploadCategory.fields([
        { name: 'bannerImage', maxCount: 5 },
        { name: 'thumbnailImage', maxCount: 5 },
        { name: 'image', maxCount: 1 }

    ]),
    updateCategory
);

router.delete('/:id', verifyAdminOrTeamMember, deleteCategory);

export default router;
