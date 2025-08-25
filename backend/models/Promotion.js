


import mongoose from "mongoose";

const promotionSchema = new mongoose.Schema(
    {
        campaignName: { type: String, required: true },
        description: String,

        // Status auto-handled by dates
        status: {
            type: String,
            enum: ["active", "inactive", "upcoming", "expired"],
            default: "inactive",
        },

        promotionType: {
            type: String,
            enum: ["discount", "bundle", "buy1get1"],
            required: true,
        },

        // Target audience
        targetAudience: {
            type: String,
            enum: ["all", "new", "existing"],
            default: "all",
        },
        images: [{ type: String }],// 🔁 Add this for multi-images
        // Scope: product/category
        scope: { type: String, enum: ["category", "product"], default: "product" },

        // ✅ categories reference with extra fields
        categories: [
            {
                category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" }, // reference
                slug: { type: String }, // store category slug
                customId: { type: String }, // store plain id string if needed
            },
        ],

        // ✅ products reference
        products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],

        // Discount config
        discountUnit: { type: String, enum: ["percent", "amount"], default: "percent" },
        discountValue: { type: Number, default: 0 },

        // Duration
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },

        // Tracking
        promoCodes: [String],
        conversions: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// 🔹 Auto countdown virtual
promotionSchema.virtual("countdown").get(function () {
    const now = new Date();
    const end = new Date(this.endDate);
    const diff = end - now;
    if (diff <= 0)
        return { days: 0, hours: 0, minutes: 0, seconds: 0 };

    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return { days, hours, minutes, seconds };
});

promotionSchema.set("toJSON", { virtuals: true });
promotionSchema.set("toObject", { virtuals: true });

promotionSchema.index({ status: 1, startDate: 1, endDate: 1 });

export default mongoose.model("Promotion", promotionSchema);
