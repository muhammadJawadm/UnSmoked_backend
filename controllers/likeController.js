const Like = require("../models/Like");

exports.addLike = async (req, res) => {
    try {
        const { targetId, targetType } = req.body;
        const userId = req.user.id;

        // Check if already liked
        const existingLike = await Like.findOne({ userId, targetId, targetType });
        if (existingLike) {
            return res.status(400).json({ success: false, message: "You have already liked this item" });
        }

        const like = await Like.create({ userId, targetId, targetType });
        res.status(201).json({ success: true, message: "Like added successfully", like });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.unlike = async (req, res) => {
    try {
        const { targetId, targetType } = req.query;
        const userId = req.user.id;
        const like = await Like.findOneAndDelete({ userId, targetId, targetType });
        if (!like) {
            return res.status(404).json({ success: false, message: "Like not found" });
        }
        res.status(200).json({ success: true, message: "Like removed successfully", like });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.countLikes = async (req, res) => {
    try {
        const { targetType, targetId } = req.query;
        const count = await Like.countDocuments({ targetType, targetId });
        res.status(200).json({ success: true, count });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.checkLikeStatus = async (req, res) => {
    try {
        const { targetId, targetType } = req.query;
        const userId = req.user.id;
        const like = await Like.findOne({ userId, targetId, targetType });
        if (like) {
            return res.status(200).json({ success: true, liked: true });
        }
        res.status(200).json({ success: true, liked: false });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
