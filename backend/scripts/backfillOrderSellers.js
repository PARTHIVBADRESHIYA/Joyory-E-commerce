// scripts/backfillOrderSellers.js
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import Order from "../models/Order.js";
import Product from "../models/Product.js";

(async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {});
        console.log("✅ Connected to MongoDB");

        const cursor = Order.find({}).cursor();
        let processed = 0;
        let updated = 0;
        let bulkOps = [];

        for (let order = await cursor.next(); order != null; order = await cursor.next()) {
            let changed = false;

            // 1. Fix products[].seller
            for (let p of order.products || []) {
                if (!p.seller && p.productId) {
                    const prod = await Product.findById(p.productId).select("seller").lean();
                    if (prod && prod.seller) {
                        p.seller = prod.seller;
                        changed = true;
                    }
                }
            }

            // 2. Fix splitOrders[].seller and items
            for (let so of order.splitOrders || []) {
                if ((!so.seller || so.seller === null) && so.items?.length) {
                    const firstItem = so.items[0];
                    if (firstItem?.productId) {
                        const prod = await Product.findById(firstItem.productId).select("seller").lean();
                        if (prod && prod.seller) {
                            so.seller = prod.seller; // assign seller at split order level
                            for (let item of so.items) {
                                if (!item.seller) item.seller = prod.seller; // ensure item has seller too
                            }
                            changed = true;
                        }
                    }
                }
            }

            if (changed) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: order._id },
                        update: { $set: { products: order.products, splitOrders: order.splitOrders } }
                    }
                });
                updated++;
            }

            processed++;

            if (bulkOps.length >= 200) {
                await Order.bulkWrite(bulkOps);
                console.log(`📦 Flushed 200 updates`);
                bulkOps = [];
            }
        }

        if (bulkOps.length) await Order.bulkWrite(bulkOps);

        console.log(`🎉 Migration complete. Processed=${processed}, Updated=${updated}`);
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration failed:", err);
        process.exit(1);
    }
})();
