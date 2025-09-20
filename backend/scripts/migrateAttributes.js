// migrateVariants.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import Product from "../models/Product.js"; // adjust path if needed

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

const migrateProducts = async () => {
    try {
        await mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ Connected to MongoDB");

        const products = await Product.find({});
        console.log(`Found ${products.length} products`);

        for (const product of products) {
            let updatedVariants = [];

            if (product.variants && product.variants.length > 0) {
                const activeVariants = product.variants.filter(v => v.isActive !== false);
                const splitSales = activeVariants.length > 0
                    ? Math.floor(product.sales / activeVariants.length)
                    : 0;

                updatedVariants = product.variants.map(v => ({
                    ...v.toObject ? v.toObject() : v,
                    thresholdValue: v.thresholdValue || product.thresholdValue || 10,
                    sales: v.sales || splitSales,
                }));

                product.sales = updatedVariants.reduce((sum, v) => sum + (v.sales || 0), 0);
            } else {
                // Non-variant product: thresholdValue stays on parent
                product.thresholdValue = product.thresholdValue || 10;
            }

            product.variants = updatedVariants;

            await product.save();
            console.log(`✅ Product "${product.name}" migrated`);
        }

        console.log("🎉 Migration complete");
        process.exit(0);

    } catch (err) {
        console.error("❌ Migration failed", err);
        process.exit(1);
    }
};

migrateProducts();
