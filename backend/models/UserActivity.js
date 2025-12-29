import mongoose from "mongoose";

const userActivitySchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["product_view", "category_view", "add_to_cart", "checkout", "order"], required: true },

    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },

    createdAt: { type: Date, default: Date.now }
});

// Create index for fast analytics
userActivitySchema.index({ createdAt: -1 });
userActivitySchema.index({ user: 1, createdAt: -1 });
userActivitySchema.index({ type: 1, createdAt: -1 });

export default mongoose.model("UserActivity", userActivitySchema);
