// scripts/fixVariantsShadeName.js
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Product from "../models/Product.js";

await mongoose.connect(process.env.MONGO_URI);

console.log("🔹 Connected to MongoDB");

// Fetch all products
const products = await Product.find({});
console.log(`🔹 Found ${products.length} products to update.`);

for (const product of products) {
    if (!product.variants || product.variants.length === 0) {
        // No variants exist, create one from product
        const legacyVariant = {
            _id: new mongoose.Types.ObjectId(),
            sku: product.sku ?? `${product._id}-default`,
            shadeName: product.variant || "Default",
            images: product.images || [],
            stock: product.quantity ?? 0,
            originalPrice: product.mrp ?? product.price ?? 0,
            discountedPrice: product.price ?? 0,
            displayPrice: product.price ?? 0,
            discountAmount:
                product.mrp && product.price ? product.mrp - product.price : 0,
            discountPercent:
                product.mrp && product.mrp > product.price
                    ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
                    : 0,
            status: product.quantity > 0 ? "inStock" : "outOfStock",
            message: product.quantity > 0 ? "In-stock" : "No stock available",
            toneKeys: [],
            undertoneKeys: [],
            createdAt: new Date()
        };

        await Product.updateOne(
            { _id: product._id },
            { $push: { variants: legacyVariant } }
        );

        console.log(`✅ Created variant for product: ${product.name}`);
    } else {
        // Variants exist → update shadeName if still "Default"
        const updatedVariants = product.variants.map(v => ({
            ...v.toObject ? v.toObject() : v, // handle Mongoose doc
            shadeName: product.variant || v.shadeName || "Default",
            images: v.images?.length ? v.images : product.images || [],
            stock: v.stock ?? product.quantity ?? 0,
            originalPrice: v.originalPrice ?? product.mrp ?? product.price ?? 0,
            discountedPrice: v.discountedPrice ?? product.price ?? 0,
            displayPrice: v.displayPrice ?? product.price ?? 0,
            discountAmount: product.mrp && product.price ? product.mrp - product.price : 0,
            discountPercent: product.mrp && product.price
                ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
                : 0,
            status: v.status || (product.quantity > 0 ? "inStock" : "outOfStock"),
            message: v.message || (product.quantity > 0 ? "In-stock" : "No stock available")
        }));

        await Product.updateOne(
            { _id: product._id },
            { $set: { variants: updatedVariants } }
        );

        console.log(`🔹 Updated variants for product: ${product.name}`);
    }
}

console.log("🎉 All products updated successfully!");
await mongoose.disconnect();
