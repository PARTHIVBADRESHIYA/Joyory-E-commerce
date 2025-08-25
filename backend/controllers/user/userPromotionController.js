// controllers/promotionController.js
import Promotion from '../../models/Promotion.js';
import Product from '../../models/Product.js';
import mongoose from 'mongoose';

/* ----------------------------- HELPERS ----------------------------- */

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

function escapeRegex(str = '') {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* --------------------------- CONTROLLERS --------------------------- */
/**
 * GET /api/promotions/active
 * Home page → list active promotions as cards (title, images, discount label, endDate, countdown)
 */
export const getActivePromotionsForUsers = async (req, res) => {
    try {
        const now = new Date();

        const promos = await Promotion.find({
            status: 'active',
            startDate: { $lte: now },
            endDate: { $gte: now },
        })
            .select('campaignName images discountUnit discountValue endDate promotionType') // add fields you actually store
            .lean();

        const payload = promos.map((p) => {
            // Prefer explicit, truthful labels on homepage cards
            let discountPercent = null;
            let discountAmount = null;
            let discountLabel = '';

            if (p.promotionType === 'discount' && p.discountValue) {
                if (p.discountUnit === 'percent') {
                    discountPercent = Number(p.discountValue) || 0;
                    discountLabel = `${discountPercent}% OFF`;
                } else {
                    discountAmount = Number(p.discountValue) || 0;
                    discountLabel = `₹${discountAmount} OFF`;
                    // If you MUST force percent for amount promos, you could estimate here,
                    // but it may be misleading. Better to keep amount label.
                }
            }

            return {
                _id: p._id,
                title: p.campaignName,
                images: p.images || '',
                // keep both; frontend can decide which to show
                discountPercent, // null when amount-based
                discountAmount,  // null when percent-based
                discountLabel,   // always set
                endDate: p.endDate,
                countdown: getCountdown(p.endDate),
            };
        });

        res.json(payload);
    } catch (e) {
        console.error('Error fetching active promotions:', e);
        res.status(500).json({ message: 'Failed to load active promotions' });
    }
};

/**
 * GET /api/promotions/:id/products
 * Query params:
 *  - page=1&limit=24
 *  - category=<csv of category ids>
 *  - brand=<csv of brand names or ids depending on your schema>
 *  - minPrice=100&maxPrice=5000
 *  - search=lipstick
 *  - sort=price_asc|price_desc|newest|discount
 *
 * Promo page → list products ONLY (preview), with filters & proper pagination.
 */
export const getPromotionProducts = async (req, res) => {
    try {
        const { id } = req.params;

        // --- Parse & sanitize query ---
        const page = Math.max(1, parseInt(req.query.page ?? '1', 10));
        const rawLimit = parseInt(req.query.limit ?? '24', 10);
        const limit = Math.min(Math.max(1, rawLimit), 60); // hard cap to prevent abuse

        const categoryParam = (req.query.category ?? '').toString().trim();
        const brandParam = (req.query.brand ?? '').toString().trim();
        const minPrice = req.query.minPrice ? Number(req.query.minPrice) : undefined;
        const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined;
        const search = (req.query.search ?? '').toString().trim();
        const sort = (req.query.sort ?? 'newest').toString().trim();

        const promo = await Promotion.findById(id)
            .populate('categories.category', '_id name slug')
            .populate('products', '_id name category')
            .lean();

        if (!promo) {
            return res.status(404).json({ message: 'Promotion not found' });
        }

        // --- Build base match from promo scope ---
        const baseOr = [];
        if (promo.scope === 'category' && Array.isArray(promo.categories) && promo.categories.length) {
            const catIds = promo.categories
                .map((c) => c?.category?._id)
                .filter(Boolean)
                .map((cid) => new mongoose.Types.ObjectId(cid));
            if (catIds.length) {
                baseOr.push({ category: { $in: catIds } });
                baseOr.push({ categoryHierarchy: { $in: catIds } });
            }
        } else if (promo.scope === 'product' && Array.isArray(promo.products) && promo.products.length) {
            const pids = promo.products.map((p) => new mongoose.Types.ObjectId(p._id));
            baseOr.push({ _id: { $in: pids } });
        }

        const match = {};
        if (baseOr.length) match.$or = baseOr;

        // --- Apply user filters ---
        if (categoryParam) {
            const catIds = categoryParam
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
                .map((s) => new mongoose.Types.ObjectId(s));
            match.category = { $in: catIds };
        }

        if (brandParam) {
            // If your schema stores brand as a string name:
            const brands = brandParam
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            if (brands.length) {
                match.brand = { $in: brands };
            }
            // If you store brand IDs, convert to ObjectIds instead.
        }

        if (typeof minPrice === 'number' || typeof maxPrice === 'number') {
            match.price = {};
            if (typeof minPrice === 'number') match.price.$gte = minPrice;
            if (typeof maxPrice === 'number') match.price.$lte = maxPrice;
        }

        if (search) {
            match.name = { $regex: escapeRegex(search), $options: 'i' };
        }

        // --- Aggregation to compute discount & sort correctly (esp. by discount) ---
        const promoIsPercent =
            promo.promotionType === 'discount' && promo.discountUnit === 'percent' && Number(promo.discountValue) > 0;
        const promoIsAmount =
            promo.promotionType === 'discount' && promo.discountUnit === 'amount' && Number(promo.discountValue) > 0;
        const promoValue = Number(promo.discountValue) || 0;

        // Compute fields server-side:
        // mrpEff = coalesce(mrp, price)
        // discountedPrice = based on promo settings (if not discount type, same as price/mrp)
        // discountAmount = mrpEff - discountedPrice
        // discountPercent = floor( (discountAmount / mrpEff) * 100 )
        const addFieldsStage = {
            $addFields: {
                mrpEff: { $ifNull: ['$mrp', '$price'] },
                discountedPrice: {
                    $let: {
                        vars: { mrpEff: { $ifNull: ['$mrp', '$price'] } },
                        in: promo.promotionType === 'discount'
                            ? (
                                promoIsPercent
                                    ? { $max: [0, { $subtract: ['$$mrpEff', { $divide: [{ $multiply: ['$$mrpEff', promoValue] }, 100] }] }] }
                                    : promoIsAmount
                                        ? { $max: [0, { $subtract: ['$$mrpEff', promoValue] }] }
                                        : '$price'
                            )
                            : '$price'
                    }
                },
            }
        };

        const addDiscountFieldsStage = {
            $addFields: {
                discountAmount: { $max: [0, { $subtract: ['$mrpEff', '$discountedPrice'] }] },
                discountPercent: {
                    $cond: [
                        { $gt: ['$mrpEff', 0] },
                        { $floor: { $multiply: [{ $divide: [{ $subtract: ['$mrpEff', '$discountedPrice'] }, '$mrpEff'] }, 100] } },
                        0
                    ]
                }
            }
        };

        // Sorting
        let sortStage = { $sort: { createdAt: -1, _id: 1 } }; // stable tiebreaker on _id
        if (sort === 'price_asc') sortStage = { $sort: { discountedPrice: 1, _id: 1 } };
        else if (sort === 'price_desc') sortStage = { $sort: { discountedPrice: -1, _id: 1 } };
        else if (sort === 'newest') sortStage = { $sort: { createdAt: -1, _id: 1 } };
        else if (sort === 'discount') sortStage = { $sort: { discountPercent: -1, discountAmount: -1, _id: 1 } };

        // Main pipeline
        const pipeline = [
            { $match: match },
            addFieldsStage,
            addDiscountFieldsStage,
            // project only what the card needs
            {
                $project: {
                    name: 1,
                    brand: 1,
                    imagess: 1,
                    mrp: '$mrpEff',
                    price: '$discountedPrice',
                    discount: '$discountAmount',
                    discountPercent: 1,
                    createdAt: 1,
                }
            },
            sortStage,
            {
                $facet: {
                    data: [
                        { $skip: (page - 1) * limit },
                        { $limit: limit }
                    ],
                    totalArr: [{ $count: 'count' }]
                }
            }
        ];

        const [aggResult] = await Product.aggregate(pipeline).collation({ locale: 'en', strength: 2 }); // case-insensitive sort for strings
        const products = (aggResult?.data ?? []).map((p) => ({
            _id: p._id,
            name: p.name,
            images: Array.isArray(p.imagess) && p.imagess.length ? p.imagess[0] : '',
            brand: p.brand || '',
            price: Math.round(p.price ?? 0),
            mrp: Math.round(p.mrp ?? 0),
            discount: Math.max(0, Math.round(p.discount ?? 0)),
            discountPercent: Math.max(0, Math.round(p.discountPercent ?? 0)),
        }));

        let total = aggResult?.totalArr?.[0]?.count ?? 0;

        // --- Fallback: if scope=product yields too few items, top up from related categories (max up to 15) ---
        if (products.length < 10 && promo.scope === 'product' && Array.isArray(promo.products) && promo.products.length) {
            const relatedCatIds = promo.products
                .map((p) => p?.category?._id)
                .filter(Boolean)
                .map((cid) => new mongoose.Types.ObjectId(cid));

            if (relatedCatIds.length) {
                const fallbackMatch = {
                    $or: [{ category: { $in: relatedCatIds } }, { categoryHierarchy: { $in: relatedCatIds } }]
                };

                const fallbackPipeline = [
                    { $match: fallbackMatch },
                    addFieldsStage,
                    addDiscountFieldsStage,
                    {
                        $project: {
                            name: 1, brand: 1, imagess: 1,
                            mrp: '$mrpEff', price: '$discountedPrice',
                            discount: '$discountAmount', discountPercent: 1, createdAt: 1,
                        }
                    },
                    { $sort: { createdAt: -1, _id: 1 } },
                    { $limit: Math.max(0, 15 - products.length) }
                ];

                const fallback = await Product.aggregate(fallbackPipeline).collation({ locale: 'en', strength: 2 });
                const mapped = fallback.map((p) => ({
                    _id: p._id,
                    name: p.name,
                    images: Array.isArray(p.imagess) && p.imagess.length ? p.imagess[0] : '',
                    brand: p.brand || '',
                    price: Math.round(p.price ?? 0),
                    mrp: Math.round(p.mrp ?? 0),
                    discount: Math.max(0, Math.round(p.discount ?? 0)),
                    discountPercent: Math.max(0, Math.round(p.discountPercent ?? 0)),
                }));

                products.push(...mapped);
                // Do not mutate `total` here; `total` reflects matched (not including fallback top-ups)
            }
        }

        res.json({
            products,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit) || 1,
            },
        });
    } catch (err) {
        console.error('Error fetching promotion products:', err);
        res.status(500).json({ message: 'Failed to fetch promotion products' });
    }
};
