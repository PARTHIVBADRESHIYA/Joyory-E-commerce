// import { Queue } from "bullmq";
// import IORedis from "ioredis";
// import dotenv from "dotenv";
// dotenv.config();

// // 🔹 Use TLS-enabled Upstash Redis
// const connection = new IORedis(process.env.REDIS_URL, {
//   tls: {},                     // Required for Upstash
//   maxRetriesPerRequest: null,  // Prevents retry issues
//   enableReadyCheck: false,
// });

// const queues = ["refundQueue", "shiprocketShipmentQueue"];

// const cleanQueue = async (queueName) => {
//   const queue = new Queue(queueName, { connection });
//   try {
//     console.log(`🔹 Cleaning queue: ${queueName}`);

//     const completed = await queue.clean(0, "completed");
//     console.log(`✅ Removed ${completed.length} completed jobs from ${queueName}`);

//     const failed = await queue.clean(0, "failed");
//     console.log(`✅ Removed ${failed.length} failed jobs from ${queueName}`);

//     const counts = await queue.getJobCounts();
//     console.log(`📊 Current job counts for ${queueName}:`, counts);

//   } catch (err) {
//     console.error(`❌ Error cleaning ${queueName}:`, err);
//   } finally {
//     await queue.close();
//   }
// };

// const run = async () => {
//   for (const q of queues) {
//     await cleanQueue(q);
//   }
//   console.log("♻️ All queues cleaned successfully!");
//   process.exit(0);
// };

// run();
