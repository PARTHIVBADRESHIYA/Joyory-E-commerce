// models/Product.js
import mongoose from 'mongoose';
import { generateUniqueSlug } from '../middlewares/utils/slug.js'; // ✅ import this

const variantSchema = new mongoose.Schema({
    sku: { type: String, required: true },
    shadeName: { type: String },
    slug: { type: String, index: true },        // <── THIS
    hex: { type: String },
    images: [{ type: String }],
    stock: { type: Number, default: 0 },
    // ✅ Validation + required removed
    stockByWarehouse: {
        type: [
            {
                warehouseCode: {
                    type: String,
                    trim: true
                },
                stock: {
                    type: Number,
                    default: 0,
                    min: 0
                }
            }
        ],
        default: [] // optional
    },

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
    name: { type: String, required: true },
    slugs: [{ type: String, index: true }],
    buyingPrice: { type: Number, required: true },
    variant: String,
    price: { type: Number, required: true },
    discountedPrice: { type: Number, default: null },
    discountPercent: { type: Number, default: 0 },
    summary: { type: String },
    description: { type: String },
    features: { type: [String] },
    howToUse: { type: String },
    expiryDate: { type: Date },
    scheduledAt: { type: Date },
    productTags: [{ type: String, index: true }],
    brand: { type: mongoose.Schema.Types.ObjectId, ref: "Brand" },
    brandSlug: { type: String, index: true },

    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    categorySlug: { type: String, index: true },

    categoryHierarchy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],

    skinTypes: [{ type: mongoose.Schema.Types.ObjectId, ref: "SkinType", index: true }],
    skinTypeSlugs: [{ type: String, index: true }],

    formulation: { type: mongoose.Schema.Types.ObjectId, ref: "Formulation", index: true },
    formulationSlug: { type: String, index: true },
    finish: { type: String, index: true },
    ingredients: [String],
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', index: true },

    variants: [variantSchema],
    avgRating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },

    minPrice: { type: Number, index: true, default: null },
    maxPrice: { type: Number, index: true, default: null },

    supportsVTO: { type: Boolean, default: false },
    vtoType: {
        type: String,
        enum: ["lips",  "face", null],
        default: null
    },
    isPublished: { type: Boolean, default: true }
}, { timestamps: true });

// 🔹 Automatically update min/max price & discount before saving
productSchema.pre('save', async function (next) {
    // reset slugs array
    // Do not regenerate slugs if already created in controller
    if (Array.isArray(this.slugs) && this.slugs.length > 0) {
        return next();
    }

    // If slugs empty only then generate
    this.slugs = [];

    // brand + category slug must already be set before this hook
    const brandSlugPart = this.brandSlug || "";
    const catSlugPart = this.categorySlug || "";

    if (this.variants?.length > 0) {
        for (let v of this.variants) {
            const shade = v.shadeName ? v.shadeName.trim() : "";
            const slugBase = [
                this.name,
                shade,
                brandSlugPart,
                catSlugPart,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            const slug = await generateUniqueSlug(
                mongoose.model("Product"),
                slugBase,
                this._id
            );

            this.slugs.push(slug);
        }
    } else {
        // single shade / no variants
        const slugBase = [
            this.name,
            this.variant,
            brandSlugPart,
            catSlugPart,
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        const slug = await generateUniqueSlug(
            mongoose.model("Product"),
            slugBase,
            this._id
        );

        this.slugs.push(slug);
    }

    // after pushing all slugs → check duplicates across db
    const duplicate = await mongoose.model("Product").findOne({
        slugs: { $in: this.slugs },
        _id: { $ne: this._id }
    }).select("_id name");

    if (duplicate) {
        const err = new Error("Duplicate variant slug detected");
        err.code = "DUPLICATE_VARIANT_SLUG";
        return next(err);
    }


    if (this.variants?.length) {
        const prices = this.variants
            .map(v => v.discountedPrice ?? this.discountedPrice ?? this.price)
            .filter(v => typeof v === "number");
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

// productSchema.pre('findOneAndUpdate', async function (next) {
//     const update = this.getUpdate();
//     if (!update) return next();

//     const needsSlug =
//         update.name ||
//         update.variant ||
//         update.brandSlug ||
//         update.categorySlug;

//     if (!needsSlug) return next();

//     const docToUpdate = await this.model.findOne(this.getQuery());
//     if (!docToUpdate) return next();

//     const shadePart =
//         update.variant ??
//         docToUpdate.variant ??
//         (docToUpdate.variants?.length === 1
//             ? docToUpdate.variants[0]?.shadeName
//             : null);

//     const slugBase = [
//         update.name ?? docToUpdate.name,
//         shadePart,
//         update.brandSlug ?? docToUpdate.brandSlug,
//         update.categorySlug ?? docToUpdate.categorySlug
//     ]

//         .filter(Boolean)
//         .join(" ");

//     update.slug = await generateUniqueSlug(
//         this.model,
//         slugBase,
//         docToUpdate._id
//     );

//     this.setUpdate(update);
//     next();
// });

// 🚀 ULTRA PERFORMANCE INDEXES — copy paste as is
productSchema.index({ name: 1, brand: 1, category: 1, variant: 1 });
productSchema.index({ isPublished: 1, category: 1, price: 1 });
productSchema.index({ isPublished: 1, brand: 1 });
productSchema.index({ isPublished: 1, avgRating: -1 });
productSchema.index({ isPublished: 1, minPrice: 1, maxPrice: 1 });
productSchema.index({ isPublished: 1, discountPercent: -1 });

productSchema.index({ "variants.price": 1 });
productSchema.index({ "variants.discountedPrice": 1 });
productSchema.index({ "variants.hex": 1 });
productSchema.index({ "variants.shadeName": 1 });

productSchema.index({ productTags: 1 });
productSchema.index({ skinTypes: 1 });
productSchema.index({ formulation: 1 });

productSchema.index({ createdAt: -1 });

productSchema.index({ name: "text", summary: "text", description: "text" });


export default mongoose.model('Product', productSchema);
