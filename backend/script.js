import Queue from "bull";
import Redis from "ioredis";
import dotenv from "dotenv";
dotenv.config();

// ✅ Create Redis connection (NO TLS)
const redisConnection = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});

// ✅ Create the Shiprocket queue
export const shiprocketQueue = new Queue("shiprocketShipmentQueue", {
    createClient: function (type) {
        switch (type) {
            case "client":
                return redisConnection;
            case "subscriber":
                return redisConnection.duplicate();
            default:
                return redisConnection.duplicate();
        }
    },
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 60000 },
        removeOnComplete: true,
        removeOnFail: false,
    },
});

// 🧭 Logs
shiprocketQueue
    .on("waiting", (jobId) => console.log(`⏳ Waiting job ${jobId}`))
    .on("active", (job) => console.log(`🚀 Processing job ${job.id}`))
    .on("completed", (job) =>
        console.log(`✅ Job ${job.id} done [${job.data.orderId}]`)
    )
    .on("failed", (job, err) =>
        console.error(`🔥 Job ${job.id} failed [${job?.data?.orderId}]:`, err.message)
    )
    .on("error", (err) => console.error("❌ Shiprocket Queue Error:", err));

console.log("📦 Shiprocket Queue initialized successfully");
