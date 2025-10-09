// middlewares/utils/recommendationService.js
import mongoose from "mongoose";
import Product from "../../models/Product.js";
import Category from "../../models/Category.js";
import Order from "../../models/Order.js";
import ProductViewLog from "../../models/ProductViewLog.js";
import { buildOptions, normalizeImages } from "../../controllers/user/userProductController.js";
import { getCategoryFallbackChain } from "../../middlewares/utils/categoryUtils.js";
import { calculateVariantPrices } from "../../middlewares/services/promotionHelper.js";

export const getPseudoVariant = (product) => ({
    sku: product._id.toString(),
    stock: product.quantity || 0,
    price: product.price || 0,
    discountedPrice: product.discountedPrice || product.price || 0,
    originalPrice: product.price || 0,
    displayPrice: product.discountedPrice || product.price || 0,
    discountAmount: (product.price || 0) - (product.discountedPrice || product.price || 0),
    discountPercent: product.discountPercent || 0,
    status: product.quantity > 0 ? "inStock" : "outOfStock",
    message: product.quantity > 0 ? "In-stock" : "No stock available",
    images: product.images || [],
});

// // 🔹 Format product card
// export const formatProductCard = async (product, promotions = []) => {
//     if (!product) return null;

//     // 🔹 Fetch category info
//     let categoryObj = null;
//     if (mongoose.Types.ObjectId.isValid(product.category)) {
//         categoryObj = await Category.findById(product.category)
//             .select("name slug")
//             .lean();
//     }

//     const { shadeOptions, colorOptions } = buildOptions(product);

//     // 🔹 Ensure variants exist for internal calculations
//     let variantsArray = product.variants && product.variants.length
//         ? calculateVariantPrices(product.variants, product, promotions)
//         : calculateVariantPrices([getPseudoVariant(product)], product, promotions);

//     // 🔹 Pick first variant for display price
//     const displayVariant = variantsArray[0];

//     // 🔹 Price & discount
//     const price = displayVariant?.displayPrice ?? product.price ?? 0;
//     const mrp = displayVariant?.originalPrice ?? product.price ?? 0;
//     const discountPercent = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;

//     // 🔹 Stock & message
//     const status = displayVariant?.status || "inStock";
//     const message = displayVariant?.message || "In-stock";
//     const inStock = displayVariant?.stock > 0;

//     return {
//         _id: product._id,
//         name: product.name,
//         brand: product.brand,
//         variant: product.variant ?? null, // ⚡ KEEP legacy variant intact
//         price,
//         mrp,
//         discountPercent,
//         discountAmount: mrp - price,
//         images: normalizeImages(product.images || []),
//         shadeOptions,
//         colorOptions,
//         avgRating: product.avgRating || 0,
//         totalRatings: product.commentsCount || 0,
//         status,
//         message,
//         inStock,
//         variants: variantsArray, // ⚡ internal frontend logic
//         selectedVariant: null,
//         category: categoryObj
//             ? { _id: categoryObj._id, name: categoryObj.name, slug: categoryObj.slug }
//             : null,
//     };
// };


// 🔹 Format product card
// export const formatProductCard = async (product, promotions = []) => {
//     if (!product) return null;

//     // 🔹 Fetch category info
//     let categoryObj = null;
//     if (mongoose.Types.ObjectId.isValid(product.category)) {
//         categoryObj = await Category.findById(product.category)
//             .select("name slug")
//             .lean();
//     }

//     const { shadeOptions, colorOptions } = buildOptions(product);

//     // 🔹 Calculate variants ONLY if actual variants exist
//     let variantsArray = product.variants && product.variants.length
//         ? calculateVariantPrices(product.variants, product, promotions)
//         : []; // ✅ no pseudo variants

//     // 🔹 Pick first variant for display price
//     const displayVariant = variantsArray[0];

//     // 🔹 Price & discount
//     const price = displayVariant?.displayPrice ?? product.price ?? 0;
//     const mrp = displayVariant?.originalPrice ?? product.price ?? 0;
//     const discountPercent = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;

//     // 🔹 Stock & message
//     const status = displayVariant?.status || (product.quantity > 0 ? "inStock" : "outOfStock");
//     const message = displayVariant?.message || (product.quantity > 0 ? "In-stock" : "No stock available");
//     const inStock = displayVariant?.stock > 0 || product.quantity > 0;

//     return {
//         _id: product._id,
//         name: product.name,
//         brand: product.brand,
//         variant: product.variant ?? null, // ⚡ KEEP legacy variant intact
//         price,
//         mrp,
//         discountPercent,
//         discountAmount: mrp - price,
//         images: normalizeImages(product.images || []),
//         shadeOptions,
//         colorOptions,
//         avgRating: product.avgRating || 0,
//         totalRatings: product.commentsCount || 0,
//         status,
//         message,
//         inStock,
//         variants: variantsArray, // ✅ empty if no variants
//         selectedVariant: null,
//         category: categoryObj
//             ? { _id: categoryObj._id, name: categoryObj.name, slug: categoryObj.slug }
//             : null,
//     };
// };

export const formatProductCard = async (product, promotions = []) => {
    if (!product) return null;

    // 🔹 Fetch category info
    let categoryObj = null;
    if (mongoose.Types.ObjectId.isValid(product.category)) {
        categoryObj = await Category.findById(product.category)
            .select("name slug")
            .lean();
    }

    const { shadeOptions, colorOptions } = buildOptions(product);

    // 🔹 Normalize variants
    let variantsArray = [];

    if (Array.isArray(product.variants) && product.variants.length > 0) {
        // ✅ Real variants (shadeName, hex, etc.)
        variantsArray = calculateVariantPrices(product.variants, product, promotions);
    } else if (product.variant && (!product.variants || !product.variants.length)) {
        // ✅ Old legacy single variant like "30ml", "60g", etc.
        const legacyVariant = {
            name: product.variant,
            sku: product.sku ?? `${product._id}-default`,
            stock: product.quantity ?? 0,
            originalPrice: product.mrp ?? product.price ?? 0,
            displayPrice: product.price ?? 0,
            discountPercent: product.mrp && product.mrp > product.price
                ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
                : 0,
            message: product.quantity > 0 ? "In-stock" : "No stock available",
            status: product.quantity > 0 ? "inStock" : "outOfStock",
            images: normalizeImages(product.images || []),
        };
        variantsArray = calculateVariantPrices([legacyVariant], product, promotions);
    } 
    // ❌ else no variants at all (product without variant fields)

    // 🔹 Display price logic
    const displayVariant = variantsArray[0];
    const price = displayVariant?.displayPrice ?? product.price ?? 0;
    const mrp = displayVariant?.originalPrice ?? product.mrp ?? product.price ?? 0;
    const discountPercent = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;

    // 🔹 Stock & message
    const status = displayVariant?.status || (product.quantity > 0 ? "inStock" : "outOfStock");
    const message = displayVariant?.message || (product.quantity > 0 ? "In-stock" : "No stock available");
    const inStock = displayVariant?.stock > 0 || product.quantity > 0;

    return {
        _id: product._id,
        name: product.name,
        brand: product.brand,
        variant: product.variant ?? null, // ⚡ Keep legacy field
        price,
        mrp,
        discountPercent,
        discountAmount: mrp - price,
        images: normalizeImages(product.images || []),
        shadeOptions,
        colorOptions,
        avgRating: product.avgRating || 0,
        totalRatings: product.commentsCount || 0,
        status,
        message,
        inStock,
        variants: variantsArray, // ✅ will only appear if variant/variants exist
        selectedVariant: null,
        category: categoryObj
            ? { _id: categoryObj._id, name: categoryObj.name, slug: categoryObj.slug }
            : null,
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
