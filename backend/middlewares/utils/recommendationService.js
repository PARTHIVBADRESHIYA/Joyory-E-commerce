// // middlewares/utils/recommendationService.js
// import mongoose from "mongoose";
// import Product from "../../models/Product.js";
// import Category from "../../models/Category.js";
// import Order from "../../models/Order.js";
// import ProductViewLog from "../../models/ProductViewLog.js";
// import { buildOptions, normalizeImages } from "../../controllers/user/userProductController.js";
// import { getCategoryFallbackChain } from "../../middlewares/utils/categoryUtils.js";

// /**
//  * Format a single product into a full card
//  */
// export const formatProductCard = async (product) => {
//     if (!product) return null;

//     let categoryObj = null;
//     if (mongoose.Types.ObjectId.isValid(product.category)) {
//         categoryObj = await Category.findById(product.category).select("name slug").lean();
//     }

//     const { shadeOptions, colorOptions } = buildOptions(product);

//     return {
//         _id: product._id,
//         name: product.name,
//         brand: product.brand,
//         variant: product.variant,
//         price: product.price,
//         mrp: product.mrp,
//         discountPercent: product.mrp ? Math.round(((product.mrp - product.price) / product.mrp) * 100) : 0,
//         images: normalizeImages(product.images || []),
//         shadeOptions,
//         colorOptions,
//         avgRating: product.avgRating || 0,
//         totalRatings: product.commentsCount || 0,
//         inStock: product.inStock ?? true
//     };
// };

// /**
//  * Universal Recommendation Service with parent-category fallback
//  */
// // export const getRecommendations = async ({ mode, productId, categorySlug, userId, limit = 6 }) => {
// //     try {
// //         let products = [];
// //         let message = "";

// //         const getTrending = async () => {
// //             return await Product.find({ sales: { $gt: 0 } })
// //                 .sort({ sales: -1 })
// //                 .limit(Number(limit))
// //                 .lean();
// //         };

// //         const fallbackCategoryChain = async (categoryId) => {
// //             const chain = await getCategoryFallbackChain(await Category.findById(categoryId).lean());
// //             for (const cat of chain) {
// //                 const prods = await Product.find({ category: cat._id })
// //                     .sort({ sales: -1 })
// //                     .limit(Number(limit))
// //                     .lean();
// //                 if (prods.length) return { products: prods, fallbackFrom: cat.name };
// //             }
// //             return { products: [], fallbackFrom: null };
// //         };

// //         switch (mode) {
// //             case "moreLikeThis": {
// //                 const product = await Product.findById(productId).lean();
// //                 if (!product) return { success: false, products: [], message: "Product not found" };

// //                 // Same brand + category
// //                 products = await Product.find({
// //                     _id: { $ne: product._id },
// //                     category: product.category,
// //                     brand: product.brand
// //                 }).sort({ sales: -1 }).limit(Number(limit)).lean();

// //                 let fallbackFrom = null;

// //                 if (!products.length) {
// //                     // Same category only
// //                     products = await Product.find({
// //                         _id: { $ne: product._id },
// //                         category: product.category
// //                     }).sort({ sales: -1 }).limit(Number(limit)).lean();
// //                     fallbackFrom = "same category";
// //                 }

// //                 if (!products.length && product.category) {
// //                     // Parent/grandparent chain fallback
// //                     const fallback = await fallbackCategoryChain(product.category);
// //                     products = fallback.products;
// //                     fallbackFrom = fallback.fallbackFrom ? `parent category: ${fallback.fallbackFrom}` : null;
// //                 }

// //                 if (!products.length) {
// //                     products = await getTrending();
// //                     fallbackFrom = "trending products";
// //                 }

// //                 message = fallbackFrom ? `More like this (showing from ${fallbackFrom})` : "More like this";
// //                 break;
// //             }

// //             case "boughtTogether": {
// //                 const orders = await Order.aggregate([
// //                     { $unwind: "$products" },
// //                     { $match: { "products.productId": { $ne: new mongoose.Types.ObjectId(productId) } } },
// //                     { $group: { _id: "$products.productId", count: { $sum: 1 } } },
// //                     { $sort: { count: -1 } },
// //                     { $limit: Number(limit) }
// //                 ]);
// //                 const productIds = orders.map(o => o._id);
// //                 products = await Product.find({ _id: { $in: productIds } }).lean();

// //                 let fallbackFrom = null;

// //                 if (!products.length) {
// //                     const prod = await Product.findById(productId).lean();
// //                     if (prod?.category) {
// //                         const fallback = await fallbackCategoryChain(prod.category);
// //                         products = fallback.products;
// //                         fallbackFrom = fallback.fallbackFrom ? `parent category: ${fallback.fallbackFrom}` : null;
// //                     }
// //                 }

// //                 if (!products.length) {
// //                     products = await getTrending();
// //                     fallbackFrom = "trending products";
// //                 }

// //                 message = fallbackFrom ? `Frequently bought together (showing from ${fallbackFrom})` : "Frequently bought together";
// //                 break;
// //             }

// //             case "alsoViewed": {
// //                 const viewed = await ProductViewLog.find({ userId })
// //                     .sort({ createdAt: -1 })
// //                     .limit(Number(limit))
// //                     .populate("productId")
// //                     .lean();
// //                 products = viewed.map(v => v.productId);

// //                 let fallbackFrom = null;

// //                 if (!products.length) {
// //                     // Optional: fallback to top-selling in the same category if productId given
// //                     if (productId) {
// //                         const prod = await Product.findById(productId).lean();
// //                         if (prod?.category) {
// //                             const fallback = await fallbackCategoryChain(prod.category);
// //                             products = fallback.products;
// //                             fallbackFrom = fallback.fallbackFrom ? `parent category: ${fallback.fallbackFrom}` : null;
// //                         }
// //                     }
// //                 }

// //                 if (!products.length) {
// //                     products = await getTrending();
// //                     fallbackFrom = "trending products";
// //                 }

// //                 message = fallbackFrom ? `Also viewed (showing from ${fallbackFrom})` : "Also viewed by others";
// //                 break;
// //             }

// //             default: {
// //                 products = await getTrending();
// //                 message = "Trending products";
// //             }
// //         }

// //         // Format
// //         products = await Promise.all(products.map(p => formatProductCard(p)));

// //         return { success: true, products, message };

// //     } catch (err) {
// //         console.error("❌ Recommendation service error:", err);
// //         return { success: false, products: [], message: "Server error" };
// //     }
// // };


// export const getRecommendations = async ({ 
//     mode, 
//     productId, 
//     categorySlug, 
//     skinTypeSlug, 
//     userId, 
//     limit = 6 
// }) => {
//     try {
//         let products = [];
//         let message = "";

//         // 🔹 Trending products
//         const getTrending = async () => {
//             return await Product.find({ sales: { $gt: 0 }, isDeleted: { $ne: true } })
//                 .sort({ sales: -1 })
//                 .limit(Number(limit))
//                 .lean();
//         };

//         // 🔹 Category fallback chain
//         const fallbackCategoryChain = async (categoryId) => {
//             const chain = await getCategoryFallbackChain(await Category.findById(categoryId).lean());
//             for (const cat of chain) {
//                 const prods = await Product.find({ category: cat._id, isDeleted: { $ne: true } })
//                     .sort({ sales: -1 })
//                     .limit(Number(limit))
//                     .lean();
//                 if (prods.length) return { products: prods, fallbackFrom: cat.name };
//             }
//             return { products: [], fallbackFrom: null };
//         };

//         // 🔹 SkinType helper
//         const getSkinTypeProducts = async (skinTypeId, categoryIds = []) => {
//             const filter = { skinTypes: skinTypeId, isDeleted: { $ne: true } };
//             if (categoryIds.length) filter.category = { $in: categoryIds };
//             return await Product.find(filter).sort({ sales: -1 }).limit(Number(limit)).lean();
//         };

//         switch (mode) {
//             case "moreLikeThis": {
//                 const product = await Product.findById(productId).lean();
//                 if (!product) return { success: false, products: [], message: "Product not found" };

//                 // Same brand + category
//                 products = await Product.find({
//                     _id: { $ne: product._id },
//                     category: product.category,
//                     brand: product.brand,
//                     isDeleted: { $ne: true }
//                 }).sort({ sales: -1 }).limit(Number(limit)).lean();

//                 let fallbackFrom = null;
//                 if (!products.length) {
//                     // Same category only
//                     products = await Product.find({
//                         _id: { $ne: product._id },
//                         category: product.category,
//                         isDeleted: { $ne: true }
//                     }).sort({ sales: -1 }).limit(Number(limit)).lean();
//                     fallbackFrom = "same category";
//                 }

//                 if (!products.length && product.category) {
//                     const fallback = await fallbackCategoryChain(product.category);
//                     products = fallback.products;
//                     fallbackFrom = fallback.fallbackFrom ? `parent category: ${fallback.fallbackFrom}` : null;
//                 }

//                 if (!products.length) {
//                     products = await getTrending();
//                     fallbackFrom = "trending products";
//                 }

//                 message = fallbackFrom 
//                     ? `More like this (showing from ${fallbackFrom})` 
//                     : "More like this";
//                 break;
//             }

//             case "boughtTogether": {
//                 const orders = await Order.aggregate([
//                     { $unwind: "$products" },
//                     { $match: { "products.productId": { $ne: new mongoose.Types.ObjectId(productId) } } },
//                     { $group: { _id: "$products.productId", count: { $sum: 1 } } },
//                     { $sort: { count: -1 } },
//                     { $limit: Number(limit) }
//                 ]);
//                 const productIds = orders.map(o => o._id);
//                 products = await Product.find({ _id: { $in: productIds }, isDeleted: { $ne: true } }).lean();

//                 let fallbackFrom = null;
//                 if (!products.length) {
//                     const prod = await Product.findById(productId).lean();
//                     if (prod?.category) {
//                         const fallback = await fallbackCategoryChain(prod.category);
//                         products = fallback.products;
//                         fallbackFrom = fallback.fallbackFrom ? `parent category: ${fallback.fallbackFrom}` : null;
//                     }
//                 }

//                 if (!products.length) {
//                     products = await getTrending();
//                     fallbackFrom = "trending products";
//                 }

//                 message = fallbackFrom 
//                     ? `Frequently bought together (showing from ${fallbackFrom})` 
//                     : "Frequently bought together";
//                 break;
//             }

//             case "alsoViewed": {
//                 const viewed = await ProductViewLog.find({ userId })
//                     .sort({ createdAt: -1 })
//                     .limit(Number(limit))
//                     .populate("productId")
//                     .lean();
//                 products = viewed.map(v => v.productId).filter(Boolean);

//                 let fallbackFrom = null;
//                 if (!products.length && productId) {
//                     const prod = await Product.findById(productId).lean();
//                     if (prod?.category) {
//                         const fallback = await fallbackCategoryChain(prod.category);
//                         products = fallback.products;
//                         fallbackFrom = fallback.fallbackFrom ? `parent category: ${fallback.fallbackFrom}` : null;
//                     }
//                 }

//                 if (!products.length) {
//                     products = await getTrending();
//                     fallbackFrom = "trending products";
//                 }

//                 message = fallbackFrom 
//                     ? `Also viewed (showing from ${fallbackFrom})` 
//                     : "Also viewed by others";
//                 break;
//             }

//             case "skinType": {
//                 const skinType = await SkinType.findOne({ slug: skinTypeSlug, isDeleted: false }).lean();
//                 if (!skinType) return { success: false, products: [], message: "Skin type not found" };

//                 let fallbackFrom = null;
//                 let categoryIds = [];
//                 if (categorySlug) {
//                     const cat = await Category.findOne({ slug: categorySlug }).lean();
//                     if (cat) categoryIds = [cat._id];
//                 }

//                 // Category + skinType
//                 products = await getSkinTypeProducts(skinType._id, categoryIds);

//                 if (!products.length && categoryIds.length) {
//                     // Only skinType
//                     products = await getSkinTypeProducts(skinType._id);
//                     fallbackFrom = `skin type: ${skinType.name}`;
//                 }

//                 if (!products.length) {
//                     products = await getTrending();
//                     fallbackFrom = "trending products";
//                 }

//                 message = fallbackFrom 
//                     ? `Recommended for ${skinType.name} (showing from ${fallbackFrom})` 
//                     : `Recommended for ${skinType.name}`;
//                 break;
//             }

//             case "categoryTopSelling": {
//                 const cat = await Category.findOne({ slug: categorySlug }).lean();
//                 if (!cat) return { success: false, products: [], message: "Category not found" };

//                 products = await Product.find({ category: cat._id, isDeleted: { $ne: true } })
//                     .sort({ sales: -1 })
//                     .limit(Number(limit))
//                     .lean();

//                 let fallbackFrom = null;
//                 if (!products.length) {
//                     const fallback = await fallbackCategoryChain(cat._id);
//                     products = fallback.products;
//                     fallbackFrom = fallback.fallbackFrom;
//                 }

//                 if (!products.length) {
//                     products = await getTrending();
//                     fallbackFrom = "trending products";
//                 }

//                 message = fallbackFrom 
//                     ? `Top selling (showing from ${fallbackFrom})` 
//                     : `Top selling in ${cat.name}`;
//                 break;
//             }

//             default: {
//                 products = await getTrending();
//                 message = "Trending products";
//             }
//         }

//         // 🔹 Format
//         products = await Promise.all(products.map(p => formatProductCard(p)));

//         return { success: true, products, message };
//     } catch (err) {
//         console.error("❌ Recommendation service error:", err);
//         return { success: false, products: [], message: "Server error" };
//     }
// };






// middlewares/utils/recommendationService.js
import mongoose from "mongoose";
import Product from "../../models/Product.js";
import Category from "../../models/Category.js";
import Order from "../../models/Order.js";
import ProductViewLog from "../../models/ProductViewLog.js";
import { buildOptions, normalizeImages } from "../../controllers/user/userProductController.js";
import { getCategoryFallbackChain } from "../../middlewares/utils/categoryUtils.js";

/**
 * Format a single product into a full card
 */
// export const formatProductCard = async (product) => {
//     if (!product) return null;

//     let categoryObj = null;
//     if (mongoose.Types.ObjectId.isValid(product.category)) {
//         categoryObj = await Category.findById(product.category).select("name slug").lean();
//     }

//     const { shadeOptions, colorOptions } = buildOptions(product);

//     return {
//         _id: product._id,
//         name: product.name,
//         brand: product.brand,
//         variant: product.variant,
//         price: product.price,
//         mrp: product.mrp,
//         discountPercent: product.mrp
//             ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
//             : 0,
//         images: normalizeImages(product.images || []),
//         shadeOptions,
//         colorOptions,
//         avgRating: product.avgRating || 0,
//         totalRatings: product.commentsCount || 0,
//         inStock: product.inStock ?? true
//     };
// };
// export const formatProductCard = async (product) => {
//     if (!product) return null;

//     let categoryObj = null;
//     if (mongoose.Types.ObjectId.isValid(product.category)) {
//         categoryObj = await Category.findById(product.category).select("name slug").lean();
//     }

//     const { shadeOptions, colorOptions } = buildOptions(product);

//     let status = null;
//     let message = null;
//     let inStock = null;

//     if (product.variants?.length) {
//         // Variant-level stock info
//         product.variants = product.variants.map(v => {
//             let vStatus, vMessage;
//             if (v.stock === 0) {
//                 vStatus = "outOfStock";
//                 vMessage = "No stock available now, please try again later";
//             } else if (v.stock < (v.thresholdValue || 5)) {
//                 vStatus = "lowStock";
//                 vMessage = `Few left (${v.stock})`;
//             } else {
//                 vStatus = "inStock";
//                 vMessage = "In-stock";
//             }
//             return { ...v, status: vStatus, message: vMessage };
//         });
//     } else {
//         // Non-variant product
//         if (product.quantity === 0) {
//             status = "outOfStock";
//             message = "No stock available now, please try again later";
//             inStock = false;
//         } else if (product.quantity < (product.thresholdValue || 5)) {
//             status = "lowStock";
//             message = `Few left (${product.quantity})`;
//             inStock = true;
//         } else {
//             status = "inStock";
//             message = "In-stock";
//             inStock = true;
//         }
//     }

//     return {
//         _id: product._id,
//         name: product.name,
//         brand: product.brand,
//         variant: product.variant,
//         price: product.price,
//         mrp: product.mrp,
//         discountPercent: product.mrp
//             ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
//             : 0,
//         images: normalizeImages(product.images || []),
//         shadeOptions,
//         colorOptions,
//         avgRating: product.avgRating || 0,
//         totalRatings: product.commentsCount || 0,
//         inStock,
//         status,
//         message,
//         variants: product.variants || [],
//         category: categoryObj ? { _id: categoryObj._id, name: categoryObj.name, slug: categoryObj.slug } : null
//     };
// };

export const formatProductCard = async (product) => {
    if (!product) return null;

    let categoryObj = null;
    if (mongoose.Types.ObjectId.isValid(product.category)) {
        categoryObj = await Category.findById(product.category).select("name slug").lean();
    }

    const { shadeOptions, colorOptions } = buildOptions(product);

    let status = null;
    let message = null;
    let inStock = null;
    let selectedVariant = null;

    if (product.variants?.length) {
        // Compute variant stock and messages
        product.variants = product.variants.map(v => {
            let vStatus, vMessage;
            if (v.stock === 0) {
                vStatus = "outOfStock";
                vMessage = "No stock available now, please try again later";
            } else if (v.stock < (v.thresholdValue || 5)) {
                vStatus = "lowStock";
                vMessage = `Few left (${v.stock})`;
            } else {
                vStatus = "inStock";
                vMessage = "In-stock";
            }

            // Select first available variant as default
            if (!selectedVariant && vStatus === "inStock") {
                selectedVariant = { ...v, status: vStatus, message: vMessage };
                status = vStatus;
                message = vMessage;
                inStock = true;
            }

            return { ...v, status: vStatus, message: vMessage };
        });

        // If all variants out-of-stock, pick first variant but mark out-of-stock
        if (!selectedVariant) {
            const first = product.variants[0];
            selectedVariant = { ...first };
            status = first.status;
            message = first.message;
            inStock = false;
        }

        // Remove global stock info for variants
        delete product.quantity;
        delete product.status;
        delete product.message;
    } else {
        // Non-variant product
        if (product.quantity === 0) {
            status = "outOfStock";
            message = "No stock available now, please try again later";
            inStock = false;
        } else if (product.quantity < (product.thresholdValue || 5)) {
            status = "lowStock";
            message = `Few left (${product.quantity})`;
            inStock = true;
        } else {
            status = "inStock";
            message = "In-stock";
            inStock = true;
        }
    }

    return {
        _id: product._id,
        name: product.name,
        brand: product.brand,
        variant: product.variant,
        price: product.price,
        mrp: product.mrp,
        discountPercent: product.mrp
            ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
            : 0,
        images: normalizeImages(product.images || []),
        shadeOptions,
        colorOptions,
        avgRating: product.avgRating || 0,
        totalRatings: product.commentsCount || 0,
        inStock,
        status,
        message,
        variants: product.variants || [],
        selectedVariant, // ✅ Default variant for frontend
        category: categoryObj ? { _id: categoryObj._id, name: categoryObj.name, slug: categoryObj.slug } : null
    };
};

export const getRecommendations = async ({
    mode,
    productId,
    categorySlug,
    skinTypeSlug,
    userId,
    limit = 6
}) => {
    try {
        let products = [];
        let message = "";

        // 🔹 Trending products
        const getTrending = async () => {
            return await Product.find({
                sales: { $gt: 0 },
                isDeleted: { $ne: true },
                isPublished: true
            })
                .sort({ sales: -1 })
                .limit(Number(limit))
                .lean();
        };

        // 🔹 Category fallback chain
        const fallbackCategoryChain = async (categoryId) => {
            const chain = await getCategoryFallbackChain(await Category.findById(categoryId).lean());
            for (const cat of chain) {
                const prods = await Product.find({
                    category: cat._id,
                    isDeleted: { $ne: true },
                    isPublished: true
                })
                    .sort({ sales: -1 })
                    .limit(Number(limit))
                    .lean();
                if (prods.length) return { products: prods, fallbackFrom: cat.name };
            }
            return { products: [], fallbackFrom: null };
        };

        // 🔹 SkinType helper
        const getSkinTypeProducts = async (skinTypeId, categoryIds = []) => {
            const filter = {
                skinTypes: skinTypeId,
                isDeleted: { $ne: true },
                isPublished: true
            };
            if (categoryIds.length) filter.category = { $in: categoryIds };
            return await Product.find(filter).sort({ sales: -1 }).limit(Number(limit)).lean();
        };

        switch (mode) {
            case "moreLikeThis": {
                const product = await Product.findById(productId).lean();
                if (!product) return { success: false, products: [], message: "Product not found" };

                // Same brand + category
                products = await Product.find({
                    _id: { $ne: product._id },
                    category: product.category,
                    brand: product.brand,
                    isDeleted: { $ne: true },
                    isPublished: true
                })
                    .sort({ sales: -1 })
                    .limit(Number(limit))
                    .lean();

                let fallbackFrom = null;
                if (!products.length) {
                    // Same category only
                    products = await Product.find({
                        _id: { $ne: product._id },
                        category: product.category,
                        isDeleted: { $ne: true },
                        isPublished: true
                    })
                        .sort({ sales: -1 })
                        .limit(Number(limit))
                        .lean();
                    fallbackFrom = "same category";
                }

                if (!products.length && product.category) {
                    const fallback = await fallbackCategoryChain(product.category);
                    products = fallback.products;
                    fallbackFrom = fallback.fallbackFrom
                        ? `parent category: ${fallback.fallbackFrom}`
                        : null;
                }

                if (!products.length) {
                    products = await getTrending();
                    fallbackFrom = "trending products";
                }

                message = fallbackFrom
                    ? `More like this (showing from ${fallbackFrom})`
                    : "More like this";
                break;
            }

            case "boughtTogether": {
                const orders = await Order.aggregate([
                    { $unwind: "$products" },
                    {
                        $match: {
                            "products.productId": { $ne: new mongoose.Types.ObjectId(productId) }
                        }
                    },
                    { $group: { _id: "$products.productId", count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: Number(limit) }
                ]);
                const productIds = orders.map((o) => o._id);
                products = await Product.find({
                    _id: { $in: productIds },
                    isDeleted: { $ne: true },
                    isPublished: true
                }).lean();

                let fallbackFrom = null;
                if (!products.length) {
                    const prod = await Product.findById(productId).lean();
                    if (prod?.category) {
                        const fallback = await fallbackCategoryChain(prod.category);
                        products = fallback.products;
                        fallbackFrom = fallback.fallbackFrom
                            ? `parent category: ${fallback.fallbackFrom}`
                            : null;
                    }
                }

                if (!products.length) {
                    products = await getTrending();
                    fallbackFrom = "trending products";
                }

                message = fallbackFrom
                    ? `Frequently bought together (showing from ${fallbackFrom})`
                    : "Frequently bought together";
                break;
            }

            case "alsoViewed": {
                const viewed = await ProductViewLog.find({ userId })
                    .sort({ createdAt: -1 })
                    .limit(Number(limit))
                    .populate("productId")
                    .lean();
                products = viewed
                    .map((v) => v.productId)
                    .filter((p) => p && p.isPublished); // 👈 filter only published

                let fallbackFrom = null;
                if (!products.length && productId) {
                    const prod = await Product.findById(productId).lean();
                    if (prod?.category) {
                        const fallback = await fallbackCategoryChain(prod.category);
                        products = fallback.products;
                        fallbackFrom = fallback.fallbackFrom
                            ? `parent category: ${fallback.fallbackFrom}`
                            : null;
                    }
                }

                if (!products.length) {
                    products = await getTrending();
                    fallbackFrom = "trending products";
                }

                message = fallbackFrom
                    ? `Also viewed (showing from ${fallbackFrom})`
                    : "Also viewed by others";
                break;
            }

            case "skinType": {
                const skinType = await SkinType.findOne({
                    slug: skinTypeSlug,
                    isDeleted: false
                }).lean();
                if (!skinType) return { success: false, products: [], message: "Skin type not found" };

                let fallbackFrom = null;
                let categoryIds = [];
                if (categorySlug) {
                    const cat = await Category.findOne({ slug: categorySlug }).lean();
                    if (cat) categoryIds = [cat._id];
                }

                // Category + skinType
                products = await getSkinTypeProducts(skinType._id, categoryIds);

                if (!products.length && categoryIds.length) {
                    // Only skinType
                    products = await getSkinTypeProducts(skinType._id);
                    fallbackFrom = `skin type: ${skinType.name}`;
                }

                if (!products.length) {
                    products = await getTrending();
                    fallbackFrom = "trending products";
                }

                message = fallbackFrom
                    ? `Recommended for ${skinType.name} (showing from ${fallbackFrom})`
                    : `Recommended for ${skinType.name}`;
                break;
            }

            case "categoryTopSelling": {
                const cat = await Category.findOne({ slug: categorySlug }).lean();
                if (!cat) return { success: false, products: [], message: "Category not found" };

                products = await Product.find({
                    category: cat._id,
                    isDeleted: { $ne: true },
                    isPublished: true
                })
                    .sort({ sales: -1 })
                    .limit(Number(limit))
                    .lean();

                let fallbackFrom = null;
                if (!products.length) {
                    const fallback = await fallbackCategoryChain(cat._id);
                    products = fallback.products;
                    fallbackFrom = fallback.fallbackFrom;
                }

                if (!products.length) {
                    products = await getTrending();
                    fallbackFrom = "trending products";
                }

                message = fallbackFrom
                    ? `Top selling (showing from ${fallbackFrom})`
                    : `Top selling in ${cat.name}`;
                break;
            }

            default: {
                products = await getTrending();
                message = "Trending products";
            }
        }

        // 🔹 Format
        products = await Promise.all(products.map((p) => formatProductCard(p)));

        return { success: true, products, message };
    } catch (err) {
        console.error("❌ Recommendation service error:", err);
        return { success: false, products: [], message: "Server error" };
    }
};
