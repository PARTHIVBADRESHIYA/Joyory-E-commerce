// deleteDraftOrders.js
import mongoose from "mongoose";
import Order from "./models/Order.js"; // <-- Update path if needed

const MONGO_URI="mongodb+srv://parthivbadreshiya:parthiv12345@cluster0.silkevx.mongodb.net/joyory?retryWrites=true&w=majority&appName=Cluster0"

const start = async () => {
    try {
        console.log("⏳ Connecting to MongoDB...");
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected!");

        const result = await Order.deleteMany({ isDraft: true });

        console.log(`🚮 Deleted Draft Orders: ${result.deletedCount}`);
        console.log("🎉 Completed!");

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
};

start();
