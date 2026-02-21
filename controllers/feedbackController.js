const Feedback = require("../models/Feedback");

// Create Feedback
exports.createFeedback = async (req, res) => {
    try {
        const { message, rating } = req.body;
        const userId = req.user.id;
        const feedback = await Feedback.create({ message, rating, userId });
        res.status(201).json({ message: "Feedback created successfully", feedback });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get all Feedback
exports.getAllFeedback = async (req, res) => {
    try {
        const feedback = await Feedback.find();
        res.status(200).json({ message: "Feedback fetched successfully", feedback });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get Feedback by ID
exports.getFeedbackById = async (req, res) => {
    try {
        const feedback = await Feedback.findById(req.params.id);
        if (!feedback) {
            return res.status(404).json({ message: "Feedback not found" });
        }
        res.status(200).json({ message: "Feedback fetched successfully", feedback });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update Feedback
exports.updateFeedback = async (req, res) => {
    try {
        const userId = req.user.id;
        const { message, rating } = req.body;

        // First, check if feedback exists and verify ownership
        const feedback = await Feedback.findById(req.params.id);
        if (!feedback) {
            return res.status(404).json({ message: "Feedback not found" });
        }
        if (feedback.userId.toString() !== userId) {
            return res.status(403).json({ message: "You are not authorized to update this feedback" });
        }

        // Now perform the update
        const updatedFeedback = await Feedback.findByIdAndUpdate(
            req.params.id,
            { message, rating },
            { new: true }
        );
        res.status(200).json({ message: "Feedback updated successfully", feedback: updatedFeedback });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Delete Feedback
exports.deleteFeedback = async (req, res) => {
    try {
        const userId = req.user.id;

        // First, check if feedback exists and verify ownership
        const feedback = await Feedback.findById(req.params.id);
        if (!feedback) {
            return res.status(404).json({ message: "Feedback not found" });
        }
        if (feedback.userId.toString() !== userId) {
            return res.status(403).json({ message: "You are not authorized to delete this feedback" });
        }

        // Now delete the feedback
        await Feedback.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: "Feedback deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};