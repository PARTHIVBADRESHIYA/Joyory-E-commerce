import { Worker } from "bullmq";
import axios from "axios";
import Order from "../../models/Order.js";
import IORedis from "ioredis";

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

// ✅ TLS-enabled Redis connection
const connection = new IORedis(process.env.REDIS_URL, {
    tls: {},                     // 👈 Enable SSL/TLS
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});

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

        order.refund.status = "completed";
        order.refund.gatewayRefundId = response.data.id;
        order.paymentStatus = "refunded";
        order.refund.refundedAt = new Date();
        await order.save();

        return "Refund completed ✅";
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
