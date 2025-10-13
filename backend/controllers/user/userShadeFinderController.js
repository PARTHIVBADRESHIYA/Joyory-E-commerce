// controllers/shadeFinderController.js
import Tone from "../../models/shade/Tone.js";
import Undertone from "../../models/shade/Undertone.js";
import Family from "../../models/shade/Family.js";
import Promotion from "../../models/Promotion.js";
import Review from "../../models/Review.js";
import Product from "../../models/Product.js";
import Formulation from "../../models/shade/Formulation.js"; // <-- add this
import { buildOptions, normalizeImages } from "../user/userProductController.js";
import { enrichProductWithStockAndOptions, enrichProductsUnified } from "../../middlewares/services/productHelpers.js";
import { calculateVariantPrices } from "../../middlewares/services/promotionHelper.js";

import mongoose from "mongoose";

// helpers/messageBuilder.js
export const buildMessage = ({ step, familyKey, toneKey, undertoneKey, formulationLabel }) => {
    switch (step) {
        case "exact":
            return "✅ We found exact matches for your selection!";
        case "formulation":
            return `❌ No exact matches in ${formulationLabel ? `"${formulationLabel}"` : "this formulation"} with ${undertoneKey} undertone. Showing other formulations.`;
        case "family-formulation":
            return `❌ No products in family "${familyKey}" with ${formulationLabel ? `"${formulationLabel}"` : "this formulation"}. Showing other families.`;
        case "family":
            return `❌ No products in family "${familyKey}". Showing matches from other families.`;
        case "tone-formulation":
            return `❌ No undertone matches in ${formulationLabel ? `"${formulationLabel}"` : "this formulation"}. Showing tone-only matches.`;
        case "tone":
            return `❌ No undertone matches found. Showing tone-only alternatives for "${toneKey}".`;
        case "undertone-formulation":
            return `❌ No tone matches in ${formulationLabel ? `"${formulationLabel}"` : "this formulation"}. Showing undertone-only matches.`;
        case "undertone":
            return `❌ No tone matches found. Showing undertone-only alternatives for "${undertoneKey}".`;
        default:
            return "❌ No exact or related products found. Please try adjusting your selection.";
    }
};

// STEP 1: tones
export const getTones = async (req, res) => {
    try {
        const tones = await Tone.find({ active: true })
            .sort({ order: 1, name: 1 })
            .select("_id key name swatchHex heroImage");

        res.json({ success: true, tones });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// STEP 2: undertones (all active ones)
export const getUndertones = async (req, res) => {
    try {
        const undertones = await Undertone.find({ active: true })
            .sort({ order: 1, name: 1 })
            .select("_id key name description image");

        res.json({ success: true, undertones });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// STEP 3: families (match tone + undertone keys)
export const getFamilies = async (req, res) => {
    try {
        const { toneKey, undertoneKey } = req.query;

        if (!toneKey || !undertoneKey) {
            return res.status(400).json({ success: false, message: "toneKey and undertoneKey are required" });
        }

        const families = await Family.find({
            active: true,
            toneKeys: toneKey,
            undertoneKeys: undertoneKey,
        })
            .sort({ order: 1, name: 1 })
            .select("_id key name sampleImages toneKeys undertoneKeys");

        res.json({ success: true, families });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// STEP 4: formulations (like liquied, stick, powder, etc.)

export const getFormulations = async (req, res) => {
    try {
        const { familyKey, toneKey, undertoneKey } = req.query;

        if (!familyKey || !toneKey || !undertoneKey) {
            return res.status(400).json({
                success: false,
                message: "familyKey, toneKey, and undertoneKey are required",
            });
        }

        const products = await Product.find({
            status: "In-stock", // ✅ product-level availability
            formulation: { $exists: true },
            "variants.familyKey": familyKey,
            "variants.toneKeys": toneKey,
            "variants.undertoneKeys": undertoneKey,
            "variants.isActive": true, // ✅ active shades only
        }).select("formulation");

        const formulations = [...new Set(products.map((p) => p.formulation))];

        res.json({ success: true, formulations });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// export const getRecommendations = async (req, res) => {
//     try {
//         const { familyKey, toneKey, undertoneKey } = req.query;
//         let formulation = req.query.formulation || req.query.formulations;
//         let formulationLabel = null;

//         if (!familyKey || !toneKey || !undertoneKey) {
//             return res.status(400).json({
//                 success: false,
//                 message: "familyKey, toneKey, and undertoneKey are required",
//             });
//         }

//         // ✅ Resolve formulation
//         if (formulation) {
//             if (mongoose.Types.ObjectId.isValid(formulation)) {
//                 const fDoc = await Formulation.findById(formulation).select("name key");
//                 if (fDoc) {
//                     formulationLabel = fDoc.name || fDoc.key;
//                     formulation = fDoc._id;
//                 } else formulation = null;
//             } else {
//                 const fDoc = await Formulation.findOne({
//                     key: { $regex: `^${formulation}$`, $options: "i" },
//                 }).select("name key");
//                 if (fDoc) {
//                     formulationLabel = fDoc.name || fDoc.key;
//                     formulation = fDoc._id;
//                 } else formulation = null;
//             }
//         }

//         const makeQuery = (extra = {}) => ({
//             isPublished: true,
//             status: { $ne: "Out of stock" },
//             "variants.isActive": true,
//             ...extra,
//         });

//         const makeInsensitive = (filter) => {
//             const mapped = {};
//             for (let [key, value] of Object.entries(filter)) {
//                 if (
//                     ["variants.familyKey", "variants.toneKeys", "variants.undertoneKeys"].includes(key)
//                 ) {
//                     mapped[key] = { $regex: `^${value}$`, $options: "i" };
//                 } else {
//                     mapped[key] = value;
//                 }
//             }
//             return mapped;
//         };

//         // 🔹 1. Load active promotions
//         const now = new Date();
//         const promotions = await Promotion.find({
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now },
//         }).lean();

//         // 🔹 2. Step helper
//         const runStep = async (filter, step) => {
//             const found = await Product.find(makeQuery(makeInsensitive(filter)))
//                 .populate("category", "name slug")
//                 .populate("brand", "name")
//                 .select("_id name price mrp quantity images summary status category brand variant variants")
//                 .lean();

//             if (!found.length) return [];

//             return await enrichProducts(found, promotions);
//         };

//         // 🔹 3. Try different matching levels
//         let enrichedProducts = [];

//         const matchSteps = [
//             {
//                 filter: {
//                     "variants.familyKey": familyKey,
//                     "variants.toneKeys": toneKey,
//                     "variants.undertoneKeys": undertoneKey,
//                     ...(formulation && { formulation }),
//                 },
//                 step: "exact",
//             },
//             formulation && {
//                 filter: {
//                     "variants.familyKey": familyKey,
//                     "variants.toneKeys": toneKey,
//                     "variants.undertoneKeys": undertoneKey,
//                 },
//                 step: "ignore-formulation",
//             },
//             formulation && {
//                 filter: {
//                     "variants.toneKeys": toneKey,
//                     "variants.undertoneKeys": undertoneKey,
//                     formulation,
//                 },
//                 step: "ignore-family",
//             },
//             {
//                 filter: {
//                     "variants.toneKeys": toneKey,
//                     "variants.undertoneKeys": undertoneKey,
//                 },
//                 step: "ignore-family-formulation",
//             },
//             formulation && {
//                 filter: {
//                     "variants.toneKeys": toneKey,
//                     formulation,
//                 },
//                 step: "tone-formulation",
//             },
//             {
//                 filter: { "variants.toneKeys": toneKey },
//                 step: "tone",
//             },
//             formulation && {
//                 filter: {
//                     "variants.undertoneKeys": undertoneKey,
//                     formulation,
//                 },
//                 step: "undertone-formulation",
//             },
//             { filter: { "variants.undertoneKeys": undertoneKey }, step: "undertone" },
//         ].filter(Boolean);

//         for (const { filter } of matchSteps) {
//             enrichedProducts = await runStep(filter);
//             if (enrichedProducts.length) break;
//         }

//         // 🔹 4. Build response
//         res.json({
//             success: true,
//             count: enrichedProducts.length,
//             products: enrichedProducts,
//             filters: { familyKey, toneKey, undertoneKey, formulation: formulationLabel },
//             message: enrichedProducts.length
//                 ? "Recommendations fetched successfully"
//                 : "No matching recommendations found",
//         });
//     } catch (err) {
//         console.error("getRecommendations error:", err);
//         res.status(500).json({ success: false, message: err.message });
//     }
// };

// // 🔹 Helper: identical to logic in getProductsByCategory
// async function enrichProducts(products, promotions) {
//     return Promise.all(
//         products.map(async (p) => {
//             const enriched = enrichProductWithStockAndOptions(p, promotions);

//             // ✅ Normalize variants
//             let normalizedVariants = [];
//             if (Array.isArray(enriched.variants) && enriched.variants.length > 0) {
//                 normalizedVariants = calculateVariantPrices(enriched.variants, enriched, promotions);
//             } else if (enriched.variant && (!enriched.variants || !enriched.variants.length)) {
//                 const legacyVariant = {
//                     sku: enriched.sku ?? `${enriched._id}-default`,
//                     shadeName: enriched.variant || "Default",
//                     hex: null,
//                     images: normalizeImages(enriched.images || []),
//                     stock: enriched.quantity ?? 0,
//                     sales: enriched.sales ?? 0,
//                     thresholdValue: 0,
//                     isActive: true,
//                     toneKeys: [],
//                     undertoneKeys: [],
//                     originalPrice: enriched.mrp ?? enriched.price ?? 0,
//                     discountedPrice: enriched.price ?? 0,
//                     displayPrice: enriched.price ?? 0,
//                     discountAmount:
//                         enriched.mrp && enriched.price ? enriched.mrp - enriched.price : 0,
//                     discountPercent:
//                         enriched.mrp && enriched.mrp > enriched.price
//                             ? Math.round(((enriched.mrp - enriched.price) / enriched.mrp) * 100)
//                             : 0,
//                     createdAt: new Date(),
//                     status: enriched.quantity > 0 ? "inStock" : "outOfStock",
//                     message: enriched.quantity > 0 ? "In-stock" : "No stock available",
//                 };

//                 await Product.updateOne(
//                     { _id: enriched._id, "variants.sku": { $ne: legacyVariant.sku } },
//                     { $push: { variants: legacyVariant } }
//                 );

//                 normalizedVariants = calculateVariantPrices([legacyVariant], enriched, promotions);
//             } else {
//                 normalizedVariants = calculateVariantPrices(
//                     [getPseudoVariant(enriched)],
//                     enriched,
//                     promotions
//                 );
//             }

//             enriched.variants = normalizedVariants;

//             // ✅ Shade options
//             enriched.shadeOptions = normalizedVariants.map((v) => ({
//                 name: v.shadeName || enriched.variant || "Default",
//                 sku: v.sku,
//                 image:
//                     Array.isArray(v.images) && v.images.length
//                         ? v.images[0]
//                         : enriched.thumbnail || null,
//                 price: v.displayPrice,
//                 status: v.status || "inStock",
//             }));

//             // ✅ Compute prices
//             const displayVariant = normalizedVariants?.[0] || {};
//             const price = displayVariant.displayPrice ?? enriched.price ?? 0;
//             const mrp = displayVariant.originalPrice ?? enriched.mrp ?? enriched.price ?? 0;
//             const discountPercent = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
//             const status =
//                 displayVariant.status || (enriched.quantity > 0 ? "inStock" : "outOfStock");
//             const message =
//                 displayVariant.message || (enriched.quantity > 0 ? "In-stock" : "No stock available");

//             // ✅ Rating info
//             const [{ avg = 0, count = 0 } = {}] = await Review.aggregate([
//                 { $match: { productId: enriched._id, status: "Active" } },
//                 { $group: { _id: "$productId", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
//             ]);
//             const avgRating = Math.round((avg || 0) * 10) / 10;

//             return {
//                 _id: enriched._id,
//                 name: enriched.name,
//                 brand: enriched.brand || null,
//                 mrp,
//                 price,
//                 discountPercent,
//                 discountAmount: mrp - price,
//                 images: normalizeImages(enriched.images || []),
//                 variants: normalizedVariants,
//                 shadeOptions: enriched.shadeOptions || [],
//                 status,
//                 message,
//                 avgRating,
//                 totalRatings: count || 0,
//                 inStock: displayVariant.stock > 0 || enriched.quantity > 0,
//             };
//         })
//     );
// }


// export const getRecommendations = async (req, res) => {
//     try {
//         const { familyKey, toneKey, undertoneKey } = req.query;
//         let formulation = req.query.formulation || req.query.formulations;
//         let formulationLabel = null;

//         if (!familyKey || !toneKey || !undertoneKey) {
//             return res.status(400).json({
//                 success: false,
//                 message: "familyKey, toneKey, and undertoneKey are required",
//             });
//         }

//         // ✅ Resolve formulation
//         if (formulation) {
//             if (mongoose.Types.ObjectId.isValid(formulation)) {
//                 const fDoc = await Formulation.findById(formulation).select("name key");
//                 if (fDoc) {
//                     formulationLabel = fDoc.name || fDoc.key;
//                     formulation = fDoc._id;
//                 } else formulation = null;
//             } else {
//                 const fDoc = await Formulation.findOne({
//                     key: { $regex: `^${formulation}$`, $options: "i" },
//                 }).select("name key");
//                 if (fDoc) {
//                     formulationLabel = fDoc.name || fDoc.key;
//                     formulation = fDoc._id;
//                 } else formulation = null;
//             }
//         }

//         const makeQuery = (extra = {}) => ({
//             isPublished: true,
//             status: { $ne: "Out of stock" },
//             "variants.isActive": true,
//             ...extra,
//         });

//         const makeInsensitive = (filter) => {
//             const mapped = {};
//             for (let [key, value] of Object.entries(filter)) {
//                 if (
//                     ["variants.familyKey", "variants.toneKeys", "variants.undertoneKeys"].includes(key)
//                 ) {
//                     mapped[key] = { $regex: `^${value}$`, $options: "i" };
//                 } else {
//                     mapped[key] = value;
//                 }
//             }
//             return mapped;
//         };

//         // 🔹 1. Load active promotions
//         const now = new Date();
//         const promotions = await Promotion.find({
//             status: "active",
//             startDate: { $lte: now },
//             endDate: { $gte: now },
//         }).lean();

//         // 🔹 2. Step helper
//         const runStep = async (filter, step) => {
//             const found = await Product.find(makeQuery(makeInsensitive(filter)))
//                 .populate("category", "name slug")
//                 .populate("brand", "name")
//                 .select("_id name price mrp quantity images summary status category brand variant variants")
//                 .lean();

//             if (!found.length) return [];

//             return await enrichProducts(found, promotions);
//         };

//         // 🔹 3. Try different matching levels
//         let enrichedProducts = [];

//         const matchSteps = [
//             {
//                 filter: {
//                     "variants.familyKey": familyKey,
//                     "variants.toneKeys": toneKey,
//                     "variants.undertoneKeys": undertoneKey,
//                     ...(formulation && { formulation }),
//                 },
//                 step: "exact",
//             },
//             formulation && {
//                 filter: {
//                     "variants.familyKey": familyKey,
//                     "variants.toneKeys": toneKey,
//                     "variants.undertoneKeys": undertoneKey,
//                 },
//                 step: "ignore-formulation",
//             },
//             formulation && {
//                 filter: {
//                     "variants.toneKeys": toneKey,
//                     "variants.undertoneKeys": undertoneKey,
//                     formulation,
//                 },
//                 step: "ignore-family",
//             },
//             {
//                 filter: {
//                     "variants.toneKeys": toneKey,
//                     "variants.undertoneKeys": undertoneKey,
//                 },
//                 step: "ignore-family-formulation",
//             },
//             formulation && {
//                 filter: {
//                     "variants.toneKeys": toneKey,
//                     formulation,
//                 },
//                 step: "tone-formulation",
//             },
//             {
//                 filter: { "variants.toneKeys": toneKey },
//                 step: "tone",
//             },
//             formulation && {
//                 filter: {
//                     "variants.undertoneKeys": undertoneKey,
//                     formulation,
//                 },
//                 step: "undertone-formulation",
//             },
//             { filter: { "variants.undertoneKeys": undertoneKey }, step: "undertone" },
//         ].filter(Boolean);

//         for (const { filter } of matchSteps) {
//             enrichedProducts = await runStep(filter);
//             if (enrichedProducts.length) break;
//         }

//         // 🔹 4. Final Response
//         res.json({
//             success: true,
//             count: enrichedProducts.length,
//             products: enrichedProducts,
//             filters: { familyKey, toneKey, undertoneKey, formulation: formulationLabel },
//             message: enrichedProducts.length
//                 ? "Recommendations fetched successfully"
//                 : "No matching recommendations found",
//         });
//     } catch (err) {
//         console.error("getRecommendations error:", err);
//         res.status(500).json({ success: false, message: err.message });
//     }
// };

// // ✅ Helper identical to getProductsByCategory enrichment
// async function enrichProducts(products, promotions) {
//     return Promise.all(
//         products.map(async (p) => {
//             const enriched = enrichProductWithStockAndOptions(p, promotions);

//             // 🔹 Normalize variants
//             let normalizedVariants = [];
//             if (Array.isArray(enriched.variants) && enriched.variants.length > 0) {
//                 normalizedVariants = calculateVariantPrices(enriched.variants, enriched, promotions);
//             } else if (enriched.variant && (!enriched.variants || !enriched.variants.length)) {
//                 const legacyVariant = {
//                     sku: enriched.sku ?? `${enriched._id}-default`,
//                     shadeName: enriched.variant || "Default",
//                     hex: null,
//                     images: normalizeImages(enriched.images || []),
//                     stock: enriched.quantity ?? 0,
//                     sales: enriched.sales ?? 0,
//                     thresholdValue: 0,
//                     isActive: true,
//                     toneKeys: [],
//                     undertoneKeys: [],
//                     originalPrice: enriched.mrp ?? enriched.price ?? 0,
//                     discountedPrice: enriched.price ?? 0,
//                     displayPrice: enriched.price ?? 0,
//                     discountAmount:
//                         enriched.mrp && enriched.price ? enriched.mrp - enriched.price : 0,
//                     discountPercent:
//                         enriched.mrp && enriched.mrp > enriched.price
//                             ? Math.round(((enriched.mrp - enriched.price) / enriched.mrp) * 100)
//                             : 0,
//                     createdAt: new Date(),
//                     status: enriched.quantity > 0 ? "inStock" : "outOfStock",
//                     message: enriched.quantity > 0 ? "In-stock" : "No stock available",
//                 };

//                 await Product.updateOne(
//                     { _id: enriched._id, "variants.sku": { $ne: legacyVariant.sku } },
//                     { $push: { variants: legacyVariant } }
//                 );

//                 normalizedVariants = calculateVariantPrices([legacyVariant], enriched, promotions);
//             } else {
//                 normalizedVariants = calculateVariantPrices(
//                     [getPseudoVariant(enriched)],
//                     enriched,
//                     promotions
//                 );
//             }

//             enriched.variants = normalizedVariants;

//             // 🔹 Shade options
//             enriched.shadeOptions = normalizedVariants.map((v) => ({
//                 name: v.shadeName || enriched.variant || "Default",
//                 sku: v.sku,
//                 image:
//                     Array.isArray(v.images) && v.images.length
//                         ? v.images[0]
//                         : enriched.thumbnail || null,
//                 price: v.displayPrice,
//                 status: v.status || "inStock",
//             }));

//             // 🔹 Compute pricing + stock status
//             const displayVariant = normalizedVariants?.[0] || {};
//             const price = displayVariant.displayPrice ?? enriched.price ?? 0;
//             const mrp = displayVariant.originalPrice ?? enriched.mrp ?? enriched.price ?? 0;
//             const discountPercent = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;
//             const status =
//                 displayVariant.status || (enriched.quantity > 0 ? "inStock" : "outOfStock");
//             const message =
//                 displayVariant.message || (enriched.quantity > 0 ? "In-stock" : "No stock available");

//             // 🔹 Ratings
//             const [{ avg = 0, count = 0 } = {}] = await Review.aggregate([
//                 { $match: { productId: enriched._id, status: "Active" } },
//                 { $group: { _id: "$productId", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
//             ]);
//             const avgRating = Math.round((avg || 0) * 10) / 10;

//             return {
//                 _id: enriched._id,
//                 name: enriched.name,
//                 brand: enriched.brand || null,
//                 mrp,
//                 price,
//                 discountPercent,
//                 discountAmount: mrp - price,
//                 images: normalizeImages(enriched.images || []),
//                 variants: normalizedVariants,
//                 shadeOptions: enriched.shadeOptions || [],
//                 status,
//                 message,
//                 avgRating,
//                 totalRatings: count || 0,
//                 inStock: displayVariant.stock > 0 || enriched.quantity > 0,
//             };
//         })
//     );
// }
export const getRecommendations = async (req, res) => {
    try {
        const { familyKey, toneKey, undertoneKey } = req.query;
        let formulation = req.query.formulation || req.query.formulations;
        let formulationLabel = null;

        if (!familyKey || !toneKey || !undertoneKey) {
            return res.status(400).json({
                success: false,
                message: "familyKey, toneKey, and undertoneKey are required",
            });
        }

        // ✅ Resolve formulation
        if (formulation) {
            if (mongoose.Types.ObjectId.isValid(formulation)) {
                const fDoc = await Formulation.findById(formulation).select("name key");
                if (fDoc) {
                    formulationLabel = fDoc.name || fDoc.key;
                    formulation = fDoc._id;
                } else formulation = null;
            } else {
                const fDoc = await Formulation.findOne({
                    key: { $regex: `^${formulation}$`, $options: "i" },
                }).select("name key");
                if (fDoc) {
                    formulationLabel = fDoc.name || fDoc.key;
                    formulation = fDoc._id;
                } else formulation = null;
            }
        }

        const makeQuery = (extra = {}) => ({
            isPublished: true,
            status: { $ne: "Out of stock" },
            "variants.isActive": true,
            ...extra,
        });

        const makeInsensitive = (filter) => {
            const mapped = {};
            for (let [key, value] of Object.entries(filter)) {
                if (
                    ["variants.familyKey", "variants.toneKeys", "variants.undertoneKeys"].includes(key)
                ) {
                    mapped[key] = { $regex: `^${value}$`, $options: "i" };
                } else {
                    mapped[key] = value;
                }
            }
            return mapped;
        };

        // 🔹 1. Load active promotions
        const now = new Date();
        const promotions = await Promotion.find({
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now },
        }).lean();

        // 🔹 2. Step helper
        const runStep = async (filter) => {
            const found = await Product.find(makeQuery(makeInsensitive(filter)))
                .populate("category", "name slug")
                .populate("brand", "name")
                .select("_id name price mrp quantity images summary status category brand variant variants")
                .lean();

            if (!found.length) return [];

            // ✅ Use central helper instead of duplicating enrichment logic
            return enrichProductsUnified(found, promotions);
        };

        // 🔹 3. Try different matching levels
        let enrichedProducts = [];

        const matchSteps = [
            {
                filter: {
                    "variants.familyKey": familyKey,
                    "variants.toneKeys": toneKey,
                    "variants.undertoneKeys": undertoneKey,
                    ...(formulation && { formulation }),
                },
            },
            formulation && {
                filter: {
                    "variants.familyKey": familyKey,
                    "variants.toneKeys": toneKey,
                    "variants.undertoneKeys": undertoneKey,
                },
            },
            formulation && {
                filter: {
                    "variants.toneKeys": toneKey,
                    "variants.undertoneKeys": undertoneKey,
                    formulation,
                },
            },
            {
                filter: {
                    "variants.toneKeys": toneKey,
                    "variants.undertoneKeys": undertoneKey,
                },
            },
            formulation && {
                filter: {
                    "variants.toneKeys": toneKey,
                    formulation,
                },
            },
            {
                filter: { "variants.toneKeys": toneKey },
            },
            formulation && {
                filter: {
                    "variants.undertoneKeys": undertoneKey,
                    formulation,
                },
            },
            { filter: { "variants.undertoneKeys": undertoneKey } },
        ].filter(Boolean);

        for (const { filter } of matchSteps) {
            enrichedProducts = await runStep(filter);
            if (enrichedProducts.length) break;
        }

        // 🔹 4. Final Response
        res.json({
            success: true,
            count: enrichedProducts.length,
            products: enrichedProducts,
            filters: { familyKey, toneKey, undertoneKey, formulation: formulationLabel },
            message: enrichedProducts.length
                ? "Recommendations fetched successfully"
                : "No matching recommendations found",
        });
    } catch (err) {
        console.error("getRecommendations error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};
