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




// export const getInventorySummary = async (req, res) => {
//     try {
//         const {
//             category,
//             minPrice,
//             maxPrice,
//             minQuantity,
//             maxQuantity,
//             expiryFrom,
//             expiryTo
//         } = req.query;

//         const filter = {};

//         if (category) filter.category = category;
//         if (minPrice || maxPrice) {
//             filter.buyingPrice = {};
//             if (minPrice) filter.buyingPrice.$gte = Number(minPrice);
//             if (maxPrice) filter.buyingPrice.$lte = Number(maxPrice);
//         }
//         if (minQuantity || maxQuantity) {
//             filter.quantity = {};
//             if (minQuantity) filter.quantity.$gte = Number(minQuantity);
//             if (maxQuantity) filter.quantity.$lte = Number(maxQuantity);
//         }
//         if (expiryFrom || expiryTo) {
//             filter.expiryDate = {};
//             if (expiryFrom) filter.expiryDate.$gte = new Date(expiryFrom);
//             if (expiryTo) filter.expiryDate.$lte = new Date(expiryTo);
//         }

//         const products = await Product.find(filter);

//         // ✅ Get only top-level categories from your Category collection
//         const topCategories = await Category.find({});
//         const totalCategories = topCategories.length;

//         const totalProducts = products.length;
//         const revenue = products.reduce(
//             (sum, p) => sum + (p.buyingPrice * (p.quantity || 0)),
//             0
//         );
//         const lowStocks = products.filter(p => p.quantity > 0 && p.quantity <= p.thresholdValue).length;
//         const outOfStock = products.filter(p => p.quantity === 0).length;

//         const topSelling = products
//             .sort((a, b) => (b.sales || 0) - (a.sales || 0))
//             .slice(0, 5)
//             .map(p => ({

//                 name: p.name,
//                 sold: p.sales || 0,
//                 cost: (p.sales || 0) * p.buyingPrice,   // inventory cost
//                 revenue: (p.sales || 0) * p.price // sales revenue


//             }));

//         res.status(200).json({
//             totalCategories,
//             totalProducts,
//             revenue,
//             topSelling,
//             lowStocks,
//             outOfStock
//         });
//     } catch (error) {
//         res.status(500).json({ message: "Error generating summary", error });
//     }
// };


export const getInventorySummary = async (req, res) => {
    try {
        const { category, minPrice, maxPrice } = req.query;
        const filter = {};

        if (category) filter.category = category;
        if (minPrice || maxPrice) {
            filter.buyingPrice = {};
            if (minPrice) filter.buyingPrice.$gte = Number(minPrice);
            if (maxPrice) filter.buyingPrice.$lte = Number(maxPrice);
        }

        // 🧱 Step 1: Fetch products
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

        // 🧱 Step 2: Fetch all orders for per-order revenue calc
        const allOrders = await Order.find({}, "products.productId products.variant products.price products.quantity")
            .lean();

        // Map to accumulate true revenue per variant
        const orderRevenueMap = new Map();
        const latestDisplayPriceMap = new Map(); // fallback for new items

        for (const order of allOrders) {
            for (const item of order.products || []) {
                const pid = item.productId?.toString();
                const variantName = item.variant?.shadeName || "Default";
                const key = `${pid}_${variantName}`;

                const priceUsed =
                    item.variant?.displayPrice ||
                    item.variant?.discountedPrice ||
                    item.price ||
                    0;

                const qty = item.quantity || 0;
                const revenue = priceUsed * qty;

                // accumulate revenue from actual orders
                orderRevenueMap.set(key, (orderRevenueMap.get(key) || 0) + revenue);

                // record latest displayPrice (for fallback if no order exists)
                if (!latestDisplayPriceMap.has(key)) latestDisplayPriceMap.set(key, priceUsed);
            }
        }

        // 🧱 Step 3: Compute per-product metrics
        for (const product of products) {
            totalProducts++;

            const costPrice = product.buyingPrice || 0;

            if (Array.isArray(product.variants) && product.variants.length > 0) {
                for (const v of product.variants) {
                    totalVariants++;

                    if (v.stock === 0) outOfStock++;
                    else if (v.stock > 0 && v.stock <= (v.thresholdValue || 0)) lowStocks++;

                    const variantName = v.shadeName || "Default";
                    const key = `${product._id}_${variantName}`;

                    const soldQty = v.sales || 0;
                    const revenueFromOrders = orderRevenueMap.get(key) || 0;
                    const displayPrice = latestDisplayPriceMap.get(key) || 0;

                    // hybrid logic
                    const revenue = revenueFromOrders > 0
                        ? revenueFromOrders
                        : soldQty * displayPrice;

                    const cost = soldQty * costPrice;

                    totalRevenue += revenue;
                    totalCost += cost;

                    variantSalesData.push({
                        productId: product._id,
                        productName: product.name,
                        variantName,
                        sold: soldQty,
                        displayPrice,
                        cost,
                        revenue,
                        debugLogs: [
                            revenueFromOrders > 0
                                ? `✅ Used order-based revenue (${revenue})`
                                : `🧮 Used fallback: Sold=${soldQty}, DisplayPrice=${displayPrice}, Revenue=${revenue}`
                        ]
                    });
                }
            } else {
                totalVariants++;
                if (product.quantity === 0) outOfStock++;
                else if (product.quantity > 0 && product.quantity <= (product.thresholdValue || 0))
                    lowStocks++;

                const key = `${product._id}_Default`;
                const soldQty = product.sales || 0;
                const revenueFromOrders = orderRevenueMap.get(key) || 0;
                const displayPrice = latestDisplayPriceMap.get(key) || 0;

                const revenue = revenueFromOrders > 0
                    ? revenueFromOrders
                    : soldQty * displayPrice;

                const cost = soldQty * costPrice;

                totalRevenue += revenue;
                totalCost += cost;

                variantSalesData.push({
                    productId: product._id,
                    productName: product.name,
                    variantName: "Default",
                    sold: soldQty,
                    displayPrice,
                    cost,
                    revenue,
                    debugLogs: [
                        revenueFromOrders > 0
                            ? `✅ Used order-based revenue (${revenue})`
                            : `🧮 Used fallback: Sold=${soldQty}, DisplayPrice=${displayPrice}, Revenue=${revenue}`
                    ]
                });
            }
        }

        const profit = totalRevenue - totalCost;
        const topSelling = [...variantSalesData]
            .sort((a, b) => b.sold - a.sold)
            .slice(0, 5);

        res.status(200).json({
            totalCategories,
            totalProducts,
            totalVariants,
            totalRevenue,
            totalCost,
            profit,
            lowStocks,
            outOfStock,
            topSelling
        });
    } catch (error) {
        console.error("❌ Inventory Summary Error:", error);
        res.status(500).json({ message: "Error generating summary", error });
    }
};







// export const getInventorySummary = async (req, res) => {
//     try {
//         const {
//             category,
//             minPrice,
//             maxPrice,
//             minQuantity,
//             maxQuantity,
//             expiryFrom,
//             expiryTo
//         } = req.query;

//         const filter = {};

//         if (category) filter.category = category;
//         if (minPrice || maxPrice) {
//             filter.buyingPrice = {};
//             if (minPrice) filter.buyingPrice.$gte = Number(minPrice);
//             if (maxPrice) filter.buyingPrice.$lte = Number(maxPrice);
//         }

//         const products = await Product.find(filter)
//             .populate("category", "name")
//             .lean();

//         const topCategories = await Category.find({});
//         const totalCategories = topCategories.length;

//         // --- Initialize summary variables ---
//         let totalProducts = 0;
//         let totalVariants = 0;
//         let totalRevenue = 0;
//         let lowStocks = 0;
//         let outOfStock = 0;
//         const variantSalesData = [];

//         for (const product of products) {
//             totalProducts++;

//             // If product has variants
//             if (product.variants && product.variants.length > 0) {
//                 for (const v of product.variants) {
//                     totalVariants++;

//                     // Stock-based metrics
//                     if (v.stock === 0) outOfStock++;
//                     else if (v.stock > 0 && v.stock <= (v.thresholdValue || 0)) lowStocks++;

//                     // Revenue = total sales * (discountedPrice || price)
//                     const sellingPrice = v.discountedPrice || product.discountedPrice || product.price;
//                     const costPrice = product.buyingPrice;

//                     totalRevenue += (v.sales || 0) * sellingPrice;

//                     variantSalesData.push({
//                         productName: product.name,
//                         variantName: v.shadeName || v.sku,
//                         sold: v.sales || 0,
//                         cost: (v.sales || 0) * costPrice,
//                         revenue: (v.sales || 0) * sellingPrice
//                     });
//                 }
//             } else {
//                 // No variants → treat as single item product
//                 totalVariants++;
//                 if (product.quantity === 0) outOfStock++;
//                 else if (product.quantity > 0 && product.quantity <= (product.thresholdValue || 0))
//                     lowStocks++;

//                 const sellingPrice = product.discountedPrice || product.price;
//                 const costPrice = product.buyingPrice;

//                 totalRevenue += (product.sales || 0) * sellingPrice;

//                 variantSalesData.push({
//                     productName: product.name,
//                     variantName: "Default",
//                     sold: product.sales || 0,
//                     cost: (product.sales || 0) * costPrice,
//                     revenue: (product.sales || 0) * sellingPrice
//                 });
//             }
//         }

//         // Sort variants by sales (top 5)
//         const topSelling = variantSalesData
//             .sort((a, b) => b.sold - a.sold)
//             .slice(0, 5);

//         res.status(200).json({
//             totalCategories,
//             totalProducts,
//             totalVariants,
//             totalRevenue,
//             lowStocks,
//             outOfStock,
//             topSelling
//         });
//     } catch (error) {
//         console.error("Inventory Summary Error:", error);
//         res.status(500).json({ message: "Error generating summary", error });
//     }
// };
