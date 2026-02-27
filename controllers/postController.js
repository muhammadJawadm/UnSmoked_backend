const Post = require("../models/Post");
const Like = require("../models/Like");
const Comment = require("../models/Comment");


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
        const currentPage = Math.max(parseInt(req.query.page) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
        const skip = (currentPage - 1) * pageSize;
        const currentUserId = req.user.id;

        const [posts, totalItems] = await Promise.all([
            Post.find()
                .populate("userId", "name profile_image")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(pageSize),
            Post.countDocuments()
        ]);

        const postIds = posts.map(post => post._id);

        // Get likes and comment counts in parallel
        const [userLikes, commentCounts] = await Promise.all([
            Like.find({
                userId: currentUserId,
                targetId: { $in: postIds },
                targetType: "Post"
            }).select("targetId"),
            Comment.aggregate([
                { $match: { targetId: { $in: postIds }, targetType: "Post" } },
                { $group: { _id: "$targetId", count: { $sum: 1 } } }
            ])
        ]);

        const likedPostIds = new Set(userLikes.map(like => like.targetId.toString()));
        const commentCountMap = new Map(commentCounts.map(c => [c._id.toString(), c.count]));

        // Add is_liked and comments_count to each post
        const results = posts.map(post => {
            const postObj = post.toObject();
            postObj.is_liked = likedPostIds.has(post._id.toString());
            postObj.comments_count = commentCountMap.get(post._id.toString()) || 0;
            return postObj;
        });

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
