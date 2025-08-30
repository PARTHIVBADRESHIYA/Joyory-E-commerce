import express from 'express';
import {
    submitReview,
    getAllReviews,
    updateReviewStatus,
    deleteReview,
    getReviewSummary,
    getReviewTable,
    voteReviewHelpful,
    getProductReviews // ✅ New controller for filtered reviews
} from '../controllers/reviewController.js';

import { authenticateUser } from './../middlewares/authMiddleware.js';
import { uploadReview } from '../middlewares/uploadReview.js';

const router = express.Router();

// 📝 Submit a review (with image upload)
router.post(
    '/add',
    authenticateUser,
    uploadReview.array('images', 3),
    submitReview
);

// 👍 Upvote/downvote helpful
router.post('/:id/vote-helpful', authenticateUser, voteReviewHelpful);

// 💬 Get reviews for a product (filtered: stars, photosOnly, sort)
router.get('/product/:productId', getProductReviews);

// 🛠 Admin Panel APIs
router.get('/', getAllReviews);
router.get('/summary', getReviewSummary);
router.get('/table', getReviewTable);
router.patch('/:id', updateReviewStatus);
router.delete('/:id', deleteReview);

export default router;
