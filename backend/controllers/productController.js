import util from 'util';
import Product from '../models/Product.js';
import cloudinary from '../middlewares/utils/cloudinary.js';
import Category from '../models/Category.js';
import Formulation from '../models/shade/Formulation.js';
import mongoose from 'mongoose';
import moment from 'moment-timezone';
// at top of admin controller file
import { clearProductCacheForId, clearAllProductCaches } from '../middlewares/utils/cacheUtils.js';

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

//                         return {
//                             ...v,
//                             stock: Number(v.stock),
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
//         if (req.body.price) updateData.price = Number(req.body.price);
//         if (req.body.buyingPrice) updateData.buyingPrice = Number(req.body.buyingPrice);
//         if (isNaN(updateData.price) || isNaN(updateData.buyingPrice))
//             return res.status(400).json({ message: "❌ Invalid numeric values for price or buyingPrice" });

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

//                 const updatedVariant = {
//                     ...oldVariant?._doc,
//                     ...v,
//                     stock: Number(v.stock),
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
            quantity,
            expiryDate,
            scheduledAt,
            productTags: rawTags,
            variants: rawVariants,
            thresholdValue: rawThresholdValue,
            formulation,
            seller,
        } = req.body;

        // ---------------- Basic Validations ----------------
        if (!name)
            return res.status(400).json({ message: "Product name is required" });

        const existingProduct = await Product.findOne({ name: name.trim() });
        if (existingProduct)
            return res.status(400).json({ message: `Product with name "${name}" already exists` });

        if (!category && (!categories || categories.length === 0)) {
            return res.status(400).json({ message: "Category is required" });
        }

        // ---------------- Handle Scheduling ----------------
        let isPublished = true;
        let scheduleDate = null;
        if (scheduledAt) {
            // User enters IST time (local)
            const parsedDateIST = moment.tz(scheduledAt, "YYYY-MM-DD HH:mm", "Asia/Kolkata");

            if (!parsedDateIST.isValid()) {
                return res.status(400).json({ message: "❌ Invalid scheduledAt date format. Use YYYY-MM-DD HH:mm (IST)" });
            }

            // Convert IST to UTC before saving
            const parsedDateUTC = parsedDateIST.clone().tz("UTC").toDate();

            if (parsedDateUTC > new Date()) {
                isPublished = false;
                scheduleDate = parsedDateUTC; // ✅ saved in UTC
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
        if (isNaN(parsedPrice) || isNaN(parsedBuyingPrice))
            return res.status(400).json({ message: "❌ Invalid numeric values for price or buyingPrice" });

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
                if (quantity || rawThresholdValue || req.body.images || req.body.imageUrls) {
                    return res.status(400).json({
                        message: "❌ For variant products, do NOT provide global quantity, thresholdValue or images. Use variants only.",
                    });
                }

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
                            const result = await cloudinary.uploader.upload(file.path, {
                                folder: "products/variants",
                            });
                            uploadedImages.push(result.secure_url);
                        }

                        const combinedImages = [
                            ...(Array.isArray(v.images) ? v.images : []),
                            ...uploadedImages,
                        ];

                        if (combinedImages.length === 0)
                            throw new Error(`Variant ${v.sku} must have at least one image`);

                        return {
                            ...v,
                            stock: Number(v.stock),
                            sales: Number(v.sales) || 0,
                            thresholdValue: Number(v.thresholdValue),
                            discountedPrice:
                                v.discountedPrice !== undefined
                                    ? Number(v.discountedPrice)
                                    : null,
                            images: combinedImages.slice(-8),
                            isActive: v.isActive !== false,
                            createdAt: new Date(),
                        };
                    })
                );

                shadeOptions = variants.map((v) => v.shadeName).filter(Boolean);
                colorOptions = variants.map((v) => v.hex).filter(Boolean);
            } else {
                // ✅ Non-Variant Product Rules
                if (quantity === undefined)
                    return res.status(400).json({
                        message: "❌ quantity is required for non-variant products",
                    });
                if (rawThresholdValue === undefined)
                    return res.status(400).json({
                        message: "❌ thresholdValue is required for non-variant products",
                    });

                // ✅ Upload global product images
                const mainFiles = req.files?.filter((f) => f.fieldname === "images") || [];
                for (const file of mainFiles) {
                    const result = await cloudinary.uploader.upload(file.path, {
                        folder: "products",
                    });
                    images.push(result.secure_url);
                }

                if (req.body.imageUrls) {
                    let urls =
                        typeof req.body.imageUrls === "string"
                            ? JSON.parse(req.body.imageUrls)
                            : req.body.imageUrls;
                    for (const url of urls) images.push(url);
                }

                if (images.length === 0)
                    return res.status(400).json({
                        message: "❌ Non-variant products must have at least one global image",
                    });
            }
        } catch (err) {
            console.error("❌ Variants parsing error:", err);
            return res.status(400).json({ message: err.message });
        }

        // ---------------- Compute Stock Status ----------------
        const totalQuantity =
            variants.length > 0
                ? variants.reduce((sum, v) => sum + (v.stock || 0), 0)
                : Number(quantity);

        let status =
            totalQuantity === 0
                ? "Out of stock"
                : totalQuantity < Number(rawThresholdValue)
                    ? "Low stock"
                    : "In-stock";

        // ---------------- Create Product ----------------
        const product = new Product({
            name,
            variant,
            summary,
            description,
            ingredients,
            features,
            howToUse,
            price: parsedPrice,
            buyingPrice: parsedBuyingPrice,
            quantity: variants.length > 0 ? undefined : Number(quantity),
            thresholdValue: variants.length > 0 ? undefined : Number(rawThresholdValue),
            expiryDate,
            images: variants.length > 0 ? undefined : images,
            brand,
            category: resolvedCategories[0],
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

        // ---------------- Basic Checks ----------------
        if (!mongoose.Types.ObjectId.isValid(id))
            return res.status(400).json({ message: "❌ Invalid product ID" });

        const existingProduct = await Product.findById(id);
        if (!existingProduct)
            return res.status(404).json({ message: "❌ Product not found" });

        const updateData = { ...req.body };

        // ---------------- Numeric Fields ----------------
        if (req.body.price) updateData.price = Number(req.body.price);
        if (req.body.buyingPrice) updateData.buyingPrice = Number(req.body.buyingPrice);
        if (isNaN(updateData.price) || isNaN(updateData.buyingPrice))
            return res.status(400).json({ message: "❌ Invalid numeric values for price or buyingPrice" });

        // ---------------- Parse Variants ----------------
        let rawVariants = req.body.variants || [];
        if (typeof rawVariants === "string") {
            try {
                rawVariants = JSON.parse(rawVariants);
            } catch {
                rawVariants = [];
            }
        }

        // ---------------- Parse Removed Variant SKUs ----------------
        let removedVariantSkus = [];
        if (req.body.removedVariantSkus) {
            try {
                removedVariantSkus = JSON.parse(req.body.removedVariantSkus);
            } catch {
                removedVariantSkus = [];
            }
        }

        // ---------------- Parse Removed Global Images ----------------
        let removedImages = [];
        if (req.body.removedImages) {
            try {
                removedImages = JSON.parse(req.body.removedImages);
            } catch {
                removedImages = [];
            }
        }

        // ---------------- Handle Cloudinary Uploads ----------------
        const productImages = [];
        const variantImagesMap = {}; // {index: [urls]}

        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const uploadResult = await cloudinary.uploader.upload(file.path, { folder: "products" });

                if (file.fieldname === "images") {
                    productImages.push(uploadResult.secure_url);
                } else {
                    const match = file.fieldname.match(/variants\[(\d+)\]\[images\]/);
                    if (match) {
                        const idx = Number(match[1]);
                        if (!variantImagesMap[idx]) variantImagesMap[idx] = [];
                        variantImagesMap[idx].push(uploadResult.secure_url);
                    }
                }
            }
        }

        // ---------------- VARIANT PRODUCT LOGIC ----------------
        if (existingProduct.variants?.length > 0 || rawVariants.length > 0) {
            if (req.body.quantity || req.body.thresholdValue || req.body.images || req.body.imageUrls) {
                return res.status(400).json({
                    message: "❌ For variant products, do NOT provide global quantity, thresholdValue, or images. Use variants only."
                });
            }

            // 1️⃣ Map existing variants by SKU
            const variantMap = new Map();
            for (const oldVar of existingProduct.variants || []) {
                variantMap.set(oldVar.sku, oldVar);
            }

            // 2️⃣ Remove variants that are explicitly deleted
            for (const sku of removedVariantSkus) {
                variantMap.delete(sku);
            }

            // 3️⃣ Process incoming variant updates
            for (let i = 0; i < rawVariants.length; i++) {
                const v = rawVariants[i];

                if (!v.sku) throw new Error(`Variant ${i + 1} missing SKU`);
                if (v.stock === undefined || isNaN(Number(v.stock)))
                    throw new Error(`Variant ${v.sku} must have valid stock`);
                if (v.thresholdValue === undefined || isNaN(Number(v.thresholdValue)))
                    throw new Error(`Variant ${v.sku} must have valid thresholdValue`);

                const oldVariant = variantMap.get(v.sku);

                // Handle variant image removals
                let removedVariantImages = [];
                if (v.removedImages) {
                    try {
                        removedVariantImages = JSON.parse(v.removedImages);
                    } catch { }
                }

                const uploadedVariantImages = variantImagesMap[i] || [];
                const oldImages = oldVariant?.images || [];
                const retainedImages = oldImages.filter(img => !removedVariantImages.includes(img));

                const combinedImages = [
                    ...(Array.isArray(v.images) ? v.images : []),
                    ...retainedImages,
                    ...uploadedVariantImages,
                ].filter(Boolean);

                if (combinedImages.length === 0)
                    throw new Error(`Variant ${v.sku} must have at least one image`);

                const updatedVariant = {
                    ...oldVariant?._doc,
                    ...v,
                    stock: Number(v.stock),
                    sales: Number(v.sales) || oldVariant?.sales || 0,
                    thresholdValue: Number(v.thresholdValue),
                    discountedPrice:
                        v.discountedPrice !== undefined
                            ? Number(v.discountedPrice)
                            : oldVariant?.discountedPrice || null,
                    images: [...new Set(combinedImages)],
                    isActive: v.isActive !== false,
                    updatedAt: new Date(),
                };

                variantMap.set(v.sku, updatedVariant);
            }

            // 4️⃣ Final updated variant list (after removal + update + add)
            const updatedVariants = Array.from(variantMap.values());

            // 5️⃣ Prepare other variant-related data
            updateData.variants = updatedVariants;
            updateData.shadeOptions = updatedVariants.map(v => v.shadeName).filter(Boolean);
            updateData.colorOptions = updatedVariants.map(v => v.hex).filter(Boolean);
            updateData.quantity = updatedVariants.reduce((sum, v) => sum + (v.stock || 0), 0);
            updateData.thresholdValue = undefined;
            updateData.images = undefined;
        }

        // ---------------- NON-VARIANT PRODUCT LOGIC ----------------
        else {
            if (req.body.variants && req.body.variants.length > 0)
                return res.status(400).json({ message: "❌ Non-variant products cannot have variants" });

            if (
                (req.body.quantity === undefined && existingProduct.quantity === undefined) ||
                isNaN(Number(req.body.quantity ?? existingProduct.quantity))
            ) {
                return res.status(400).json({ message: "❌ quantity is required for non-variant products" });
            }

            if (
                (req.body.thresholdValue === undefined && existingProduct.thresholdValue === undefined) ||
                isNaN(Number(req.body.thresholdValue ?? existingProduct.thresholdValue))
            ) {
                return res.status(400).json({ message: "❌ thresholdValue is required for non-variant products" });
            }

            let finalImages = [...(existingProduct.images || [])];
            if (removedImages.length > 0)
                finalImages = finalImages.filter(img => !removedImages.includes(img));
            if (productImages.length > 0)
                finalImages.push(...productImages);

            finalImages = [...new Set(finalImages)];
            if (finalImages.length === 0)
                return res.status(400).json({ message: "❌ Non-variant products must have at least one global image" });

            updateData.images = finalImages;
        }

        // ---------------- Compute Stock Status ----------------
        const totalQuantity =
            updateData.variants?.length > 0
                ? updateData.variants.reduce((sum, v) => sum + (v.stock || 0), 0)
                : Number(updateData.quantity || existingProduct.quantity);

        const threshold =
            updateData.variants?.length > 0
                ? Math.min(...updateData.variants.map(v => v.thresholdValue || Infinity))
                : Number(updateData.thresholdValue || existingProduct.thresholdValue);

        updateData.status =
            totalQuantity === 0
                ? "Out of stock"
                : totalQuantity < threshold
                    ? "Low stock"
                    : "In-stock";

        // ---------------- Save Update ----------------
        const updatedProduct = await Product.findByIdAndUpdate(id, updateData, { new: true });

        // Clear cache for this product id/slug
        await clearProductCacheForId(updatedProduct._id);
        await clearProductCacheForId(updatedProduct.slug);   // ❗ ADD THIS

        res.status(200).json({
            message: "✅ Product updated successfully",
            product: updatedProduct
        });

    } catch (error) {
        console.error("❌ Product update error:", error);
        res.status(400).json({
            message: error.message || "❌ Failed to update product",
            error: error.message
        });
    }
};

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
const getAllProducts = async (req, res) => {
    try {
        const query = req.query;
        const filter = {};

        // ------------------------- PAGINATION -------------------------
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 12;
        const skip = (page - 1) * limit;

        // ------------------------- FILTERS -------------------------
        if (query.brand) filter.brand = { $in: query.brand.split(',') };

        if (query.category) {
            const categoryIds = query.category.split(',');

            const allCategoryIds = new Set(categoryIds);
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

        if (query.shadeOptions) filter.shadeOptions = { $in: query.shadeOptions.split(',') };
        if (query.colorOptions) filter.colorOptions = { $in: query.colorOptions.split(',') };
        if (query.productTags) filter.productTags = { $in: query.productTags.split(',') };

        const dynamicFilters = [
            'preference', 'ingredients', 'benefits', 'concern', 'skinType',
            'makeupFinish', 'formulation', 'color', 'skinTone', 'gender', 'age', 'conscious'
        ];
        dynamicFilters.forEach(attr => {
            if (query[attr]) {
                filter.productTags = { $in: query[attr].split(',') };
            }
        });

        if (query.minPrice || query.maxPrice) {
            filter.price = {};
            if (query.minPrice) filter.price.$gte = Number(query.minPrice);
            if (query.maxPrice) filter.price.$lte = Number(query.maxPrice);
        }

        // ------------------------- FETCH PRODUCTS -------------------------
        const total = await Product.countDocuments(filter);

        const products = await Product.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('category', 'name')
            .lean();

        // ------------------------- FORMAT RESPONSE -------------------------
        const dashboardData = products.map((p) => {
            let image = null;

            // If product has variants → use first variant's first image
            if (p.variants?.length > 0 && p.variants[0].images?.length > 0) {
                image = p.variants[0].images[0];
            }
            // Otherwise use normal product image
            else if (Array.isArray(p.images) && p.images.length > 0) {
                image = p.images[0];
            }

            return {
                _id: p._id,
                name: p.name,
                variant: p.variant,
                image,
                price: p.price,
                discountedPrice: p.discountedPrice,
                summary: p.summary || (p.description?.slice(0, 100) || ''),
                ingredients: p.ingredients?.slice(0, 100),
                sales: p.sales,
                remaining: p.quantity,
                status: p.status,
                category: p.category?.name || '',
                brand: p.brand,
            };
        });

        // ------------------------- RESPONSE -------------------------
        res.status(200).json({
            success: true,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            count: dashboardData.length,
            products: dashboardData,
        });

    } catch (error) {
        res.status(500).json({ message: 'Error fetching products', error: error.message });
    }
};

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

        // ✅ Ensure product has a slug (auto-generate if missing)
        if (!product.slug) {
            const { generateUniqueSlug } = await import("../middlewares/utils/slug.js");
            const slug = await generateUniqueSlug(Product, product.name);
            await Product.findByIdAndUpdate(id, { slug });
            product.slug = slug;
        }

        // ✅ Variant handling
        if (product.variants?.length) {
            product.variants = product.variants.map(v => {
                let statusMessage;
                if (v.stock === 0) statusMessage = "No stock available now, please try again later";
                else if (v.stock < (v.thresholdValue || 5)) statusMessage = `Few left (${v.stock})`;
                else statusMessage = "In-stock";

                return {
                    ...v,
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
            // ✅ Non-variant stock message
            let statusMessage;
            if (product.quantity === 0)
                statusMessage = "No stock available now, please try again later";
            else if (product.quantity < (product.thresholdValue || 5))
                statusMessage = `Few left (${product.quantity})`;
            else statusMessage = "In-stock";
            product.status = statusMessage;
        }

        // ✅ Final response (slug included)
        res.status(200).json({
            message: "✅ Product fetched successfully",
            product: {
                ...product,
                slug: product.slug, // explicitly ensure slug is included
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

export { addProductController, getSingleProductById, getAllProducts, updateProductStock, updateProductById, deleteProduct, updateVariantImages };
