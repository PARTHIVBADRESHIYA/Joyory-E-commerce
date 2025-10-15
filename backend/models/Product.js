// // models/Product.js
// import mongoose from 'mongoose';

// const variantSchema = new mongoose.Schema({
//     sku: { type: String, required: true },
//     shadeName: { type: String, required: true },
//     hex: { type: String },
//     images: [{ type: String }],
//     stock: { type: Number, default: 0 },
//     isActive: { type: Boolean, default: true },
//     createdAt: { type: Date, default: Date.now },

//     // foundation-specific (optional)
//     familyKey: { type: String },
//     toneKeys: [{ type: String }],
//     undertoneKeys: [{ type: String }],
//     lab: { L: Number, a: Number, b: Number }

// }, { _id: false });

// const productSchema = new mongoose.Schema({
//     name: { type: String, required: true, unique: true },
//     variant: String, // Shade / Type
//     buyingPrice: { type: Number, required: true },
//     price: { type: Number, required: true },
//     quantity: { type: Number, required: true },
//     thresholdValue: { type: Number, required: true },
//     expiryDate: Date,
//     // in Product model
//     brand: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "Brand",
//         required: false
//     },
//     // backward-compatible single category (optional)
//     category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true }, // final category (e.g. Eyeliner)
//     categoryHierarchy: [ // full path
//         { type: mongoose.Schema.Types.ObjectId, ref: 'Category' }
//     ],

//     // 👇 Flexible attributes (values depend on category definition)
//     attributes: mongoose.Schema.Types.Mixed,
//     skinTypes: [{ type: mongoose.Schema.Types.ObjectId, ref: "SkinType", index: true }],
//     description: String,
//     ingredients: [String],
//     summary: String, // for card preview
//     features: [String],       // now supports multiple features
//     howToUse: String, // optional
//     image: String, // keep for primary
//     images: [{ type: String }],// 🔁 Add this for multi-images

//     variants: [variantSchema],   // ✅ new generic field

//     productTags: [String], // for product tag select
//     shadeOptions: [{ type: String }],
//     colorOptions: [{ type: String }],


//     // new fields for shade finder
//     // models/Product.js

//     formulation: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "Formulation",
//         required: false,
//         index: true
//     },
//     // variants: [variantschema], // only used for foundation category products


//     status: { type: String, enum: ['In-stock', 'Low stock', 'Out of stock'], default: 'In-stock' },
//     sales: { type: Number, default: 0 },
//     views: { type: Number, default: 0 },
//     commentsCount: { type: Number, default: 0 },
//     affiliateEarnings: { type: Number, default: 0 },
//     affiliateClicks: { type: Number, default: 0 },
//     // models/Product.js
//     avgRating: { type: Number, default: 0 },
//     commentsCount: { type: Number, default: 0 },
//     totalRatings: { type: Number, default: 0 },
//     // add seller reference so products belong to a seller
//     seller: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Seller',
//         required: false, // optional for legacy products
//         index: true
//     },
//     isPublished: { type: Boolean, default: true },
//     scheduledAt: { type: Date, default: null },
//     ratingsBreakdown: {
//         Excellent: { type: Number, default: 0 },
//         VeryGood: { type: Number, default: 0 },
//         Average: { type: Number, default: 0 },
//         Good: { type: Number, default: 0 },
//         Poor: { type: Number, default: 0 }
//     }

// }, { timestamps: true });


// // models/Product.js (add after schema definition)
// productSchema.index({ brand: 1 });
// productSchema.index({ brand: 1, category: 1 });
// productSchema.index({ createdAt: -1 });

// productSchema.index({ seller: 1, category: 1 });


// // shade finder indexes (helpful for queries)
// productSchema.index({ category: 1, formulation: 1 });
// productSchema.index({ "variants.familyKey": 1 });
// productSchema.index({ "variants.toneKeys": 1 });
// productSchema.index({ "variants.undertoneKeys": 1 });


// export default mongoose.model('Product', productSchema);














// // models/Product.js
// import mongoose from 'mongoose';

// const variantSchema = new mongoose.Schema({
//     sku: { type: String, required: true },
//     shadeName: { type: String }, // 🔹 now optional
//     hex: { type: String },
//     images: [{ type: String }],
//     stock: { type: Number, default: 0 }, // 🔹 stock moved to variant-level
//     sales: { type: Number, default: 0 }, // 🔹 sales per variant
//     thresholdValue: {
//         type: Number,
//         default: 0,
//         required: function () {
//             // Required only if product has no variants
//             return !this.variants || this.variants.length === 0;
//         }
//     },
//     isActive: { type: Boolean, default: true },
//     createdAt: { type: Date, default: Date.now },

//     // foundation-specific (optional)
//     familyKey: { type: String },
//     toneKeys: [{ type: String }],
//     undertoneKeys: [{ type: String }],
//     lab: { L: Number, a: Number, b: Number }
// }, { _id: false });

// const productSchema = new mongoose.Schema({
//     name: { type: String, required: true, unique: true },
//     variant: String, // general type label
//     buyingPrice: { type: Number, required: true },
//     price: { type: Number, required: true },

//     // 🔹 Global quantity is now optional (only required if no variants)
//     quantity: { type: Number, default: 0 },

//     thresholdValue: { type: Number, required: true },
//     expiryDate: Date,

//     brand: { type: mongoose.Schema.Types.ObjectId, ref: "Brand" },
//     category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
//     categoryHierarchy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],

//     attributes: mongoose.Schema.Types.Mixed,
//     skinTypes: [{ type: mongoose.Schema.Types.ObjectId, ref: "SkinType", index: true }],
//     description: String,
//     ingredients: [String],
//     summary: String,
//     features: [String],
//     howToUse: String,
//     image: String,
//     images: [{ type: String }],

//     // 🔹 Variants array (shade products)
//     variants: [variantSchema],

//     productTags: [String],
//     shadeOptions: [{ type: String }],
//     colorOptions: [{ type: String }],

//     formulation: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "Formulation",
//         index: true
//     },

//     status: { type: String, enum: ['In-stock', 'Low stock', 'Out of stock'], default: 'In-stock' },

//     // 🔹 moved sales down to variant level but also keep total for fast queries
//     sales: { type: Number, default: 0 },
//     views: { type: Number, default: 0 },
//     commentsCount: { type: Number, default: 0 },
//     affiliateEarnings: { type: Number, default: 0 },
//     affiliateClicks: { type: Number, default: 0 },
//     avgRating: { type: Number, default: 0 },
//     totalRatings: { type: Number, default: 0 },

//     seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', index: true },
//     isPublished: { type: Boolean, default: true },
//     scheduledAt: { type: Date, default: null },

//     ratingsBreakdown: {
//         Excellent: { type: Number, default: 0 },
//         VeryGood: { type: Number, default: 0 },
//         Average: { type: Number, default: 0 },
//         Good: { type: Number, default: 0 },
//         Poor: { type: Number, default: 0 }
//     }

// }, { timestamps: true });

// // indexes
// productSchema.index({ brand: 1 });
// productSchema.index({ brand: 1, category: 1 });
// productSchema.index({ createdAt: -1 });
// productSchema.index({ seller: 1, category: 1 });
// productSchema.index({ category: 1, formulation: 1 });
// productSchema.index({ "variants.familyKey": 1 });
// productSchema.index({ "variants.toneKeys": 1 });
// productSchema.index({ "variants.undertoneKeys": 1 });

// export default mongoose.model('Product', productSchema);
















// import mongoose from 'mongoose';

// const variantSchema = new mongoose.Schema({
//     sku: { type: String, required: true },
//     shadeName: { type: String },
//     hex: { type: String },
//     images: [{ type: String }],
//     stock: { type: Number, default: 0 },
//     sales: { type: Number, default: 0 },
//     thresholdValue: { type: Number, default: 0 },
//     isActive: { type: Boolean, default: true },
//     createdAt: { type: Date, default: Date.now },
//     discountedPrice: { type: Number, default: null },

//     // foundation-specific
//     familyKey: { type: String },
//     toneKeys: [{ type: String }],
//     undertoneKeys: [{ type: String }],
//     lab: { L: Number, a: Number, b: Number }
// }, { _id: false });

// const productSchema = new mongoose.Schema({
//     name: { type: String, required: true, unique: true },
//     variant: String,
//     buyingPrice: { type: Number, required: true },
//     price: { type: Number, required: true },

//     // ✅ Global values only if no variants
//     quantity: {
//         type: Number,
//         default: 0,
//         required: function () {
//             return !this.variants || this.variants.length === 0;
//         }
//     },
//     thresholdValue: {
//         type: Number,
//         required: function () {
//             return !this.variants || this.variants.length === 0;
//         },
//         default: 0
//     },

//     expiryDate: Date,
//     brand: { type: mongoose.Schema.Types.ObjectId, ref: "Brand" },
//     category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
//     categoryHierarchy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],

//     attributes: mongoose.Schema.Types.Mixed,
//     skinTypes: [{ type: mongoose.Schema.Types.ObjectId, ref: "SkinType", index: true }],
//     description: String,
//     ingredients: [String],
//     summary: String,
//     features: [String],
//     howToUse: String,
//     image: String,
//     images: [{ type: String }],

//     variants: [variantSchema], // ✅ if exists, quantity/threshold handled at variant level

//     productTags: [String],
//     shadeOptions: [{ type: String }],
//     colorOptions: [{ type: String }],

//     formulation: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "Formulation",
//         index: true
//     },

//     status: { type: String, enum: ['In-stock', 'Low stock', 'Out of stock'], default: 'In-stock' },
//     sales: { type: Number, default: 0 },
//     views: { type: Number, default: 0 },
//     commentsCount: { type: Number, default: 0 },
//     affiliateEarnings: { type: Number, default: 0 },
//     affiliateClicks: { type: Number, default: 0 },
//     avgRating: { type: Number, default: 0 },
//     totalRatings: { type: Number, default: 0 },

//     seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', index: true },
//     isPublished: { type: Boolean, default: true },
//     scheduledAt: { type: Date, default: null },

//     ratingsBreakdown: {
//         Excellent: { type: Number, default: 0 },
//         VeryGood: { type: Number, default: 0 },
//         Average: { type: Number, default: 0 },
//         Good: { type: Number, default: 0 },
//         Poor: { type: Number, default: 0 }
//     },

//     minPrice: { type: Number, index: true, default: null },
//     maxPrice: { type: Number, index: true, default: null }


// }, { timestamps: true });

// // indexes
// productSchema.index({ brand: 1 });
// productSchema.index({ brand: 1, category: 1 });
// productSchema.index({ createdAt: -1 });
// productSchema.index({ seller: 1, category: 1 });
// productSchema.index({ category: 1, formulation: 1 });
// productSchema.index({ "variants.familyKey": 1 });
// productSchema.index({ "variants.toneKeys": 1 });
// productSchema.index({ "variants.undertoneKeys": 1 });

// export default mongoose.model('Product', productSchema);





// models/Product.js
import mongoose from 'mongoose';

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
    familyKey: { type: String },
    toneKeys: [{ type: String }],
    undertoneKeys: [{ type: String }],
    lab: { L: Number, a: Number, b: Number }
}, { _id: false });

const productSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
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
productSchema.pre('save', function (next) {
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
