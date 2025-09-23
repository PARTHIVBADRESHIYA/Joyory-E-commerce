// // models/Promotion.js
// import mongoose from "mongoose";

// const PromotionSchema = new mongoose.Schema(
//     {
//         campaignName: { type: String, required: true },
//         description: String,
//         status: {
//             type: String,
//             enum: ["active", "inactive", "upcoming", "expired"],
//             default: "inactive",
//         },
//         displaySection: {
//             type: [String],
//             enum: ["banner", "product", "offers"],
//             default: ["product"], // fallback if not set
//         }
// ,
//         // Core types
//         promotionType: {
//             type: String,
//             enum: [
//                 "discount",       // flat percent/amount off
//                 "tieredDiscount", // Buy more save more
//                 "bogo",           // Buy X Get Y
//                 "bundle",         // predefined bundles (Phase 2)
//                 "gift",           // gift on min order (Phase 2)
//                 "freeShipping",   // free shipping over threshold (Phase 2) 
//                 "newUser",        // first order offer (Phase 3)
//                 "paymentOffer",
//                 "collection"   // bank/wallet/upi offers (Phase 3)
//             ],
//             required: true,
//         },
//         tags: [{
//             type: String,
//             enum: ["festival", "seasonal", "collection", "trending", "combo", "special"],
//         }],

//         targetAudience: {
//             type: String,
//             enum: ["all", "new", "existing"],
//             default: "all",
//         },

//         images: [{ type: String }],

//         // Scope
//         scope: { type: String, enum: ["category", "product", "brand", "global"], default: "global" },

//         categories: [
//             {
//                 category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
//                 slug: String,
//                 customId: String,
//             },
//         ],

//         brands: [
//             {
//                 brand: { type: mongoose.Schema.Types.ObjectId, ref: "Brand" },
//                 slug: String,
//                 customId: String,
//             },
//         ],

//         products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],

//         // For discount type
//         discountUnit: { type: String, enum: ["percent", "amount"], default: "percent" },
//         discountValue: { type: Number, default: 0 },

//         // Flexible config for special types
//         promotionConfig: { type: mongoose.Schema.Types.Mixed, default: {} },

//         // Duration
//         startDate: { type: Date, required: true },
//         endDate: { type: Date, required: true },
//         isScheduled: { type: Boolean, default: false }, // 👈 NEW
//         // Tracking
//         promoCodes: [String],
//         conversions: { type: Number, default: 0 },
//     },
//     { timestamps: true }
// );

// // Countdown virtual
// PromotionSchema.virtual("countdown").get(function () {
//     const now = new Date();
//     const end = new Date(this.endDate);
//     const diff = end - now;
//     if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
//     const days = Math.floor(diff / 86400000);
//     const hours = Math.floor((diff % 86400000) / 3600000);
//     const minutes = Math.floor((diff % 3600000) / 60000);
//     const seconds = Math.floor((diff % 60000) / 1000);
//     return { days, hours, minutes, seconds };
// });

// PromotionSchema.set("toJSON", { virtuals: true });
// PromotionSchema.set("toObject", { virtuals: true });

// PromotionSchema.index({ status: 1, startDate: 1, endDate: 1 });

// export default mongoose.model("Promotion", PromotionSchema);

















// models/Promotion.js
import mongoose from "mongoose";

const PromotionSchema = new mongoose.Schema(
    {
        campaignName: { type: String, required: true },
        description: String,
        status: {
            type: String,
            enum: ["active", "inactive", "upcoming", "expired"],
            default: "inactive",
        },
        displaySection: {
            type: [String],
            enum: ["banner", "product", "offers"],
            required: [true, "At least one display section must be selected"],
            validate: {
                validator: function (v) {
                    return Array.isArray(v) && v.length > 0;
                },
                message: "At least one display section must be selected",
            },
        },
        promotionType: {
            type: String,
            enum: [
                "discount",
                "tieredDiscount",
                "bogo",
                "bundle",
                "gift",
                "freeShipping",
                "newUser",
                "paymentOffer",
                "collection",
            ],
            required: true,
        },
        tags: [
            {
                type: String,
                enum: ["festival", "seasonal", "collection", "trending", "combo", "special"],
            },
        ],
        targetAudience: {
            type: String,
            enum: ["all", "new", "existing"],
            default: "all",
        },
        images: [{ type: String }],
        scope: { type: String, enum: ["category", "product", "brand", "global"], default: "global" },
        categories: [
            {
                category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
                slug: String,
                customId: String,
            },
        ],
        brands: [
            {
                brand: { type: mongoose.Schema.Types.ObjectId, ref: "Brand" },
                slug: String,
                customId: String,
            },
        ],
        products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
        discountUnit: { type: String, enum: ["percent", "amount"], default: "percent" },
        discountValue: { type: Number, default: 0 },
        promotionConfig: { type: mongoose.Schema.Types.Mixed, default: {} },
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        isScheduled: { type: Boolean, default: false },
        promoCodes: [String],
        conversions: { type: Number, default: 0 },
    },
    { timestamps: true }
);

PromotionSchema.virtual("countdown").get(function () {
    const now = new Date();
    const end = new Date(this.endDate);
    const diff = end - now;
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return { days, hours, minutes, seconds };
});

PromotionSchema.set("toJSON", { virtuals: true });
PromotionSchema.set("toObject", { virtuals: true });
PromotionSchema.index({ status: 1, startDate: 1, endDate: 1 });

export default mongoose.model("Promotion", PromotionSchema);
