import mongoose from "mongoose";
import dotenv from "dotenv";
import Product from "../../models/Product.js";

dotenv.config();

const runMigration = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log("✅ Connected to MongoDB");

        // Remove "formulation" field from all products
        const result = await Product.updateMany(
            { formulation: { $exists: true } },
            { $unset: { formulation: "" } }
        );

        console.log(`✅ Migration complete. ${result.modifiedCount} products updated.`);

        await mongoose.disconnect();
        console.log("✅ Disconnected from MongoDB");
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration failed:", err);
        process.exit(1);
    }
};

runMigration();
