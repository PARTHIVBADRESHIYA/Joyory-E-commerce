import util from 'util';
import Product from '../models/Product.js';
import cloudinary from '../middlewares/utils/cloudinary.js';
import Category from '../models/Category.js';
import Formulation from '../models/shade/Formulation.js';
import Review from '../models/Review.js';
import mongoose from 'mongoose';
import { buildOptions, normalizeImages } from "../controllers/user/userProductController.js";

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

const addProductController = async (req, res) => {
    try {
        const {
            name, variant, summary, description, ingredients, features, howToUse,
            price, buyingPrice, brand, category, categories,
            quantity, expiryDate
        } = req.body;

        // ✅ Prevent duplicate product names
        const existingProduct = await Product.findOne({ name: name.trim() });
        if (existingProduct) {
            return res.status(400).json({
                message: `Product with name "${name}" already exists`
            });
        }

        // ✅ Ensure at least one category provided
        if (!category && (!categories || categories.length === 0)) {
            return res.status(400).json({ message: 'Category is required' });
        }

        // ✅ Normalize categories
        let finalCategories = [];
        if (categories && categories.length > 0) {
            finalCategories = Array.isArray(categories) ? categories : [categories];
        } else if (category) {
            finalCategories = [category];
        }

        // ✅ Resolve categories to ObjectIds
        const resolvedCategories = [];
        for (let cat of finalCategories) {
            if (!cat) continue;
            const trimmedCat = String(cat).trim();
            if (mongoose.Types.ObjectId.isValid(trimmedCat)) {
                resolvedCategories.push(trimmedCat);
            } else {
                const foundCat = await Category.findOne({
                    name: { $regex: `^${trimmedCat}$`, $options: 'i' }
                });
                if (!foundCat) {
                    return res.status(400).json({ message: `Category "${trimmedCat}" not found` });
                }
                resolvedCategories.push(foundCat._id);
            }
        }

        const foundCategories = await Category.find({ _id: { $in: resolvedCategories } });
        if (foundCategories.length !== resolvedCategories.length) {
            return res.status(400).json({ message: 'One or more category IDs are invalid' });
        }

        // ✅ Build hierarchy
        const buildCategoryHierarchy = async (leafCategoryId) => {
            let hierarchy = [];
            let current = await Category.findById(leafCategoryId);
            while (current) {
                hierarchy.unshift(current._id);
                if (!current.parent) break;
                current = await Category.findById(current.parent);
            }
            return hierarchy;
        };
        const categoryHierarchy = await buildCategoryHierarchy(resolvedCategories[0]);

        // ✅ Helper parseArray
        const parseArray = (input) => {
            try {
                if (typeof input === 'string') return JSON.parse(input);
                return Array.isArray(input) ? input : [input];
            } catch {
                return [input];
            }
        };

        const productTags = parseArray(req.body.productTags);

        // ✅ Numeric checks
        const thresholdValue = Number(req.body.thresholdValue);
        const parsedPrice = Number(price);
        const parsedBuyingPrice = Number(buyingPrice);
        const parsedQuantity = Number(quantity);

        if (isNaN(thresholdValue)) return res.status(400).json({ message: "❌ Invalid thresholdValue" });
        if (isNaN(parsedPrice) || isNaN(parsedBuyingPrice) || isNaN(parsedQuantity)) {
            return res.status(400).json({ message: "❌ Invalid numeric values" });
        }

        // ✅ Image handling
        const uploadImageFromUrl = async (url) => {
            const result = await cloudinary.uploader.upload(url, {
                folder: 'products',
                resource_type: 'image',
            });
            return result.secure_url;
        };

        let images = [];
        if (req.files?.length > 0) {
            images.push(...req.files.map(file => file.secure_url || file.path || file.url));
        }
        if (req.body.images || req.body.imageUrls) {
            let raw = req.body.images || req.body.imageUrls;
            try {
                if (typeof raw === 'string') raw = JSON.parse(raw);
                const urls = Array.isArray(raw) ? raw : [raw];
                for (const url of urls) {
                    try {
                        const uploaded = await uploadImageFromUrl(url);
                        images.push(uploaded);
                    } catch (err) {
                        console.warn(`❌ Failed to upload image from URL: ${url}`, err.message);
                    }
                }
            } catch (err) {
                console.warn("⚠️ Could not upload image URLs:", err.message);
            }
        }

        // ✅ Resolve formulation
        let formulationId = null;
        if (req.body.formulation) {
            try {
                formulationId = await resolveFormulationId(req.body.formulation);
            } catch (err) {
                return res.status(400).json({ message: err.message });
            }
        }

        // ✅ FoundationVariants logic (unchanged)
        let foundationVariants = [];
        let shadeOptions = [];
        let colorOptions = [];
        if (req.body.foundationVariants) {
            let variants = req.body.foundationVariants;
            if (typeof variants === "string") {
                try {
                    variants = JSON.parse(variants);
                } catch (err) {
                    console.warn("⚠️ Could not parse foundationVariants JSON:", err.message);
                    variants = [];
                }
            }
            if (Array.isArray(variants)) {
                foundationVariants = variants.map(v => ({
                    ...v,
                    isActive: v.isActive !== false,
                    createdAt: new Date()
                }));
                shadeOptions = foundationVariants.map(v => v.shadeName).filter(Boolean);
                colorOptions = foundationVariants.map(v => v.hex).filter(Boolean);
            }
        }

        // ✅ Stock status
        const status =
            parsedQuantity === 0 ? 'Out of stock' :
                parsedQuantity < thresholdValue ? 'Low stock' :
                    'In-stock';

        // ✅ Extract dynamic category attributes
        let attributes = {};
        const mainCategory = foundCategories[0];
        if (mainCategory?.attributes?.length > 0) {
            for (const attr of mainCategory.attributes) {
                if (req.body[attr.key] !== undefined) {
                    attributes[attr.key] = req.body[attr.key];
                }
            }
        }

        // ✅ Create product
        const product = new Product({
            name,
            variant,
            summary,
            description,
            ingredients,
            features,
            howToUse,
            formulation: formulationId,
            price: parsedPrice,
            buyingPrice: parsedBuyingPrice,
            quantity: parsedQuantity,
            thresholdValue,
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
            foundationVariants,
            sales: 0,
            views: 0,
            commentsCount: 0,
            affiliateEarnings: 0,
            affiliateClicks: 0,
            attributes // 👈 dynamic attributes
        });

        await product.save();
        res.status(201).json({ message: '✅ Product created successfully', product });

    } catch (error) {
        console.error("❌ Product placement error:", util.inspect(error, { showHidden: false, depth: null }));
        res.status(500).json({
            message: '❌ Product placement failed',
            error: error.message || 'Unknown error',
            stack: error.stack
        });
    }
};


// GET ALL PRODUCTS (supports nested category filtering)
const getAllProducts = async (req, res) => {
    try {
        const query = req.query;
        const filter = {};

        // Brand filter (IDs from query)
        if (query.brand) filter.brand = { $in: query.brand.split(',') };

        // Category filter with subcategories
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

        // Other filters
        if (query.shadeOptions) filter.shadeOptions = { $in: query.shadeOptions.split(',') };
        if (query.colorOptions) filter.colorOptions = { $in: query.colorOptions.split(',') };
        if (query.productTags) filter.productTags = { $in: query.productTags.split(',') };

        // Dynamic tag filters
        const dynamicFilters = [
            'preference', 'ingredients', 'benefits', 'concern', 'skinType',
            'makeupFinish', 'formulation', 'color', 'skinTone', 'gender', 'age', 'conscious'
        ];
        dynamicFilters.forEach(attr => {
            if (query[attr]) {
                filter.productTags = { $in: query[attr].split(',') };
            }
        });

        // Price range filter
        if (query.minPrice || query.maxPrice) {
            filter.price = {};
            if (query.minPrice) filter.price.$gte = Number(query.minPrice);
            if (query.maxPrice) filter.price.$lte = Number(query.maxPrice);
        }

        // Fetch products with populated category & brand
        const products = await Product.find(filter)
            .sort({ createdAt: -1 })
            .populate('category', 'name')
            .populate('brand', 'name'); // ✅ brand name instead of id

        // Format response
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
            brand: p.brand?.name || '',  // ✅ now returns brand name
        }));

        res.status(200).json(dashboardData);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching products', error });
    }
};

const updateProductStock = async (req, res) => {
    try {
        const { quantity } = req.body;

        const status =
            quantity === 0 ? 'out of stock' : quantity < 10 ? 'low stock' : 'in stock';

        const product = await Product.findByIdAndUpdate(
            req.params.id,
            { quantity, status },
            { new: true }
        );

        if (!product) return res.status(404).json({ message: 'Product not found' });

        res.status(200).json({ message: 'Stock updated successfully', product });
    } catch (error) {
        res.status(500).json({ message: 'Error updating stock', error });
    }
};

// const updateProductById = async (req, res) => {
//     try {
//         const { id } = req.params;

//         const parseArray = (input) => {
//             try {
//                 if (typeof input === 'string') return JSON.parse(input);
//                 return Array.isArray(input) ? input : [input];
//             } catch {
//                 return [input];
//             }
//         };

//         const updateData = { ...req.body };

//         if (req.body.price) updateData.price = Number(req.body.price);
//         if (req.body.buyingPrice) updateData.buyingPrice = Number(req.body.buyingPrice);
//         if (req.body.quantity) updateData.quantity = Number(req.body.quantity);
//         if (req.body.thresholdValue) updateData.thresholdValue = Number(req.body.thresholdValue);

//         if (req.body.shadeOptions) updateData.shadeOptions = parseArray(req.body.shadeOptions);
//         if (req.body.colorOptions) updateData.colorOptions = parseArray(req.body.colorOptions);
//         if (req.body.productTags) updateData.productTags = parseArray(req.body.productTags);

//         if (req.files?.length > 0) {
//             updateData.images = req.files.map(file => file.path);
//         } else if (req.body.images || req.body.imageUrls) {
//             let raw = req.body.images || req.body.imageUrls;
//             try {
//                 if (typeof raw === 'string') raw = JSON.parse(raw);
//             } catch (err) {
//                 console.warn("⚠️ Could not parse imageUrls:", raw);
//             }
//             updateData.images = Array.isArray(raw) ? raw : [raw];
//         }

//         if (updateData.quantity !== undefined && updateData.thresholdValue !== undefined) {
//             if (updateData.quantity === 0) {
//                 updateData.status = 'Out of stock';
//             } else if (updateData.quantity < updateData.thresholdValue) {
//                 updateData.status = 'Low stock';
//             } else {
//                 updateData.status = 'In-stock';
//             }
//         }

//         // ✅ Validate new category if updated
//         if (updateData.category) {
//             let categoryDoc;

//             // Check if value is a valid ObjectId
//             if (mongoose.Types.ObjectId.isValid(updateData.category)) {
//                 categoryDoc = await Category.findById(updateData.category);
//             } else {
//                 categoryDoc = await Category.findOne({ name: updateData.category });
//             }

//             if (!categoryDoc) {
//                 return res.status(400).json({ message: 'Invalid category (ID or name not found)' });
//             }

//             updateData.category = categoryDoc._id;
//         }


//         const updated = await Product.findByIdAndUpdate(id, updateData, { new: true });

//         if (!updated) {
//             return res.status(404).json({ message: '❌ Product not found' });
//         }

//         res.status(200).json({ message: '✅ Product updated successfully', product: updated });

//     } catch (error) {
//         console.error("❌ Product update error:", error);
//         res.status(500).json({ message: 'Failed to update product', error: error.message });
//     }
// };
// const updateProductById = async (req, res) => {
//     try {
//         const { id } = req.params;

//         const parseArray = (input) => {
//             try {
//                 if (typeof input === 'string') return JSON.parse(input);
//                 return Array.isArray(input) ? input : [input];
//             } catch {
//                 return [input];
//             }
//         };

//         const updateData = { ...req.body };

//         if (req.body.price) updateData.price = Number(req.body.price);
//         if (req.body.buyingPrice) updateData.buyingPrice = Number(req.body.buyingPrice);
//         if (req.body.quantity) updateData.quantity = Number(req.body.quantity);
//         if (req.body.thresholdValue) updateData.thresholdValue = Number(req.body.thresholdValue);

//         if (req.body.shadeOptions) updateData.shadeOptions = parseArray(req.body.shadeOptions);
//         if (req.body.colorOptions) updateData.colorOptions = parseArray(req.body.colorOptions);
//         if (req.body.productTags) updateData.productTags = parseArray(req.body.productTags);

//         // ✅ Handle images
//         if (req.files?.length > 0) {
//             updateData.images = req.files.map(file => file.path);
//         } else if (req.body.images || req.body.imageUrls) {
//             let raw = req.body.images || req.body.imageUrls;
//             try {
//                 if (typeof raw === 'string') raw = JSON.parse(raw);
//             } catch (err) {
//                 console.warn("⚠️ Could not parse imageUrls:", raw);
//             }
//             updateData.images = Array.isArray(raw) ? raw : [raw];
//         }

//         // ✅ Auto status based on stock
//         if (updateData.quantity !== undefined && updateData.thresholdValue !== undefined) {
//             if (updateData.quantity === 0) {
//                 updateData.status = 'Out of stock';
//             } else if (updateData.quantity < updateData.thresholdValue) {
//                 updateData.status = 'Low stock';
//             } else {
//                 updateData.status = 'In-stock';
//             }
//         }

//         // ✅ Validate category if updated
//         if (updateData.category) {
//             let categoryDoc;
//             if (mongoose.Types.ObjectId.isValid(updateData.category)) {
//                 categoryDoc = await Category.findById(updateData.category);
//             } else {
//                 categoryDoc = await Category.findOne({ name: updateData.category });
//             }

//             if (!categoryDoc) {
//                 return res.status(400).json({ message: 'Invalid category (ID or name not found)' });
//             }

//             updateData.category = categoryDoc._id;
//         }

//         // ✅ Sync shadeOptions & colorOptions from foundationVariants
//         if (req.body.foundationVariants) {
//             let variants = req.body.foundationVariants;
//             if (typeof variants === "string") {
//                 try {
//                     variants = JSON.parse(variants);
//                 } catch (err) {
//                     console.warn("⚠️ Could not parse foundationVariants JSON:", err.message);
//                     variants = [];
//                 }
//             }

//             if (Array.isArray(variants)) {
//                 updateData.foundationVariants = variants;

//                 // Auto-fill shadeOptions & colorOptions
//                 updateData.shadeOptions = variants.map(v => v.shadeName).filter(Boolean);
//                 updateData.colorOptions = variants.map(v => v.hex).filter(Boolean);
//             }
//         }

//         // ✅ Sync skinTypes
//         if (req.body.skinTypes) {
//             let skinTypes = req.body.skinTypes;

//             // Handle stringified array
//             if (typeof skinTypes === "string") {
//                 try {
//                     skinTypes = JSON.parse(skinTypes);
//                 } catch {
//                     skinTypes = [skinTypes];
//                 }
//             }

//             // Ensure always an array
//             if (!Array.isArray(skinTypes)) {
//                 skinTypes = [skinTypes];
//             }

//             // Cast only valid ObjectIds
//             updateData.skinTypes = skinTypes
//                 .map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null)
//                 .filter(Boolean);
//         }

//         // ✅ Handle formulation update
//         if (req.body.formulation) {
//             try {
//                 updateData.formulation = await resolveFormulationId(req.body.formulation);
//             } catch (err) {
//                 return res.status(400).json({ message: err.message });
//             }
//         }


//         // ✅ Update product
//         const updated = await Product.findByIdAndUpdate(id, updateData, { new: true });

//         if (!updated) {
//             return res.status(404).json({ message: '❌ Product not found' });
//         }

//         res.status(200).json({ message: '✅ Product updated successfully', product: updated });

//     } catch (error) {
//         console.error("❌ Product update error:", error);
//         res.status(500).json({ message: 'Failed to update product', error: error.message });
//     }
// };



const updateProductById = async (req, res) => {
    try {
        const { id } = req.params;

        const parseArray = (input) => {
            try {
                if (typeof input === 'string') return JSON.parse(input);
                return Array.isArray(input) ? input : [input];
            } catch {
                return [input];
            }
        };

        const updateData = { ...req.body };

        if (req.body.price) updateData.price = Number(req.body.price);
        if (req.body.buyingPrice) updateData.buyingPrice = Number(req.body.buyingPrice);
        if (req.body.quantity) updateData.quantity = Number(req.body.quantity);
        if (req.body.thresholdValue) updateData.thresholdValue = Number(req.body.thresholdValue);

        if (req.body.shadeOptions) updateData.shadeOptions = parseArray(req.body.shadeOptions);
        if (req.body.colorOptions) updateData.colorOptions = parseArray(req.body.colorOptions);
        if (req.body.productTags) updateData.productTags = parseArray(req.body.productTags);

        // ✅ Handle images
        if (req.files?.length > 0) {
            updateData.images = req.files.map(file => file.path);
        } else if (req.body.images || req.body.imageUrls) {
            let raw = req.body.images || req.body.imageUrls;
            try {
                if (typeof raw === 'string') raw = JSON.parse(raw);
            } catch (err) {
                console.warn("⚠️ Could not parse imageUrls:", raw);
            }
            updateData.images = Array.isArray(raw) ? raw : [raw];
        }

        // ✅ Auto status based on stock
        if (updateData.quantity !== undefined && updateData.thresholdValue !== undefined) {
            if (updateData.quantity === 0) {
                updateData.status = 'Out of stock';
            } else if (updateData.quantity < updateData.thresholdValue) {
                updateData.status = 'Low stock';
            } else {
                updateData.status = 'In-stock';
            }
        }

        // ✅ Validate category if updated
        if (updateData.category) {
            let categoryDoc;
            if (mongoose.Types.ObjectId.isValid(updateData.category)) {
                categoryDoc = await Category.findById(updateData.category);
            } else {
                categoryDoc = await Category.findOne({ name: updateData.category });
            }
            if (!categoryDoc) {
                return res.status(400).json({ message: 'Invalid category (ID or name not found)' });
            }
            updateData.category = categoryDoc._id;

            // 🔹 Attach dynamic attributes based on category
            if (categoryDoc?.attributes?.length > 0) {
                let attributes = {};
                for (const attr of categoryDoc.attributes) {
                    // take value if provided in request
                    if (req.body[attr.key] !== undefined) {
                        attributes[attr.key] = req.body[attr.key];
                    }
                }
                updateData.attributes = attributes;
            }
        }

        // ✅ FoundationVariants logic (unchanged)
        if (req.body.foundationVariants) {
            let variants = req.body.foundationVariants;
            if (typeof variants === "string") {
                try {
                    variants = JSON.parse(variants);
                } catch (err) {
                    console.warn("⚠️ Could not parse foundationVariants JSON:", err.message);
                    variants = [];
                }
            }
            if (Array.isArray(variants)) {
                updateData.foundationVariants = variants;
                updateData.shadeOptions = variants.map(v => v.shadeName).filter(Boolean);
                updateData.colorOptions = variants.map(v => v.hex).filter(Boolean);
            }
        }

        // ✅ Sync skinTypes (unchanged)
        if (req.body.skinTypes) {
            let skinTypes = req.body.skinTypes;
            if (typeof skinTypes === "string") {
                try {
                    skinTypes = JSON.parse(skinTypes);
                } catch {
                    skinTypes = [skinTypes];
                }
            }
            if (!Array.isArray(skinTypes)) {
                skinTypes = [skinTypes];
            }
            updateData.skinTypes = skinTypes
                .map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null)
                .filter(Boolean);
        }

        // ✅ Handle formulation update
        if (req.body.formulation) {
            try {
                updateData.formulation = await resolveFormulationId(req.body.formulation);
            } catch (err) {
                return res.status(400).json({ message: err.message });
            }
        }

        // ✅ Update product
        const updated = await Product.findByIdAndUpdate(id, updateData, { new: true });
        if (!updated) {
            return res.status(404).json({ message: '❌ Product not found' });
        }

        res.status(200).json({ message: '✅ Product updated successfully', product: updated });

    } catch (error) {
        console.error("❌ Product update error:", error);
        res.status(500).json({ message: 'Failed to update product', error: error.message });
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

        // ✅ Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid product ID format" });
        }

        // ✅ Find product
        const product = await Product.findById(id)
            .populate("category", "name slug")
            .populate("brand", "name")
            .lean();

        if (!product) {
            return res.status(404).json({ message: "❌ Product not found" });
        }

        // ✅ Ratings
        const [{ avg = 0, count = 0 } = {}] = await Review.aggregate([
            { $match: { productId: product._id, status: "Active" } },
            { $group: { _id: "$productId", avg: { $avg: "$rating" }, count: { $sum: 1 } } }
        ]);
        const avgRating = Math.round((avg || 0) * 10) / 10;

        // ✅ Price / Discount
        const mrp = Number(product.mrp ?? product.price ?? 0) || 0;
        const price = Number(product.price ?? product.mrp ?? 0) || 0;
        const discountAmount = mrp > price ? mrp - price : 0;
        const discountPercent = mrp > 0 ? Math.round((discountAmount / mrp) * 100) : 0;

        // ✅ Badge / Promo Message
        let badge = null;
        let promoMessage = null;
        if (discountPercent > 0) {
            badge = `${discountPercent}% Off`;
            promoMessage = `Save ₹${discountAmount} on this product`;
        }

        // ✅ Shade & Color Options (from foundationVariants too)
        const shadeOptions = buildOptions(product).shadeOptions;
        const colorOptions = buildOptions(product).colorOptions;

        // ✅ Response (same shape as user-side, without recommendations/promo engine)
        res.status(200).json({
            _id: product._id,
            name: product.name,
            brand: product.brand?.name || "",
            variant: product.variant,
            description: product.description || "",
            summary: product.summary || "",
            features: product.features || [],
            howToUse: product.howToUse || "",
            ingredients: product.ingredients || [],
            mrp: Math.round(mrp),
            price: Math.round(price),
            discountPercent,
            discountAmount,
            badge,
            promoMessage,
            images: normalizeImages(product.images || []),
            category: product.category,
            shadeOptions,
            colorOptions,
            foundationVariants: product.foundationVariants || [],
            avgRating,
            totalRatings: count || 0,
            inStock: product.quantity > 0,
            views: product.views || 0,
            sales: product.sales || 0,
            createdAt: product.createdAt,
            updatedAt: product.updatedAt
        });

    } catch (error) {
        console.error("❌ Error fetching single product (admin):", error);
        res.status(500).json({ message: "Failed to fetch product", error: error.message });
    }
};



// const updateVariantImages = async (req, res) => {
//     try {
//         const { id, sku } = req.params;

//         // If multer-cloudinary is used, uploaded file URLs are available in req.files
//         const uploadedImages = req.files.map(file => file.path);

//         // Update only that foundationVariant's images
//         const product = await Product.findOneAndUpdate(
//             { _id: id, "foundationVariants.sku": sku },
//             {
//                 $set: { "foundationVariants.$.images": uploadedImages } // replace existing images
//             },
//             { new: true }
//         );

//         if (!product) {
//             return res.status(404).json({ message: "❌ Product or variant not found" });
//         }

//         res.status(200).json({
//             message: "✅ Variant images updated successfully",
//             product
//         });
//     } catch (err) {
//         console.error("updateVariantImages error:", err);
//         res.status(500).json({ message: "Failed to update variant images", error: err.message });
//     }
// };



// controllers/productController.js
// controllers/productController.js
const updateVariantImages = async (req, res) => {
    try {
        const { id, sku } = req.params;

        // Multer-Cloudinary gives file URLs in req.files
        const uploadedImages = req.files?.map(file => file.path) || [];

        if (!uploadedImages.length) {
            return res.status(400).json({ message: "❌ No images uploaded" });
        }

        const product = await Product.findOneAndUpdate(
            { _id: id, "foundationVariants.sku": sku },
            {
                $push: {
                    "foundationVariants.$.images": {
                        $each: uploadedImages,
                        $slice: -5   // ✅ keep only the last 5 images
                    }
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
