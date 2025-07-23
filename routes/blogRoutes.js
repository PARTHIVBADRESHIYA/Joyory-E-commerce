import express from 'express';
import multer from 'multer';
import {
    createBlog,
    getBlogById,
    getAllBlogs,
    getBlogCategories
} from '../controllers/blogController.js';

// Setup multer for image upload
const upload = multer({ dest: 'uploads/blogs/' }); // You can customize storage later

const router = express.Router();

router.post('/', upload.single('image'), createBlog);        // Create Blog
router.get('/:id', getBlogById);                             // Blog Details
router.get('/', getAllBlogs);                                // Blog List
router.get('/utils/categories', getBlogCategories);

export default router;
