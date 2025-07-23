//controllers/reviewController.js
import Review from '../models/Review.js';

// Submit a new review (customer)
const submitReview = async (req, res) => {
    try {
        const { productId, rating, comment } = req.body;

        const newReview = await Review.create({
            productId: productId,
            rating,
            comment, // ✅ use "comment"
            status: 'Active'
        });

        res.status(201).json({ message: 'Review submitted', review: newReview });
    } catch (err) {
        res.status(500).json({ message: 'Failed to submit review', error: err.message });
    }
};

// Admin: Get all reviews with customer & product info
const getAllReviews = async (req, res) => {
    try {
        const reviews = await Review.find()
            .populate('customer', 'name')
            .populate('product', 'name image');

        const data = reviews.map(r => ({
            id: r._id,
            productName: r.product?.name || 'Deleted Product',
            productImage: r.product?.image || '',
            customerName: r.customer?.name || 'Unknown',
            rating: r.rating,
            comment: r.comment, // ✅ fixed
            status: r.status,
            createdAt: r.createdAt
        }));

        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch reviews', error: err.message });
    }
};

// Admin: Approve/Reject review
const updateReviewStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const review = await Review.findByIdAndUpdate(req.params.id, { status }, { new: true });
        res.status(200).json({ message: 'Status updated', review });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update status', error: err.message });
    }
};

// Admin: Delete review
const deleteReview = async (req, res) => {
    try {
        await Review.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Review deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete review', error: err.message });
    }
};

const getReviewSummary = async (req, res) => {
    try {
        const reviews = await Review.find();

        const totalReviews = reviews.length;
        const averageRating = totalReviews
            ? (reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1)
            : 0;
        const positiveReviews = reviews.filter(r => r.rating >= 4).length;
        const featuredReviews = reviews.filter(r => r.featured === true).length;

        res.status(200).json({
            totalReviews,
            averageRating,
            positiveReviews,
            featuredReviews
        });
    } catch (err) {
        res.status(500).json({ message: 'Failed to load summary', error: err.message });
    }
};

const getReviewTable = async (req, res) => {
    try {
        const reviews = await Review.find()
            .populate('product', 'name')
            .populate('customer', 'name')
            .sort({ createdAt: -1 });

        const data = reviews.map(r => ({
            id: r._id,
            product: r.product?.name || 'Deleted Product',
            customer: r.customer?.name || 'Unknown',
            rating: r.rating,
            review: r.comment, // ✅ fixed field name
            date: r.createdAt.toISOString().split('T')[0],
            status: r.status
        }));

        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch reviews', error: err.message });
    }
};

export {
    submitReview,
    getAllReviews,
    updateReviewStatus,
    deleteReview,
    getReviewSummary,
    getReviewTable
};
