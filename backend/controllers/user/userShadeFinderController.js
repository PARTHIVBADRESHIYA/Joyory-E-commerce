// controllers/shadeFinderController.js
import Tone from "../../models/shade/Tone.js";
import Undertone from "../../models/shade/Undertone.js";
import Family from "../../models/shade/Family.js";
import Product from "../../models/Product.js";
import { buildOptions, normalizeImages } from "../user/userProductController.js";

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
            "foundationVariants.familyKey": familyKey,
            "foundationVariants.toneKeys": toneKey,
            "foundationVariants.undertoneKeys": undertoneKey,
            "foundationVariants.isActive": true, // ✅ active shades only
        }).select("formulation");

        const formulations = [...new Set(products.map((p) => p.formulation))];

        res.json({ success: true, formulations });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};



// STEP 5: recommendations (products + variants)
// export const getRecommendations = async (req, res) => {
//     try {
//         const { familyKey, toneKey, undertoneKey, formulation } = req.query;

//         if (!familyKey || !toneKey || !undertoneKey) {
//             return res.status(400).json({
//                 success: false,
//                 message: "familyKey, toneKey, and undertoneKey are required",
//             });
//         }

//         // Base match (core shade criteria)
//         const baseMatch = {
//             status: "In-stock",
//             "foundationVariants.familyKey": familyKey,
//             "foundationVariants.toneKeys": toneKey,
//             "foundationVariants.undertoneKeys": undertoneKey,
//             "foundationVariants.isActive": true,
//         };

//         // Primary query → include formulation
//         let query = { ...baseMatch };
//         if (formulation) query.formulation = formulation;

//         let products = await Product.find(query).select(
//             "_id name price formulation images foundationVariants"
//         );

//         let message = "✅ Exact matches found";
//         let suggestions = [];

//         // ---------------------------
//         // FALLBACK 1 → ignore formulation
//         // ---------------------------
//         if (products.length === 0 && formulation) {
//             message = "❌ No exact product matches your selection";

//             const altProducts = await Product.find(baseMatch).select(
//                 "_id name price formulation images foundationVariants"
//             );

//             if (altProducts.length > 0) {
//                 suggestions.push({
//                     type: "formulation",
//                     message: `We couldn’t find products in "${formulation}", but found these in other formulations.`,
//                     products: altProducts,
//                 });

//                 // ✅ stop here, don’t run further fallbacks
//                 return res.json({
//                     success: true,
//                     count: 0,
//                     products: [],
//                     filters: { familyKey, toneKey, undertoneKey, formulation },
//                     message,
//                     suggestions,
//                 });
//             }
//         }

//         // ---------------------------
//         // FALLBACK 2 → ignore familyKey, keep tone + undertone
//         // ---------------------------
//         if (products.length === 0) {
//             const broaderMatch = {
//                 status: "In-stock",
//                 "foundationVariants.toneKeys": toneKey,
//                 "foundationVariants.undertoneKeys": undertoneKey,
//                 "foundationVariants.isActive": true,
//             };

//             const altProducts = await Product.find(broaderMatch).select(
//                 "_id name price formulation images foundationVariants"
//             );

//             if (altProducts.length > 0) {
//                 message = "❌ No exact product matches your selection";
//                 suggestions.push({
//                     type: "family",
//                     message: `No products in family "${familyKey}", but we found alternatives in other families.`,
//                     products: altProducts,
//                 });
//             }
//         }

//         // ---------------------------
//         // If still nothing → global fallback
//         // ---------------------------
//         if (products.length === 0 && suggestions.length === 0) {
//             message = "❌ No exact or related products found, please try adjusting your selection.";
//         }

//         res.json({
//             success: true,
//             count: products.length,
//             products,
//             filters: { familyKey, toneKey, undertoneKey, formulation },
//             message,
//             suggestions,
//         });
//     } catch (err) {
//         res.status(500).json({ success: false, message: err.message });
//     }
// };


export const getRecommendations = async (req, res) => {
    try {
        const { familyKey, toneKey, undertoneKey, formulation } = req.query;

        if (!familyKey || !toneKey || !undertoneKey) {
            return res.status(400).json({
                success: false,
                message: "familyKey, toneKey, and undertoneKey are required",
            });
        }

        const makeQuery = (extra = {}) => ({
            status: { $ne: "Out of stock" },
            "foundationVariants.isActive": true,
            ...extra,
        });

        const mapProduct = (p) => {
            const { shadeOptions, colorOptions } = buildOptions(p);
            return {
                _id: p._id,
                name: p.name,
                variant: p.variant,
                price: p.price,
                category: p.category
                    ? { _id: p.category._id, name: p.category.name, slug: p.category.slug }
                    : null,
                brand: p.brand ? { _id: p.brand._id, name: p.brand.name } : null,
                summary: p.summary || "",
                status: p.status,
                image: p.images?.length ? normalizeImages(p.images)[0] : null,
                shadeOptions,
                colorOptions,
                commentsCount: p.commentsCount || 0,
                avgRating: p.avgRating || 0,
            };
        };

        let products = [];
        let suggestions = [];
        let message = "";

        // ---------------------------
        // Step 1 → exact match (with formulation if given)
        // ---------------------------
        let query = makeQuery({
            "foundationVariants.familyKey": familyKey,
            "foundationVariants.toneKeys": toneKey,
            "foundationVariants.undertoneKeys": undertoneKey,
            ...(formulation && { formulation }),
        });

        products = await Product.find(query)
            .populate("category", "name slug")
            .populate("brand", "name")
            .select("_id name price images summary status category brand variant foundationVariants");

        products = products.map(mapProduct);

        if (products.length > 0) {
            message = "✅ Exact matches found";
        }

        // ---------------------------
        // Step 2 → ignore formulation
        // ---------------------------
        if (products.length === 0 && formulation) {
            const altProducts = await Product.find(
                makeQuery({
                    "foundationVariants.familyKey": familyKey,
                    "foundationVariants.toneKeys": toneKey,
                    "foundationVariants.undertoneKeys": undertoneKey,
                })
            )
                .populate("category", "name slug")
                .populate("brand", "name")
                .select("_id name price images summary status category brand variant foundationVariants");

            if (altProducts.length > 0) {
                message = "❌ No exact match in this formulation";
                suggestions.push({
                    type: "formulation",
                    message: `We couldn’t find products in"${formulation}", but found these in other formulations.`,
                    products: altProducts.map(mapProduct),
                });
            }
        }

        // ---------------------------
        // Step 3 → ignore family
        // ---------------------------
        if (products.length === 0 && suggestions.length === 0) {
            const altProducts = await Product.find(
                makeQuery({
                    "foundationVariants.toneKeys": toneKey,
                    "foundationVariants.undertoneKeys": undertoneKey,
                })
            )
                .populate("category", "name slug")
                .populate("brand", "name")
                .select("_id name price images summary status category brand variant foundationVariants");

            if (altProducts.length > 0) {
                message = "❌ No products in this family, showing related alternatives";
                suggestions.push({
                    type: "family",
                    message: `No products in family"${familyKey}", but we found alternatives in other families with same tone + undertone.`,
                    products: altProducts.map(mapProduct),
                });
            }
        }

        // ---------------------------
        // Step 4 → ignore undertone, keep tone
        // ---------------------------
        if (products.length === 0 && suggestions.length === 0) {
            const altProducts = await Product.find(
                makeQuery({
                    "foundationVariants.toneKeys": toneKey,
                })
            )
                .populate("category", "name slug")
                .populate("brand", "name")
                .select("_id name price images summary status category brand variant foundationVariants");

            if (altProducts.length > 0) {
                message = "❌ No exact undertone match, showing tone-only alternatives";
                suggestions.push({
                    type: "tone",
                    message: `Couldn’t find undertone"${undertoneKey}", but here are products for tone "${toneKey}".`,
                    products: altProducts.map(mapProduct),
                });
            }
        }

        // ---------------------------
        // Step 5 → ignore tone, keep undertone
        // ---------------------------
        if (products.length === 0 && suggestions.length === 0) {
            const altProducts = await Product.find(
                makeQuery({
                    "foundationVariants.undertoneKeys": undertoneKey,
                })
            )
                .populate("category", "name slug")
                .populate("brand", "name")
                .select("_id name price images summary status category brand variant foundationVariants");

            if (altProducts.length > 0) {
                message = "❌ No exact tone match, showing undertone-only alternatives";
                suggestions.push({
                    type: "undertone",
                    message: `Couldn’t find tone"${toneKey}", but here are products for undertone "${undertoneKey}".`,
                    products: altProducts.map(mapProduct),
                });
            }
        }

        // ---------------------------
        // Final fallback
        // ---------------------------
        if (products.length === 0 && suggestions.length === 0) {
            message = "❌ No exact or related products found, please try adjusting your selection.";
        }

        res.json({
            success: true,
            count: products.length,
            products,
            filters: { familyKey, toneKey, undertoneKey, formulation },
            message,
            suggestions,
        });
    } catch (err) {
        console.error("getRecommendations error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};
