// workers/orderRefundWorker.js
import { Worker } from "bullmq";
import axios from "axios";
import Order from "../../models/Order.js";
import { createRedisConnection } from "../../middlewares/services/redisConnection.js";

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MIN = [5, 15, 30, 120, 360];

const LOG = (...args) => console.log("🧾 [ORDER-REFUND-WORKER]", ...args);
const ERROR = (...args) => console.error("❌ [ORDER-REFUND-WORKER]", ...args);

/* -------------------------------
   Razorpay Client
-------------------------------- */
const razorpayAxios = axios.create({
    baseURL: "https://api.razorpay.com/v1",
    auth: {
        username: process.env.RAZORPAY_KEY_ID,
        password: process.env.RAZORPAY_KEY_SECRET,
    },
    timeout: 15000,
});

/* -------------------------------
   Redis
-------------------------------- */
const connection = createRedisConnection(true);
if (!connection) throw new Error("Redis not available");

/* -------------------------------
   Order Refund Worker
-------------------------------- */
export const orderRefundWorker = new Worker(
    "orderRefundQueue",
    async (job) => {
        const { orderId } = job.data;
        const jobId = job.id;

        LOG("🚀 Job started", { jobId, orderId });

        const order = await Order.findById(orderId);
        if (!order) {
            ERROR("Order not found", { jobId });
            throw new Error("Order not found");
        }

        const refund = order.orderRefund;
        if (!refund) {
            ERROR("Order refund block missing", { jobId });
            throw new Error("Order refund block missing");
        }

        LOG("🔎 Refund state", {
            jobId,
            status: refund.status,
            attempts: refund.attempts,
            gatewayRefundId: refund.gatewayRefundId,
        });

        /* -------------------------------
           HARD GUARDS 🔒
        -------------------------------- */
        if (refund.status === "completed") {
            LOG("✅ Already completed", { jobId });
            return "Already refunded";
        }

        if (refund.gatewayRefundId) {
            LOG("🛑 Gateway refund already exists", {
                jobId,
                gatewayRefundId: refund.gatewayRefundId,
            });
            return "Refund already created at gateway";
        }

        if (refund.status === "processing") {
            LOG("⏳ Already processing", { jobId });
            return "Already processing";
        }

        if (!["locked", "retrying", "pending"].includes(refund.status)) {
            LOG("⏭ Skipped due to invalid state", {
                jobId,
                status: refund.status,
            });
            return `Skipped (${refund.status})`;
        }

        /* -------------------------------
           RETRY WINDOW
        -------------------------------- */
        if (
            refund.status === "retrying" &&
            refund.nextRetryAt &&
            refund.nextRetryAt > new Date()
        ) {
            LOG("⏳ Retry window not reached", {
                jobId,
                nextRetryAt: refund.nextRetryAt,
            });
            return "Retry window not reached";
        }

        /* -------------------------------
           WALLET REFUND (SYNC)
        -------------------------------- */
        if (refund.method === "wallet") {
            LOG("💰 Wallet refund", { jobId, amount: refund.amount });

            // 👉 You already have wallet infra, call it here
            // await creditWallet(order.user, refund.amount, order._id);

            refund.status = "completed";
            refund.refundedAt = new Date();

            refund.audit_trail.push({
                status: "refund_completed",
                action: "wallet_refund",
                performedByModel: "System",
                notes: `Wallet credited ₹${refund.amount}`,
                timestamp: new Date(),
            });

            await order.save();

            LOG("🎉 Wallet refund completed", { jobId });
            return "Wallet refund completed";
        }

        /* -------------------------------
           PAYMENT VERIFICATION
        -------------------------------- */
        LOG("💳 Verifying payment", {
            jobId,
            paymentId: order.transactionId,
        });

        const paymentRes = await razorpayAxios.get(
            `/payments/${order.transactionId}`
        );

        if (paymentRes.data.status !== "captured") {
            ERROR("Payment not captured", {
                jobId,
                razorpayStatus: paymentRes.data.status,
            });
            throw new Error("Payment not captured");
        }

        /* -------------------------------
           MARK PROCESSING
        -------------------------------- */
        refund.status = "processing";
        refund.lastAttemptAt = new Date();
        await order.save();

        /* -------------------------------
           CREATE RAZORPAY REFUND
        -------------------------------- */
        LOG("💸 Creating Razorpay refund", {
            jobId,
            amount: refund.amount,
        });

        const refundRes = await razorpayAxios.post(
            `/payments/${order.transactionId}/refund`,
            {
                amount: refund.amount * 100,
                notes: {
                    orderId: order._id.toString(),
                    type: "order_cancel_refund",
                },
            },
            {
                headers: {
                    "X-Idempotency-Key": refund.idempotencyKey,
                },
            }
        );

        if (!refundRes.data?.id) {
            throw new Error("Invalid Razorpay refund response");
        }

        refund.gatewayRefundId = refundRes.data.id;

        refund.audit_trail.push({
            status: "refund_processing",
            action: "razorpay_refund_created",
            performedByModel: "System",
            notes: refundRes.data.id,
            timestamp: new Date(),
        });

        await order.save();

        LOG("🎉 Refund initiated", {
            jobId,
            gatewayRefundId: refundRes.data.id,
        });

        return `Refund initiated (${refundRes.data.id})`;
    },
    {
        connection,
        concurrency: 3,
        limiter: { max: 5, duration: 1000 },

        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 1000 },

        attempts: 1,
        lockDuration: 10 * 60 * 1000,
        stalledInterval: 10 * 60 * 1000,
        maxStalledCount: 1,
    }
);

/* -------------------------------
   FAILURE HANDLER
-------------------------------- */
orderRefundWorker.on("failed", async (job, err) => {
    const { orderId } = job.data || {};
    const jobId = job?.id;

    ERROR("🔥 Job failed", { jobId, error: err.message });

    if (!orderId) return;

    const order = await Order.findById(orderId);
    if (!order || !order.orderRefund) return;

    const refund = order.orderRefund;

    refund.attempts += 1;
    refund.lastAttemptAt = new Date();
    refund.failureReason =
        err.response?.data?.error?.description || err.message;

    if (refund.attempts >= MAX_ATTEMPTS) {
        refund.status = "failed";
        refund.failedAt = new Date();

        ERROR("🛑 Order refund permanently failed", {
            jobId,
            attempts: refund.attempts,
        });
    } else {
        refund.status = "retrying";
        const delayMin = RETRY_DELAYS_MIN[refund.attempts - 1] || 360;

        refund.nextRetryAt = new Date(
            Date.now() + delayMin * 60 * 1000
        );

        LOG("🔁 Retry scheduled", {
            jobId,
            attempts: refund.attempts,
            nextRetryAt: refund.nextRetryAt,
        });
    }

    refund.audit_trail.push({
        status: "refund_error",
        action: "refund_retry_scheduled",
        performedByModel: "System",
        notes: refund.failureReason,
        timestamp: new Date(),
    });

    await order.save();
});

/* -------------------------------
   LIFECYCLE LOGS
-------------------------------- */
orderRefundWorker.on("ready", () => LOG("🟢 Worker ready"));
orderRefundWorker.on("active", (job) =>
    LOG("⚙️ Job active", { jobId: job.id })
);
orderRefundWorker.on("completed", (job, res) =>
    LOG("✅ Job completed", { jobId: job.id, res })
);
orderRefundWorker.on("error", (err) =>
    ERROR("💥 Worker error", err.message)
);
