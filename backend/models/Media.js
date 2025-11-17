// models/Media.js
import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema(
    {
        type: { type: String, enum: ["image", "video"], required: true },
        url: { type: String, required: true },
        publicId: { type: String, required: true },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },

        // ⭐ NEW SEPARATE FIELDS
        title: { type: String, default: null },

        descriptionMobile: { type: String, default: null },
        descriptionDesktop: { type: String, default: null },

        // ⭐ Dynamic button (Shop Now, Learn More, Buy Now...)
        buttonText: { type: String, default: null },
        buttonLink: { type: String, default: null }
    },
    { timestamps: true }
);

export default mongoose.model("Media", mediaSchema);
