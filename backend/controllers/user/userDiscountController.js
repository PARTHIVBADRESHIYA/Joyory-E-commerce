// controllers/user/discountController.js
import mongoose from 'mongoose';
import Discount from '../../models/Discount.js';
import Product from '../../models/Product.js';
import Order from '../../models/Order.js';
import Category from '../../models/Category.js';
import Brand from '../../models/Brand.js';
import { getCache, setCache, clearCache } from '../../middlewares/utils/simpleCache.js';
import { getRedis } from '../../middlewares/utils/redis.js';
import { enrichProductsUnified } from "../../middlewares/services/productHelpers.js";
import Promotion from '../../models/Promotion.js';
/* ------------------------- Constants ------------------------- */
const ELIGIBLE_CACHE_TTL_MS = 30 * 1000; // 30 seconds

/* ------------------------- Helpers ------------------------- */

export function isActive(discount) {
    const now = new Date();
    if (!discount) return false;
    // Keep casing consistent with your DB ('Active')
    if (String(discount.status) !== 'Active') return false;
    if (discount.startDate && discount.startDate > now) return false;
    if (discount.endDate && discount.endDate < now) return false;
    if (
        typeof discount.totalLimit === 'number' &&
        typeof discount.usageCount === 'number' &&
        discount.totalLimit >= 0 &&
        discount.usageCount >= discount.totalLimit
    ) {
        return false;
    }
    return true;
}

export async function isUserNew(userId) {
    const paidOrders = await Order.countDocuments({
        user: userId,
        paid: true,
        paymentStatus: "success"
    });

    return paidOrders === 0;
}

export async function computeUserFlags(user) {
    if (!user?._id) {
        return {
            isLoggedIn: false,
            isNewUser: false
        };
    }

    const paidOrders = await Order.countDocuments({
        user: user._id,
        paid: true,
        paymentStatus: "success"
    });

    return {
        isLoggedIn: true,
        isNewUser: paidOrders === 0
    };
}

export function isUserEligible(discount, userFlags) {
    if (!discount?.eligibility || discount.eligibility === 'All') return true;

    if (discount.eligibility === 'New Users') {
        return userFlags.isLoggedIn && userFlags.isNewUser;
    }

    if (discount.eligibility === 'Existing Users') {
        return userFlags.isLoggedIn && !userFlags.isNewUser;
    }

    return true;
}


export function pickCartProducts(products, cart) {
    const byId = new Map(products.map(p => [String(p._id), p]));
    return cart
        .map(line => {
            if (!line || !line.productId) return null;
            const prod = byId.get(String(line.productId));
            if (!prod) return null;
            const qty = Math.max(1, Number(line.qty || 1));
            const unitPrice = Number(prod.price ?? 0);
            return {
                productId: String(prod._id),
                qty,
                unitPrice,
                brandId: String(prod.brand?._id || prod.brand || ''),
                categoryId: String(prod.category?._id || prod.category || ''),
                lineSubtotal: Math.round(unitPrice * qty)
            };
        })
        .filter(Boolean);
}

export function cartSubtotal(lines) {
    return lines.reduce((s, l) => s + (l.lineSubtotal || 0), 0);
}

export function applicableLines(discount, lines) {
    const scope = discount?.appliesTo?.type || 'Entire Order';
    if (scope === 'Entire Order') return lines;
    if (!discount?.appliesTo) return [];
    if (scope === 'Product') {
        const set = new Set((discount.appliesTo.productIds || []).map(String));
        return lines.filter(l => set.has(String(l.productId)));
    }
    if (scope === 'Category') {
        const set = new Set((discount.appliesTo.categoryIds || []).map(String));
        return lines.filter(l => set.has(String(l.categoryId)));
    }
    if (scope === 'Brand') {
        const set = new Set((discount.appliesTo.brandIds || []).map(String));
        return lines.filter(l => set.has(String(l.brandId)));
    }
    return [];
}

export function computeDiscountAmount(discount, lines) {
    const scopeLines = applicableLines(discount, lines);
    if (!scopeLines.length) return 0;
    const applicableSubtotal = scopeLines.reduce((s, l) => s + (l.lineSubtotal || 0), 0);
    if (discount.minimumOrderAmount && applicableSubtotal < discount.minimumOrderAmount) return 0;
    const value = Number(discount.value || 0);
    if (value <= 0) return 0;
    if (discount.type === 'Percentage') {
        return Math.floor((applicableSubtotal * value) / 100);
    }
    return Math.min(value, applicableSubtotal); // Flat capped by subtotal
}


export const computeEligibleDiscountsForCart = async (cart, user) => {
    if (!Array.isArray(cart) || !cart.length) return { discounts: [], subtotal: 0 };

    const products = await fetchProductsForCart(cart);
    const lines = pickCartProducts(products, cart);
    if (!lines.length) return { discounts: [], subtotal: 0 };

    const subtotal = cartSubtotal(lines);
    const cacheKey = `eligibleDiscounts:${String(user?._id || 'guest')}:sub${Math.round(subtotal)}:n${lines.length}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    const all = await Discount.find(activeDiscountQuery()).lean();
    const payload = [];

    const userFlags = await computeUserFlags(user);

    for (const d of all) {
        try {
            if (!isUserEligible(d, userFlags)) continue;
            if (d.perCustomerLimit && user && user._id) {
                const used = await Order.countDocuments({ user: user._id, discountCode: d.code });
                if (used >= d.perCustomerLimit) continue;
            }
            const priced = priceCartWithCode(d, lines);
            if (!priced || priced.discountAmount <= 0) continue;

            payload.push({
                code: d.code,
                label: d.name,
                type: d.type,
                value: d.value,
                appliesTo: d.appliesTo?.type || 'Entire Order',
                minOrder: d.minimumOrderAmount || 0,
                expiresOn: d.endDate || null,
                estimatedSavings: priced.discountAmount,
                finalTotal: priced.total
            });
        } catch (innerErr) {
            console.warn('discount evaluation warning', d?.code, innerErr?.message || innerErr);
            continue;
        }
    }

    payload.sort((a, b) => (b.estimatedSavings || 0) - (a.estimatedSavings || 0));
    const responseData = { discounts: payload, subtotal };
    setCache(cacheKey, responseData, ELIGIBLE_CACHE_TTL_MS);
    return responseData;
};


/** Price cart with a discount document (doesn't modify DB) */
export function priceCartWithCode(discountDoc, lines) {
    const subtotal = cartSubtotal(lines);
    if (!discountDoc) {
        return { code: null, subtotal, discountAmount: 0, total: subtotal };
    }
    if (!isActive(discountDoc)) {
        return { code: discountDoc.code, subtotal, discountAmount: 0, total: subtotal };
    }
    const discountAmount = computeDiscountAmount(discountDoc, lines);
    const total = Math.max(0, subtotal - discountAmount);
    return { code: discountDoc.code, subtotal, discountAmount, total };
}

/* ------------------------- DB helpers ------------------------- */

export async function fetchProductsForCart(cart) {
    if (!Array.isArray(cart) || !cart.length) return [];
    const ids = cart
        .map(c => c.productId)
        .filter(Boolean)
        .map(id => {
            try { return new mongoose.Types.ObjectId(id); } catch { return null; }
        })
        .filter(Boolean);
    if (!ids.length) return [];
    return Product.find({ _id: { $in: ids } })
        .select('_id price brand category images name')
        .populate('brand', '_id')
        .populate('category', '_id')
        .lean();
}

function activeDiscountQuery() {
    const now = new Date();
    return {
        status: 'Active',
        startDate: { $lte: now },
        endDate: { $gte: now },
        $or: [
            { totalLimit: { $exists: false } },
            { totalLimit: null },
            { $expr: { $lt: ['$usageCount', '$totalLimit'] } }
        ]
    };
}

/* ------------------------- Core controller helpers ------------------------- */

/**
 * Internal validation helper for preview/summary.
 * Returns { priced, discount } or throws Error with explanation.
 */
export async function validateDiscountForCartInternal({ code, cart, userId }) {
    if (!code) throw new Error('code required');
    if (!Array.isArray(cart) || !cart.length) throw new Error('cart required');

    const discount = await Discount.findOne({ code: code.trim() }).lean();
    if (!discount) throw new Error('Invalid discount code');

    if (!isActive(discount)) throw new Error('This discount is not active');

    const userFlags = await computeUserFlags({ _id: userId });

    if (!isUserEligible(discount, userFlags)) {
        throw new Error('This coupon is not applicable for your account');
    }

    // per-customer usage check
    if (discount.perCustomerLimit && userId) {
        const usedByCustomer = await Order.countDocuments({ user: userId, discountCode: discount.code });
        if (usedByCustomer >= discount.perCustomerLimit) throw new Error('Per-customer usage limit reached for this code');
    }

    // compute priced using live DB prices
    const products = await fetchProductsForCart(cart);
    const lines = pickCartProducts(products, cart);
    if (!lines.length) throw new Error('No valid products in cart');

    const priced = priceCartWithCode(discount, lines);
    if (!priced || priced.discountAmount <= 0) throw new Error('Discount does not apply to this cart');

    return { priced, discount };
}

/* ------------------------- Public controllers ------------------------- */

/** Get eligible discounts for a cart (list) */
export const getEligibleDiscountsForCart = async (req, res) => {
    try {
        const cart = Array.isArray(req.body.cart) ? req.body.cart : [];
        if (!cart.length) return res.status(400).json({ message: 'Cart is empty' });

        const products = await fetchProductsForCart(cart);
        const lines = pickCartProducts(products, cart);
        if (!lines.length) return res.status(400).json({ message: 'No valid products in cart' });

        const subtotal = cartSubtotal(lines);
        const user = req.user || null;
        const userFlags = await computeUserFlags(user);

        const cacheKey = `eligibleDiscounts:${String(user?._id || 'guest')}:sub${Math.round(subtotal)}:n${lines.length}`;

        const cached = getCache(cacheKey);
        if (cached) return res.json({ fromCache: true, ...cached });

        const all = await Discount.find(activeDiscountQuery()).lean();
        const payload = [];

        for (const d of all) {
            try {
                if (!isUserEligible(d, userFlags)) continue;
                if (d.perCustomerLimit && user && user._id) {
                    const used = await Order.countDocuments({ user: user._id, discountCode: d.code });
                    if (used >= d.perCustomerLimit) continue;
                }
                const priced = priceCartWithCode(d, lines);
                if (!priced || priced.discountAmount <= 0) continue;
                payload.push({
                    code: d.code,
                    label: d.name,
                    description: d.description,
                    type: d.type,
                    value: d.value,
                    appliesTo: d.appliesTo?.type || 'Entire Order',
                    minOrder: d.minimumOrderAmount || 0,
                    expiresOn: d.endDate || null,
                    estimatedSavings: priced.discountAmount,
                    finalTotal: priced.total
                });
            } catch (innerErr) {
                console.warn('discount evaluation warning', d?.code, innerErr?.message || innerErr);
                continue;
            }
        }

        payload.sort((a, b) => (b.estimatedSavings || 0) - (a.estimatedSavings || 0));
        const responseData = { discounts: payload, subtotal };
        setCache(cacheKey, responseData, ELIGIBLE_CACHE_TTL_MS);
        return res.json({ fromCache: false, ...responseData });
    } catch (err) {
        console.error('getEligibleDiscountsForCart error:', err);
        return res.status(500).json({ message: 'Failed to load eligible discounts' });
    }
};

/** express wrapper that uses the internal helper */
export const validateDiscountForCart = async (req, res) => {
    try {
        const { code } = req.body;
        const cart = Array.isArray(req.body.cart) ? req.body.cart : [];
        const userId = req.user?._id || null;
        const result = await validateDiscountForCartInternal({ code, cart, userId });
        // result.priced contains subtotal, discountAmount, total
        return res.json(result.priced);
    } catch (err) {
        const msg = err?.message || 'Failed to validate discount';
        return res.status(400).json({ message: msg });
    }
};

/* ------------------------- Order-time reservation ------------------------- */

export async function reserveDiscountUsage({ code, userId, cart }) {
    if (!code) throw new Error('code required');
    if (!Array.isArray(cart) || !cart.length) throw new Error('cart required');

    // re-fetch discount fresh
    const discount = await Discount.findOne({ code: code.trim() }).lean();
    if (!discount) throw new Error('Invalid discount code');
    if (!isActive(discount)) throw new Error('This discount is not active');

    const userFlags = await computeUserFlags({ _id: userId });

    if (!isUserEligible(discount, userFlags)) {
        throw new Error('Coupon eligibility failed');
    }

    if (discount.perCustomerLimit && userId) {
        const usedByCustomer = await Order.countDocuments({ user: userId, discountCode: discount.code });
        if (usedByCustomer >= discount.perCustomerLimit) throw new Error('Per-customer usage limit reached for this code');
    }

    const products = await fetchProductsForCart(cart);
    const lines = pickCartProducts(products, cart);
    if (!lines.length) throw new Error('No valid products in cart');

    const priced = priceCartWithCode(discount, lines);
    if (!priced || priced.discountAmount <= 0) throw new Error('Discount does not apply to this order');

    // atomic increment using conditional query if totalLimit present
    const query = { code: discount.code, status: 'Active', startDate: { $lte: new Date() }, endDate: { $gte: new Date() } };
    if (typeof discount.totalLimit === 'number') {
        query.$expr = { $lt: ['$usageCount', discount.totalLimit] };
    }

    const updated = await Discount.findOneAndUpdate(query, { $inc: { usageCount: 1 } }, { new: true }).lean();
    if (!updated) throw new Error('Discount not available any more (limit reached)');

    // Try to clear cache keys for the user (best-effort)
    try {
        const userKey = `eligibleDiscounts:${String(userId || 'guest')}:sub${Math.round(priced.subtotal)}:n${lines.length}`;
        clearCache(userKey);
    } catch (e) { /* ignore */ }

    return { success: true, discount: updated, priced };
}


export const getDiscountProducts = async (req, res) => {
    try {
        const { discountId } = req.params;
        const redis = getRedis();

        if (!mongoose.isValidObjectId(discountId)) {
            return res.status(400).json({ success: false, message: "Invalid discountId" });
        }

        const discount = await Discount.findById(discountId).lean();
        if (!discount) {
            return res.status(404).json({ success: false, message: "Discount not found" });
        }

        // -----------------------------------------------------
        // ⚠ If Entire Order → return ZERO products (as required)
        // -----------------------------------------------------
        if (discount.appliesTo?.type === "Entire Order") {
            return res.json({
                success: true,
                discountId,
                products: [],
                totalCount: 0,
                totalPages: 0,
                currentPage: 1,

            });
        }

        // -----------------------------
        // Query + Cache Key
        // -----------------------------
        const redisKey = `disc:v2:${discountId}:${JSON.stringify(req.query)}`;
        const cached = await redis.get(redisKey);
        if (cached) return res.json(JSON.parse(cached));

        let {
            page = 1,
            limit = 12,
            sort = "recent",
            priceMin,
            priceMax,
            rating,
            inStock,
            ...extraFilters
        } = req.query;

        page = Number(page);
        limit = Number(limit);

        // -----------------------------
        // Base Discount Scope
        // -----------------------------
        const scopeFilter = {};
        const applies = discount.appliesTo?.type;

        if (applies === "Product") {
            scopeFilter._id = {
                $in: (discount.appliesTo.productIds || []).map(id => new mongoose.Types.ObjectId(id))
            };
        }

        if (applies === "Category") {
            scopeFilter.category = { $in: discount.appliesTo.categoryIds || [] };
        }

        if (applies === "Brand") {
            scopeFilter.brand = { $in: discount.appliesTo.brandIds || [] };
        }

        // -----------------------------
        // Extra Filters
        // -----------------------------
        if (priceMin) scopeFilter.price = { ...scopeFilter.price, $gte: Number(priceMin) };
        if (priceMax) scopeFilter.price = { ...scopeFilter.price, $lte: Number(priceMax) };
        if (rating) scopeFilter.rating = { $gte: Number(rating) };
        if (inStock === "true") scopeFilter.stock = { $gt: 0 };

        // Variant filters
        for (const [key, val] of Object.entries(extraFilters)) {
            if (val) {
                scopeFilter[`attributes.${key}`] = val;
            }
        }

        // -----------------------------
        // Sorting
        // -----------------------------
        const sortStage = {};
        switch (sort) {
            case "low-high":
                sortStage.price = 1;
                break;
            case "high-low":
                sortStage.price = -1;
                break;
            case "discount":
                sortStage.discountPercentage = -1;
                break;
            case "popularity":
                sortStage.popularity = -1;
                break;
            default:
                sortStage.createdAt = -1;
        }

        // -----------------------------
        // Fetch Products
        // -----------------------------
        const totalCount = await Product.countDocuments(scopeFilter);

        const products = await Product.find(scopeFilter)
            .select("name slugs price discountedPrice minPrice maxPrice brand category variants avgRating images stock shortDescription")
            .populate("brand", "name slug")
            .populate("category", "name slug")
            .sort(sortStage)
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        // -----------------------------------------------------
        // 🔥 Fetch Active Promotions (use same cache as Category API)
        // -----------------------------------------------------
        let promotions = await redis.get("active_promotions");
        if (!promotions) {
            promotions = await Promotion.find({
                status: "active",
                startDate: { $lte: new Date() },
                endDate: { $gte: new Date() }
            }).lean();

            await redis.set("active_promotions", JSON.stringify(promotions), "EX", 120);
        } else {
            promotions = JSON.parse(promotions);
        }

        // -----------------------------------------------------
        // 🔥 Unified Enrichment (same as Category API)
        // BUT inject forced discountOverride so discount always applies
        // -----------------------------------------------------
        const discountOverride = {
            type: discount.type,
            value: discount.value,
            code: discount.code,
            priority: 9999 // ensures discount supersedes promotions if needed
        };

        const enriched = await enrichProductsUnified(products, promotions, discountOverride);

        // -----------------------------
        // Sidebar
        // -----------------------------

        const priceValues = products.map(p => p.price);
        const priceRange = {
            min: priceValues.length ? Math.min(...priceValues) : 0,
            max: priceValues.length ? Math.max(...priceValues) : 0
        };

        // -----------------------------
        // Response
        // -----------------------------
        const response = {
            success: true,
            discountId,
            products: enriched,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: page
        };

        await redis.set(redisKey, JSON.stringify(response), "EX", 120);

        return res.json(response);

    } catch (err) {
        console.error("getDiscountProducts error:", err);
        return res.status(500).json({
            success: false,
            message: "Failed to load discount products"
        });
    }
};


/* ------------------------- Exports ------------------------- */

export default {
    getEligibleDiscountsForCart,
    validateDiscountForCart,
    validateDiscountForCartInternal,
    reserveDiscountUsage,
    fetchProductsForCart,
    pickCartProducts,
    priceCartWithCode,
    validateDiscountForCartInternal
};
