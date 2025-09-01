// models/ProductViewLog.js
import mongoose from "mongoose";

const ProductViewLogSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
        },
    },
    { timestamps: true }
);

export default mongoose.model("ProductViewLog", ProductViewLogSchema);
