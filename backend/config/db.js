// import mongoose from 'mongoose';
// const connectDB = async () => {
//     try {
//         const conn = await mongoose.connect(process.env.MONGO_URI, {
//         });
//         console.log(`MongoDB Connected`);

//         mongoose.set("strictQuery", false);

//     } catch (error) {
//         console.error(`Error: ${error.message}`);
//         process.exit(1); // Exit on failure
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
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 30000,
        });

        isConnected = true;
        console.log("✅ MongoDB Connected");
    } catch (error) {
        console.error("❌ Mongo error:", error.message);
        process.exit(1);
    }
};


export default connectDB;
