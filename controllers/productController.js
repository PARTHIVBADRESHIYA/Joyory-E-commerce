import Product from '../models/Product.js';



const allowedBrands = ['FAE', 'SUGAR', 'MAC', 'TYPSY'];
const allowedCategories = ['LIPS', 'EYES', 'FACE', 'FRAGRANCE'];


// Admin can add a new product
const addProductController = async (req, res) => {
    try {
        const {
            name,
            variant,
            summary,
            description,
            price,
            image,
            brand,
            category,
            quantity,
            buyingPrice,
            thresholdValue
        } = req.body;

        if (!allowedBrands.includes(brand)) {
            return res.status(400).json({ message: `Invalid brand. Choose one of: ${allowedBrands.join(', ')}` });
        }

        if (!allowedCategories.includes(category)) {
            return res.status(400).json({ message: `Invalid category. Choose one of: ${allowedCategories.join(', ')}` });
        }


        // Determine product stock status
        // ✅ NEW - matches enum
        const status =
            quantity === 0 ? 'Out of stock' : quantity < 10 ? 'Low stock' : 'In-stock';



        const product = new Product({
            name,
            variant,
            summary,
            description,
            price,
            image,
            brand,
            category,
            quantity,
            status,
            buyingPrice,
            thresholdValue,
            sales: 0 // Default sales to 0
        });

        await product.save();
        res.status(201).json({ message: 'Product created successfully', product });
    } catch (error) {
        console.error("Product placement error:", error); // Log full error in server console
        res.status(500).json({ message: 'Product placement failed', error: error.message || error });
    }
};

// Admin can get all products
const getAllProducts = async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.status(200).json(products);
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

export { addProductController, getAllProducts, updateProductStock };
