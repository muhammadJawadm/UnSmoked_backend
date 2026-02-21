const Template = require("../models/Template");

// Get all challenge templates
exports.getAllTemplates = async (req, res) => {
    try {
        const { isActive } = req.query;

        // Build filter
        const filter = {};
        if (isActive !== undefined) {
            filter.isActive = isActive === "true";
        }

        const templates = await Template.find(filter).sort({ createdAt: -1 });
        res.status(200).json({ success: true, templates });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Create challenge template (admin only, or any user for custom templates)
exports.createTemplate = async (req, res) => {
    try {
        const { title, description, category, durationDays, xpReward, isActive, isCustom, } = req.body;
        const createdBy = req.user.id;

        // Only enforce admin check if the template is NOT custom
        if (!isCustom && req.user.role !== "admin") {
            return res.status(403).json({ success: false, message: "Admin access required" });
        }

        // Validation
        if (!title || title.trim() === "") {
            return res.status(400).json({ success: false, message: "Title is required" });
        }
        if (durationDays !== undefined && durationDays < 1) {
            return res.status(400).json({ success: false, message: "Duration must be at least 1 day" });
        }
        if (xpReward !== undefined && xpReward < 0) {
            return res.status(400).json({ success: false, message: "XP reward cannot be negative" });
        }

        const template = await Template.create({
            title,
            description,
            category,
            durationDays,
            xpReward,
            isActive,
            isCustom,
            createdBy
        });

        res.status(201).json({ success: true, message: "Challenge template created successfully", template });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Update challenge template (admin only)
exports.updateTemplate = async (req, res) => {
    try {
        const { title, description, category, durationDays, xpReward, isActive } = req.body;
        const { id } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        // 1️⃣ Fetch template
        const template = await Template.findById(id);

        if (!template) {
            return res.status(404).json({
                success: false,
                message: "Template not found"
            });
        }

        // 2️⃣ If template is custom → only creator can update
        if (template.isCustom && template.createdBy.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "You can only update your own custom templates"
            });
        }

        // 3️⃣ If template is NOT custom → only admin can update
        if (!template.isCustom && userRole !== "admin") {
            return res.status(403).json({
                success: false,
                message: "Admin access required"
            });
        }

        // 4️⃣ Update fields
        template.title = title ?? template.title;
        template.description = description ?? template.description;
        template.category = category ?? template.category;
        template.durationDays = durationDays ?? template.durationDays;
        template.xpReward = xpReward ?? template.xpReward;
        template.isActive = isActive ?? template.isActive;

        await template.save();

        return res.status(200).json({
            success: true,
            message: "Template updated successfully",
            template
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// Delete challenge template (admin only)
exports.deleteTemplate = async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== "admin") {
            return res.status(403).json({ success: false, message: "Admin access required" });
        }

        const template = await Template.findByIdAndDelete(req.params.id);

        if (!template) {
            return res.status(404).json({ success: false, message: "Template not found" });
        }

        res.status(200).json({ success: true, message: "Template deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
