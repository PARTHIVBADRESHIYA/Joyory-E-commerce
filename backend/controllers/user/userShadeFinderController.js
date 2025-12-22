// controllers/shadeFinderController.js
import Tone from "../../models/shade/Tone.js";
import Undertone from "../../models/shade/Undertone.js";
import Family from "../../models/shade/Family.js";
import Promotion from "../../models/Promotion.js";
import Product from "../../models/Product.js";
import Formulation from "../../models/shade/Formulation.js"; // <-- add this
import { enrichProductsUnified } from "../../middlewares/services/productHelpers.js";

import mongoose from "mongoose";

// helpers/messageBuilder.js
export const buildMessage = ({ step, familyKey, toneKey, undertoneKey, formulationLabel }) => {
    switch (step) {
        case "exact":
            return "✅ We found exact matches for your selection!";
        case "formulation":
            return ` No exact matches in ${formulationLabel ? `"${formulationLabel}"` : "this formulation"} with ${undertoneKey} undertone. Showing other formulations.`;
        case "family-formulation":
            return ` No products in family "${familyKey}" with ${formulationLabel ? `"${formulationLabel}"` : "this formulation"}. Showing other families.`;
        case "family":
            return ` No products in family "${familyKey}". Showing matches from other families.`;
        case "tone-formulation":
            return ` No undertone matches in ${formulationLabel ? `"${formulationLabel}"` : "this formulation"}. Showing tone-only matches.`;
        case "tone":
            return ` No undertone matches found. Showing tone-only alternatives for "${toneKey}".`;
        case "undertone-formulation":
            return ` No tone matches in ${formulationLabel ? `"${formulationLabel}"` : "this formulation"}. Showing undertone-only matches.`;
        case "undertone":
            return ` No tone matches found. Showing undertone-only alternatives for "${undertoneKey}".`;
        default:
            return " No exact or related products found. Please try adjusting your selection.";
    }
};

// STEP 1: tones
export const getTones = async (req, res) => {
    try {
        const tones = await Tone.find({ active: true })
            .sort({ order: 1, name: 1 })
            .select("_id key name swatchHex heroImages");

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
//         const runStep = async (filter) => {
//             const found = await Product.find(makeQuery(makeInsensitive(filter)))
//                 .populate("category", "name slug")
//                 .populate("brand", "name")
//                 .select("_id name price mrp quantity images summary status category brand variant variants")
//                 .lean();

//             if (!found.length) return [];

//             // ✅ Await the helper so ratings, variants, etc. are computed properly
//             return await enrichProductsUnified(found, promotions);
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
//             },
//             formulation && {
//                 filter: {
//                     "variants.familyKey": familyKey,
//                     "variants.toneKeys": toneKey,
//                     "variants.undertoneKeys": undertoneKey,
//                 },
//             },
//             formulation && {
//                 filter: {
//                     "variants.toneKeys": toneKey,
//                     "variants.undertoneKeys": undertoneKey,
//                     formulation,
//                 },
//             },
//             {
//                 filter: {
//                     "variants.toneKeys": toneKey,
//                     "variants.undertoneKeys": undertoneKey,
//                 },
//             },
//             formulation && {
//                 filter: {
//                     "variants.toneKeys": toneKey,
//                     formulation,
//                 },
//             },
//             {
//                 filter: { "variants.toneKeys": toneKey },
//             },
//             formulation && {
//                 filter: {
//                     "variants.undertoneKeys": undertoneKey,
//                     formulation,
//                 },
//             },
//             { filter: { "variants.undertoneKeys": undertoneKey } },
//         ].filter(Boolean);

//         for (const { filter } of matchSteps) {
//             enrichedProducts = await runStep(filter); // <-- IMPORTANT: await
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
            const fDoc = mongoose.Types.ObjectId.isValid(formulation)
                ? await Formulation.findById(formulation).select("name key")
                : await Formulation.findOne({ key: { $regex: `^${formulation}$`, $options: "i" } }).select("name key");

            if (fDoc) {
                formulationLabel = fDoc.name || fDoc.key;
                formulation = fDoc._id;
            } else formulation = null;
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
                if (["variants.familyKey", "variants.toneKeys", "variants.undertoneKeys"].includes(key)) {
                    mapped[key] = { $regex: `^${value}$`, $options: "i" };
                } else {
                    mapped[key] = value;
                }
            }
            return mapped;
        };

        // 🔹 Load active promotions
        const now = new Date();
        const promotions = await Promotion.find({
            status: "active",
            startDate: { $lte: now },
            endDate: { $gte: now },
        }).lean();

        const runStep = async (filter) => {
            const found = await Product.find(makeQuery(makeInsensitive(filter)))
                .populate("category", "name slug")
                .populate("brand", "name")
                .select("_id name price mrp quantity images summary status category brand variant variants")
                .lean();
            return found.length ? await enrichProductsUnified(found, promotions) : [];
        };

        // 🔹 Stepwise fallback order
        const steps = [
            { step: "exact", filter: { "variants.toneKeys": toneKey, "variants.undertoneKeys": undertoneKey, "variants.familyKey": familyKey, formulation } },
            { step: "formulation", filter: { "variants.toneKeys": toneKey, "variants.undertoneKeys": undertoneKey, "variants.familyKey": familyKey } },
            { step: "tone-formulation", filter: { "variants.toneKeys": toneKey, "variants.undertoneKeys": undertoneKey, formulation } },
            { step: "tone", filter: { "variants.toneKeys": toneKey, "variants.undertoneKeys": undertoneKey } },
            { step: "tone", filter: { "variants.toneKeys": toneKey, formulation } },
            { step: "undertone-formulation", filter: { "variants.undertoneKeys": undertoneKey, formulation } },
            { step: "undertone", filter: { "variants.undertoneKeys": undertoneKey } },
        ].filter(s => s.filter); // remove any null

        let enrichedProducts = [];
        let matchedStep = "default";

        for (const { step, filter } of steps) {
            enrichedProducts = await runStep(filter);
            if (enrichedProducts.length) {
                matchedStep = step;
                break;
            }
        }

        res.json({
            success: true,
            count: enrichedProducts.length,
            products: enrichedProducts,
            filters: { familyKey, toneKey, undertoneKey, formulation: formulationLabel },
            message: buildMessage({ step: matchedStep, familyKey, toneKey, undertoneKey, formulationLabel }),
        });
    } catch (err) {
        console.error("getRecommendations error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};
