import util from 'util';
import Product from '../models/Product.js';
import cloudinary from '../middlewares/utils/cloudinary.js';
import Category from '../models/Category.js';
import Formulation from '../models/shade/Formulation.js';
import mongoose from 'mongoose';

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
            quantity, expiryDate, scheduledAt
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

        // ✅ Handle scheduling
        let isPublished = true;
        let scheduleDate = null;

        if (req.body.scheduledAt) {
            const parsedDate = new Date(req.body.scheduledAt);

            if (isNaN(parsedDate.getTime())) {
                return res.status(400).json({ message: "❌ Invalid scheduledAt date" });
            }

            const now = new Date();

            if (parsedDate > now) {
                // Future: schedule publishing
                isPublished = false;
                scheduleDate = parsedDate.toISOString(); // ⬅️ no extra offset
            } else {
                // Past or immediate: publish now
                isPublished = true;
                scheduleDate = null;
            }
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

        // ✅ variants logic (unchanged)
        // inside addProductController
        let variants = [];
        let shadeOptions = [];
        let colorOptions = [];

        if (req.body.variants || req.body.variants) {
            let rawVariants = req.body.variants || req.body.variants;

            if (typeof rawVariants === "string") {
                try {
                    rawVariants = JSON.parse(rawVariants);
                } catch (err) {
                    console.warn("⚠️ Could not parse variants JSON:", err.message);
                    rawVariants = [];
                }
            }

            if (Array.isArray(rawVariants)) {
                variants = rawVariants.map(v => ({
                    ...v,
                    isActive: v.isActive !== false,
                    createdAt: new Date()
                }));

                shadeOptions = variants.map(v => v.shadeName).filter(Boolean);
                colorOptions = variants.map(v => v.hex).filter(Boolean);
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
            variants,
            variants: [], // empty going forward,
            isPublished,
            scheduledAt: scheduleDate,
            sales: 0,
            views: 0,
            commentsCount: 0,
            affiliateEarnings: 0,
            affiliateClicks: 0,
            attributes, // 👈 dynamic attributes,
            seller: req.body.seller || null,
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

        if (req.body.variants || req.body.variants) {
            let rawVariants = req.body.variants || req.body.variants;
            if (typeof rawVariants === "string") {
                try { rawVariants = JSON.parse(rawVariants); } catch { rawVariants = []; }
            }

            if (Array.isArray(rawVariants)) {
                updateData.variants = rawVariants;
                updateData.shadeOptions = rawVariants.map(v => v.shadeName).filter(Boolean);
                updateData.colorOptions = rawVariants.map(v => v.hex).filter(Boolean);
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

        // ✅ Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid product ID format' });
        }

        // ✅ Find product and populate category names
        const product = await Product.findById(id)
            .populate('category', 'name slug')
            .populate('categoryHierarchy', 'name slug')
            .lean();

        if (!product) {
            return res.status(404).json({ message: '❌ Product not found' });
        }

        res.status(200).json({
            message: '✅ Product fetched successfully',
            product
        });

    } catch (error) {
        console.error("❌ Error fetching single product:", error);
        res.status(500).json({
            message: 'Failed to fetch product',
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
                    "variants.$.images": {
                        $each: uploadedImages,
                        $slice: -5
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
