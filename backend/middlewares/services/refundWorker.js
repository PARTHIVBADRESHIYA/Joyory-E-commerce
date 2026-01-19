

// // workers/refundWorker.js
// import { Worker } from "bullmq";
// import axios from "axios";
// import Order from "../../models/Order.js";
// import { createRedisConnection } from "../../middlewares/services/redisConnection.js";

// console.log("🔥 refundWorker.js FILE EXECUTED");

// /* -------------------------------
//    Razorpay Axios Client
// -------------------------------- */
// const razorpayAxios = axios.create({
//     baseURL: "https://api.razorpay.com/v1",
//     auth: {
//         username: process.env.RAZORPAY_KEY_ID,
//         password: process.env.RAZORPAY_KEY_SECRET,
//     },
//     timeout: 15000,
// });

// /* -------------------------------
//    Refund Amount Calculator
//    (PRODUCT ONLY — NO SHIPPING)
// -------------------------------- */
// export function calculateReturnRefundAmount(order, shipment, returnRequest) {
//     let total = 0;

//     for (const item of returnRequest.items || []) {
//         const shippedProduct = shipment.products.find(
//             p => p.productId.toString() === item.productId.toString()
//         );

//         if (!shippedProduct) continue;

//         total += shippedProduct.price * item.quantity;
//     }

//     return Math.round(total); // ₹ amount
// }

// /* -------------------------------
//    Redis Connection
// -------------------------------- */
// const connection = createRedisConnection(true); // ✅ forQueue = true

// if (!connection) {
//     throw new Error("❌ Redis connection not available for refund worker");
// }
// /* -------------------------------
//    Refund Worker
// -------------------------------- */
// export const refundWorker = new Worker(
//     "refundQueue",
//     async (job) => {
//         const { orderId, returnId } = job.data;

//         /* -------------------------------
//            Fetch Order
//         -------------------------------- */
//         const order = await Order.findById(orderId);
//         if (!order) throw new Error("Order not found");

//         /* -------------------------------
//            Find Return + Parent Shipment
//         -------------------------------- */
//         let refundTarget = null;
//         let parentShipment = null;

//         for (const shipment of order.shipments) {
//             const r = shipment.returns.id(returnId);
//             if (r) {
//                 refundTarget = r;
//                 parentShipment = shipment;
//                 break;
//             }
//         }

//         if (!refundTarget || !parentShipment) {
//             throw new Error("Return request not found");
//         }

//         /* -------------------------------
//            STATE GUARDS (IDEMPOTENT)
//         -------------------------------- */
//         if (refundTarget.refund?.status === "completed") {
//             return "Refund already completed ✅";
//         }

//         if (refundTarget.refund?.status === "processing") {
//             return "Refund already processing ⏳";
//         }

//         if (refundTarget.refund?.status !== "locked") {
//             return `Refund skipped (status: ${refundTarget.refund?.status})`;
//         }
//         /* -------------------------------
//            Calculate Refund Amount
//         -------------------------------- */
//         const amount = calculateReturnRefundAmount(
//             order,
//             parentShipment,
//             refundTarget
//         );

//         if (!amount || amount <= 0) {
//             throw new Error("Invalid refund amount");
//         }

//         /* -------------------------------
//            VERIFY PAYMENT (MANDATORY)
//         -------------------------------- */
//         const paymentRes = await razorpayAxios.get(
//             `/payments/${order.transactionId}`
//         );

//         if (paymentRes.data.status !== "captured") {
//             throw new Error(
//                 `Payment not captured yet (status: ${paymentRes.data.status})`
//             );
//         }

//         /* -------------------------------
//            Razorpay Refund API
//         -------------------------------- */
//         const response = await razorpayAxios.post(
//             `/payments/${order.transactionId}/refund`,
//             {
//                 amount: amount * 100, // paise
//                 notes: {
//                     reason: "Return Refund",
//                     orderId: order._id.toString(),
//                     returnId: refundTarget._id.toString(),
//                 },
//             }
//         );

//         if (!response.data?.id) {
//             throw new Error(
//                 `Razorpay refund failed: ${JSON.stringify(response.data)}`
//             );
//         }

//         /* -------------------------------
//            PROCESSING STATE (API SUCCESS)
//         -------------------------------- */
//         refundTarget.refund.status = "processing";
//         refundTarget.refund.gatewayRefundId = response.data.id;

//         refundTarget.audit_trail.push({
//             status: "refund_processing",
//             action: "razorpay_refund_created",
//             performedByModel: "System",
//             notes: `Razorpay refund created: ${response.data.id}`,
//             timestamp: new Date(),
//         });

//         await order.save();

//         return `Refund created successfully (₹${amount}) ✅`;
//     },
//     {
//         connection,
//         limiter: { max: 5, duration: 1000 },
//         concurrency: 3,
//     }
// );

// console.log("🔥 Refund Worker CONSTRUCTOR created");


// refundWorker.on("ready", () => {
//     console.log("🔥 Refund Worker READY (connected to Redis)")
// });

// refundWorker.on("active", (job) => {
//     console.log(`🛠 Refund job STARTED: ${job.id}`)
// });

// refundWorker.on("paused", () => {
//     console.log("🔥 Refund Worker PAUSED")
// });

// refundWorker.on("resumed", () => {
//     console.log("🔥 Refund Worker RESUMED")
// });

// refundWorker.on("drained", () => {
//     console.log("🔥 Refund Worker DRAINED")
// });


// /* -------------------------------
//    Worker Logs
// -------------------------------- */
// refundWorker.on("completed", (job, result) => {
//     console.log(`✅ Refund job ${job.id}:`, result);
// });

// refundWorker.on("failed", async (job, err) => {
//     console.error(`❌ Refund job ${job?.id} failed`);

//     const { orderId, returnId } = job.data || {};
//     if (!orderId || !returnId) return;

//     const order = await Order.findById(orderId);
//     if (!order) return;

//     for (const shipment of order.shipments) {
//         const ret = shipment.returns.id(returnId);
//         if (!ret) continue;

//         ret.refund.status = "failed";
//         ret.refund.failedAt = new Date();
//         ret.refund.failureReason =
//             err.response?.data?.error?.description || err.message;

//         ret.audit_trail.push({
//             status: "refund_failed",
//             action: "refund_failed",
//             performedByModel: "System",
//             notes: ret.refund.failureReason,
//             timestamp: new Date(),
//         });

//         await order.save();
//         break;
//     }
// });


// refundWorker.on("error", (err) => {
//     console.error("❌ Refund worker error:", err);
// });



// workers/refundWorker.js
import { Worker } from "bullmq";
import axios from "axios";
import Order from "../../models/Order.js";
import { createRedisConnection } from "../../middlewares/services/redisConnection.js";

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MIN = [5, 15, 30, 120, 360]; // minutes

const LOG = (...args) => console.log("🧾 [REFUND-WORKER]", ...args);
const ERROR = (...args) => console.error("❌ [REFUND-WORKER]", ...args);


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

export function calculateReturnRefundAmount(order, shipment, returnRequest) {
    let total = 0;

    for (const item of returnRequest.items || []) {
        const shippedProduct = shipment.products.find(
            p => p.productId.toString() === item.productId.toString()
        );

        if (!shippedProduct) continue;

        total += shippedProduct.price * item.quantity;
    }

    return Math.round(total); // ₹ amount
}


/* -------------------------------
   Redis
-------------------------------- */
const connection = createRedisConnection(true);
if (!connection) throw new Error("Redis not available");


/* -------------------------------
   Refund Worker
-------------------------------- */
export const refundWorker = new Worker(
    "refundQueue",
    async (job) => {
        const { orderId, returnId } = job.data;
        const jobId = job.id;

        LOG("🚀 Job started", { jobId, orderId, returnId });

        const order = await Order.findById(orderId);
        if (!order) {
            ERROR("Order not found", { jobId });
            throw new Error("Order not found");
        }

        let refundTarget, parentShipment;
        for (const s of order.shipments) {
            const r = s.returns.id(returnId);
            if (r) {
                refundTarget = r;
                parentShipment = s;
                break;
            }
        }

        if (!refundTarget) {
            ERROR("Return not found", { jobId });
            throw new Error("Return not found");
        }

        const refund = refundTarget.refund;

        LOG("🔎 Refund state", {
            jobId,
            status: refund.status,
            attempts: refund.attempts,
            gatewayRefundId: refund.gatewayRefundId,
            nextRetryAt: refund.nextRetryAt,
        });

        /* -------------------------------
           HARD GUARDS (NO MONEY LOSS)
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
            LOG("⏳ Refund already processing", { jobId });
            return "Already processing";
        }

        if (!["locked", "retrying"].includes(refund.status)) {
            LOG("⏭ Skipped due to invalid state", {
                jobId,
                status: refund.status,
            });
            return `Skipped (${refund.status})`;
        }

        /* -------------------------------
           RETRY WINDOW ENFORCEMENT 🔒
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
           MARK PROCESSING BEFORE API
        -------------------------------- */
        refund.status = "processing";
        refund.lastAttemptAt = new Date();
        await order.save(); // 🔒 lock before API call

        /* -------------------------------
           CREATE RAZORPAY REFUND
        -------------------------------- */
        LOG("💸 Creating refund", {
            jobId,
            amount: refund.amount,
            idempotencyKey: refund.idempotencyKey,
        });

        const refundRes = await razorpayAxios.post(
            `/payments/${order.transactionId}/refund`,
            {
                amount: refund.amount * 100,
                notes: {
                    orderId: order._id.toString(),
                    returnId: refundTarget._id.toString(),
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

        /* -------------------------------
           SAVE GATEWAY RESPONSE
        -------------------------------- */
        refund.gatewayRefundId = refundRes.data.id;

        refundTarget.audit_trail.push({
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

        // DB owns retries
        attempts: 1,

        // Stall protection softened
        lockDuration: 10 * 60 * 1000,
        stalledInterval: 10 * 60 * 1000,
        maxStalledCount: 1,
    }

);

/* -------------------------------
   FAILURE HANDLER (DB-CONTROLLED)
-------------------------------- */
refundWorker.on("failed", async (job, err) => {
    const { orderId, returnId } = job.data || {};
    const jobId = job?.id;

    ERROR("🔥 Job failed", {
        jobId,
        error: err.message,
    });

    if (!orderId || !returnId) return;

    const order = await Order.findById(orderId);
    if (!order) return;

    for (const shipment of order.shipments) {
        const ret = shipment.returns.id(returnId);
        if (!ret) continue;

        const refund = ret.refund;

        refund.attempts += 1;
        refund.lastAttemptAt = new Date();
        refund.failureReason =
            err.response?.data?.error?.description || err.message;

        if (refund.attempts >= MAX_ATTEMPTS) {
            refund.status = "failed";
            refund.failedAt = new Date();

            ERROR("🛑 Refund permanently failed", {
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

        ret.audit_trail.push({
            status: "refund_error",
            action: "refund_retry_scheduled",
            performedByModel: "System",
            notes: refund.failureReason,
            timestamp: new Date(),
        });

        await order.save();
        break;
    }
});

/* -------------------------------
   LIFECYCLE LOGS
-------------------------------- */
refundWorker.on("ready", () => LOG("🟢 Worker ready"));
refundWorker.on("active", (job) => LOG("⚙️ Job active", { jobId: job.id }));
refundWorker.on("completed", (job, res) =>
    LOG("✅ Job completed", { jobId: job.id, res })
);
refundWorker.on("error", (err) =>
    ERROR("💥 Worker error", err.message)
);