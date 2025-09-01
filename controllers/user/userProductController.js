// import Product from '../../models/Product.js';
// import User from '../../models/User.js';
// import Review from '../../models/Review.js';
// import Order from '../../models/Order.js';
// import Category from '../../models/Category.js';
// import { getDescendantCategoryIds } from '../../middlewares/utils/categoryUtils.js';
// import mongoose from 'mongoose';


// const buildOptions = (product) => {
//     if (!product) return { shadeOptions: [], colorOptions: [] };

//     // ✅ Case 1: Foundation products with variants
//     if (product.foundationVariants && product.foundationVariants.length > 0) {
//         const shadeOptions = product.foundationVariants.map(v => v.shadeName).filter(Boolean);
//         const colorOptions = product.foundationVariants.map(v => v.hex).filter(Boolean);

//         return { shadeOptions, colorOptions };
//     }

//     // ✅ Case 2: Other categories (eye, lips etc) → use old fields
//     return {
//         shadeOptions: product.shadeOptions || [],
//         colorOptions: product.colorOptions || []
//     };
// };


// /**
//  * GET /products (Filtered list)
//  */
// export const getAllFilteredProducts = async (req, res) => {
//     try {
//         const {
//             priceMin,
//             priceMax,
//             brand,
//             category, // can be slug or ObjectId
//             discount,
//             preference,
//             ingredients,
//             benefits,
//             concern,
//             skinType,
//             makeupFinish,
//             formulation,
//             color,
//             skinTone,
//             gender,
//             age,
//             conscious,
//             shade,
//             page = 1,
//             limit = 12
//         } = req.query;

//         const filter = {};
//         let trackedCategoryId = null;

//         if (brand) filter.brand = brand;

//         // ✅ Category filter — only if provided and valid
//         if (category && category.trim() !== '') {
//             let catDoc = null;

//             if (mongoose.Types.ObjectId.isValid(category)) {
//                 catDoc = await Category.findById(category).lean();
//             } else {
//                 catDoc = await Category.findOne({ slug: category.toLowerCase() }).lean();
//             }

//             if (catDoc?._id) {
//                 trackedCategoryId = catDoc._id; // 👈 save for tracking

//                 const ids = await getDescendantCategoryIds(catDoc._id);
//                 const validIds = ids
//                     .filter(id => mongoose.Types.ObjectId.isValid(id))
//                     .map(id => new mongoose.Types.ObjectId(id));

//                 if (validIds.length) {
//                     filter.$or = [
//                         { categories: { $in: validIds } },
//                         { category: { $in: validIds } }
//                     ];
//                 }
//             }
//         }

//         if (color) filter.colorOptions = { $in: [color] };
//         if (shade) filter.shadeOptions = { $in: [shade] };

//         if (priceMin || priceMax) {
//             filter.price = {};
//             if (priceMin) filter.price.$gte = Number(priceMin);
//             if (priceMax) filter.price.$lte = Number(priceMax);
//         }

//         const tagFilters = [
//             skinType, formulation, makeupFinish, benefits, concern,
//             skinTone, gender, age, conscious, preference, ingredients, discount
//         ].filter(Boolean);

//         if (tagFilters.length > 0) {
//             filter.productTags = { $all: tagFilters };
//         }

//         const currentPage = Number(page);
//         const perPage = Number(limit);
//         const skip = (currentPage - 1) * perPage;

//         const total = await Product.countDocuments(filter);

//         const products = await Product.find(filter)
//             .sort({ createdAt: -1 })
//             .skip(skip)
//             .limit(perPage)
//             .lean();

//         // ✅ Track browsing history ONLY if user is logged in
//         if (req.user && req.user.id && trackedCategoryId) {
//             await User.findByIdAndUpdate(req.user.id, {
//                 $push: {
//                     recentCategories: { $each: [trackedCategoryId], $position: 0, $slice: 20 }
//                 }
//             });
//         }

//         // ✅ Category mapping for product cards
//         const categoryIds = [
//             ...new Set(
//                 products
//                     .map(p => p.category)
//                     .filter(id => mongoose.Types.ObjectId.isValid(id))
//                     .map(id => String(id))
//             )
//         ];

//         const categoryMap = categoryIds.length
//             ? new Map(
//                 (await Category.find({ _id: { $in: categoryIds } })
//                     .select('name slug')
//                     .lean()
//                 ).map(c => [String(c._id), c])
//             )
//             : new Map();

//         const cards = products.map(p => ({
//             _id: p._id,
//             name: p.name,
//             variant: p.variant,
//             price: p.price,
//             brand: p.brand,
//             category: mongoose.Types.ObjectId.isValid(p.category)
//                 ? categoryMap.get(String(p.category)) || null
//                 : null,
//             summary: p.summary || p.description?.slice(0, 100) || '',
//             status: p.status,
//             image: p.images?.length > 0
//                 ? (p.images[0].startsWith('http') ? p.images[0] : `${process.env.BASE_URL}/${p.images[0]}`)
//                 : null,
//             colorOptions: p.colorOptions || [],
//             shadeOptions: p.shadeOptions || [],
//             commentsCount: p.commentsCount || 0,
//             avgRating: p.avgRating || 0
//         }));

//         const totalPages = Math.ceil(total / perPage);

//         res.status(200).json({
//             products: cards,
//             total,
//             currentPage,
//             totalPages,
//             hasMore: currentPage < totalPages,
//             nextPage: currentPage < totalPages ? currentPage + 1 : null,
//             prevPage: currentPage > 1 ? currentPage - 1 : null
//         });

//     } catch (err) {
//         console.error('❌ Filter error:', err);
//         res.status(500).json({ message: 'Server error', error: err.message });
//     }
// };

// export const getSingleProduct = async (req, res) => {
//     try {
//         const product = await Product.findByIdAndUpdate(
//             req.params.id,
//             { $inc: { views: 1 } }, // increase product views
//             { new: true, lean: true }
//         );

//         if (!product) {
//             return res.status(404).json({ message: 'Product not found' });
//         }

//         if (req.user && req.user.id) {
//             const categoryValue = mongoose.Types.ObjectId.isValid(product.category)
//                 ? product.category   // store ObjectId if valid
//                 : product.category?.slug || product.category?.toString(); // else store slug/string

//             await User.findByIdAndUpdate(req.user.id, {
//                 $pull: {
//                     recentProducts: product._id,
//                     recentCategories: categoryValue
//                 }
//             });

//             await User.findByIdAndUpdate(req.user.id, {
//                 $push: {
//                     recentProducts: { $each: [product._id], $position: 0, $slice: 20 },
//                     recentCategories: { $each: [categoryValue], $position: 0, $slice: 20 }
//                 }
//             });
//         }


//         // ✅ Category details
//         let categoryObj = null;
//         if (mongoose.Types.ObjectId.isValid(product.category)) {
//             categoryObj = await Category.findById(product.category)
//                 .select("name slug")
//                 .lean();
//         }

//         // ✅ Reviews summary
//         const allActiveReviews = await Review.find({
//             productId: product._id,
//             status: "Active",
//         }).select("rating");

//         const totalRating = allActiveReviews.reduce((sum, r) => sum + r.rating, 0);
//         const avgRating = allActiveReviews.length
//             ? parseFloat((totalRating / allActiveReviews.length).toFixed(1))
//             : 0;

//         res.status(200).json({
//             _id: product._id,
//             name: product.name,
//             brand: product.brand,
//             variant: product.variant,
//             description: product.description || "",
//             price: product.price,
//             mrp: product.mrp,
//             discountPercent: product.mrp
//                 ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
//                 : 0,
//             images: product.images || [],
//             category: categoryObj,
//             shadeOptions: product.shadeOptions || [],
//             colorOptions: product.colorOptions || [],
//             avgRating,
//             totalRatings: allActiveReviews.length,
//             inStock: product.inStock ?? true,
//         });
//     } catch (err) {
//         console.error("❌ getSingleProduct error:", err);
//         res.status(500).json({ message: "Server error", error: err.message });
//     }
// };


// export const getProductsByCategory = async (req, res) => {
//     try {
//         const slug = req.params.slug.toLowerCase();
//         let { page = 1, limit = 12, sort = "recent" } = req.query;
//         page = Number(page);
//         limit = Number(limit);

//         // ✅ Find category (by ID or slug)
//         let category = null;
//         if (mongoose.Types.ObjectId.isValid(slug)) {
//             category = await Category.findById(slug)
//                 .select("name slug bannerImage thumbnailImage ancestors")
//                 .lean();
//         } else {
//             category = await Category.findOne({ slug })
//                 .select("name slug bannerImage thumbnailImage ancestors")
//                 .lean();
//         }

//         if (!category) {
//             return res.status(404).json({ message: "Category not found" });
//         }

//         if (req.user && req.user.id) {
//             const categoryValue = mongoose.Types.ObjectId.isValid(category._id)
//                 ? category._id
//                 : category.slug;

//             await User.findByIdAndUpdate(req.user.id, {
//                 $pull: { recentCategories: categoryValue }
//             });

//             await User.findByIdAndUpdate(req.user.id, {
//                 $push: {
//                     recentCategories: { $each: [categoryValue], $position: 0, $slice: 20 }
//                 }
//             });
//         }

//         // ✅ Get descendants
//         const ids = (await getDescendantCategoryIds(category._id))
//             .filter(id => mongoose.Types.ObjectId.isValid(id))
//             .map(id => new mongoose.Types.ObjectId(id));

//         ids.push(category._id);

//         const filter = {
//             $or: [{ categories: { $in: ids } }, { category: { $in: ids } }]
//         };

//         const total = await Product.countDocuments(filter);
//         const products = await Product.find(filter)
//             .sort(sort === "recent" ? { createdAt: -1 } : { price: 1 })
//             .skip((page - 1) * limit)
//             .limit(limit)
//             .lean();

//         // ✅ Build category map
//         const categoryIds = [
//             ...new Set(
//                 products
//                     .map(p => p.category)
//                     .filter(id => mongoose.Types.ObjectId.isValid(id))
//                     .map(id => String(id))
//             )
//         ];
//         const categoryMap = categoryIds.length
//             ? new Map(
//                 (
//                     await Category.find({ _id: { $in: categoryIds } })
//                         .select("name slug")
//                         .lean()
//                 ).map(c => [String(c._id), c])
//             )
//             : new Map();

//         const cards = products.map(p => ({
//             _id: p._id,
//             name: p.name,
//             variant: p.variant,
//             price: p.price,
//             brand: p.brand,
//             category: mongoose.Types.ObjectId.isValid(p.category)
//                 ? categoryMap.get(String(p.category)) || null
//                 : null,
//             summary: p.summary || p.description?.slice(0, 100) || "",
//             status: p.status,
//             image:
//                 p.images?.length > 0
//                     ? p.images[0].startsWith("http")
//                         ? p.images[0]
//                         : `${process.env.BASE_URL}/${p.images[0]}`
//                     : null,
//             colorOptions: p.colorOptions || [],
//             shadeOptions: p.shadeOptions || [],
//             commentsCount: p.commentsCount || 0,
//             avgRating: p.avgRating || 0
//         }));

//         // ✅ Breadcrumb (ancestors)
//         const ancestorIds = (category.ancestors || [])
//             .filter(id => mongoose.Types.ObjectId.isValid(id))
//             .map(id => new mongoose.Types.ObjectId(id));

//         const ancestors = ancestorIds.length
//             ? await Category.find({ _id: { $in: ancestorIds } })
//                 .sort({ createdAt: 1 })
//                 .select("name slug")
//             : [];

//         res.status(200).json({
//             category,
//             breadcrumb: ancestors,
//             products: cards,
//             pagination: {
//                 total,
//                 page,
//                 limit,
//                 totalPages: Math.ceil(total / limit),
//                 hasMore: page < Math.ceil(total / limit)
//             }
//         });
//     } catch (err) {
//         console.error("getProductsByCategory error:", err);
//         res.status(500).json({ message: err.message });
//     }
// };



// // 🔥 Top Selling Products (only name + image)
// export const getTopSellingProducts = async (req, res) => {
//     try {
//         const topProducts = await Product.find()
//             .sort({ sales: -1 }) // highest sales first
//             .limit(10) // show 10
//             .select("name image images"); // ✅ only keep name & images

//         res.status(200).json({
//             success: true,
//             products: topProducts.map(p => ({
//                 _id: p._id, // for redirect to product details
//                 name: p.name,
//                 image: p.image || (p.images?.[0] || null),
//             }))
//         });
//     } catch (error) {
//         console.error("🔥 Failed to fetch top sellers:", error);
//         res.status(500).json({
//             success: false,
//             message: "Failed to fetch top selling products",
//             error: error.message
//         });
//     }
// };

// // 🔥 Product Details + Related Products
// export const getProductWithRelated = async (req, res) => {
//     try {
//         const product = await Product.findByIdAndUpdate(
//             req.params.id,
//             { $inc: { views: 1 } }, // track view
//             { new: true, lean: true }
//         );

//         if (!product) {
//             return res.status(404).json({ success: false, message: "Product not found" });
//         }

//         // Category details
//         let categoryObj = null;
//         if (mongoose.Types.ObjectId.isValid(product.category)) {
//             categoryObj = await Category.findById(product.category)
//                 .select("name slug")
//                 .lean();
//         }

//         // Reviews for main product
//         const allActiveReviews = await Review.find({
//             productId: product._id,
//             status: "Active"
//         }).select("rating");

//         const totalRating = allActiveReviews.reduce((sum, r) => sum + r.rating, 0);
//         const avgRating = allActiveReviews.length
//             ? parseFloat((totalRating / allActiveReviews.length).toFixed(1))
//             : 0;

//         // ✅ Main product response (SAME as getSingleProduct)
//         const mainProduct = {
//             _id: product._id,
//             name: product.name,
//             brand: product.brand,
//             variant: product.variant,
//             description: product.description || "",
//             price: product.price,
//             mrp: product.mrp,
//             discountPercent: product.mrp
//                 ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
//                 : 0,
//             images: product.images || [],
//             category: categoryObj,
//             shadeOptions: product.shadeOptions || [],
//             colorOptions: product.colorOptions || [],
//             avgRating,
//             totalRatings: allActiveReviews.length,
//             inStock: product.inStock ?? true
//         };

//         // ✅ Related Products (SAME structure as getSingleProduct)
//         const relatedDocs = await Product.find({
//             _id: { $ne: product._id },
//             $or: [
//                 { category: product.category },
//                 { productTags: { $in: product.productTags } }
//             ]
//         })
//             .limit(6)
//             .lean();

//         // Fetch category + reviews for related
//         const related = await Promise.all(
//             relatedDocs.map(async (p) => {
//                 let cat = null;
//                 if (mongoose.Types.ObjectId.isValid(p.category)) {
//                     cat = await Category.findById(p.category)
//                         .select("name slug")
//                         .lean();
//                 }

//                 const reviews = await Review.find({
//                     productId: p._id,
//                     status: "Active"
//                 }).select("rating");

//                 const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
//                 const avgRating = reviews.length
//                     ? parseFloat((totalRating / reviews.length).toFixed(1))
//                     : 0;

//                 return {
//                     _id: p._id,
//                     name: p.name,
//                     brand: p.brand,
//                     variant: p.variant,
//                     description: p.description || "",
//                     price: p.price,
//                     mrp: p.mrp,
//                     discountPercent: p.mrp
//                         ? Math.round(((p.mrp - p.price) / p.mrp) * 100)
//                         : 0,
//                     images: p.images || [],
//                     category: cat,
//                     shadeOptions: p.shadeOptions || [],
//                     colorOptions: p.colorOptions || [],
//                     avgRating,
//                     totalRatings: reviews.length,
//                     inStock: p.inStock ?? true
//                 };
//             })
//         );

//         res.status(200).json({
//             success: true,
//             product: mainProduct,
//             related
//         });
//     } catch (error) {
//         console.error("🔥 Failed to fetch product:", error);
//         res.status(500).json({
//             success: false,
//             message: "Failed to fetch product",
//             error: error.message
//         });
//     }
// };

// // 🔥 Top Categories (most popular categories – based on product count)
// export const getTopCategories = async (req, res) => {
//     try {
//         const BASE_SLUGS = ['lipcare', 'eyecare', 'facecare', 'fragrance'];

//         // 1️⃣ Get base categories
//         const baseCategories = await Category.find({ slug: { $in: BASE_SLUGS } })
//             .select('name slug thumbnailImage')
//             .lean();

//         // 2️⃣ Aggregate orders to get top-selling categories
//         const topFromOrders = await Order.aggregate([
//             { $unwind: "$items" },
//             {
//                 $lookup: {
//                     from: "products",
//                     localField: "items.productId",
//                     foreignField: "_id",
//                     as: "product"
//                 }
//             },
//             { $unwind: "$product" },
//             {
//                 $group: {
//                     _id: "$product.category",
//                     totalOrders: { $sum: "$items.qty" }
//                 }
//             },
//             { $sort: { totalOrders: -1 } },
//             { $limit: 10 } // get more than needed in case some are duplicates
//         ]);

//         const orderedCategoryIds = topFromOrders.map(o => o._id);

//         // 3️⃣ Get category docs for ordered categories
//         const orderedCategories = await Category.find({ _id: { $in: orderedCategoryIds } })
//             .select("name slug thumbnailImage")
//             .lean();

//         // 4️⃣ Merge base + dynamic categories (avoid duplicate slugs)
//         const mergedMap = new Map();

//         baseCategories.forEach(c => {
//             mergedMap.set(c.slug, {
//                 _id: c._id,
//                 name: c.name,
//                 slug: c.slug,
//                 image: c.thumbnailImage || null,
//                 _sortValue: 0
//             });
//         });

//         orderedCategories.forEach(c => {
//             const totalOrders = topFromOrders.find(o => String(o._id) === String(c._id))?.totalOrders || 0;
//             mergedMap.set(c.slug, {
//                 _id: c._id,
//                 name: c.name,
//                 slug: c.slug,
//                 image: c.thumbnailImage || null,
//                 _sortValue: totalOrders
//             });
//         });

//         // 5️⃣ Sort by totalOrders and limit to top 6
//         const result = Array.from(mergedMap.values())
//             .sort((a, b) => b._sortValue - a._sortValue)
//             .slice(0, 6)
//             .map(({ _sortValue, ...rest }) => rest); // remove _sortValue from final result

//         res.status(200).json({
//             success: true,
//             categories: result
//         });

//     } catch (err) {
//         console.error("🔥 Failed to fetch top categories:", err);
//         res.status(500).json({
//             success: false,
//             message: "Failed to fetch top categories",
//             error: err.message
//         });
//     }
// };







import Product from '../../models/Product.js';
import User from '../../models/User.js';
import Review from '../../models/Review.js';
import Order from '../../models/Order.js';
import SkinType from '../../models/SkinType.js';
import Category from '../../models/Category.js';
import { getDescendantCategoryIds ,getCategoryFallbackChain} from '../../middlewares/utils/categoryUtils.js';
import {getRecommendedProducts } from '../../middlewares/utils/recommendationService.js';
import mongoose from 'mongoose';

// 🔧 Centralized helper for shades/colors
export const buildOptions = (product) => {
    if (!product) return { shadeOptions: [], colorOptions: [] };

    // ✅ Foundation products with variants
    if (product.foundationVariants && product.foundationVariants.length > 0) {
        const shadeOptions = product.foundationVariants.map(v => v.shadeName).filter(Boolean);
        const colorOptions = product.foundationVariants.map(v => v.hex).filter(Boolean);
        return { shadeOptions, colorOptions };
    }

    // ✅ Other categories
    return {
        shadeOptions: product.shadeOptions || [],
        colorOptions: product.colorOptions || []
    };
};

// 🔧 Helper: normalize image URLs
export const normalizeImages = (images = []) => {
    return images.map(img =>
        img.startsWith('http') ? img : `${process.env.BASE_URL}/${img}`
    );
};

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

        // ✅ Brand filter
        if (brand) filter.brand = brand;

        // ✅ Category filter (slug or ObjectId, including descendants)
        if (category && category.trim() !== '') {
            let catDoc = null;
            if (mongoose.Types.ObjectId.isValid(category)) {
                catDoc = await Category.findById(category).lean();
            } else {
                catDoc = await Category.findOne({ slug: category.toLowerCase() }).lean();
            }

            if (catDoc?._id) {
                trackedCategoryId = catDoc._id;
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

        // ✅ Shade & Color filter (support both legacy + foundationVariants)
        if (color) {
            filter.$or = [
                ...(filter.$or || []),
                { colorOptions: { $in: [color] } },
                { "foundationVariants.hex": { $in: [color] } }
            ];
        }
        if (shade) {
            filter.$or = [
                ...(filter.$or || []),
                { shadeOptions: { $in: [shade] } },
                { "foundationVariants.shadeName": { $in: [shade] } }
            ];
        }

        // ✅ Price filter
        if (priceMin || priceMax) {
            filter.price = {};
            if (priceMin) filter.price.$gte = Number(priceMin);
            if (priceMax) filter.price.$lte = Number(priceMax);
        }

        // ✅ Tag filters (match all requested tags)
        const tagFilters = [
            skinType, formulation, makeupFinish, benefits, concern,
            skinTone, gender, age, conscious, preference, ingredients, discount
        ].filter(Boolean);

        if (tagFilters.length > 0) {
            filter.productTags = { $all: tagFilters };
        }

        // Pagination
        const currentPage = Number(page);
        const perPage = Number(limit);
        const skip = (currentPage - 1) * perPage;

        const total = await Product.countDocuments(filter);

        // ✅ Always fetch foundationVariants for normalization
        const products = await Product.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(perPage)
            .select("name variant price brand category summary description status images commentsCount avgRating foundationVariants shadeOptions colorOptions")
            .lean();

        // ✅ Track browsing history
        if (req.user && req.user.id && trackedCategoryId) {
            await User.findByIdAndUpdate(req.user.id, {
                $push: {
                    recentCategories: { $each: [trackedCategoryId], $position: 0, $slice: 20 }
                }
            });
        }

        // ✅ Resolve categories for product cards
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

        // ✅ Normalize products into card format
        const cards = products.map(p => {
            const { shadeOptions, colorOptions } = buildOptions(p);

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
                image: p.images?.length > 0 ? normalizeImages([p.images[0]])[0] : null,
                shadeOptions, // ✅ from foundationVariants or legacy
                colorOptions, // ✅ from foundationVariants or legacy
                commentsCount: p.commentsCount || 0,
                avgRating: p.avgRating || 0
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
 * GET /products/:id
 */
export const getSingleProduct = async (req, res) => {
    try {
        const product = await Product.findByIdAndUpdate(
            req.params.id,
            { $inc: { views: 1 } },
            { new: true, lean: true }
        );

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // ✅ Track user history
        if (req.user && req.user.id) {
            const categoryValue = mongoose.Types.ObjectId.isValid(product.category)
                ? product.category
                : product.category?.slug || product.category?.toString();

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

        const { shadeOptions, colorOptions } = buildOptions(product);

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
            images: normalizeImages(product.images || []),
            category: categoryObj,
            shadeOptions,
            colorOptions,
            foundationVariants: product.foundationVariants || [],
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

        page = Number(page) || 1;
        limit = Number(limit) || 12;

        // ✅ Find category by slug or ObjectId
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

        // ✅ Save browsing history
        if (req.user && req.user.id) {
            await User.findByIdAndUpdate(req.user.id, {
                $pull: { recentCategories: category._id }
            });
            await User.findByIdAndUpdate(req.user.id, {
                $push: { recentCategories: { $each: [category._id], $position: 0, $slice: 20 } }
            });
        }

        // ✅ Include current + descendant categories
        const ids = (await getDescendantCategoryIds(category._id))
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id));

        ids.push(category._id);

        const filter = {
            $or: [{ categories: { $in: ids } }, { category: { $in: ids } }]
        };

        // ✅ Sorting logic
        let sortOption = { createdAt: -1 }; // default recent
        if (sort === "priceLowToHigh") sortOption = { price: 1 };
        else if (sort === "priceHighToLow") sortOption = { price: -1 };
        else if (sort === "rating") sortOption = { avgRating: -1 };

        // ✅ Pagination
        const total = await Product.countDocuments(filter);
        const products = await Product.find(filter)
            .sort(sortOption)
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        // ✅ Build category map for product cards
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

        // ✅ Format products as cards
        const cards = products.map(p => {
            const { shadeOptions, colorOptions } = buildOptions(p);

            return {
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
                image: p.images?.length ? normalizeImages([p.images[0]])[0] : null,
                shadeOptions,
                colorOptions,
                commentsCount: p.commentsCount || 0,
                avgRating: p.avgRating || 0
            };
        });

        // ✅ Breadcrumb using ancestor order
        let ancestors = [];
        if (Array.isArray(category.ancestors) && category.ancestors.length) {
            ancestors = await Category.find({ _id: { $in: category.ancestors } })
                .select("name slug")
                .lean();

            // preserve order from `category.ancestors`
            ancestors = category.ancestors.map(id =>
                ancestors.find(a => String(a._id) === String(id))
            ).filter(Boolean);
        }

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
        console.error("❌ getProductsByCategory error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
};


// 🔥 Top Selling Products
export const getTopSellingProducts = async (req, res) => {
    try {
        const topProducts = await Product.find()
            .sort({ sales: -1 })
            .limit(10)
            .select("name images foundationVariants shadeOptions colorOptions")
            .lean();

        res.status(200).json({
            success: true,
            products: topProducts.map(p => {
                const shadeOptions = (p.foundationVariants?.length > 0)
                    ? p.foundationVariants.map(v => v.shadeName).filter(Boolean)
                    : (p.shadeOptions || []);
                const colorOptions = (p.foundationVariants?.length > 0)
                    ? p.foundationVariants.map(v => v.hex).filter(Boolean)
                    : (p.colorOptions || []);

                return {
                    _id: p._id,
                    name: p.name,
                    image: p.image || (p.images?.[0] || null),
                    shadeOptions,
                    colorOptions
                };
            })
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

// 🔥 Top Selling Products By Category or Specific Category (for recommendations)
// export const getTopSellingProductsByCategory = async (req, res) => {
//     try {
//         const { limit = 3, categorySlug } = req.query; // categorySlug = optional filter

//         // Build filter (only products with sales > 0)
//         const productFilter = { sales: { $gt: 0 } };

//         // 1️⃣ If user wants only one category
//         let categoryDoc = null;
//         if (categorySlug) {
//             categoryDoc = await Category.findOne({ slug: categorySlug })
//                 .select("_id name slug thumbnailImage")
//                 .lean();

//             if (!categoryDoc) {
//                 return res.status(404).json({
//                     success: false,
//                     message: "Category not found"
//                 });
//             }

//             productFilter.category = categoryDoc._id;
//         }

//         // 2️⃣ Fetch products
//         const soldProducts = await Product.find(productFilter)
//             .sort({ sales: -1 })
//             .populate("category", "name slug thumbnailImage")
//             .select("name image images foundationVariants shadeOptions colorOptions sales category")
//             .lean();

//         if (!soldProducts.length) {
//             return res.status(200).json({ success: true, categories: [] });
//         }

//         // 3️⃣ Group by category (same logic as before)
//         const categoryMap = new Map();

//         soldProducts.forEach(p => {
//             if (!p.category) return;

//             const shadeOptions = (p.foundationVariants?.length > 0)
//                 ? p.foundationVariants.map(v => v.shadeName).filter(Boolean)
//                 : (p.shadeOptions || []);

//             const colorOptions = (p.foundationVariants?.length > 0)
//                 ? p.foundationVariants.map(v => v.hex).filter(Boolean)
//                 : (p.colorOptions || []);

//             const productData = {
//                 _id: p._id,
//                 name: p.name,
//                 sales: p.sales,
//                 image: p.image || (p.images?.[0] || null),
//                 shadeOptions,
//                 colorOptions
//             };

//             if (!categoryMap.has(p.category.slug)) {
//                 categoryMap.set(p.category.slug, {
//                     category: {
//                         _id: p.category._id,
//                         name: p.category.name,
//                         slug: p.category.slug,
//                         image: p.category.thumbnailImage || null
//                     },
//                     products: []
//                 });
//             }

//             categoryMap.get(p.category.slug).products.push(productData);
//         });

//         // 4️⃣ Sort products within each category
//         const categories = Array.from(categoryMap.values()).map(cat => {
//             cat.products = cat.products
//                 .sort((a, b) => b.sales - a.sales)
//                 .slice(0, Number(limit));
//             return cat;
//         });

//         // 5️⃣ Sort categories (only needed in global mode)
//         if (!categorySlug) {
//             categories.sort((a, b) => {
//                 const topA = a.products[0]?.sales || 0;
//                 const topB = b.products[0]?.sales || 0;
//                 return topB - topA;
//             });
//         }

//         res.status(200).json({
//             success: true,
//             categories
//         });

//     } catch (error) {
//         console.error("🔥 Failed to fetch top selling products by category:", error);
//         res.status(500).json({
//             success: false,
//             message: "Failed to fetch top selling products by category",
//             error: error.message
//         });
//     }
// };





export const getTopSellingProductsByCategory = async (req, res) => {
    try {
        const { limit = 3, categorySlug } = req.query;

        // ✅ Use global recommendation system
        const { products, category, message } = await getRecommendedProducts({
            categorySlug,
            limit
        });

        return res.status(200).json({
            success: true,
            category,
            message,
            products
        });
    } catch (error) {
        console.error("🔥 Failed to fetch top selling products:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch top selling products",
            error: error.message
        });
    }
};



// 🔥 Product Details + Related
export const getProductWithRelated = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id)
            .populate("category")
            .lean();

        if (!product) {
            return res.status(404).json({ success: false, message: "Product not found" });
        }

        // Normalize shades + colors from foundationVariants
        let shadeOptions = [];
        let colorOptions = [];
        if (Array.isArray(product.foundationVariants) && product.foundationVariants.length > 0) {
            shadeOptions = product.foundationVariants.map(v => v.shadeName).filter(Boolean);
            colorOptions = product.foundationVariants.map(v => v.hex).filter(Boolean);
        } else {
            shadeOptions = product.shadeOptions || [];
            colorOptions = product.colorOptions || [];
        }

        const responseProduct = {
            ...product,
            image: product.image || (product.images?.[0] || null),
            shadeOptions,
            colorOptions,
        };

        res.status(200).json({
            success: true,
            product: responseProduct
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


 // GET /products/skintype/:slug
// export const getProductsBySkinType = async (req, res) => {
//     try {
//         const skinTypeSlug = req.params.slug.toLowerCase();
//         let { page = 1, limit = 12, sort = "recent", categorySlug } = req.query;

//         page = Number(page) || 1;
//         limit = Number(limit) || 12;

//         // ✅ 1. Find skinType ObjectId
//         const skinTypeDoc = await SkinType.findOne({ slug: skinTypeSlug }).lean();
//         if (!skinTypeDoc) {
//             return res.status(404).json({ message: `Skin type '${skinTypeSlug}' not found.` });
//         }

//         // ✅ 2. Build category chain (if categorySlug passed)
//         let categoriesToCheck = [];
//         if (categorySlug) {
//             const baseCategory = await Category.findOne({ slug: categorySlug })
//                 .select("_id name slug parent")
//                 .lean();

//             if (baseCategory) {
//                 categoriesToCheck = await getCategoryFallbackChain(baseCategory);
//             }
//         }

//         // ✅ 3. Main filter
//         const filter = { skinTypes: skinTypeDoc._id };
//         if (categoriesToCheck.length) filter.category = { $in: categoriesToCheck.map(c => c._id) };

//         // ✅ Sorting
//         let sortOption = { createdAt: -1 };
//         if (sort === "priceLowToHigh") sortOption = { price: 1 };
//         else if (sort === "priceHighToLow") sortOption = { price: -1 };
//         else if (sort === "rating") sortOption = { avgRating: -1 };

//         // ✅ Products
//         const total = await Product.countDocuments(filter);
//         let products = await Product.find(filter)
//             .sort(sortOption)
//             .skip((page - 1) * limit)
//             .limit(limit)
//             .lean();

//         // ✅ Format product cards
//         const cards = products.map(p => {
//             const { shadeOptions, colorOptions } = buildOptions(p);
//             return {
//                 _id: p._id,
//                 name: p.name,
//                 variant: p.variant,
//                 price: p.price,
//                 brand: p.brand,
//                 summary: p.summary || p.description?.slice(0, 100) || "",
//                 status: p.status,
//                 image: p.images?.length ? normalizeImages([p.images[0]])[0] : null,
//                 shadeOptions,
//                 colorOptions,
//                 commentsCount: p.commentsCount || 0,
//                 avgRating: p.avgRating || 0
//             };
//         });

//         // ✅ Recommendations (ALWAYS generate, not just when products are empty)
//         let recommendations = [];
//         let recommendationMessage = "";

//         if (categoriesToCheck.length) {
//             for (const cat of categoriesToCheck) {
//                 // Step 1: Same category + same skin type (exclude already shown)
//                 recommendations = await Product.find({
//                     category: cat._id,
//                     skinTypes: skinTypeDoc._id,
//                     _id: { $nin: products.map(p => p._id) }
//                 })
//                     .sort({ avgRating: -1, commentsCount: -1 })
//                     .limit(6)
//                     .lean();

//                 if (recommendations.length) {
//                     recommendationMessage = `Recommended top-rated ${cat.name} products for ${skinTypeDoc.name}.`;
//                     break;
//                 }

//                 // Step 2: Same category (ignore skin type)
//                 recommendations = await Product.find({
//                     category: cat._id,
//                     _id: { $nin: products.map(p => p._id) }
//                 })
//                     .sort({ avgRating: -1, commentsCount: -1 })
//                     .limit(6)
//                     .lean();

//                 if (recommendations.length) {
//                     recommendationMessage = `Popular ${cat.name} products you may like.`;
//                     break;
//                 }
//             }
//         }

//         // Step 3: Global fallback
//         if (!recommendations.length) {
//             recommendations = await Product.find({
//                 _id: { $nin: products.map(p => p._id) }
//             })
//                 .sort({ sales: -1 })
//                 .limit(6)
//                 .lean();

//             recommendationMessage = `Here are some of our best-selling products you may love.`;
//         }

//         // ✅ Response
//         res.status(200).json({
//             message: products.length
//                 ? `Showing ${skinTypeDoc.name} products${categorySlug ? ` in ${categorySlug}` : ""}.`
//                 : `No products found for ${skinTypeDoc.name}.`,
//             skinType: skinTypeSlug,
//             products: cards,
//             recommendations: {
//                 message: recommendationMessage,
//                 items: recommendations.map(r => ({
//                     _id: r._id,
//                     name: r.name,
//                     image: r.images?.length ? normalizeImages([r.images[0]])[0] : null,
//                     avgRating: r.avgRating || 0
//                 }))
//             },
//             pagination: {
//                 total,
//                 page,
//                 limit,
//                 totalPages: Math.ceil(total / limit),
//                 hasMore: page < Math.ceil(total / limit)
//             }
//         });

//     } catch (err) {
//         console.error("❌ getProductsBySkinType error:", err);
//         res.status(500).json({ message: "Server error", error: err.message });
//     }
// };



// export const getAllSkinTypes = async (req, res) => {
//     try {
//         const { q = "", isActive, page = 1, limit = 20 } = req.query;
//         const filters = { isDeleted: false };

//         if (q) filters.name = { $regex: q, $options: "i" };
//         if (typeof isActive !== "undefined") filters.isActive = isActive === "true";

//         const pg = Math.max(parseInt(page, 10) || 1, 1);
//         const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

//         const pipeline = [
//             { $match: filters },
//             {
//                 $lookup: {
//                     from: "products",
//                     let: { sid: "$_id" },
//                     pipeline: [
//                         {
//                             $match: {
//                                 $expr: {
//                                     $in: [
//                                         "$$sid",
//                                         { $ifNull: ["$skinTypes", []] } // ✅ ensure always an array
//                                     ]
//                                 },
//                                 isDeleted: { $ne: true }
//                             }
//                         },
//                         { $count: "count" },
//                     ],
//                     as: "stats",
//                 },
//             },
//             {
//                 $addFields: {
//                     productCount: {
//                         $ifNull: [{ $arrayElemAt: ["$stats.count", 0] }, 0]
//                     }
//                 }
//             },
//             { $project: { stats: 0 } },
//             { $sort: { name: 1 } },
//             { $skip: (pg - 1) * lim },
//             { $limit: lim },
//         ];

//         const [rows, total] = await Promise.all([
//             SkinType.aggregate(pipeline),
//             SkinType.countDocuments(filters),
//         ]);

//         return res.json({
//             success: true,
//             data: rows,
//             pagination: { page: pg, limit: lim, total }
//         });
//     } catch (err) {
//         return res.status(500).json({ success: false, message: err.message });
//     }
// };




// ✅ 1. Get all skin types (for homepage listing)
export const getAllSkinTypes = async (req, res) => {
    try {
        const { q = "", isActive, page = 1, limit = 20 } = req.query;
        const filters = { isDeleted: false };

        if (q) filters.name = { $regex: q, $options: "i" };
        if (typeof isActive !== "undefined") filters.isActive = isActive === "true";

        const pg = Math.max(parseInt(page, 10) || 1, 1);
        const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

        const pipeline = [
            { $match: filters },
            {
                $lookup: {
                    from: "products",
                    let: { sid: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: { $in: ["$$sid", { $ifNull: ["$skinTypes", []] }] },
                                isDeleted: { $ne: true }
                            }
                        },
                        { $count: "count" },
                    ],
                    as: "stats",
                },
            },
            {
                $addFields: {
                    productCount: {
                        $ifNull: [{ $arrayElemAt: ["$stats.count", 0] }, 0]
                    }
                }
            },
            { $project: { stats: 0 } },
            { $sort: { name: 1 } },
            { $skip: (pg - 1) * lim },
            { $limit: lim },
        ];

        const [rows, total] = await Promise.all([
            SkinType.aggregate(pipeline),
            SkinType.countDocuments(filters),
        ]);

        return res.json({
            success: true,
            data: rows,
            pagination: { page: pg, limit: lim, total }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};



export const getProductsBySkinType = async (req, res) => {
    try {
        const skinTypeSlug = req.params.slug.toLowerCase();
        let { page = 1, limit = 12, sort = "recent" } = req.query;

        page = Number(page) || 1;
        limit = Number(limit) || 12;

        // 🔹 1. Find skinType by slug
        const skinType = await SkinType.findOne({ slug: skinTypeSlug, isDeleted: false }).lean();
        if (!skinType) {
            return res.status(404).json({ success: false, message: "Skin type not found" });
        }

        // 🔹 2. Find Makeup + Skincare categories dynamically
        const categories = await Category.find({ slug: { $in: ["makeup", "skincare"] } }).select("_id slug").lean();
        const categoryIds = categories.map(c => c._id);

        const sortOptions = {
            recent: { createdAt: -1 },
            priceLow: { price: 1 },
            priceHigh: { price: -1 },
            popular: { totalSales: -1 },
        };

        // 🔹 3. Main products → all with this skin type
        const products = await Product.find({
            skinTypes: skinType._id,
            isDeleted: { $ne: true }
        })
            .sort(sortOptions[sort] || { createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const total = await Product.countDocuments({
            skinTypes: skinType._id,
            isDeleted: { $ne: true }
        });

        // Collect all main product IDs
        const productIds = products.map(p => p._id);

        // 🔹 4. Top-selling recommendations → only from Makeup + Skincare, exclude main products
        const topSelling = await Product.find({
            category: { $in: categoryIds },
            isDeleted: { $ne: true },
            _id: { $nin: productIds }
        })
            .sort({ totalSales: -1 })
            .limit(5)
            .lean();

        // Collect exclude IDs (main + topSelling)
        const excludeIds = [...productIds, ...topSelling.map(p => p._id)];

        // 🔹 5. Random recommendations → only from Makeup + Skincare, exclude both lists
        const randomProducts = await Product.aggregate([
            {
                $match: {
                    category: { $in: categoryIds },
                    isDeleted: { $ne: true },
                    _id: { $nin: excludeIds }
                }
            },
            { $sample: { size: 5 } }
        ]);

        // ✅ Final response
        return res.json({
            success: true,
            skinType: skinType.name,
            products,
            pagination: { page, limit, total },
            recommendations: {
                topSelling,
                random: randomProducts,
            }
        });

    } catch (err) {
        console.error("🔥 getProductsBySkinType error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};