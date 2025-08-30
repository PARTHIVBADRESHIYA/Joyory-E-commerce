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
    bannerImage: { type: String, default: null },
    thumbnailImage: { type: String, default: null }
    ,// URL for top banner
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
