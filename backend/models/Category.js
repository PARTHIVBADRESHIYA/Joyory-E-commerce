// models/Category.js
import mongoose from 'mongoose';


const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true
    },
    description: String,
    parent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        default: null
    },
    brands: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Brand"
        }
    ],


    // 👇 New: define attributes this category supports
    attributes: [
        {
            key: { type: String, required: true }, // e.g. "shadeOptions"
            label: String,                          // e.g. "Available Shades"
            type: { type: String, enum: ["string", "number", "color", "array"], default: "string" }
        }
    ],
    bannerImage: [{ type: String }],      // ✅ now allows multiple images
    thumbnailImage: [{ type: String }],   // ✅ now allows multiple images
    // URL for top banner
    // ancestors array stores parent chain: [grandparentId, parentId]
    ancestors: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
    }],
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

// ensure slug is indexed
categorySchema.index({ slug: 1 });

export default mongoose.model('Category', categorySchema);
