const MotivationalTip = require("../models/MotivationalTip");

exports.createMotivationalTip = async (req, res) => {
    try {
        const { tip, category, is_active } = req.body;
        const motivationalTip = new MotivationalTip({ tip, category, is_active });
        await motivationalTip.save();
        res.status(201).json({ message: "Motivational tip created successfully", motivationalTip });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getAllMotivationalTips = async (req, res) => {
    try {
        const motivationalTips = await MotivationalTip.find();
        res.status(200).json({ message: "Motivational tips fetched successfully", motivationalTips });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getMotivationalTip = async (req, res) => {
    try {
        const motivationalTip = await MotivationalTip.findById(req.params.id);
        if (!motivationalTip) {
            return res.status(404).json({ message: "Motivational tip not found" });
        }
        res.status(200).json({ message: "Motivational tip fetched successfully", motivationalTip });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateMotivationalTip = async (req, res) => {
    try {
        const { tip, category, is_active } = req.body;
        const motivationalTip = await MotivationalTip.findByIdAndUpdate(
            req.params.id,
            { tip, category, is_active },
            { new: true }
        );
        if (!motivationalTip) {
            return res.status(404).json({ message: "Motivational tip not found" });
        }
        res.status(200).json({ message: "Motivational tip updated successfully", motivationalTip });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteMotivationalTip = async (req, res) => {
    try {
        const motivationalTip = await MotivationalTip.findByIdAndDelete(req.params.id);
        if (!motivationalTip) {
            return res.status(404).json({ message: "Motivational tip not found" });
        }
        res.status(200).json({ message: "Motivational tip deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};