// controllers/reviewController.js
import Product from "../models/Product.js";
import Review from "../models/Review.js";
import Order from "../models/Order.js";
import { uploadToCloudinary } from '../middlewares/upload.js';

/**
 * Submit or update a review
 */
const submitReview = async (req, res) => {
    try {
        const userId = req.user._id;
        const { productId, variantSku, shadeName, rating, title, comment } = req.body;

        let images = [];

        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const result = await uploadToCloudinary(
                    file.buffer,
                    "reviews",      // folder name in cloudinary
                    "image"
                );
                images.push(result.secure_url); // only URL string
            }
        } else if (req.body.images) {
            images = Array.isArray(req.body.images)
                ? req.body.images
                : [req.body.images];
        }

        if (!productId || !variantSku || !rating || !comment) {
            return res
                .status(400)
                .json({ message: "❌ Missing required fields: productId, variantSku, rating, or comment" });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({ message: "❌ Rating must be between 1 and 5" });
        }

        // check verified purchase
        const hasPurchased = await Order.exists({
            user: userId,
            status: { $in: ["Paid", "Completed"] },
            "products.productId": productId,
            "products.variant.sku": variantSku

        });
        const verifiedPurchase = !!hasPurchased;

        let review = await Review.findOne({
            productId, variantSku,
            customer: userId
        });
        const isNew = !review;

        if (review) {
            review.set({
                rating,
                title,
                comment,
                images: images.length ? images : review.images,
                verifiedPurchase,
                shadeName,
                status: "Active"
            });
            await review.save();
        } else {
            review = await Review.create({
                productId,
                variantSku,
                shadeName,
                customer: userId,
                rating,
                title,
                comment,
                images,
                verifiedPurchase
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
        const { stars, photosOnly, sort = "recent", variantSku, shadeName } = req.query;

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
// const getAllReviews = async (req, res) => {
//     try {
//         const reviews = await Review.find({ status: "Active" })
//             .populate("customer", "name profileImage")
//             .populate("productId", "name image");

//         const data = reviews.map(r => ({
//             id: r._id,
//             productName: r.productId?.name,
//             productImage: r.productId?.image,
//             customerName: r.customer?.name,
//             customerProfileImage: r.customer?.profileImage,
//             rating: r.rating,
//             comment: r.comment,
//             verifiedPurchase: r.verifiedPurchase,
//             createdAt: r.createdAt,
//         }));

//         res.status(200).json(data);
//     } catch (err) {
//         res.status(500).json({ message: "Failed to fetch reviews", error: err.message });
//     }
// };
const getAllReviews = async (req, res) => {
    try {
        const {
            rating,
            minRating,
            maxRating,
            productId,
            customerId,
            verified,
            search,
            customerName,
            productName,
            fromDate,
            toDate,
            sort = "recent",
            page = 1,
            limit = 20
        } = req.query;

        const match = { status: "Active" };

        const { variantSku, shadeName } = req.query;

        if (variantSku) match.variantSku = variantSku;
        if (shadeName) match.shadeName = new RegExp(shadeName, "i");
        // ---- Standard Filters ----
        if (rating) match.rating = Number(rating);

        if (minRating || maxRating) {
            match.rating = {};
            if (minRating) match.rating.$gte = Number(minRating);
            if (maxRating) match.rating.$lte = Number(maxRating);
        }

        if (productId) match.productId = productId;
        if (customerId) match.customer = customerId;

        if (verified === "true") match.verifiedPurchase = true;
        if (verified === "false") match.verifiedPurchase = false;

        if (fromDate || toDate) {
            match.createdAt = {};
            if (fromDate) match.createdAt.$gte = new Date(fromDate);
            if (toDate) match.createdAt.$lte = new Date(toDate);
        }

        const skip = (Number(page) - 1) * Number(limit);

        const sortOption = {
            recent: { createdAt: -1 },
            oldest: { createdAt: 1 },
            rating_desc: { rating: -1 },
            rating_asc: { rating: 1 },
            helpful: { helpfulVotes: -1 }
        }[sort] || { createdAt: -1 };


        // --------------------------
        // 🔥 AGGREGATION START
        // --------------------------
        const pipeline = [
            { $match: match },

            // Join customer
            {
                $lookup: {
                    from: "users",
                    localField: "customer",
                    foreignField: "_id",
                    as: "customer"
                }
            },
            { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },

            // Join product
            {
                $lookup: {
                    from: "products",
                    localField: "productId",
                    foreignField: "_id",
                    as: "product"
                }
            },
            { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },

            // Ensure product object exists
            {
                $addFields: {
                    productNameSafe: { $ifNull: ["$product.name", "Unknown Product"] },
                    productImageSafe: { $ifNull: ["$product.image", null] },
                    customerNameSafe: { $ifNull: ["$customer.name", "Unknown Customer"] },
                    customerImageSafe: { $ifNull: ["$customer.profileImage", null] }
                }
            }
        ];

        // ---- Search ----
        if (search) {
            const reg = new RegExp(search, "i");
            pipeline.push({
                $match: {
                    $or: [
                        { comment: reg },
                        { "customer.name": reg },
                        { "product.name": reg }
                    ]
                }
            });
        }

        // ---- Filter by customer name ----
        if (customerName) {
            pipeline.push({
                $match: { "customer.name": new RegExp(customerName, "i") }
            });
        }

        // ---- Filter by product name ----
        if (productName) {
            pipeline.push({
                $match: { "product.name": new RegExp(productName, "i") }
            });
        }

        // ---- Count ----
        const countPipeline = [...pipeline, { $count: "total" }];
        const totalResult = await Review.aggregate(countPipeline);
        const total = totalResult[0]?.total || 0;

        // ---- Sort + Pagination ----
        pipeline.push({ $sort: sortOption });
        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: Number(limit) });

        // ---- FINAL CLEAN FIELDS ONLY ----
        pipeline.push({
            $project: {
                _id: 1,
                rating: 1,
                comment: 1,
                createdAt: 1,

                variantSku: 1,
                shadeName: 1,
                productName: "$product.name",
                productImage: "$product.image",

                customerName: "$customer.name",
                customerProfileImage: "$customer.profileImage",
            }
        });

        const reviews = await Review.aggregate(pipeline);

        res.status(200).json({
            total,
            page: Number(page),
            limit: Number(limit),
            reviews
        });

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
const getGlobalReviewSummary = async (req, res) => {
    try {
        // Fetch ALL active reviews across ALL products
        const reviews = await Review.find({ status: "Active" });

        if (!reviews.length) {
            return res.status(200).json({
                totalReviews: 0,
                averageRating: 0,
                positiveReviews: 0,
                negativeReviews: 0,
                breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                reviewsWithPhotos: 0,
                verifiedPurchases: 0,
                last30DaysCount: 0
            });
        }

        const totalReviews = reviews.length;

        // ⭐ Breakdown object (1–5)
        const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

        let totalRating = 0;
        let positiveReviews = 0;
        let negativeReviews = 0;
        let reviewsWithPhotos = 0;
        let verifiedPurchases = 0;
        let last30DaysCount = 0;

        const last30Days = new Date();
        last30Days.setDate(last30Days.getDate() - 30);

        for (const r of reviews) {
            const rating = r.rating;

            // total rating for avg
            totalRating += rating;

            // breakdown count
            breakdown[rating]++;

            // positive: 3,4,5
            if (rating >= 3) positiveReviews++;

            // negative: 1,2
            if (rating <= 2) negativeReviews++;

            // photo reviews
            if (r.images && r.images.length > 0) reviewsWithPhotos++;

            // verified purchase
            if (r.verifiedPurchase) verifiedPurchases++;

            // last 30 days activity
            if (r.createdAt >= last30Days) last30DaysCount++;
        }

        const averageRating = parseFloat((totalRating / totalReviews).toFixed(1));

        return res.status(200).json({
            totalReviews,
            averageRating,
            breakdown,
            positiveReviews,
            negativeReviews,
            reviewsWithPhotos,
            verifiedPurchases,
            last30DaysCount
        });

    } catch (err) {
        res.status(500).json({
            message: "Failed to load global review summary",
            error: err.message
        });
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
    getGlobalReviewSummary,
    getTopReviews,
    reactToReview,
    reportReview,
};
