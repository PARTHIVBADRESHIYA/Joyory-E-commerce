import Blog from '../models/Blog.js';
import moment from 'moment';
import { uploadToCloudinary } from '../middlewares/upload.js';
import Comment from '../models/Comment.js';
import { io } from '../server.js'
import mongoose from 'mongoose';
// Create Blog
export const createBlog = async (req, res) => {
    try {
        const { title, description, category } = req.body;
        let image = "";
        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer, "blogs");
            image = result.secure_url; // only the URL string
        }
        const blog = await Blog.create({ title, description, category, image });
        res.status(201).json({ message: 'Blog created successfully', blog });
    } catch (error) {
        res.status(500).json({ message: 'Failed to create blog', error: error.message });
    }
};

export const updateBlog = async (req, res) => {
    try {
        const { id } = req.params; // blog ID from URL
        const { title, description, category } = req.body;

        // Find the blog first
        const blog = await Blog.findById(id);
        if (!blog) return res.status(404).json({ message: 'Blog not found' });

        // Update fields if provided
        if (title) blog.title = title;
        if (description) blog.description = description;
        if (category) blog.category = category;

        // Handle new image upload if provided
        if (req.file && req.file.buffer) {
            const result = await uploadToCloudinary(req.file.buffer, "blogs");
            blog.image = result.secure_url; // Update the image URL
        }

        await blog.save(); // Save updated blog

        res.status(200).json({ message: 'Blog updated successfully', blog });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update blog', error: error.message });
    }
};


export const getBlogById = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);
        if (!blog) return res.status(404).json({ message: "Blog not found" });

        const comments = await Comment.find({ blogId: blog._id })
            .populate("userId", "name avatar");

        res.status(200).json({
            ...blog.toObject(),
            comments
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch blog details",
            error: error.message
        });
    }
};

export const getAllBlogs = async (req, res) => {
    try {
        const { category, limit, sortBy } = req.query;
        const query = category ? { category } : {};

        // Sorting Logic
        let sortOption = { createdAt: -1 }; // Default: Most Recent
        if (sortBy === 'title') sortOption = { title: 1 };              // A–Z
        else if (sortBy === 'oldest') sortOption = { createdAt: 1 };    // Oldest First

        const blogs = await Blog.find(query)
            .sort(sortOption)
            .limit(limit ? parseInt(limit) : 0);

        const formatted = blogs.map(blog => ({
            id: blog._id,
            title: blog.title,
            slug: blog.slug,
            image: blog.image,
            category: blog.category,
            createdAt: blog.createdAt,
            postedAgo: moment(blog.createdAt).fromNow()
        }));

        res.status(200).json(formatted);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch blogs', error: error.message });
    }
};


// controllers/blogController.js

export const getBlogCategories = async (req, res) => {
    try {
        const categories = await Blog.distinct('category'); // get unique categories
        res.status(200).json(categories);
    } catch (err) {
        res.status(500).json({ message: 'Failed to fetch categories', error: err.message });
    }
};

export const getBlogBySlug = async (req, res) => {
    try {
        const blog = await Blog.findOne({ slug: req.params.slug });
        if (!blog) return res.status(404).json({ message: "Blog not found" });

        const comments = await Comment.find({ blogId: blog._id })
            .populate("userId", "name avatar");

        res.status(200).json({
            ...blog.toObject(),
            comments
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch blog",
            error: error.message
        });
    }
};

export const deleteBlog = async (req, res) => {
    try {
        const { id } = req.params;

        const blog = await Blog.findByIdAndDelete(id);
        if (!blog) {
            return res.status(404).json({ message: "Blog not found" });
        }

        // 🔥 Delete all comments of this blog
        await Comment.deleteMany({ id });

        res.status(200).json({
            message: "Blog and all its comments deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to delete blog",
            error: error.message
        });
    }
};


export const deleteComment = async (req, res) => {
    try {
        const id = req.params.id.trim();

        // Convert string to ObjectId
        const objectId = new mongoose.Types.ObjectId(id);

        const deleted = await Comment.findByIdAndDelete(objectId);

        if (!deleted) {
            return res.status(404).json({ message: "Comment not found", id });
        }

        io.emit("commentDeleted", { commentId: id });

        res.status(200).json({ message: "Comment deleted successfully" });

    } catch (error) {
        res.status(500).json({
            message: "Failed to delete comment",
            error: error.message,
        });
    }
};


