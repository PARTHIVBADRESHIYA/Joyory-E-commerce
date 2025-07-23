import express from 'express';
import {
    submitReview,
    getAllReviews,
    updateReviewStatus,
    deleteReview,
    getReviewSummary,
    getReviewTable
} from '../controllers/reviewController.js';
import {authenticateUser  } from './../middlewares/authMiddleware.js';

const router = express.Router();

// Users submit reviews
router.post('/add',authenticateUser, submitReview);

// Admin panel endpoints
router.get('/',  getAllReviews);
router.patch('/:id',  updateReviewStatus);
router.delete('/:id',  deleteReview);

router.get('/summary',  getReviewSummary);
router.get('/table',  getReviewTable);

export default router;
