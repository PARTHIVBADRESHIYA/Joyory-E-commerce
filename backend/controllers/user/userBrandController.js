
// // controllers/user/userBrandController.js
// import Product from "../../models/Product.js";
// import Category from "../../models/Category.js";
// import Brand from "../../models/Brand.js";
// import Promotion from "../../models/Promotion.js";
// import mongoose from "mongoose";
// // Assuming slugToRegex is a valid utility, keeping it for robustness,
// // but the main logic is now simplified.
// import { slugToRegex } from "../../middlewares/utils/slug.js";


// // --- HELPER: apply promotion pricing ---
// function applyPromoPrice(promo, product) {
//     const mrp = product.mrp ?? product.price;
//     if (!promo || promo.promotionType !== "discount" || !promo.discountValue) {
//         return { price: product.price, mrp, discount: 0, discountPercent: 0 };
//     }

//     let price = mrp;
//     if (promo.discountUnit === "percent") {
//         price = Math.max(0, mrp - (mrp * promo.discountValue) / 100);
//     } else {
//         price = Math.max(0, mrp - promo.discountValue);
//     }

//     return {
//         price: Math.round(price),
//         mrp,
//         discount: Math.max(0, mrp - price),
//         discountPercent: mrp > 0 ? Math.floor(((mrp - price) / mrp) * 100) : 0,
//     };
// }

// // --- HELPER: fetch active promotion for product ---
// async function getActivePromoForProduct(product) {
//     const now = new Date();
//     return await Promotion.findOne({
//         status: "active",
//         startDate: { $lte: now },
//         endDate: { $gte: now },
//         $or: [
//             { scope: "product", products: product._id },
//             { scope: "brand", brand: product.brand?._id || product.brand },
//             { scope: "category", "categories.category": product.category?._id || product.category },
//         ],
//     }).lean();
// }

// /**
//  * GET /api/brands
//  * Returns all active brands with product counts
//  */
// export const getAllBrands = async (req, res) => {
//     try {
//         const brands = await Brand.find({ isActive: true })
//             .select("_id name logo banner description slug")
//             .sort({ name: 1 })
//             .lean();

//         // Simplified aggregation to count products for each brand
//         // It now relies on the brand's ObjectId, as your migration ensures consistency.
//         const counts = await Product.aggregate([
//             {
//                 $match: {
//                     brand: { $in: brands.map(b => b._id) }
//                 }
//             },
//             { $group: { _id: "$brand", count: { $sum: 1 } } }
//         ]);

//         const countMap = {};
//         counts.forEach(c => {
//             countMap[c._id.toString()] = c.count;
//         });

//         const enriched = brands.map(b => ({
//             ...b,
//             count: countMap[b._id.toString()] || 0
//         }));

//         res.json(enriched);
//     } catch (err) {
//         console.error("🔥 Error in getAllBrands:", err);
//         res.status(500).json({ message: "Failed to fetch brands", error: err.message });
//     }
// };

// export const getBrandCategoryProducts = async (req, res) => {
//     try {
//         const { brandSlug, categorySlug } = req.params;
//         const page = parseInt(req.query.page) || 1;
//         const perPage = parseInt(req.query.limit) || 12;

//         // 1. Find brand
//         const brand = await Brand.findOne({ slug: brandSlug, isActive: true }).lean();
//         if (!brand) return res.status(404).json({ message: "Brand not found" });

//         // 2. Find category
//         const category = await Category.findOne({ slug: categorySlug, isActive: true }).lean();
//         if (!category) return res.status(404).json({ message: "Category not found" });

//         // 3. Count total products
//         const total = await Product.countDocuments({ brand: brand._id, category: category._id });

//         // 4. Fetch paginated products
//         const products = await Product.find({ brand: brand._id, category: category._id })
//             .select("_id name slug price mrp images summary description avgRating totalRatings status colorOptions shadeOptions commentsCount category brand")
//             .populate("category", "name slug")
//             .populate("brand", "name logo")
//             .skip((page - 1) * perPage)
//             .limit(perPage)
//             .lean();

//         // 5. Build categoryMap for safety
//         const categoryMap = new Map();
//         categoryMap.set(String(category._id), { _id: category._id, name: category.name, slug: category.slug });

//         // 6. Map into cards format
//         const cards = products.map(p => ({
//             _id: p._id,
//             name: p.name,
//             variant: p.variant,
//             price: p.price,
//             brand: p.brand ? { name: p.brand.name, logo: p.brand.logo } : null,
//             category: mongoose.Types.ObjectId.isValid(p.category?._id)
//                 ? categoryMap.get(String(p.category._id)) || null
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

//         // 7. Pagination meta
//         const totalPages = Math.ceil(total / perPage);

//         // 8. Final response
//         res.status(200).json({
//             brand: { name: brand.name, logo: brand.logo },
//             category: { _id: category._id, name: category.name, slug: category.slug },
//             products: cards,
//             total,
//             currentPage: page,
//             totalPages,
//             hasMore: page < totalPages,
//             nextPage: page < totalPages ? page + 1 : null,
//             prevPage: page > 1 ? page - 1 : null
//         });

//     } catch (err) {
//         console.error("🔥 Error in getBrandCategoryProducts:", err);
//         res.status(500).json({
//             message: "Failed to fetch category products",
//             error: err.message
//         });
//     }
// };



// export const getBrandLanding = async (req, res) => {
//     try {
//         const { brandSlug } = req.params;
//         const page = parseInt(req.query.page) || 1;
//         const perPage = parseInt(req.query.limit) || 10;

//         // 1. Find brand by slug
//         const brand = await Brand.findOne({ slug: brandSlug, isActive: true })
//             .select("banner")
//             .lean();

//         if (!brand) {
//             return res.status(404).json({ message: "Brand not found" });
//         }

//         // 2. Count products for pagination
//         const total = await Product.countDocuments({ brand: brand._id });

//         // 3. Fetch paginated products
//         const rawProducts = await Product.find({ brand: brand._id })
//             .select("_id name slug price mrp images summary description avgRating totalRatings category brand variant status colorOptions shadeOptions commentsCount")
//             .populate("category", "name slug")
//             .populate("brand", "name logo")
//             .skip((page - 1) * perPage)
//             .limit(perPage)
//             .lean();

//         // 4. Build category map for safe lookup
//         const categoryMap = new Map();
//         rawProducts.forEach(p => {
//             if (p.category && mongoose.Types.ObjectId.isValid(p.category._id)) {
//                 categoryMap.set(String(p.category._id), {
//                     _id: p.category._id,
//                     name: p.category.name,
//                     slug: p.category.slug
//                 });
//             }
//         });

//         // 5. Transform products into cards
//         const cards = rawProducts.map(p => ({
//             _id: p._id,
//             name: p.name,
//             variant: p.variant,
//             price: p.price,
//             brand: p.brand ? { _id: p.brand._id, name: p.brand.name, logo: p.brand.logo } : null,
//             category: mongoose.Types.ObjectId.isValid(p.category?._id)
//                 ? categoryMap.get(String(p.category._id)) || null
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

//         // 6. Fetch unique categories
//         const uniqueCategoryIds = await Product.distinct("category", { brand: brand._id });
//         const categories = await Category.find({ _id: { $in: uniqueCategoryIds }, isActive: true })
//             .select("name slug")
//             .lean();

//         // 7. Related products if less than 5
//         let relatedProducts = [];
//         if (cards.length < 5 && uniqueCategoryIds.length > 0) {
//             const rawRelated = await Product.find({
//                 category: { $in: uniqueCategoryIds },
//                 brand: { $ne: brand._id }
//             })
//                 .select("_id name slug price mrp images summary description avgRating totalRatings category brand variant status colorOptions shadeOptions commentsCount")
//                 .populate("category", "name slug")
//                 .populate("brand", "name logo")
//                 .limit(10)
//                 .lean();

//             relatedProducts = rawRelated.map(p => ({
//                 _id: p._id,
//                 name: p.name,
//                 variant: p.variant,
//                 price: p.price,
//                 brand: p.brand ? { _id: p.brand._id, name: p.brand.name, logo: p.brand.logo } : null,
//                 category: mongoose.Types.ObjectId.isValid(p.category?._id)
//                     ? { _id: p.category._id, name: p.category.name, slug: p.category.slug }
//                     : null,
//                 summary: p.summary || p.description?.slice(0, 100) || '',
//                 status: p.status,
//                 image: p.images?.length > 0
//                     ? (p.images[0].startsWith('http') ? p.images[0] : `${process.env.BASE_URL}/${p.images[0]}`)
//                     : null,
//                 colorOptions: p.colorOptions || [],
//                 shadeOptions: p.shadeOptions || [],
//                 commentsCount: p.commentsCount || 0,
//                 avgRating: p.avgRating || 0
//             }));
//         }

//         // 8. Pagination metadata
//         const totalPages = Math.ceil(total / perPage);

//         res.status(200).json({
//             brandBanner: brand.banner || null,
//             products: cards,
//             categories,
//             relatedProducts,
//             total,
//             currentPage: page,
//             totalPages,
//             hasMore: page < totalPages,
//             nextPage: page < totalPages ? page + 1 : null,
//             prevPage: page > 1 ? page - 1 : null
//         });
//     } catch (err) {
//         console.error("🔥 Error in getBrandLanding:", err);
//         res.status(500).json({
//             message: "Failed to fetch brand details",
//             error: err.message
//         });
//     }
// };


























// controllers/user/userBrandController.js
import Product from "../../models/Product.js";
import Category from "../../models/Category.js";
import Brand from "../../models/Brand.js";
import Promotion from "../../models/Promotion.js";
import mongoose from "mongoose";
import { slugToRegex } from "../../middlewares/utils/slug.js";


// --- HELPER: apply promotion pricing ---
function applyPromoPrice(promo, product) {
    const mrp = product.mrp ?? product.price;
    if (!promo || promo.promotionType !== "discount" || !promo.discountValue) {
        return { price: product.price, mrp, discount: 0, discountPercent: 0 };
    }

    let price = mrp;
    if (promo.discountUnit === "percent") {
        price = Math.max(0, mrp - (mrp * promo.discountValue) / 100);
    } else {
        price = Math.max(0, mrp - promo.discountValue);
    }

    return {
        price: Math.round(price),
        mrp,
        discount: Math.max(0, mrp - price),
        discountPercent: mrp > 0 ? Math.floor(((mrp - price) / mrp) * 100) : 0,
    };
}

// --- HELPER: fetch active promotion for product ---
async function getActivePromoForProduct(product) {
    const now = new Date();
    return await Promotion.findOne({
        status: "active",
        startDate: { $lte: now },
        endDate: { $gte: now },
        $or: [
            { scope: "product", products: product._id },
            { scope: "brand", brand: product.brand?._id || product.brand },
            { scope: "category", "categories.category": product.category?._id || product.category },
        ],
    }).lean();
}


/**
 * GET /api/brands
 * Returns all active brands with product counts
 */
export const getAllBrands = async (req, res) => {
    try {
        const brands = await Brand.find({ isActive: true })
            .select("_id name logo banner description slug")
            .sort({ name: 1 })
            .lean();

        const counts = await Product.aggregate([
            {
                $match: {
                    brand: { $in: brands.map(b => b._id) }
                }
            },
            { $group: { _id: "$brand", count: { $sum: 1 } } }
        ]);

        const countMap = {};
        counts.forEach(c => {
            countMap[c._id.toString()] = c.count;
        });

        const enriched = brands.map(b => ({
            ...b,
            count: countMap[b._id.toString()] || 0
        }));

        res.json(enriched);
    } catch (err) {
        console.error("🔥 Error in getAllBrands:", err);
        res.status(500).json({ message: "Failed to fetch brands", error: err.message });
    }
};


/**
 * GET /api/brands/:brandSlug/:categorySlug
 * Brand + Category specific products (with promo pricing + pagination)
 */
export const getBrandCategoryProducts = async (req, res) => {
    try {
        const { brandSlug, categorySlug } = req.params;
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.limit) || 12;

        const brand = await Brand.findOne({ slug: brandSlug, isActive: true }).lean();
        if (!brand) return res.status(404).json({ message: "Brand not found" });

        const category = await Category.findOne({ slug: categorySlug, isActive: true }).lean();
        if (!category) return res.status(404).json({ message: "Category not found" });

        const total = await Product.countDocuments({ brand: brand._id, category: category._id });

        const products = await Product.find({ brand: brand._id, category: category._id })
            .select("_id name slug price mrp images summary description avgRating totalRatings status colorOptions shadeOptions commentsCount category brand variant")
            .populate("category", "name slug")
            .populate("brand", "name logo")
            .skip((page - 1) * perPage)
            .limit(perPage)
            .lean();

        const categoryMap = new Map();
        categoryMap.set(String(category._id), { _id: category._id, name: category.name, slug: category.slug });

        const cards = await Promise.all(products.map(async (p) => {
            const promo = await getActivePromoForProduct(p);
            const pricing = applyPromoPrice(promo, p);

            return {
                _id: p._id,
                name: p.name,
                variant: p.variant,
                price: pricing.price,
                mrp: pricing.mrp,
                discount: pricing.discount,
                discountPercent: pricing.discountPercent,
                brand: p.brand ? { name: p.brand.name, logo: p.brand.logo } : null,
                category: mongoose.Types.ObjectId.isValid(p.category?._id)
                    ? categoryMap.get(String(p.category._id)) || null
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
            };
        }));

        const totalPages = Math.ceil(total / perPage);

        res.status(200).json({
            brand: { name: brand.name, logo: brand.logo },
            category: { _id: category._id, name: category.name, slug: category.slug },
            products: cards,
            total,
            currentPage: page,
            totalPages,
            hasMore: page < totalPages,
            nextPage: page < totalPages ? page + 1 : null,
            prevPage: page > 1 ? page - 1 : null
        });

    } catch (err) {
        console.error("🔥 Error in getBrandCategoryProducts:", err);
        res.status(500).json({
            message: "Failed to fetch category products",
            error: err.message
        });
    }
};


/**
 * GET /api/brands/:brandSlug
 * Brand Landing Page (with promo pricing + pagination)
 */
export const getBrandLanding = async (req, res) => {
    try {
        const { brandSlug } = req.params;
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.limit) || 10;

        const brand = await Brand.findOne({ slug: brandSlug, isActive: true })
            .select("banner name logo")
            .lean();

        if (!brand) {
            return res.status(404).json({ message: "Brand not found" });
        }

        const total = await Product.countDocuments({ brand: brand._id });

        const rawProducts = await Product.find({ brand: brand._id })
            .select("_id name slug price mrp images summary description avgRating totalRatings category brand variant status colorOptions shadeOptions commentsCount")
            .populate("category", "name slug")
            .populate("brand", "name logo")
            .skip((page - 1) * perPage)
            .limit(perPage)
            .lean();

        const categoryMap = new Map();
        rawProducts.forEach(p => {
            if (p.category && mongoose.Types.ObjectId.isValid(p.category._id)) {
                categoryMap.set(String(p.category._id), {
                    _id: p.category._id,
                    name: p.category.name,
                    slug: p.category.slug
                });
            }
        });

        const cards = await Promise.all(rawProducts.map(async (p) => {
            const promo = await getActivePromoForProduct(p);
            const pricing = applyPromoPrice(promo, p);

            return {
                _id: p._id,
                name: p.name,
                variant: p.variant,
                price: pricing.price,
                mrp: pricing.mrp,
                discount: pricing.discount,
                discountPercent: pricing.discountPercent,
                brand: p.brand ? { _id: p.brand._id, name: p.brand.name, logo: p.brand.logo } : null,
                category: mongoose.Types.ObjectId.isValid(p.category?._id)
                    ? categoryMap.get(String(p.category._id)) || null
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
            };
        }));

        const uniqueCategoryIds = await Product.distinct("category", { brand: brand._id });
        const categories = await Category.find({ _id: { $in: uniqueCategoryIds }, isActive: true })
            .select("name slug")
            .lean();

        let relatedProducts = [];
        if (cards.length < 5 && uniqueCategoryIds.length > 0) {
            const rawRelated = await Product.find({
                category: { $in: uniqueCategoryIds },
                brand: { $ne: brand._id }
            })
                .select("_id name slug price mrp images summary description avgRating totalRatings category brand variant status colorOptions shadeOptions commentsCount")
                .populate("category", "name slug")
                .populate("brand", "name logo")
                .limit(10)
                .lean();

            relatedProducts = await Promise.all(rawRelated.map(async (p) => {
                const promo = await getActivePromoForProduct(p);
                const pricing = applyPromoPrice(promo, p);

                return {
                    _id: p._id,
                    name: p.name,
                    variant: p.variant,
                    price: pricing.price,
                    mrp: pricing.mrp,
                    discount: pricing.discount,
                    discountPercent: pricing.discountPercent,
                    brand: p.brand ? { _id: p.brand._id, name: p.brand.name, logo: p.brand.logo } : null,
                    category: mongoose.Types.ObjectId.isValid(p.category?._id)
                        ? { _id: p.category._id, name: p.category.name, slug: p.category.slug }
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
                };
            }));
        }

        const totalPages = Math.ceil(total / perPage);

        res.status(200).json({
            brandBanner: brand.banner || null,
            products: cards,
            categories,
            relatedProducts,
            total,
            currentPage: page,
            totalPages,
            hasMore: page < totalPages,
            nextPage: page < totalPages ? page + 1 : null,
            prevPage: page > 1 ? page - 1 : null
        });
    } catch (err) {
        console.error("🔥 Error in getBrandLanding:", err);
        res.status(500).json({
            message: "Failed to fetch brand details",
            error: err.message
        });
    }
};
