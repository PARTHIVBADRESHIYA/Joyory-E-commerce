import Product from '../models/Product.js';

// ✅ Add Inventory/Product Item
export const addInventoryItem = async (req, res) => {
    try {
        const {
            name,
            buyingPrice,
            price,
            quantity,
            thresholdValue,
            expiryDate,
            brand,
            category,
            variant,
            description,
            image
        } = req.body;

        const availability =
            quantity === 0
                ? 'Out of stock'
                : quantity <= thresholdValue
                    ? 'Low stock'
                    : 'In-stock';

        const newProduct = new Product({
            name,
            buyingPrice,
            price,
            quantity,
            thresholdValue,
            expiryDate,
            brand,
            category,
            variant,
            description,
            image,
            status: availability
        });

        await newProduct.save();
        res.status(201).json({ message: 'Inventory product added', product: newProduct });
    } catch (error) {
        res.status(500).json({ message: 'Failed to add product', error });
    }
};

// ✅ Get Inventory Product List
export const getInventoryItems = async (req, res) => {
    try {
        const products = await Product.find();

        const list = products.map(p => ({
            name: p.name,
            buyingPrice: `₹${p.buyingPrice}`,
            quantity: `${p.quantity} ${p.variant || 'Units'}`,
            thresholdValue: `${p.thresholdValue} ${p.variant || 'Units'}`,
            expiryDate: p.expiryDate ? p.expiryDate.toISOString().split('T')[0] : 'N/A',
            availability:
                p.quantity === 0
                    ? 'Out of stock'
                    : p.quantity <= p.thresholdValue
                        ? 'Low stock'
                        : 'In-stock'
        }));

        res.status(200).json(list);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch inventory list', error });
    }
};

// ✅ Get Inventory Summary
export const getInventorySummary = async (req, res) => {
    try {
        const products = await Product.find();

        const categories = [...new Set(products.map(p => p.category))];
        const totalProducts = products.length;
        const revenue = products.reduce((sum, p) => sum + (p.buyingPrice * p.quantity), 0);
        const lowStocks = products.filter(p => p.quantity <= p.thresholdValue).length;
        const outOfStock = products.filter(p => p.quantity === 0).length;

        const topSelling = products
            .sort((a, b) => b.sales - a.sales)
            .slice(0, 5)
            .map(p => ({
                name: p.name,
                sold: p.sales,
                cost: p.sales * p.buyingPrice
            }));

        res.status(200).json({
            totalCategories: categories.length,
            totalProducts,
            revenue,
            topSelling,
            lowStocks,
            outOfStock
        });
    } catch (error) {
        res.status(500).json({ message: 'Error generating summary', error });
    }
};


