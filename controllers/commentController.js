const Comment = require('../models/Comment');

exports.createComment = async (req, res) => {
    try {
        const { targetId, targetType, text } = req.body;
        const userId = req.user.id;
        const comment = await Comment.create({ userId, targetId, targetType, text });
        const populatedComment = await Comment.findById(comment._id).populate("userId", "name profile_picture");
        res.status(201).json({ success: true, message: "Comment created successfully", comment: populatedComment });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllComments = async (req, res) => {
    try {
        const { targetId, targetType } = req.query;
        if (!targetId || !targetType) {
            return res.status(400).json({ success: false, message: "targetId and targetType are required" });
        }

        const currentPage = Math.max(parseInt(req.query.page) || 1, 1);
        const pageSize = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
        const skip = (currentPage - 1) * pageSize;

        const filter = { targetId, targetType };

        const [results, totalItems] = await Promise.all([
            Comment.find(filter)
                .populate("userId", "name profile_picture")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(pageSize),
            Comment.countDocuments(filter)
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

exports.getCommentById = async (req, res) => {
    try {
        const comment = await Comment.findById(req.params.id).populate("userId", "name profile_picture");
        if (!comment) {
            return res.status(404).json({ success: false, message: "Comment not found" });
        }
        res.status(200).json({ success: true, comment });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateComment = async (req, res) => {
    try {
        const userId = req.user.id;
        const { text } = req.body;

        // First, check if comment exists and verify ownership
        const comment = await Comment.findById(req.params.id);
        if (!comment) {
            return res.status(404).json({ success: false, message: "Comment not found" });
        }
        if (comment.userId.toString() !== userId) {
            return res.status(403).json({ success: false, message: "You are not authorized to update this comment" });
        }

        // Now perform the update
        const updatedComment = await Comment.findByIdAndUpdate(req.params.id, { text }, { new: true });
        res.status(200).json({ success: true, message: "Comment updated successfully", comment: updatedComment });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteComment = async (req, res) => {
    try {
        const userId = req.user.id;

        // First, check if comment exists and verify ownership
        const comment = await Comment.findById(req.params.id);
        if (!comment) {
            return res.status(404).json({ success: false, message: "Comment not found" });
        }
        if (comment.userId.toString() !== userId) {
            return res.status(403).json({ success: false, message: "You are not authorized to delete this comment" });
        }

        // Now delete the comment
        await Comment.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: "Comment deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};