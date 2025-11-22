// services/warehouseAllocator.js
import Product from "../../models/Product.js";
import Brand from "../../models/Brand.js";

/**
 * Choose a pickup warehouse for a single product item:
 * - productItem: one item from txOrder.products
 * - qty: required quantity
 * Returns array of allocations: [{ warehouseCode, qty }]
 */
export async function allocateWarehouseForItem(productItem, qty = 1) {
    // productItem.productId may be populated or just id
    const product = await Product.findById(productItem.productId).lean();
    if (!product) throw new Error("Product not found when allocating warehouse");

    // get brand (populated or id)
    const brandDoc = await Brand.findById(product.brand).lean();
    if (!brandDoc) {
        // fallback to global warehouse
        const fallback = process.env.SHIPROCKET_PICKUP;
        return [{ warehouseCode: fallback, qty }];
    }

    const brandWarehouses = brandDoc.warehouses || [];
    const primaryCode = brandDoc.primaryWarehouse || null;
    const allocations = [];

    // Helper to check available qty at warehouse for this variant
    const getStockAtWarehouse = (variant, warehouseCode) => {
        if (Array.isArray(variant.stockByWarehouse) && variant.stockByWarehouse.length) {
            const rec = variant.stockByWarehouse.find(w => String(w.warehouseCode) === String(warehouseCode));
            return rec ? Number(rec.stock) : 0;
        }
        // fallback to legacy variant.stock (global)
        return Number(variant.stock || 0);
    };

    // variant lookup
    const variantSku = productItem.variant?.sku;
    let variant = null;
    if (variantSku) {
        variant = product.variants.find(v => String(v.sku) === String(variantSku));
    }
    if (!variant) variant = product.variants?.[0];

    if (!variant) {
        throw new Error(`Variant not found for product ${product._id}`);
    }

    // 1) check primary warehouse
    if (primaryCode) {
        const avail = getStockAtWarehouse(variant, primaryCode);
        if (avail >= qty) return [{ warehouseCode: primaryCode, qty }];
    }

    // 2) check other brand warehouses (first one with enough)
    for (const w of brandWarehouses) {
        const code = w.code || w.warehouseCode || w; // adapt if structure varies
        if (!code || code === primaryCode) continue;
        const avail = getStockAtWarehouse(variant, code);
        if (avail >= qty) return [{ warehouseCode: code, qty }];
    }

    // 3) try split across brand warehouses (partial allocation)
    let remaining = qty;
    for (const w of brandWarehouses) {
        const code = w.code || w.warehouseCode || w;
        const avail = getStockAtWarehouse(variant, code);
        if (avail <= 0) continue;
        const take = Math.min(avail, remaining);
        allocations.push({ warehouseCode: code, qty: take });
        remaining -= take;
        if (remaining <= 0) break;
    }

    if (remaining <= 0) return allocations;

    // 4) fallback to global/default warehouse
    const fallback = process.env.DEFAULT_PICKUP_LOCATION;
    if (fallback) {
        // assume fallback has infinite or global stock (or do similar checks)
        allocations.push({ warehouseCode: fallback, qty: remaining });
        remaining = 0;
    }

    if (remaining > 0) {
        // Not enough stock across warehouses
        // Return partial allocation + remaining >0 flagged by throwing or by returning partial
        return allocations; // caller should detect remaining not allocated
    }

    return allocations;
}

export async function allocateWarehousesForOrder(txOrder) {
    const allocationsMap = {}; // e.g. allocationsMap[itemIndex] = [{warehouseCode, qty}, ...]
    for (let i = 0; i < txOrder.products.length; i++) {
        const item = txOrder.products[i];
        const qty = Number(item.quantity || 0);
        const allocation = await allocateWarehouseForItem(item, qty);

        // compute allocatedQty to detect remaining
        const allocatedQty = allocation.reduce((s, a) => s + (a.qty || 0), 0);
        if (allocatedQty < qty) {
            // throw or mark insufficient - I recommend throwing so admin knows to resolve backorder
            throw new Error(`Insufficient stock for product ${item.productId} (requested ${qty}, allocated ${allocatedQty})`);
        }

        allocationsMap[i] = allocation;
    }
    return allocationsMap;
}
