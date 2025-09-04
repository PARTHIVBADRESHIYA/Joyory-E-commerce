// models/Festival.js
import mongoose from "mongoose";
const festivalSchema = new mongoose.Schema({
    name: { type: String, required: true },
    date: { type: Date, required: true }, // single-day; extend to range if needed
    message: { type: String, required: true },
    active: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model("Festival", festivalSchema);
