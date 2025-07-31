// models/ProductAttribute.js
import mongoose from 'mongoose';

const attributeSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    options: [{ type: String, required: true }],
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
}, { timestamps: true });

export default mongoose.model('ProductAttribute', attributeSchema);
