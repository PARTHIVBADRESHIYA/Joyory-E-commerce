// models/shade/Family.js
import mongoose from "mongoose";

const familySchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true }, // "ivory-pink"
    name: { type: String, required: true },              // "Ivory Pink"
    toneKeys: [{ type: String, required: true }],        // ["fair","light"]
    undertoneKeys: [{ type: String, required: true }],   // ["warm","neutral"]
    order: { type: Number, default: 0 },
    sampleImages: [{ type: String }],                    // for UI cards
    // Optional: lab values for improved matching
    lab: {
        L: Number,
        a: Number,
        b: Number
    },
    active: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model("ShadeFamily", familySchema);
