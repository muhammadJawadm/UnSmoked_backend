const Task = require("../models/Task");

exports.createTask = async (req, res) => {
    try {
        const { title, description, xps_points, is_custom, categoryId } = req.body;
        const userId = req.user.id;
        const task = await Task.create({
            categoryId,
            title,
            description,
            xps_points,
            is_custom,
            userId
        });
        res.status(201).json({ success: true, message: "Task created successfully", task });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllTasks = async (req, res) => {
    try {
        const tasks = await Task.find()
            .populate("userId", "name profile_image")
            .populate("categoryId", "name")
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, tasks });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getTaskById = async (req, res) => {
    try {
        const task = await Task.findById(req.params.id)
            .populate("userId", "name profile_image")
            .populate("categoryId", "name");
        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }
        res.status(200).json({ success: true, task });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateTask = async (req, res) => {
    try {
        const { title, description, xps_points, is_custom, categoryId } = req.body;
        const userId = req.user.id;

        // First, check if task exists and verify ownership
        const existingTask = await Task.findById(req.params.id);
        if (!existingTask) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }
        if (existingTask.userId.toString() !== userId) {
            return res.status(403).json({ success: false, message: "You are not authorized to update this task" });
        }

        // Now perform the update
        const task = await Task.findByIdAndUpdate(
            req.params.id,
            { title, description, xps_points, is_custom, categoryId },
            { new: true }
        ).populate("categoryId", "name");

        res.status(200).json({ success: true, message: "Task updated successfully", task });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteTask = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // First, check if task exists and verify ownership
        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({ success: false, message: "Task not found" });
        }
        if (task.userId.toString() !== userId) {
            return res.status(403).json({ success: false, message: "You are not authorized to delete this task" });
        }

        // Now delete the task
        await Task.findByIdAndDelete(id);
        res.status(200).json({ success: true, message: "Task deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
