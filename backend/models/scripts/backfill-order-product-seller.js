// models/scripts/backfill-order-product-seller.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import Order from "../../models/Order.js";
import Product from "../../models/Product.js";

// ✅ Load environment variables from .env
dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("❌ MONGO_URI is not defined. Please check your .env file.");
    process.exit(1);
}

const run = async () => {
    try {
        // ✅ Connect to MongoDB
        await mongoose.connect(MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ Connected to MongoDB");

        // 🔍 Find orders missing seller info in products
        const cursor = Order.find({ "products.seller": { $exists: false } }).cursor();

        let updatedCount = 0;

        for (
            let order = await cursor.next();
            order != null;
            order = await cursor.next()
        ) {
            let changed = false;

            for (const p of order.products) {
                if (!p.seller && p.productId) {
                    const prod = await Product.findById(p.productId).select("seller");
                    if (prod) {
                        p.seller = prod.seller || null;
                        changed = true;
                    }
                }
            }

            if (changed) {
                await order.save();
                updatedCount++;
                console.log(`✅ Updated order ${order._id}`);
            }
        }

        console.log(`🎉 Done! ${updatedCount} orders updated.`);
        process.exit(0);
    } catch (err) {
        console.error("🔥 Error during backfill:", err);
        process.exit(1);
    }
};

run();
