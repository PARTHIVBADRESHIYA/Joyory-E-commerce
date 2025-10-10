// controllers/reviewController.js
import Product from "../models/Product.js";
import Review from "../models/Review.js";
import Order from "../models/Order.js";

/**
 * Submit or update a review
 */
const submitReview = async (req, res) => {
    try {
        const userId = req.user._id;
        const { productId, rating, title, comment } = req.body;

        const images = req.files?.map(file => file.path) || req.body.images || [];

        if (!productId || !rating || !comment) {
            return res
                .status(400)
                .json({ message: "❌ Missing required fields: productId, rating, or comment" });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({ message: "❌ Rating must be between 1 and 5" });
        }

        // check verified purchase
        const hasPurchased = await Order.exists({
            user: userId,
            status: { $in: ["Paid", "Completed"] },
            "products.productId": productId,
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
                status: "Active",
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
                status: "Active",
            });
        }

        // update product stats
        const activeReviews = await Review.find({ productId, status: "Active" });
        const totalRating = activeReviews.reduce((sum, r) => sum + r.rating, 0);
        const avgRating = activeReviews.length
            ? parseFloat((totalRating / activeReviews.length).toFixed(1))
            : 0;

        const ratingsBreakdown = {
            5: activeReviews.filter(r => r.rating === 5).length,
            4: activeReviews.filter(r => r.rating === 4).length,
            3: activeReviews.filter(r => r.rating === 3).length,
            2: activeReviews.filter(r => r.rating === 2).length,
            1: activeReviews.filter(r => r.rating === 1).length,
        };

        await Product.findByIdAndUpdate(productId, {
            avgRating,
            commentsCount: activeReviews.length,
            ratingsBreakdown,
        });

        await review.populate("customer", "name profileImage");

        return res.status(isNew ? 201 : 200).json({
            message: isNew ? "✅ Review submitted successfully" : "✅ Review updated",
            review,
        });
    } catch (err) {
        console.error("❌ Review submission error:", err);
        res.status(500).json({ message: "❌ Failed to submit review", error: err.message });
    }
};

/**
 * Vote a review helpful or not
 */
const voteReviewHelpful = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id; // assuming you have auth middleware that sets req.user

        const review = await Review.findById(id);
        if (!review) return res.status(404).json({ message: "Review not found" });

        const alreadyVoted = review.helpfulVoters.includes(userId);

        if (alreadyVoted) {
            // User cancels vote
            review.helpfulVoters.pull(userId);
            review.helpfulVotes = Math.max(0, review.helpfulVotes - 1);
        } else {
            // User adds vote
            review.helpfulVoters.push(userId);
            review.helpfulVotes += 1;
        }

        await review.save();

        res.json({
            message: alreadyVoted ? "Vote removed" : "Vote added",
            helpfulVotes: review.helpfulVotes
        });
    } catch (err) {
        res.status(500).json({ message: "Failed to vote", error: err.message });
    }
};

/**
 * Get reviews for product page (with filters: stars, photosOnly, sort)
 */
const getProductReviews = async (req, res) => {
    try {
        const { productId } = req.params;
        const { stars, photosOnly, sort = "recent" } = req.query;

        const filter = { productId, status: "Active" };
        if (stars) filter.rating = Number(stars);
        if (photosOnly === "true") filter.images = { $exists: true, $ne: [] };

        let sortOption = { createdAt: -1 };
        if (sort === "helpful") sortOption = { helpfulVotes: -1 };

        const reviews = await Review.find(filter)
            .populate("customer", "name profileImage")
            .sort(sortOption);

        if (!reviews.length) {
            return res.json({ message: "No reviews found for this filter." });
        }

        res.status(200).json({ reviews });
    } catch (err) {
        res.status(500).json({ message: "❌ Failed to fetch reviews", error: err.message });
    }
};

/**
 * Admin: get all reviews
 */
const getAllReviews = async (req, res) => {
    try {
        const reviews = await Review.find({ status: "Active" })
            .populate("customer", "name profileImage")
            .populate("productId", "name image");

        const data = reviews.map(r => ({
            id: r._id,
            productName: r.productId?.name,
            productImage: r.productId?.image,
            customerName: r.customer?.name,
            customerProfileImage: r.customer?.profileImage,
            rating: r.rating,
            comment: r.comment,
            verifiedPurchase: r.verifiedPurchase,
            createdAt: r.createdAt,
        }));

        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch reviews", error: err.message });
    }
};

/**
 * Update review status (admin)
 */
const updateReviewStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const review = await Review.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        ).populate("customer", "name profileImage");

        res.status(200).json({ message: "Status updated", review });
    } catch (err) {
        res.status(500).json({ message: "Failed to update status", error: err.message });
    }
};

/**
 * Delete review (admin)
 */
const deleteReview = async (req, res) => {
    try {
        await Review.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Review deleted" });
    } catch (err) {
        res.status(500).json({ message: "Failed to delete review", error: err.message });
    }
};

/**
 * Product Review Summary (for product page header)
 */
const getReviewSummary = async (req, res) => {
    try {
        const { id } = req.params;

        const reviews = await Review.find({ productId: id, status: "Active" });
        if (!reviews.length) {
            return res.json({ message: "No reviews found for this product." });
        }

        const totalReviews = reviews.length;
        const averageRating = (
            reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
        ).toFixed(1);

        const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        reviews.forEach(r => {
            breakdown[r.rating] = (breakdown[r.rating] || 0) + 1;
        });

        res.status(200).json({
            totalReviews,
            averageRating,
            breakdown,
        });
    } catch (err) {
        res.status(500).json({ message: "Failed to load summary", error: err.message });
    }
};

/**
 * Top Reviews (helpful ones)
 */
const getTopReviews = async (req, res) => {
    try {
        const { productId } = req.params;
        const reviews = await Review.find({ productId, status: "Active" })
            .sort({ helpfulVotes: -1, createdAt: -1 })
            .limit(5)
            .populate("customer", "name profileImage");

        if (!reviews.length) {
            return res.json({ message: "No reviews found" });
        }

        res.json({ reviews });
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch top reviews", error: err.message });
    }
};

/**
 * Reactions (like, love, funny, angry)
 */
const reactToReview = async (req, res) => {
    try {
        const { reaction } = req.body; // expect "like" | "love" | "funny" | "angry"
        const review = await Review.findById(req.params.id);
        if (!review) return res.status(404).json({ message: "Review not found" });

        const validReactions = ["like", "love", "funny", "angry"];
        if (!validReactions.includes(reaction)) {
            return res.status(400).json({ message: "Invalid reaction type" });
        }

        review.reactions[reaction] += 1;
        await review.save();

        res.json({ message: "Reaction added", reactions: review.reactions });
    } catch (err) {
        res.status(500).json({ message: "Failed to react", error: err.message });
    }
};

/**
 * Report review
 */
const reportReview = async (req, res) => {
    try {
        const { reason } = req.body;
        const userId = req.user._id;

        const review = await Review.findById(req.params.id);
        if (!review) return res.status(404).json({ message: "Review not found" });

        review.reports.push({ userId, reason });
        await review.save();

        res.json({ message: "Review reported", reports: review.reports.length });
    } catch (err) {
        res.status(500).json({ message: "Failed to report review", error: err.message });
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
    getTopReviews,
    reactToReview,
    reportReview,
};
