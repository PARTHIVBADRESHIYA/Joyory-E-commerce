// scripts/fix-customOrderIndex.js
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL;
if (!MONGO_URI) {
    console.error("MONGO_URI not set in environment. Add to .env and retry.");
    process.exit(1);
}

async function main() {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, {});

    const coll = mongoose.connection.db.collection("orders");

    console.log("\nCurrent indexes:");
    console.log(await coll.indexes());

    // If index exists, drop it
    const indexes = await coll.indexes();
    const hasCustomIdx = indexes.find(i => i.name === "customOrderId_1");
    if (hasCustomIdx) {
        console.log("\nDropping index: customOrderId_1");
        try {
            await coll.dropIndex("customOrderId_1");
            console.log("✅ Dropped customOrderId_1");
        } catch (err) {
            console.error("❌ dropIndex failed:", err.message);
        }
    } else {
        console.log("\nNo customOrderId_1 index found (good).");
    }

    // Unset documents that currently have customOrderId === null or "" (these cause issues)
    const query = { $or: [{ customOrderId: { $exists: true, $eq: null } }, { customOrderId: "" }] };
    const count = await coll.countDocuments(query);
    console.log(`\nDocuments with customOrderId null/empty: ${count}`);
    if (count > 0) {
        const res = await coll.updateMany(query, { $unset: { customOrderId: "" } });
        console.log(`✅ Unset customOrderId on ${res.modifiedCount} documents`);
    } else {
        console.log("No documents to unset.");
    }

    // Optionally recreate sparse unique index if user passes --sparse
    const createSparse = process.argv.includes("--sparse");
    if (createSparse) {
        console.log("\nCreating sparse unique index customOrderId_1 (only indexes docs where field exists)...");
        try {
            await coll.createIndex({ customOrderId: 1 }, { unique: true, sparse: true, name: "customOrderId_1" });
            console.log("✅ Created sparse unique index customOrderId_1");
        } catch (err) {
            console.error("❌ createIndex failed:", err.message);
        }
    } else {
        console.log("\nSkipping creation of new index (no --sparse flag).");
    }

    console.log("\nFinal indexes:");
    console.log(await coll.indexes());

    await mongoose.disconnect();
    console.log("\nDone. Restart your server and retry creating orders.");
    process.exit(0);
}

main().catch(err => {
    console.error("Script failed:", err);
    process.exit(1);
});
