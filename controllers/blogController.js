import Blog from '../models/Blog.js';

// Create Blog
export const createBlog = async (req, res) => {
    try {
        const { title, description, category } = req.body;
        const image = req.file?.path || ''; // assuming you're using multer

        const blog = await Blog.create({ title, description, category, image });
        res.status(201).json({ message: 'Blog created successfully', blog });
    } catch (error) {
        res.status(500).json({ message: 'Failed to create blog', error: error.message });
    }
};

// Get Blog Details
export const getBlogById = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);
        if (!blog) return res.status(404).json({ message: 'Blog not found' });
        res.status(200).json(blog);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch blog details', error: error.message });
    }
};

// Get All Blogs (List)
export const getAllBlogs = async (req, res) => {
    try {
        const blogs = await Blog.find().sort({ createdAt: -1 });
        const formatted = blogs.map(blog => ({
            id: blog._id,
            title: blog.title,
            image: blog.image,
            category: blog.category,
            createdAt: blog.createdAt,
            postedAgo: moment(blog.createdAt).fromNow() // ⬅️ time ago

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
