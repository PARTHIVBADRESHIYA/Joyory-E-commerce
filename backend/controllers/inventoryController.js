import Product from '../models/Product.js';
import Category from "../models/Category.js"; // adjust path

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

export const getInventoryItems = async (req, res) => {
    try {
        const {
            name,
            category,
            minPrice,
            maxPrice,
            minQuantity,
            maxQuantity,
            availability, // In-stock | Low stock | Out of stock
            expiryFrom,
            expiryTo
        } = req.query;

        const filter = {};

        // 🔍 Name search
        if (name) {
            filter.name = { $regex: name, $options: "i" };
        }

        // 🔍 Category filter
        if (category) {
            filter.category = category;
        }

        // 🔍 Price range
        if (minPrice || maxPrice) {
            filter.buyingPrice = {};
            if (minPrice) filter.buyingPrice.$gte = Number(minPrice);
            if (maxPrice) filter.buyingPrice.$lte = Number(maxPrice);
        }

        // 🔍 Quantity range
        if (minQuantity || maxQuantity) {
            filter.quantity = {};
            if (minQuantity) filter.quantity.$gte = Number(minQuantity);
            if (maxQuantity) filter.quantity.$lte = Number(maxQuantity);
        }

        // 🔍 Availability status
        if (availability) {
            if (availability === "Out of stock") {
                filter.quantity = 0;
            } else if (availability === "Low stock") {
                filter.$expr = { $lte: ["$quantity", "$thresholdValue"] };
                filter.quantity = { $gt: 0 };
            } else if (availability === "In-stock") {
                filter.$expr = { $gt: ["$quantity", "$thresholdValue"] };
            }
        }

        // 🔍 Expiry date range
        if (expiryFrom || expiryTo) {
            filter.expiryDate = {};
            if (expiryFrom) filter.expiryDate.$gte = new Date(expiryFrom);
            if (expiryTo) filter.expiryDate.$lte = new Date(expiryTo);
        }

        const products = await Product.find(filter);

        const list = products.map(p => ({
            name: p.name,
            buyingPrice: `₹${p.buyingPrice}`,
            quantity: p.quantity !== undefined ? p.quantity : "N/A",
            thresholdValue: p.thresholdValue !== undefined ? p.thresholdValue : "N/A",
            expiryDate: p.expiryDate ? p.expiryDate.toISOString().split("T")[0] : "N/A",
            availability:
                p.quantity === 0
                    ? "Out of stock"
                    : p.quantity <= p.thresholdValue
                        ? "Low stock"
                        : "In-stock"
        }));

        res.status(200).json(list);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch inventory list", error });
    }
};




export const getInventorySummary = async (req, res) => {
    try {
        const {
            category,
            minPrice,
            maxPrice,
            minQuantity,
            maxQuantity,
            expiryFrom,
            expiryTo
        } = req.query;

        const filter = {};

        if (category) filter.category = category;
        if (minPrice || maxPrice) {
            filter.buyingPrice = {};
            if (minPrice) filter.buyingPrice.$gte = Number(minPrice);
            if (maxPrice) filter.buyingPrice.$lte = Number(maxPrice);
        }
        if (minQuantity || maxQuantity) {
            filter.quantity = {};
            if (minQuantity) filter.quantity.$gte = Number(minQuantity);
            if (maxQuantity) filter.quantity.$lte = Number(maxQuantity);
        }
        if (expiryFrom || expiryTo) {
            filter.expiryDate = {};
            if (expiryFrom) filter.expiryDate.$gte = new Date(expiryFrom);
            if (expiryTo) filter.expiryDate.$lte = new Date(expiryTo);
        }

        const products = await Product.find(filter);

        // ✅ Get only top-level categories from your Category collection
        const topCategories = await Category.find({});
        const totalCategories = topCategories.length;

        const totalProducts = products.length;
        const revenue = products.reduce(
            (sum, p) => sum + (p.buyingPrice * (p.quantity || 0)),
            0
        );
        const lowStocks = products.filter(p => p.quantity > 0 && p.quantity <= p.thresholdValue).length;
        const outOfStock = products.filter(p => p.quantity === 0).length;

        const topSelling = products
            .sort((a, b) => (b.sales || 0) - (a.sales || 0))
            .slice(0, 5)
            .map(p => ({

                name: p.name,
                sold: p.sales || 0,
                cost: (p.sales || 0) * p.buyingPrice,   // inventory cost
                revenue: (p.sales || 0) * p.price // sales revenue


            }));

        res.status(200).json({
            totalCategories,
            totalProducts,
            revenue,
            topSelling,
            lowStocks,
            outOfStock
        });
    } catch (error) {
        res.status(500).json({ message: "Error generating summary", error });
    }
};

