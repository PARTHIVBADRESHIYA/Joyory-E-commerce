// // // queue/shiprocketQueue.js
// // import Queue from "bull";
// // import Redis from "ioredis";
// // import dotenv from "dotenv";
// // dotenv.config();

// // // 🔹 Create a custom Redis connection for Bull
// // const redisConnection = new Redis(process.env.REDIS_URL, {
// //     maxRetriesPerRequest: null,
// //     enableReadyCheck: false,
// //     tls: { rejectUnauthorized: false }, // important for Upstash SSL
// // });

// // // ✅ Create the Shiprocket queue
// // export const shiprocketQueue = new Queue("shiprocketShipmentQueue", {
// //     createClient: function (type) {
// //         switch (type) {
// //             case "client":
// //                 return redisConnection;
// //             case "subscriber":
// //                 return redisConnection.duplicate();
// //             default:
// //                 return redisConnection.duplicate();
// //         }
// //     },
// //     defaultJobOptions: {
// //         attempts: 3,
// //         backoff: { type: "exponential", delay: 60000 },
// //         removeOnComplete: true,
// //         removeOnFail: false,
// //     },
// // });

// // // 🧭 Logs
// // shiprocketQueue
// //     .on("waiting", (jobId) => console.log(`⏳ Waiting job ${jobId}`))
// //     .on("active", (job) => console.log(`🚀 Processing job ${job.id}`))
// //     .on("completed", (job) =>
// //         console.log(`✅ Job ${job.id} done [${job.data.orderId}]`)
// //     )
// //     .on("failed", (job, err) =>
// //         console.error(`🔥 Job ${job.id} failed [${job?.data?.orderId}]:`, err.message)
// //     )
// //     .on("error", (err) => console.error("❌ Shiprocket Queue Error:", err));

// // console.log("📦 Shiprocket Queue initialized successfully");




// // middlewares/services/shiprocketQueue.js
// import Queue from "bull";
// import Redis from "ioredis";

// const redisConnection = new Redis(process.env.REDIS_URL, {
//     maxRetriesPerRequest: null,
//     enableReadyCheck: false,
//     tls: { rejectUnauthorized: false },
// });

// let redisAvailable = true;
// redisConnection.on("error", (err) => {
//     if (err.message.includes("max requests limit exceeded")) {
//         console.warn("⚠️ Upstash Redis limit reached. Disabling Shiprocket queue temporarily.");
//         redisAvailable = false;
//     }
// });

// export const shiprocketQueue = new Queue("shiprocketShipmentQueue", {
//     createClient: (type) => {
//         switch (type) {
//             case "client": return redisConnection;
//             case "subscriber": return redisConnection.duplicate();
//             default: return redisConnection.duplicate();
//         }
//     },
//     defaultJobOptions: {
//         attempts: 3,
//         backoff: { type: "exponential", delay: 60000 },
//         removeOnComplete: true,
//         removeOnFail: false,
//     },
// });

// export const addShiprocketJob = async (orderId, data) => {
//     if (!redisAvailable) {
//         console.warn(`⚠️ Skipping Shiprocket job for ${orderId} due to Redis limit`);
//         return;
//     }
//     await shiprocketQueue.add("shiprocket", { orderId, ...data });
// };








// middlewares/services/shiprocketQueue.js
import Queue from "bull";
import Redis from "ioredis";

let redisAvailable = true;

const redisConnection = new Redis(process.env.REDIS_URL, {
    tls: { rejectUnauthorized: false },
    maxRetriesPerRequest: 0,
    enableReadyCheck: false,
    reconnectOnError: false,
});

redisConnection.on("error", (err) => {
    if (err.message.includes("max requests limit exceeded")) {
        console.error("❌ Upstash Redis limit exceeded. Disabling Shiprocket queue.");
        redisAvailable = false;
        process.env.DISABLE_BULL = "true";

        try {
            redisConnection.removeAllListeners();
            redisConnection.disconnect();
        } catch { }
    }
});

export const shiprocketQueue =
    redisAvailable && process.env.DISABLE_BULL !== "true"
        ? new Queue("shiprocketShipmentQueue", {
            createClient: (type) => {
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
        })
        : null;

export const addShiprocketJob = async (orderId, data) => {
    if (!redisAvailable || process.env.DISABLE_BULL === "true" || !shiprocketQueue) {
        console.warn(`⚠️ Skipping Shiprocket job for ${orderId} due to Redis limit`);
        return;
    }
    await shiprocketQueue.add("shiprocket", { orderId, ...data });
};
