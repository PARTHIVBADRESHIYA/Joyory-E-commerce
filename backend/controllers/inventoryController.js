// import Product from '../models/Product.js';
// import Category from "../models/Category.js"; // adjust path
// import Order from "../models/Order.js";

// // ✅ Add Inventory/Product Item

// export const getInventoryItems = async (req, res) => {
//     try {
//         const {
//             name,
//             variantName,
//             sku,
//             category,
//             minPrice,
//             maxPrice,
//             minQuantity,
//             maxQuantity,
//             availability,
//             expiryFrom,
//             expiryTo
//         } = req.query;

//         const filter = {};

//         // ✅ Product name filter
//         if (name) {
//             filter.name = { $regex: name, $options: "i" };
//         }

//         // ✅ Category filter
//         if (category) {
//             filter.category = category;
//         }

//         // ✅ Buying price filter
//         if (minPrice || maxPrice) {
//             filter.buyingPrice = {};
//             if (minPrice) filter.buyingPrice.$gte = Number(minPrice);
//             if (maxPrice) filter.buyingPrice.$lte = Number(maxPrice);
//         }

//         // ✅ Fetch products
//         const products = await Product.find(filter)
//             .populate("category", "name")
//             .lean();

//         const variantList = [];

//         for (const p of products) {

//             // ✅ Product has variants
//             if (Array.isArray(p.variants) && p.variants.length > 0) {
//                 for (const v of p.variants) {

//                     const stock = v.stock ?? 0;
//                     const threshold = v.thresholdValue ?? 0;

//                     // ✅ Variant name filter
//                     if (variantName) {
//                         const match = v.shadeName?.toLowerCase().includes(variantName.toLowerCase());
//                         if (!match) continue;
//                     }

//                     // ✅ SKU filter
//                     if (sku && v.sku !== sku) continue;

//                     // ✅ Quantity filters
//                     if (minQuantity && stock < Number(minQuantity)) continue;
//                     if (maxQuantity && stock > Number(maxQuantity)) continue;

//                     // ✅ Availability filter
//                     if (availability === "Out of stock" && stock !== 0) continue;
//                     if (availability === "Low stock" && !(stock > 0 && stock <= threshold)) continue;
//                     if (availability === "In-stock" && !(stock > threshold)) continue;

//                     // ✅ Expiry filter
//                     if (expiryFrom || expiryTo) {
//                         const exp = v.expiryDate ? new Date(v.expiryDate) : null;
//                         if (!exp) continue;
//                         if (expiryFrom && exp < new Date(expiryFrom)) continue;
//                         if (expiryTo && exp > new Date(expiryTo)) continue;
//                     }

//                     const productExpiry = p.expiryDate
//                         ? p.expiryDate.toISOString().split("T")[0]
//                         : "N/A";


//                     variantList.push({
//                         productId: p._id,
//                         category: p.category?.name || "N/A",
//                         productName: p.name,
//                         buyingPrice: p.buyingPrice,
//                         variantName: v.shadeName || "Default",
//                         sku: v.sku || "N/A",
//                         stock,
//                         thresholdValue: threshold,
//                         expiryDate: productExpiry,
//                         availability:
//                             stock === 0
//                                 ? "Out of stock"
//                                 : stock <= threshold
//                                     ? "Low stock"
//                                     : "In-stock"
//                     });
//                 }
//             }

//             // ✅ Product without variants
//             else {
//                 const stock = p.quantity ?? 0;
//                 const threshold = p.thresholdValue ?? 0;

//                 // ✅ Quantity filters
//                 if (minQuantity && stock < Number(minQuantity)) continue;
//                 if (maxQuantity && stock > Number(maxQuantity)) continue;

//                 // ✅ Availability filter
//                 if (availability === "Out of stock" && stock !== 0) continue;
//                 if (availability === "Low stock" && !(stock > 0 && stock <= threshold)) continue;
//                 if (availability === "In-stock" && !(stock > threshold)) continue;

//                 // ✅ Expiry filter
//                 if (expiryFrom || expiryTo) {
//                     const exp = p.expiryDate ? new Date(p.expiryDate) : null;
//                     if (!exp) continue;
//                     if (expiryFrom && exp < new Date(expiryFrom)) continue;
//                     if (expiryTo && exp > new Date(expiryTo)) continue;
//                 }

//                 variantList.push({
//                     productId: p._id,
//                     category: p.category?.name || "N/A",
//                     productName: p.name,
//                     buyingPrice: p.buyingPrice,
//                     variantName: "Default",
//                     sku: p.sku || "N/A",
//                     stock,
//                     thresholdValue: threshold,
//                     expiryDate: p.expiryDate ? p.expiryDate.toISOString().split("T")[0] : "N/A",
//                     availability:
//                         stock === 0
//                             ? "Out of stock"
//                             : stock <= threshold
//                                 ? "Low stock"
//                                 : "In-stock"
//                 });
//             }
//         }

//         res.status(200).json(variantList);

//     } catch (error) {
//         console.error("❌ Inventory List Error:", error);
//         res.status(500).json({ message: "Failed to fetch inventory list", error });
//     }
// };

// export const getInventorySummary = async (req, res) => {
//     try {
//         const { category, minPrice, maxPrice } = req.query;

//         // ---------------- FILTER ----------------
//         const filter = {};
//         if (category) filter.category = category;
//         if (minPrice || maxPrice) {
//             filter.buyingPrice = {};
//             if (minPrice) filter.buyingPrice.$gte = Number(minPrice);
//             if (maxPrice) filter.buyingPrice.$lte = Number(maxPrice);
//         }

//         // Normalization helper
//         const normalize = (str) => (str || "default").toLowerCase().trim();

//         // ---------------- Fetch Products ----------------
//         const products = await Product.find(filter)
//             .populate("category", "name")
//             .lean();

//         const totalCategories = await Category.countDocuments();

//         let totalProducts = 0;
//         let totalVariants = 0;
//         let totalRevenue = 0;
//         let totalCost = 0;
//         let lowStocks = 0;
//         let outOfStock = 0;

//         const variantSalesData = [];

//         // ---------------- Fetch Order Data Once ----------------
//         const allOrders = await Order.find(
//             {},
//             "products.productId products.variant products.price products.quantity"
//         ).lean();

//         // ---------------- Revenue Map ----------------
//         const revenueMap = new Map();
//         const fallbackPriceMap = new Map();

//         for (const order of allOrders) {
//             for (const item of order.products || []) {
//                 const pid = item.productId?.toString();
//                 if (!pid) continue;

//                 const variantName = normalize(item.variant?.shadeName);
//                 const key = `${pid}_${variantName}`;

//                 const unitPrice =
//                     item.variant?.displayPrice ||
//                     item.variant?.discountedPrice ||
//                     item.price ||
//                     0;

//                 const qty = item.quantity || 0;
//                 const revenue = qty * unitPrice;

//                 revenueMap.set(key, (revenueMap.get(key) || 0) + revenue);

//                 if (!fallbackPriceMap.has(key)) fallbackPriceMap.set(key, unitPrice);
//             }
//         }

//         // ---------------- Calculate Inventory Summary ----------------
//         for (const product of products) {
//             totalProducts++;
//             const costPrice = product.buyingPrice || 0;

//             const variants = product.variants?.length ? product.variants : [{ // simple product fallback
//                 shadeName: "default",
//                 stock: product.quantity,
//                 thresholdValue: product.thresholdValue,
//                 sales: product.sales,
//             }];

//             for (const v of variants) {
//                 totalVariants++;

//                 // Stock calculations
//                 if (v.stock === 0) outOfStock++;
//                 else if (v.stock > 0 && v.stock <= (v.thresholdValue || 0)) lowStocks++;

//                 const variantName = normalize(v.shadeName);
//                 const key = `${product._id}_${variantName}`;

//                 const soldQty = v.sales || 0;

//                 // ✅ Revenue from real orders
//                 const orderRevenue = revenueMap.get(key) || 0;

//                 // ✅ Fallback to product’s displayPrice * sales
//                 const displayPrice =
//                     fallbackPriceMap.get(key) ||
//                     v.displayPrice ||
//                     v.discountedPrice ||
//                     0;

//                 const fallbackRevenue = soldQty * displayPrice;

//                 const revenue = orderRevenue > 0 ? orderRevenue : fallbackRevenue;
//                 const cost = soldQty * costPrice;

//                 totalRevenue += revenue;
//                 totalCost += cost;

//                 variantSalesData.push({
//                     productId: product._id,
//                     productName: product.name,
//                     variantName: v.shadeName || "Default",
//                     sold: soldQty,
//                     displayPrice,
//                     cost,
//                     revenue,
//                     debug: orderRevenue > 0
//                         ? "✅ Used order-based revenue"
//                         : "🧮 Used fallback (displayPrice * sales)"
//                 });
//             }
//         }

//         // ---------------- Final Output ----------------
//         const profit = totalRevenue - totalCost;
//         const topSelling = [...variantSalesData]
//             .sort((a, b) => b.sold - a.sold)
//             .slice(0, 5);

//         res.status(200).json({
//             totalCategories,
//             totalProducts,
//             totalVariants,
//             totalRevenue: Number(totalRevenue.toFixed(2)),
//             totalCost: Number(totalCost.toFixed(2)),
//             profit: Number(profit.toFixed(2)),
//             lowStocks,
//             outOfStock,
//             topSelling
//         });

//     } catch (error) {
//         console.error("❌ Inventory Summary Error:", error);
//         res.status(500).json({ message: "Error generating summary", error });
//     }
// };








// controllers/inventoryController.js
import mongoose from "mongoose";
import Product from "../models/Product.js";
import Brand from "../models/Brand.js";
import Order from "../models/Order.js";
import Category from "../models/Category.js";

export const getInventoryItems = async (req, res) => {
    try {
        const {
            name,
            variantName,
            sku,
            category,
            brand,
            minPrice,
            maxPrice,
            minQuantity,
            maxQuantity,
            availability,        // "Out of stock" | "Low stock" | "In-stock"
            expiryFrom,
            expiryTo,
            warehouseCode,       // optional: filter per-warehouse
            stockScope = "total",// "total" (default) | "warehouse"
            sort = "productName",// productName | stock_desc | stock_asc | sku
            page = 1,
            limit = 50
        } = req.query;

        const parsedPage = Math.max(1, Number(page || 1));
        const parsedLimit = Math.min(500, Number(limit || 50));
        const skip = (parsedPage - 1) * parsedLimit;

        // Build product-level match
        const prodMatch = { isPublished: true }; // only published products usually
        if (name) prodMatch.name = { $regex: name, $options: "i" };
        if (category) prodMatch.category = mongoose.Types.ObjectId(category);
        if (brand) prodMatch.brand = mongoose.Types.ObjectId(brand);
        if (minPrice || maxPrice) {
            prodMatch.price = {};
            if (minPrice) prodMatch.price.$gte = Number(minPrice);
            if (maxPrice) prodMatch.price.$lte = Number(maxPrice);
        }
        if (expiryFrom || expiryTo) {
            prodMatch.expiryDate = {};
            if (expiryFrom) prodMatch.expiryDate.$gte = new Date(expiryFrom);
            if (expiryTo) prodMatch.expiryDate.$lte = new Date(expiryTo);
        }

        // Aggregation pipeline:
        const pipeline = [
            { $match: prodMatch },

            // Join category and brand (small docs)
            {
                $lookup: {
                    from: "categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "category"
                }
            },
            { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },

            {
                $lookup: {
                    from: "brands",
                    localField: "brand",
                    foreignField: "_id",
                    as: "brand"
                }
            },
            { $unwind: { path: "$brand", preserveNullAndEmptyArrays: true } },

            // Unwind variants so each document represents one variant (or fallback)
            { $unwind: { path: "$variants", preserveNullAndEmptyArrays: true } },

            // If product had no variants, create a fallback variant view
            {
                $addFields: {
                    variant: {
                        $cond: [
                            { $ifNull: ["$variants", false] },
                            "$variants",
                            {
                                sku: { $ifNull: ["$sku", "default"] },
                                shadeName: "Default",
                                stock: { $ifNull: ["$quantity", 0] },
                                stockByWarehouse: {
                                    $ifNull: ["$variants.stockByWarehouse", [{ warehouseCode: null, stock: { $ifNull: ["$quantity", 0] } }]]
                                },
                                thresholdValue: { $ifNull: ["$thresholdValue", 0] },
                                sales: { $ifNull: ["$sales", 0] },
                                displayPrice: { $ifNull: ["$discountedPrice", "$price"] },
                                discountedPrice: "$discountedPrice"
                            }
                        ]
                    }
                }
            },

            // Normalize stockByWarehouse (ensure array)
            {
                $addFields: {
                    "variant.stockByWarehouse": {
                        $cond: [
                            { $isArray: "$variant.stockByWarehouse" },
                            "$variant.stockByWarehouse",
                            [{ warehouseCode: null, stock: { $ifNull: ["$variant.stock", 0] } }]
                        ]
                    }
                }
            },

            // Compute totalStock (sum of stockByWarehouse.stock)
            {
                $addFields: {
                    variantTotalStock: {
                        $reduce: {
                            input: "$variant.stockByWarehouse",
                            initialValue: 0,
                            in: { $add: ["$$value", { $ifNull: ["$$this.stock", 0] }] }
                        }
                    }
                }
            },

            // If warehouseCode provided -> compute warehouseStock
            {
                $addFields: {
                    warehouseStock: warehouseCode
                        ? {
                            $let: {
                                vars: {
                                    filtered: {
                                        $filter: {
                                            input: "$variant.stockByWarehouse",
                                            as: "sw",
                                            cond: { $eq: ["$$sw.warehouseCode", warehouseCode] }
                                        }
                                    }
                                },
                                in: { $ifNull: [{ $arrayElemAt: ["$$filtered.stock", 0] }, 0] }
                            }
                        }
                        : null
                }
            },

            // Determine availability according to threshold and chosen scope
            {
                $addFields: {
                    availabilityComputed: {
                        $let: {
                            vars: {
                                stockValue: {
                                    $cond: [
                                        { $eq: [stockScope, "warehouse"] },
                                        { $ifNull: ["$warehouseStock", 0] },
                                        "$variantTotalStock"
                                    ]
                                },
                                threshold: { $ifNull: ["$variant.thresholdValue", 0] }
                            },
                            in: {
                                $switch: {
                                    branches: [
                                        { case: { $eq: ["$$stockValue", 0] }, then: "Out of stock" },
                                        { case: { $lte: ["$$stockValue", "$$threshold"] }, then: "Low stock" }
                                    ],
                                    default: "In-stock"
                                }
                            }
                        }
                    }
                }
            },

            // Variant-level filters: variantName, sku, min/max quantity, availability
            {
                $match: (function () {
                    const m = {};
                    if (variantName) m["variant.shadeName"] = { $regex: variantName, $options: "i" };
                    if (sku) m["variant.sku"] = sku;
                    // For minQuantity/maxQuantity and availability, use expressions - handled below by $match using computed fields.
                    return Object.keys(m).length ? m : {};
                })()
            },

            // We will apply minQuantity/maxQuantity and availability filters using $match with $expr
            {
                $match: (function () {
                    const exprs = [];
                    if (minQuantity) {
                        exprs.push({
                            $expr: {
                                $gte: [
                                    stockScope === "warehouse"
                                        ? { $ifNull: ["$warehouseStock", 0] }
                                        : "$variantTotalStock",
                                    Number(minQuantity)
                                ]
                            }
                        });
                    }
                    if (maxQuantity) {
                        exprs.push({
                            $expr: {
                                $lte: [
                                    stockScope === "warehouse"
                                        ? { $ifNull: ["$warehouseStock", 0] }
                                        : "$variantTotalStock",
                                    Number(maxQuantity)
                                ]
                            }
                        });
                    }
                    if (availability) {
                        // availability is string like "Out of stock" | "Low stock" | "In-stock"
                        exprs.push({
                            $expr: { $eq: ["$availabilityComputed", availability] }
                        });
                    }
                    if (!exprs.length) return {};
                    if (exprs.length === 1) return exprs[0];
                    return { $and: exprs };
                })()
            },

            // Project clean fields
            {
                $project: {
                    _id: 0,
                    productId: "$_id",
                    productName: "$name",
                    category: "$category.name",
                    brand: { id: "$brand._id", name: "$brand.name" },
                    buyingPrice: 1,
                    variantSku: "$variant.sku",
                    variantName: "$variant.shadeName",
                    variantDisplayPrice: "$variant.displayPrice",
                    variantDiscountedPrice: "$variant.discountedPrice",
                    totalStock: "$variantTotalStock",
                    warehouseStock: "$warehouseStock",
                    thresholdValue: "$variant.thresholdValue",
                    availability: "$availabilityComputed",
                    expiryDate: { $cond: [{ $ifNull: ["$expiryDate", false] }, { $dateToString: { date: "$expiryDate", format: "%Y-%m-%d" } }, null] }
                }
            }
        ];

        // Count pipeline
        const countPipeline = [...pipeline, { $count: "total" }];
        const countResult = await Product.aggregate(countPipeline);
        const total = countResult[0]?.total || 0;

        // Apply sorting
        const sortMap = {
            productName: { productName: 1 },
            stock_desc: { totalStock: -1 },
            stock_asc: { totalStock: 1 },
            sku: { variantSku: 1 }
        };
        const chosenSort = sortMap[sort] || sortMap.productName;
        pipeline.push({ $sort: chosenSort });

        // Pagination
        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: parsedLimit });

        const rows = await Product.aggregate(pipeline);

        res.status(200).json({
            total,
            page: parsedPage,
            limit: parsedLimit,
            results: rows
        });
    } catch (err) {
        console.error("getInventoryItems error:", err);
        res.status(500).json({ message: "Failed to fetch inventory items", error: err.message });
    }
};



/**
 * Returns overall inventory KPIs:
 * - totalCategories
 * - totalProducts
 * - totalVariants
 * - totalStock (sum of all variants across warehouses)
 * - lowStocks / outOfStock
 * - totalRevenue (derived from Orders where available, fallback to displayPrice*sales)
 * - totalCost (sales * buyingPrice)
 * - profit and topSelling variants
 */
export const getInventorySummary = async (req, res) => {
    try {
        const { category, brand, warehouseCode, minPrice, maxPrice } = req.query;

        // product filter
        const filter = {};
        if (category) filter.category = mongoose.Types.ObjectId(category);
        if (brand) filter.brand = mongoose.Types.ObjectId(brand);
        if (minPrice || maxPrice) {
            filter.price = {};
            if (minPrice) filter.price.$gte = Number(minPrice);
            if (maxPrice) filter.price.$lte = Number(maxPrice);
        }

        // fetch products lean
        const products = await Product.find(filter).populate("category", "name").populate("brand", "name warehouses primaryWarehouse").lean();

        const totalCategories = await Category.countDocuments();

        let totalProducts = 0;
        let totalVariants = 0;
        let totalStock = 0;
        let lowStocks = 0;
        let outOfStock = 0;

        // Build revenue map from orders aggregated by productId + variant shadeName
        const orderAgg = await Order.aggregate([
            { $unwind: "$products" },
            {
                $group: {
                    _id: {
                        productId: "$products.productId",
                        variantShade: "$products.variant.shadeName"
                    },
                    qty: { $sum: "$products.quantity" },
                    revenue: { $sum: { $multiply: ["$products.quantity", { $ifNull: ["$products.variant.displayPrice", "$products.price"] }] } }
                }
            }
        ]);

        const revenueMap = new Map(); // key = `${pid}_${variantNormalized}`
        for (const r of orderAgg) {
            const pid = String(r._id.productId);
            const vname = (r._id.variantShade || "default").toLowerCase().trim();
            revenueMap.set(`${pid}_${vname}`, { qty: r.qty, revenue: r.revenue });
        }

        const variantStats = [];

        for (const p of products) {
            totalProducts++;
            const bp = p.buyingPrice || 0;
            const variants = Array.isArray(p.variants) && p.variants.length ? p.variants : [
                {
                    sku: p.sku || "default",
                    shadeName: "Default",
                    stockByWarehouse: [{ warehouseCode: null, stock: p.quantity || 0 }],
                    thresholdValue: p.thresholdValue || 0,
                    sales: p.sales || 0,
                    displayPrice: p.discountedPrice || p.price || 0
                }
            ];
            for (const v of variants) {
                totalVariants++;

                // compute variant total stock (sum of stockByWarehouse)
                const stockByWarehouse = Array.isArray(v.stockByWarehouse) && v.stockByWarehouse.length ? v.stockByWarehouse : [{ warehouseCode: null, stock: v.stock || 0 }];
                const totalStockForVariant = stockByWarehouse.reduce((s, w) => s + (Number(w.stock || 0)), 0);

                // if warehouseCode filter is present, consider that warehouse only for stock metrics
                const effectiveStock = warehouseCode
                    ? (stockByWarehouse.find(sw => sw.warehouseCode === warehouseCode)?.stock || 0)
                    : totalStockForVariant;

                totalStock += effectiveStock;

                if (effectiveStock === 0) outOfStock++;
                else if (effectiveStock > 0 && effectiveStock <= (v.thresholdValue || 0)) lowStocks++;

                // revenue from orders map
                const key = `${p._id}_${(v.shadeName || "default").toLowerCase().trim()}`;
                const orderEntry = revenueMap.get(key);
                const orderRevenue = orderEntry ? orderEntry.revenue : 0;
                const soldQty = orderEntry ? orderEntry.qty : (v.sales || 0);

                // fallback to displayPrice * sales
                const displayPrice = v.displayPrice || v.discountedPrice || p.price || 0;
                const fallbackRevenue = (v.sales || 0) * displayPrice;
                const revenue = orderRevenue > 0 ? orderRevenue : fallbackRevenue;

                const cost = (bp || 0) * (soldQty || 0);

                variantStats.push({
                    productId: p._id,
                    productName: p.name,
                    brand: p.brand?.name || null,
                    variantName: v.shadeName || "Default",
                    sku: v.sku,
                    sold: soldQty || 0,
                    revenue: Number(revenue || 0),
                    cost: Number(cost || 0)
                });
            }
        }

        // totals
        const totalRevenue = variantStats.reduce((s, v) => s + (v.revenue || 0), 0);
        const totalCost = variantStats.reduce((s, v) => s + (v.cost || 0), 0);
        const profit = totalRevenue - totalCost;

        // top selling
        const topSelling = variantStats.sort((a, b) => b.sold - a.sold).slice(0, 10);

        res.status(200).json({
            totalCategories,
            totalProducts,
            totalVariants,
            totalStock,
            lowStocks,
            outOfStock,
            totalRevenue: Number(totalRevenue.toFixed(2)),
            totalCost: Number(totalCost.toFixed(2)),
            profit: Number(profit.toFixed(2)),
            topSelling
        });

    } catch (err) {
        console.error("getInventorySummary error:", err);
        res.status(500).json({ message: "Failed to build inventory summary", error: err.message });
    }
};
