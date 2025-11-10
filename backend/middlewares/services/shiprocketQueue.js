import Queue from "bull";
import dotenv from "dotenv";
import { createRedisConnection } from "./redisConnection.js";
dotenv.config();

// Create Bull-compatible Redis clients
const client = createRedisConnection(true);
const subscriber = createRedisConnection(true);
const defaultConnection = createRedisConnection();

export const shiprocketQueue = new Queue("shiprocketShipmentQueue", {
    createClient: (type) => {
        switch (type) {
            case "client":
                return client;
            case "subscriber":
                return subscriber;
            default:
                return defaultConnection;
        }
    },
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 60000 },
        removeOnComplete: true,
        removeOnFail: false,
    },
});

shiprocketQueue
    .on("waiting", (jobId) => console.log(`⏳ Waiting job ${jobId}`))
    .on("active", (job) => console.log(`🚀 Processing job ${job.id}`))
    .on("completed", (job) =>
        console.log(`✅ Job ${job.id} done [${job.data.orderId}]`)
    )
    .on("failed", (job, err) =>
        console.error(`🔥 Job ${job.id} failed [${job?.data?.orderId}]:`, err.message)
    )
    .on("error", (err) => console.error("❌ Shiprocket Queue Error:", err.message));

console.log("📦 Shiprocket Queue initialized successfully");
