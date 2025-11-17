import Product from '../models/Product.js';
import Category from "../models/Category.js"; // adjust path
import Order from "../models/Order.js";

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
            variantName,
            sku,
            category,
            minPrice,
            maxPrice,
            minQuantity,
            maxQuantity,
            availability,
            expiryFrom,
            expiryTo
        } = req.query;

        const filter = {};

        // ✅ Product name filter
        if (name) {
            filter.name = { $regex: name, $options: "i" };
        }

        // ✅ Category filter
        if (category) {
            filter.category = category;
        }

        // ✅ Buying price filter
        if (minPrice || maxPrice) {
            filter.buyingPrice = {};
            if (minPrice) filter.buyingPrice.$gte = Number(minPrice);
            if (maxPrice) filter.buyingPrice.$lte = Number(maxPrice);
        }

        // ✅ Fetch products
        const products = await Product.find(filter)
            .populate("category", "name")
            .lean();

        const variantList = [];

        for (const p of products) {

            // ✅ Product has variants
            if (Array.isArray(p.variants) && p.variants.length > 0) {
                for (const v of p.variants) {

                    const stock = v.stock ?? 0;
                    const threshold = v.thresholdValue ?? 0;

                    // ✅ Variant name filter
                    if (variantName) {
                        const match = v.shadeName?.toLowerCase().includes(variantName.toLowerCase());
                        if (!match) continue;
                    }

                    // ✅ SKU filter
                    if (sku && v.sku !== sku) continue;

                    // ✅ Quantity filters
                    if (minQuantity && stock < Number(minQuantity)) continue;
                    if (maxQuantity && stock > Number(maxQuantity)) continue;

                    // ✅ Availability filter
                    if (availability === "Out of stock" && stock !== 0) continue;
                    if (availability === "Low stock" && !(stock > 0 && stock <= threshold)) continue;
                    if (availability === "In-stock" && !(stock > threshold)) continue;

                    // ✅ Expiry filter
                    if (expiryFrom || expiryTo) {
                        const exp = v.expiryDate ? new Date(v.expiryDate) : null;
                        if (!exp) continue;
                        if (expiryFrom && exp < new Date(expiryFrom)) continue;
                        if (expiryTo && exp > new Date(expiryTo)) continue;
                    }

                    const productExpiry = p.expiryDate
                        ? p.expiryDate.toISOString().split("T")[0]
                        : "N/A";


                    variantList.push({
                        productId: p._id,
                        category: p.category?.name || "N/A",
                        productName: p.name,
                        buyingPrice: p.buyingPrice,
                        variantName: v.shadeName || "Default",
                        sku: v.sku || "N/A",
                        stock,
                        thresholdValue: threshold,
                        expiryDate: productExpiry,
                        availability:
                            stock === 0
                                ? "Out of stock"
                                : stock <= threshold
                                    ? "Low stock"
                                    : "In-stock"
                    });
                }
            }

            // ✅ Product without variants
            else {
                const stock = p.quantity ?? 0;
                const threshold = p.thresholdValue ?? 0;

                // ✅ Quantity filters
                if (minQuantity && stock < Number(minQuantity)) continue;
                if (maxQuantity && stock > Number(maxQuantity)) continue;

                // ✅ Availability filter
                if (availability === "Out of stock" && stock !== 0) continue;
                if (availability === "Low stock" && !(stock > 0 && stock <= threshold)) continue;
                if (availability === "In-stock" && !(stock > threshold)) continue;

                // ✅ Expiry filter
                if (expiryFrom || expiryTo) {
                    const exp = p.expiryDate ? new Date(p.expiryDate) : null;
                    if (!exp) continue;
                    if (expiryFrom && exp < new Date(expiryFrom)) continue;
                    if (expiryTo && exp > new Date(expiryTo)) continue;
                }

                variantList.push({
                    productId: p._id,
                    category: p.category?.name || "N/A",
                    productName: p.name,
                    buyingPrice: p.buyingPrice,
                    variantName: "Default",
                    sku: p.sku || "N/A",
                    stock,
                    thresholdValue: threshold,
                    expiryDate: p.expiryDate ? p.expiryDate.toISOString().split("T")[0] : "N/A",
                    availability:
                        stock === 0
                            ? "Out of stock"
                            : stock <= threshold
                                ? "Low stock"
                                : "In-stock"
                });
            }
        }

        res.status(200).json(variantList);

    } catch (error) {
        console.error("❌ Inventory List Error:", error);
        res.status(500).json({ message: "Failed to fetch inventory list", error });
    }
};

export const getInventorySummary = async (req, res) => {
    try {
        const { category, minPrice, maxPrice } = req.query;

        // ---------------- FILTER ----------------
        const filter = {};
        if (category) filter.category = category;
        if (minPrice || maxPrice) {
            filter.buyingPrice = {};
            if (minPrice) filter.buyingPrice.$gte = Number(minPrice);
            if (maxPrice) filter.buyingPrice.$lte = Number(maxPrice);
        }

        // Normalization helper
        const normalize = (str) => (str || "default").toLowerCase().trim();

        // ---------------- Fetch Products ----------------
        const products = await Product.find(filter)
            .populate("category", "name")
            .lean();

        const totalCategories = await Category.countDocuments();

        let totalProducts = 0;
        let totalVariants = 0;
        let totalRevenue = 0;
        let totalCost = 0;
        let lowStocks = 0;
        let outOfStock = 0;

        const variantSalesData = [];

        // ---------------- Fetch Order Data Once ----------------
        const allOrders = await Order.find(
            {},
            "products.productId products.variant products.price products.quantity"
        ).lean();

        // ---------------- Revenue Map ----------------
        const revenueMap = new Map();
        const fallbackPriceMap = new Map();

        for (const order of allOrders) {
            for (const item of order.products || []) {
                const pid = item.productId?.toString();
                if (!pid) continue;

                const variantName = normalize(item.variant?.shadeName);
                const key = `${pid}_${variantName}`;

                const unitPrice =
                    item.variant?.displayPrice ||
                    item.variant?.discountedPrice ||
                    item.price ||
                    0;

                const qty = item.quantity || 0;
                const revenue = qty * unitPrice;

                revenueMap.set(key, (revenueMap.get(key) || 0) + revenue);

                if (!fallbackPriceMap.has(key)) fallbackPriceMap.set(key, unitPrice);
            }
        }

        // ---------------- Calculate Inventory Summary ----------------
        for (const product of products) {
            totalProducts++;
            const costPrice = product.buyingPrice || 0;

            const variants = product.variants?.length ? product.variants : [{ // simple product fallback
                shadeName: "default",
                stock: product.quantity,
                thresholdValue: product.thresholdValue,
                sales: product.sales,
            }];

            for (const v of variants) {
                totalVariants++;

                // Stock calculations
                if (v.stock === 0) outOfStock++;
                else if (v.stock > 0 && v.stock <= (v.thresholdValue || 0)) lowStocks++;

                const variantName = normalize(v.shadeName);
                const key = `${product._id}_${variantName}`;

                const soldQty = v.sales || 0;

                // ✅ Revenue from real orders
                const orderRevenue = revenueMap.get(key) || 0;

                // ✅ Fallback to product’s displayPrice * sales
                const displayPrice =
                    fallbackPriceMap.get(key) ||
                    v.displayPrice ||
                    v.discountedPrice ||
                    0;

                const fallbackRevenue = soldQty * displayPrice;

                const revenue = orderRevenue > 0 ? orderRevenue : fallbackRevenue;
                const cost = soldQty * costPrice;

                totalRevenue += revenue;
                totalCost += cost;

                variantSalesData.push({
                    productId: product._id,
                    productName: product.name,
                    variantName: v.shadeName || "Default",
                    sold: soldQty,
                    displayPrice,
                    cost,
                    revenue,
                    debug: orderRevenue > 0
                        ? "✅ Used order-based revenue"
                        : "🧮 Used fallback (displayPrice * sales)"
                });
            }
        }

        // ---------------- Final Output ----------------
        const profit = totalRevenue - totalCost;
        const topSelling = [...variantSalesData]
            .sort((a, b) => b.sold - a.sold)
            .slice(0, 5);

        res.status(200).json({
            totalCategories,
            totalProducts,
            totalVariants,
            totalRevenue: Number(totalRevenue.toFixed(2)),
            totalCost: Number(totalCost.toFixed(2)),
            profit: Number(profit.toFixed(2)),
            lowStocks,
            outOfStock,
            topSelling
        });

    } catch (error) {
        console.error("❌ Inventory Summary Error:", error);
        res.status(500).json({ message: "Error generating summary", error });
    }
};
