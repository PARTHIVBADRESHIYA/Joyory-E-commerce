// migratevariants.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import Product from "../models/Product.js"; // adjust relative path if needed

dotenv.config();

const migrate = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ Connected to MongoDB");

        // Find products that still have variants
        const products = await Product.find({
            variants: { $exists: true, $ne: [] },
        });

        console.log(`🔍 Found ${products.length} products with variants`);

        for (const product of products) {
            // Merge old variants into new variants
            const migratedVariants = product.variants.map((fv) => ({
                sku: fv.sku,
                shadeName: fv.shadeName,
                familyKey: fv.familyKey,
                toneKeys: fv.toneKeys,
                undertoneKeys: fv.undertoneKeys,
                hex: fv.hex,
                lab: fv.lab,
                images: fv.images || [],
                stock: fv.stock ?? 0,
                isActive: fv.isActive ?? true,
                createdAt: fv.createdAt || new Date(),
            }));

            // Assign to new field
            product.variants = [...(product.variants || []), ...migratedVariants];

            // Clear old field
            product.variants = [];

            // Recalculate shadeOptions + colorOptions
            product.shadeOptions = product.variants.map((v) => v.shadeName).filter(Boolean);
            product.colorOptions = product.variants.map((v) => v.hex).filter(Boolean);

            await product.save();
            console.log(`✅ Migrated product: ${product._id}`);
        }

        console.log("🎉 Migration completed successfully!");
        mongoose.connection.close();
    } catch (err) {
        console.error("❌ Migration failed:", err);
        mongoose.connection.close();
    }
};

migrate();
