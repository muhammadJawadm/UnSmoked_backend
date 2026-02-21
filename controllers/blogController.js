const Blog = require("../models/Blog");

exports.createBlog = async (req, res) => {
    try {
        const { title, description, image = [] } = req.body;
        const userId = req.user.id;
        const blog = await Blog.create({ title, description, image, userId });
        res.status(201).json({ success: true, message: "Blog created successfully", blog });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllBlogs = async (req, res) => {
    try {
        const blogs = await Blog.find().populate("userId", "name profile_image").sort({ createdAt: -1 });
        res.status(200).json({ success: true, blogs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getBlogById = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id).populate("userId", "name profile_image");
        res.status(200).json({ success: true, blog });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateBlog = async (req, res) => {
    try {
        const { title, description, image } = req.body;
        const userId = req.user.id;

        // First, check if blog exists and verify ownership
        const blog = await Blog.findById(req.params.id);
        if (!blog) {
            return res.status(404).json({ success: false, message: "Blog not found" });
        }
        if (blog.userId.toString() !== userId) {
            return res.status(403).json({ success: false, message: "You are not authorized to update this blog" });
        }

        // Now perform the update
        const updatedBlog = await Blog.findByIdAndUpdate(req.params.id, { title, description, image }, { new: true });
        res.status(200).json({ success: true, message: "Blog updated successfully", blog: updatedBlog });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteBlog = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // First, check if blog exists and verify ownership
        const blog = await Blog.findById(id);
        if (!blog) {
            return res.status(404).json({ success: false, message: "Blog not found" });
        }
        if (blog.userId.toString() !== userId) {
            return res.status(403).json({ success: false, message: "You are not authorized to delete this blog" });
        }

        // Now delete the blog
        await Blog.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: "Blog deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
