// // controllers/user/discountController.js
// import mongoose from 'mongoose';
// import Discount from '../../models/Discount.js';
// import Product from '../../models/Product.js';
// import Order from '../../models/Order.js';
// import { getCache, setCache, clearCache } from '../../middlewares/utils/simpleCache.js';

// /* ------------------------- Constants ------------------------- */
// const ELIGIBLE_CACHE_TTL_MS = 30 * 1000; // 30 seconds

// /* ------------------------- Helpers ------------------------- */

// /** Returns whether a discount doc is currently active and has remaining global usages */
// function isActive(discount) {
//     const now = new Date();
//     if (!discount) return false;
//     if (discount.status !== 'Active') return false;
//     if (discount.startDate && discount.startDate > now) return false;
//     if (discount.endDate && discount.endDate < now) return false;

//     if (
//         typeof discount.totalLimit === 'number' &&
//         typeof discount.usageCount === 'number' &&
//         discount.totalLimit >= 0 &&
//         discount.usageCount >= discount.totalLimit
//     ) {
//         return false;
//     }

//     return true;
// }

// /** Whether user meets eligibility segment */
// function isUserEligible(discount, user) {
//     if (!discount || !discount.eligibility || discount.eligibility === 'All') return true;
//     if (discount.eligibility === 'New Users') return !!user?.isNewUser;
//     if (discount.eligibility === 'Existing Users') return !user?.isNewUser;
//     return true;
// }

// /** Normalize and enrich cart lines using DB product data (safe server-side pricing) */
// function pickCartProducts(products, cart) {
//     const byId = new Map(products.map(p => [String(p._id), p]));
//     return cart
//         .map(line => {
//             if (!line || !line.productId) return null;
//             const prod = byId.get(String(line.productId));
//             if (!prod) return null;

//             const qty = Math.max(1, Number(line.qty || 1));
//             const unitPrice = Number(prod.price ?? 0);

//             return {
//                 productId: String(prod._id),
//                 qty,
//                 unitPrice,
//                 brandId: String(prod.brand?._id || prod.brand || ''),
//                 categoryId: String(prod.category?._id || prod.category || ''),
//                 lineSubtotal: Math.round(unitPrice * qty)
//             };
//         })
//         .filter(Boolean);
// }

// function cartSubtotal(lines) {
//     return lines.reduce((s, l) => s + (l.lineSubtotal || 0), 0);
// }

// /** Returns the product lines a discount applies to based on scope */
// function applicableLines(discount, lines) {
//     const scope = discount?.appliesTo?.type || 'Entire Order';
//     if (scope === 'Entire Order') return lines;
//     if (!discount?.appliesTo) return [];

//     if (scope === 'Product') {
//         const set = new Set((discount.appliesTo.productIds || []).map(String));
//         return lines.filter(l => set.has(String(l.productId)));
//     }

//     if (scope === 'Category') {
//         const set = new Set((discount.appliesTo.categoryIds || []).map(String));
//         return lines.filter(l => set.has(String(l.categoryId)));
//     }

//     if (scope === 'Brand') {
//         const set = new Set((discount.appliesTo.brandIds || []).map(String));
//         return lines.filter(l => set.has(String(l.brandId)));
//     }

//     return [];
// }

// /** Compute discount amount for the given discount and cart lines */
// function computeDiscountAmount(discount, lines) {
//     const scopeLines = applicableLines(discount, lines);
//     if (!scopeLines.length) return 0;

//     const applicableSubtotal = scopeLines.reduce((s, l) => s + (l.lineSubtotal || 0), 0);

//     if (discount.minimumOrderAmount && applicableSubtotal < discount.minimumOrderAmount) {
//         return 0;
//     }

//     const value = Number(discount.value || 0);
//     if (value <= 0) return 0;

//     if (discount.type === 'Percentage') {
//         return Math.floor((applicableSubtotal * value) / 100);
//     }

//     // Flat - capped to applicable subtotal
//     return Math.min(value, applicableSubtotal);
// }

// /** Price cart with a discount document (doesn't modify DB) */
// function priceCartWithCode(discountDoc, lines) {
//     const subtotal = cartSubtotal(lines);

//     if (!discountDoc) {
//         return { code: null, subtotal, discountAmount: 0, total: subtotal };
//     }

//     if (!isActive(discountDoc)) {
//         return { code: discountDoc.code, subtotal, discountAmount: 0, total: subtotal };
//     }

//     const discountAmount = computeDiscountAmount(discountDoc, lines);
//     const total = Math.max(0, subtotal - discountAmount);

//     return {
//         code: discountDoc.code,
//         subtotal,
//         discountAmount,
//         total
//     };
// }

// /* ------------------------- DB helpers ------------------------- */

// async function fetchProductsForCart(cart) {
//     if (!Array.isArray(cart) || !cart.length) return [];
//     const ids = cart
//         .map(c => c.productId)
//         .filter(Boolean)
//         .map(id => {
//             try { return new mongoose.Types.ObjectId(id); } catch { return null; }
//         })
//         .filter(Boolean);

//     if (!ids.length) return [];
//     return Product.find({ _id: { $in: ids } })
//         .select('_id price brand category')
//         .populate('brand', '_id')
//         .populate('category', '_id')
//         .lean();
// }

// /** Query for discounts that are currently active and under global usage limits */
// function activeDiscountQuery() {
//     const now = new Date();
//     return {
//         status: 'Active',
//         startDate: { $lte: now },
//         endDate: { $gte: now },
//         $or: [
//             { totalLimit: { $exists: false } },
//             { totalLimit: null },
//             { $expr: { $lt: ['$usageCount', '$totalLimit'] } }
//         ]
//     };
// }

// /* ------------------------- Cache helpers ------------------------- */

// /** Build a conservative cache key for eligible discounts */
// function buildEligibleCacheKey(userId, subtotal, lines) {
//     // don't leak product IDs in cache key; include count and subtotal for safety
//     return `eligibleDiscounts:${String(userId || 'guest')}:sub${Math.round(subtotal)}:n${lines.length}`;
// }

// /* ------------------------- Controllers ------------------------- */

// /**
//  * POST /api/user/discounts/eligible
//  * Body: { cart: [{ productId, qty }] }
//  * Response: { fromCache, discounts: [...], subtotal }
//  */
// export const getEligibleDiscountsForCart = async (req, res) => {
//     try {
//         const cart = Array.isArray(req.body.cart) ? req.body.cart : [];
//         if (!cart.length) return res.status(400).json({ message: 'Cart is empty' });

//         // fetch product data and build lines
//         const products = await fetchProductsForCart(cart);
//         const lines = pickCartProducts(products, cart);
//         if (!lines.length) return res.status(400).json({ message: 'No valid products in cart' });

//         const subtotal = cartSubtotal(lines);
//         const user = req.user || null;
//         const cacheKey = buildEligibleCacheKey(user?._id, subtotal, lines);

//         // return cached if exists
//         const cached = getCache(cacheKey);
//         if (cached) {
//             return res.json({ fromCache: true, ...cached });
//         }

//         // fetch active discounts and compute applicability
//         const all = await Discount.find(activeDiscountQuery()).lean();
//         const payload = [];

//         for (const d of all) {
//             try {
//                 if (!isUserEligible(d, user)) continue;

//                 // Check per-customer usage here (simple count)
//                 if (d.perCustomerLimit && req.user && req.user._id) {
//                     const usedByCustomer = await Order.countDocuments({
//                         user: req.user._id,
//                         discountCode: d.code
//                     });
//                     if (usedByCustomer >= d.perCustomerLimit) continue;
//                 }

//                 const priced = priceCartWithCode(d, lines);
//                 if (!priced || priced.discountAmount <= 0) continue;

//                 payload.push({
//                     code: d.code,
//                     label: d.name,
//                     type: d.type,
//                     value: d.value,
//                     appliesTo: d.appliesTo?.type || 'Entire Order',
//                     minOrder: d.minimumOrderAmount || 0,
//                     expiresOn: d.endDate || null,
//                     estimatedSavings: priced.discountAmount,
//                     finalTotal: priced.total
//                 });
//             } catch (innerErr) {
//                 // swallow single-discount errors and continue — keeps system resilient
//                 console.warn('discount evaluation warning', d?.code, innerErr?.message || innerErr);
//                 continue;
//             }
//         }

//         // sort by best savings descending
//         payload.sort((a, b) => (b.estimatedSavings || 0) - (a.estimatedSavings || 0));

//         const responseData = { discounts: payload, subtotal };

//         // cache short-lived result
//         setCache(cacheKey, responseData, ELIGIBLE_CACHE_TTL_MS);

//         return res.json({ fromCache: false, ...responseData });
//     } catch (err) {
//         console.error('getEligibleDiscountsForCart error:', err);
//         return res.status(500).json({ message: 'Failed to load eligible discounts' });
//     }
// };

// /**
//  * POST /api/user/discounts/validate
//  * Body: { code, cart: [{ productId, qty }] }
//  * Response: { code, subtotal, discountAmount, total }
//  *
//  * NOTE: This validates only. When placing the order, call reserveDiscountUsage()
//  * to atomically increment usageCount (server must revalidate before increment).
//  */
// export const validateDiscountForCart = async (req, res) => {
//     try {
//         const { code } = req.body;
//         const cart = Array.isArray(req.body.cart) ? req.body.cart : [];

//         if (!code) return res.status(400).json({ message: 'Discount code is required' });
//         if (!cart.length) return res.status(400).json({ message: 'Cart is empty' });

//         // find the discount doc
//         const discount = await Discount.findOne({ code: code.trim() }).lean();
//         if (!discount) return res.status(404).json({ message: 'Invalid discount code' });

//         if (!isActive(discount)) return res.status(400).json({ message: 'This discount is not active' });

//         if (!isUserEligible(discount, req.user || null)) {
//             return res.status(400).json({ message: 'You are not eligible for this discount' });
//         }

//         // per-customer limit check
//         if (discount.perCustomerLimit && req.user && req.user._id) {
//             const usedByCustomer = await Order.countDocuments({
//                 user: req.user._id,
//                 discountCode: discount.code
//             });
//             if (usedByCustomer >= discount.perCustomerLimit) {
//                 return res.status(400).json({ message: 'Per-customer usage limit reached for this code' });
//             }
//         }

//         // price check
//         const products = await fetchProductsForCart(cart);
//         const lines = pickCartProducts(products, cart);
//         if (!lines.length) return res.status(400).json({ message: 'No valid products in cart' });

//         const priced = priceCartWithCode(discount, lines);
//         if (!priced || priced.discountAmount <= 0) {
//             return res.status(400).json({ message: 'Discount does not apply to your cart' });
//         }

//         return res.json(priced);
//     } catch (err) {
//         console.error('validateDiscountForCart error:', err);
//         return res.status(500).json({ message: 'Failed to validate discount' });
//     }
// };

// /* ------------------------- Order-time reservation ------------------------- */

// /**
//  * Attempt to reserve (atomically) one usage of a discount when placing an order.
//  *
//  * Steps:
//  *  - Re-validate discount (active, eligibility, per-customer limit).
//  *  - Attempt to increment usageCount atomically (findOneAndUpdate with $expr for totalLimit).
//  *  - If increment succeeds, return discounted pricing and discount doc (updated); else throw.
//  *
//  * NOTE: This is NOT a full DB transaction. If you run replica set/transactions, you may
//  * wrap order creation + discount increment in a transaction for full atomicity.
//  *
//  * Returns:
//  *  { success: true, discountDoc, priced } OR throws an Error (message).
//  */
// export async function reserveDiscountUsage({ code, userId, cart }) {
//     if (!code) throw new Error('code required');
//     if (!Array.isArray(cart) || !cart.length) throw new Error('cart required');

//     // 1) fetch discount doc (fresh)
//     const discount = await Discount.findOne({ code: code.trim() }).lean();
//     if (!discount) throw new Error('Invalid discount code');
//     if (!isActive(discount)) throw new Error('This discount is not active');

//     // 2) per-customer check
//     if (discount.perCustomerLimit && userId) {
//         const usedByCustomer = await Order.countDocuments({ user: userId, discountCode: discount.code });
//         if (usedByCustomer >= discount.perCustomerLimit) {
//             throw new Error('Per-customer usage limit reached for this code');
//         }
//     }

//     // 3) compute priced (recalculate using live product prices)
//     const products = await fetchProductsForCart(cart);
//     const lines = pickCartProducts(products, cart);
//     if (!lines.length) throw new Error('No valid products in cart');

//     const priced = priceCartWithCode(discount, lines);
//     if (!priced || priced.discountAmount <= 0) throw new Error('Discount does not apply to this order');

//     // 4) attempt to increment usageCount atomically (guard against totalLimit)
//     // Use findOneAndUpdate with $expr to ensure usageCount < totalLimit, if totalLimit exists.
//     const query = { code: discount.code, status: 'Active', startDate: { $lte: new Date() }, endDate: { $gte: new Date() } };
//     if (typeof discount.totalLimit === 'number') {
//         // Use $expr to compare usageCount < totalLimit
//         query.$expr = { $lt: ['$usageCount', discount.totalLimit] };
//     }

//     const updated = await Discount.findOneAndUpdate(
//         query,
//         { $inc: { usageCount: 1 } },
//         { new: true } // returns updated doc
//     ).lean();

//     if (!updated) {
//         // someone consumed last usage simultaneously or discount became inactive
//         throw new Error('Discount not available any more (limit reached)');
//     }

//     // 5) Invalidate related caches (conservative)
//     // We don't know which users caches to clear; clear global-pattern keys (if your cache supports it).
//     // Using simpleCache with Map, we can't wildcard-clear reliably; instead, export clearCache to admin flows.
//     // For safety, also clear caches for the current user if present.
//     try {
//         const userKey = buildEligibleCacheKey(userId, priced.subtotal, lines);
//         clearCache(userKey);
//     } catch (e) { /* ignore */ }

//     // Return updated discount + pricing details for order creation to persist
//     return { success: true, discount: updated, priced };
// }

// /* ------------------------- Cache invalidation helpers ------------------------- */

// /**
//  * Invalidate cached eligible discounts for a specific user-subtotal combination.
//  * Use this from admin flows when discounts change. If you want global invalidation,
//  * call with userId = null and subtotal = null which will attempt to clear all keys
//  * matching prefix (if your cache supports it). Our simpleCache only supports key deletion,
//  * so you should keep track of keys or keep TTL short. Here we provide a helper to clear
//  * a specific key.
//  */
// export function invalidateEligibleDiscountCacheForUser(userId, subtotal, lineCount) {
//     try {
//         const key = buildEligibleCacheKey(userId || 'guest', subtotal || 0, { length: lineCount || 0 });
//         clearCache(key);
//     } catch (e) {
//         // best-effort invalidation
//         console.warn('invalidateEligibleDiscountCacheForUser failed', e?.message || e);
//     }
// }

// /* ------------------------- Exports ------------------------- */

// export default {
//     getEligibleDiscountsForCart,
//     validateDiscountForCart,
//     reserveDiscountUsage,
//     invalidateEligibleDiscountCacheForUser
// };
























// controllers/user/discountController.js
import mongoose from 'mongoose';
import Discount from '../../models/Discount.js';
import Product from '../../models/Product.js';
import Order from '../../models/Order.js';
import { getCache, setCache, clearCache } from '../../middlewares/utils/simpleCache.js';

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

export function isUserEligible(discount, user) {
    if (!discount || !discount.eligibility || discount.eligibility === 'All') return true;
    if (discount.eligibility === 'New Users') return !!user?.isNewUser;
    if (discount.eligibility === 'Existing Users') return !user?.isNewUser;
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

    for (const d of all) {
        try {
            if (!isUserEligible(d, user)) continue;
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
        const cacheKey = `eligibleDiscounts:${String(user?._id || 'guest')}:sub${Math.round(subtotal)}:n${lines.length}`;

        const cached = getCache(cacheKey);
        if (cached) return res.json({ fromCache: true, ...cached });

        const all = await Discount.find(activeDiscountQuery()).lean();
        const payload = [];

        for (const d of all) {
            try {
                if (!isUserEligible(d, user)) continue;
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
