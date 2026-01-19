import { Queue, Worker } from "bullmq";
import { createRedisConnection } from "./redisConnection.js";

const connection = createRedisConnection();

let orderRefundQueue = null;

if (connection && process.env.DISABLE_BULL !== "true") {
    orderRefundQueue = new Queue("orderRefundQueue", {
        connection,
        defaultJobOptions: {
            attempts: 5,
            backoff: { type: "exponential", delay: 30000 },
        },
    });

    console.log("✅ Order Refund Queue initialized");
} else {
    console.warn("🚫 Order Refund Queue disabled (Redis unavailable)");
}

/**
 * Add ORDER cancellation refund job
 * (DO NOT USE FOR RETURNS)
 */
export const addOrderRefundJob = async (orderId) => {
    if (!connection || process.env.DISABLE_BULL === "true" || !orderRefundQueue) {
        console.warn(`⚠️ Skipping ORDER refund job for ${orderId}`);
        return;
    }

    await orderRefundQueue.add("order_refund", {
        orderId
    });
};

export { orderRefundQueue };
