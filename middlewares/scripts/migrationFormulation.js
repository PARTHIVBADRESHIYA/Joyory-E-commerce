import mongoose from "mongoose";
import dotenv from "dotenv";
import Product from "../../models/Product.js";
import Formulation from "../../models/shade/Formulation.js";

dotenv.config();

const migrateFormulations = async () => {
    try {
        // 1. Connect to DB
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ MongoDB connected for migration");

        // 2. Fetch all products with old string formulation
        const products = await Product.find({ formulation: { $type: "string" } });
        console.log(`Found ${products.length} products with string formulation`);

        for (const product of products) {
            if (!product.formulation) continue;

            // 3. Check if a formulation exists with that key
            let formulationDoc = await Formulation.findOne({ key: product.formulation });

            // If not exists → create it
            if (!formulationDoc) {
                formulationDoc = await Formulation.create({
                    key: product.formulation,
                    name: product.formulation.charAt(0).toUpperCase() + product.formulation.slice(1),
                    order: 999, // fallback order
                });
                console.log(`🆕 Created formulation: ${formulationDoc.key}`);
            }

            // 4. Update product to reference formulation _id
            product.formulation = formulationDoc._id;
            await product.save();
            console.log(`✔ Migrated product ${product.name}`);
        }

        console.log("🎉 Migration completed successfully");
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration failed:", err);
        process.exit(1);
    }
};

migrateFormulations();
