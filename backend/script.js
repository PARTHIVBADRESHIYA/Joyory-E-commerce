import mongoose from "mongoose";
import Product from "./models/Product.js";
import dotenv from "dotenv";
dotenv.config();

const migrateSkinTypes = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("MongoDB connected ✅");

        const products = await Product.find({ skinTypes: { $exists: true, $ne: [] } });

        for (const product of products) {
            // ✅ Convert to ObjectId correctly
            const converted = product.skinTypes.map(id => new mongoose.mongo.ObjectId(id));
            product.skinTypes = converted;
            await product.save();
            console.log(`Migrated product ${product._id}`);
        }

        console.log("Migration done ✅");
        process.exit();
    } catch (err) {
        console.error("Migration error ❌", err);
        process.exit(1);
    }
};

migrateSkinTypes();
