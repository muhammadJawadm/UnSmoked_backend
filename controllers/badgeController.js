const BadgeTemplate = require("../models/BadgeTemplate");
const Badges = require("../models/Badges");
const { checkAndAssignBadge, getUserBadges } = require("../services/badgeService");
const { uploadToCloudinary } = require("../utils/cloudinary");

// ─── ADMIN: Badge Template CRUD ──────────────────────────────────────────────

// Create a new badge template (admin only)
exports.createBadgeTemplate = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ success: false, message: "Admin access required" });
        }

        const { title, description, imageUrl, type, conditionValue, isActive } = req.body;

        if (!title || !imageUrl || !type || conditionValue === undefined) {
            return res.status(400).json({
                success: false,
                message: "title, imageUrl, type, and conditionValue are required",
            });
        }

        const template = await BadgeTemplate.create({
            title,
            description: description ?? null,
            imageUrl,
            type,
            conditionValue,
            isActive: isActive !== undefined ? isActive : true,
        });

        res.status(201).json({
            success: true,
            message: "Badge template created successfully",
            template,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get all badge templates
exports.getAllBadgeTemplates = async (req, res) => {
    try {
        const { type, isActive } = req.query;
        const filter = {};

        if (type) filter.type = type;
        if (isActive !== undefined) filter.isActive = isActive === "true";

        const templates = await BadgeTemplate.find(filter).sort({ type: 1, conditionValue: 1 });
        res.status(200).json({ success: true, templates });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get a single badge template
exports.getBadgeTemplateById = async (req, res) => {
    try {
        const template = await BadgeTemplate.findById(req.params.id);
        if (!template) {
            return res.status(404).json({ success: false, message: "Badge template not found" });
        }
        res.status(200).json({ success: true, template });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Update a badge template (admin only)
exports.updateBadgeTemplate = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ success: false, message: "Admin access required" });
        }

        const { title, description, imageUrl, type, conditionValue, isActive } = req.body;
        const template = await BadgeTemplate.findByIdAndUpdate(
            req.params.id,
            { title, description, imageUrl, type, conditionValue, isActive },
            { new: true, runValidators: true }
        );

        if (!template) {
            return res.status(404).json({ success: false, message: "Badge template not found" });
        }

        res.status(200).json({
            success: true,
            message: "Badge template updated successfully",
            template,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Delete a badge template (admin only)
exports.deleteBadgeTemplate = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ success: false, message: "Admin access required" });
        }

        const template = await BadgeTemplate.findByIdAndDelete(req.params.id);
        if (!template) {
            return res.status(404).json({ success: false, message: "Badge template not found" });
        }

        // Also clean up any badge assignments referencing this template
        await Badges.deleteMany({ badge: template._id });

        res.status(200).json({
            success: true,
            message: "Badge template and related assignments deleted successfully",
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── USER: Badge Endpoints ───────────────────────────────────────────────────

// Get current user's badges
exports.getMyBadges = async (req, res) => {
    try {
        const badges = await getUserBadges(req.user.id);
        res.status(200).json({ success: true, count: badges.length, badges });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get any user's badges by userId
exports.getUserBadges = async (req, res) => {
    try {
        const badges = await getUserBadges(req.params.userId);
        res.status(200).json({ success: true, count: badges.length, badges });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Manually trigger badge check for a user (admin/debug)
exports.triggerBadgeCheck = async (req, res) => {
    try {
        const { userId, milestoneType, currentValue } = req.body;

        if (!userId || !milestoneType || currentValue === undefined) {
            return res.status(400).json({
                success: false,
                message: "userId, milestoneType, and currentValue are required",
            });
        }

        const newBadges = await checkAndAssignBadge(userId, milestoneType, currentValue);

        res.status(200).json({
            success: true,
            message: newBadges.length
                ? `${newBadges.length} new badge(s) assigned`
                : "No new badges earned",
            newBadges,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── ADMIN: Manually assign a badge to any user (for testing / special awards) ─

exports.manualAssignBadge = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ success: false, message: "Admin access required" });
        }

        const { userId, badgeTemplateId } = req.body;

        if (!userId || !badgeTemplateId) {
            return res.status(400).json({
                success: false,
                message: "userId and badgeTemplateId are required",
            });
        }

        const template = await BadgeTemplate.findById(badgeTemplateId);
        if (!template) {
            return res.status(404).json({ success: false, message: "Badge template not found" });
        }

        // Prevent duplicate
        const already = await Badges.findOne({ userId, badge: badgeTemplateId });
        if (already) {
            return res.status(409).json({ success: false, message: "User already has this badge" });
        }

        const badge = await Badges.create({ userId, badge: badgeTemplateId, earnedAt: new Date() });

        // Keep User.badges array in sync
        const User = require("../models/User");
        await User.findByIdAndUpdate(userId, {
            $addToSet: { badges: badgeTemplateId },
        });

        const populated = await badge.populate("badge", "title description imageUrl type conditionValue");

        res.status(201).json({
            success: true,
            message: "Badge manually assigned",
            badge: populated,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─── ADMIN: Upload badge image to Cloudinary ─────────────────────────────────

exports.uploadBadgeImage = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ success: false, message: "Admin access required" });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No image file provided" });
        }

        const result = await uploadToCloudinary(req.file.buffer, "badges");

        res.status(200).json({
            success: true,
            message: "Image uploaded successfully",
            imageUrl: result.secure_url,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
