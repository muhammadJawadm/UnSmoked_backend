const Post = require("../models/Post");


exports.createPost = async (req, res) => {
    try {
        const { description, media = [] } = req.body;
        const userId = req.user.id;
        const post = await Post.create({ description, media, userId });
        res.status(201).json({ success: true, message: "Post created successfully", post });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllPosts = async (req, res) => {
    try {
        const posts = await Post.find().populate("userId", "name profile_image").sort({ createdAt: -1 });
        res.status(200).json({ success: true, posts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getPostById = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id).populate("userId", "name email profile_image");
        if (!post) {
            return res.status(404).json({ success: false, message: "Post not found" });
        }
        res.status(200).json({ success: true, post });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updatePost = async (req, res) => {
    try {
        const { description, media } = req.body;
        const userId = req.user.id;

        // First, check if post exists and verify ownership
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ success: false, message: "Post not found" });
        }
        if (post.userId.toString() !== userId) {
            return res.status(403).json({ success: false, message: "You are not authorized to update this post" });
        }

        // Now perform the update
        const updatedPost = await Post.findByIdAndUpdate(req.params.id, { description, media }, { new: true });
        res.status(200).json({ success: true, message: "Post updated successfully", post: updatedPost });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deletePost = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // First, check if post exists and verify ownership
        const post = await Post.findById(id);
        if (!post) {
            return res.status(404).json({ success: false, message: "Post not found" });
        }
        if (post.userId.toString() !== userId) {
            return res.status(403).json({ success: false, message: "You are not authorized to delete this post" });
        }

        // Now delete the post
        await Post.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: "Post deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
