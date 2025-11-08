// // import { Queue } from "bullmq";
// // import IORedis from "ioredis";

// // // ✅ Use TLS for Upstash Redis
// // const connection = new IORedis(process.env.REDIS_URL, {
// //     tls: {},                     // 👈 Required for secure Upstash connection
// //     maxRetriesPerRequest: null,  // 👈 Prevents BullMQ retry crash
// //     enableReadyCheck: false,     // 👈 Faster connect
// // });

// // export const refundQueue = new Queue("refundQueue", {
// //     connection,
// //     defaultJobOptions: {
// //         attempts: 5,
// //         backoff: { type: "exponential", delay: 30000 }, // retry every 30s
// //     },
// // });


// // middlewares/services/refundQueue.js
// import { Queue, Worker } from "bullmq";
// import { createRedisConnection } from "./redisConnection.js";
// import axios from "axios";
// import Order from "../../models/Order.js";

// const { connection, redisAvailableRef } = createRedisConnection();

// const razorpayAxios = axios.create({
//     baseURL: "https://api.razorpay.com/v1",
//     auth: {
//         username: process.env.RAZORPAY_KEY_ID,
//         password: process.env.RAZORPAY_KEY_SECRET,
//     },
// });

// let refundQueue = null;

// if (redisAvailableRef() && process.env.DISABLE_BULL !== "true") {
//     refundQueue = new Queue("refundQueue", {
//         connection,
//         defaultJobOptions: {
//             attempts: 5,
//             backoff: { type: "exponential", delay: 30000 },
//         },
//     });
//     console.log("✅ Refund Queue initialized");
// } else {
//     console.warn("🚫 Refund Queue disabled (Redis unavailable)");
// }

// export const addRefundJob = async (orderId) => {
//     if (!redisAvailableRef() || process.env.DISABLE_BULL === "true" || !refundQueue) {
//         console.warn(`⚠️ Skipping refund job for ${orderId} due to Redis limit`);
//         return;
//     }
//     await refundQueue.add("refund", { orderId });
// };

// export { refundQueue };
