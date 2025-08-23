    // routes/commentRoutes.js
    import express from 'express';
    import { createComment, getCommentsByBlog, reactToComment } from '../controllers/commentController.js';
    import { uploadCommentImage } from '../middlewares/upload.js'; // Similar to blog image upload
    import { authenticateUser } from './../middlewares/authMiddleware.js';

    const router = express.Router();

    router.post('/:blogId', authenticateUser, uploadCommentImage.single('image'), createComment);
    router.get('/:blogId', getCommentsByBlog);
    router.post('/react/:commentId', authenticateUser, reactToComment);
    
    export default router;
    