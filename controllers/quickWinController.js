const QuickWin = require("../models/QuickWin");

// ─────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────

/**
 * POST /quick-wins
 * Admin: Create a new Quick Win tip
 */
exports.createQuickWin = async (req, res) => {
    try {
        const { title, description, read_time, icon, is_active, sort_order } = req.body;
        if (!title) {
            return res.status(400).json({ success: false, message: "Title is required" });
        }
        const quickWin = await QuickWin.create({ title, description, read_time, icon, is_active, sort_order });
        res.status(201).json({ success: true, message: "Quick win created successfully", quickWin });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /quick-wins
 * Public: Get all active Quick Wins sorted by sort_order then createdAt
 */
exports.getAllQuickWins = async (req, res) => {
    try {
        const quickWins = await QuickWin.find({ is_active: true }).sort({ sort_order: 1, createdAt: -1 });
        res.status(200).json({ success: true, message: "Quick wins fetched successfully", quickWins });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /quick-wins/all
 * Admin: Get all Quick Wins including inactive ones
 */
exports.getAllQuickWinsAdmin = async (req, res) => {
    try {
        const quickWins = await QuickWin.find().sort({ sort_order: 1, createdAt: -1 });
        res.status(200).json({ success: true, message: "Quick wins fetched successfully", quickWins });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /quick-wins/:id
 * Get a single Quick Win by ID
 */
exports.getQuickWin = async (req, res) => {
    try {
        const quickWin = await QuickWin.findById(req.params.id);
        if (!quickWin) {
            return res.status(404).json({ success: false, message: "Quick win not found" });
        }
        res.status(200).json({ success: true, message: "Quick win fetched successfully", quickWin });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * PUT /quick-wins/:id
 * Admin: Update a Quick Win
 */
exports.updateQuickWin = async (req, res) => {
    try {
        const { title, description, read_time, icon, is_active, sort_order } = req.body;
        const quickWin = await QuickWin.findByIdAndUpdate(
            req.params.id,
            { title, description, read_time, icon, is_active, sort_order },
            { new: true, runValidators: true }
        );
        if (!quickWin) {
            return res.status(404).json({ success: false, message: "Quick win not found" });
        }
        res.status(200).json({ success: true, message: "Quick win updated successfully", quickWin });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * DELETE /quick-wins/:id
 * Admin: Delete a Quick Win
 */
exports.deleteQuickWin = async (req, res) => {
    try {
        const quickWin = await QuickWin.findByIdAndDelete(req.params.id);
        if (!quickWin) {
            return res.status(404).json({ success: false, message: "Quick win not found" });
        }
        res.status(200).json({ success: true, message: "Quick win deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
