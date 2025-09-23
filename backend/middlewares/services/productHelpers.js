// helpers/productHelpers.js
import { buildOptions } from "../../controllers/user/userProductController.js"; // your existing buildOptions logic

/**
 * Adds stock status, messages, and shade/color options to a product.
 * Handles both variant-level and global stock exactly like getSingleProduct.
 */
export const enrichProductWithStockAndOptions = (product) => {
    // Shade and color options
    const shadeOptions = buildOptions(product).shadeOptions;
    const colorOptions = buildOptions(product).colorOptions;

    if (product.variants?.length) {
        // Variant-level stock info
        product.variants = product.variants.map((v) => {
            let status, message;

            if (v.stock === 0) {
                status = "outOfStock";
                message = "No stock available now, please try again later";
            } else if (v.stock < (v.thresholdValue || 5)) {
                status = "lowStock";
                message = `Few left (${v.stock})`;
            } else {
                status = "inStock";
                message = "In-stock";
            }

            return { ...v, status, message };
        });

        // Remove global stock info when variants exist
        delete product.quantity;
        delete product.status;
        delete product.message;
    } else {
        // Global product-level stock info
        let status, message;

        if (product.quantity === 0) {
            status = "outOfStock";
            message = "No stock available now, please try again later";
        } else if (product.quantity < (product.thresholdValue || 5)) {
            status = "lowStock";
            message = `Few left (${product.quantity})`;
        } else {
            status = "inStock";
            message = "In-stock";
        }

        product.status = status;    // ✅ for non-variant products
        product.message = message;  // ✅ for non-variant products
    }

    return { ...product, shadeOptions, colorOptions };
};


