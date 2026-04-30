const Milestone = require("../models/Milestones");

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