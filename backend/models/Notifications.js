import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
    type: { type: String, required: true }, // "order", "review", "user", "stock", "report"
    message: { type: String, required: true },
    priority: { type: String, default: "normal" }, // "high", "normal", "info"
    meta: { type: Object, default: {} }, // orderId, userId, reviewId, productId
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Notification", notificationSchema);
