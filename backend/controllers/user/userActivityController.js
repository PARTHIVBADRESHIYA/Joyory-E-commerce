import mongoose from "mongoose";
import UserActivity from "../../models/UserActivity.js";

export const getUserActivitiesByUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { from, to, type } = req.query;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, message: "Invalid user id" });
        }

        // ─────────────── MATCH FILTER ───────────────
        const match = {
            user: new mongoose.Types.ObjectId(userId)
        };

        if (type) match.type = type;

        if (from || to) {
            match.createdAt = {};
            if (from) match.createdAt.$gte = new Date(from);
            if (to) match.createdAt.$lte = new Date(to);
        }

        // ─────────────── AGGREGATION ───────────────
        const result = await UserActivity.aggregate([
            { $match: match },
            { $sort: { createdAt: -1 } },

            // ─────────────── LOOKUP PRODUCT & CATEGORY ───────────────
            {
                $lookup: {
                    from: "products",
                    localField: "product",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "categoryDetails"
                }
            },

            // ─────────────── UNWIND RESULTS ───────────────
            { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$categoryDetails", preserveNullAndEmptyArrays: true } },

            // ─────────────── FACET ───────────────
            {
                $facet: {
                    summary: [
                        {
                            $group: {
                                _id: "$type",
                                count: { $sum: 1 }
                            }
                        }
                    ],
                    categories: [
                        {
                            $group: {
                                _id: "$type",
                                count: { $sum: 1 },
                                items: {
                                    $push: {
                                        _id: "$_id",
                                        product: "$product",
                                        productName: "$productDetails.name",
                                        category: "$category",
                                        categoryName: "$categoryDetails.name",
                                        createdAt: "$createdAt"
                                    }
                                }
                            }
                        }
                    ]
                }
            }
        ]);

        // ─────────────── FORMAT RESPONSE ───────────────
        const summaryObj = {};
        let totalActivities = 0;

        result[0].summary.forEach(s => {
            summaryObj[s._id] = s.count;
            totalActivities += s.count;
        });

        const categoriesObj = {};
        result[0].categories.forEach(c => {
            categoriesObj[c._id] = {
                count: c.count,
                items: c.items
            };
        });

        return res.status(200).json({
            success: true,
            userId,
            summary: {
                totalActivities,
                ...summaryObj
            },
            filtersApplied: {
                from: from || null,
                to: to || null,
                type: type || null
            },
            categories: categoriesObj
        });

    } catch (error) {
        console.error("User activity fetch error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch user activities"
        });
    }
};

export const getAllUserActivities = async (req, res) => {
    try {
        const { from, to } = req.query;
        const PER_TYPE_LIMIT = 12;

        // ───────────── MATCH FILTER ─────────────
        const match = {};
        if (from || to) {
            match.createdAt = {};
            if (from) match.createdAt.$gte = new Date(from);
            if (to) match.createdAt.$lte = new Date(to);
        }

        // ───────────── FACET PIPELINE ─────────────
        const facetPipeline = (type) => ([
            { $match: { ...match, type } },
            { $sort: { _id: -1 } },
            { $limit: PER_TYPE_LIMIT },

            {
                $lookup: {
                    from: "products",
                    localField: "product",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "categoryDetails"
                }
            },
            { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$categoryDetails", preserveNullAndEmptyArrays: true } },

            {
                $project: {
                    _id: 1,
                    user: 1,
                    type: 1,
                    product: 1,
                    productName: "$productDetails.name",
                    category: 1,
                    categoryName: "$categoryDetails.name",
                    createdAt: 1
                }
            }
        ]);

        const [result] = await UserActivity.aggregate([
            {
                $facet: {
                    product_view: facetPipeline("product_view"),
                    category_view: facetPipeline("category_view"),
                    add_to_cart: facetPipeline("add_to_cart"),
                    order: facetPipeline("order"),
                    checkout: facetPipeline("checkout")
                }
            }
        ]);

        // ───────────── SUMMARY COUNTS ─────────────
        const summaryAgg = await UserActivity.aggregate([
            { $match: match },
            {
                $group: {
                    _id: "$type",
                    count: { $sum: 1 }
                }
            }
        ]);

        let totalActivities = 0;
        const summary = {};
        summaryAgg.forEach(s => {
            summary[s._id] = s.count;
            totalActivities += s.count;
        });

        return res.json({
            success: true,
            summary: { totalActivities, ...summary },
            activities: {
                product_view: {
                    type: "product_view",
                    count: summary.product_view || 0,
                    items: result.product_view
                },
                category_view: {
                    type: "category_view",
                    count: summary.category_view || 0,
                    items: result.category_view
                },
                add_to_cart: {
                    type: "add_to_cart",
                    count: summary.add_to_cart || 0,
                    items: result.add_to_cart
                },
                order: {
                    type: "order",
                    count: summary.order || 0,
                    items: result.order
                },
                checkout: {
                    type: "checkout",
                    count: summary.checkout || 0,
                    items: result.checkout
                }
            }
        });

    } catch (err) {
        console.error("User activity error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch categorized activities"
        });
    }
};

export const getActivitiesByType = async (req, res) => {
    try {
        const { type } = req.params;
        const { from, to, limit = 20, cursor } = req.query;
        const pageLimit = Math.min(Number(limit), 50);

        // ───────────── MATCH FILTER ─────────────
        const match = { type };

        if (from || to) {
            match.createdAt = {};
            if (from) match.createdAt.$gte = new Date(from);
            if (to) match.createdAt.$lte = new Date(to);
        }

        if (cursor) {
            match._id = { $lt: new mongoose.Types.ObjectId(cursor) };
        }

        const activities = await UserActivity.aggregate([
            { $match: match },
            { $sort: { _id: -1 } },
            { $limit: pageLimit },

            {
                $lookup: {
                    from: "products",
                    localField: "product",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "categoryDetails"
                }
            },
            { $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true } },
            { $unwind: { path: "$categoryDetails", preserveNullAndEmptyArrays: true } },

            {
                $project: {
                    _id: 1,
                    user: 1,
                    type: 1,
                    product: 1,
                    productName: "$productDetails.name",
                    category: 1,
                    categoryName: "$categoryDetails.name",
                    createdAt: 1
                }
            }
        ]);

        let message = null;

        if (!activities.length && cursor) {
            // User scrolled till end
            message = "🎉 You’ve reached the end! No more activities to show.";
        }

        if (!activities.length && !cursor) {
            // First load but no activities
            message = "No activities found for the selected filters.";
        }


        return res.json({
            success: true,
            items: activities,
            nextCursor: activities.length
                ? activities[activities.length - 1]._id
                : null,
            message
        });

    } catch (err) {
        console.error("Activities by type error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch activities"
        });
    }
};
