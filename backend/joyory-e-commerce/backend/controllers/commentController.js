// controllers/commentController.js
import Comment from '../models/Comment.js';
import { io } from '../server.js';


export const createComment = async (req, res) => {
    try {
        const { text } = req.body;
        const image = req.file?.path || '';
        const { blogId } = req.params;

        const comment = await Comment.create({
            blogId,
            userId: req.user._id, // from middleware
            text,
            image
        });

        io.emit('newComment', {
            blogId,
            comment: {
                _id: comment._id,
                text: comment.text,
                image: comment.image,
                userId: req.user._id,
                createdAt: comment.createdAt
            }
        });


        res.status(201).json({ message: 'Comment added', comment });
    } catch (error) {
        res.status(500).json({ message: 'Failed to post comment', error: error.message });
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
