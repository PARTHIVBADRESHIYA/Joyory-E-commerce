// import { Worker } from "bullmq";
// import axios from "axios";
// import Order from "../../models/Order.js";
// import { createRedisConnection } from "../../middlewares/services/redisConnection.js";

// const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
// const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

// // ✅ Razorpay Axios instance
// const razorpayAxios = axios.create({
//     baseURL: "https://api.razorpay.com/v1",
//     auth: {
//         username: RAZORPAY_KEY_ID,
//         password: RAZORPAY_KEY_SECRET,
//     },
// });

// // ✅ Use the existing createRedisConnection function
// const connection = createRedisConnection(true); // forQueue = true

// export const refundWorker = new Worker(
//     "refundQueue",
//     async (job) => {
//         const { orderId } = job.data;
//         const order = await Order.findById(orderId);

//         if (!order) throw new Error("Order not found");
//         if (order.refund.status === "completed") return "Refund already done ✅";

//         const refundAmount = order.refund.amount * 100;

//         // 🔁 Razorpay refund API
//         const response = await razorpayAxios.post(
//             `/payments/${order.transactionId}/refund`,
//             { amount: refundAmount }
//         );

//         order.refund.status = "initiated";
//         order.refund.gatewayRefundId = response.data.id;
//         await order.save();

//         return "Refund initiated";  
//     },
//     { connection }
// );

// // 🧩 Worker event listeners
// refundWorker.on("failed", (job, err) => {
//     console.error(`❌ Retry failed for job ${job.id}:`, err.message);
// });

// refundWorker.on("completed", (job) => {
//     console.log(`✅ Refund job completed for order ${job.data.orderId}`);
// });













// workers/refundWorker.js (updated)
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
        const { orderId, returnId, amount, refundType = 'return' } = job.data;

        try {
            const order = await Order.findById(orderId);

            if (!order) throw new Error("Order not found");

            let refundTarget;
            let isReturnRefund = false;

            if (returnId && refundType === 'return') {
                // This is a return refund
                refundTarget = order.returns.id(returnId);
                if (!refundTarget) throw new Error("Return request not found");
                if (refundTarget.refund.status === "completed") {
                    return "Refund already completed ✅";
                }
                isReturnRefund = true;
            } else {
                // This is an order cancellation refund
                if (order.refund.status === "completed") {
                    return "Refund already completed ✅";
                }
                refundTarget = order;
            }

            const refundAmount = amount * 100; // Convert to paise

            // 🔁 Razorpay refund API
            const response = await razorpayAxios.post(
                `/payments/${order.transactionId}/refund`,
                {
                    amount: refundAmount,
                    notes: {
                        reason: isReturnRefund ? "Return Refund" : "Order Cancellation",
                        returnId: returnId || null
                    }
                }
            );

            // Update refund status based on Razorpay response
            let refundStatus = "processing";
            if (response.data.status === "processed") {
                refundStatus = "completed";
            }

            if (isReturnRefund) {
                // Update return request refund
                refundTarget.refund.status = refundStatus;
                refundTarget.refund.gatewayRefundId = response.data.id;
                refundTarget.refund.refundedAt = new Date();

                if (refundStatus === "completed") {
                    refundTarget.overallStatus = "refunded";
                    refundTarget.auditTrail.push({
                        status: "refunded",
                        action: "refund_completed",
                        performedBy: "System",
                        performedByModel: "System",
                        notes: `Refund completed via Razorpay. Refund ID: ${response.data.id}`,
                        timestamp: new Date()
                    });
                }
            } else {
                // Update order refund
                order.refund.status = refundStatus;
                order.refund.gatewayRefundId = response.data.id;
                order.refund.refundedAt = new Date();
                order.paymentStatus = refundStatus === "completed" ? "refunded" : "refund_initiated";
            }

            await order.save();

            // Send refund completion email if status is completed
            if (refundStatus === "completed" && order.user?.email) {
                try {
                    const emailService = require('../middlewares/utils/emailService.js');
                    await emailService.sendEmail(
                        order.user.email,
                        "✅ Refund Completed - Joyory",
                        `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                          <h2 style="color: #333;">Refund Completed</h2>
                          <p>Dear ${order.user.name},</p>
                          <p>Your refund of ₹${amount} for Order #${order.orderNumber} has been completed.</p>
                          
                          <div style="background: #d4edda; padding: 15px; border-radius: 5px; margin: 20px 0;">
                            <h3 style="margin-top: 0;">Refund Details:</h3>
                            <p><strong>Amount:</strong> ₹${amount}</p>
                            <p><strong>Status:</strong> Completed</p>
                            <p><strong>Transaction ID:</strong> ${response.data.id}</p>
                            <p><strong>Processed On:</strong> ${new Date().toLocaleDateString()}</p>
                          </div>
                          
                          <p>The amount should reflect in your account within 5-7 business days.</p>
                          
                          <p>Thank you for shopping with Joyory!</p>
                          
                          <p>Best regards,<br>
                          Team Joyory</p>
                        </div>
                        `
                    );
                } catch (emailError) {
                    console.error("Refund completion email failed:", emailError.message);
                }
            }

            return `Refund ${refundStatus}`;

        } catch (error) {
            console.error(`❌ Refund failed for order ${orderId}:`, error.response?.data || error.message);

            // Update order with failed status
            const order = await Order.findById(orderId);
            if (order) {
                if (returnId) {
                    const returnRequest = order.returns.id(returnId);
                    if (returnRequest) {
                        returnRequest.refund.status = "failed";
                        returnRequest.auditTrail.push({
                            status: "failed",
                            action: "refund_failed",
                            performedBy: "System",
                            performedByModel: "System",
                            notes: `Refund failed: ${error.message}`,
                            timestamp: new Date()
                        });
                    }
                } else {
                    order.refund.status = "failed";
                }
                await order.save();
            }

            throw error;
        }
    },
    {
        connection,
        // Retry configuration
        limiter: {
            max: 5, // Max 5 jobs per second
            duration: 1000
        }
    }
);

// 🧩 Worker event listeners
refundWorker.on("failed", (job, err) => {
    console.error(`❌ Refund job ${job.id} failed:`, err.message);

    // You can add logic to retry failed refunds
    if (job.attemptsMade < 3) {
        console.log(`🔄 Retrying refund job ${job.id} (attempt ${job.attemptsMade + 1})`);
    }
});

refundWorker.on("completed", (job, result) => {
    console.log(`✅ Refund job ${job.id} completed:`, result);
});

refundWorker.on("error", (err) => {
    console.error("❌ Refund worker error:", err);
});