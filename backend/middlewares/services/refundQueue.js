import { Queue } from "bullmq";
import IORedis from "ioredis";

// ✅ Use TLS for Upstash Redis
const connection = new IORedis(process.env.REDIS_URL, {
    tls: {},                     // 👈 Required for secure Upstash connection
    maxRetriesPerRequest: null,  // 👈 Prevents BullMQ retry crash
    enableReadyCheck: false,     // 👈 Faster connect
});

export const refundQueue = new Queue("refundQueue", {
    connection,
    defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 30000 }, // retry every 30s
    },
});
