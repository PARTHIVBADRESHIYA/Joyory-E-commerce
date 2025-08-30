// models/SkinType.js
import mongoose from "mongoose";


const skinTypeSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        slug: { type: String, required: true },
        description: { type: String, default: "" },
        image: { type: String, default: null },   // ✅ new field
        isActive: { type: Boolean, default: true },
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true }
);

skinTypeSchema.index({ name: 1, isDeleted: 1 }, { unique: true });

export default mongoose.model("SkinType", skinTypeSchema);