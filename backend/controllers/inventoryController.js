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
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import Brand from "../models/Brand.js";
import Order from "../models/Order.js";

/**
 * Helper: safely parse numbers
 */
const toNumber = (val, fallback = null) => {
    if (val === undefined || val === null || val === "") return fallback;
    const n = Number(val);
    return Number.isNaN(n) ? fallback : n;
};

/**
 * Normalize str helper
 */
const normalize = (s) => (s || "default").toString().toLowerCase().trim();

/**
 * GET /inventory/items
 * Query params supported:
 *  - name, variantName, sku, category, brand, warehouse (warehouseCode)
 *  - minPrice, maxPrice, minQuantity, maxQuantity
 *  - availability = "Out of stock" | "Low stock" | "In-stock"
 *  - expiryFrom, expiryTo (ISO date strings)
 *  - page (default 1), limit (default 50), sortBy (e.g., "stock"), sortDir (asc|desc)
 *
 * Response: array of variant objects:
 * {
 *   productId, productName, brand: { _id, name }, category: { _id, name },
 *   variantName, sku, totalStock, stockByWarehouse: [{warehouseCode,stock}],
 *   thresholdValue, buyingPrice, displayPrice, expiryDate, availability
 * }
 */
export const getInventoryItems = async (req, res) => {
    try {
        const {
            name,
            variantName,
            sku,
            category,
            brand,
            warehouse: warehouseCode,
            minPrice,
            maxPrice,
            minQuantity,
            maxQuantity,
            availability,
            expiryFrom,
            expiryTo,
            page = 1,
            limit = 50,
            sortBy = "productName",
            sortDir = "asc"
        } = req.query;

        // Build product filter
        const filter = {};
        if (name) filter.name = { $regex: name, $options: "i" };
        if (category) filter.category = category;
        if (brand) filter.brand = brand;
        if (minPrice || maxPrice) {
            filter.buyingPrice = {};
            if (minPrice) filter.buyingPrice.$gte = toNumber(minPrice, 0);
            if (maxPrice) filter.buyingPrice.$lte = toNumber(maxPrice, Number.MAX_SAFE_INTEGER);
        }

        // Fetch products (page/limit apply to variants later)
        const products = await Product.find(filter)
            .populate("category", "name")
            .populate("brand", "name slug")
            .lean();

        const items = [];

        for (const p of products) {
            const variants = Array.isArray(p.variants) && p.variants.length > 0
                ? p.variants
                : [{
                    sku: p.sku || `P-${p._id}`,
                    shadeName: "Default",
                    stock: p.quantity ?? 0,
                    stockByWarehouse: (p.quantity || 0) ? [{ warehouseCode: p.brand?.primaryWarehouse || "default", stock: p.quantity }] : [{ warehouseCode: p.brand?.primaryWarehouse || "default", stock: 0 }],
                    thresholdValue: p.thresholdValue ?? 0,
                    displayPrice: p.displayPrice ?? p.discountedPrice ?? p.price ?? 0,
                    discountedPrice: p.discountedPrice ?? null,
                    sales: p.sales ?? 0,
                    expiryDate: p.expiryDate ?? null
                }];

            for (const v of variants) {
                // variant-level totals and validations
                const stockByWarehouse = Array.isArray(v.stockByWarehouse) && v.stockByWarehouse.length > 0
                    ? v.stockByWarehouse.map(s => ({
                        warehouseCode: s.warehouseCode || "default",
                        stock: toNumber(s.stock, 0)
                    }))
                    : [{ warehouseCode: "default", stock: toNumber(v.stock, 0) }];

                const totalStock = stockByWarehouse.reduce((s, w) => s + (w.stock || 0), 0);
                const threshold = toNumber(v.thresholdValue, 0);

                // Variant name / SKU filters
                if (variantName && !(v.shadeName || "").toLowerCase().includes(variantName.toLowerCase())) continue;
                if (sku && (v.sku || "").toString() !== sku.toString()) continue;

                // Warehouse filter (if requested)
                if (warehouseCode) {
                    const whEntry = stockByWarehouse.find(w => w.warehouseCode === warehouseCode);
                    if (!whEntry) continue; // no stock entry for requested warehouse
                }

                // Quantity filters
                if (minQuantity && totalStock < Number(minQuantity)) continue;
                if (maxQuantity && totalStock > Number(maxQuantity)) continue;

                // Availability filters
                if (availability === "Out of stock" && totalStock !== 0) continue;
                if (availability === "Low stock" && !(totalStock > 0 && totalStock <= threshold)) continue;
                if (availability === "In-stock" && !(totalStock > threshold)) continue;

                // Expiry filters (variant expiry takes precedence, else product expiry)
                const expDate = v.expiryDate ? new Date(v.expiryDate) : (p.expiryDate ? new Date(p.expiryDate) : null);
                if (expiryFrom && (!expDate || expDate < new Date(expiryFrom))) continue;
                if (expiryTo && (!expDate || expDate > new Date(expiryTo))) continue;

                items.push({
                    productId: p._id,
                    productName: p.name,
                    brand: p.brand ? { _id: p.brand._id, name: p.brand.name, slug: p.brand.slug } : null,
                    category: p.category ? { _id: p.category._id, name: p.category.name } : null,
                    buyingPrice: p.buyingPrice ?? 0,

                    // 🔥 Variant image support
                    image: (Array.isArray(v.images) && v.images.length > 0)
                        ? v.images[0]
                        : (Array.isArray(p.images) && p.images.length > 0)
                            ? p.images[0]
                            : "N/A",

                    variantName: v.shadeName || "Default",
                    sku: v.sku || "N/A",
                    totalStock,
                    stockByWarehouse,

                    thresholdValue: threshold,

                    displayPrice: toNumber(
                        v.displayPrice ??
                        v.discountedPrice ??
                        p.displayPrice ??
                        p.price,
                        0
                    ),

                    expiryDate: expDate ? expDate.toISOString().split("T")[0] : "N/A",

                    availability:
                        totalStock === 0
                            ? "Out of stock"
                            : totalStock <= threshold
                                ? "Low stock"
                                : "In-stock",

                    sold: toNumber(v.sales, 0)
                });

            }
        }

        // Sorting
        const dir = sortDir === "desc" ? -1 : 1;
        items.sort((a, b) => {
            if (sortBy === "stock") return (a.totalStock - b.totalStock) * dir;
            if (sortBy === "sold") return (a.sold - b.sold) * dir;
            if (sortBy === "displayPrice") return (a.displayPrice - b.displayPrice) * dir;
            // default: productName
            return a.productName.localeCompare(b.productName) * dir;
        });

        // Pagination
        const pageNum = Math.max(1, Number(page));
        const perPage = Math.min(500, Math.max(1, Number(limit)));
        const start = (pageNum - 1) * perPage;
        const paginated = items.slice(start, start + perPage);

        res.status(200).json({
            totalItems: items.length,
            page: pageNum,
            perPage,
            data: paginated
        });

    } catch (err) {
        console.error("❌ getInventoryItems error:", err);
        res.status(500).json({ message: "Failed to fetch inventory items", error: err.message });
    }
};


/**
 * GET /inventory/summary
 * Returns overall inventory KPIs + top selling variants.
 * Supports filters: category, brand, minPrice, maxPrice
 *
 * Response:
 * {
 *  totalBrands, totalCategories, totalProducts, totalVariants,
 *  totalStock, lowStocks, outOfStock,
 *  totalRevenue, totalCost, profit,
 *  warehouseSummary: [{ warehouseCode, totalStock, lowStockCount, outOfStockCount }],
 *  brandSummary: [{ brandId, brandName, totalProducts, totalStock }],
 *  topSelling: [{ productId, productName, variantName, sold, revenue }]
 * }
 */
// export const getInventorySummary = async (req, res) => {
//     try {
//         const { category, brand, minPrice, maxPrice } = req.query;

//         const filter = {};
//         if (category) filter.category = category;
//         if (brand) filter.brand = brand;
//         if (minPrice || maxPrice) {
//             filter.buyingPrice = {};
//             if (minPrice) filter.buyingPrice.$gte = Number(minPrice);
//             if (maxPrice) filter.buyingPrice.$lte = Number(maxPrice);
//         }

//         const products = await Product.find(filter)
//             .populate("category", "name")
//             .populate("brand", "name")
//             .lean();

//         const totalCategories = await Category.countDocuments();
//         const totalBrands = await Brand.countDocuments();

//         let totalProducts = 0;
//         let totalVariants = 0;
//         let totalStock = 0;
//         let lowStocks = 0;
//         let outOfStock = 0;
//         let totalRevenue = 0;
//         let totalCost = 0;

//         const warehouseMap = new Map();
//         const brandMap = new Map();
//         const variantSalesData = [];

//         // NEW SECTIONS
//         const lowStockItems = [];
//         const outOfStockItems = [];

//         const allOrders = await Order.find({}, "products.productId products.variant products.price products.quantity").lean();
//         const revenueMap = new Map();
//         const fallbackPriceMap = new Map();

//         for (const ord of allOrders) {
//             for (const it of ord.products || []) {
//                 const pid = it.productId?.toString();
//                 if (!pid) continue;
//                 const key = `${pid}_${(it.variant?.shadeName || "").toLowerCase()}`;
//                 const unitPrice = Number(it.variant?.displayPrice ?? it.variant?.discountedPrice ?? it.price ?? 0);
//                 const qty = Number(it.quantity || 0);
//                 const rev = unitPrice * qty;

//                 revenueMap.set(key, (revenueMap.get(key) || 0) + rev);
//                 if (!fallbackPriceMap.has(key)) fallbackPriceMap.set(key, unitPrice);
//             }
//         }

//         for (const p of products) {
//             totalProducts++;

//             const variants = Array.isArray(p.variants) && p.variants.length > 0
//                 ? p.variants
//                 : [{
//                     shadeName: "Default",
//                     stockByWarehouse: [{ warehouseCode: p.brand?.primaryWarehouse || "default", stock: Number(p.quantity || 0) }],
//                     stock: Number(p.quantity || 0),
//                     thresholdValue: p.thresholdValue ?? 0,
//                     displayPrice: p.displayPrice ?? p.discountedPrice ?? p.price ?? 0,
//                     sales: p.sales ?? 0
//                 }];

//             const brandId = p.brand?._id?.toString() || "unknown";
//             if (!brandMap.has(brandId))
//                 brandMap.set(brandId, { brandName: p.brand?.name || "Unknown", totalProducts: 0, totalStock: 0 });

//             brandMap.get(brandId).totalProducts++;

//             for (const v of variants) {
//                 totalVariants++;

//                 const stockByWarehouse = Array.isArray(v.stockByWarehouse) && v.stockByWarehouse.length > 0
//                     ? v.stockByWarehouse.map(s => ({
//                         warehouseCode: s.warehouseCode || "default",
//                         stock: Number(s.stock || 0)
//                     }))
//                     : [{ warehouseCode: "default", stock: Number(v.stock || 0) }];

//                 const variantTotalStock = stockByWarehouse.reduce((s, w) => s + w.stock, 0);

//                 totalStock += variantTotalStock;

//                 // 👇 NEW: PUSH DETAILS INTO SECTIONS
//                 const variantInfo = {
//                     productId: p._id,
//                     productName: p.name,
//                     variantName: v.shadeName || "Default",
//                     sku: v.sku || "N/A",
//                     image: (Array.isArray(v.images) && v.images.length > 0)
//                         ? v.images[0]
//                         : (Array.isArray(p.images) && p.images.length > 0)
//                             ? p.images[0]
//                             : "N/A",
//                     totalVariantStock: variantTotalStock,
//                     perWarehouseStock: stockByWarehouse
//                 };

//                 // --- FIXED LOW-STOCK / OUT-STOCK LOGIC ---

//                 const threshold = Number(v.thresholdValue || 0);

//                 if (variantTotalStock === 0) {
//                     // Out of stock
//                     outOfStock++;
//                     outOfStockItems.push(variantInfo);

//                 } else {
//                     let isLowStock = false;

//                     if (threshold > 0) {
//                         // CASE 1: Variant HAS threshold → use threshold
//                         isLowStock = variantTotalStock <= threshold;
//                     } else {
//                         // CASE 2: No threshold → fallback to ≤10 rule
//                         isLowStock = variantTotalStock <= 10;
//                     }

//                     if (isLowStock) {
//                         lowStocks++;
//                         lowStockItems.push(variantInfo);
//                     }
//                 }


//                 // warehouse summary logic continues...
//                 for (const w of stockByWarehouse) {
//                     const code = w.warehouseCode || "default";
//                     if (!warehouseMap.has(code))
//                         warehouseMap.set(code, { warehouseCode: code, totalStock: 0, lowCount: 0, outCount: 0 });

//                     const entry = warehouseMap.get(code);

//                     entry.totalStock += w.stock;
//                     if (w.stock === 0) {
//                         entry.outCount++;
//                     } else {
//                         let isLowStockWarehouse = false;

//                         if (threshold > 0) {
//                             isLowStockWarehouse = w.stock <= threshold;
//                         } else {
//                             isLowStockWarehouse = w.stock <= 10;
//                         }

//                         if (isLowStockWarehouse) entry.lowCount++;
//                     }

//                 }

//                 brandMap.get(brandId).totalStock += variantTotalStock;

//                 const key = `${p._id}_${(v.shadeName || "").toLowerCase()}`;
//                 const soldQty = Number(v.sales || 0);

//                 const orderRevenue = revenueMap.get(key) || 0;
//                 const displayPrice =
//                     fallbackPriceMap.get(key)
//                     ?? Number(v.displayPrice || v.discountedPrice || p.displayPrice || p.price || 0);

//                 const revenue = orderRevenue > 0 ? orderRevenue : soldQty * displayPrice;
//                 const cost = soldQty * Number(p.buyingPrice || 0);

//                 totalRevenue += revenue;
//                 totalCost += cost;

//                 variantSalesData.push({
//                     productId: p._id,
//                     productName: p.name,
//                     image: (Array.isArray(v.images) && v.images.length > 0)
//                         ? v.images[0]
//                         : (Array.isArray(p.images) && p.images.length > 0)
//                             ? p.images[0]
//                             : "N/A",
//                     sku: v.sku || "N/A",
//                     variantName: v.shadeName || "Default",
//                     sold: soldQty,
//                     displayPrice,
//                     revenue,
//                     cost,
//                     usedOrderRevenue: orderRevenue > 0
//                 });
//             }
//         }

//         const warehouseSummary = Array.from(warehouseMap.values()).sort((a, b) => b.totalStock - a.totalStock);
//         const brandSummary = Array.from(brandMap.entries()).map(([id, v]) => ({
//             brandId: id,
//             brandName: v.brandName,
//             totalProducts: v.totalProducts,
//             totalStock: v.totalStock
//         })).sort((a, b) => b.totalStock - a.totalStock);

//         const topSelling = variantSalesData.sort((a, b) => b.sold - a.sold).slice(0, 10);

//         const profit = totalRevenue - totalCost;

//         res.status(200).json({
//             totalCategories,
//             totalBrands,
//             totalProducts,
//             totalVariants,
//             totalStock,
//             lowStocks,
//             outOfStock,
//             totalRevenue: Number(totalRevenue.toFixed(2)),
//             totalCost: Number(totalCost.toFixed(2)),
//             profit: Number(profit.toFixed(2)),
//             warehouseSummary,
//             brandSummary,
//             topSelling,

//             // NEW SECTIONS HERE
//             lowStockItems,
//             outOfStockItems
//         });

//     } catch (err) {
//         console.error("❌ getInventorySummary error:", err);
//         res.status(500).json({ message: "Failed to generate inventory summary", error: err.message });
//     }
// };
export const getInventorySummary = async (req, res) => {
    try {
        const { category, brand, minPrice, maxPrice } = req.query;
        const filter = {};
        if (category) filter.category = category;
        if (brand) filter.brand = brand;
        if (minPrice || maxPrice) {
            filter.buyingPrice = {};
            if (minPrice) filter.buyingPrice.$gte = Number(minPrice);
            if (maxPrice) filter.buyingPrice.$lte = Number(maxPrice);
        }

        const products = await Product.find(filter)
            .populate("category", "name")
            .populate("brand", "name")
            .lean();

        const totalCategories = await Category.countDocuments();
        const totalBrands = await Brand.countDocuments();

        let totalProducts = 0;
        let totalVariants = 0;
        let totalStock = 0;
        let lowStocks = 0;
        let outOfStock = 0;

        let totalRevenue = 0;
        let totalCost = 0;

        const warehouseMap = new Map();
        const brandMap = new Map();

        const variantSalesData = [];
        const lowStockItems = [];
        const outOfStockItems = [];

        // 🚀 ONLY DELIVERED ORDERS — STRICT!
        const deliveredOrders = await Order.find(
            { orderStatus: "Delivered" },
            "products.productId products.variant products.price products.quantity"
        ).lean();

        // Map: pid_shadename -> deliveredQty, deliveredRevenue
        const deliveredMap = new Map();

        for (const ord of deliveredOrders) {
            for (const it of ord.products || []) {
                const pid = it.productId?.toString();
                if (!pid) continue;

                const shade = (it.variant?.shadeName || "default").toLowerCase();
                const key = `${pid}_${shade}`;

                const qty = Number(it.quantity || 0);
                const sellPrice =
                    Number(it.variant?.displayPrice ??
                    it.variant?.discountedPrice ??
                    it.price ??
                    0);

                const revenue = sellPrice * qty;

                if (!deliveredMap.has(key)) {
                    deliveredMap.set(key, { qty: 0, revenue: 0 });
                }

                deliveredMap.get(key).qty += qty;
                deliveredMap.get(key).revenue += revenue;
            }
        }

        // 🔥 MAIN PRODUCTS LOOP
        for (const p of products) {
            totalProducts++;

            const variants = Array.isArray(p.variants) && p.variants.length > 0
                ? p.variants
                : [{
                    shadeName: "Default",
                    stockByWarehouse: [{
                        warehouseCode: p.brand?.primaryWarehouse || "default",
                        stock: Number(p.quantity || 0)
                    }],
                    stock: Number(p.quantity || 0),
                    thresholdValue: p.thresholdValue ?? 0,
                    displayPrice: p.displayPrice ?? p.discountedPrice ?? p.price ?? 0
                }];

            const brandId = p.brand?._id?.toString() || "unknown";
            if (!brandMap.has(brandId)) {
                brandMap.set(brandId, {
                    brandName: p.brand?.name || "Unknown",
                    totalProducts: 0,
                    totalStock: 0
                });
            }
            brandMap.get(brandId).totalProducts++;

            for (const v of variants) {
                totalVariants++;

                const stockByWarehouse = Array.isArray(v.stockByWarehouse) && v.stockByWarehouse.length > 0
                    ? v.stockByWarehouse.map(s => ({
                        warehouseCode: s.warehouseCode || "default",
                        stock: Number(s.stock || 0)
                    }))
                    : [{
                        warehouseCode: "default",
                        stock: Number(v.stock || 0)
                    }];

                const variantTotalStock = stockByWarehouse.reduce((s, w) => s + w.stock, 0);
                totalStock += variantTotalStock;

                const variantInfo = {
                    productId: p._id,
                    productName: p.name,
                    variantName: v.shadeName || "Default",
                    sku: v.sku || "N/A",
                    image: (Array.isArray(v.images) && v.images.length > 0)
                        ? v.images[0]
                        : (Array.isArray(p.images) && p.images.length > 0)
                            ? p.images[0]
                            : "N/A",
                    totalVariantStock: variantTotalStock,
                    perWarehouseStock: stockByWarehouse
                };

                // Stock checks
                const threshold = Number(v.thresholdValue || 0);

                if (variantTotalStock === 0) {
                    outOfStock++;
                    outOfStockItems.push(variantInfo);
                } else {
                    const isLow = threshold > 0
                        ? variantTotalStock <= threshold
                        : variantTotalStock <= 10;

                    if (isLow) {
                        lowStocks++;
                        lowStockItems.push(variantInfo);
                    }
                }

                // Warehouse summary
                for (const w of stockByWarehouse) {
                    const code = w.warehouseCode || "default";
                    if (!warehouseMap.has(code)) {
                        warehouseMap.set(code, {
                            warehouseCode: code,
                            totalStock: 0,
                            lowCount: 0,
                            outCount: 0
                        });
                    }

                    const entry = warehouseMap.get(code);
                    entry.totalStock += w.stock;

                    if (w.stock === 0) {
                        entry.outCount++;
                    } else {
                        const isLow = threshold > 0 ? w.stock <= threshold : w.stock <= 10;
                        if (isLow) entry.lowCount++;
                    }
                }

                brandMap.get(brandId).totalStock += variantTotalStock;

                // 🚀 Delivered logic
                const shade = (v.shadeName || "default").toLowerCase();
                const key = `${p._id}_${shade}`;

                const deliveredData = deliveredMap.get(key) || { qty: 0, revenue: 0 };

                const deliveredQty = deliveredData.qty;
                const deliveredRevenue = deliveredData.revenue;

                const buyingPrice = Number(p.buyingPrice || 0);
                const deliveredCost = deliveredQty * buyingPrice;

                totalRevenue += deliveredRevenue;
                totalCost += deliveredCost;

                variantSalesData.push({
                    productId: p._id,
                    productName: p.name,
                    image: variantInfo.image,
                    sku: v.sku || "N/A",
                    variantName: v.shadeName || "Default",
                    sold: deliveredQty,
                    revenue: deliveredRevenue,
                    cost: deliveredCost
                });
            }
        }

        const warehouseSummary = Array.from(warehouseMap.values())
            .sort((a, b) => b.totalStock - a.totalStock);

        const brandSummary = Array.from(brandMap.entries())
            .map(([id, v]) => ({
                brandId: id,
                brandName: v.brandName,
                totalProducts: v.totalProducts,
                totalStock: v.totalStock
            }))
            .sort((a, b) => b.totalStock - a.totalStock);

        const topSelling = variantSalesData
            .sort((a, b) => b.sold - a.sold)
            .slice(0, 10);

        const profit = totalRevenue - totalCost;

        res.status(200).json({
            totalCategories,
            totalBrands,
            totalProducts,
            totalVariants,
            totalStock,
            lowStocks,
            outOfStock,
            totalRevenue: Number(totalRevenue.toFixed(2)),
            totalCost: Number(totalCost.toFixed(2)),
            profit: Number(profit.toFixed(2)),
            warehouseSummary,
            brandSummary,
            topSelling,
            lowStockItems,
            outOfStockItems
        });

    } catch (err) {
        console.error("❌ getInventorySummary error:", err);
        res.status(500).json({ message: "Failed to generate inventory summary", error: err.message });
    }
};
    

/**
 * Optional: GET /inventory/brand/:brandId
 * Returns warehouse-wise inventory breakdown for a brand
 */
export const getInventoryByBrand = async (req, res) => {
    try {
        const { brandId } = req.params;
        if (!brandId) return res.status(400).json({ message: "brandId required" });

        const brand = await Brand.findById(brandId).lean();
        if (!brand) return res.status(404).json({ message: "Brand not found" });

        // Fetch products for brand
        const products = await Product.find({ brand: brandId })
            .populate("category", "name")
            .lean();

        const warehouseMap = new Map(); // warehouseCode -> { warehouseName, totalStock, items: [] }
        for (const p of products) {
            const variants = Array.isArray(p.variants) && p.variants.length > 0
                ? p.variants
                : [{
                    shadeName: "Default",
                    stockByWarehouse: [{ warehouseCode: brand.primaryWarehouse || "default", stock: toNumber(p.quantity, 0) }],
                    stock: toNumber(p.quantity, 0)
                }];

            for (const v of variants) {
                const stockByWarehouse = Array.isArray(v.stockByWarehouse) ? v.stockByWarehouse : [{ warehouseCode: "default", stock: toNumber(v.stock, 0) }];

                for (const w of stockByWarehouse) {
                    const code = w.warehouseCode || "default";
                    if (!warehouseMap.has(code)) warehouseMap.set(code, { warehouseCode: code, totalStock: 0, items: [] });

                    const entry = warehouseMap.get(code);
                    entry.totalStock += toNumber(w.stock, 0);
                    entry.items.push({
                        productId: p._id,
                        productName: p.name,
                        category: p.category?.name || "N/A",
                        variantName: v.shadeName || "Default",
                        sku: v.sku || "N/A",
                        stock: toNumber(w.stock, 0),
                        thresholdValue: toNumber(v.thresholdValue, 0)
                    });
                }
            }
        }

        const warehouseSummary = Array.from(warehouseMap.values()).map(w => ({
            ...w,
            items: w.items.sort((a, b) => b.stock - a.stock)
        }));

        res.status(200).json({
            brand: { _id: brand._id, name: brand.name, primaryWarehouse: brand.primaryWarehouse || null },
            warehouses: warehouseSummary
        });

    } catch (err) {
        console.error("❌ getInventoryByBrand error:", err);
        res.status(500).json({ message: "Failed to fetch brand inventory", error: err.message });
    }
};

export const deleteVariant = async (req, res) => {
    try {
        const { productId, sku } = req.params;

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ message: "Product not found" });

        const beforeCount = product.variants.length;

        product.variants = product.variants.filter(
            v => (v.sku || "").toString() !== sku.toString()
        );

        // If no change → sku not found
        if (product.variants.length === beforeCount) {
            return res.status(404).json({ message: "Variant with this SKU not found" });
        }

        // If no variants left → delete whole product
        if (product.variants.length === 0) {
            await product.deleteOne();
            return res.json({
                message: "Variant deleted. No variants left, so product removed as well."
            });
        }

        await product.save();
        res.json({ message: "Variant deleted successfully" });

    } catch (err) {
        console.error("❌ deleteVariant error:", err);
        res.status(500).json({
            message: "Failed to delete variant",
            error: err.message
        });
    }
};


export const deleteProduct = async (req, res) => {
    try {
        const { productId } = req.params;

        const deleted = await Product.findByIdAndDelete(productId);
        if (!deleted) return res.status(404).json({ message: "Product not found" });

        res.json({ message: "Product deleted successfully" });

    } catch (err) {
        console.error("❌ deleteProduct error:", err);
        res.status(500).json({ message: "Failed to delete product", error: err.message });
    }
};


export const updateVariantStock = async (req, res) => {
    try {
        const { productId, sku } = req.params;
        const { warehouseCode, stock } = req.body;

        if (!warehouseCode) {
            return res.status(400).json({ message: "warehouseCode required" });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        // FIND VARIANT BY SKU
        const variant = product.variants.find(v => (v.sku || "").toString() === sku.toString());
        if (!variant) {
            return res.status(404).json({ message: "Variant not found for this SKU" });
        }

        // FIND WAREHOUSE STOCK ENTRY
        let wh = variant.stockByWarehouse.find(w => w.warehouseCode === warehouseCode);

        if (wh) {
            // UPDATE EXISTING
            wh.stock = Number(stock);
        } else {
            // ADD NEW WAREHOUSE ENTRY
            variant.stockByWarehouse.push({
                warehouseCode,
                stock: Number(stock),
            });
        }

        // UPDATE TOTAL STOCK
        variant.stock = variant.stockByWarehouse.reduce(
            (sum, w) => sum + Number(w.stock || 0),
            0
        );

        await product.save();

        res.json({
            message: "Variant stock updated successfully",
            totalStock: variant.stock,
            stockByWarehouse: variant.stockByWarehouse
        });

    } catch (err) {
        console.error("❌ updateVariantStock error:", err);
        res.status(500).json({
            message: "Failed to update variant stock",
            error: err.message
        });
    }
};
