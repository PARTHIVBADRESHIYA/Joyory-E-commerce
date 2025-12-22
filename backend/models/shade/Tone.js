// models/shade/Tone.js
import mongoose from "mongoose";

const toneSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true }, // e.g. "fair"
    name: { type: String, required: true },              // "Fair"
    order: { type: Number, default: 0 },
    swatchHex: { type: String, default: "" },            // optional UI chip
    heroImages: {
        type: [String],
        validate: [arr => arr.length <= 6, "Max 6 images allowed"]
    },
    active: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model("Tone", toneSchema);
