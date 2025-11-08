// // workers/shiprocketWorker.js
// import dotenv from "dotenv";
// import mongoose from "mongoose";
// import { shiprocketQueue } from "../../middlewares/services/shiprocketQueue.js";
// import { createShiprocketOrder } from "../../middlewares/services/shiprocket.js";
// import Order from "../../models/Order.js";

// dotenv.config();

// // ✅ MongoDB connection (for worker)
// mongoose
//     .connect(process.env.MONGO_URI, {
//         useNewUrlParser: true,
//         useUnifiedTopology: true,
//     })
//     .then(() => console.log("✅ MongoDB connected for Shiprocket Worker"))
//     .catch((err) => console.error("❌ MongoDB Connection Failed:", err));

// /**
//  * 🧠 Main Worker Job Processor
//  * Handles retries, network failures, and DB consistency
//  */
// shiprocketQueue.process(async (job, done) => {
//     const { orderId } = job.data;
//     console.log(`🚚 [Worker] Starting Shiprocket processing for Order ${orderId}`);

//     try {
//         const order = await Order.findById(orderId)
//             .populate("user")
//             .populate("products.productId");

//         if (!order) throw new Error("Order not found");

//         // 🧾 Try Shiprocket API
//         const result = await createShiprocketOrder(order);

//         if (!result?.shipmentDetails) {
//             throw new Error("Shiprocket did not return shipment details");
//         }

//         // ✅ Update order with shipment info
//         order.shipment = result.shipmentDetails;
//         order.orderStatus = result.shipmentDetails.status || "Shipment Created";
//         order.trackingHistory = order.trackingHistory || [];
//         order.trackingHistory.push({
//             status: "Shipment Created",
//             timestamp: new Date(),
//             location: "Shiprocket",
//         });

//         await order.save();
//         console.log(`✅ [Worker] Shipment created successfully for Order ${orderId}`);
//         return done(null, result);

//     } catch (err) {
//         console.error(`❌ [Worker] Error for Order ${orderId}:`, err.message);

//         // Log network-type issues explicitly
//         if (["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED"].includes(err.code)) {
//             console.warn(`⚠️ Network issue with Shiprocket for Order ${orderId}: ${err.code}`);
//         }

//         return done(err);
//     }
// });

// /**
//  * ♻️ Retry handler (fires automatically after each failed attempt)
//  */
// shiprocketQueue.on("failed", async (job, err) => {
//     const orderId = job?.data?.orderId;
//     console.warn(`⚠️ [Worker] Retry attempt ${job.attemptsMade} for Order ${orderId}`);

//     // After max retries, mark order as failed
//     if (job.attemptsMade >= 3) {
//         await Order.updateOne(
//             { _id: orderId },
//             {
//                 $push: {
//                     trackingHistory: {
//                         status: "Shipment Creation Failed (Max Retries)",
//                         reason: err.message,
//                         timestamp: new Date(),
//                         location: "Shiprocket Worker",
//                     },
//                 },
//                 "shipment.status": "Shipment Creation Failed",
//             }
//         );
//         console.error(`🚨 [Worker] Max retries reached for Order ${orderId}`);
//     }
// });

// console.log("👷 Shiprocket Worker running and waiting for jobs...");



// workers/shiprocketWorker.js
import mongoose from "mongoose";
import { shiprocketQueue } from "../../middlewares/services/shiprocketQueue.js";
import { createShiprocketOrder } from "../../middlewares/services/shiprocket.js";
import Order from "../../models/Order.js";

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log("✅ MongoDB connected for Shiprocket Worker"))
    .catch((err) => console.error("❌ MongoDB Connection Failed:", err));

shiprocketQueue.process(async (job, done) => {
    if (!job) return;

    const { orderId } = job.data;
    console.log(`🚚 [Worker] Starting Shiprocket processing for Order ${orderId}`);

    try {
        const order = await Order.findById(orderId)
            .populate("user")
            .populate("products.productId");

        if (!order) throw new Error("Order not found");

        const result = await createShiprocketOrder(order);
        if (!result?.shipmentDetails) throw new Error("Shiprocket did not return shipment details");

        order.shipment = result.shipmentDetails;
        order.orderStatus = result.shipmentDetails.status || "Shipment Created";
        order.trackingHistory = order.trackingHistory || [];
        order.trackingHistory.push({
            status: "Shipment Created",
            timestamp: new Date(),
            location: "Shiprocket",
        });
        await order.save();

        console.log(`✅ [Worker] Shipment created successfully for Order ${orderId}`);
        return done(null, result);

    } catch (err) {
        console.error(`❌ [Worker] Error for Order ${orderId}:`, err.message);
        return done(err);
    }
});

shiprocketQueue.on("failed", async (job, err) => {
    if (!job) return;
    const orderId = job?.data?.orderId;

    console.warn(`⚠️ [Worker] Retry attempt ${job.attemptsMade} for Order ${orderId}`);

    if (job.attemptsMade >= 3) {
        await Order.updateOne(
            { _id: orderId },
            {
                $push: {
                    trackingHistory: {
                        status: "Shipment Creation Failed (Max Retries)",
                        reason: err.message,
                        timestamp: new Date(),
                        location: "Shiprocket Worker",
                    },
                },
                "shipment.status": "Shipment Creation Failed",
            }
        );
        console.error(`🚨 [Worker] Max retries reached for Order ${orderId}`);
    }
});
