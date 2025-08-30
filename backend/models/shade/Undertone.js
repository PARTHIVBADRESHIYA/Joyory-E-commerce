// models/shade/Undertone.js
import mongoose from "mongoose";

const undertoneSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true }, // "warm","cool","neutral","olive"
    name: { type: String, required: true },
    order: { type: Number, default: 0 },
    image: { type: String, default: "" },                // image shown on step 1
    description: { type: String, default: "" },          // hint text for UI
    active: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model("Undertone", undertoneSchema);
