import mongoose from 'mongoose';

const blogSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    image: { type: String }, // image URL or file path
    category: { type: String, enum: ['Productivity', 'Entrepreneur', 'Marketing', 'Technology'], required: true },
}, { timestamps: true });

export default mongoose.model('Blog', blogSchema);
