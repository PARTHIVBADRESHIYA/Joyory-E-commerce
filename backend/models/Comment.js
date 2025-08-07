// models/Comment.js
import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
    blogId: { type: mongoose.Schema.Types.ObjectId, ref: 'Blog', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    image: { type: String }, // Optional uploaded image
    reactions: {
        like: { type: Number, default: 0 },
        love: { type: Number, default: 0 },
        fire: { type: Number, default: 0 },
        sad: { type: Number, default: 0 }
    }
}, { timestamps: true });

export default mongoose.model('Comment', commentSchema);
