const Blog = require("../models/Blog");
const User = require("../models/User");


exports.createBlog = async (req, res) => {
    try {
        const userId = req.user.id;

        // Check if the user is an admin
        const user = await User.findById(userId).select("role");
        if (!user || user.role !== "admin") {
            return res.status(403).json({ success: false, message: "Only admins can create blogs" });
        }

        const { title, description, image = [] } = req.body;
        const blog = await Blog.create({ title, description, image, userId });
        res.status(201).json({ success: true, message: "Blog created successfully", blog });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllBlogs = async (req, res) => {
    try {
        const currentPage = Math.max(parseInt(req.query.page) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
        const skip = (currentPage - 1) * pageSize;

        const [results, totalItems] = await Promise.all([
            Blog.find()
                .populate("userId", "name profile_picture")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(pageSize),
            Blog.countDocuments()
        ]);

        const totalPages = Math.ceil(totalItems / pageSize);

        res.status(200).json({
            success: true,
            pagination: {
                currentPage,
                totalPages,
                totalItems,
                pageSize,
                itemsCount: results.length,
                results,
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getBlogById = async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id).populate("userId", "name profile_picture");
        res.status(200).json({ success: true, blog });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateBlog = async (req, res) => {
    try {
        const { title, description, image } = req.body;
        const userId = req.user.id;

        // Check if the user is an admin
        const user = await User.findById(userId).select("role");
        if (!user || user.role !== "admin") {
            return res.status(403).json({ success: false, message: "Only admins can update blogs" });
        }

        // First, check if blog exists
        const blog = await Blog.findById(req.params.id);
        if (!blog) {
            return res.status(404).json({ success: false, message: "Blog not found" });
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

        // Check if the user is an admin
        const user = await User.findById(userId).select("role");
        if (!user || user.role !== "admin") {
            return res.status(403).json({ success: false, message: "Only admins can delete blogs" });
        }

        // First, check if blog exists
        const blog = await Blog.findById(id);
        if (!blog) {
            return res.status(404).json({ success: false, message: "Blog not found" });
        }

        // Now delete the blog
        await Blog.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: "Blog deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
