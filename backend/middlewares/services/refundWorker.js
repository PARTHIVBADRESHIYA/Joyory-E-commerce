import { Worker } from "bullmq";
import axios from "axios";
import Order from "../../models/Order.js";
import { createRedisConnection } from "../../middlewares/services/redisConnection.js";

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// ✅ Razorpay Axios instance
const razorpayAxios = axios.create({
    baseURL: "https://api.razorpay.com/v1",
    auth: {
        username: RAZORPAY_KEY_ID,
        password: RAZORPAY_KEY_SECRET,
    },
});

// ✅ Use the existing createRedisConnection function
const connection = createRedisConnection(true); // forQueue = true

export const refundWorker = new Worker(
    "refundQueue",
    async (job) => {
        const { orderId } = job.data;
        const order = await Order.findById(orderId);

        if (!order) throw new Error("Order not found");
        if (order.refund.status === "completed") return "Refund already done ✅";

        const refundAmount = order.refund.amount * 100;

        // 🔁 Razorpay refund API
        const response = await razorpayAxios.post(
            `/payments/${order.transactionId}/refund`,
            { amount: refundAmount }
        );

        order.refund.status = "initiated";
        order.refund.gatewayRefundId = response.data.id;
        await order.save();

        return "Refund initiated";  
    },
    { connection }
);

// 🧩 Worker event listeners
refundWorker.on("failed", (job, err) => {
    console.error(`❌ Retry failed for job ${job.id}:`, err.message);
});

refundWorker.on("completed", (job) => {
    console.log(`✅ Refund job completed for order ${job.data.orderId}`);
});
