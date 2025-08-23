// // controllers/promotionPublicController.js
// import Promotion from '../../models/Promotion.js';
// import Product from '../../models/Product.js';

// // Helper: compute discounted price if promo is discount type
// function applyPromoPrice(promo, product) {
//     if (promo.promotionType !== 'discount' || !promo.discountValue) {
//         return { price: product.price, mrp: product.mrp ?? product.price, discount: 0 };
//     }
//     const mrp = product.mrp ?? product.price;
//     let price = mrp;
//     if (promo.discountUnit === 'percent') {
//         price = Math.max(0, mrp - (mrp * promo.discountValue) / 100);
//     } else {
//         price = Math.max(0, mrp - promo.discountValue);
//     }
//     const discount = Math.max(0, mrp - price);
//     return { price: Math.round(price), mrp, discount: Math.round(discount) };
// }

// // GET /api/promotions/active  (public)
// export const getActivePromotionsForUsers = async (req, res) => {
//     try {
//         const now = new Date();
//         const promos = await Promotion.find({
//             status: 'active',
//             startDate: { $lte: now },
//             endDate: { $gte: now }
//         })
//             .select('campaignName headline subheadline gradientFrom gradientTo scope categories methods countdown promotionType discountUnit discountValue endDate banners')
//             .populate('categories', 'name slug')
//             .populate('methods', 'name slug price mrp images brand category');

//         // For each promo, choose up to 5 sample products to show in the carousel
//         const payload = await Promise.all(
//             promos.map(async (p) => {
//                 let products = [];
//                 if (p.scope === 'product' && p.methods?.length) {
//                     const ids = p.methods.map(m => m._id);
//                     products = await Product.find({ _id: { $in: ids } })
//                         .select('name slug price mrp images brand category')
//                         .limit(5);
//                 } else if (p.scope === 'category' && p.categories?.length) {
//                     const catIds = p.categories.map(c => c._id);
//                     products = await Product.find({ category: { $in: catIds } })
//                         .select('name slug price mrp images brand category')
//                         .sort({ createdAt: -1 })
//                         .limit(5);
//                 }

//                 // Map to UI shape + discounted price if applicable
//                 const productCards = products.map(prod => {
//                     const { price, mrp, discount } = applyPromoPrice(p, prod);
//                     return {
//                         _id: prod._id,
//                         name: prod.name,
//                         slug: prod.slug,
//                         image: prod.images?.[0] || '',
//                         price,
//                         mrp,
//                         discount
//                     };
//                 });

//                 return {
//                     _id: p._id,
//                     title: p.campaignName,
//                     headline: p.headline || p.campaignName,
//                     subheadline: p.subheadline || '',
//                     gradientFrom: p.gradientFrom,
//                     gradientTo: p.gradientTo,
//                     banner: p.banners?.[0] || null,
//                     endsAt: p.endDate,
//                     countdown: p.countdown,
//                     scope: p.scope,
//                     categories: p.categories?.map(c => ({ _id: c._id, name: c.name, slug: c.slug })) || [],
//                     link: `/offers/${p._id}`,    // Frontend route
//                     products: productCards
//                 };
//             })
//         );

//         res.json(payload);
//     } catch (e) {
//         res.status(500).json({ message: 'Failed to load active promotions', error: e.message });
//     }
// };

// // GET /api/promotions/:id/products  (public - full listing)
// export const getPromotionProducts = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const { page = 1, limit = 24, sort = 'popularity' } = req.query;
//         const promo = await Promotion.findById(id)
//             .populate('categories', '_id')
//             .populate('methods', '_id name');

//         if (!promo) return res.status(404).json({ message: 'Promotion not found' });

//         // Build product filter based on scope
//         const filter = {};
//         if (promo.scope === 'product' && promo.methods?.length) {
//             filter._id = { $in: promo.methods.map(m => m._id) };
//         } else if (promo.scope === 'category' && promo.categories?.length) {
//             filter.category = { $in: promo.categories.map(c => c._id) };
//         } else {
//             // fallback: nothing targeted
//             filter._id = { $in: [] };
//         }

//         // Sorting options
//         const sortMap = {
//             popularity: { sold: -1 },
//             newest: { createdAt: -1 },
//             price_asc: { price: 1 },
//             price_desc: { price: -1 }
//         };
//         const sortStage = sortMap[sort] || sortMap.popularity;

//         const skip = (Number(page) - 1) * Number(limit);
//         const [items, total] = await Promise.all([
//             Product.find(filter)
//                 .select('name slug price mrp images brand category')
//                 .sort(sortStage)
//                 .skip(skip)
//                 .limit(Number(limit)),
//             Product.countDocuments(filter)
//         ]);

//         // Apply promo price to each product
//         const products = items.map(prod => {
//             const { price, mrp, discount } = applyPromoPrice(promo, prod);
//             return {
//                 _id: prod._id,
//                 name: prod.name,
//                 slug: prod.slug,
//                 image: prod.images?.[0] || '',
//                 price,
//                 mrp,
//                 discount
//             };
//         });

//         res.json({
//             promotion: {
//                 _id: promo._id,
//                 title: promo.campaignName,
//                 headline: promo.headline || promo.campaignName,
//                 subheadline: promo.subheadline || '',
//                 gradientFrom: promo.gradientFrom,
//                 gradientTo: promo.gradientTo,
//                 endsAt: promo.endDate,
//                 countdown: promo.countdown,
//                 scope: promo.scope
//             },
//             products,
//             pagination: {
//                 page: Number(page),
//                 limit: Number(limit),
//                 total,
//                 pages: Math.ceil(total / Number(limit))
//             }
//         });
//     } catch (e) {
//         res.status(500).json({ message: 'Failed to load products for this promotion', error: e.message });
//     }
// };

// controllers/promotionController.js
import Promotion from '../../models/Promotion.js';
import Product from '../../models/Product.js';
import mongoose from 'mongoose';

// ✅ Helper to compute discounted price
function applyPromoPrice(promo, product) {
    const mrp = product.mrp ?? product.price; // fallback to price

    if (promo.promotionType !== 'discount' || !promo.discountValue) {
        return { price: product.price, mrp, discount: 0 };
    }

    let price = mrp;
    if (promo.discountUnit === 'percent') {
        price = Math.max(0, mrp - (mrp * promo.discountValue) / 100);
    } else {
        price = Math.max(0, mrp - promo.discountValue);
    }

    return {
        price: Math.round(price),
        mrp,
        discount: Math.max(0, mrp - price),
    };
}

/**
 * GET /api/promotions/active
    */
export const getActivePromotionsForUsers = async (req, res) => {
    try {
        const now = new Date();
        const promos = await Promotion.find({
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now },
        })
            .select("campaignName scope categories products discountUnit discountValue endDate")
            .populate("categories.category", "name slug")
            .populate("products", "name price images image");

        const payload = await Promise.all(
            promos.map(async (p) => {
                let products = [];

                if (p.scope === "product" && p.products?.length) {
                    products = await Product.find({ _id: { $in: p.products } })
                        .select("name price images image")
                        .limit(5);
                } else if (p.scope === "category" && p.categories?.length) {
                    const catIds = p.categories.map((c) => c.category?._id).filter(Boolean);

                    if (catIds.length) {
                        products = await Product.find({
                            $or: [
                                { category: { $in: catIds } },
                                { categoryHierarchy: { $in: catIds } },
                            ],
                        })
                            .select("name price images image")
                            .sort({ createdAt: -1 })
                            .limit(5);
                    }
                }

                // format products for frontend
                const productCards = products.map((prod) => {
                    let discountPercent = 0;
                    let discountPrice = prod.price;

                    if (p.discountUnit === "percent") {
                        discountPercent = p.discountValue;
                        discountPrice = prod.price - (prod.price * discountPercent) / 100;
                    } else if (p.discountUnit === "amount") {
                        discountPercent = Math.round((p.discountValue / prod.price) * 100);
                        discountPrice = prod.price - p.discountValue;
                    }

                    return {
                        _id: prod._id,
                        name: prod.name,
                        image: prod.images?.[0] || prod.image || "",
                        price: prod.price, // original price
                        discountPrice: discountPrice > 0 ? discountPrice : 0,
                        discountPercent,
                    };
                });

                return {
                    _id: p._id,
                    title: p.campaignName,
                    endsAt: p.endDate,
                    countdown: p.countdown,
                    products: productCards,
                };
            })
        );

        res.json(payload);
    } catch (e) {
        console.error("Error fetching active promotions:", e);
        res.status(500).json({
            message: "Failed to load active promotions",
            error: e.message,
        });
    }
};

/**
 * GET /api/promotions/:id/products?page=1&limit=24
 */
export const getPromotionProducts = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 24 } = req.query;

        const promo = await Promotion.findById(id)
            .populate('categories.category', '_id name slug')
            .populate('products', '_id name');

        if (!promo) {
            return res.status(404).json({ message: "Promotion not found" });
        }

        let filter = {};

        if (promo.scope === "category" && promo.categories?.length) {
            const catIds = promo.categories
                .map(c => c.category?._id)
                .filter(Boolean)
                .map(id => new mongoose.Types.ObjectId(id));

            filter.$or = [
                { category: { $in: catIds } },
                { categoryHierarchy: { $in: catIds } } // ✅ support hierarchy
            ];
        } else if (promo.scope === "product" && promo.products?.length) {
            filter._id = { $in: promo.products.map(p => new mongoose.Types.ObjectId(p._id)) };
        }

        const products = await Product.find(filter)
            .select('name price images brand category')
            .skip((page - 1) * limit)
            .limit(Number(limit));

        const total = await Product.countDocuments(filter);

        const productCards = products.map((prod) => {
            const { price, mrp, discount } = applyPromoPrice(promo, prod);
            return {
                _id: prod._id,
                name: prod.name,
                image: prod.images?.[0] || '',
                price,
                mrp,
                discount,
            };
        });

        res.json({
            promotion: {
                _id: promo._id,
                title: promo.campaignName || promo.title,
                headline: promo.headline || promo.campaignName,
                subheadline: promo.subheadline || '',
                endsAt: promo.endDate,
                countdown: promo.countdown,
                scope: promo.scope,
            },
            products: productCards,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (err) {
        console.error("Error fetching promotion products:", err);
        res.status(500).json({
            message: "Failed to fetch promotion products",
            error: err.message,
        });
    }
};
