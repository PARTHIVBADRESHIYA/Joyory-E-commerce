// models/Media.js
import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema(
    {
        type: { type: String, enum: ["image", "video"], required: true },
        url: { type: String, required: true },
        publicId: { type: String, required: true },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    },
    { timestamps: true }
);

export default mongoose.model("Media", mediaSchema);
