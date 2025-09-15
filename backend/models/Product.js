// models/Product.js
import mongoose from 'mongoose';

const foundationVariantSchema = new mongoose.Schema({
    // Note: unique on sub-docs is not enforced by MongoDB; enforce uniqueness at app level if needed
    sku: { type: String, required: true },             // brand SKU for that shade
    shadeName: { type: String, required: true },       // "102 Warm Ivory"
    familyKey: { type: String, required: false },      // maps to ShadeFamily.key (e.g. "ivory-pink")
    toneKeys: [{ type: String }],                      // ["fair","light"]
    undertoneKeys: [{ type: String }],                 // ["warm","neutral"]
    hex: { type: String },                             // swatch hex for UI
    lab: { L: Number, a: Number, b: Number },          // optional color space
    images: [{ type: String }],
    stock: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
}, { _id: false }); // if you prefer each variant to have its own _id, remove _id:false



const productSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    variant: String, // Shade / Type
    buyingPrice: { type: Number, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    thresholdValue: { type: Number, required: true },
    expiryDate: Date,
    // in Product model
    brand: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Brand",
        required: false
    },
    // backward-compatible single category (optional)
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true }, // final category (e.g. Eyeliner)
    categoryHierarchy: [ // full path
        { type: mongoose.Schema.Types.ObjectId, ref: 'Category' }
    ],

    // 👇 Flexible attributes (values depend on category definition)
    attributes: mongoose.Schema.Types.Mixed,
    skinTypes: [{ type: mongoose.Schema.Types.ObjectId, ref: "SkinType", index: true }],
    description: String,
    ingredients: [String],
    summary: String, // for card preview
    features: [String],       // now supports multiple features
    howToUse: String, // optional
    image: String, // keep for primary
    images: [{ type: String }],// 🔁 Add this for multi-images
    productTags: [String], // for product tag select
    shadeOptions: [{ type: String }],
    colorOptions: [{ type: String }],


    // new fields for shade finder
    // models/Product.js

    formulation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Formulation",
        required: false,
        index: true
    },
    foundationVariants: [foundationVariantSchema], // only used for foundation category products


    status: { type: String, enum: ['In-stock', 'Low stock', 'Out of stock'], default: 'In-stock' },
    sales: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    affiliateEarnings: { type: Number, default: 0 },
    affiliateClicks: { type: Number, default: 0 },
    // models/Product.js
    avgRating: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
    // add seller reference so products belong to a seller
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Seller',
        required: false, // optional for legacy products
        index: true
    },
    isPublished: { type: Boolean, default: true },
    scheduledAt: { type: Date, default: null },
    ratingsBreakdown: {
        Excellent: { type: Number, default: 0 },
        VeryGood: { type: Number, default: 0 },
        Average: { type: Number, default: 0 },
        Good: { type: Number, default: 0 },
        Poor: { type: Number, default: 0 }
    }

}, { timestamps: true });


// models/Product.js (add after schema definition)
productSchema.index({ brand: 1 });
productSchema.index({ brand: 1, category: 1 });
productSchema.index({ createdAt: -1 });

productSchema.index({ seller: 1, category: 1 });


// shade finder indexes (helpful for queries)
productSchema.index({ category: 1, formulation: 1 });
productSchema.index({ "foundationVariants.familyKey": 1 });
productSchema.index({ "foundationVariants.toneKeys": 1 });
productSchema.index({ "foundationVariants.undertoneKeys": 1 });


export default mongoose.model('Product', productSchema);

