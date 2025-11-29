import express from 'express';
import {
    createBlog,
    updateBlog,
    getBlogById,
    getAllBlogs,
    getBlogCategories,
    getBlogBySlug,
    deleteComment,
    deleteBlog
} from '../controllers/blogController.js';

import { uploadBlogImage } from '../middlewares/upload.js';

// Setup multer for image upload

const router = express.Router();

router.get('/', getAllBlogs);                                // Blog List
router.post('/', uploadBlogImage.single('image'), createBlog);        // Create Blog
router.get('/slug/:slug', getBlogBySlug); // 👈 Route using slug
router.get('/utils/categories', getBlogCategories);
router.get('/:id', getBlogById); 
router.put('/:id', uploadBlogImage.single('image'), updateBlog);
router.delete('/:id', deleteBlog);
router.delete('/comment/:id', deleteComment);
export default router;
