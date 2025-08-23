// controllers/promotionController.js
import Promotion from '../../models/Promotion.js';
import Product from '../../models/Product.js';
import mongoose from 'mongoose';

/* ----------------------------- HELPERS ----------------------------- */

/**
 * Compute discounted price
 */
function applyPromoPrice(promo, product) {
    const mrp = product.mrp ?? product.price;

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
        discount: Math.max(0, mrp - price)
    };
}

/**
 * Compute countdown based on end date
 */
function getCountdown(endDate) {
    const now = new Date();
    const end = new Date(endDate);
    const diff = end - now;

    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };

    return {
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000)
    };
}

/**
 * Format product for frontend cards
 */
function formatProductCard(promo, prod) {
    const { price, mrp, discount } = applyPromoPrice(promo, prod);
    return {
        _id: prod._id,
        name: prod.name,
        slug: prod.slug,
        image: prod.images?.[0] || '',
        price,
        mrp,
        discount
    };
}

/* --------------------------- CONTROLLERS --------------------------- */

/**
 * GET /api/promotions/active
 * Homepage → list active promotions with top products
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
 * Promotion detail page → list all products with pagination
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

