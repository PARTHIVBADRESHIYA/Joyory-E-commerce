const allowedBrands = ['FAE', 'SUGAR', 'MAC', 'TYPSY'];
const allowedCategories = ['LIPS', 'EYES', 'FACE', 'FRAGRANCE'];
import util from 'util';
import Product from '../models/Product.js';
import cloudinary from '../middlewares/utils/cloudinary.js'; // or adjust path as needed

import ProductAttribute from '../models/ProductAttribute.js';
const addProductController = async (req, res) => {
    try {
        const {
            name, variant, summary, description, features, howToUse,
            price, buyingPrice, brand, category,
            quantity, expiryDate
        } = req.body;
        const parseArray = (input) => {
            try {
                if (typeof input === 'string') return JSON.parse(input);
                return Array.isArray(input) ? input : [input];
            } catch {
                return [input];
            }
        };

        // Inside addProductController (replace manual parsing with DB fetch):
        const getAttributeOptions = async (name) => {
            const attr = await ProductAttribute.findOne({ name, status: 'Active' });
            return attr?.options || [];
        };

        const shadeOptions = await getAttributeOptions('Shade');
        const colorOptions = await getAttributeOptions('Color');
        const productTags = parseArray(req.body.productTags);
        const thresholdValue = Number(req.body.thresholdValue);
        const parsedPrice = Number(price);
        const parsedBuyingPrice = Number(buyingPrice);
        const parsedQuantity = Number(quantity);

        if (isNaN(thresholdValue)) return res.status(400).json({ message: "❌ Invalid thresholdValue" });
        if (isNaN(parsedPrice) || isNaN(parsedBuyingPrice) || isNaN(parsedQuantity)) {
            return res.status(400).json({ message: "❌ Invalid numeric values" });
        }

        const uploadImageFromUrl = async (url) => {
            const result = await cloudinary.uploader.upload(url, {
                folder: 'products',
                resource_type: 'image',
            });
            return result.secure_url;
        };

        let images = [];

        // 🔍 Check multer file uploads
        if (req.files && req.files.length > 0) {
            images.push(...req.files.map(file => file.secure_url || file.path || file.url));
        }

        // 🔍 Optional: Handle external image URLs
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

        if (!allowedBrands.includes(brand)) {
            return res.status(400).json({ message: `Invalid brand. Allowed: ${allowedBrands.join(', ')}` });
        }

        if (!allowedCategories.includes(category)) {
            return res.status(400).json({ message: `Invalid category. Allowed: ${allowedCategories.join(', ')}` });
        }

        const status =
            parsedQuantity === 0 ? 'Out of stock' :
                parsedQuantity < thresholdValue ? 'Low stock' :
                    'In-stock';

        const product = new Product({
            name,
            variant,
            summary,
            description,
            features,
            howToUse,
            price: parsedPrice,
            buyingPrice: parsedBuyingPrice,
            quantity: parsedQuantity,
            thresholdValue,
            expiryDate,
            images,
            brand,
            category,
            status,
            productTags,
            shadeOptions,
            colorOptions,
            sales: 0,
            views: 0,
            commentsCount: 0,
            affiliateEarnings: 0,
            affiliateClicks: 0,
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
// --- UPDATED getAllProducts WITH DYNAMIC FILTERING ---

const getAllProducts = async (req, res) => {
    try {
        const query = req.query;
        const filter = {};

        // Exact match filters
        if (query.brand) filter.brand = { $in: query.brand.split(',') };
        if (query.category) filter.category = { $in: query.category.split(',') };
        if (query.shadeOptions) filter.shadeOptions = { $in: query.shadeOptions.split(',') };
        if (query.colorOptions) filter.colorOptions = { $in: query.colorOptions.split(',') };
        if (query.productTags) filter.productTags = { $in: query.productTags.split(',') };

        // Dynamic attributes like preference, ingredients, benefits etc. (if stored in productTags or add field for each)
        const dynamicFilters = [
            'preference', 'ingredients', 'benefits', 'concern', 'skinType',
            'makeupFinish', 'formulation', 'color', 'skinTone', 'gender', 'age', 'conscious'
        ];

        dynamicFilters.forEach(attr => {
            if (query[attr]) {
                filter[`productTags`] = { $in: query[attr].split(',') }; // OR you can use dedicated fields if you created
            }
        });

        // Price filter
        if (query.minPrice || query.maxPrice) {
            filter.price = {};
            if (query.minPrice) filter.price.$gte = Number(query.minPrice);
            if (query.maxPrice) filter.price.$lte = Number(query.maxPrice);
        }

        const products = await Product.find(filter).sort({ createdAt: -1 });

        const dashboardData = products.map(p => ({
            _id: p._id,
            name: p.name,
            variant: p.variant,
            image: Array.isArray(p.images) ? p.images[0] : p.image,
            price: p.price,
            summary: p.summary || p.description?.slice(0, 100),
            sales: p.sales,
            remaining: p.quantity,
            status: p.status,
            category: p.category,
            brand: p.brand,
        }));

        res.status(200).json(dashboardData);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching products', error });
    }
};


// Admin can update product stock only
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

// controllers/productController.js

const updateProductById = async (req, res) => {
    try {
        const { id } = req.params;

        const parseArray = (input) => {
            try {
                if (typeof input === 'string') return JSON.parse(input);
                return Array.isArray(input) ? input : [input];
            } catch (err) {
                return [input];
            }
        };

        const updateData = {
            ...req.body
        };

        // Convert fields to proper types
        if (req.body.price) updateData.price = Number(req.body.price);
        if (req.body.buyingPrice) updateData.buyingPrice = Number(req.body.buyingPrice);
        if (req.body.quantity) updateData.quantity = Number(req.body.quantity);
        if (req.body.thresholdValue) updateData.thresholdValue = Number(req.body.thresholdValue);

        // Parse arrays safely
        if (req.body.shadeOptions) updateData.shadeOptions = parseArray(req.body.shadeOptions);
        if (req.body.colorOptions) updateData.colorOptions = parseArray(req.body.colorOptions);
        if (req.body.productTags) updateData.productTags = parseArray(req.body.productTags);

        // Handle image updates (optional logic)
        if (req.files && req.files.length > 0) {
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

        // Auto-update status based on quantity + threshold
        if (updateData.quantity !== undefined && updateData.thresholdValue !== undefined) {
            if (updateData.quantity === 0) {
                updateData.status = 'Out of stock';
            } else if (updateData.quantity < updateData.thresholdValue) {
                updateData.status = 'Low stock';
            } else {
                updateData.status = 'In-stock';
            }
        }

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


export { addProductController, getAllProducts, updateProductStock, updateProductById };
