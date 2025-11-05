// queue/shiprocketQueue.js
import Queue from "bull";
import dotenv from "dotenv";

dotenv.config();

// ✅ Prefer single REDIS_URL string (Upstash/Render) or fallback config
const redisConfig = process.env.REDIS_URL
    ? process.env.REDIS_URL
    : {
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
    };

// ✅ Create Shiprocket queue
export const shiprocketQueue = new Queue("shiprocketShipmentQueue", {
    redis: redisConfig,
    defaultJobOptions: {
        attempts: 3, // retry 3 times
        backoff: { type: "exponential", delay: 60000 }, // 1 → 2 → 4 min
        removeOnComplete: true,
        removeOnFail: false,
    },
});

// 🧭 Queue lifecycle logs
shiprocketQueue
    .on("waiting", (jobId) => console.log(`⏳ Waiting job ${jobId}`))
    .on("active", (job) => console.log(`🚀 Processing job ${job.id}`))
    .on("completed", (job) =>
        console.log(`✅ Job ${job.id} done [${job.data.orderId}]`)
    )
    .on("failed", (job, err) =>
        console.error(
            `🔥 Job ${job.id} failed [${job?.data?.orderId}]:`,
            err.message
        )
    )
    .on("error", (err) => console.error("❌ Shiprocket Queue Error:", err));

console.log("📦 Shiprocket Queue initialized successfully");
