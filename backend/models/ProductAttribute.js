// // models/ProductAttribute.js
// import mongoose from 'mongoose';

// const attributeSchema = new mongoose.Schema({
//     name: { type: String, required: true },
//     type: { type: String, required: true },
//     options: [{ type: String, required: true }],
//     categories: [
//         { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true }
//     ],  // linked to Category schema
//     status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
// }, { timestamps: true });

// attributeSchema.index({ name: 1, categories: 1 }, { unique: true });


// export default mongoose.model('ProductAttribute', attributeSchema);




import mongoose from 'mongoose';

const categoryOptionSchema = new mongoose.Schema({
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    options: [{ type: String, required: true }] // only the subset of options allowed for this category
});

const attributeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { type: String, required: true },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    categoryOptions: [categoryOptionSchema] // ✅ category-specific options
}, { timestamps: true });

export default mongoose.model('ProductAttribute', attributeSchema);
