
// middlewares/services/refundQueue.js
import { Queue, Worker } from "bullmq";
import { createRedisConnection } from "./redisConnection.js";
import axios from "axios";
import Order from "../../models/Order.js";

const connection = createRedisConnection();

const razorpayAxios = axios.create({
    baseURL: "https://api.razorpay.com/v1",
    auth: {
        username: process.env.RAZORPAY_KEY_ID,
        password: process.env.RAZORPAY_KEY_SECRET,
    },
});

let refundQueue = null;

if (connection && process.env.DISABLE_BULL !== "true") {
    refundQueue = new Queue("refundQueue", {
        connection, // plain Redis
        defaultJobOptions: {
            attempts: 5,
            backoff: { type: "exponential", delay: 30000 },
        },
    });
    console.log("✅ Refund Queue initialized");
} else {
    console.warn("🚫 Refund Queue disabled (Redis unavailable)");
}

export const addRefundJob = async (orderId, returnId) => {
    if (!connection || process.env.DISABLE_BULL === "true" || !refundQueue) {
        console.warn(`⚠️ Skipping refund job for ${orderId}`);
        return;
    }

    await refundQueue.add("refund", {
        orderId,
        returnId,
        refundType: "return"
    });
};

export { refundQueue };
