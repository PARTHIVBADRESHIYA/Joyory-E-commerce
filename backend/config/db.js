


// import mongoose from "mongoose";

// let isConnected = false;

// const connectDB = async () => {
//     if (isConnected) return;

//     try {
//         mongoose.set("strictQuery", false);

//         await mongoose.connect(process.env.MONGO_URI, {
//             maxPoolSize: 10,
//             minPoolSize: 3,         // 🔥 Keep 3 alive (enough for warmup)
//             serverSelectionTimeoutMS: 30000,
//         });

//         isConnected = true;
//         console.log("✅ MongoDB Connected");
//     } catch (error) {
//         console.error("❌ Mongo error:", error.message);
//         process.exit(1);
//     }
// };


// export default connectDB;



import mongoose from "mongoose";

let isConnected = false;

const connectDB = async () => {
    if (isConnected) return;

    try {
        mongoose.set("strictQuery", false);

        await mongoose.connect(process.env.MONGO_URI, {
            maxPoolSize: 20,        // 🔥 Increased from 10
            minPoolSize: 5,         // 🔥 NEW - keeps 5 connections alive
            serverSelectionTimeoutMS: 15000,  // 🔥 Reduced from 30000 (faster failure detection)
            socketTimeoutMS: 60000,  // 🔥 NEW - prevents hanging connections
        });

        isConnected = true;
        console.log("✅ MongoDB Connected");
    } catch (error) {
        console.error("❌ Mongo error:", error.message);
        process.exit(1);
    }
};

export default connectDB;