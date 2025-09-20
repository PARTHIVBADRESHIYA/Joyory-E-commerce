// repairAttributes.js
import dotenv from "dotenv";
import mongoose from "mongoose";
import ProductAttribute from "../models/ProductAttribute.js";

dotenv.config();
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("❌ Missing MONGO_URI in .env");
    process.exit(1);
}

const repair = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected to MongoDB");

        const attributes = await ProductAttribute.find();

        for (let attr of attributes) {
            if ((!attr.categoryOptions || attr.categoryOptions.length === 0) &&
                attr.categories?.length && attr.options?.length) {

                console.log(`⚡ Repairing: ${attr.name}`);

                attr.categoryOptions = attr.categories.map(cat => ({
                    category: cat,
                    options: attr.options
                }));

                // remove old fields
                attr.set("options", undefined, { strict: false });
                attr.set("categories", undefined, { strict: false });

                await attr.save();
                console.log(`✅ Fixed: ${attr.name}`);
            }
        }

        console.log("🎉 Repair completed!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Repair failed", err);
        process.exit(1);
    }
};

repair();
