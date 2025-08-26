import Product from '../../models/Product.js';
import User from '../../models/User.js';
import Review from '../../models/Review.js';
import Order from '../../models/Order.js';
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
        let trackedCategoryId = null;

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
                trackedCategoryId = catDoc._id; // 👈 save for tracking

                const ids = await getDescendantCategoryIds(catDoc._id);
                const validIds = ids
                    .filter(id => mongoose.Types.ObjectId.isValid(id))
                    .map(id => new mongoose.Types.ObjectId(id));

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

        const products = await Product.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(perPage)
            .lean();

        // ✅ Track browsing history ONLY if user is logged in
        if (req.user && req.user.id && trackedCategoryId) {
            await User.findByIdAndUpdate(req.user.id, {
                $push: {
                    recentCategories: { $each: [trackedCategoryId], $position: 0, $slice: 20 }
                }
            });
        }

        // ✅ Category mapping for product cards
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

        const cards = products.map(p => ({
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
            shadeOptions: p.shadeOptions || [],
            commentsCount: p.commentsCount || 0,
            avgRating: p.avgRating || 0
        }));

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
        const product = await Product.findByIdAndUpdate(
            req.params.id,
            { $inc: { views: 1 } }, // increase product views
            { new: true, lean: true }
        );

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        if (req.user && req.user.id) {
            const categoryValue = mongoose.Types.ObjectId.isValid(product.category)
                ? product.category   // store ObjectId if valid
                : product.category?.slug || product.category?.toString(); // else store slug/string

            await User.findByIdAndUpdate(req.user.id, {
                $pull: {
                    recentProducts: product._id,
                    recentCategories: categoryValue
                }
            });

            await User.findByIdAndUpdate(req.user.id, {
                $push: {
                    recentProducts: { $each: [product._id], $position: 0, $slice: 20 },
                    recentCategories: { $each: [categoryValue], $position: 0, $slice: 20 }
                }
            });
        }


        // ✅ Category details
        let categoryObj = null;
        if (mongoose.Types.ObjectId.isValid(product.category)) {
            categoryObj = await Category.findById(product.category)
                .select("name slug")
                .lean();
        }

        // ✅ Reviews summary
        const allActiveReviews = await Review.find({
            productId: product._id,
            status: "Active",
        }).select("rating");

        const totalRating = allActiveReviews.reduce((sum, r) => sum + r.rating, 0);
        const avgRating = allActiveReviews.length
            ? parseFloat((totalRating / allActiveReviews.length).toFixed(1))
            : 0;

        res.status(200).json({
            _id: product._id,
            name: product.name,
            brand: product.brand,
            variant: product.variant,
            description: product.description || "",
            price: product.price,
            mrp: product.mrp,
            discountPercent: product.mrp
                ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
                : 0,
            images: product.images || [],
            category: categoryObj,
            shadeOptions: product.shadeOptions || [],
            colorOptions: product.colorOptions || [],
            avgRating,
            totalRatings: allActiveReviews.length,
            inStock: product.inStock ?? true,
        });
    } catch (err) {
        console.error("❌ getSingleProduct error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
};


export const getProductsByCategory = async (req, res) => {
    try {
        const slug = req.params.slug.toLowerCase();
        let { page = 1, limit = 12, sort = "recent" } = req.query;
        page = Number(page);
        limit = Number(limit);

        // ✅ Find category (by ID or slug)
        let category = null;
        if (mongoose.Types.ObjectId.isValid(slug)) {
            category = await Category.findById(slug)
                .select("name slug bannerImage thumbnailImage ancestors")
                .lean();
        } else {
            category = await Category.findOne({ slug })
                .select("name slug bannerImage thumbnailImage ancestors")
                .lean();
        }

        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }

        if (req.user && req.user.id) {
            const categoryValue = mongoose.Types.ObjectId.isValid(category._id)
                ? category._id
                : category.slug;

            await User.findByIdAndUpdate(req.user.id, {
                $pull: { recentCategories: categoryValue }
            });

            await User.findByIdAndUpdate(req.user.id, {
                $push: {
                    recentCategories: { $each: [categoryValue], $position: 0, $slice: 20 }
                }
            });
        }

        // ✅ Get descendants
        const ids = (await getDescendantCategoryIds(category._id))
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));

        ids.push(category._id);

        const filter = {
            $or: [{ categories: { $in: ids } }, { category: { $in: ids } }]
        };

        const total = await Product.countDocuments(filter);
        const products = await Product.find(filter)
            .sort(sort === "recent" ? { createdAt: -1 } : { price: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        // ✅ Build category map
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
                (
                    await Category.find({ _id: { $in: categoryIds } })
                        .select("name slug")
                        .lean()
                ).map(c => [String(c._id), c])
            )
            : new Map();

        const cards = products.map(p => ({
            _id: p._id,
            name: p.name,
            variant: p.variant,
            price: p.price,
            brand: p.brand,
            category: mongoose.Types.ObjectId.isValid(p.category)
                ? categoryMap.get(String(p.category)) || null
                : null,
            summary: p.summary || p.description?.slice(0, 100) || "",
            status: p.status,
            image:
                p.images?.length > 0
                    ? p.images[0].startsWith("http")
                        ? p.images[0]
                        : `${process.env.BASE_URL}/${p.images[0]}`
                    : null,
            colorOptions: p.colorOptions || [],
            shadeOptions: p.shadeOptions || [],
            commentsCount: p.commentsCount || 0,
            avgRating: p.avgRating || 0
        }));

        // ✅ Breadcrumb (ancestors)
        const ancestorIds = (category.ancestors || [])
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));

        const ancestors = ancestorIds.length
            ? await Category.find({ _id: { $in: ancestorIds } })
                .sort({ createdAt: 1 })
                .select("name slug")
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
        console.error("getProductsByCategory error:", err);
        res.status(500).json({ message: err.message });
    }
};



// 🔥 Top Selling Products (only name + image)
export const getTopSellingProducts = async (req, res) => {
    try {
        const topProducts = await Product.find()
            .sort({ sales: -1 }) // highest sales first
            .limit(10) // show 10
            .select("name image images"); // ✅ only keep name & images

        res.status(200).json({
            success: true,
            products: topProducts.map(p => ({
                _id: p._id, // for redirect to product details
                name: p.name,
                image: p.image || (p.images?.[0] || null),
            }))
        });
    } catch (error) {
        console.error("🔥 Failed to fetch top sellers:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch top selling products",
            error: error.message
        });
    }
};

// 🔥 Product Details + Related Products
export const getProductWithRelated = async (req, res) => {
    try {
        const product = await Product.findByIdAndUpdate(
            req.params.id,
            { $inc: { views: 1 } }, // track view
            { new: true, lean: true }
        );

        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        // Category details
        let categoryObj = null;
        if (mongoose.Types.ObjectId.isValid(product.category)) {
            categoryObj = await Category.findById(product.category)
                .select("name slug")
                .lean();
        }

        // Reviews for main product
        const allActiveReviews = await Review.find({
            productId: product._id,
            status: "Active"
        }).select("rating");

        const totalRating = allActiveReviews.reduce((sum, r) => sum + r.rating, 0);
        const avgRating = allActiveReviews.length
            ? parseFloat((totalRating / allActiveReviews.length).toFixed(1))
            : 0;

        // ✅ Main product response (SAME as getSingleProduct)
        const mainProduct = {
            _id: product._id,
            name: product.name,
            brand: product.brand,
            variant: product.variant,
            description: product.description || "",
            price: product.price,
            mrp: product.mrp,
            discountPercent: product.mrp
                ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
                : 0,
            images: product.images || [],
            category: categoryObj,
            shadeOptions: product.shadeOptions || [],
            colorOptions: product.colorOptions || [],
            avgRating,
            totalRatings: allActiveReviews.length,
            inStock: product.inStock ?? true
        };

        // ✅ Related Products (SAME structure as getSingleProduct)
        const relatedDocs = await Product.find({
            _id: { $ne: product._id },
            $or: [
                { category: product.category },
                { productTags: { $in: product.productTags } }
            ]
        })
            .limit(6)
            .lean();

        // Fetch category + reviews for related
        const related = await Promise.all(
            relatedDocs.map(async (p) => {
                let cat = null;
                if (mongoose.Types.ObjectId.isValid(p.category)) {
                    cat = await Category.findById(p.category)
                        .select("name slug")
                        .lean();
                }

                const reviews = await Review.find({
                    productId: p._id,
                    status: "Active"
                }).select("rating");

                const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
                const avgRating = reviews.length
                    ? parseFloat((totalRating / reviews.length).toFixed(1))
                    : 0;

                return {
                    _id: p._id,
                    name: p.name,
                    brand: p.brand,
                    variant: p.variant,
                    description: p.description || "",
                    price: p.price,
                    mrp: p.mrp,
                    discountPercent: p.mrp
                        ? Math.round(((p.mrp - p.price) / p.mrp) * 100)
                        : 0,
                    images: p.images || [],
                    category: cat,
                    shadeOptions: p.shadeOptions || [],
                    colorOptions: p.colorOptions || [],
                    avgRating,
                    totalRatings: reviews.length,
                    inStock: p.inStock ?? true
                };
            })
        );

        res.status(200).json({
            success: true,
            product: mainProduct,
            related
        });
    } catch (error) {
        console.error("🔥 Failed to fetch product:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch product",
            error: error.message
        });
    }
};

// 🔥 Top Categories (most popular categories – based on product count)
export const getTopCategories = async (req, res) => {
    try {
        const BASE_SLUGS = ['lipcare', 'eyecare', 'facecare', 'fragrance'];

        // 1️⃣ Get base categories
        const baseCategories = await Category.find({ slug: { $in: BASE_SLUGS } })
            .select('name slug thumbnailImage')
            .lean();

        // 2️⃣ Aggregate orders to get top-selling categories
        const topFromOrders = await Order.aggregate([
            { $unwind: "$items" },
            {
                $lookup: {
                    from: "products",
                    localField: "items.productId",
                    foreignField: "_id",
                    as: "product"
                }
            },
            { $unwind: "$product" },
            {
                $group: {
                    _id: "$product.category",
                    totalOrders: { $sum: "$items.qty" }
                }
            },
            { $sort: { totalOrders: -1 } },
            { $limit: 10 } // get more than needed in case some are duplicates
        ]);

        const orderedCategoryIds = topFromOrders.map(o => o._id);

        // 3️⃣ Get category docs for ordered categories
        const orderedCategories = await Category.find({ _id: { $in: orderedCategoryIds } })
            .select("name slug thumbnailImage")
            .lean();

        // 4️⃣ Merge base + dynamic categories (avoid duplicate slugs)
        const mergedMap = new Map();

        baseCategories.forEach(c => {
            mergedMap.set(c.slug, {
                _id: c._id,
                name: c.name,
                slug: c.slug,
                image: c.thumbnailImage || null,
                _sortValue: 0
            });
        });

        orderedCategories.forEach(c => {
            const totalOrders = topFromOrders.find(o => String(o._id) === String(c._id))?.totalOrders || 0;
            mergedMap.set(c.slug, {
                _id: c._id,
                name: c.name,
                slug: c.slug,
                image: c.thumbnailImage || null,
                _sortValue: totalOrders
            });
        });

        // 5️⃣ Sort by totalOrders and limit to top 6
        const result = Array.from(mergedMap.values())
            .sort((a, b) => b._sortValue - a._sortValue)
            .slice(0, 6)
            .map(({ _sortValue, ...rest }) => rest); // remove _sortValue from final result

        res.status(200).json({
            success: true,
            categories: result
        });

    } catch (err) {
        console.error("🔥 Failed to fetch top categories:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch top categories",
            error: err.message
        });
    }
};
