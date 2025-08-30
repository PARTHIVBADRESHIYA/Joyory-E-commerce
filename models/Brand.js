// models/Brand.js
import mongoose from "mongoose";

const brandSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, unique: true, trim: true },
        slug: { type: String, required: true, unique: true },
        description: { type: String, default: "" },
        logo: { type: String, default: null },    // Cloudinary URL
        banner: { type: String, default: null },  // Optional banner image
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

brandSchema.index({ slug: 1 });

export default mongoose.model("Brand", brandSchema);
