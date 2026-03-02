const Post = require("../models/Post");
const PostReport = require("../models/PostReport");

exports.reportPost = async (req, res) => {
    try {
        const { postId, reason } = req.body;
        const userId = req.user.id;

        if (!reason || reason.trim() === "") {
            return res.status(400).json({ success: false, message: "Reason is required" });
        }

        // Check if the post exists
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ success: false, message: "Post not found" });
        }

        // Check if already reported by this user
        const existing = await PostReport.findOne({ userId, postId });
        if (existing) {
            return res.status(400).json({ success: false, message: "You have already reported this post" });
        }

        const postReport = await PostReport.create({ userId, postId, reason });

        res.status(201).json({ success: true, message: "Post reported successfully", postReport });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getMyReportedPosts = async (req, res) => {
    try {
        const userId = req.user.id;
        const reportedPosts = await PostReport.find({ userId }).select("postId -_id");
        const reportedPostIds = reportedPosts.map(report => report.postId);
        res.status(200).json({ success: true, reportedPostIds });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
