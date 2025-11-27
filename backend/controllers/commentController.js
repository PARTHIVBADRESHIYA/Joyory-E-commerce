// controllers/commentController.js
import Comment from '../models/Comment.js';
import { io } from '../server.js';
import { uploadToCloudinary } from '../middlewares/upload.js';

export const createComment = async (req, res) => {
    try {
        const { blogId } = req.params;
        const { text } = req.body;

        // ✅ Initialize image as empty string
        let image = "";

        // ✅ Only upload if file exists and has buffer
        if (req.file && req.file.buffer) {
            const result = await uploadToCloudinary(req.file.buffer, "comments");
            // result could be either string (if helper returns URL) or object (old version)
            // so we ensure we only use secure_url
            image = typeof result === "string" ? result : result.secure_url;
        }

        // ✅ Create comment
        const comment = await Comment.create({
            blogId,
            userId: req.user._id, // from middleware
            text,
            image,
        });

        // ✅ Emit new comment via socket
        io.emit("newComment", {
            blogId,
            comment: {
                _id: comment._id,
                text: comment.text,
                image: comment.image,
                userId: req.user._id,
                createdAt: comment.createdAt,
            },
        });

        res.status(201).json({ message: "Comment added", comment });
    } catch (error) {
        console.error("Create comment error:", error);
        res.status(500).json({ message: "Failed to post comment", error: error.message });
    }
};

export const getCommentsByBlog = async (req, res) => {
    try {
        const comments = await Comment.find({ blogId: req.params.blogId }).populate('userId', 'name avatar');
        res.status(200).json(comments);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch comments', error: error.message });
    }
};

export const reactToComment = async (req, res) => {
    try {
        const { type } = req.body; // like / love / fire / sad
        const comment = await Comment.findById(req.params.commentId);
        if (!comment || !(type in comment.reactions)) {
            return res.status(400).json({ message: 'Invalid reaction type' });
        }

        comment.reactions[type] += 1;
        await comment.save();

        io.emit('reactionUpdate', {
            commentId: comment._id,
            reactions: comment.reactions
        });

        res.status(200).json({ message: 'Reaction recorded', reactions: comment.reactions });
    } catch (error) {
        res.status(500).json({ message: 'Failed to react', error: error.message });
    }
};
