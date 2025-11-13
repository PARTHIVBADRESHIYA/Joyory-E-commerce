// models/Product.js
import mongoose from 'mongoose';
import { generateUniqueSlug } from '../middlewares/utils/slug.js'; // ✅ import this

const variantSchema = new mongoose.Schema({
    sku: { type: String, required: true },
    shadeName: { type: String },
    hex: { type: String },
    images: [{ type: String }],
    stock: { type: Number, default: 0 },
    sales: { type: Number, default: 0 },
    thresholdValue: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    discountedPrice: { type: Number, default: null },
    displayPrice: { type: Number, default: null },
    familyKey: { type: String },
    toneKeys: [{ type: String }],
    undertoneKeys: [{ type: String }],
    lab: { L: Number, a: Number, b: Number }
}, { _id: false });

const productSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    slug: { type: String, unique: true, index: true }, // ✅ Add this line
    buyingPrice: { type: Number, required: true },
    variant: String,
    images: [{ type: String }],
    price: { type: Number, required: true },
    discountedPrice: { type: Number, default: null },
    discountPercent: { type: Number, default: 0 },
    quantity: {
        type: Number,
        default: 0,
        required: function () {
            return !this.variants || this.variants.length === 0;
        }
    },
    summary: { type: String },
    description: { type: String },
    features: { type: [String] },
    howToUse: { type: String },
    expiryDate: { type: Date },
    scheduledAt: { type: Date },
    status: {
        type: String,
        enum: ["In-stock", "Low stock", "Out of stock"],
        default: "In-stock"
    },
    productTags: [{ type: String, index: true }],
    brand: { type: mongoose.Schema.Types.ObjectId, ref: "Brand" },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    categoryHierarchy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],

    skinTypes: [{ type: mongoose.Schema.Types.ObjectId, ref: "SkinType", index: true }],
    formulation: { type: mongoose.Schema.Types.ObjectId, ref: "Formulation", index: true },
    finish: { type: String, index: true },
    ingredients: [String],
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', index: true },

    variants: [variantSchema],
    avgRating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },

    minPrice: { type: Number, index: true, default: null },
    maxPrice: { type: Number, index: true, default: null },

    isPublished: { type: Boolean, default: true }
}, { timestamps: true });

// 🔹 Automatically update min/max price & discount before saving
productSchema.pre('save', async function (next) {

    if (!this.slug || this.isModified('name')) {
        this.slug = await generateUniqueSlug(mongoose.model('Product'), this.name);
    }

    if (this.variants?.length) {
        const prices = this.variants.map(v => v.discountedPrice || v.price).filter(Boolean);
        this.minPrice = Math.min(...prices);
        this.maxPrice = Math.max(...prices);
    } else {
        this.minPrice = this.discountedPrice || this.price;
        this.maxPrice = this.price;
    }

    if (this.discountedPrice) {
        this.discountPercent = Math.round(((this.price - this.discountedPrice) / this.price) * 100);
    }
    next();
});

productSchema.index({ brand: 1 });
productSchema.index({ category: 1 });
productSchema.index({ price: 1 });
productSchema.index({ avgRating: -1 });
productSchema.index({ seller: 1, category: 1 });

export default mongoose.model('Product', productSchema);
