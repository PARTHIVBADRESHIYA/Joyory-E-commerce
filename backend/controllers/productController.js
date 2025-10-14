import util from 'util';
import Product from '../models/Product.js';
import cloudinary from '../middlewares/utils/cloudinary.js';
import Category from '../models/Category.js';
import Formulation from '../models/shade/Formulation.js';
import mongoose from 'mongoose';
import moment from 'moment-timezone';

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

//         // ✅ Prevent duplicate product names
//         if (!name) return res.status(400).json({ message: "Product name is required" });
//         const existingProduct = await Product.findOne({ name: name.trim() });
//         if (existingProduct) {
//             return res.status(400).json({ message: `Product with name "${name}" already exists` });
//         }

//         // ✅ Ensure at least one category provided
//         if (!category && (!categories || categories.length === 0)) {
//             return res.status(400).json({ message: "Category is required" });
//         }

//         // ✅ Handle scheduling
//         let isPublished = true;
//         let scheduleDate = null;
//         if (scheduledAt) {
//             const parsedDateIST = moment.tz(scheduledAt, "YYYY-MM-DD HH:mm", "Asia/Kolkata");
//             if (!parsedDateIST.isValid()) {
//                 return res.status(400).json({
//                     message: "❌ Invalid scheduledAt date format. Use YYYY-MM-DD HH:mm (IST)",
//                 });
//             }
//             const parsedDateUTC = parsedDateIST.toDate();
//             if (parsedDateUTC > new Date()) {
//                 isPublished = false;
//                 scheduleDate = parsedDateUTC;
//             }
//         }

//         // ✅ Normalize and resolve categories
//         let finalCategories = categories && categories.length ? (Array.isArray(categories) ? categories : [categories]) : [category];
//         const resolvedCategories = [];
//         for (let cat of finalCategories) {
//             if (!cat) continue;
//             const trimmed = String(cat).trim();
//             if (mongoose.Types.ObjectId.isValid(trimmed)) {
//                 resolvedCategories.push(trimmed);
//             } else {
//                 const foundCat = await Category.findOne({ name: { $regex: `^${trimmed}$`, $options: "i" } });
//                 if (!foundCat) return res.status(400).json({ message: `Category "${trimmed}" not found` });
//                 resolvedCategories.push(foundCat._id);
//             }
//         }

//         const foundCategories = await Category.find({ _id: { $in: resolvedCategories } });
//         if (foundCategories.length !== resolvedCategories.length) {
//             return res.status(400).json({ message: "One or more category IDs are invalid" });
//         }

//         // ✅ Build category hierarchy
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

//         // ✅ Parse product tags
//         let productTags = [];
//         try {
//             productTags = rawTags ? (typeof rawTags === "string" ? JSON.parse(rawTags) : rawTags) : [];
//         } catch {
//             productTags = [];
//         }

//         // ✅ Numeric values
//         const parsedPrice = Number(price);
//         const parsedBuyingPrice = Number(buyingPrice);
//         if (isNaN(parsedPrice) || isNaN(parsedBuyingPrice)) {
//             return res.status(400).json({ message: "❌ Invalid numeric values for price or buyingPrice" });
//         }

//         // ✅ Variants logic (with discountedPrice)
//         let variants = [];
//         let shadeOptions = [];
//         let colorOptions = [];

//         try {
//             let variantArray = rawVariants ? (typeof rawVariants === "string" ? JSON.parse(rawVariants) : rawVariants) : [];
//             if (Array.isArray(variantArray) && variantArray.length > 0) {
//                 variants = variantArray.map((v, i) => {
//                     const variantImages = [
//                         ...(req.files?.filter(f => f.fieldname === `variantImages_${i}`).map(f => f.secure_url || f.path || f.url) || []),
//                         ...(Array.isArray(v.images) ? v.images : [])
//                     ];

//                     return {
//                         ...v,
//                         stock: v.stock !== undefined ? Number(v.stock) : undefined,
//                         sales: v.sales !== undefined ? Number(v.sales) : 0,
//                         thresholdValue: v.thresholdValue !== undefined ? Number(v.thresholdValue) : undefined,
//                         discountedPrice: v.discountedPrice !== undefined ? Number(v.discountedPrice) : null, // ✅ New field
//                         images: variantImages.slice(-5),
//                         isActive: v.isActive !== false,
//                         createdAt: new Date()
//                     };
//                 });

//                 shadeOptions = variants.map(v => v.shadeName).filter(Boolean);
//                 colorOptions = variants.map(v => v.hex).filter(Boolean);
//             }
//         } catch (err) {
//             console.error("❌ Variants parsing error:", err);
//             return res.status(400).json({ message: "Invalid variants data", error: err.message });
//         }

//         // ✅ Validation: non-variant vs variant products
//         if (variants.length === 0) {
//             if (quantity === undefined) return res.status(400).json({ message: "❌ quantity is required for non-variant products" });
//             if (isNaN(Number(quantity)) || Number(quantity) < 0) return res.status(400).json({ message: "❌ quantity must be a valid number >= 0" });
//             if (rawThresholdValue === undefined) return res.status(400).json({ message: "❌ thresholdValue is required for non-variant products" });
//             if (isNaN(Number(rawThresholdValue)) || Number(rawThresholdValue) < 0) return res.status(400).json({ message: "❌ thresholdValue must be a valid number >= 0" });
//         } else {
//             if (quantity !== undefined || rawThresholdValue !== undefined) {
//                 return res.status(400).json({ message: "❌ Do not provide global quantity/thresholdValue when variants exist" });
//             }

//             for (let i = 0; i < variants.length; i++) {
//                 const v = variants[i];
//                 if (!v.images || v.images.length === 0) return res.status(400).json({ message: `❌ Variant #${i + 1}: at least one image is required` });
//                 if (v.stock === undefined || isNaN(v.stock)) return res.status(400).json({ message: `❌ Variant #${i + 1}: stock is required and must be a number` });
//                 if (v.thresholdValue === undefined || isNaN(v.thresholdValue)) return res.status(400).json({ message: `❌ Variant #${i + 1}: thresholdValue is required and must be a number` });
//             }
//         }

//         // ✅ Image upload helper
//         const uploadImageFromUrl = async (url) => {
//             const result = await cloudinary.uploader.upload(url, { folder: "products", resource_type: "image" });
//             return result.secure_url;
//         };

//         let images = [];
//         if (req.files?.length > 0) {
//             images.push(...req.files.filter(f => f.fieldname === "images").map(f => f.secure_url || f.path || f.url));
//         }

//         if (req.body.images || req.body.imageUrls) {
//             let raw = req.body.images || req.body.imageUrls;
//             try {
//                 if (typeof raw === "string") raw = JSON.parse(raw);
//                 const urls = Array.isArray(raw) ? raw : [raw];
//                 for (const url of urls) {
//                     try { images.push(await uploadImageFromUrl(url)); } catch (err) { console.warn("⚠️ Failed to upload image:", url, err.message); }
//                 }
//             } catch (err) { console.warn("⚠️ Could not parse image URLs:", err.message); }
//         }

//         // ✅ Resolve formulation
//         let formulationId = null;
//         if (formulation) {
//             try { formulationId = await resolveFormulationId(formulation); } catch (err) { return res.status(400).json({ message: err.message }); }
//         }

//         // ✅ Compute total quantity & status
//         const totalQuantity = variants.length > 0 ? variants.reduce((sum, v) => sum + (v.stock || 0), 0) : Number(quantity);
//         let status = "In-stock";
//         if (variants.length > 0) {
//             const allStatuses = variants.map(v => v.stock === 0 ? "Out of stock" : v.stock < (v.thresholdValue || 0) ? "Low stock" : "In-stock");
//             if (allStatuses.every(s => s === "Out of stock")) status = "Out of stock";
//             else if (allStatuses.some(s => s === "Low stock")) status = "Low stock";
//         } else {
//             status = totalQuantity === 0 ? "Out of stock" : totalQuantity < Number(rawThresholdValue) ? "Low stock" : "In-stock";
//         }

//         // ✅ Extract dynamic category attributes
//         let attributes = {};
//         if (foundCategories[0]?.attributes?.length > 0) {
//             for (const attr of foundCategories[0].attributes) {
//                 if (req.body[attr.key] !== undefined) attributes[attr.key] = req.body[attr.key];
//             }
//         }

//         // ✅ Create product
//         const product = new Product({
//             name,
//             variant,
//             summary,
//             description,
//             ingredients,
//             features,
//             howToUse,
//             formulation: formulationId,
//             price: parsedPrice,
//             buyingPrice: parsedBuyingPrice,
//             quantity: variants.length > 0 ? undefined : Number(quantity),
//             thresholdValue: variants.length > 0 ? undefined : Number(rawThresholdValue),
//             expiryDate,
//             images,
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
//             sales: 0,
//             views: 0,
//             commentsCount: 0,
//             affiliateEarnings: 0,
//             affiliateClicks: 0,
//             attributes,
//             seller: seller || null,
//         });

//         await product.save();
//         res.status(201).json({ message: "✅ Product created successfully", product });

//     } catch (error) {
//         console.error("❌ Product placement error:", util.inspect(error, { showHidden: false, depth: null }));
//         res.status(500).json({ message: "❌ Product placement failed", error: error.message || "Unknown error", stack: error.stack });
//     }
// };

// const updateProductById = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const updateData = { ...req.body };

//         // ---------------- Numbers ----------------
//         if (req.body.price) updateData.price = Number(req.body.price);
//         if (req.body.buyingPrice) updateData.buyingPrice = Number(req.body.buyingPrice);
//         if (req.body.quantity !== undefined) updateData.quantity = Number(req.body.quantity);
//         if (req.body.thresholdValue !== undefined) updateData.thresholdValue = Number(req.body.thresholdValue);

//         // ---------------- Variants ----------------
//         let rawVariants = req.body.variants || [];
//         if (typeof rawVariants === "string") {
//             try { rawVariants = JSON.parse(rawVariants); } catch { rawVariants = []; }
//         }

//         // ---------------- Handle uploaded images ----------------
//         const productImages = [];
//         const variantImagesMap = {}; // {0: [], 1: []} => index of variant

//         if (req.files && req.files.length > 0) {
//             req.files.forEach(file => {
//                 // Product-level images
//                 if (file.fieldname === "images") productImages.push(file.path);

//                 // Variant images: expect fieldname = variants[0][images], variants[1][images], etc.
//                 const variantMatch = file.fieldname.match(/variants\[(\d+)\]\[images\]/);
//                 if (variantMatch) {
//                     const idx = Number(variantMatch[1]);
//                     if (!variantImagesMap[idx]) variantImagesMap[idx] = [];
//                     variantImagesMap[idx].push(file.path);
//                 }
//             });
//         }

//         // ---------------- Update variants ----------------
//         if (rawVariants.length > 0) {
//             rawVariants = rawVariants.map((v, idx) => ({
//                 sku: v.sku,
//                 shadeName: v.shadeName || null,
//                 hex: v.hex || null,
//                 stock: Number(v.stock) || 0,
//                 sales: Number(v.sales) || 0,
//                 isActive: v.isActive !== false,
//                 discountedPrice: v.discountedPrice !== undefined ? Number(v.discountedPrice) : undefined,
//                 // 🔹 Merge old images with uploaded images
//                 images: [...(v.images || []), ...(variantImagesMap[idx] || [])],
//             }));

//             updateData.variants = rawVariants;
//             updateData.shadeOptions = rawVariants.map(v => v.shadeName).filter(Boolean);
//             updateData.colorOptions = rawVariants.map(v => v.hex).filter(Boolean);

//             // Recalculate total stock & status
//             updateData.quantity = rawVariants.reduce((sum, v) => sum + (v.stock || 0), 0);
//             const threshold = updateData.thresholdValue !== undefined
//                 ? updateData.thresholdValue
//                 : (await Product.findById(id))?.thresholdValue || 0;

//             updateData.status =
//                 updateData.quantity === 0 ? "Out of stock" :
//                     updateData.quantity < threshold ? "Low stock" :
//                         "In-stock";
//         }

//         // ---------------- Product-level images ----------------
//         if (productImages.length > 0) {
//             // Merge existing product images with uploaded ones
//             const existingProduct = await Product.findById(id).lean();
//             updateData.images = [...(existingProduct.images || []), ...productImages];
//         }

//         // ---------------- Update product ----------------
//         const updated = await Product.findByIdAndUpdate(id, updateData, { new: true });
//         if (!updated) return res.status(404).json({ message: "❌ Product not found" });

//         res.status(200).json({ message: "✅ Product updated successfully", product: updated });

//     } catch (error) {
//         console.error("❌ Product update error:", error);
//         res.status(500).json({ message: "Failed to update product", error: error.message });
//     }
// };

// ---------------------- CREATE PRODUCT ----------------------
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

        if (!name) return res.status(400).json({ message: "Product name is required" });
        const existingProduct = await Product.findOne({ name: name.trim() });
        if (existingProduct) return res.status(400).json({ message: `Product with name "${name}" already exists` });

        if (!category && (!categories || categories.length === 0)) {
            return res.status(400).json({ message: "Category is required" });
        }

        // --------------- Handle Scheduling ---------------
        let isPublished = true;
        let scheduleDate = null;
        if (scheduledAt) {
            const parsedDateIST = moment.tz(scheduledAt, "YYYY-MM-DD HH:mm", "Asia/Kolkata");
            if (!parsedDateIST.isValid()) {
                return res.status(400).json({ message: "❌ Invalid scheduledAt date format. Use YYYY-MM-DD HH:mm (IST)" });
            }
            const parsedDateUTC = parsedDateIST.toDate();
            if (parsedDateUTC > new Date()) {
                isPublished = false;
                scheduleDate = parsedDateUTC;
            }
        }

        // --------------- Resolve Categories ---------------
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
                if (!foundCat) return res.status(400).json({ message: `Category "${trimmed}" not found` });
                resolvedCategories.push(foundCat._id);
            }
        }

        const foundCategories = await Category.find({ _id: { $in: resolvedCategories } });
        if (foundCategories.length !== resolvedCategories.length)
            return res.status(400).json({ message: "One or more category IDs are invalid" });

        // --------------- Build Hierarchy ---------------
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

        // --------------- Parse Tags ---------------
        let productTags = [];
        try {
            productTags = rawTags ? (typeof rawTags === "string" ? JSON.parse(rawTags) : rawTags) : [];
        } catch {
            productTags = [];
        }

        const parsedPrice = Number(price);
        const parsedBuyingPrice = Number(buyingPrice);
        if (isNaN(parsedPrice) || isNaN(parsedBuyingPrice))
            return res.status(400).json({ message: "❌ Invalid numeric values for price or buyingPrice" });

        // --------------- Variants ----------------
        let variants = [];
        let shadeOptions = [];
        let colorOptions = [];

        try {
            let variantArray = rawVariants ? (typeof rawVariants === "string" ? JSON.parse(rawVariants) : rawVariants) : [];
            if (Array.isArray(variantArray) && variantArray.length > 0) {
                variants = await Promise.all(variantArray.map(async (v, i) => {
                    const uploadedImages = [];

                    // ✅ Upload variant-specific files
                    const variantFiles = req.files?.filter(f => f.fieldname === `variants[${i}][images]`) || [];
                    for (const file of variantFiles) {
                        const result = await cloudinary.uploader.upload(file.path, { folder: "products/variants" });
                        uploadedImages.push(result.secure_url);
                    }

                    const combinedImages = [
                        ...(Array.isArray(v.images) ? v.images : []),
                        ...uploadedImages
                    ];

                    return {
                        ...v,
                        stock: Number(v.stock) || 0,
                        sales: Number(v.sales) || 0,
                        thresholdValue: Number(v.thresholdValue) || 0,
                        discountedPrice: v.discountedPrice !== undefined ? Number(v.discountedPrice) : null,
                        images: combinedImages.slice(-8), // limit to last 8
                        isActive: v.isActive !== false,
                        createdAt: new Date()
                    };
                }));

                shadeOptions = variants.map(v => v.shadeName).filter(Boolean);
                colorOptions = variants.map(v => v.hex).filter(Boolean);
            }
        } catch (err) {
            console.error("❌ Variants parsing error:", err);
            return res.status(400).json({ message: "Invalid variants data", error: err.message });
        }

        // --------------- Validate Quantity ----------------
        if (variants.length === 0) {
            if (quantity === undefined) return res.status(400).json({ message: "❌ quantity is required for non-variant products" });
            if (rawThresholdValue === undefined) return res.status(400).json({ message: "❌ thresholdValue is required for non-variant products" });
        }

        // --------------- Upload Main Images ----------------
        const images = [];

        // Uploaded files
        const mainFiles = req.files?.filter(f => f.fieldname === "images") || [];
        for (const file of mainFiles) {
            const result = await cloudinary.uploader.upload(file.path, { folder: "products" });
            images.push(result.secure_url);
        }

        // URLs if any
        if (req.body.imageUrls) {
            let urls = typeof req.body.imageUrls === "string" ? JSON.parse(req.body.imageUrls) : req.body.imageUrls;
            for (const url of urls) images.push(url);
        }

        // --------------- Compute Stock Status ----------------
        const totalQuantity = variants.length > 0 ? variants.reduce((sum, v) => sum + (v.stock || 0), 0) : Number(quantity);
        let status = totalQuantity === 0 ? "Out of stock" :
            totalQuantity < Number(rawThresholdValue) ? "Low stock" : "In-stock";

        // --------------- Create Product ----------------
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
            images,
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
        res.status(201).json({ message: "✅ Product created successfully", product });

    } catch (error) {
        console.error("❌ Product placement error:", util.inspect(error, { showHidden: false, depth: null }));
        res.status(500).json({ message: "❌ Product placement failed", error: error.message });
    }
};

const updateProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const existingProduct = await Product.findById(id);
        if (!existingProduct) return res.status(404).json({ message: "❌ Product not found" });

        const updateData = { ...req.body };

        // ---------- Numeric fields ----------
        if (req.body.price) updateData.price = Number(req.body.price);
        if (req.body.buyingPrice) updateData.buyingPrice = Number(req.body.buyingPrice);
        if (req.body.quantity !== undefined) updateData.quantity = Number(req.body.quantity);
        if (req.body.thresholdValue !== undefined) updateData.thresholdValue = Number(req.body.thresholdValue);

        // ---------- Parse variants ----------
        let rawVariants = req.body.variants || [];
        if (typeof rawVariants === "string") {
            try { rawVariants = JSON.parse(rawVariants); } catch { rawVariants = []; }
        }

        // ---------- Parse removed images ----------
        let removedImages = [];
        if (req.body.removedImages) {
            try { removedImages = JSON.parse(req.body.removedImages); }
            catch { removedImages = []; }
        }

        // ---------- Cloudinary uploads ----------
        const productImages = [];
        const variantImagesMap = {}; // {0: [urls], 1: [urls]}

        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const result = await cloudinary.uploader.upload(file.path, { folder: "products" });

                if (file.fieldname === "images") {
                    productImages.push(result.secure_url);
                } else {
                    const match = file.fieldname.match(/variants\[(\d+)\]\[images\]/);
                    if (match) {
                        const idx = Number(match[1]);
                        if (!variantImagesMap[idx]) variantImagesMap[idx] = [];
                        variantImagesMap[idx].push(result.secure_url);
                    }
                }
            }
        }

        // ---------- Update variants ----------
        if (rawVariants.length > 0) {
            rawVariants = rawVariants.map((v, idx) => {
                const oldVariant = existingProduct.variants.find(x => x.sku === v.sku);
                const oldImages = oldVariant ? oldVariant.images || [] : [];

                // Handle removed images for variant (if frontend sends removedVariantImages)
                let removedVariantImages = [];
                if (v.removedImages) {
                    try { removedVariantImages = JSON.parse(v.removedImages); }
                    catch { removedVariantImages = []; }
                }

                // Keep old images except removed ones
                const filteredOld = oldImages.filter(img => !removedVariantImages.includes(img));

                // Combine remaining + existing + uploaded
                const finalImages = [...new Set([
                    ...filteredOld,
                    ...(v.images || []),
                    ...(variantImagesMap[idx] || [])
                ])];

                return {
                    ...v,
                    stock: Number(v.stock) || 0,
                    sales: Number(v.sales) || 0,
                    isActive: v.isActive !== false,
                    discountedPrice: v.discountedPrice !== undefined ? Number(v.discountedPrice) : undefined,
                    images: finalImages,
                };
            });

            updateData.variants = rawVariants;
            updateData.shadeOptions = rawVariants.map(v => v.shadeName).filter(Boolean);
            updateData.colorOptions = rawVariants.map(v => v.hex).filter(Boolean);
            updateData.quantity = rawVariants.reduce((sum, v) => sum + (v.stock || 0), 0);
        }

        // ---------- Main product images ----------
        let finalImages = [...(existingProduct.images || [])];

        // Remove unwanted images (if frontend removed some)
        if (removedImages.length > 0) {
            finalImages = finalImages.filter(img => !removedImages.includes(img));
        }

        // Append newly uploaded product images
        if (productImages.length > 0) {
            finalImages.push(...productImages);
        }

        // Remove duplicates
        finalImages = [...new Set(finalImages)];
        updateData.images = finalImages;

        // ---------- Save update ----------
        const updated = await Product.findByIdAndUpdate(id, updateData, { new: true });
        res.status(200).json({ message: "✅ Product updated successfully", product: updated });

    } catch (error) {
        console.error("❌ Product update error:", error);
        res.status(500).json({ message: "Failed to update product", error: error.message });
    }
};

// ---------------------- UPDATE PRODUCT ----------------------
// const updateProductById = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const existingProduct = await Product.findById(id);
//         if (!existingProduct) return res.status(404).json({ message: "❌ Product not found" });

//         const updateData = { ...req.body };

//         if (req.body.price) updateData.price = Number(req.body.price);
//         if (req.body.buyingPrice) updateData.buyingPrice = Number(req.body.buyingPrice);
//         if (req.body.quantity !== undefined) updateData.quantity = Number(req.body.quantity);
//         if (req.body.thresholdValue !== undefined) updateData.thresholdValue = Number(req.body.thresholdValue);

//         // ---------- Parse variants ----------
//         let rawVariants = req.body.variants || [];
//         if (typeof rawVariants === "string") {
//             try { rawVariants = JSON.parse(rawVariants); } catch { rawVariants = []; }
//         }

//         // ---------- Image handling ----------
//         const productImages = [];
//         const variantImagesMap = {}; // {0: [urls], 1: [urls]}

//         if (req.files && req.files.length > 0) {
//             for (const file of req.files) {
//                 const result = await cloudinary.uploader.upload(file.path, { folder: "products" });

//                 if (file.fieldname === "images") {
//                     productImages.push(result.secure_url);
//                 } else {
//                     const match = file.fieldname.match(/variants\[(\d+)\]\[images\]/);
//                     if (match) {
//                         const idx = Number(match[1]);
//                         if (!variantImagesMap[idx]) variantImagesMap[idx] = [];
//                         variantImagesMap[idx].push(result.secure_url);
//                     }
//                 }
//             }
//         }

//         // ---------- Update variants ----------
//         if (rawVariants.length > 0) {
//             rawVariants = rawVariants.map((v, idx) => {
//                 const oldVariant = existingProduct.variants.find(x => x.sku === v.sku);
//                 const oldImages = oldVariant ? oldVariant.images || [] : [];

//                 const newImages = [
//                     ...oldImages,
//                     ...(v.images || []),
//                     ...(variantImagesMap[idx] || [])
//                 ];

//                 return {
//                     ...v,
//                     stock: Number(v.stock) || 0,
//                     sales: Number(v.sales) || 0,
//                     isActive: v.isActive !== false,
//                     discountedPrice: v.discountedPrice !== undefined ? Number(v.discountedPrice) : undefined,
//                     images: [...new Set(newImages)], // remove duplicates
//                 };
//             });

//             updateData.variants = rawVariants;
//             updateData.shadeOptions = rawVariants.map(v => v.shadeName).filter(Boolean);
//             updateData.colorOptions = rawVariants.map(v => v.hex).filter(Boolean);

//             updateData.quantity = rawVariants.reduce((sum, v) => sum + (v.stock || 0), 0);
//         }

//         // ---------- Append main product images ----------
//         if (productImages.length > 0) {
//             updateData.images = [...(existingProduct.images || []), ...productImages];
//         }

//         const updated = await Product.findByIdAndUpdate(id, updateData, { new: true });
//         res.status(200).json({ message: "✅ Product updated successfully", product: updated });

//     } catch (error) {
//         console.error("❌ Product update error:", error);
//         res.status(500).json({ message: "Failed to update product", error: error.message });
//     }
// };

const getAllProducts = async (req, res) => {
    try {
        const query = req.query;
        const filter = {};

        if (query.brand) filter.brand = { $in: query.brand.split(',') };

        if (query.category) {
            const categoryIds = query.category.split(',');

            // Include subcategories automatically
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

        const products = await Product.find(filter).sort({ createdAt: -1 }).populate('category', 'name');

        const dashboardData = products.map(p => ({
            _id: p._id,
            name: p.name,
            variant: p.variant,
            image: Array.isArray(p.images) ? p.images[0] : p.image,
            price: p.price,
            summary: p.summary || p.description?.slice(0, 100),
            ingredients: p.ingredients?.slice(0, 100),
            sales: p.sales,
            remaining: p.quantity,
            status: p.status,
            category: p.category?.name || '',
            brand: p.brand,
        }));

        res.status(200).json(dashboardData);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching products', error });
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

// const updateProductById = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const updateData = { ...req.body };

//         // ✅ Numbers
//         if (req.body.price) updateData.price = Number(req.body.price);
//         if (req.body.buyingPrice) updateData.buyingPrice = Number(req.body.buyingPrice);
//         if (req.body.quantity !== undefined) updateData.quantity = Number(req.body.quantity);
//         if (req.body.thresholdValue !== undefined) updateData.thresholdValue = Number(req.body.thresholdValue);

//         // ✅ Variants
//         if (req.body.variants) {
//             let rawVariants = req.body.variants;
//             if (typeof rawVariants === "string") {
//                 try { rawVariants = JSON.parse(rawVariants); } catch { rawVariants = []; }
//             }

//             if (Array.isArray(rawVariants)) {
//                 rawVariants = rawVariants.map(v => ({
//                     sku: v.sku,
//                     shadeName: v.shadeName || null,
//                     hex: v.hex || null,
//                     images: v.images || [],
//                     stock: Number(v.stock) || 0,
//                     sales: Number(v.sales) || 0,
//                     isActive: v.isActive !== false,
//                     discountedPrice: v.discountedPrice !== undefined ? Number(v.discountedPrice) : undefined // ✅ Add discountedPrice
//                 }));

//                 updateData.variants = rawVariants;
//                 updateData.shadeOptions = rawVariants.map(v => v.shadeName).filter(Boolean);
//                 updateData.colorOptions = rawVariants.map(v => v.hex).filter(Boolean);

//                 // 🔹 Auto recalc total stock & status
//                 updateData.quantity = rawVariants.reduce((sum, v) => sum + (v.stock || 0), 0);
//                 const threshold = updateData.thresholdValue !== undefined
//                     ? updateData.thresholdValue
//                     : (await Product.findById(id))?.thresholdValue || 0;

//                 updateData.status =
//                     updateData.quantity === 0 ? "Out of stock" :
//                         updateData.quantity < threshold ? "Low stock" :
//                             "In-stock";
//             }
//         } else if (updateData.quantity !== undefined) {
//             // 🔹 Non-variant product stock update
//             const threshold = updateData.thresholdValue !== undefined
//                 ? updateData.thresholdValue
//                 : (await Product.findById(id))?.thresholdValue || 0;

//             updateData.status =
//                 updateData.quantity === 0 ? "Out of stock" :
//                     updateData.quantity < threshold ? "Low stock" :
//                         "In-stock";
//         }

//         // ✅ Images
//         if (req.files?.length > 0) {
//             updateData.images = req.files.map(f => f.path);
//         }

//         // ✅ Update product
//         const updated = await Product.findByIdAndUpdate(id, updateData, { new: true });
//         if (!updated) return res.status(404).json({ message: "❌ Product not found" });

//         res.status(200).json({ message: "✅ Product updated successfully", product: updated });

//     } catch (error) {
//         console.error("❌ Product update error:", error);
//         res.status(500).json({ message: "Failed to update product", error: error.message });
//     }
// };


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

        if (product.variants?.length) {
            // Variant-level stock/status with discountedPrice
            product.variants = product.variants.map(v => {
                let statusMessage;
                if (v.stock === 0) statusMessage = "No stock available now, please try again later";
                else if (v.stock < (v.thresholdValue || 5)) statusMessage = `Few left (${v.stock})`;
                else statusMessage = "In-stock";

                return {
                    ...v,
                    status: statusMessage,
                    displayPrice: v.discountedPrice && v.discountedPrice < v.price ? v.discountedPrice : v.price
                };
            });
            delete product.quantity;
            delete product.status;
        } else {
            // Non-variant product
            let statusMessage;
            if (product.quantity === 0) statusMessage = "No stock available now, please try again later";
            else if (product.quantity < (product.thresholdValue || 5)) statusMessage = `Few left (${product.quantity})`;
            else statusMessage = "In-stock";
            product.status = statusMessage;
        }

        res.status(200).json({ message: '✅ Product fetched successfully', product });
    } catch (error) {
        console.error("❌ Error fetching single product:", error);
        res.status(500).json({ message: 'Failed to fetch product', error: error.message });
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
