// controllers/shadeFinderController.js
import Tone from "../../models/shade/Tone.js";
import Undertone from "../../models/shade/Undertone.js";
import Family from "../../models/shade/Family.js";
import Product from "../../models/Product.js";
import Formulation from "../../models/shade/Formulation.js"; // <-- add this
import { buildOptions, normalizeImages } from "../user/userProductController.js";
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
//         let formulation = req.query.formulation || req.query.formulations; // ✅ support both

//         if (!familyKey || !toneKey || !undertoneKey) {
//             return res.status(400).json({
//                 success: false,
//                 message: "familyKey, toneKey, and undertoneKey are required",
//             });
//         }


//         // ✅ Resolve formulation string → ObjectId
//         if (formulation) {
//             if (mongoose.Types.ObjectId.isValid(formulation)) {
//                 // already ObjectId
//                 formulation = formulation;
//             } else {
//                 const fDoc = await Formulation.findOne({
//                     key: { $regex: `^${formulation}$`, $options: "i" },
//                 });
//                 if (fDoc) {
//                     formulation = fDoc._id;
//                 } else {
//                     // No matching formulation found → ignore it
//                     formulation = null;
//                 }
//             }
//         }

//         const makeQuery = (extra = {}) => ({
//             status: { $ne: "Out of stock" },
//             "variants.isActive": true,
//             ...extra,
//         });

//         const mapProduct = (p) => {
//             const { shadeOptions, colorOptions } = buildOptions(p);
//             return {
//                 _id: p._id,
//                 name: p.name,
//                 variant: p.variant,
//                 price: p.price,
//                 category: p.category
//                     ? { _id: p.category._id, name: p.category.name, slug: p.category.slug }
//                     : null,
//                 brand: p.brand ? { _id: p.brand._id, name: p.brand.name } : null,
//                 summary: p.summary || "",
//                 status: p.status,
//                 image: p.images?.length ? normalizeImages(p.images)[0] : null,
//                 shadeOptions,
//                 colorOptions,
//                 commentsCount: p.commentsCount || 0,
//                 avgRating: p.avgRating || 0,
//             };
//         };

//         let products = [];
//         let suggestions = [];
//         let message = "";

//         // 🔹 Step helper
//         const runStep = async (filter, failMessage, type) => {
//             const found = await Product.find(makeQuery(filter))
//                 .populate("category", "name slug")
//                 .populate("brand", "name")
//                 .select(
//                     "_id name price images summary status category brand variant variants"
//                 );

//             if (found.length > 0) {
//                 if (!products.length) {
//                     suggestions.push({
//                         type,
//                         message: failMessage,
//                         products: found.map(mapProduct),
//                     });
//                     message = failMessage;
//                 }
//                 return true;
//             }
//             return false;
//         };

//         // ---------------------------
//         // Step 1 → exact match (family + tone + undertone + formulation)
//         // ---------------------------
//         let query = makeQuery({
//             "variants.familyKey": familyKey,
//             "variants.toneKeys": toneKey,
//             "variants.undertoneKeys": undertoneKey,
//             ...(formulation && { formulation }),
//         });

//         products = await Product.find(query)
//             .populate("category", "name slug")
//             .populate("brand", "name")
//             .select("_id name price images summary status category brand variant variants");

//         products = products.map(mapProduct);

//         if (products.length > 0) {
//             message = "✅ Exact matches found";
//         }

//         // ---------------------------
//         // Step 2 → ignore formulation
//         // ---------------------------
//         if (products.length === 0 && formulation) {
//             await runStep(
//                 {
//                     "variants.familyKey": familyKey,
//                     "variants.toneKeys": toneKey,
//                     "variants.undertoneKeys": undertoneKey,
//                 },
//                 `❌ No exact match in formulation "${formulation}", showing other formulations.`,
//                 "formulation"
//             );
//         }

//         // ---------------------------
//         // Step 3 → ignore family, keep tone + undertone + formulation
//         // ---------------------------
//         if (products.length === 0 && suggestions.length === 0 && formulation) {
//             await runStep(
//                 {
//                     "variants.toneKeys": toneKey,
//                     "variants.undertoneKeys": undertoneKey,
//                     formulation,
//                 },
//                 `❌ No products in family "${familyKey}" with formulation "${formulation}", showing other families.`,
//                 "family-formulation"
//             );
//         }

//         // ---------------------------
//         // Step 4 → ignore family & formulation, keep tone + undertone
//         // ---------------------------
//         if (products.length === 0 && suggestions.length === 0) {
//             await runStep(
//                 {
//                     "variants.toneKeys": toneKey,
//                     "variants.undertoneKeys": undertoneKey,
//                 },
//                 `❌ No products in family "${familyKey}", showing other families.`,
//                 "family"
//             );
//         }

//         // ---------------------------
//         // Step 5 → ignore undertone, keep tone + formulation
//         // ---------------------------
//         if (products.length === 0 && suggestions.length === 0 && formulation) {
//             await runStep(
//                 {
//                     "variants.toneKeys": toneKey,
//                     formulation,
//                 },
//                 `❌ No undertone match in formulation "${formulation}", showing tone-only matches.`,
//                 "tone-formulation"
//             );
//         }

//         // ---------------------------
//         // Step 6 → ignore undertone, keep tone
//         // ---------------------------
//         if (products.length === 0 && suggestions.length === 0) {
//             await runStep(
//                 {
//                     "variants.toneKeys": toneKey,
//                 },
//                 `❌ No undertone match, showing tone-only alternatives.`,
//                 "tone"
//             );
//         }

//         // ---------------------------
//         // Step 7 → ignore tone, keep undertone + formulation
//         // ---------------------------
//         if (products.length === 0 && suggestions.length === 0 && formulation) {
//             await runStep(
//                 {
//                     "variants.undertoneKeys": undertoneKey,
//                     formulation,
//                 },
//                 `❌ No tone match in formulation "${formulation}", showing undertone-only matches.`,
//                 "undertone-formulation"
//             );
//         }

//         // ---------------------------
//         // Step 8 → ignore tone, keep undertone
//         // ---------------------------
//         if (products.length === 0 && suggestions.length === 0) {
//             await runStep(
//                 {
//                     "variants.undertoneKeys": undertoneKey,
//                 },
//                 `❌ No tone match, showing undertone-only alternatives.`,
//                 "undertone"
//             );
//         }

//         // ---------------------------
//         // Final fallback
//         // ---------------------------
//         if (products.length === 0 && suggestions.length === 0) {
//             message =
//                 "❌ No exact or related products found, please try adjusting your selection.";
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
//         console.error("getRecommendations error:", err);
//         res.status(500).json({ success: false, message: err.message });
//     }
// };


// export const getRecommendations = async (req, res) => {
//     try {
//         const { familyKey, toneKey, undertoneKey } = req.query;
//         let formulation = req.query.formulation || req.query.formulations; // ✅ support both
//         let formulationLabel = null;

//         if (!familyKey || !toneKey || !undertoneKey) {
//             return res.status(400).json({
//                 success: false,
//                 message: "familyKey, toneKey, and undertoneKey are required",
//             });
//         }

//         // ✅ Resolve formulation string → ObjectId + label
//         if (formulation) {
//             if (mongoose.Types.ObjectId.isValid(formulation)) {
//                 const fDoc = await Formulation.findById(formulation).select("name key");
//                 if (fDoc) {
//                     formulationLabel = fDoc.name || fDoc.key;
//                     formulation = fDoc._id;
//                 } else {
//                     formulation = null;
//                 }
//             } else {
//                 const fDoc = await Formulation.findOne({
//                     key: { $regex: `^${formulation}$`, $options: "i" },
//                 }).select("name key");
//                 if (fDoc) {
//                     formulationLabel = fDoc.name || fDoc.key;
//                     formulation = fDoc._id;
//                 } else {
//                     formulation = null;
//                 }
//             }
//         }

//         const makeQuery = (extra = {}) => ({
//             status: { $ne: "Out of stock" },
//             "variants.isActive": true,
//             ...extra,
//         });

//         const mapProduct = (p) => {
//             const { shadeOptions, colorOptions } = buildOptions(p);
//             return {
//                 _id: p._id,
//                 name: p.name,
//                 variant: p.variant,
//                 price: p.price,
//                 category: p.category
//                     ? { _id: p.category._id, name: p.category.name, slug: p.category.slug }
//                     : null,
//                 brand: p.brand ? { _id: p.brand._id, name: p.brand.name } : null,
//                 summary: p.summary || "",
//                 status: p.status,
//                 image: p.images?.length ? normalizeImages(p.images)[0] : null,
//                 shadeOptions,
//                 colorOptions,
//                 commentsCount: p.commentsCount || 0,
//                 avgRating: p.avgRating || 0,
//             };
//         };

//         let products = [];
//         let suggestions = [];
//         let message = "";

//         // 🔹 Step helper
//         const runStep = async (filter, step) => {
//             const found = await Product.find(makeQuery(filter))
//                 .populate("category", "name slug")
//                 .populate("brand", "name")
//                 .select("_id name price images summary status category brand variant variants");

//             if (found.length > 0) {
//                 if (!products.length) {
//                     const failMessage = buildMessage({
//                         step,
//                         familyKey,
//                         toneKey,
//                         undertoneKey,
//                         formulationLabel,
//                     });

//                     suggestions.push({
//                         type: step,
//                         message: failMessage,
//                         products: found.map(mapProduct),
//                     });

//                     message = failMessage;
//                 }
//                 return true;
//             }
//             return false;
//         };

//         // ---------------------------
//         // Step 1 → exact match
//         // ---------------------------
//         let query = makeQuery({
//             "variants.familyKey": familyKey,
//             "variants.toneKeys": toneKey,
//             "variants.undertoneKeys": undertoneKey,
//             ...(formulation && { formulation }),
//         });

//         products = await Product.find(query)
//             .populate("category", "name slug")
//             .populate("brand", "name")
//             .select("_id name price images summary status category brand variant variants");

//         products = products.map(mapProduct);

//         if (products.length > 0) {
//             message = buildMessage({
//                 step: "exact",
//                 familyKey,
//                 toneKey,
//                 undertoneKey,
//                 formulationLabel,
//             });
//         }

//         // ---------------------------
//         // Step 2 → ignore formulation
//         // ---------------------------
//         if (products.length === 0 && formulation) {
//             await runStep(
//                 {
//                     "variants.familyKey": familyKey,
//                     "variants.toneKeys": toneKey,
//                     "variants.undertoneKeys": undertoneKey,
//                 },
//                 "formulation"
//             );
//         }

//         // ---------------------------
//         // Step 3 → ignore family, keep tone + undertone + formulation
//         // ---------------------------
//         if (products.length === 0 && suggestions.length === 0 && formulation) {
//             await runStep(
//                 {
//                     "variants.toneKeys": toneKey,
//                     "variants.undertoneKeys": undertoneKey,
//                     formulation,
//                 },
//                 "family-formulation"
//             );
//         }

//         // ---------------------------
//         // Step 4 → ignore family & formulation, keep tone + undertone
//         // ---------------------------
//         if (products.length === 0 && suggestions.length === 0) {
//             await runStep(
//                 {
//                     "variants.toneKeys": toneKey,
//                     "variants.undertoneKeys": undertoneKey,
//                 },
//                 "family"
//             );
//         }

//         // ---------------------------
//         // Step 5 → ignore undertone, keep tone + formulation
//         // ---------------------------
//         if (products.length === 0 && suggestions.length === 0 && formulation) {
//             await runStep(
//                 {
//                     "variants.toneKeys": toneKey,
//                     formulation,
//                 },
//                 "tone-formulation"
//             );
//         }

//         // ---------------------------
//         // Step 6 → ignore undertone, keep tone
//         // ---------------------------
//         if (products.length === 0 && suggestions.length === 0) {
//             await runStep(
//                 {
//                     "variants.toneKeys": toneKey,
//                 },
//                 "tone"
//             );
//         }

//         // ---------------------------
//         // Step 7 → ignore tone, keep undertone + formulation
//         // ---------------------------
//         if (products.length === 0 && suggestions.length === 0 && formulation) {
//             await runStep(
//                 {
//                     "variants.undertoneKeys": undertoneKey,
//                     formulation,
//                 },
//                 "undertone-formulation"
//             );
//         }

//         // ---------------------------
//         // Step 8 → ignore tone, keep undertone
//         // ---------------------------
//         if (products.length === 0 && suggestions.length === 0) {
//             await runStep(
//                 {
//                     "variants.undertoneKeys": undertoneKey,
//                 },
//                 "undertone"
//             );
//         }

//         // ---------------------------
//         // Final fallback
//         // ---------------------------
//         if (products.length === 0 && suggestions.length === 0) {
//             message = buildMessage({ step: "default" });
//         }

//         res.json({
//             success: true,
//             count: products.length,
//             products,
//             filters: { familyKey, toneKey, undertoneKey, formulation: formulationLabel },
//             message,
//             suggestions,
//         });
//     } catch (err) {
//         console.error("getRecommendations error:", err);
//         res.status(500).json({ success: false, message: err.message });
//     }
// };

export const getRecommendations = async (req, res) => {
    try {
        const { familyKey, toneKey, undertoneKey } = req.query;
        let formulation = req.query.formulation || req.query.formulations; // ✅ support both
        let formulationLabel = null;

        if (!familyKey || !toneKey || !undertoneKey) {
            return res.status(400).json({
                success: false,
                message: "familyKey, toneKey, and undertoneKey are required",
            });
        }

        // ✅ Resolve formulation string → ObjectId + label
        if (formulation) {
            if (mongoose.Types.ObjectId.isValid(formulation)) {
                const fDoc = await Formulation.findById(formulation).select("name key");
                if (fDoc) {
                    formulationLabel = fDoc.name || fDoc.key;
                    formulation = fDoc._id;
                } else {
                    formulation = null;
                }
            } else {
                const fDoc = await Formulation.findOne({
                    key: { $regex: `^${formulation}$`, $options: "i" },
                }).select("name key");
                if (fDoc) {
                    formulationLabel = fDoc.name || fDoc.key;
                    formulation = fDoc._id;
                } else {
                    formulation = null;
                }
            }
        }

        const makeQuery = (extra = {}) => ({
            status: { $ne: "Out of stock" },
            "variants.isActive": true,
            ...extra,
        });

        const makeInsensitive = (filter) => {
            const mapped = {};
            for (let [key, value] of Object.entries(filter)) {
                if (
                    ["variants.familyKey", "variants.toneKeys", "variants.undertoneKeys"].includes(
                        key
                    )
                ) {
                    mapped[key] = { $regex: `^${value}$`, $options: "i" };
                } else {
                    mapped[key] = value;
                }
            }
            return mapped;
        };

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

        // 🔹 Step helper
        const runStep = async (filter, step) => {
            const found = await Product.find(makeQuery(makeInsensitive(filter)))
                .populate("category", "name slug")
                .populate("brand", "name")
                .select("_id name price images summary status category brand variant variants");

            if (found.length > 0) {
                if (!products.length) {
                    const failMessage = buildMessage({
                        step,
                        familyKey,
                        toneKey,
                        undertoneKey,
                        formulationLabel,
                    });

                    suggestions.push({
                        type: step,
                        message: failMessage,
                        products: found.map(mapProduct),
                    });

                    message = failMessage;
                }
                return true;
            }
            return false;
        };

        // ---------------------------
        // Step 1 → exact match
        // ---------------------------
        let query = makeQuery(
            makeInsensitive({
                "variants.familyKey": familyKey,
                "variants.toneKeys": toneKey,
                "variants.undertoneKeys": undertoneKey,
                ...(formulation && { formulation }),
            })
        );

        products = await Product.find(query)
            .populate("category", "name slug")
            .populate("brand", "name")
            .select("_id name price images summary status category brand variant variants");

        products = products.map(mapProduct);

        if (products.length > 0) {
            message = buildMessage({
                step: "exact",
                familyKey,
                toneKey,
                undertoneKey,
                formulationLabel,
            });
        }

        // ---------------------------
        // Step 2 → ignore formulation
        // ---------------------------
        if (products.length === 0 && formulation) {
            await runStep(
                {
                    "variants.familyKey": familyKey,
                    "variants.toneKeys": toneKey,
                    "variants.undertoneKeys": undertoneKey,
                },
                "formulation"
            );
        }

        // ---------------------------
        // Step 3 → ignore family, keep tone + undertone + formulation
        // ---------------------------
        if (products.length === 0 && suggestions.length === 0 && formulation) {
            await runStep(
                {
                    "variants.toneKeys": toneKey,
                    "variants.undertoneKeys": undertoneKey,
                    formulation,
                },
                "family-formulation"
            );
        }

        // ---------------------------
        // Step 4 → ignore family & formulation, keep tone + undertone
        // ---------------------------
        if (products.length === 0 && suggestions.length === 0) {
            await runStep(
                {
                    "variants.toneKeys": toneKey,
                    "variants.undertoneKeys": undertoneKey,
                },
                "family"
            );
        }

        // ---------------------------
        // Step 5 → ignore undertone, keep tone + formulation
        // ---------------------------
        if (products.length === 0 && suggestions.length === 0 && formulation) {
            await runStep(
                {
                    "variants.toneKeys": toneKey,
                    formulation,
                },
                "tone-formulation"
            );
        }

        // ---------------------------
        // Step 6 → ignore undertone, keep tone
        // ---------------------------
        if (products.length === 0 && suggestions.length === 0) {
            await runStep(
                {
                    "variants.toneKeys": toneKey,
                },
                "tone"
            );
        }

        // ---------------------------
        // Step 7 → ignore tone, keep undertone + formulation
        // ---------------------------
        if (products.length === 0 && suggestions.length === 0 && formulation) {
            await runStep(
                {
                    "variants.undertoneKeys": undertoneKey,
                    formulation,
                },
                "undertone-formulation"
            );
        }

        // ---------------------------
        // Step 8 → ignore tone, keep undertone
        // ---------------------------
        if (products.length === 0 && suggestions.length === 0) {
            await runStep(
                {
                    "variants.undertoneKeys": undertoneKey,
                },
                "undertone"
            );
        }

        // ---------------------------
        // Final fallback
        // ---------------------------
        if (products.length === 0 && suggestions.length === 0) {
            message = buildMessage({ step: "default" });
        }

        res.json({
            success: true,
            count: products.length,
            products,
            filters: { familyKey, toneKey, undertoneKey, formulation: formulationLabel },
            message,
            suggestions,
        });
    } catch (err) {
        console.error("getRecommendations error:", err);
        res.status(500).json({ success: false, message: err.message });
    }
};