import Promotion from "../../models/Promotion.js";
import Product from "../../models/Product.js";
import { isObjectId } from "../../controllers/user/userPromotionController.js";
import { normalizeFilters, applyDynamicFilters } from "../../controllers/user/userProductController.js";
import { escapeRegex, asMoney } from "../../controllers/user/userPromotionController.js";
import { formatProductCard } from "../../middlewares/utils/recommendationService.js";
import { enrichProductWithStockAndOptions } from "../../middlewares/services/productHelpers.js";

import mongoose from "mongoose";
const { ObjectId } = mongoose.Types;

export const fetchPromotionProductsHelper = async (params) => {
    const { id, query } = params;
    if (!isObjectId(id)) throw new Error("Invalid promotion id");

    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const rawLimit = parseInt(query.limit ?? "24", 10);
    const limit = Math.min(Math.max(1, rawLimit), 60);
    const search = (query.search ?? "").trim();
    const sort = (query.sort ?? "newest").trim();

    // Load promotion
    const promo = await Promotion.findById(id)
        .populate("categories.category", "_id name slug")
        .populate("products", "_id name category")
        .lean();

    if (!promo) throw new Error("Promotion not found");

    const promoMaxPrice = Number(promo.promotionConfig?.maxProductPrice || 0); // e.g., 499

    const filters = normalizeFilters(query);

    // Build base query
    const baseOr = [];
    if (promo.scope === "category" && promo.categories?.length) {
        const catIds = promo.categories.map(c => c?.category?._id).filter(Boolean).map(id => new ObjectId(id));
        baseOr.push({ category: { $in: catIds } }, { categories: { $in: catIds } });
    } else if (promo.scope === "product" && promo.products?.length) {
        const pids = promo.products.map(p => new ObjectId(p._id ?? p));
        baseOr.push({ _id: { $in: pids } });
    } else if (promo.scope === "brand" && promo.brands?.length) {
        const brandIds = promo.brands.map(b => new ObjectId(b?.brand?._id ?? b?.brand)).filter(Boolean);
        if (brandIds.length) baseOr.push({ brand: { $in: brandIds } });
    }

    const baseMatch = {};
    if (baseOr.length) baseMatch.$or = baseOr;
    if (search) baseMatch.name = { $regex: escapeRegex(search), $options: "i" };
    const match = applyDynamicFilters(baseMatch, filters);
    match.isPublished = true;

    const sortOptions = {
        newest: { createdAt: -1 },
        priceLowToHigh: { "variants.displayPrice": 1 },
        priceHighToLow: { "variants.displayPrice": -1 },
        rating: { avgRating: -1 },
    };

    const total = await Product.countDocuments(match);
    const products = await Product.find(match)
        .sort(sortOptions[sort] || { createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();

    if (!products.length) return {
        promoMeta: promo,
        products: [],
        pagination: { page, limit, total: 0, pages: 0 },
        message: "No products found for this promotion.",
    };

    // Enrich products
    const now = new Date();
    const activePromos = [
        promo,
        ...(await Promotion.find({ status: "active", startDate: { $lte: now }, endDate: { $gte: now } }).lean()),
    ];

    const enriched = products.map(p => enrichProductWithStockAndOptions(p, activePromos));

    // Apply "Under ₹price" logic variant-wise & handle no-variant products
    const promoAdjusted = enriched.map(product => {
        let eligibleVariants = [];

        if (product.variants?.length) {
            // Filter variants that satisfy promoMaxPrice
            eligibleVariants = product.variants
                .filter(v => (v.displayPrice ?? v.originalPrice ?? product.price ?? 0) <= promoMaxPrice)
                .map(v => ({
                    ...v,
                    badge: `Under ₹${promoMaxPrice}`,
                    promoMessage: `Part of ${promo.campaignName} — under ₹${promoMaxPrice}`,
                }));

            if (!eligibleVariants.length) return null; // skip product if no variants eligible
        } else {
            // Product has no variants
            if ((product.price ?? 0) <= promoMaxPrice) {
                eligibleVariants = [{
                    ...product,
                    displayPrice: product.price,
                    originalPrice: product.price,
                    badge: `Under ₹${promoMaxPrice}`,
                    promoMessage: `Part of ${promo.campaignName} — under ₹${promoMaxPrice}`,
                }];
            } else return null; // skip product if price > promoMaxPrice
        }

        // Pick the lowest priced variant/product
        const minVariant = eligibleVariants.reduce((a, b) => (a.displayPrice < b.displayPrice ? a : b));

        // Update variant badges/messages
        const updatedVariants = product.variants?.map(variant => {
            const price = variant.displayPrice ?? variant.originalPrice ?? product.price ?? 0;
            const isEligible = price <= promoMaxPrice;
            return {
                ...variant,
                badge: isEligible ? `Under ₹${promoMaxPrice}` : null,
                promoMessage: isEligible ? `Part of ${promo.campaignName} — under ₹${promoMaxPrice}` : null,
            };
        }) || eligibleVariants; // if no variants, use eligibleVariants array

        return {
            ...product,
            variants: updatedVariants,
            selectedVariant: minVariant,
            basePrice: minVariant.displayPrice,
        };
    }).filter(Boolean);

    // Sort by lowest price
    promoAdjusted.sort((a, b) => a.basePrice - b.basePrice);

    // Format for frontend
    const finalCards = await Promise.all(promoAdjusted.map(p => formatProductCard(p)));

    // Attach promo metadata at product level
    const finalProducts = finalCards.map(p => ({
        ...p,
        badge: `Under ₹${promoMaxPrice}`,
        promoMessage: `Grab deals under ₹${promoMaxPrice}`,
    }));

    return {
        promoMeta: promo,
        products: finalProducts,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
        message: null,
    };
};

export const calculateVariantPrices = (variants = [], product, promotions = []) => {
    if (!variants || variants.length === 0) return []; // ✅ no pseudo variants

    promotions = Array.isArray(promotions) ? promotions : [];

    return variants.map(v => {
        const basePrice = v.price ?? product.price;
        let finalDiscountedPrice = v.discountedPrice ?? basePrice;
        const priceFloor = product.buyingPrice ?? 0;

        promotions.forEach(promo => {
            if (promo.promotionType === "discount" && promo.discountValue > 0) {
                let promoPrice;
                if (promo.discountUnit === "percent") {
                    promoPrice = basePrice * (1 - promo.discountValue / 100);
                } else {
                    promoPrice = basePrice - promo.discountValue;
                }
                promoPrice = Math.max(promoPrice, priceFloor);
                if (promoPrice < finalDiscountedPrice) finalDiscountedPrice = promoPrice;
            }
        });

        let status = "inStock";
        let message = "In-stock";
        if (v.stock <= 0) {
            status = "outOfStock";
            message = "No stock available";
        } else if (v.thresholdValue && v.stock <= v.thresholdValue) {
            status = "lowStock";
            message = `Few left (${v.stock})`;
        }

        const discountPercent = basePrice > 0 ? Math.floor(((basePrice - finalDiscountedPrice) / basePrice) * 100) : 0;

        return {
            ...v,
            originalPrice: Math.round(basePrice),
            discountedPrice: Math.round(finalDiscountedPrice),
            displayPrice: Math.round(finalDiscountedPrice),
            discountAmount: Math.max(0, Math.round(basePrice - finalDiscountedPrice)),
            discountPercent,
            status,
            message,
            images: v.images?.length ? v.images : (product.images?.length ? product.images : []),
        };
    });
};
