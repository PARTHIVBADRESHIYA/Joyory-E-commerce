import express from 'express';
import {
    submitReview,
    getAllReviews,
    updateReviewStatus,
    deleteReview,
    getGlobalReviewSummary,
    voteReviewHelpful,
    getProductReviews,
    reactToReview,
    getTopReviews,
    reportReview
    // ✅ New controller for filtered reviews
} from '../controllers/reviewController.js';

import { protect, isAdmin } from './../middlewares/authMiddleware.js';
import { uploadReview } from '../middlewares/upload.js';

const router = express.Router();

// 📝 Submit a review (with image upload)
router.post(
    '/add',
    protect,
    uploadReview.array("images", 5), // 🔥 THIS LINE FIXES req.body

    submitReview
);

// 👍 Upvote/downvote helpful
router.post('/:id/vote-helpful', protect, voteReviewHelpful);

// 💬 Get reviews for a product (filtered: stars, photosOnly, sort)
router.get('/product/:productId', getProductReviews);

// 🛠 Admin Panel APIs
router.get('/', getAllReviews);
router.get('/summary', getGlobalReviewSummary);
router.patch('/:id', isAdmin, updateReviewStatus);
router.delete('/:id', isAdmin, deleteReview);

router.post('/:id/react', protect, reactToReview);
router.post('/:id/report', protect, reportReview);
router.get('/product/:productId/top', getTopReviews);

export default router;
