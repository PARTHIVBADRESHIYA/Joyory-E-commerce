import util from 'util';
import Product from '../models/Product.js';
import Brand from '../models/Brand.js';
import SkinType from '../models/SkinType.js';
import cloudinary from '../middlewares/utils/cloudinary.js';
import Category from '../models/Category.js';
import Formulation from '../models/shade/Formulation.js';
import mongoose from 'mongoose';
import moment from 'moment-timezone';
// at top of admin controller file
import { uploadToCloudinary } from '../middlewares/upload.js';
import { clearProductCacheForId, clearAllProductCaches } from '../middlewares/utils/cacheUtils.js';
import { generateUniqueSlug } from "../middlewares/utils/slug.js";

// utils/normalizeVariant.js
export function normalizeVariant(variant) {
    if (!variant) return "";

    return variant
        .toString()
        .toLowerCase()

        // normalize number + unit (ml, g, kg, l)
        .replace(/(\d+)\s*(ml|m l|ML|Ml|mL)\b/g, "$1 ml")
        .replace(/(\d+)\s*(g|gm|grams?)\b/g, "$1 g")
        .replace(/(\d+)\s*(kg|kilograms?)\b/g, "$1 kg")
        .replace(/(\d+)\s*(l|litre|liter|liters?)\b/g, "$1 l")

        // collapse multiple spaces
        .replace(/\s+/g, " ")

        .trim();
}
// utils/normalizeText.js
export function normalizeText(value) {
    if (!value) return "";

    return value
        .toString()
        .toLowerCase()

        // normalize number + units
        .replace(/(\d+)\s*(ml|m\s*l)\b/gi, "$1 ml")
        .replace(/(\d+)\s*(g|gm|grams?)\b/gi, "$1 g")
        .replace(/(\d+)\s*(kg|kilograms?)\b/gi, "$1 kg")
        .replace(/(\d+)\s*(l|litre|liter|liters?)\b/gi, "$1 l")

        // collapse multiple spaces
        .replace(/\s+/g, " ")

        .trim();
}

// -----------------------------
// Helper: computeWarehouseStock
// -----------------------------
const computeWarehouseStock = (variant, brand) => {
    if (!Array.isArray(variant.stockByWarehouse)) variant.stockByWarehouse = [];

    const validCodes = new Set((brand?.warehouses || []).map(w => w.code));

    // Filter out invalid warehouse codes (brand-driven) and normalize stock numbers
    variant.stockByWarehouse = variant.stockByWarehouse
        .filter(w => validCodes.has(w.warehouseCode))
        .map(w => ({
            warehouseCode: w.warehouseCode,
            stock: Number(w.stock) || 0
        }));

    const totalStock = variant.stockByWarehouse.reduce((sum, w) => sum + w.stock, 0);

    variant.stock = totalStock;   // ALWAYS override global stock

    return variant;
};

// -----------------------------
// Helper: parseMultipartVariants
// Builds variant objects if client sent multipart form fields like variants[0][sku]
// -----------------------------
const parseMultipartVariants = (body) => {
    // if body already provides an array, return it
    if (Array.isArray(body.variants)) return body.variants;

    // collect keys that look like variants[<i>][<key>]
    const variantPattern = /^variants\[(\d+)\]\[([^\]]+)\]$/;
    const variantsMap = new Map();

    Object.keys(body || {}).forEach(k => {
        const m = k.match(variantPattern);
        if (!m) return;
        const idx = Number(m[1]);
        const key = m[2];

        if (!variantsMap.has(idx)) variantsMap.set(idx, {});
        // store raw string value (could be JSON strings for arrays)
        variantsMap.get(idx)[key] = body[k];
    });

    // convert map to array in index order
    if (variantsMap.size === 0) return [];

    const arr = Array.from(variantsMap.keys())
        .sort((a, b) => a - b)
        .map(idx => variantsMap.get(idx));

    return arr;
};


export const resolveFormulationId = async (input) => {
    if (!input) return null;
    const formulationInput = String(input).trim();

    if (mongoose.Types.ObjectId.isValid(formulationInput)) {
        return formulationInput;
    }

    const formulationDoc = await Formulation.findOne({
        key: { $regex: `^${formulationInput}$`, $options: "i" }
    });

    if (!formulationDoc) {
        throw new Error(`Formulation "${formulationInput}" not found`);
    }

    return formulationDoc._id;
};

// the add-product is complete with 5/12/2025
// const addProductController = async (req, res) => {
//     try {
//         const {
//             name,
//             variant,
//             summary,
//             description,
//             ingredients,
//             features,
//             howToUse,
//             price,
//             buyingPrice,
//             brand,
//             category,
//             categories,
//             quantity,
//             expiryDate,
//             scheduledAt,
//             productTags: rawTags,
//             variants: rawVariants,
//             thresholdValue: rawThresholdValue,
//             formulation,
//             seller,
//         } = req.body;

//         // ---------------- Basic Validations ----------------
//         if (!name)
//             return res.status(400).json({ message: "Product name is required" });

//         const existingProduct = await Product.findOne({ name: name.trim() });
//         if (existingProduct)
//             return res.status(400).json({ message: `Product with name "${name}" already exists` });

//         if (!category && (!categories || categories.length === 0)) {
//             return res.status(400).json({ message: "Category is required" });
//         }

//         // ---------------- Handle Scheduling ----------------
//         let isPublished = true;
//         let scheduleDate = null;
//         if (scheduledAt) {
//             // User enters IST time (local)
//             const parsedDateIST = moment.tz(scheduledAt, "YYYY-MM-DD HH:mm", "Asia/Kolkata");

//             if (!parsedDateIST.isValid()) {
//                 return res.status(400).json({ message: "❌ Invalid scheduledAt date format. Use YYYY-MM-DD HH:mm (IST)" });
//             }

//             // Convert IST to UTC before saving
//             const parsedDateUTC = parsedDateIST.clone().tz("UTC").toDate();

//             if (parsedDateUTC > new Date()) {
//                 isPublished = false;
//                 scheduleDate = parsedDateUTC; // ✅ saved in UTC
//             }
//         }

//         // ---------------- Resolve Categories ----------------
//         let finalCategories = categories && categories.length
//             ? (Array.isArray(categories) ? categories : [categories])
//             : [category];

//         const resolvedCategories = [];
//         for (let cat of finalCategories) {
//             if (!cat) continue;
//             const trimmed = String(cat).trim();
//             if (mongoose.Types.ObjectId.isValid(trimmed)) {
//                 resolvedCategories.push(trimmed);
//             } else {
//                 const foundCat = await Category.findOne({ name: { $regex: `^${trimmed}$`, $options: "i" } });
//                 if (!foundCat)
//                     return res.status(400).json({ message: `Category "${trimmed}" not found` });
//                 resolvedCategories.push(foundCat._id);
//             }
//         }

//         const foundCategories = await Category.find({ _id: { $in: resolvedCategories } });
//         if (foundCategories.length !== resolvedCategories.length)
//             return res.status(400).json({ message: "One or more category IDs are invalid" });

//         // ---------------- Build Hierarchy ----------------
//         const buildCategoryHierarchy = async (leafId) => {
//             const hierarchy = [];
//             let current = await Category.findById(leafId);
//             while (current) {
//                 hierarchy.unshift(current._id);
//                 if (!current.parent) break;
//                 current = await Category.findById(current.parent);
//             }
//             return hierarchy;
//         };
//         const categoryHierarchy = await buildCategoryHierarchy(resolvedCategories[0]);

//         // ---------------- Parse Tags ----------------
//         let productTags = [];
//         try {
//             productTags = rawTags
//                 ? (typeof rawTags === "string" ? JSON.parse(rawTags) : rawTags)
//                 : [];
//         } catch {
//             productTags = [];
//         }

//         // ---------------- Price Validations ----------------
//         const parsedPrice = Number(price);
//         const parsedBuyingPrice = Number(buyingPrice);
//         // ---------------- Variants ----------------
//         let variants = [];
//         let shadeOptions = [];
//         let colorOptions = [];
//         let images = [];

//         try {
//             let variantArray = rawVariants
//                 ? (typeof rawVariants === "string" ? JSON.parse(rawVariants) : rawVariants)
//                 : [];

//             if (variantArray.length > 0) {
//                 // ✅ Variant Product Rules
//                 if (quantity || rawThresholdValue || req.body.images || req.body.imageUrls) {
//                     return res.status(400).json({
//                         message: "❌ For variant products, do NOT provide global quantity, thresholdValue or images. Use variants only.",
//                     });
//                 }

//                 // ✅ Validate all variants first
//                 const skuSet = new Set();
//                 for (let i = 0; i < variantArray.length; i++) {
//                     const v = variantArray[i];
//                     if (!v.sku) throw new Error(`Variant ${i + 1} is missing SKU`);
//                     if (skuSet.has(v.sku))
//                         throw new Error(`Duplicate SKU "${v.sku}" found`);
//                     skuSet.add(v.sku);

//                     if (v.stock === undefined || isNaN(Number(v.stock)))
//                         throw new Error(`Variant ${v.sku} must have valid stock`);
//                     if (v.thresholdValue === undefined || isNaN(Number(v.thresholdValue)))
//                         throw new Error(`Variant ${v.sku} must have thresholdValue`);
//                 }

//                 // ✅ Upload variant images and build variant array
//                 variants = await Promise.all(
//                     variantArray.map(async (v, i) => {
//                         const uploadedImages = [];
//                         const variantFiles = req.files?.filter(
//                             (f) => f.fieldname === `variants[${i}][images]`
//                         ) || [];

//                         for (const file of variantFiles) {
//                             const result = await uploadToCloudinary(file.buffer, "products/variants", "image");
//                             uploadedImages.push(result.secure_url);
//                         }

//                         const combinedImages = [
//                             ...(Array.isArray(v.images) ? v.images : []),
//                             ...uploadedImages,
//                         ];

//                         if (combinedImages.length === 0)
//                             throw new Error(`Variant ${v.sku} must have at least one image`);

//                         const brandDoc = await Brand.findById(brand);

//                         return computeWarehouseStock({
//                             ...v,
//                             stockByWarehouse: Array.isArray(v.stockByWarehouse)
//                                 ? v.stockByWarehouse
//                                 : [],
//                             sales: Number(v.sales) || 0,
//                             thresholdValue: Number(v.thresholdValue),
//                             discountedPrice:
//                                 v.discountedPrice !== undefined
//                                     ? Number(v.discountedPrice)
//                                     : null,
//                             images: combinedImages.slice(-8),
//                             isActive: v.isActive !== false,
//                             createdAt: new Date(),
//                         }, brandDoc);

//                     })
//                 );

//                 shadeOptions = variants.map((v) => v.shadeName).filter(Boolean);
//                 colorOptions = variants.map((v) => v.hex).filter(Boolean);
//             } else {
//                 // ✅ Non-Variant Product Rules
//                 if (quantity === undefined)
//                     return res.status(400).json({
//                         message: "❌ quantity is required for non-variant products",
//                     });
//                 if (rawThresholdValue === undefined)
//                     return res.status(400).json({
//                         message: "❌ thresholdValue is required for non-variant products",
//                     });

//                 // ✅ Upload global product images
//                 const mainFiles = req.files?.filter((f) => f.fieldname === "images") || [];
//                 for (const file of mainFiles) {
//                     const result = await cloudinary.uploader.upload(file.path, {
//                         folder: "products",
//                     });
//                     images.push(result.secure_url);
//                 }

//                 if (req.body.imageUrls) {
//                     let urls =
//                         typeof req.body.imageUrls === "string"
//                             ? JSON.parse(req.body.imageUrls)
//                             : req.body.imageUrls;
//                     for (const url of urls) images.push(url);
//                 }

//                 if (images.length === 0)
//                     return res.status(400).json({
//                         message: "❌ Non-variant products must have at least one global image",
//                     });
//             }
//         } catch (err) {
//             console.error("❌ Variants parsing error:", err);
//             return res.status(400).json({ message: err.message });
//         }

//         // ---------------- Compute Stock Status ----------------
//         const totalQuantity =
//             variants.length > 0
//                 ? variants.reduce((sum, v) => sum + (v.stock || 0), 0)
//                 : Number(quantity);

//         let status =
//             totalQuantity === 0
//                 ? "Out of stock"
//                 : totalQuantity < Number(rawThresholdValue)
//                     ? "Low stock"
//                     : "In-stock";

//         // ---------------- Create Product ----------------
//         const product = new Product({
//             name,
//             variant,
//             summary,
//             description,
//             ingredients,
//             features,
//             howToUse,
//             price: parsedPrice,
//             buyingPrice: parsedBuyingPrice,
//             quantity: variants.length > 0 ? undefined : Number(quantity),
//             thresholdValue: variants.length > 0 ? undefined : Number(rawThresholdValue),
//             expiryDate,
//             images: variants.length > 0 ? undefined : images,
//             brand,
//             category: resolvedCategories[0],
//             categories: resolvedCategories,
//             categoryHierarchy,
//             status,
//             productTags,
//             shadeOptions,
//             colorOptions,
//             variants,
//             isPublished,
//             scheduledAt: scheduleDate,
//             seller: seller || null,
//         });

//         await product.save();

//         // Clear cache for this product (and optionally global product lists)
//         await clearProductCacheForId(product._id);

//         return res.status(201).json({
//             message: "✅ Product created successfully",
//             product,
//         });
//     } catch (error) {
//         console.error(
//             "❌ Product placement error:",
//             util.inspect(error, { showHidden: false, depth: null })
//         );
//         return res.status(500).json({
//             message: "❌ Product placement failed",
//             error: error.message,
//         });
//     }
// };


const addProductController = async (req, res) => {
    try {
        const {
            name,
            variant,
            summary,
            description,
            ingredients,
            features,
            howToUse,
            price,
            buyingPrice,
            brand,
            category,
            categories,
            expiryDate,
            scheduledAt,
            productTags: rawTags,
            variants: rawVariants,
            formulation,
            skinType,          // <-- add this
            seller,
        } = req.body;

        // ---------------- Basic Validations ----------------
        if (!name)
            return res.status(400).json({ message: "Product name is required" });

        if (!category && (!categories || categories.length === 0)) {
            return res.status(400).json({ message: "Category is required" });
        }

        // ---------------- Handle Scheduling ----------------
        let isPublished = true;
        let scheduleDate = null;
        if (scheduledAt) {
            const parsedDateIST = moment.tz(scheduledAt, "YYYY-MM-DD HH:mm", "Asia/Kolkata");

            if (!parsedDateIST.isValid()) {
                return res.status(400).json({ message: "❌ Invalid scheduledAt date format. Use YYYY-MM-DD HH:mm (IST)" });
            }

            const parsedDateUTC = parsedDateIST.clone().tz("UTC").toDate();

            if (parsedDateUTC > new Date()) {
                isPublished = false;
                scheduleDate = parsedDateUTC;
            }
        }

        // ---------------- Resolve Categories ----------------
        let finalCategories = categories && categories.length
            ? (Array.isArray(categories) ? categories : [categories])
            : [category];

        const resolvedCategories = [];
        for (let cat of finalCategories) {
            if (!cat) continue;
            const trimmed = String(cat).trim();
            if (mongoose.Types.ObjectId.isValid(trimmed)) {
                resolvedCategories.push(trimmed);
            } else {
                const foundCat = await Category.findOne({ name: { $regex: `^${trimmed}$`, $options: "i" } });
                if (!foundCat)
                    return res.status(400).json({ message: `Category "${trimmed}" not found` });
                resolvedCategories.push(foundCat._id);
            }
        }

        const foundCategories = await Category.find({ _id: { $in: resolvedCategories } });
        if (foundCategories.length !== resolvedCategories.length)
            return res.status(400).json({ message: "One or more category IDs are invalid" });

        // ---------------- Build Hierarchy ----------------
        const buildCategoryHierarchy = async (leafId) => {
            const hierarchy = [];
            let current = await Category.findById(leafId);
            while (current) {
                hierarchy.unshift(current._id);
                if (!current.parent) break;
                current = await Category.findById(current.parent);
            }
            return hierarchy;
        };
        const categoryHierarchy = await buildCategoryHierarchy(resolvedCategories[0]);

        // ---------------- Parse Formulation ----------------
        let finalFormulation = null;
        if (formulation) {
            finalFormulation = mongoose.Types.ObjectId.isValid(formulation) ? formulation : null;
        }

        // ---------------- Parse Skin Types ----------------
        let skinTypesArray = [];
        if (req.body.skinTypes) {
            try {
                if (typeof req.body.skinTypes === "string") {
                    skinTypesArray = JSON.parse(req.body.skinTypes);
                } else if (Array.isArray(req.body.skinTypes)) {
                    skinTypesArray = req.body.skinTypes;
                } else {
                    skinTypesArray = [req.body.skinTypes];
                }
            } catch {
                skinTypesArray = [req.body.skinTypes]; // fallback for single string
            }

            // Only keep valid ObjectIds
            skinTypesArray = skinTypesArray.filter(id => mongoose.Types.ObjectId.isValid(id));
        }

        // ---------------- Parse Expiry Date ----------------
        let finalExpiryDate = null;
        if (expiryDate) {
            const parsedDate = new Date(expiryDate);
            if (!isNaN(parsedDate)) {
                finalExpiryDate = parsedDate;
            }
        }

        // ---------------- Parse Tags ----------------
        let productTags = [];
        try {
            productTags = rawTags
                ? (typeof rawTags === "string" ? JSON.parse(rawTags) : rawTags)
                : [];
        } catch {
            productTags = [];
        }

        // ---------------- Price Validations ----------------
        const parsedPrice = Number(price);
        const parsedBuyingPrice = Number(buyingPrice);

        // ---------------- Variants ----------------
        let variants = [];
        let shadeOptions = [];
        let colorOptions = [];
        let images = [];

        try {
            let variantArray = rawVariants
                ? (typeof rawVariants === "string" ? JSON.parse(rawVariants) : rawVariants)
                : [];

            if (variantArray.length > 0) {
                // ✅ Variant Product Rules
                // Removed global quantity, thresholdValue, and images validation

                // ✅ Validate all variants first
                const skuSet = new Set();
                for (let i = 0; i < variantArray.length; i++) {
                    const v = variantArray[i];
                    if (!v.sku) throw new Error(`Variant ${i + 1} is missing SKU`);
                    if (skuSet.has(v.sku))
                        throw new Error(`Duplicate SKU "${v.sku}" found`);
                    skuSet.add(v.sku);

                    if (v.stock === undefined || isNaN(Number(v.stock)))
                        throw new Error(`Variant ${v.sku} must have valid stock`);
                    if (v.thresholdValue === undefined || isNaN(Number(v.thresholdValue)))
                        throw new Error(`Variant ${v.sku} must have thresholdValue`);
                }

                // ✅ Upload variant images and build variant array
                variants = await Promise.all(
                    variantArray.map(async (v, i) => {
                        const uploadedImages = [];
                        const variantFiles = req.files?.filter(
                            (f) => f.fieldname === `variants[${i}][images]`
                        ) || [];

                        for (const file of variantFiles) {
                            const result = await uploadToCloudinary(file.buffer, "products/variants", "image");
                            uploadedImages.push(result.secure_url);
                        }

                        const combinedImages = [
                            ...(Array.isArray(v.images) ? v.images : []),
                            ...uploadedImages,
                        ];

                        if (combinedImages.length === 0)
                            throw new Error(`Variant ${v.sku} must have at least one image`);

                        const brandDoc = await Brand.findById(brand);

                        return computeWarehouseStock({
                            ...v,
                            shadeName: normalizeVariant(v.shadeName),

                            stockByWarehouse: Array.isArray(v.stockByWarehouse)
                                ? v.stockByWarehouse
                                : [],
                            sales: Number(v.sales) || 0,
                            thresholdValue: Number(v.thresholdValue),
                            discountedPrice:
                                v.discountedPrice !== undefined
                                    ? Number(v.discountedPrice)
                                    : null,
                            images: combinedImages.slice(-8),
                            isActive: v.isActive !== false,
                            createdAt: new Date(),
                        }, brandDoc);

                    })
                );

                shadeOptions = variants.map((v) => v.shadeName).filter(Boolean);
                colorOptions = variants.map((v) => v.hex).filter(Boolean);
            }

        } catch (err) {
            console.error("❌ Variants parsing error:", err);
            return res.status(400).json({ message: err.message });
        }

        // ---------------- Compute Stock Status ----------------
        const totalQuantity =
            variants.length > 0
                ? variants.reduce((sum, v) => sum + (v.stock || 0), 0)
                : 0; // No global quantity

        let status =
            totalQuantity === 0
                ? "Out of stock"
                : totalQuantity < 0
                    ? "Low stock"
                    : "In-stock";

        // ✅ Variants parsing finished here

        // ---------------- DERIVE PRODUCT-LEVEL VARIANT ----------------
        let derivedVariant = normalizeVariant(variant);

        if (!derivedVariant && variants.length === 1 && variants[0]?.shadeName) {
            derivedVariant = normalizeVariant(variants[0].shadeName);
        }

        if (!derivedVariant && variants.length > 1) {
            derivedVariant = "multiple-shades";
        }

        // ---------------- Resolve Slugs ----------------
        let brandSlug = null;
        let categorySlug = null;
        let skinTypeSlugs = [];
        let formulationSlug = null;

        if (brand) {
            const brandDoc = await Brand.findById(brand).select("slug");
            brandSlug = brandDoc?.slug || null;
        }

        if (resolvedCategories[0]) {
            const catDoc = await Category.findById(resolvedCategories[0]).select("slug");
            categorySlug = catDoc?.slug || null;
        }

        if (skinTypesArray.length > 0) {
            const skinDocs = await SkinType.find({
                _id: { $in: skinTypesArray }
            }).select("slug");

            skinTypeSlugs = skinDocs.map(s => s.slug).filter(Boolean);
        }

        if (finalFormulation) {
            const formDoc = await Formulation.findById(finalFormulation).select("slug");
            formulationSlug = formDoc?.slug || null;
        }

        // BEFORE creating product instance
        const finalSlugs = [];

        for (let i = 0; i < (variants.length > 0 ? variants.length : 1); i++) {

            const v = variants.length > 0 ? variants[i] : { shadeName: derivedVariant };

            const shade = v.shadeName ? v.shadeName.trim() : "";

            const slugBase = [
                name.trim(),
                shade,
                brandSlug,
                categorySlug
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            const slug = await generateUniqueSlug(
                Product,
                slugBase,
                null
            );

            finalSlugs.push(slug);

            // NEW: assign slug to variant
            if (variants.length > 0) {
                variants[i].slug = slug;           // <----- ADD THIS
            }
        }


        // check duplicates before saving
        const duplicateProduct = await Product.findOne({
            slugs: { $in: finalSlugs }
        }).select("name brand category");

        if (duplicateProduct) {
            return res.status(409).json({
                message: "Variant already exists for another product with same brand/category and shade"
            });
        }

        // ---------------- Create Product ----------------
        const product = new Product({
            name,
            slugs: finalSlugs,
            variant: derivedVariant,      // ✅ CORRECT
            summary,
            description,
            ingredients,
            features,
            howToUse,
            price: parsedPrice,
            buyingPrice: parsedBuyingPrice,
            brand,
            brandSlug,
            category: resolvedCategories[0],
            categorySlug,
            categories: resolvedCategories,
            categoryHierarchy,
            status,
            productTags,
            shadeOptions,
            colorOptions,
            variants,
            isPublished,
            scheduledAt: scheduleDate,
            seller: seller || null,
            formulation: finalFormulation,
            formulationSlug,    // ✅ properly stored
            skinTypes: skinTypesArray,
            skinTypeSlugs,        // ✅ properly stored
            expiryDate: finalExpiryDate
            // ✅ properly stored
        });

        await product.save();

        // Clear cache for this product (and optionally global product lists)
        await clearProductCacheForId(product._id);

        return res.status(201).json({
            message: "✅ Product created successfully",
            product,
        });
    } catch (error) {
        console.error(
            "❌ Product placement error:",
            util.inspect(error, { showHidden: false, depth: null })
        );
        return res.status(500).json({
            message: "❌ Product placement failed",
            error: error.message,
        });
    }
};

const updateProductById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id))
            return res.status(400).json({ message: "❌ Invalid product ID" });

        const existingProduct = await Product.findById(id);
        if (!existingProduct)
            return res.status(404).json({ message: "❌ Product not found" });

        // ---------------- DERIVE PRODUCT-LEVEL VARIANT (FOR SHADE PRODUCTS) ----------------
        let derivedVariant = normalizeVariant(req.body.variant ?? existingProduct.variant);

        // If variant not provided, derive from shadeName
        if (!derivedVariant) {
            const incomingVariants =
                req.body.variants
                    ? (typeof req.body.variants === "string"
                        ? JSON.parse(req.body.variants)
                        : req.body.variants)
                    : existingProduct.variants;

            if (Array.isArray(incomingVariants) && incomingVariants.length === 1) {
                derivedVariant = normalizeVariant(incomingVariants[0]?.shadeName);
            }

            if (!derivedVariant && Array.isArray(incomingVariants) && incomingVariants.length > 1) {
                derivedVariant = "multiple-shades";
            }
        }

        // ---------------- Duplicate Protection on Update ----------------
        if (req.body.name || req.body.variant || req.body.brand || req.body.category) {
            const checkName = (req.body.name ?? existingProduct.name).trim();
            const checkVariant = derivedVariant;

            const checkBrand = (req.body.brand ?? existingProduct.brand).trim();
            const checkCategory = (req.body.category ?? existingProduct.category).trim();

            const conflict = await Product.findOne({
                _id: { $ne: existingProduct._id },
                name: checkName.trim(),
                brand: checkBrand || null,
                category: checkCategory,
                variant: checkVariant?.trim() || null
            });

            if (conflict) {
                return res.status(409).json({
                    message: "❌ Another product already exists with same name + variant"
                });
            }
        }

        const updateData = { ...req.body };

        // ---------------- Sync Slugs on Update ----------------
        if (updateData.brand) {
            const brandDoc = await Brand.findById(updateData.brand).select("slug");
            updateData.brandSlug = brandDoc?.slug || null;
        }

        if (updateData.category) {
            const catDoc = await Category.findById(updateData.category).select("slug");
            updateData.categorySlug = catDoc?.slug || null;
        }

        if (updateData.skinTypes) {
            const skinDocs = await SkinType.find({
                _id: { $in: updateData.skinTypes }
            }).select("slug");

            updateData.skinTypeSlugs = skinDocs.map(s => s.slug).filter(Boolean);
        }

        if (updateData.formulation) {
            const formDoc = await Formulation.findById(updateData.formulation).select("slug");
            updateData.formulationSlug = formDoc?.slug || null;
        }


        if (req.body.price) updateData.price = Number(req.body.price);
        if (req.body.buyingPrice) updateData.buyingPrice = Number(req.body.buyingPrice);

        // ---------------- Parse Variants ----------------
        let rawVariants = [];
        if (req.body.variants) {
            if (typeof req.body.variants === "string") {
                try { rawVariants = JSON.parse(req.body.variants); } catch { rawVariants = []; }
            } else if (Array.isArray(req.body.variants)) rawVariants = req.body.variants;
        } else {
            rawVariants = parseMultipartVariants(req.body);
        }

        // Build index -> SKU map from rawVariants for stable mapping of uploaded files
        const indexSkuMap = {};
        rawVariants.forEach((rv, idx) => {
            let v = rv;
            if (typeof v === "string") {
                try { v = JSON.parse(v); } catch { v = {}; }
            }
            if (v && v.sku) indexSkuMap[idx] = v.sku;
        });

        // ---------------- Parse Removed Variant SKUs ----------------
        let removedVariantSkus = [];
        if (req.body.removedVariantSkus) {
            try {
                removedVariantSkus =
                    typeof req.body.removedVariantSkus === "string"
                        ? JSON.parse(req.body.removedVariantSkus)
                        : req.body.removedVariantSkus;
            } catch { removedVariantSkus = []; }
        }

        // ---------------- Parse Removed Variant IMAGES ----------------
        let removedVariantImagesGlobal = [];
        if (req.body.removedVariantImages) {
            try {
                removedVariantImagesGlobal =
                    typeof req.body.removedVariantImages === "string"
                        ? JSON.parse(req.body.removedVariantImages)
                        : req.body.removedVariantImages;
            } catch { removedVariantImagesGlobal = []; }
        }

        // ---------------- Parse Removed GLOBAL Images ----------------
        let removedImages = [];
        if (req.body.removedImages) {
            try {
                removedImages =
                    typeof req.body.removedImages === "string"
                        ? JSON.parse(req.body.removedImages)
                        : req.body.removedImages;
            } catch { removedImages = []; }
        }

        // ---------------- CLOUDINARY UPLOAD HANDLING (SKU-based) ----------------
        const productImages = [];
        // map: sku -> [uploaded urls]
        const variantImagesMap = {};

        if (req.files && req.files.length > 0) {
            console.log("📁 Uploading files:", req.files.map(f => ({
                fieldname: f.fieldname,
                originalname: f.originalname
            })));

            for (const file of req.files) {
                try {
                    const uploadResult = await uploadToCloudinary(file.buffer, "products", "image");
                    console.log(`✅ Uploaded: ${file.fieldname} -> ${uploadResult.secure_url}`);

                    if (file.fieldname === "images") {
                        productImages.push(uploadResult.secure_url);
                        continue;
                    }

                    // Expecting fieldnames like: variants[0][images]
                    const match = file.fieldname.match(/variants\[(\d+)\]\[images\]/);
                    if (match) {
                        const idx = Number(match[1]);
                        const sku = indexSkuMap[idx];
                        if (sku) {
                            if (!variantImagesMap[sku]) variantImagesMap[sku] = [];
                            variantImagesMap[sku].push(uploadResult.secure_url);
                        } else {
                            // fallback: push to a generic bucket by index (rare)
                            if (!variantImagesMap[`__idx_${idx}`]) variantImagesMap[`__idx_${idx}`] = [];
                            variantImagesMap[`__idx_${idx}`].push(uploadResult.secure_url);
                        }
                    }
                } catch (uploadError) {
                    console.error("❌ Upload failed for file:", file.fieldname, uploadError);
                }
            }
        }

        console.log("📸 Product Images:", productImages);
        console.log("📸 Variant Images Map:", variantImagesMap);

        // ---------------- VARIANT PRODUCT LOGIC ----------------
        const isVariantProduct =
            (existingProduct.variants?.length > 0) ||
            (Array.isArray(rawVariants) && rawVariants.length > 0) ||
            Object.keys(req.body || {}).some(k => k.startsWith("variants["));

        if (isVariantProduct) {
            if (req.body.quantity || req.body.thresholdValue || req.body.images || req.body.imageUrls) {
                return res.status(400).json({
                    message: "❌ For variant products, do NOT provide global quantity, thresholdValue, or images."
                });
            }

            // 1️⃣ Map existing variants by SKU (clone to avoid mutation)
            const variantMap = new Map();
            for (const oldVar of existingProduct.variants || []) {
                variantMap.set(oldVar.sku, JSON.parse(JSON.stringify(oldVar)));
            }

            // 2️⃣ Remove entire variants (they will be deleted fully)
            for (const sku of removedVariantSkus) {
                variantMap.delete(sku);
            }

            const deletedVariantSet = new Set(removedVariantSkus);

            // 3️⃣ Apply global variant image removals (payload: [{sku, images: [...]}, ...])
            for (const item of removedVariantImagesGlobal) {
                const variant = variantMap.get(item.sku);
                if (variant && Array.isArray(item.images)) {
                    variant.images = variant.images.filter(img => !item.images.includes(img));
                    variant.updatedAt = new Date();
                    variantMap.set(item.sku, variant);
                }
            }

            // 4️⃣ Process incoming variant updates (add / update)
            for (let i = 0; i < rawVariants.length; i++) {
                let v = rawVariants[i] || {};
                if (typeof v === "string") {
                    try { v = JSON.parse(v); } catch { v = {}; }
                }

                if (!v.sku) throw new Error(`Variant ${i + 1} missing SKU`);

                // default threshold fallback
                if (typeof v.thresholdValue === "undefined") {
                    v.thresholdValue = variantMap.get(v.sku)?.thresholdValue ?? 0;
                }
                if (isNaN(Number(v.thresholdValue))) {
                    throw new Error(`Variant ${v.sku} must have valid thresholdValue`);
                }

                // variant-level removedImages (single variant)
                let removedVariantImages = [];
                if (v.removedImages) {
                    try {
                        removedVariantImages =
                            typeof v.removedImages === "string"
                                ? JSON.parse(v.removedImages)
                                : v.removedImages;
                    } catch { removedVariantImages = []; }
                }

                // parse incoming images field if provided as JSON string
                let incomingImages = [];
                if (v.images) {
                    if (Array.isArray(v.images)) {
                        incomingImages = v.images;
                    } else if (typeof v.images === "string") {
                        try {
                            incomingImages = JSON.parse(v.images);
                        } catch {
                            // If it's a single image URL string
                            incomingImages = [v.images];
                        }
                    }
                }

                // determine oldVariant (do not restore deleted variant data)
                let oldVariant = {};
                if (!deletedVariantSet.has(v.sku)) {
                    oldVariant = variantMap.get(v.sku) || {};
                }
                const oldImages = Array.isArray(oldVariant.images) ? oldVariant.images : [];

                console.log(`🔄 Processing variant ${v.sku}:`, {
                    oldImages: oldImages.length,
                    removedVariantImages: removedVariantImages.length,
                    incomingImages: incomingImages.length,
                    uploadedImages: (variantImagesMap[v.sku] || []).length
                });

                // retained images = oldImages MINUS removedVariantImages
                const retainedImages = oldImages.filter(img => !removedVariantImages.includes(img));

                // uploaded images mapped by SKU
                const uploadedBySku = variantImagesMap[v.sku] || [];
                const uploadedByIndex = variantImagesMap[`__idx_${i}`] || [];
                const uploadedVariantImages = [...uploadedBySku, ...uploadedByIndex];

                // Combine images: incoming + retained + uploaded
                let tempImages = [];

                // If frontend sends explicit images array, use it as base
                if (incomingImages.length > 0) {
                    tempImages = [...incomingImages];
                } else {
                    // Otherwise start with retained images
                    tempImages = [...retainedImages];
                }

                // Always add uploaded images
                tempImages.push(...uploadedVariantImages);

                // Dedupe preserving order
                const seen = new Set();
                const uniqueImages = [];
                for (const im of tempImages) {
                    if (im && !seen.has(im)) {
                        seen.add(im);
                        uniqueImages.push(im);
                    }
                }

                console.log(`✅ Final images for ${v.sku}:`, uniqueImages);

                if (uniqueImages.length === 0) {
                    throw new Error(`Variant ${v.sku} must have at least one image`);
                }

                // --- merge stockByWarehouse ---
                if (typeof v.stockByWarehouse === "string") {
                    try { v.stockByWarehouse = JSON.parse(v.stockByWarehouse); }
                    catch { v.stockByWarehouse = []; }
                }

                const oldList = Array.isArray(oldVariant.stockByWarehouse) ? oldVariant.stockByWarehouse : [];
                const newList = Array.isArray(v.stockByWarehouse) ? v.stockByWarehouse : [];

                let finalWarehouseStock = oldList.map(oldW => {
                    const updated = newList.find(nw => nw.warehouseCode === oldW.warehouseCode);
                    return updated ? { ...oldW, ...updated, stock: Number(updated.stock ?? oldW.stock) } : oldW;
                });

                newList.forEach(nw => {
                    if (!finalWarehouseStock.some(ow => ow.warehouseCode === nw.warehouseCode)) {
                        finalWarehouseStock.push({
                            warehouseCode: nw.warehouseCode,
                            stock: Number(nw.stock) || 0
                        });
                    }
                });

                if (!oldVariant && finalWarehouseStock.length === 0 && newList.length > 0) {
                    finalWarehouseStock = newList.map(nw => ({
                        warehouseCode: nw.warehouseCode,
                        stock: Number(nw.stock) || 0
                    }));
                }

                // merged variant object
                const mergedVariant = {
                    ...(oldVariant || {}),
                    ...v,
                    shadeName: normalizeVariant(v.shadeName ?? oldVariant?.shadeName),

                    images: uniqueImages, // This is the crucial line - make sure images array is properly set
                    stockByWarehouse: finalWarehouseStock,
                    sales: Number(v.sales ?? oldVariant?.sales ?? 0),
                    thresholdValue: Number(v.thresholdValue ?? oldVariant?.thresholdValue ?? 0),
                    discountedPrice:
                        v.discountedPrice !== undefined
                            ? Number(v.discountedPrice)
                            : (oldVariant?.discountedPrice ?? null),
                    isActive: v.isActive !== false,
                    updatedAt: new Date(),
                    sku: v.sku
                };

                const brandDoc = await Brand.findById(existingProduct.brand);
                const updatedVariant = computeWarehouseStock(mergedVariant, brandDoc);

                // set / add variant
                variantMap.set(v.sku, updatedVariant);
            }

            // final variants array
            const updatedVariants = Array.from(variantMap.values());
            updateData.variants = updatedVariants;
            updateData.shadeOptions = updatedVariants.map(v => v.shadeName).filter(Boolean);
            updateData.colorOptions = updatedVariants.map(v => v.hex).filter(Boolean);

            // remove global fields for variant products (derived)
            delete updateData.quantity;
            delete updateData.thresholdValue;
            delete updateData.images;

            // derived product-level quantity
            updateData.quantity = updatedVariants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

        } else {
            // ------------ NON VARIANT PRODUCT ------------
            let finalImages = [...(existingProduct.images || [])];

            // Remove images that are marked for removal
            if (removedImages.length > 0) {
                finalImages = finalImages.filter(img => !removedImages.includes(img));
            }

            // Add newly uploaded product images
            if (productImages.length > 0) {
                finalImages.push(...productImages);
            }

            // Also consider if there are images in the body
            if (req.body.images) {
                let bodyImages = [];
                if (typeof req.body.images === "string") {
                    try {
                        bodyImages = JSON.parse(req.body.images);
                    } catch {
                        bodyImages = [req.body.images];
                    }
                } else if (Array.isArray(req.body.images)) {
                    bodyImages = req.body.images;
                }

                // Merge body images with existing ones (remove duplicates)
                finalImages = [...new Set([...bodyImages, ...finalImages])];
            }

            if (finalImages.length === 0) {
                return res.status(400).json({ message: "❌ Non-variant products must have at least one global image" });
            }

            updateData.images = finalImages;

            if (updateData.quantity !== undefined) {
                updateData.quantity = Number(updateData.quantity);
            }

            if (updateData.thresholdValue !== undefined) {
                updateData.thresholdValue = Number(updateData.thresholdValue);
            }
        }

        // ---------------- STOCK STATUS ----------------
        const totalQuantity = Array.isArray(updateData.variants)
            ? updateData.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0)
            : Number(updateData.quantity);

        const threshold = Array.isArray(updateData.variants)
            ? Math.min(...updateData.variants.map(v => Number(v.thresholdValue || Infinity)))
            : Number(updateData.thresholdValue);

        updateData.status =
            totalQuantity === 0
                ? "Out of stock"
                : totalQuantity < threshold
                    ? "Low stock"
                    : "In-stock";

        console.log("💾 Final update data:", {
            variants: updateData.variants?.map(v => ({ sku: v.sku, images: v.images })),
            images: updateData.images
        });

        // Ensure product-level variant stays in sync with shadeName
        if (derivedVariant) {
            updateData.variant = derivedVariant;
        }

        // ---------------- SAVE ----------------
        const updatedProduct = await Product.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        await clearProductCacheForId(updatedProduct._id);
        await clearProductCacheForId(updatedProduct.slug);

        res.status(200).json({
            message: "✅ Product updated successfully",
            product: updatedProduct
        });

    } catch (error) {
        console.error("❌ Product update error:", error);
        res.status(400).json({
            message: error.message,
            error: error.message
        });
    }
};


// const addProductController = async (req, res) => {
//     try {
//         const {
//             name,
//             variant,
//             summary,
//             description,
//             ingredients,
//             features,
//             howToUse,
//             price,
//             buyingPrice,
//             brand,
//             category,
//             categories,
//             quantity,
//             expiryDate,
//             scheduledAt,
//             productTags: rawTags,
//             variants: rawVariants,
//             thresholdValue: rawThresholdValue,
//             formulation,
//             seller,
//         } = req.body;

//         // ---------------- Basic Validations ----------------
//         if (!name)
//             return res.status(400).json({ message: "Product name is required" });

//         const existingProduct = await Product.findOne({ name: name.trim() });
//         if (existingProduct)
//             return res.status(400).json({ message: `Product with name "${name}" already exists` });

//         if (!category && (!categories || categories.length === 0)) {
//             return res.status(400).json({ message: "Category is required" });
//         }

//         // ---------------- Handle Scheduling ----------------
//         let isPublished = true;
//         let scheduleDate = null;
//         if (scheduledAt) {
//             // User enters IST time (local)
//             const parsedDateIST = moment.tz(scheduledAt, "YYYY-MM-DD HH:mm", "Asia/Kolkata");

//             if (!parsedDateIST.isValid()) {
//                 return res.status(400).json({ message: "❌ Invalid scheduledAt date format. Use YYYY-MM-DD HH:mm (IST)" });
//             }

//             // Convert IST to UTC before saving
//             const parsedDateUTC = parsedDateIST.clone().tz("UTC").toDate();

//             if (parsedDateUTC > new Date()) {
//                 isPublished = false;
//                 scheduleDate = parsedDateUTC; // ✅ saved in UTC
//             }
//         }

//         // ---------------- Resolve Categories ----------------
//         let finalCategories = categories && categories.length
//             ? (Array.isArray(categories) ? categories : [categories])
//             : [category];

//         const resolvedCategories = [];
//         for (let cat of finalCategories) {
//             if (!cat) continue;
//             const trimmed = String(cat).trim();
//             if (mongoose.Types.ObjectId.isValid(trimmed)) {
//                 resolvedCategories.push(trimmed);
//             } else {
//                 const foundCat = await Category.findOne({ name: { $regex: `^${trimmed}$`, $options: "i" } });
//                 if (!foundCat)
//                     return res.status(400).json({ message: `Category "${trimmed}" not found` });
//                 resolvedCategories.push(foundCat._id);
//             }
//         }

//         const foundCategories = await Category.find({ _id: { $in: resolvedCategories } });
//         if (foundCategories.length !== resolvedCategories.length)
//             return res.status(400).json({ message: "One or more category IDs are invalid" });

//         // ---------------- Build Hierarchy ----------------
//         const buildCategoryHierarchy = async (leafId) => {
//             const hierarchy = [];
//             let current = await Category.findById(leafId);
//             while (current) {
//                 hierarchy.unshift(current._id);
//                 if (!current.parent) break;
//                 current = await Category.findById(current.parent);
//             }
//             return hierarchy;
//         };
//         const categoryHierarchy = await buildCategoryHierarchy(resolvedCategories[0]);

//         // ---------------- Parse Tags ----------------
//         let productTags = [];
//         try {
//             productTags = rawTags
//                 ? (typeof rawTags === "string" ? JSON.parse(rawTags) : rawTags)
//                 : [];
//         } catch {
//             productTags = [];
//         }

//         // ---------------- Price Validations ----------------
//         const parsedPrice = Number(price);
//         const parsedBuyingPrice = Number(buyingPrice);
//         if (isNaN(parsedPrice) || isNaN(parsedBuyingPrice))
//             return res.status(400).json({ message: "❌ Invalid numeric values for price or buyingPrice" });

//         // ---------------- Variants ----------------
//         let variants = [];
//         let shadeOptions = [];
//         let colorOptions = [];
//         let images = [];

//         try {
//             let variantArray = rawVariants
//                 ? (typeof rawVariants === "string" ? JSON.parse(rawVariants) : rawVariants)
//                 : [];

//             if (variantArray.length > 0) {
//                 // ✅ Variant Product Rules
//                 if (quantity || rawThresholdValue || req.body.images || req.body.imageUrls) {
//                     return res.status(400).json({
//                         message: "❌ For variant products, do NOT provide global quantity, thresholdValue or images. Use variants only.",
//                     });
//                 }

//                 // ✅ Validate all variants first
//                 const skuSet = new Set();
//                 for (let i = 0; i < variantArray.length; i++) {
//                     const v = variantArray[i];
//                     if (!v.sku) throw new Error(`Variant ${i + 1} is missing SKU`);
//                     if (skuSet.has(v.sku))
//                         throw new Error(`Duplicate SKU "${v.sku}" found`);
//                     skuSet.add(v.sku);

//                     if (v.stock === undefined || isNaN(Number(v.stock)))
//                         throw new Error(`Variant ${v.sku} must have valid stock`);
//                     if (v.thresholdValue === undefined || isNaN(Number(v.thresholdValue)))
//                         throw new Error(`Variant ${v.sku} must have thresholdValue`);
//                 }

//                 // ✅ Upload variant images and build variant array
//                 variants = await Promise.all(
//                     variantArray.map(async (v, i) => {
//                         const uploadedImages = [];
//                         const variantFiles = req.files?.filter(
//                             (f) => f.fieldname === `variants[${i}][images]`
//                         ) || [];

//                         for (const file of variantFiles) {
//                             const result = await cloudinary.uploader.upload(file.path, {
//                                 folder: "products/variants",
//                             });
//                             uploadedImages.push(result.secure_url);
//                         }

//                         const combinedImages = [
//                             ...(Array.isArray(v.images) ? v.images : []),
//                             ...uploadedImages,
//                         ];

//                         if (combinedImages.length === 0)
//                             throw new Error(`Variant ${v.sku} must have at least one image`);
//                         // Sum stock from warehouse
//                         let totalStock = 0;

//                         if (v.stockByWarehouse && Array.isArray(v.stockByWarehouse)) {
//                             v.stockByWarehouse = v.stockByWarehouse.map(w => ({
//                                 warehouseCode: w.warehouseCode,
//                                 stock: Number(w.stock || 0)
//                             }));

//                             totalStock = v.stockByWarehouse.reduce((sum, w) => sum + w.stock, 0);
//                         }

//                         const finalStock = totalStock > 0 ? totalStock : Number(v.stock || 0);



//                         return {
//                             ...v,
//                             stock: finalStock,
//                             stockByWarehouse: v.stockByWarehouse || [],
//                             sales: Number(v.sales) || 0,
//                             thresholdValue: Number(v.thresholdValue),
//                             discountedPrice:
//                                 v.discountedPrice !== undefined
//                                     ? Number(v.discountedPrice)
//                                     : null,
//                             images: combinedImages.slice(-8),
//                             isActive: v.isActive !== false,
//                             createdAt: new Date(),
//                         };
//                     })
//                 );

//                 shadeOptions = variants.map((v) => v.shadeName).filter(Boolean);
//                 colorOptions = variants.map((v) => v.hex).filter(Boolean);
//             } else {
//                 // ✅ Non-Variant Product Rules
//                 if (quantity === undefined)
//                     return res.status(400).json({
//                         message: "❌ quantity is required for non-variant products",
//                     });
//                 if (rawThresholdValue === undefined)
//                     return res.status(400).json({
//                         message: "❌ thresholdValue is required for non-variant products",
//                     });

//                 // ✅ Upload global product images
//                 const mainFiles = req.files?.filter((f) => f.fieldname === "images") || [];
//                 for (const file of mainFiles) {
//                     const result = await cloudinary.uploader.upload(file.path, {
//                         folder: "products",
//                     });
//                     images.push(result.secure_url);
//                 }

//                 if (req.body.imageUrls) {
//                     let urls =
//                         typeof req.body.imageUrls === "string"
//                             ? JSON.parse(req.body.imageUrls)
//                             : req.body.imageUrls;
//                     for (const url of urls) images.push(url);
//                 }

//                 if (images.length === 0)
//                     return res.status(400).json({
//                         message: "❌ Non-variant products must have at least one global image",
//                     });
//             }
//         } catch (err) {
//             console.error("❌ Variants parsing error:", err);
//             return res.status(400).json({ message: err.message });
//         }

//         // ---------------- Compute Stock Status ----------------
//         const totalQuantity =
//             variants.length > 0
//                 ? variants.reduce((sum, v) => sum + (v.stock || 0), 0)
//                 : Number(quantity);

//         let status =
//             totalQuantity === 0
//                 ? "Out of stock"
//                 : totalQuantity < Number(rawThresholdValue)
//                     ? "Low stock"
//                     : "In-stock";

//         // ---------------- Create Product ----------------
//         const product = new Product({
//             name,
//             variant,
//             summary,
//             description,
//             ingredients,
//             features,
//             howToUse,
//             price: parsedPrice,
//             buyingPrice: parsedBuyingPrice,
//             quantity: variants.length > 0 ? undefined : Number(quantity),
//             thresholdValue: variants.length > 0 ? undefined : Number(rawThresholdValue),
//             expiryDate,
//             images: variants.length > 0 ? undefined : images,
//             brand,
//             category: resolvedCategories[0],
//             categories: resolvedCategories,
//             categoryHierarchy,
//             status,
//             productTags,
//             shadeOptions,
//             colorOptions,
//             variants,
//             isPublished,
//             scheduledAt: scheduleDate,
//             seller: seller || null,
//         });

//         await product.save();

//         // Clear cache for this product (and optionally global product lists)
//         await clearProductCacheForId(product._id);

//         return res.status(201).json({
//             message: "✅ Product created successfully",
//             product,
//         });
//     } catch (error) {
//         console.error(
//             "❌ Product placement error:",
//             util.inspect(error, { showHidden: false, depth: null })
//         );
//         return res.status(500).json({
//             message: "❌ Product placement failed",
//             error: error.message,
//         });
//     }
// };

// const updateProductById = async (req, res) => {
//     try {
//         const { id } = req.params;

//         // ---------------- Basic Checks ----------------
//         if (!mongoose.Types.ObjectId.isValid(id))
//             return res.status(400).json({ message: "❌ Invalid product ID" });

//         const existingProduct = await Product.findById(id);
//         if (!existingProduct)
//             return res.status(404).json({ message: "❌ Product not found" });

//         const updateData = { ...req.body };

//         // ---------------- Numeric Fields ----------------
//         if (req.body.price !== undefined) {
//             updateData.price = Number(req.body.price);
//             if (isNaN(updateData.price))
//                 return res.status(400).json({ message: "❌ Invalid value for price" });
//         }

//         if (req.body.buyingPrice !== undefined) {
//             updateData.buyingPrice = Number(req.body.buyingPrice);
//             if (isNaN(updateData.buyingPrice))
//                 return res.status(400).json({ message: "❌ Invalid value for buyingPrice" });
//         }

//         // ---------------- Parse Variants ----------------
//         let rawVariants = req.body.variants || [];
//         if (typeof rawVariants === "string") {
//             try {
//                 rawVariants = JSON.parse(rawVariants);
//             } catch {
//                 rawVariants = [];
//             }
//         }

//         // ---------------- Parse Removed Variant SKUs ----------------
//         let removedVariantSkus = [];
//         if (req.body.removedVariantSkus) {
//             try {
//                 removedVariantSkus = JSON.parse(req.body.removedVariantSkus);
//             } catch {
//                 removedVariantSkus = [];
//             }
//         }

//         // ---------------- Parse Removed Global Images ----------------
//         let removedImages = [];
//         if (req.body.removedImages) {
//             try {
//                 removedImages = JSON.parse(req.body.removedImages);
//             } catch {
//                 removedImages = [];
//             }
//         }

//         // ---------------- Handle Cloudinary Uploads ----------------
//         const productImages = [];
//         const variantImagesMap = {}; // {index: [urls]}

//         if (req.files && req.files.length > 0) {
//             for (const file of req.files) {
//                 const uploadResult = await cloudinary.uploader.upload(file.path, { folder: "products" });

//                 if (file.fieldname === "images") {
//                     productImages.push(uploadResult.secure_url);
//                 } else {
//                     const match = file.fieldname.match(/variants\[(\d+)\]\[images\]/);
//                     if (match) {
//                         const idx = Number(match[1]);
//                         if (!variantImagesMap[idx]) variantImagesMap[idx] = [];
//                         variantImagesMap[idx].push(uploadResult.secure_url);
//                     }
//                 }
//             }
//         }

//         // ---------------- VARIANT PRODUCT LOGIC ----------------
//         if (existingProduct.variants?.length > 0 || rawVariants.length > 0) {
//             if (req.body.quantity || req.body.thresholdValue || req.body.images || req.body.imageUrls) {
//                 return res.status(400).json({
//                     message: "❌ For variant products, do NOT provide global quantity, thresholdValue, or images. Use variants only."
//                 });
//             }

//             // 1️⃣ Map existing variants by SKU
//             const variantMap = new Map();
//             for (const oldVar of existingProduct.variants || []) {
//                 variantMap.set(oldVar.sku, oldVar);
//             }

//             // 2️⃣ Remove variants that are explicitly deleted
//             for (const sku of removedVariantSkus) {
//                 variantMap.delete(sku);
//             }

//             // 3️⃣ Process incoming variant updates
//             for (let i = 0; i < rawVariants.length; i++) {
//                 const v = rawVariants[i];

//                 if (!v.sku) throw new Error(`Variant ${i + 1} missing SKU`);
//                 if (v.stock === undefined || isNaN(Number(v.stock)))
//                     throw new Error(`Variant ${v.sku} must have valid stock`);
//                 if (v.thresholdValue === undefined || isNaN(Number(v.thresholdValue)))
//                     throw new Error(`Variant ${v.sku} must have valid thresholdValue`);

//                 const oldVariant = variantMap.get(v.sku);

//                 // Handle variant image removals
//                 let removedVariantImages = [];
//                 if (v.removedImages) {
//                     try {
//                         removedVariantImages = JSON.parse(v.removedImages);
//                     } catch { }
//                 }

//                 const uploadedVariantImages = variantImagesMap[i] || [];
//                 const oldImages = oldVariant?.images || [];
//                 const retainedImages = oldImages.filter(img => !removedVariantImages.includes(img));

//                 const combinedImages = [
//                     ...(Array.isArray(v.images) ? v.images : []),
//                     ...retainedImages,
//                     ...uploadedVariantImages,
//                 ].filter(Boolean);

//                 if (combinedImages.length === 0)
//                     throw new Error(`Variant ${v.sku} must have at least one image`);

//                 // Build warehouse stock
//                 let updatedStockByWarehouse = [];

//                 if (v.stockByWarehouse) {
//                     let wb = typeof v.stockByWarehouse === "string"
//                         ? JSON.parse(v.stockByWarehouse)
//                         : v.stockByWarehouse;

//                     updatedStockByWarehouse = wb.map(w => ({
//                         warehouseCode: w.warehouseCode,
//                         stock: Number(w.stock || 0),
//                     }));
//                 }

//                 // calculate auto total stock
//                 let totalStock = updatedStockByWarehouse.reduce((sum, w) => sum + w.stock, 0);
//                 const finalStock = totalStock > 0 ? totalStock : Number(v.stock || oldVariant?.stock || 0);


//                 const updatedVariant = {
//                     ...oldVariant?._doc,
//                     ...v,
//                     stock: finalStock,
//                     stockByWarehouse: updatedStockByWarehouse.length
//                         ? updatedStockByWarehouse
//                         : oldVariant?.stockByWarehouse || [],
//                     sales: Number(v.sales) || oldVariant?.sales || 0,
//                     thresholdValue: Number(v.thresholdValue),
//                     discountedPrice:
//                         v.discountedPrice !== undefined
//                             ? Number(v.discountedPrice)
//                             : oldVariant?.discountedPrice || null,
//                     images: [...new Set(combinedImages)],
//                     isActive: v.isActive !== false,
//                     updatedAt: new Date(),
//                 };

//                 variantMap.set(v.sku, updatedVariant);
//             }

//             // 4️⃣ Final updated variant list (after removal + update + add)
//             const updatedVariants = Array.from(variantMap.values());

//             // 5️⃣ Prepare other variant-related data
//             updateData.variants = updatedVariants;
//             updateData.shadeOptions = updatedVariants.map(v => v.shadeName).filter(Boolean);
//             updateData.colorOptions = updatedVariants.map(v => v.hex).filter(Boolean);
//             updateData.quantity = updatedVariants.reduce((sum, v) => sum + (v.stock || 0), 0);
//             updateData.thresholdValue = undefined;
//             updateData.images = undefined;
//         }

//         // ---------------- NON-VARIANT PRODUCT LOGIC ----------------
//         else {
//             if (req.body.variants && req.body.variants.length > 0)
//                 return res.status(400).json({ message: "❌ Non-variant products cannot have variants" });

//             if (
//                 (req.body.quantity === undefined && existingProduct.quantity === undefined) ||
//                 isNaN(Number(req.body.quantity ?? existingProduct.quantity))
//             ) {
//                 return res.status(400).json({ message: "❌ quantity is required for non-variant products" });
//             }

//             if (
//                 (req.body.thresholdValue === undefined && existingProduct.thresholdValue === undefined) ||
//                 isNaN(Number(req.body.thresholdValue ?? existingProduct.thresholdValue))
//             ) {
//                 return res.status(400).json({ message: "❌ thresholdValue is required for non-variant products" });
//             }

//             let finalImages = [...(existingProduct.images || [])];
//             if (removedImages.length > 0)
//                 finalImages = finalImages.filter(img => !removedImages.includes(img));
//             if (productImages.length > 0)
//                 finalImages.push(...productImages);

//             finalImages = [...new Set(finalImages)];
//             if (finalImages.length === 0)
//                 return res.status(400).json({ message: "❌ Non-variant products must have at least one global image" });

//             updateData.images = finalImages;
//         }

//         // ---------------- Compute Stock Status ----------------
//         const totalQuantity =
//             updateData.variants?.length > 0
//                 ? updateData.variants.reduce((sum, v) => sum + (v.stock || 0), 0)
//                 : Number(updateData.quantity || existingProduct.quantity);

//         const threshold =
//             updateData.variants?.length > 0
//                 ? Math.min(...updateData.variants.map(v => v.thresholdValue || Infinity))
//                 : Number(updateData.thresholdValue || existingProduct.thresholdValue);

//         updateData.status =
//             totalQuantity === 0
//                 ? "Out of stock"
//                 : totalQuantity < threshold
//                     ? "Low stock"
//                     : "In-stock";

//         // ---------------- Save Update ----------------
//         const updatedProduct = await Product.findByIdAndUpdate(id, updateData, { new: true });

//         // Clear cache for this product id/slug
//         await clearProductCacheForId(updatedProduct._id);
//         await clearProductCacheForId(updatedProduct.slug);   // ❗ ADD THIS

//         res.status(200).json({
//             message: "✅ Product updated successfully",
//             product: updatedProduct
//         });

//     } catch (error) {
//         console.error("❌ Product update error:", error);
//         res.status(400).json({
//             message: error.message || "❌ Failed to update product",
//             error: error.message
//         });
//     }
// };

// const getAllProducts = async (req, res) => {
//     try {
//         const query = req.query;
//         const filter = {};

//         if (query.brand) filter.brand = { $in: query.brand.split(',') };

//         if (query.category) {
//             const categoryIds = query.category.split(',');

//             // Include subcategories automatically
//             const allCategoryIds = new Set(categoryIds);
//             const fetchChildren = async (parentId) => {
//                 const children = await Category.find({ parent: parentId }, '_id');
//                 for (const child of children) {
//                     if (!allCategoryIds.has(child._id.toString())) {
//                         allCategoryIds.add(child._id.toString());
//                         await fetchChildren(child._id);
//                     }
//                 }
//             };
//             for (const id of categoryIds) {
//                 await fetchChildren(id);
//             }
//             filter.category = { $in: Array.from(allCategoryIds) };
//         }

//         if (query.shadeOptions) filter.shadeOptions = { $in: query.shadeOptions.split(',') };
//         if (query.colorOptions) filter.colorOptions = { $in: query.colorOptions.split(',') };
//         if (query.productTags) filter.productTags = { $in: query.productTags.split(',') };

//         const dynamicFilters = [
//             'preference', 'ingredients', 'benefits', 'concern', 'skinType',
//             'makeupFinish', 'formulation', 'color', 'skinTone', 'gender', 'age', 'conscious'
//         ];
//         dynamicFilters.forEach(attr => {
//             if (query[attr]) {
//                 filter.productTags = { $in: query[attr].split(',') };
//             }
//         });

//         if (query.minPrice || query.maxPrice) {
//             filter.price = {};
//             if (query.minPrice) filter.price.$gte = Number(query.minPrice);
//             if (query.maxPrice) filter.price.$lte = Number(query.maxPrice);
//         }

//         const products = await Product.find(filter).sort({ createdAt: -1 }).populate('category', 'name');

//         const dashboardData = products.map(p => ({
//             _id: p._id,
//             name: p.name,
//             variant: p.variant,
//             image: Array.isArray(p.images) ? p.images[0] : p.image,
//             price: p.price,
//             summary: p.summary || p.description?.slice(0, 100),
//             ingredients: p.ingredients?.slice(0, 100),
//             sales: p.sales,
//             remaining: p.quantity,
//             status: p.status,
//             category: p.category?.name || '',
//             brand: p.brand,
//         }));

//         res.status(200).json(dashboardData);
//     } catch (error) {
//         res.status(500).json({ message: 'Error fetching products', error });
//     }
// };
// const getAllProducts = async (req, res) => {
//     try {
//         const query = req.query;
//         const filter = {};

//         // ------------------------- PAGINATION -------------------------
//         const page = Number(query.page) || 1;
//         const limit = Number(query.limit) || 12;
//         const skip = (page - 1) * limit;

//         // ------------------------- FILTERS -------------------------
//         if (query.brand) filter.brand = { $in: query.brand.split(',') };

//         if (query.category) {
//             const categoryIds = query.category.split(',');

//             const allCategoryIds = new Set(categoryIds);
//             const fetchChildren = async (parentId) => {
//                 const children = await Category.find({ parent: parentId }, '_id');
//                 for (const child of children) {
//                     if (!allCategoryIds.has(child._id.toString())) {
//                         allCategoryIds.add(child._id.toString());
//                         await fetchChildren(child._id);
//                     }
//                 }
//             };

//             for (const id of categoryIds) {
//                 await fetchChildren(id);
//             }

//             filter.category = { $in: Array.from(allCategoryIds) };
//         }

//         if (query.shadeOptions) filter.shadeOptions = { $in: query.shadeOptions.split(',') };
//         if (query.colorOptions) filter.colorOptions = { $in: query.colorOptions.split(',') };
//         if (query.productTags) filter.productTags = { $in: query.productTags.split(',') };

//         const dynamicFilters = [
//             'preference', 'ingredients', 'benefits', 'concern', 'skinType',
//             'makeupFinish', 'formulation', 'color', 'skinTone', 'gender', 'age', 'conscious'
//         ];
//         dynamicFilters.forEach(attr => {
//             if (query[attr]) {
//                 filter.productTags = { $in: query[attr].split(',') };
//             }
//         });

//         if (query.minPrice || query.maxPrice) {
//             filter.price = {};
//             if (query.minPrice) filter.price.$gte = Number(query.minPrice);
//             if (query.maxPrice) filter.price.$lte = Number(query.maxPrice);
//         }

//         // ------------------------- FETCH PRODUCTS -------------------------
//         const total = await Product.countDocuments(filter);

//         const products = await Product.find(filter)
//             .sort({ createdAt: -1 })
//             .skip(skip)
//             .limit(limit)
//             .populate('category', 'name')
//             .lean();

//         // ------------------------- FORMAT RESPONSE -------------------------
//         const dashboardData = products.map((p) => {
//             let image = null;

//             // If product has variants → use first variant's first image
//             if (p.variants?.length > 0 && p.variants[0].images?.length > 0) {
//                 image = p.variants[0].images[0];
//             }
//             // Otherwise use normal product image
//             else if (Array.isArray(p.images) && p.images.length > 0) {
//                 image = p.images[0];
//             }

//             return {
//                 _id: p._id,
//                 name: p.name,
//                 variant: p.variant,
//                 image,
//                 price: p.price,
//                 discountedPrice: p.discountedPrice,
//                 summary: p.summary || (p.description?.slice(0, 100) || ''),
//                 ingredients: p.ingredients?.slice(0, 100),
//                 sales: p.sales,
//                 remaining: p.quantity,
//                 status: p.status,
//                 category: p.category?.name || '',
//                 brand: p.brand,
//             };
//         });

//         // ------------------------- RESPONSE -------------------------
//         res.status(200).json({
//             success: true,
//             total,
//             page,
//             totalPages: Math.ceil(total / limit),
//             count: dashboardData.length,
//             products: dashboardData,
//         });

//     } catch (error) {
//         res.status(500).json({ message: 'Error fetching products', error: error.message });
//     }
// };


// const getProductFilterOptions = async (req, res) => {
//     try {
//         const query = req.query;

//         // Optional: Only get filters for published products
//         const baseFilter = query.publishedOnly === 'true' ? { isPublished: true } : {};

//         // ==================== AGGREGATION PIPELINES ====================

//         // 1. GET ALL BRANDS (with product counts)
//         const brands = await Brand.find({})
//             .select('_id name slug logo')
//             .sort({ name: 1 })
//             .lean();

//         const brandCounts = await Product.aggregate([
//             { $match: baseFilter },
//             { $group: { _id: "$brand", count: { $sum: 1 } } }
//         ]);

//         const brandsWithCount = brands.map(brand => {
//             const countData = brandCounts.find(bc => bc._id?.toString() === brand._id.toString());
//             return {
//                 _id: brand._id,
//                 name: brand.name,
//                 slug: brand.slug,
//                 logo: brand.logo,
//                 productCount: countData?.count || 0
//             };
//         }).filter(b => b.productCount > 0);

//         // 2. GET ALL CATEGORIES (with product counts, hierarchical)
//         const categories = await Category.find({})
//             .select('_id name slug parent level image')
//             .sort({ name: 1 })
//             .lean();

//         const categoryCounts = await Product.aggregate([
//             { $match: baseFilter },
//             { $unwind: "$categoryHierarchy" },
//             {
//                 $group: {
//                     _id: "$categoryHierarchy",
//                     count: { $sum: 1 }
//                 }
//             }
//         ]);


//         const categoriesWithCount = categories.map(cat => {
//             const countData = categoryCounts.find(cc => cc._id?.toString() === cat._id.toString());
//             return {
//                 _id: cat._id,
//                 name: cat.name,
//                 slug: cat.slug,
//                 parent: cat.parent,
//                 level: cat.level,
//                 image: cat.image,
//                 productCount: countData?.count || 0
//             };
//         }).filter(c => c.productCount > 0);

//         // 3. GET ALL SKIN TYPES (with product counts)
//         const skinTypes = await SkinType.find({})
//             .select('_id name slug description icon')
//             .sort({ name: 1 })
//             .lean();

//         const skinTypeCounts = await Product.aggregate([
//             { $match: baseFilter },
//             { $unwind: "$skinTypes" },
//             { $group: { _id: "$skinTypes", count: { $sum: 1 } } }
//         ]);

//         const skinTypesWithCount = skinTypes.map(st => {
//             const countData = skinTypeCounts.find(stc => stc._id?.toString() === st._id.toString());
//             return {
//                 _id: st._id,
//                 name: st.name,
//                 slug: st.slug,
//                 description: st.description,
//                 icon: st.icon,
//                 productCount: countData?.count || 0
//             };
//         }).filter(st => st.productCount > 0);

//         // 4. GET ALL FORMULATIONS (with product counts)
//         const formulations = await Formulation.find({})
//             .select('_id name slug description')
//             .sort({ name: 1 })
//             .lean();

//         const formulationCounts = await Product.aggregate([
//             { $match: baseFilter },
//             { $group: { _id: "$formulation", count: { $sum: 1 } } }
//         ]);

//         const formulationsWithCount = formulations.map(form => {
//             const countData = formulationCounts.find(fc => fc._id?.toString() === form._id.toString());
//             return {
//                 _id: form._id,
//                 name: form.name,
//                 slug: form.slug,
//                 description: form.description,
//                 productCount: countData?.count || 0
//             };
//         }).filter(f => f.productCount > 0);

//         // 5. GET ALL UNIQUE FINISHES (with counts)
//         const finishes = await Product.aggregate([
//             { $match: { ...baseFilter, finish: { $ne: null, $exists: true } } },
//             { $group: { _id: "$finish", count: { $sum: 1 } } },
//             { $sort: { _id: 1 } }
//         ]);

//         const finishOptions = finishes.map(f => ({
//             value: f._id,
//             label: f._id.charAt(0).toUpperCase() + f._id.slice(1), // Capitalize
//             productCount: f.count
//         }));

//         // 6. GET ALL UNIQUE PRODUCT TAGS (with counts)
//         const productTags = await Product.aggregate([
//             { $match: baseFilter },
//             { $unwind: "$productTags" },
//             { $group: { _id: "$productTags", count: { $sum: 1 } } },
//             { $sort: { count: -1 } }
//         ]);

//         const productTagOptions = productTags.map(tag => ({
//             value: tag._id,
//             label: tag._id.split('-').map(word =>
//                 word.charAt(0).toUpperCase() + word.slice(1)
//             ).join(' '),
//             productCount: tag.count
//         }));

//         // 7. GET VARIANT-LEVEL FILTER OPTIONS

//         // Get all products for variant analysis
//         const productsForVariants = await Product.find(baseFilter)
//             .select('variants')
//             .lean();

//         // Tone Keys
//         const toneKeysMap = new Map();
//         productsForVariants.forEach(product => {
//             product.variants?.forEach(variant => {
//                 variant.toneKeys?.forEach(key => {
//                     toneKeysMap.set(key, (toneKeysMap.get(key) || 0) + 1);
//                 });
//             });
//         });

//         const toneKeyOptions = Array.from(toneKeysMap.entries()).map(([key, count]) => ({
//             value: key,
//             label: key.charAt(0).toUpperCase() + key.slice(1),
//             variantCount: count
//         })).sort((a, b) => b.variantCount - a.variantCount);

//         // Undertone Keys
//         const undertoneKeysMap = new Map();
//         productsForVariants.forEach(product => {
//             product.variants?.forEach(variant => {
//                 variant.undertoneKeys?.forEach(key => {
//                     undertoneKeysMap.set(key, (undertoneKeysMap.get(key) || 0) + 1);
//                 });
//             });
//         });

//         const undertoneKeyOptions = Array.from(undertoneKeysMap.entries()).map(([key, count]) => ({
//             value: key,
//             label: key.charAt(0).toUpperCase() + key.slice(1),
//             variantCount: count
//         })).sort((a, b) => b.variantCount - a.variantCount);

//         // Family Keys
//         const familyKeysMap = new Map();
//         productsForVariants.forEach(product => {
//             product.variants?.forEach(variant => {
//                 if (variant.familyKey) {
//                     familyKeysMap.set(variant.familyKey, (familyKeysMap.get(variant.familyKey) || 0) + 1);
//                 }
//             });
//         });

//         const familyKeyOptions = Array.from(familyKeysMap.entries()).map(([key, count]) => ({
//             value: key,
//             label: key.charAt(0).toUpperCase() + key.slice(1),
//             variantCount: count
//         })).sort((a, b) => b.variantCount - a.variantCount);

//         // 8. GET PRICE RANGE
//         const priceRange = await Product.aggregate([
//             { $match: baseFilter },
//             {
//                 $group: {
//                     _id: null,
//                     minPrice: { $min: "$minPrice" },
//                     maxPrice: { $max: "$maxPrice" }
//                 }
//             }
//         ]);

//         const priceRangeData = priceRange[0] || { minPrice: 0, maxPrice: 10000 };

//         // 9. GET VTO OPTIONS
//         const vtoTypes = await Product.aggregate([
//             { $match: { ...baseFilter, vtoType: { $ne: null, $exists: true } } },
//             { $group: { _id: "$vtoType", count: { $sum: 1 } } }
//         ]);

//         const vtoOptions = vtoTypes.map(vto => ({
//             value: vto._id,
//             label: vto._id.charAt(0).toUpperCase() + vto._id.slice(1),
//             productCount: vto.count
//         }));

//         // 10. STOCK STATUS OPTIONS (These are computed, not stored)
//         const stockStatusOptions = [
//             {
//                 value: 'in_stock',
//                 label: 'In Stock',
//                 description: 'Products with sufficient stock'
//             },
//             {
//                 value: 'low_stock',
//                 label: 'Low Stock',
//                 description: 'Products running low on stock'
//             },
//             {
//                 value: 'out_of_stock',
//                 label: 'Out of Stock',
//                 description: 'Products currently unavailable'
//             }
//         ];

//         // 11. RATING OPTIONS
//         const ratingOptions = [
//             { value: 4.5, label: '4.5 & Above', icon: '⭐' },
//             { value: 4.0, label: '4.0 & Above', icon: '⭐' },
//             { value: 3.5, label: '3.5 & Above', icon: '⭐' },
//             { value: 3.0, label: '3.0 & Above', icon: '⭐' }
//         ];

//         // 12. DISCOUNT OPTIONS
//         const hasDiscountCount = await Product.countDocuments({
//             ...baseFilter,
//             discountedPrice: { $ne: null, $gt: 0 }
//         });

//         // ==================== RESPONSE ====================
//         res.status(200).json({
//             success: true,
//             message: 'Filter options retrieved successfully',
//             filters: {
//                 // Main Product Filters
//                 brands: {
//                     title: 'Brands',
//                     filterKey: 'brand',
//                     type: 'checkbox',
//                     options: brandsWithCount,
//                     description: 'Filter by brand name or slug'
//                 },

//                 categories: {
//                     title: 'Categories',
//                     filterKey: 'category',
//                     type: 'checkbox',
//                     options: categoriesWithCount,
//                     description: 'Filter by category (includes subcategories)',
//                     hierarchical: true
//                 },

//                 skinTypes: {
//                     title: 'Skin Type',
//                     filterKey: 'skinType',
//                     type: 'checkbox',
//                     options: skinTypesWithCount,
//                     description: 'Filter by suitable skin types'
//                 },

//                 formulations: {
//                     title: 'Formulation',
//                     filterKey: 'formulation',
//                     type: 'checkbox',
//                     options: formulationsWithCount,
//                     description: 'Filter by product formulation type'
//                 },

//                 finishes: {
//                     title: 'Finish',
//                     filterKey: 'finish',
//                     type: 'checkbox',
//                     options: finishOptions,
//                     description: 'Filter by product finish'
//                 },

//                 productTags: {
//                     title: 'Product Tags',
//                     filterKey: 'productTags',
//                     type: 'checkbox',
//                     options: productTagOptions,
//                     description: 'Filter by product tags (vegan, cruelty-free, etc.)'
//                 },

//                 // Variant-Level Filters
//                 toneKeys: {
//                     title: 'Tone',
//                     filterKey: 'toneKey',
//                     type: 'checkbox',
//                     options: toneKeyOptions,
//                     description: 'Filter by shade tone (warm, cool, neutral)',
//                     variantLevel: true
//                 },

//                 undertoneKeys: {
//                     title: 'Undertone',
//                     filterKey: 'undertoneKey',
//                     type: 'checkbox',
//                     options: undertoneKeyOptions,
//                     description: 'Filter by shade undertone',
//                     variantLevel: true
//                 },

//                 familyKeys: {
//                     title: 'Color Family',
//                     filterKey: 'familyKey',
//                     type: 'checkbox',
//                     options: familyKeyOptions,
//                     description: 'Filter by color family (red, nude, pink, etc.)',
//                     variantLevel: true
//                 },

//                 // Price Range
//                 priceRange: {
//                     title: 'Price Range',
//                     filterKey: 'minPrice,maxPrice',
//                     type: 'range',
//                     min: Math.floor(priceRangeData.minPrice || 0),
//                     max: Math.ceil(priceRangeData.maxPrice || 10000),
//                     step: 50,
//                     description: 'Filter by price range'
//                 },

//                 // Rating
//                 rating: {
//                     title: 'Customer Rating',
//                     filterKey: 'minRating',
//                     type: 'radio',
//                     options: ratingOptions,
//                     description: 'Filter by minimum rating'
//                 },

//                 // VTO Support
//                 vto: {
//                     title: 'Virtual Try-On',
//                     filterKey: 'supportsVTO',
//                     type: 'toggle',
//                     description: 'Products with virtual try-on support'
//                 },

//                 vtoType: {
//                     title: 'VTO Type',
//                     filterKey: 'vtoType',
//                     type: 'radio',
//                     options: vtoOptions,
//                     description: 'Type of virtual try-on'
//                 },

//                 // Stock Status
//                 stockStatus: {
//                     title: 'Availability',
//                     filterKey: 'stockStatus',
//                     type: 'radio',
//                     options: stockStatusOptions,
//                     description: 'Filter by stock availability'
//                 },

//                 // Discount
//                 discount: {
//                     title: 'Discounted Items',
//                     filterKey: 'hasDiscount',
//                     type: 'toggle',
//                     productCount: hasDiscountCount,
//                     description: 'Show only discounted products'
//                 },

//                 // Published Status (Admin only)
//                 publishedStatus: {
//                     title: 'Published Status',
//                     filterKey: 'isPublished',
//                     type: 'radio',
//                     options: [
//                         { value: 'true', label: 'Published' },
//                         { value: 'false', label: 'Unpublished' },
//                         { value: 'all', label: 'All' }
//                     ],
//                     description: 'Filter by published status',
//                     adminOnly: true
//                 }
//             },

//             // Usage Guide
//             usage: {
//                 description: 'How to use these filters in API calls',
//                 examples: [
//                     {
//                         description: 'Filter by single brand',
//                         url: '/api/products?brand=nykaa'
//                     },
//                     {
//                         description: 'Filter by multiple brands',
//                         url: '/api/products?brand=nykaa,lakme,maybelline'
//                     },
//                     {
//                         description: 'Filter by category and skin type',
//                         url: '/api/products?category=lipstick&skinType=oily'
//                     },
//                     {
//                         description: 'Filter by price range',
//                         url: '/api/products?minPrice=500&maxPrice=2000'
//                     },
//                     {
//                         description: 'Filter by tone and undertone',
//                         url: '/api/products?toneKey=warm&undertoneKey=golden'
//                     },
//                     {
//                         description: 'Filter by rating',
//                         url: '/api/products?minRating=4.0'
//                     },
//                     {
//                         description: 'Multiple filters combined',
//                         url: '/api/products?brand=nykaa&category=lipstick&toneKey=warm&minPrice=500&maxPrice=1500'
//                     },
//                     {
//                         description: 'Search by product ID or slug',
//                         url: '/api/products?search=507f1f77bcf86cd799439011'
//                     }
//                 ]
//             },

//             // Metadata
//             metadata: {
//                 totalProducts: await Product.countDocuments(baseFilter),
//                 totalBrands: brandsWithCount.length,
//                 totalCategories: categoriesWithCount.length,
//                 totalSkinTypes: skinTypesWithCount.length,
//                 totalFormulations: formulationsWithCount.length,
//                 generatedAt: new Date().toISOString()
//             }
//         });

//     } catch (error) {
//         console.error('Error fetching filter options:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error fetching filter options',
//             error: error.message
//         });
//     }
// };
const getProductFilterOptions = async (req, res) => {
    try {
        const query = req.query;

        // Optional: Only get filters for published products
        const baseFilter = query.publishedOnly === 'true' ? { isPublished: true } : {};

        // ==================== AGGREGATION PIPELINES ====================

        // 1. GET ALL BRANDS (with product counts)
        const brands = await Brand.find({})
            .select('_id name slug logo')
            .sort({ name: 1 })
            .lean();

        const brandCounts = await Product.aggregate([
            { $match: baseFilter },
            { $group: { _id: "$brand", count: { $sum: 1 } } }
        ]);

        const brandsWithCount = brands.map(brand => {
            const countData = brandCounts.find(bc => bc._id?.toString() === brand._id.toString());
            return {
                _id: brand._id,
                name: brand.name,
                slug: brand.slug,
                logo: brand.logo,
                productCount: countData?.count || 0
            };
        }).filter(b => b.productCount > 0);

        // 2. GET ALL CATEGORIES (with product counts, hierarchical)
        const categories = await Category.find({})
            .select('_id name slug parent level image')
            .sort({ name: 1 })
            .lean();

        const categoryCounts = await Product.aggregate([
            { $match: baseFilter },

            {
                $project: {
                    allCategories: {
                        $setUnion: [
                            ["$category"],              // direct category
                            { $ifNull: ["$categoryHierarchy", []] } // parents
                        ]
                    }
                }
            },

            { $unwind: "$allCategories" },

            {
                $group: {
                    _id: "$allCategories",
                    count: { $sum: 1 }
                }
            }
        ]);


        const categoriesWithCount = categories.map(cat => {
            const countData = categoryCounts.find(
                cc => cc._id?.toString() === cat._id.toString()
            );

            return {
                _id: cat._id,
                name: cat.name,
                slug: cat.slug,
                parent: cat.parent,
                level: cat.level,
                image: cat.image,
                productCount: countData?.count || 0
            };
        });


        // 3. GET ALL SKIN TYPES (with product counts)
        const skinTypes = await SkinType.find({})
            .select('_id name slug description icon')
            .sort({ name: 1 })
            .lean();

        const skinTypeCounts = await Product.aggregate([
            { $match: baseFilter },
            { $unwind: "$skinTypes" },
            { $group: { _id: "$skinTypes", count: { $sum: 1 } } }
        ]);

        const skinTypesWithCount = skinTypes.map(st => {
            const countData = skinTypeCounts.find(stc => stc._id?.toString() === st._id.toString());
            return {
                _id: st._id,
                name: st.name,
                slug: st.slug,
                description: st.description,
                icon: st.icon,
                productCount: countData?.count || 0
            };
        }).filter(st => st.productCount > 0);

        // 4. GET ALL FORMULATIONS (with product counts)
        const formulations = await Formulation.find({})
            .select('_id name slug description')
            .sort({ name: 1 })
            .lean();

        const formulationCounts = await Product.aggregate([
            { $match: baseFilter },
            { $group: { _id: "$formulation", count: { $sum: 1 } } }
        ]);

        const formulationsWithCount = formulations.map(form => {
            const countData = formulationCounts.find(fc => fc._id?.toString() === form._id.toString());
            return {
                _id: form._id,
                name: form.name,
                slug: form.slug,
                description: form.description,
                productCount: countData?.count || 0
            };
        }).filter(f => f.productCount > 0);

        // 5. GET ALL UNIQUE FINISHES (with counts)
        const finishes = await Product.aggregate([
            { $match: { ...baseFilter, finish: { $ne: null, $exists: true } } },
            { $group: { _id: "$finish", count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        const finishOptions = finishes.map(f => ({
            value: f._id,
            label: f._id.charAt(0).toUpperCase() + f._id.slice(1), // Capitalize
            productCount: f.count
        }));

        // 6. GET ALL UNIQUE PRODUCT TAGS (with counts)
        const productTags = await Product.aggregate([
            { $match: baseFilter },
            { $unwind: "$productTags" },
            { $group: { _id: "$productTags", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const productTagOptions = productTags.map(tag => ({
            value: tag._id,
            label: tag._id.split('-').map(word =>
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' '),
            productCount: tag.count
        }));

        // 7. GET VARIANT-LEVEL FILTER OPTIONS

        // Get all products for variant analysis
        const productsForVariants = await Product.find(baseFilter)
            .select('variants')
            .lean();

        // Tone Keys
        const toneKeysMap = new Map();
        productsForVariants.forEach(product => {
            product.variants?.forEach(variant => {
                variant.toneKeys?.forEach(key => {
                    toneKeysMap.set(key, (toneKeysMap.get(key) || 0) + 1);
                });
            });
        });

        const toneKeyOptions = Array.from(toneKeysMap.entries()).map(([key, count]) => ({
            value: key,
            label: key.charAt(0).toUpperCase() + key.slice(1),
            variantCount: count
        })).sort((a, b) => b.variantCount - a.variantCount);

        // Undertone Keys
        const undertoneKeysMap = new Map();
        productsForVariants.forEach(product => {
            product.variants?.forEach(variant => {
                variant.undertoneKeys?.forEach(key => {
                    undertoneKeysMap.set(key, (undertoneKeysMap.get(key) || 0) + 1);
                });
            });
        });

        const undertoneKeyOptions = Array.from(undertoneKeysMap.entries()).map(([key, count]) => ({
            value: key,
            label: key.charAt(0).toUpperCase() + key.slice(1),
            variantCount: count
        })).sort((a, b) => b.variantCount - a.variantCount);

        // Family Keys
        const familyKeysMap = new Map();
        productsForVariants.forEach(product => {
            product.variants?.forEach(variant => {
                if (variant.familyKey) {
                    familyKeysMap.set(variant.familyKey, (familyKeysMap.get(variant.familyKey) || 0) + 1);
                }
            });
        });

        const familyKeyOptions = Array.from(familyKeysMap.entries()).map(([key, count]) => ({
            value: key,
            label: key.charAt(0).toUpperCase() + key.slice(1),
            variantCount: count
        })).sort((a, b) => b.variantCount - a.variantCount);

        // 8. GET PRICE RANGE
        const priceRange = await Product.aggregate([
            { $match: baseFilter },
            {
                $group: {
                    _id: null,
                    minPrice: { $min: "$minPrice" },
                    maxPrice: { $max: "$maxPrice" }
                }
            }
        ]);

        const priceRangeData = priceRange[0] || { minPrice: 0, maxPrice: 10000 };

        // 9. GET VTO OPTIONS
        const vtoTypes = await Product.aggregate([
            { $match: { ...baseFilter, vtoType: { $ne: null, $exists: true } } },
            { $group: { _id: "$vtoType", count: { $sum: 1 } } }
        ]);

        const vtoOptions = vtoTypes.map(vto => ({
            value: vto._id,
            label: vto._id.charAt(0).toUpperCase() + vto._id.slice(1),
            productCount: vto.count
        }));

        // 10. STOCK STATUS OPTIONS (These are computed, not stored)
        const stockStatusOptions = [
            {
                value: 'in_stock',
                label: 'In Stock',
                description: 'Products with sufficient stock'
            },
            {
                value: 'low_stock',
                label: 'Low Stock',
                description: 'Products running low on stock'
            },
            {
                value: 'out_of_stock',
                label: 'Out of Stock',
                description: 'Products currently unavailable'
            }
        ];

        // 11. RATING OPTIONS
        const ratingOptions = [
            { value: 4.5, label: '4.5 & Above', icon: '⭐' },
            { value: 4.0, label: '4.0 & Above', icon: '⭐' },
            { value: 3.5, label: '3.5 & Above', icon: '⭐' },
            { value: 3.0, label: '3.0 & Above', icon: '⭐' }
        ];

        // 12. DISCOUNT OPTIONS
        const hasDiscountCount = await Product.countDocuments({
            ...baseFilter,
            discountedPrice: { $ne: null, $gt: 0 }
        });

        // ==================== RESPONSE ====================
        res.status(200).json({
            success: true,
            message: 'Filter options retrieved successfully',
            filters: {
                // Main Product Filters
                brands: {
                    title: 'Brands',
                    filterKey: 'brand',
                    type: 'checkbox',
                    options: brandsWithCount,
                    description: 'Filter by brand name or slug'
                },

                categories: {
                    title: 'Categories',
                    filterKey: 'category',
                    type: 'checkbox',
                    options: categoriesWithCount,
                    description: 'Filter by category (includes subcategories)',
                    hierarchical: true
                },

                skinTypes: {
                    title: 'Skin Type',
                    filterKey: 'skinType',
                    type: 'checkbox',
                    options: skinTypesWithCount,
                    description: 'Filter by suitable skin types'
                },

                formulations: {
                    title: 'Formulation',
                    filterKey: 'formulation',
                    type: 'checkbox',
                    options: formulationsWithCount,
                    description: 'Filter by product formulation type'
                },

                finishes: {
                    title: 'Finish',
                    filterKey: 'finish',
                    type: 'checkbox',
                    options: finishOptions,
                    description: 'Filter by product finish'
                },

                productTags: {
                    title: 'Product Tags',
                    filterKey: 'productTags',
                    type: 'checkbox',
                    options: productTagOptions,
                    description: 'Filter by product tags (vegan, cruelty-free, etc.)'
                },

                // Variant-Level Filters
                toneKeys: {
                    title: 'Tone',
                    filterKey: 'toneKey',
                    type: 'checkbox',
                    options: toneKeyOptions,
                    description: 'Filter by shade tone (warm, cool, neutral)',
                    variantLevel: true
                },

                undertoneKeys: {
                    title: 'Undertone',
                    filterKey: 'undertoneKey',
                    type: 'checkbox',
                    options: undertoneKeyOptions,
                    description: 'Filter by shade undertone',
                    variantLevel: true
                },

                familyKeys: {
                    title: 'Color Family',
                    filterKey: 'familyKey',
                    type: 'checkbox',
                    options: familyKeyOptions,
                    description: 'Filter by color family (red, nude, pink, etc.)',
                    variantLevel: true
                },

                // Price Range
                priceRange: {
                    title: 'Price Range',
                    filterKey: 'minPrice,maxPrice',
                    type: 'range',
                    min: Math.floor(priceRangeData.minPrice || 0),
                    max: Math.ceil(priceRangeData.maxPrice || 10000),
                    step: 50,
                    description: 'Filter by price range'
                },

                // Rating
                rating: {
                    title: 'Customer Rating',
                    filterKey: 'minRating',
                    type: 'radio',
                    options: ratingOptions,
                    description: 'Filter by minimum rating'
                },

                // VTO Support
                vto: {
                    title: 'Virtual Try-On',
                    filterKey: 'supportsVTO',
                    type: 'toggle',
                    description: 'Products with virtual try-on support'
                },

                vtoType: {
                    title: 'VTO Type',
                    filterKey: 'vtoType',
                    type: 'radio',
                    options: vtoOptions,
                    description: 'Type of virtual try-on'
                },

                // Stock Status
                stockStatus: {
                    title: 'Availability',
                    filterKey: 'stockStatus',
                    type: 'radio',
                    options: stockStatusOptions,
                    description: 'Filter by stock availability'
                },

                // Discount
                discount: {
                    title: 'Discounted Items',
                    filterKey: 'hasDiscount',
                    type: 'toggle',
                    productCount: hasDiscountCount,
                    description: 'Show only discounted products'
                },

                // Published Status (Admin only)
                publishedStatus: {
                    title: 'Published Status',
                    filterKey: 'isPublished',
                    type: 'radio',
                    options: [
                        { value: 'true', label: 'Published' },
                        { value: 'false', label: 'Unpublished' },
                        { value: 'all', label: 'All' }
                    ],
                    description: 'Filter by published status',
                    adminOnly: true
                }
            },

            // Usage Guide
            usage: {
                description: 'How to use these filters in API calls',
                examples: [
                    {
                        description: 'Filter by single brand',
                        url: '/api/products?brand=nykaa'
                    },
                    {
                        description: 'Filter by multiple brands',
                        url: '/api/products?brand=nykaa,lakme,maybelline'
                    },
                    {
                        description: 'Filter by category and skin type',
                        url: '/api/products?category=lipstick&skinType=oily'
                    },
                    {
                        description: 'Filter by price range',
                        url: '/api/products?minPrice=500&maxPrice=2000'
                    },
                    {
                        description: 'Filter by tone and undertone',
                        url: '/api/products?toneKey=warm&undertoneKey=golden'
                    },
                    {
                        description: 'Filter by rating',
                        url: '/api/products?minRating=4.0'
                    },
                    {
                        description: 'Multiple filters combined',
                        url: '/api/products?brand=nykaa&category=lipstick&toneKey=warm&minPrice=500&maxPrice=1500'
                    },
                    {
                        description: 'Search by product ID or slug',
                        url: '/api/products?search=507f1f77bcf86cd799439011'
                    }
                ]
            },

            // Metadata
            metadata: {
                totalProducts: await Product.countDocuments(baseFilter),
                totalBrands: brandsWithCount.length,
                totalCategories: categoriesWithCount.length,
                totalSkinTypes: skinTypesWithCount.length,
                totalFormulations: formulationsWithCount.length,
                generatedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error fetching filter options:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching filter options',
            error: error.message
        });
    }
};

const getAllProducts = async (req, res) => {
    try {
        const query = req.query;
        const filter = {};

        // ------------------------- PAGINATION -------------------------
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 12;
        const skip = (page - 1) * limit;

        // ------------------------- SEARCH BY ID OR SLUG -------------------------
        if (query.search) {
            const searchTerm = query.search.trim();

            // Check if it's a valid MongoDB ObjectId
            const isValidObjectId = /^[a-f\d]{24}$/i.test(searchTerm);

            if (isValidObjectId) {
                // Search by product ID
                filter._id = searchTerm;
            } else {
                // Search by slug (in slugs array)
                filter.slugs = { $in: [searchTerm] };
            }
        }

        // ------------------------- BRAND FILTER -------------------------
        if (query.brand) {
            const brandInput = query.brand.split(',');
            const brandIds = [];
            const brandSlugs = [];

            for (const item of brandInput) {
                if (/^[a-f\d]{24}$/i.test(item)) {
                    brandIds.push(item);
                } else {
                    brandSlugs.push(item);
                }
            }

            if (brandIds.length > 0 && brandSlugs.length > 0) {
                filter.$or = [
                    { brand: { $in: brandIds } },
                    { brandSlug: { $in: brandSlugs } }
                ];
            } else if (brandIds.length > 0) {
                filter.brand = { $in: brandIds };
            } else if (brandSlugs.length > 0) {
                filter.brandSlug = { $in: brandSlugs };
            }
        }

        // ------------------------- CATEGORY FILTER (with children) -------------------------
        if (query.category) {
            const categoryInput = query.category.split(',');
            const categoryIds = [];
            const categorySlugs = [];

            for (const item of categoryInput) {
                if (/^[a-f\d]{24}$/i.test(item)) {
                    categoryIds.push(item);
                } else {
                    categorySlugs.push(item);
                }
            }

            // Fetch category IDs from slugs
            if (categorySlugs.length > 0) {
                const categoryDocs = await Category.find({ slug: { $in: categorySlugs } }, '_id');
                categoryIds.push(...categoryDocs.map(c => c._id.toString()));
            }

            const allCategoryIds = new Set(categoryIds);

            // Recursive function to fetch child categories
            const fetchChildren = async (parentId) => {
                const children = await Category.find({ parent: parentId }, '_id');
                for (const child of children) {
                    if (!allCategoryIds.has(child._id.toString())) {
                        allCategoryIds.add(child._id.toString());
                        await fetchChildren(child._id);
                    }
                }
            };

            for (const id of categoryIds) {
                await fetchChildren(id);
            }

            filter.category = { $in: Array.from(allCategoryIds) };
        }

        // ------------------------- SKIN TYPE FILTER -------------------------
        if (query.skinType) {
            const skinTypeInput = query.skinType.split(',');
            const skinTypeIds = [];
            const skinTypeSlugs = [];

            for (const item of skinTypeInput) {
                if (/^[a-f\d]{24}$/i.test(item)) {
                    skinTypeIds.push(item);
                } else {
                    skinTypeSlugs.push(item);
                }
            }

            if (skinTypeIds.length > 0 && skinTypeSlugs.length > 0) {
                filter.$or = filter.$or || [];
                filter.$or.push(
                    { skinTypes: { $in: skinTypeIds } },
                    { skinTypeSlugs: { $in: skinTypeSlugs } }
                );
            } else if (skinTypeIds.length > 0) {
                filter.skinTypes = { $in: skinTypeIds };
            } else if (skinTypeSlugs.length > 0) {
                filter.skinTypeSlugs = { $in: skinTypeSlugs };
            }
        }

        // ------------------------- FORMULATION FILTER -------------------------
        // ------------------------- FORMULATION FILTER -------------------------
        if (query.formulation) {
            const formulationInput = query.formulation.split(',');
            const formulationIds = [];
            const formulationNames = [];

            for (const item of formulationInput) {
                if (/^[a-f\d]{24}$/i.test(item)) {
                    formulationIds.push(item);
                } else {
                    formulationNames.push(item);
                }
            }

            if (formulationIds.length > 0 && formulationNames.length > 0) {
                filter.$or = filter.$or || [];
                filter.$or.push(
                    { formulation: { $in: formulationIds } },
                    {
                        formulation: {
                            $in: await mongoose.model('Formulation').find(
                                { name: { $in: formulationNames.map(n => new RegExp(`^${n}$`, 'i')) } },
                                '_id'
                            ).then(docs => docs.map(d => d._id))
                        }
                    }
                );
            }
            else if (formulationIds.length > 0) {
                filter.formulation = { $in: formulationIds };
            }
            else if (formulationNames.length > 0) {
                const formulationDocs = await mongoose.model('Formulation').find(
                    { name: { $in: formulationNames.map(n => new RegExp(`^${n}$`, 'i')) } },
                    '_id'
                );

                filter.formulation = { $in: formulationDocs.map(f => f._id) };
            }
        }


        // ------------------------- FINISH FILTER -------------------------
        if (query.finish) {
            filter.finish = { $in: query.finish.split(',') };
        }

        // ------------------------- PRODUCT TAGS FILTER -------------------------
        if (query.productTags) {
            filter.productTags = { $in: query.productTags.split(',') };
        }

        // ------------------------- VARIANT-LEVEL FILTERS -------------------------
        // Filter by tone keys
        if (query.toneKey) {
            filter['variants.toneKeys'] = { $in: query.toneKey.split(',') };
        }

        // Filter by undertone keys
        if (query.undertoneKey) {
            filter['variants.undertoneKeys'] = { $in: query.undertoneKey.split(',') };
        }

        // Filter by family key
        if (query.familyKey) {
            filter['variants.familyKey'] = { $in: query.familyKey.split(',') };
        }

        // Filter by shade name
        if (query.shadeName) {
            filter['variants.shadeName'] = { $regex: query.shadeName, $options: 'i' };
        }

        // Filter by SKU
        if (query.sku) {
            filter['variants.sku'] = query.sku;
        }

        // ------------------------- PRICE RANGE FILTER -------------------------
        // ------------------------- PRICE RANGE FILTER (VARIANT LEVEL) -------------------------
        if (query.minPrice || query.maxPrice) {
            const priceConditions = [];

            if (query.minPrice) {
                priceConditions.push({
                    $or: [
                        { "variants.discountedPrice": { $gte: Number(query.minPrice) } },
                        { "variants.displayPrice": { $gte: Number(query.minPrice) } }
                    ]
                });
            }

            if (query.maxPrice) {
                priceConditions.push({
                    $or: [
                        { "variants.discountedPrice": { $lte: Number(query.maxPrice) } },
                        { "variants.displayPrice": { $lte: Number(query.maxPrice) } }
                    ]
                });
            }

            filter.$and = [...(filter.$and || []), ...priceConditions];
        }

        // ------------------------- PUBLISHED STATUS FILTER -------------------------
        if (query.isPublished !== undefined) {
            filter.isPublished = query.isPublished === 'true';
        }

        // ------------------------- VTO FILTER -------------------------
        if (query.supportsVTO !== undefined) {
            filter.supportsVTO = query.supportsVTO === 'true';
        }

        if (query.vtoType) {
            filter.vtoType = query.vtoType;
        }

        // ------------------------- DISCOUNT FILTER -------------------------
        if (query.hasDiscount === 'true') {
            filter.discountedPrice = { $ne: null, $gt: 0 };
        }

        // ------------------------- STOCK FILTER (VARIANT THRESHOLD) -------------------------
        if (query.stockStatus) {
            switch (query.stockStatus) {

                case 'out_of_stock':
                    filter['variants.stock'] = 0;
                    break;

                case 'low_stock':
                    filter.$expr = {
                        $and: [
                            { $gt: ["$variants.stock", 0] },
                            { $lt: ["$variants.stock", "$variants.thresholdValue"] }
                        ]
                    };
                    break;

                case 'in_stock':
                    filter.$expr = {
                        $gte: ["$variants.stock", "$variants.thresholdValue"]
                    };
                    break;
            }
        }


        // ------------------------- RATING FILTER -------------------------
        if (query.minRating) {
            filter.avgRating = { $gte: Number(query.minRating) };
        }

        // ------------------------- DATE FILTERS -------------------------
        if (query.createdAfter) {
            filter.createdAt = filter.createdAt || {};
            filter.createdAt.$gte = new Date(query.createdAfter);
        }
        if (query.createdBefore) {
            filter.createdAt = filter.createdAt || {};
            filter.createdAt.$lte = new Date(query.createdBefore);
        }

        // ------------------------- SELLER FILTER -------------------------
        if (query.seller) {
            filter.seller = query.seller;
        }

        // ------------------------- FETCH PRODUCTS -------------------------
        const total = await Product.countDocuments(filter);

        const products = await Product.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('category', 'name slug')
            .populate('brand', 'name slug')
            .populate('skinTypes', 'name slug')
            .populate('formulation', 'name slug')
            .populate('seller', 'name email')
            .lean();

        // ------------------------- GET FILTER COUNTS -------------------------
        const getCounts = async () => {
            // Get all products matching current filter (without pagination)
            const allFilteredProducts = await Product.find(filter)
                .select('brand category skinTypes formulation finish productTags variants brandSlug categorySlug skinTypeSlugs formulationSlug')
                .lean();

            const counts = {
                brands: {},
                categories: {},
                skinTypes: {},
                formulations: {},
                finishes: {},
                productTags: {},
                toneKeys: {},
                undertoneKeys: {},
                familyKeys: {},
                total: total
            };

            // Count occurrences
            allFilteredProducts.forEach(product => {
                // Brand counts
                if (product.brand) {
                    const brandId = product.brand.toString();
                    counts.brands[brandId] = (counts.brands[brandId] || 0) + 1;
                }

                // Category counts
                if (product.category) {
                    const catId = product.category.toString();
                    counts.categories[catId] = (counts.categories[catId] || 0) + 1;
                }

                // Skin type counts
                if (product.skinTypes) {
                    product.skinTypes.forEach(st => {
                        const stId = st.toString();
                        counts.skinTypes[stId] = (counts.skinTypes[stId] || 0) + 1;
                    });
                }

                // Formulation counts
                if (product.formulation) {
                    const formId = product.formulation.toString();
                    counts.formulations[formId] = (counts.formulations[formId] || 0) + 1;
                }

                // Finish counts
                if (product.finish) {
                    counts.finishes[product.finish] = (counts.finishes[product.finish] || 0) + 1;
                }

                // Product tags counts
                if (product.productTags) {
                    product.productTags.forEach(tag => {
                        counts.productTags[tag] = (counts.productTags[tag] || 0) + 1;
                    });
                }

                // Variant-level counts
                if (product.variants) {
                    product.variants.forEach(variant => {
                        // Tone keys
                        if (variant.toneKeys) {
                            variant.toneKeys.forEach(key => {
                                counts.toneKeys[key] = (counts.toneKeys[key] || 0) + 1;
                            });
                        }

                        // Undertone keys
                        if (variant.undertoneKeys) {
                            variant.undertoneKeys.forEach(key => {
                                counts.undertoneKeys[key] = (counts.undertoneKeys[key] || 0) + 1;
                            });
                        }

                        // Family keys
                        if (variant.familyKey) {
                            counts.familyKeys[variant.familyKey] = (counts.familyKeys[variant.familyKey] || 0) + 1;
                        }
                    });
                }
            });

            return counts;
        };

        // Only get counts if requested (optional, as it can be expensive)
        let filterCounts = null;
        if (query.includeCounts === 'true') {
            filterCounts = await getCounts();
        }

        // ------------------------- FORMAT RESPONSE -------------------------
        const dashboardData = products.map((p) => {
            // Default product image
            let image = null;
            if (p.variants?.length > 0 && p.variants[0].images?.length > 0) {
                image = p.variants[0].images[0];
            }

            const threshold = p.lowStockThreshold ?? 10;

            // Variant Mapping with Stock Status
            const variants = (p.variants || []).map(v => {
                let stockStatus = "in_stock";

                if (v.stock === 0) {
                    stockStatus = "out_of_stock";
                } else if (v.stock < threshold) {
                    stockStatus = "few_left";
                }

                return {
                    sku: v.sku,
                    shadeName: v.shadeName,
                    slug: v.slug,
                    hex: v.hex,
                    stock: v.stock ?? 0,
                    stockStatus,
                    sales: v.sales ?? 0,
                    displayPrice: v.displayPrice,
                    discountedPrice: v.discountedPrice,
                    familyKey: v.familyKey,
                    toneKeys: v.toneKeys || [],
                    undertoneKeys: v.undertoneKeys || [],
                    lab: v.lab,
                    images: v.images || [],
                    isActive: v.isActive
                };
            });

            return {
                _id: p._id,
                name: p.name,
                slugs: p.slugs || [],
                image,

                brand: {
                    _id: p.brand?._id,
                    name: p.brand?.name,
                    slug: p.brand?.slug || p.brandSlug
                },

                category: {
                    _id: p.category?._id,
                    name: p.category?.name,
                    slug: p.category?.slug || p.categorySlug
                },

                skinTypes: (p.skinTypes || []).map(st => ({
                    _id: st._id,
                    name: st.name,
                    slug: st.slug
                })),

                formulation: p.formulation ? {
                    _id: p.formulation._id,
                    name: p.formulation.name,
                    slug: p.formulation.slug || p.formulationSlug
                } : null,

                finish: p.finish,

                price: p.price,
                discountedPrice: p.discountedPrice,
                discountPercent: p.discountPercent,
                minPrice: p.minPrice,
                maxPrice: p.maxPrice,

                summary: p.summary,
                description: p.description,
                ingredients: p.ingredients,
                features: p.features,

                productTags: p.productTags || [],

                avgRating: p.avgRating,
                totalRatings: p.totalRatings,

                isPublished: p.isPublished,
                supportsVTO: p.supportsVTO,
                vtoType: p.vtoType,

                seller: p.seller ? {
                    _id: p.seller._id,
                    name: p.seller.name,
                    email: p.seller.email
                } : null,

                variants,

                createdAt: p.createdAt,
                updatedAt: p.updatedAt
            };
        });

        // ------------------------- RESPONSE -------------------------
        const response = {
            success: true,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            count: dashboardData.length,
            products: dashboardData
        };

        // Add counts if requested
        if (filterCounts) {
            response.filterCounts = filterCounts;
        }

        res.status(200).json(response);

    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching products',
            error: error.message
        });
    }
};

// const getAllProducts = async (req, res) => {
//     try {
//         const query = req.query;
//         const filter = {};

//         // ------------------------- PAGINATION -------------------------
//         const page = Number(query.page) || 1;
//         const limit = Number(query.limit) || 12;
//         const skip = (page - 1) * limit;

//         // ------------------------- FILTERS -------------------------
//         if (query.brand) filter.brand = { $in: query.brand.split(',') };

//         if (query.category) {
//             const categoryIds = query.category.split(',');
//             const allCategoryIds = new Set(categoryIds);

//             const fetchChildren = async (parentId) => {
//                 const children = await Category.find({ parent: parentId }, '_id');
//                 for (const child of children) {
//                     if (!allCategoryIds.has(child._id.toString())) {
//                         allCategoryIds.add(child._id.toString());
//                         await fetchChildren(child._id);
//                     }
//                 }
//             };

//             for (const id of categoryIds) {
//                 await fetchChildren(id);
//             }

//             filter.category = { $in: Array.from(allCategoryIds) };
//         }

//         if (query.shadeOptions) filter.shadeOptions = { $in: query.shadeOptions.split(',') };
//         if (query.colorOptions) filter.colorOptions = { $in: query.colorOptions.split(',') };
//         if (query.productTags) filter.productTags = { $in: query.productTags.split(',') };

//         const dynamicFilters = [
//             'preference', 'ingredients', 'benefits', 'concern', 'skinType',
//             'makeupFinish', 'formulation', 'color', 'skinTone', 'gender', 'age', 'conscious'
//         ];
//         dynamicFilters.forEach(attr => {
//             if (query[attr]) {
//                 filter.productTags = { $in: query[attr].split(',') };
//             }
//         });

//         if (query.minPrice || query.maxPrice) {
//             filter.price = {};
//             if (query.minPrice) filter.price.$gte = Number(query.minPrice);
//             if (query.maxPrice) filter.price.$lte = Number(query.maxPrice);
//         }

//         // ------------------------- FETCH PRODUCTS -------------------------
//         const total = await Product.countDocuments(filter);

//         const products = await Product.find(filter)
//             .sort({ createdAt: -1 })
//             .skip(skip)
//             .limit(limit)
//             .populate('category', 'name')
//             .lean();

//         // ------------------------- FORMAT RESPONSE -------------------------
//         const dashboardData = products.map((p) => {

//             // Default product image
//             let image = null;
//             if (p.variants?.length > 0 && p.variants[0].images?.length > 0) {
//                 image = p.variants[0].images[0];
//             } else if (Array.isArray(p.images) && p.images.length > 0) {
//                 image = p.images[0];
//             }

//             const threshold = p.lowStockThreshold ?? 10;

//             // ---------------------- Variant Mapping WITH STOCK STATUS ----------------------
//             const variants = (p.variants || []).map(v => {
//                 let stockStatus = "in_stock";

//                 if (v.stock === 0) {
//                     stockStatus = "out_of_stock";
//                 } else if (v.stock < threshold) {
//                     stockStatus = "few_left";
//                 }

//                 return {
//                     sku: v.sku,
//                     shadeName: v.shadeName,
//                     hex: v.hex,
//                     stock: v.stock ?? 0,
//                     stockStatus, // <-- NEW STOCK STATUS FIELD
//                     originalPrice: v.originalPrice,
//                     discountedPrice: v.displayPrice,
//                     discountAmount: v.discountAmount,
//                     image: v.images?.[0] || p.images?.[0] || null,
//                 };
//             });

//             return {
//                 _id: p._id,
//                 name: p.name,

//                 image,
//                 brand: p.brand,
//                 category: p.category?.name || '',

//                 price: p.price,
//                 discountedPrice: p.discountedPrice,

//                 summary: p.summary || (p.description?.slice(0, 100) || ''),
//                 ingredients: p.ingredients?.slice(0, 100),

//                 sales: p.sales,
//                 remaining: p.quantity,

//                 variants
//             };
//         });

//         // ------------------------- RESPONSE -------------------------
//         res.status(200).json({
//             success: true,
//             total,
//             page,
//             totalPages: Math.ceil(total / limit),
//             count: dashboardData.length,
//             products: dashboardData,
//         });

//     } catch (error) {
//         res.status(500).json({
//             message: 'Error fetching products',
//             error: error.message
//         });
//     }
// };

const updateProductStock = async (req, res) => {
    try {
        const { productId, variantSku, quantity } = req.body;

        let product;
        if (variantSku) {
            // 🔹 Update a specific variant's stock
            product = await Product.findOneAndUpdate(
                { _id: productId, "variants.sku": variantSku },
                {
                    $set: { "variants.$.stock": quantity },
                    $setOnInsert: { "variants.$.sales": 0 }
                },
                { new: true }
            );

            if (product) {
                // Recalculate total stock & status after variant update
                const totalQuantity = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
                const threshold = product.thresholdValue || 0;

                product.quantity = totalQuantity;
                product.status =
                    totalQuantity === 0 ? "Out of stock" :
                        totalQuantity < threshold ? "Low stock" :
                            "In-stock";

                await product.save();
            }
        } else {
            // 🔹 Update global stock (non-variant products only)
            const updated = await Product.findById(productId);
            if (!updated) return res.status(404).json({ message: "Product not found" });

            const threshold = updated.thresholdValue || 0;
            const status =
                quantity === 0 ? "Out of stock" :
                    quantity < threshold ? "Low stock" :
                        "In-stock";

            updated.quantity = quantity;
            updated.status = status;
            product = await updated.save();
        }

        if (!product) return res.status(404).json({ message: "Product not found" });

        res.status(200).json({ message: "✅ Stock updated successfully", product });
    } catch (error) {
        res.status(500).json({ message: "❌ Error updating stock", error: error.message });
    }
};

const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await Product.findByIdAndDelete(id);
        if (!deleted) return res.status(404).json({ message: 'Product not found' });
        res.status(200).json({ message: 'Product deleted successfully', product: deleted });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete product', error: error.message });
    }
}

// const getSingleProductById = async (req, res) => {
//     try {
//         const { id } = req.params;

//         if (!mongoose.Types.ObjectId.isValid(id))
//             return res.status(400).json({ message: 'Invalid product ID format' });

//         const product = await Product.findById(id)
//             .populate('category', 'name slug')
//             .populate('categoryHierarchy', 'name slug')
//             .lean();

//         if (!product) return res.status(404).json({ message: '❌ Product not found' });

//         // ✅ Ensure product has a slug (auto-generate if missing)
//         if (!product.slug) {
//             const { generateUniqueSlug } = await import("../middlewares/utils/slug.js");
//             const slug = await generateUniqueSlug(Product, product.name);
//             await Product.findByIdAndUpdate(id, { slug });
//             product.slug = slug;
//         }

//         // ✅ Variant handling
//         if (product.variants?.length) {
//             product.variants = product.variants.map(v => {
//                 let statusMessage;
//                 if (v.stock === 0) statusMessage = "No stock available now, please try again later";
//                 else if (v.stock < (v.thresholdValue || 5)) statusMessage = `Few left (${v.stock})`;
//                 else statusMessage = "In-stock";


//                 return {
//                     ...v,
//                     status: statusMessage,
//                     displayPrice:
//                         v.discountedPrice && v.discountedPrice < v.price
//                             ? v.discountedPrice
//                             : v.price
//                 };
//             });
//             delete product.quantity;
//             delete product.status;
//         } else {
//             // ✅ Non-variant stock message
//             let statusMessage;
//             if (product.quantity === 0)
//                 statusMessage = "No stock available now, please try again later";
//             else if (product.quantity < (product.thresholdValue || 5))
//                 statusMessage = `Few left (${product.quantity})`;
//             else statusMessage = "In-stock";
//             product.status = statusMessage;
//         }

//         // ✅ Final response (slug included)
//         res.status(200).json({
//             message: "✅ Product fetched successfully",
//             product: {
//                 ...product,
//                 slug: product.slug, // explicitly ensure slug is included
//             }
//         });

//     } catch (error) {
//         console.error("❌ Error fetching single product:", error);
//         res.status(500).json({
//             message: "Failed to fetch product",
//             error: error.message
//         });
//     }
// };
const getSingleProductById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id))
            return res.status(400).json({ message: 'Invalid product ID format' });

        const product = await Product.findById(id)
            .populate('category', 'name slug')
            .populate('categoryHierarchy', 'name slug')
            .lean();

        if (!product) return res.status(404).json({ message: '❌ Product not found' });

        // ✅ Ensure product has a slug
        if (!product.slug) {
            const { generateUniqueSlug } = await import("../middlewares/utils/slug.js");
            const slug = await generateUniqueSlug(Product, product.name);
            await Product.findByIdAndUpdate(id, { slug });
            product.slug = slug;
        }

        // -------------------------------------------------------
        // ✅ VARIANT HANDLING + WAREHOUSE STOCK PATCH
        // -------------------------------------------------------
        if (product.variants?.length) {

            product.variants = product.variants.map(v => {

                // 🔥 NEW: Ensure warehouse stock always returned
                const warehouseStock = v.stockByWarehouse || [];

                // 🔥 NEW: Auto-sync global stock with warehouse stock if available
                let finalStock = v.stock;

                if (warehouseStock.length > 0) {
                    finalStock = warehouseStock.reduce((sum, w) => sum + (w.stock || 0), 0);
                }

                // 🔥 Stock status message
                let statusMessage;
                if (finalStock === 0) statusMessage = "No stock available now, please try again later";
                else if (finalStock < (v.thresholdValue || 5))
                    statusMessage = `Few left (${finalStock})`;
                else statusMessage = "In-stock";

                return {
                    ...v,
                    stock: finalStock,               // 🔥 Updated final stock
                    stockByWarehouse: warehouseStock, // 🔥 Returned always
                    status: statusMessage,
                    displayPrice:
                        v.discountedPrice && v.discountedPrice < v.price
                            ? v.discountedPrice
                            : v.price
                };
            });

            delete product.quantity;
            delete product.status;

        } else {
            // -------------------------------------------------------
            // ✅ NON-VARIANT PRODUCT LOGIC (unchanged)
            // -------------------------------------------------------
            let statusMessage;
            if (product.quantity === 0)
                statusMessage = "No stock available now, please try again later";
            else if (product.quantity < (product.thresholdValue || 5))
                statusMessage = `Few left (${product.quantity})`;
            else statusMessage = "In-stock";

            product.status = statusMessage;
        }

        // -------------------------------------------------------
        // FINAL RESPONSE
        // -------------------------------------------------------
        res.status(200).json({
            message: "✅ Product fetched successfully",
            product: {
                ...product,
                slug: product.slug
            }
        });

    } catch (error) {
        console.error("❌ Error fetching single product:", error);
        res.status(500).json({
            message: "Failed to fetch product",
            error: error.message
        });
    }
};

const updateVariantImages = async (req, res) => {
    try {
        const { id, sku } = req.params;

        // Multer-Cloudinary gives file URLs in req.files
        const uploadedImages = req.files?.map(file => file.path) || [];

        if (!uploadedImages.length) {
            return res.status(400).json({ message: "❌ No images uploaded" });
        }

        const product = await Product.findOneAndUpdate(
            { _id: id, "variants.sku": sku },
            {
                $push: {
                    "variants.$.images": { $each: uploadedImages }
                }

            },
            { new: true }
        );

        if (!product) {
            return res.status(404).json({ message: "❌ Product or variant not found" });
        }

        res.status(200).json({
            message: "✅ Variant images updated successfully",
            product
        });
    } catch (err) {
        console.error("updateVariantImages error:", err);
        res.status(500).json({ message: "Failed to update variant images", error: err.message });
    }
};

export { addProductController, getSingleProductById, getAllProducts, getProductFilterOptions, updateProductStock, updateProductById, deleteProduct, updateVariantImages };
