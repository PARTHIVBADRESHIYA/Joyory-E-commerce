// // models/Brand.js
// import mongoose from "mongoose";

// const brandSchema = new mongoose.Schema(
//     {
//         name: { type: String, required: true, unique: true, trim: true },
//         slug: { type: String, required: true, unique: true },
//         description: { type: String, default: "" },
//         logo: { type: String, default: null },    // Cloudinary URL
//         banner: { type: String, default: null },  // Optional banner image
//         isActive: { type: Boolean, default: true },
//     },
//     { timestamps: true }
// );

// brandSchema.index({ slug: 1 });

// export default mongoose.model("Brand", brandSchema);









// models/Brand.js
import mongoose from "mongoose";

const warehouseSchema = new mongoose.Schema({
    name: { type: String, required: true }, // e.g., "Lakme Default WH"
    code: { type: String, required: true }, // e.g., "lakme_WH_1"
    address: { type: String, default: "" }, // optional
}, { _id: true });

const brandSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, unique: true, trim: true },
        slug: { type: String, required: true, unique: true },
        description: { type: String, default: "" },
        logo: { type: String, default: null },
        banner: { type: String, default: null },
        isActive: { type: Boolean, default: true },

        // ⭐ MULTIPLE WAREHOUSES PER BRAND
        warehouses: { type: [warehouseSchema], default: [] },

        // ⭐ selected primary warehouse for shipments
        primaryWarehouse: { type: String, default: null },
    },
    { timestamps: true }
);

brandSchema.index({ slug: 1 });

export default mongoose.model("Brand", brandSchema);
