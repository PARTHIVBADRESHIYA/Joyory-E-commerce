import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
import Order from "./models/Order.js";

async function run() {
    await mongoose.connect(process.env.MONGO_URI, { /* options */ });
    console.log("Connected to mongo");

    const cursor = Order.find({}).cursor();
    let updated = 0;
    for await (const o of cursor) {
        let changed = false;
        if (!o.refund) { o.refund = {}; changed = true; }
        if (!o.cancellation) { o.cancellation = {}; changed = true; }
        if (changed) {
            await o.save();
            updated++;
        }
    }
    console.log("Updated orders:", updated);
    await mongoose.disconnect();
}
run().catch(err => { console.error(err); process.exit(1); });