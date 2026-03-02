const Post = require("../models/Post");
const PostHide = require("../models/PostHide");

exports.hidePost = async (req, res) => {
    try {
        const { postId } = req.body;
        const userId = req.user.id; 
        
        // Check if the post exists
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ success: false, message: "Post not found" });
        }

        // Check if already hidden
        const existing = await PostHide.findOne({ userId, postId });
        if (existing) {
            return res.status(400).json({ success: false, message: "Post is already hidden" });
        }

        const postHide = await PostHide.create({ userId, postId });

        res.status(201).json({ success: true, message: "Post hidden successfully", postHide });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.checkHiddenPosts = async (req, res) => {
    try {
        const userId = req.user.id;
        const hiddenPosts = await PostHide.find({ userId }).select("postId -_id");
        const hiddenPostIds = hiddenPosts.map(hide => hide.postId);
        res.status(200).json({ success: true, hiddenPostIds });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    } 
};