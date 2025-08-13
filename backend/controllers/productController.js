import util from 'util';
import Product from '../models/Product.js';
import cloudinary from '../middlewares/utils/cloudinary.js';
import ProductAttribute from '../models/ProductAttribute.js';
import Category from '../models/Category.js'; // new import
import mongoose from 'mongoose';

// ADD PRODUCT
// const addProductController = async (req, res) => {
//     try {
//         const {
//             name, variant, summary, description, features, howToUse,
//             price, buyingPrice, brand, category, categories,
//             quantity, expiryDate
//         } = req.body;

//         // ✅ Ensure at least one category provided
//         if (!category && (!categories || categories.length === 0)) {
//             return res.status(400).json({ message: 'Category is required' });
//         }

//         // ✅ Normalize categories array
//         let finalCategories = [];
//         if (categories && categories.length > 0) {
//             finalCategories = Array.isArray(categories) ? categories : [categories];
//         } else if (category) {
//             finalCategories = [category];
//         }

//         // ✅ Validate category IDs
//         const foundCategories = await Category.find({ _id: { $in: finalCategories } });
//         if (foundCategories.length !== finalCategories.length) {
//             return res.status(400).json({ message: 'One or more category IDs are invalid' });
//         }

//         // ✅ Build category hierarchy from leaf to root
//         const buildCategoryHierarchy = async (leafCategoryId) => {
//             let hierarchy = [];
//             let current = await Category.findById(leafCategoryId);

//             while (current) {
//                 hierarchy.unshift(current._id); // Add to start
//                 if (!current.parent) break;
//                 current = await Category.findById(current.parent);
//             }
//             return hierarchy;
//         };

//         const categoryHierarchy = await buildCategoryHierarchy(finalCategories[0]);

//         // ✅ Helper functions
//         const parseArray = (input) => {
//             try {
//                 if (typeof input === 'string') return JSON.parse(input);
//                 return Array.isArray(input) ? input : [input];
//             } catch {
//                 return [input];
//             }
//         };

//         const getAttributeOptions = async (name) => {
//             const attr = await ProductAttribute.findOne({ name, status: 'Active' });
//             return attr?.options || [];
//         };

//         // ✅ Fetch attributes
//         const shadeOptions = await getAttributeOptions('Shade');
//         const colorOptions = await getAttributeOptions('Color');
//         const productTags = parseArray(req.body.productTags);

//         // ✅ Numeric checks
//         const thresholdValue = Number(req.body.thresholdValue);
//         const parsedPrice = Number(price);
//         const parsedBuyingPrice = Number(buyingPrice);
//         const parsedQuantity = Number(quantity);

//         if (isNaN(thresholdValue)) return res.status(400).json({ message: "❌ Invalid thresholdValue" });
//         if (isNaN(parsedPrice) || isNaN(parsedBuyingPrice) || isNaN(parsedQuantity)) {
//             return res.status(400).json({ message: "❌ Invalid numeric values" });
//         }

//         // ✅ Image handling
//         const uploadImageFromUrl = async (url) => {
//             const result = await cloudinary.uploader.upload(url, {
//                 folder: 'products',
//                 resource_type: 'image',
//             });
//             return result.secure_url;
//         };

//         let images = [];
//         if (req.files?.length > 0) {
//             images.push(...req.files.map(file => file.secure_url || file.path || file.url));
//         }
//         if (req.body.images || req.body.imageUrls) {
//             let raw = req.body.images || req.body.imageUrls;
//             try {
//                 if (typeof raw === 'string') raw = JSON.parse(raw);
//                 const urls = Array.isArray(raw) ? raw : [raw];
//                 for (const url of urls) {
//                     try {
//                         const uploaded = await uploadImageFromUrl(url);
//                         images.push(uploaded);
//                     } catch (err) {
//                         console.warn(`❌ Failed to upload image from URL: ${url}`, err.message);
//                     }
//                 }
//             } catch (err) {
//                 console.warn("⚠️ Could not upload image URLs:", err.message);
//             }
//         }

//         // ✅ Stock status
//         const status =
//             parsedQuantity === 0 ? 'Out of stock' :
//             parsedQuantity < thresholdValue ? 'Low stock' :
//             'In-stock';

//         // ✅ Create product
//         const product = new Product({
//             name,
//             variant,
//             summary,
//             description,
//             features,
//             howToUse,
//             price: parsedPrice,
//             buyingPrice: parsedBuyingPrice,
//             quantity: parsedQuantity,
//             thresholdValue,
//             expiryDate,
//             images,
//             brand,
//             category: finalCategories[0],         // Main category
//             categories: finalCategories,          // Provided categories
//             categoryHierarchy,                    // Full path [root → leaf]
//             status,
//             productTags,
//             shadeOptions,
//             colorOptions,
//             sales: 0,
//             views: 0,
//             commentsCount: 0,
//             affiliateEarnings: 0,
//             affiliateClicks: 0,
//         });

//         await product.save();
//         res.status(201).json({ message: '✅ Product created successfully', product });

//     } catch (error) {
//         console.error("❌ Product placement error:", util.inspect(error, { showHidden: false, depth: null }));
//         res.status(500).json({
//             message: '❌ Product placement failed',
//             error: error.message || 'Unknown error',
//             stack: error.stack
//         });
//     }
// };
const addProductController = async (req, res) => {
    try {
        const {
            name, variant, summary, description, features, howToUse,
            price, buyingPrice, brand, category, categories,
            quantity, expiryDate
        } = req.body;

        // ✅ Ensure at least one category provided
        if (!category && (!categories || categories.length === 0)) {
            return res.status(400).json({ message: 'Category is required' });
        }

        // ✅ Normalize categories array
        let finalCategories = [];
        if (categories && categories.length > 0) {
            finalCategories = Array.isArray(categories) ? categories : [categories];
        } else if (category) {
            finalCategories = [category];
        }

        // ✅ Convert category names to ObjectIds if needed
        const resolvedCategories = [];
        for (let cat of finalCategories) {
            if (mongoose.Types.ObjectId.isValid(cat)) {
                resolvedCategories.push(cat);
            } else {
                const foundCat = await Category.findOne({ name: cat });
                if (!foundCat) {
                    return res.status(400).json({ message: `Category "${cat}" not found` });
                }
                resolvedCategories.push(foundCat._id);
            }
        }

        // ✅ Validate all resolved IDs exist
        const foundCategories = await Category.find({ _id: { $in: resolvedCategories } });
        if (foundCategories.length !== resolvedCategories.length) {
            return res.status(400).json({ message: 'One or more category IDs are invalid' });
        }

        // ✅ Build category hierarchy from leaf to root (based on first category)
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

        // ✅ Helper functions
        const parseArray = (input) => {
            try {
                if (typeof input === 'string') return JSON.parse(input);
                return Array.isArray(input) ? input : [input];
            } catch {
                return [input];
            }
        };

        const getAttributeOptions = async (name) => {
            const attr = await ProductAttribute.findOne({ name, status: 'Active' });
            return attr?.options || [];
        };

        // ✅ Fetch attributes
        const shadeOptions = await getAttributeOptions('Shade');
        const colorOptions = await getAttributeOptions('Color');
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

        // ✅ Stock status
        const status =
            parsedQuantity === 0 ? 'Out of stock' :
                parsedQuantity < thresholdValue ? 'Low stock' :
                    'In-stock';

        // ✅ Create product
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
            category: resolvedCategories[0],    // Main category
            categories: resolvedCategories,     // All categories
            categoryHierarchy,                  // Full hierarchy
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

        if (updateData.quantity !== undefined && updateData.thresholdValue !== undefined) {
            if (updateData.quantity === 0) {
                updateData.status = 'Out of stock';
            } else if (updateData.quantity < updateData.thresholdValue) {
                updateData.status = 'Low stock';
            } else {
                updateData.status = 'In-stock';
            }
        }

        // ✅ Validate new category if updated
        if (updateData.category) {
            const categoryDoc = await Category.findById(updateData.category);
            if (!categoryDoc) {
                return res.status(400).json({ message: 'Invalid category ID' });
            }
            updateData.category = categoryDoc._id;
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
