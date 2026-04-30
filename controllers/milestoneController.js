const Milestone = require("../models/Milestones");
const UserMilestone = require("../models/UserMilestone");

exports.createMilestone = async (req, res) => {
    try {
        const { title, description, badge_image } = req.body;
        const milestone = await Milestone.create({ title, description, badge_image });
        res.status(201).json({ success: true, message: "Milestone created successfully", milestone });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllMilestones = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
        const skip = (page - 1) * limit;

        const totalItems = await Milestone.countDocuments();
        const totalPages = Math.ceil(totalItems / limit);

        const milestones = await Milestone.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.status(200).json({
            success: true,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems,
                pageSize: limit,
                itemsCount: milestones.length,
                results: milestones,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getMilestoneById = async (req, res) => {
    try {
        const milestone = await Milestone.findById(req.params.id);
        if (!milestone) {
            return res.status(404).json({ success: false, message: "Milestone not found" });
        }
        res.status(200).json({ success: true, milestone });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateMilestone = async (req, res) => {
    try {
        const { title, description, badge_image } = req.body;
        const milestone = await Milestone.findByIdAndUpdate(
            req.params.id,
            { title, description, badge_image },
            { new: true }
        );
        if (!milestone) {
            return res.status(404).json({ success: false, message: "Milestone not found" });
        }
        res.status(200).json({ success: true, message: "Milestone updated successfully", milestone });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteMilestone = async (req, res) => {
    try {
        const milestone = await Milestone.findByIdAndDelete(req.params.id);
        if (!milestone) {
            return res.status(404).json({ success: false, message: "Milestone not found" });
        }
        res.status(200).json({ success: true, message: "Milestone deleted successfully", milestone });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getUserAchievedMilestones = async (req, res) => {
    try {
        const userId = req.user.id;
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
        const skip = (page - 1) * limit;

        const totalItems = await UserMilestone.countDocuments({ userId });
        const totalPages = Math.ceil(totalItems / limit);

        const userMilestones = await UserMilestone.find({ userId })
            .populate("milestoneId")
            .sort({ achieved_at: -1 })
            .skip(skip)
            .limit(limit);

        res.status(200).json({
            success: true,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems,
                pageSize: limit,
                itemsCount: userMilestones.length,
                results: userMilestones,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.createUserMilestone = async (req, res) => {
    try {
        const { milestoneId } = req.body;
        const userId = req.user.id;

        if (!milestoneId) {
            return res.status(400).json({ success: false, message: "Milestone ID is required" });
        }

        // Check if milestone exists
        const milestone = await Milestone.findById(milestoneId);
        if (!milestone) {
            return res.status(404).json({ success: false, message: "Milestone not found" });
        }

        // Check if already achieved
        const existingUserMilestone = await UserMilestone.findOne({ userId, milestoneId });
        if (existingUserMilestone) {
            return res.status(400).json({ success: false, message: "Milestone already achieved by user" });
        }

        const userMilestone = await UserMilestone.create({ userId, milestoneId });
        
        res.status(201).json({ 
            success: true, 
            message: "User milestone created successfully", 
            userMilestone 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};