import express from 'express';
import {
    createBlog,
    getBlogById,
    getAllBlogs,
    getBlogCategories,
    getBlogBySlug
} from '../controllers/blogController.js';

import { uploadBlogImage } from '../middlewares/upload.js';

// Setup multer for image upload

const router = express.Router();

router.post('/', uploadBlogImage.single('image'), createBlog);        // Create Blog
router.get('/:id', getBlogById);                             // Blog Details
router.get('/', getAllBlogs);                                // Blog List
router.get('/utils/categories', getBlogCategories);
// routes/blogRoutes.js
router.get('/slug/:slug', getBlogBySlug); // 👈 Route using slug

export default router;
