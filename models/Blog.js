// models/Blog.js
import mongoose from 'mongoose';
import slugify from 'slugify'; // install this package

const blogSchema = new mongoose.Schema({
    title: { type: String, required: true },
    slug: { type: String, unique: true },
    description: { type: String, required: true },
    image: { type: String },
    category: { 
        type: String, 
        enum: ['Productivity', 'Entrepreneur', 'Marketing', 'Technology', 'Face', 'Lips', 'Eyes', 'Makeup', 'Skincare', 'Beauty Trends'], 
        required: true 
    },
}, { timestamps: true });

// Auto-generate slug from title before saving
blogSchema.pre('save', function (next) {
    if (!this.isModified('title')) return next();
    this.slug = slugify(this.title, { lower: true, strict: true });
    next();
});

export default mongoose.model('Blog', blogSchema);
