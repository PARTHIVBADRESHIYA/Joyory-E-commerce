//controllers/reviewController.js
import Product from '../models/Product.js';
import Review from '../models/Review.js';
import Order from '../models/Order.js';

const submitReview = async (req, res) => {
    try {
        const userId = req.user._id;
        const { productId, rating, title, comment } = req.body;

        const images = req.files?.map(file => file.path) || req.body.images || [];

        if (!productId || !rating || !comment) {
            return res.status(400).json({ message: '❌ Missing required fields: productId, rating, or comment' });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({ message: '❌ Rating must be between 1 and 5' });
        }

        const hasPurchased = await Order.exists({
            user: userId,
            status: { $in: ['Paid', 'Completed'] },
            'products.productId': productId
        });

        const verifiedPurchase = !!hasPurchased;

        let review = await Review.findOne({ productId, customer: userId });

        const isNew = !review;

        if (review) {
            review.set({
                rating,
                title,
                comment,
                images: images.length > 0 ? images : review.images,
                verifiedPurchase,
                status: 'Active'
            });
            await review.save();
        } else {
            review = await Review.create({
                productId,
                customer: userId,
                rating,
                title,
                comment,
                images,
                verifiedPurchase,
                helpfulVotes: 0,
                status: 'Active'
            });
        }

        const activeReviews = await Review.find({ productId, status: 'Active' });

        const totalRating = activeReviews.reduce((sum, r) => sum + r.rating, 0);
        const avgRating = activeReviews.length ? parseFloat((totalRating / activeReviews.length).toFixed(1)) : 0;

        const ratingsBreakdown = {
            Excellent: activeReviews.filter(r => r.rating === 5).length,
            VeryGood: activeReviews.filter(r => r.rating === 4).length,
            Average: activeReviews.filter(r => r.rating === 3).length,
            Good: activeReviews.filter(r => r.rating === 2).length,
            Poor: activeReviews.filter(r => r.rating === 1).length
        };

        await Product.findByIdAndUpdate(productId, {
            avgRating,
            commentsCount: activeReviews.length,
            ratingsBreakdown
        });

        return res.status(isNew ? 201 : 200).json({
            message: isNew ? '✅ Review submitted successfully' : '✅ Review updated',
            review
        });

    } catch (err) {
        console.error('❌ Review submission error:', err);
        res.status(500).json({ message: '❌ Failed to submit review', error: err.message });
    }
};

const voteReviewHelpful = async (req, res) => {
    try {
        const { vote } = req.body; // 'up' or 'down'
        const { id } = req.params;
        const review = await Review.findById(id);
        if (!review) return res.status(404).json({ message: 'Review not found' });

        review.helpfulVotes += vote === 'up' ? 1 : -1;
        await review.save();

        res.json({ message: 'Vote recorded', helpfulVotes: review.helpfulVotes });
    } catch (err) {
        res.status(500).json({ message: 'Failed to vote', error: err.message });
    }
};

const getProductReviews = async (req, res) => {
    try {
        const { productId } = req.params;
        const { stars, photosOnly, sort = 'recent' } = req.query;

        const filter = { productId, status: 'Active' };

        if (stars) filter.rating = Number(stars);
        if (photosOnly === 'true') filter.images = { $exists: true, $ne: [] };

        let sortOption = { createdAt: -1 };
        if (sort === 'helpful') sortOption = { helpfulVotes: -1 };

        const reviews = await Review.find(filter)
            .populate('customer', 'name')
            .sort(sortOption);

        res.status(200).json({ reviews });
    } catch (err) {
        console.error('❌ Get reviews error:', err);
        res.status(500).json({ message: '❌ Failed to fetch reviews', error: err.message });
    }
};

const getAllReviews = async (req, res) => {
    try {
        const reviews = await Review.find({ status: 'Active' })
            .populate('customer', 'name')
            .populate('productId', 'name image');

        const data = reviews.map(r => ({
            id: r._id,
            productName: r.productId?.name,
            productImage: r.productId?.image,
            customerName: r.customer?.name,
            rating: r.rating,
            comment: r.comment,
            verifiedPurchase: r.verifiedPurchase,
            createdAt: r.createdAt
        }));

        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch reviews', error: err.message });
    }
};

const updateReviewStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const review = await Review.findByIdAndUpdate(req.params.id, { status }, { new: true });
        res.status(200).json({ message: 'Status updated', review });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update status', error: err.message });
    }
};

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
            review: r.comment,
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
    voteReviewHelpful,
    getProductReviews,
    getAllReviews,
    updateReviewStatus,
    deleteReview,
    getReviewSummary,
    getReviewTable
};
