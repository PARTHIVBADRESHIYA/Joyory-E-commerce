import Product from '../../models/Product.js';
import Review from '../../models/Review.js';
import User from '../../models/User.js';


export const getAllFilteredProducts = async (req, res) => {
    try {
        const {
            priceMin,
            priceMax,
            brand,
            category,
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
        if (category) filter.category = category;
        if (color) filter.colorOptions = { $in: [color] };
        if (shade) filter.shadeOptions = { $in: [shade] };

        if (priceMin || priceMax) {
            filter.price = {};
            if (priceMin) filter.price.$gte = Number(priceMin);
            if (priceMax) filter.price.$lte = Number(priceMax);
        }

        // Add all tag filters using $all
        const tagFilters = [
            skinType, formulation, makeupFinish, benefits, concern,
            skinTone, gender, age, conscious, preference, ingredients, discount
        ].filter(Boolean);

        if (tagFilters.length > 0) {
            filter.productTags = { $all: tagFilters };
        }

        // Pagination setup
        const currentPage = Number(page);
        const perPage = Number(limit);
        const skip = (currentPage - 1) * perPage;

        const total = await Product.countDocuments(filter);
        const products = await Product.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(perPage);

        const cards = products.map(p => {
            const hasShades = p.shadeOptions && p.shadeOptions.length > 0;

            return {
                _id: p._id,
                name: p.name,
                variant: p.variant,
                price: p.price,
                brand: p.brand,
                category: p.category,
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


export const getSingleProduct = async (req, res) => {
    try {
        const {
            sort = 'recent',
            withPhotos = false,
            ratingFilter,
            page = 1,
            limit = 5 // Reviews per page
        } = req.query;

        // ✅ Increment views
        const product = await Product.findByIdAndUpdate(
            req.params.id,
            { $inc: { views: 1 } },
            { new: true }
        );

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // ✅ Filter for main reviews
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

        // ✅ Paginated reviews
        const reviews = await Review.find(reviewFilter)
            .populate('customer', 'name')
            .sort(sortBy)
            .skip(skip)
            .limit(perPage);

        const totalReviews = await Review.countDocuments(reviewFilter);

        // ✅ Average Rating
        const allActiveReviews = await Review.find({
            productId: product._id,
            status: 'Active'
        });
        const totalRating = allActiveReviews.reduce((sum, r) => sum + r.rating, 0);
        const avgRating = allActiveReviews.length
            ? parseFloat((totalRating / allActiveReviews.length).toFixed(1))
            : 0;

        // ✅ Ratings Breakdown
        const ratingsBreakdown = {
            Excellent: allActiveReviews.filter(r => r.rating === 5).length,
            VeryGood: allActiveReviews.filter(r => r.rating === 4).length,
            Average: allActiveReviews.filter(r => r.rating === 3).length,
            Good: allActiveReviews.filter(r => r.rating === 2).length,
            Poor: allActiveReviews.filter(r => r.rating === 1).length
        };

        // ⭐ Top 3 featured reviews (not paginated, separate)
        const featuredReviews = await Review.find({
            productId: product._id,
            status: 'Active',
            featured: true
        })
            .populate('customer', 'name')
            .sort({ helpfulVotes: -1, createdAt: -1 })
            .limit(3);

        const {
            _id, name, variant, price, quantity, status,
            brand, category, summary, description, features,
            howToUse, shadeOptions, colorOptions, productTags,
            images, commentsCount, views, createdAt
        } = product;

        res.status(200).json({
            _id,
            name,
            variant,
            price,
            quantity,
            status,
            brand,
            category,
            summary,
            description,
            features,
            howToUse,
            shadeOptions,
            colorOptions,
            productTags,
            images,
            avgRating,
            commentsCount: allActiveReviews.length,
            ratingsBreakdown,
            views,
            createdAt,
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


