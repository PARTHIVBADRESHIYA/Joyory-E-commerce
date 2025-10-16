import mongoose from "mongoose";

const formulationSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true }, // e.g. "liquid", "powder"
    name: { type: String, required: true },              // display name
    order: { type: Number, default: 0 },                 // for sorting
    image: { type: String },                             // uploaded image
}, { timestamps: true });

export default mongoose.model("Formulation", formulationSchema);
    