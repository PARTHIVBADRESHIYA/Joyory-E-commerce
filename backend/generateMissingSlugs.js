// scripts/generateMissingSlugs.js

import mongoose from "mongoose";
import dotenv from "dotenv";
import Product from "./models/Product.js";
import { generateUniqueSlug } from "./middlewares/utils/slug.js";

dotenv.config();

async function generateSlugsForExistingProducts() {
    try {
        // ✅ Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ Connected to MongoDB");

        // 🧾 Find products with no slug
        const productsWithoutSlug = await Product.find({
            $or: [{ slug: { $exists: false } }, { slug: "" }],
        });

        if (!productsWithoutSlug.length) {
            console.log("🎉 All products already have slugs.");
            process.exit(0);
        }

        console.log(`🧱 Found ${productsWithoutSlug.length} products missing slugs.`);

        let count = 0;

        for (const product of productsWithoutSlug) {
            const newSlug = await generateUniqueSlug(Product, product.name);
            await Product.findByIdAndUpdate(product._id, { slug: newSlug });
            console.log(`✅ ${product.name} → ${newSlug}`);
            count++;
        }

        console.log(`✨ Done! ${count} products updated with new slugs.`);
        process.exit(0);
    } catch (error) {
        console.error("❌ Error generating slugs:", error);
        process.exit(1);
    }
}

generateSlugsForExistingProducts();
