// // helpers/productHelpers.js
// import { buildOptions } from "../../controllers/user/userProductController.js"; // your existing buildOptions logic

// /**
//  * Adds stock status, messages, and shade/color options to a product.
//  * Handles both variant-level and global stock exactly like getSingleProduct.
//  */
// // export const enrichProductWithStockAndOptions = (product) => {
// //     // Shade and color options
// //     const shadeOptions = buildOptions(product).shadeOptions;
// //     const colorOptions = buildOptions(product).colorOptions;

// //     if (product.variants?.length) {
// //         // Variant-level stock info
// //         product.variants = product.variants.map((v) => {
// //             let status, message;

// //             if (v.stock === 0) {
// //                 status = "outOfStock";
// //                 message = "No stock available now, please try again later";
// //             } else if (v.stock < (v.thresholdValue || 5)) {
// //                 status = "lowStock";
// //                 message = `Few left (${v.stock})`;
// //             } else {
// //                 status = "inStock";
// //                 message = "In-stock";
// //             }

// //             return { ...v, status, message };
// //         });

// //         // Remove global stock info when variants exist
// //         delete product.quantity;
// //         delete product.status;
// //         delete product.message;
// //     } else {
// //         // Global product-level stock info
// //         let status, message;

// //         if (product.quantity === 0) {
// //             status = "outOfStock";
// //             message = "No stock available now, please try again later";
// //         } else if (product.quantity < (product.thresholdValue || 5)) {
// //             status = "lowStock";
// //             message = `Few left (${product.quantity})`;
// //         } else {
// //             status = "inStock";
// //             message = "In-stock";
// //         }

// //         product.status = status;    // ✅ for non-variant products
// //         product.message = message;  // ✅ for non-variant products
// //     }

// //     return { ...product, shadeOptions, colorOptions };
// // };


// // export const enrichProductWithStockAndOptions = (product) => {
// //     const { shadeOptions, colorOptions } = buildOptions(product);

// //     if (product.variants?.length) {
// //         product.variants = product.variants.map(v => {
// //             let status, message;

// //             if (v.stock === 0) {
// //                 status = "outOfStock";
// //                 message = "No stock available now, please try again later";
// //             } else if (v.stock < (v.thresholdValue || 5)) {
// //                 status = "lowStock";
// //                 message = `Few left (${v.stock})`;
// //             } else {
// //                 status = "inStock";
// //                 message = "In-stock";
// //             }

// //             return { ...v, status, message };
// //         });

// //         delete product.quantity;
// //         delete product.status;
// //         delete product.message;
// //     } else {
// //         let status, message;
// //         if (product.quantity === 0) {
// //             status = "outOfStock";
// //             message = "No stock available now, please try again later";
// //         } else if (product.quantity < (product.thresholdValue || 5)) {
// //             status = "lowStock";
// //             message = `Few left (${product.quantity})`;
// //         } else {
// //             status = "inStock";
// //             message = "In-stock";
// //         }

// //         product.status = status;
// //         product.message = message;
// //     }

// //     return { ...product, shadeOptions, colorOptions };
// // };
// export const enrichProductWithStockAndOptions = (product) => {
//     const { shadeOptions, colorOptions } = buildOptions(product);

//     if (product.variants?.length) {
//         // Variant-based product
//         product.variants = product.variants.map(v => {
//             let status, message;

//             if (v.stock === 0) {
//                 status = "outOfStock";
//                 message = "No stock available now, please try again later";
//             } else if (v.stock < (v.thresholdValue || 5)) {
//                 status = "lowStock";
//                 message = `Few left (${v.stock})`;
//             } else {
//                 status = "inStock";
//                 message = "In-stock";
//             }

//             return { ...v, status, message };
//         });

//         // ❌ Remove any global stock fields for variant products
//         return {
//             ...product,
//             variants: product.variants,
//             shadeOptions,
//             colorOptions
//         };
//     } else {
//         // Simple product (no variants) → add global stock fields
//         let status, message;
//         if (product.quantity === 0) {
//             status = "outOfStock";
//             message = "No stock available now, please try again later";
//         } else if (product.quantity < (product.thresholdValue || 5)) {
//             status = "lowStock";
//             message = `Few left (${product.quantity})`;
//         } else {
//             status = "inStock";
//             message = "In-stock";
//         }

//         return {
//             ...product,
//             status,
//             message,
//             shadeOptions,
//             colorOptions
//         };
//     }
// };







// helpers/productHelpers.js
import { buildOptions } from "../../controllers/user/userProductController.js";
import { productMatchesPromo } from "../../controllers/user/userPromotionController.js";

/**
 * Enrich product with:
 * 1. Stock status & messages
 * 2. Shade/color options
 * 3. Variant-level discounted price (if promotions exist)
 * 
 * Existing logic remains unchanged for stock/status.
 */
export const enrichProductWithStockAndOptions = (product, promotions = []) => {
    const { shadeOptions, colorOptions } = buildOptions(product);
    const globalOriginalPrice = Number(product.price ?? 0);

    // Normalize variants array
    let variants = [];
    if (Array.isArray(product.variants) && product.variants.length > 0) {
        variants = product.variants.map(v => {
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

            const variantBasePrice = Number(v.discountedPrice ?? v.price ?? globalOriginalPrice);
            let displayPrice = variantBasePrice;

            // Apply promotions
            for (const promo of promotions) {
                if (!productMatchesPromo(product, promo)) continue;
                if (promo.promotionType !== "discount") continue;
                const val = Number(promo.discountValue || 0);
                if (promo.discountUnit === "percent" && val > 0) {
                    displayPrice = Math.round(variantBasePrice * (1 - val / 100));
                } else if (promo.discountUnit === "amount" && val > 0) {
                    displayPrice = Math.max(0, variantBasePrice - val);
                }
            }

            const discountPercent = globalOriginalPrice > displayPrice
                ? Math.round(((globalOriginalPrice - displayPrice) / globalOriginalPrice) * 100)
                : 0;

            return {
                ...v,
                shadeName: v.shadeName || product.variant || "Default",
                status,
                message,
                originalPrice: globalOriginalPrice,
                displayPrice,
                discountPercent: discountPercent > 0 ? `${discountPercent}% off` : "0"
            };
        });
    } else {
        // Single variant fallback
        const singleVariant = {
            sku: product.sku ?? `${product._id}-default`,
            shadeName: product.variant || "Default",
            images: product.images || [],
            stock: product.quantity ?? 0,
            sales: product.sales ?? 0,
            thresholdValue: product.thresholdValue ?? 0,
            isActive: true,
            toneKeys: [],
            undertoneKeys: [],
            originalPrice: product.mrp ?? product.price ?? 0,
            discountedPrice: product.price ?? 0,
            displayPrice: product.price ?? 0,
            discountAmount: (product.mrp && product.price) ? product.mrp - product.price : 0,
            discountPercent: (product.mrp && product.mrp > product.price)
                ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
                : 0,
            status: product.quantity > 0 ? "inStock" : "outOfStock",
            message: product.quantity > 0 ? "In-stock" : "No stock available"
        };

        // Apply promotions
        for (const promo of promotions) {
            if (!productMatchesPromo(product, promo)) continue;
            if (promo.promotionType !== "discount") continue;
            const val = Number(promo.discountValue || 0);
            if (promo.discountUnit === "percent" && val > 0) {
                singleVariant.displayPrice = Math.round(singleVariant.displayPrice * (1 - val / 100));
            } else if (promo.discountUnit === "amount" && val > 0) {
                singleVariant.displayPrice = Math.max(0, singleVariant.displayPrice - val);
            }
        }

        variants = [singleVariant];
    }

    return {
        ...product,
        variants,
        shadeOptions,
        colorOptions,
        selectedVariant: variants[0] || null,
        variant: variants[0]?.shadeName || product.variant || null
    };
};



