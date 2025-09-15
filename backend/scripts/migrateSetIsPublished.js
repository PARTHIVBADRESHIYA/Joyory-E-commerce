import mongoose from "mongoose";
import Product from "../models/Product.js"; // adjust path to your Product model

// ✅ Update with your DB connection string
const MONGO_URI = "mongodb+srv://parthivbadreshiya:parthiv12345@cluster0.silkevx.mongodb.net/joyory?retryWrites=true&w=majority&appName=Cluster0";

const runMigration = async () => {
    try {
        await mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log("✅ Connected to MongoDB");

        const result = await Product.updateMany(
            {},
            { $set: { isPublished: true } }
        );

        console.log(`✅ Migration complete. Updated ${result.modifiedCount} products.`);

        await mongoose.disconnect();
        console.log("🔌 Disconnected from MongoDB");
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration failed:", err);
        process.exit(1);
    }
};

runMigration();
