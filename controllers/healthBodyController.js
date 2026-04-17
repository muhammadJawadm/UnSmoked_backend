const HealthBody = require("../models/HealthBody");

// ─────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────

/**
 * POST /health-body
 * Admin: Create a new Health & Body tip
 */
exports.createHealthBody = async (req, res) => {
    try {
        const { title, description, category, category_tag, icon, read_time, is_active, sort_order } = req.body;
        if (!title || !description || !category) {
            return res.status(400).json({ success: false, message: "Title, description, and category are required" });
        }
        const healthBody = await HealthBody.create({ title, description, category, category_tag, icon, read_time, is_active, sort_order });
        res.status(201).json({ success: true, message: "Health & Body tip created successfully", healthBody });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /health-body
 * Public: Get all active Health & Body tips
 * Supports optional ?category= filter
 */
exports.getAllHealthBody = async (req, res) => {
    try {
        const filter = { is_active: true };
        if (req.query.category) {
            filter.category = req.query.category;
        }
        const healthBodyTips = await HealthBody.find(filter).sort({ sort_order: 1, createdAt: -1 });
        res.status(200).json({ success: true, message: "Health & Body tips fetched successfully", healthBodyTips });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /health-body/all
 * Admin: Get all Health & Body tips including inactive ones
 */
exports.getAllHealthBodyAdmin = async (req, res) => {
    try {
        const healthBodyTips = await HealthBody.find().sort({ sort_order: 1, createdAt: -1 });
        res.status(200).json({ success: true, message: "Health & Body tips fetched successfully", healthBodyTips });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /health-body/categories
 * Public: Get list of available categories
 */
exports.getCategories = async (req, res) => {
    try {
        const categories = HealthBody.schema.path("category").enumValues;
        res.status(200).json({ success: true, categories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /health-body/:id
 * Get a single Health & Body tip by ID
 */
exports.getHealthBody = async (req, res) => {
    try {
        const healthBody = await HealthBody.findById(req.params.id);
        if (!healthBody) {
            return res.status(404).json({ success: false, message: "Health & Body tip not found" });
        }
        res.status(200).json({ success: true, message: "Health & Body tip fetched successfully", healthBody });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * PUT /health-body/:id
 * Admin: Update a Health & Body tip
 */
exports.updateHealthBody = async (req, res) => {
    try {
        const { title, description, category, category_tag, icon, read_time, is_active, sort_order } = req.body;
        const healthBody = await HealthBody.findByIdAndUpdate(
            req.params.id,
            { title, description, category, category_tag, icon, read_time, is_active, sort_order },
            { new: true, runValidators: true }
        );
        if (!healthBody) {
            return res.status(404).json({ success: false, message: "Health & Body tip not found" });
        }
        res.status(200).json({ success: true, message: "Health & Body tip updated successfully", healthBody });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * DELETE /health-body/:id
 * Admin: Delete a Health & Body tip
 */
exports.deleteHealthBody = async (req, res) => {
    try {
        const healthBody = await HealthBody.findByIdAndDelete(req.params.id);
        if (!healthBody) {
            return res.status(404).json({ success: false, message: "Health & Body tip not found" });
        }
        res.status(200).json({ success: true, message: "Health & Body tip deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
