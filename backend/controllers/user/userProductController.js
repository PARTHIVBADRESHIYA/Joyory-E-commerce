import Product from '../../models/Product.js';
import Review from '../../models/Review.js';
import User from '../../models/User.js';
import Category from '../../models/Category.js';
import { getDescendantCategoryIds } from '../../middlewares/utils/categoryUtils.js';
import mongoose from 'mongoose';

/**
 * GET /products (Filtered list)
 */
export const getAllFilteredProducts = async (req, res) => {
    try {
        const {
            priceMin,
            priceMax,
            brand,
            category, // can be slug or ObjectId
            discount,
            preference,
            ingredients,
            benefits,
            concern,
            skinType,
            makeupFinish,
            formulation,
            color,
            skinTone,
            gender,
            age,
            conscious,
            shade,
            page = 1,
            limit = 12
        } = req.query;

        const filter = {};

        if (brand) filter.brand = brand;

        // ✅ Category filter — only if provided and valid
        if (category && category.trim() !== '') {
            let catDoc = null;

            if (mongoose.Types.ObjectId.isValid(category)) {
                catDoc = await Category.findById(category).lean();
            } else {
                catDoc = await Category.findOne({ slug: category.toLowerCase() }).lean();
            }

            if (catDoc?._id) {
                const ids = await getDescendantCategoryIds(catDoc._id);
                const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => new mongoose.Types.ObjectId(id));

                if (validIds.length) {
                    filter.$or = [
                        { categories: { $in: validIds } },
                        { category: { $in: validIds } }
                    ];
                }
            }
        }

        if (color) filter.colorOptions = { $in: [color] };
        if (shade) filter.shadeOptions = { $in: [shade] };

        if (priceMin || priceMax) {
            filter.price = {};
            if (priceMin) filter.price.$gte = Number(priceMin);
            if (priceMax) filter.price.$lte = Number(priceMax);
        }

        const tagFilters = [
            skinType, formulation, makeupFinish, benefits, concern,
            skinTone, gender, age, conscious, preference, ingredients, discount
        ].filter(Boolean);

        if (tagFilters.length > 0) {
            filter.productTags = { $all: tagFilters };
        }

        const currentPage = Number(page);
        const perPage = Number(limit);
        const skip = (currentPage - 1) * perPage;

        const total = await Product.countDocuments(filter);

        // ✅ Safe populate: only populate when category field is a valid ObjectId
        const products = await Product.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(perPage)
            .lean();

        // Manually attach category objects for valid ObjectId references
        const categoryIds = [
            ...new Set(
                products
                    .map(p => p.category)
                    .filter(id => mongoose.Types.ObjectId.isValid(id))
                    .map(id => String(id))
            )
        ];

        const categoryMap = categoryIds.length
            ? new Map(
                (await Category.find({ _id: { $in: categoryIds } })
                    .select('name slug')
                    .lean()
                ).map(c => [String(c._id), c])
            )
            : new Map();

        const cards = products.map(p => {
            const hasShades = p.shadeOptions && p.shadeOptions.length > 0;
            return {
                _id: p._id,
                name: p.name,
                variant: p.variant,
                price: p.price,
                brand: p.brand,
                category: mongoose.Types.ObjectId.isValid(p.category)
                    ? categoryMap.get(String(p.category)) || null
                    : null,
                summary: p.summary || p.description?.slice(0, 100) || '',
                status: p.status,
                image: p.images?.length > 0
                    ? (p.images[0].startsWith('http') ? p.images[0] : `${process.env.BASE_URL}/${p.images[0]}`)
                    : null,
                colorOptions: p.colorOptions || [],
                commentsCount: p.commentsCount || 0,
                avgRating: p.avgRating || 0,
                ...(hasShades && {
                    shades: p.shadeOptions.slice(0, 3),
                    moreShadesCount: Math.max(0, p.shadeOptions.length - 3)
                })
            };
        });

        const totalPages = Math.ceil(total / perPage);

        res.status(200).json({
            products: cards,
            total,
            currentPage,
            totalPages,
            hasMore: currentPage < totalPages,
            nextPage: currentPage < totalPages ? currentPage + 1 : null,
            prevPage: currentPage > 1 ? currentPage - 1 : null
        });

    } catch (err) {
        console.error('❌ Filter error:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

/**
 * GET /products/:id (Single product + reviews)
 */
export const getSingleProduct = async (req, res) => {
    try {
        const {
            sort = 'recent',
            withPhotos = false,
            ratingFilter,
            page = 1,
            limit = 5
        } = req.query;

        // ✅ No populate to avoid cast error — we’ll attach manually
        const product = await Product.findByIdAndUpdate(
            req.params.id,
            { $inc: { views: 1 } },
            { new: true, lean: true }
        );

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Attach category if valid
        let categoryObj = null;
        if (mongoose.Types.ObjectId.isValid(product.category)) {
            categoryObj = await Category.findById(product.category)
                .select('name slug')
                .lean();
        }

        const reviewFilter = {
            productId: product._id,
            status: 'Active'
        };

        if (withPhotos === 'true') {
            reviewFilter.images = { $exists: true, $not: { $size: 0 } };
        }
        if (ratingFilter) {
            reviewFilter.rating = Number(ratingFilter);
        }

        const sortBy = sort === 'helpful'
            ? { helpfulVotes: -1, createdAt: -1 }
            : { createdAt: -1 };

        const currentPage = Number(page);
        const perPage = Number(limit);
        const skip = (currentPage - 1) * perPage;

        const reviews = await Review.find(reviewFilter)
            .populate('customer', 'name')
            .sort(sortBy)
            .skip(skip)
            .limit(perPage);

        const totalReviews = await Review.countDocuments(reviewFilter);

        const allActiveReviews = await Review.find({
            productId: product._id,
            status: 'Active'
        });

        const totalRating = allActiveReviews.reduce((sum, r) => sum + r.rating, 0);
        const avgRating = allActiveReviews.length
            ? parseFloat((totalRating / allActiveReviews.length).toFixed(1))
            : 0;

        const ratingsBreakdown = {
            Excellent: allActiveReviews.filter(r => r.rating === 5).length,
            VeryGood: allActiveReviews.filter(r => r.rating === 4).length,
            Average: allActiveReviews.filter(r => r.rating === 3).length,
            Good: allActiveReviews.filter(r => r.rating === 2).length,
            Poor: allActiveReviews.filter(r => r.rating === 1).length
        };

        const featuredReviews = await Review.find({
            productId: product._id,
            status: 'Active',
            featured: true
        })
            .populate('customer', 'name')
            .sort({ helpfulVotes: -1, createdAt: -1 })
            .limit(3);

        res.status(200).json({
            ...product,
            category: categoryObj,
            avgRating,
            commentsCount: allActiveReviews.length,
            ratingsBreakdown,
            featuredReviews,
            reviews,
            pagination: {
                total: totalReviews,
                currentPage,
                totalPages: Math.ceil(totalReviews / perPage),
                hasMore: currentPage * perPage < totalReviews
            }
        });

    } catch (err) {
        console.error("❌ getSingleProduct error:", err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

/**
 * GET /products/category/:slug
 */
export const getProductsByCategory = async (req, res) => {
    try {
        const slug = req.params.slug.toLowerCase(); // normalize
        let { page = 1, limit = 12, sort = 'recent' } = req.query;
        page = Number(page);
        limit = Number(limit);

        // ✅ Find category by slug or id
        let category = null;
        if (mongoose.Types.ObjectId.isValid(slug)) {
            category = await Category.findById(slug)
                .select('name slug bannerImage thumbnailImage ancestors')
                .lean();
        } else {
            category = await Category.findOne({ slug })
                .select('name slug bannerImage thumbnailImage ancestors')
                .lean();
        }

        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        // ✅ Get descendant category IDs
        const ids = (await getDescendantCategoryIds(category._id))
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));

        ids.push(category._id);

        const filter = {
            $or: [
                { categories: { $in: ids } },
                { category: { $in: ids } }
            ]
        };

        const total = await Product.countDocuments(filter);
        const products = await Product.find(filter)
            .sort(sort === 'recent' ? { createdAt: -1 } : { price: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        // Attach categories safely
        const categoryIds = [
            ...new Set(
                products
                    .map(p => p.category)
                    .filter(id => mongoose.Types.ObjectId.isValid(id))
                    .map(id => String(id))
            )
        ];
        const categoryMap = categoryIds.length
            ? new Map(
                (await Category.find({ _id: { $in: categoryIds } })
                    .select('name slug')
                    .lean()
                ).map(c => [String(c._id), c])
            )
            : new Map();

        const cards = products.map(p => {
            const hasShades = p.shadeOptions && p.shadeOptions.length > 0;
            return {
                _id: p._id,
                name: p.name,
                variant: p.variant,
                price: p.price,
                brand: p.brand,
                category: mongoose.Types.ObjectId.isValid(p.category)
                    ? categoryMap.get(String(p.category)) || null
                    : null,
                summary: p.summary || p.description?.slice(0, 100) || '',
                status: p.status,
                image: p.images?.length > 0
                    ? (p.images[0].startsWith('http') ? p.images[0] : `${process.env.BASE_URL}/${p.images[0]}`)
                    : null,
                colorOptions: p.colorOptions || [],
                commentsCount: p.commentsCount || 0,
                avgRating: p.avgRating || 0,
                ...(hasShades && {
                    shades: p.shadeOptions.slice(0, 3),
                    moreShadesCount: Math.max(0, p.shadeOptions.length - 3)
                })
            };
        });

        // ✅ Breadcrumb
        const ancestorIds = (category.ancestors || [])
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));

        const ancestors = ancestorIds.length
            ? await Category.find({ _id: { $in: ancestorIds } })
                .sort({ createdAt: 1 })
                .select('name slug')
            : [];

        res.status(200).json({
            category,
            breadcrumb: ancestors,
            products: cards,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasMore: page < Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('getProductsByCategory error:', err);
        res.status(500).json({ message: err.message });
    }
};
