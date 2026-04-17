const SmokeFreeMilestone = require("../models/SmokeFreeMilestone");
const User = require("../models/User");

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/**
 * Compute the status of a milestone for a user based on their smoke-free start time.
 * @param {Date} quitDate  - When the user stopped smoking
 * @param {number} durationMinutes - Milestone threshold in minutes
 * @returns {"done" | "in_progress" | "locked"}
 */
const computeStatus = (quitDate, durationMinutes) => {
    if (!quitDate) return "locked";
    const minutesSinceQuit = (Date.now() - new Date(quitDate).getTime()) / (1000 * 60);
    if (minutesSinceQuit >= durationMinutes) return "done";
    if (minutesSinceQuit >= durationMinutes * 0.5) return "in_progress"; // within 50% of reaching it
    return "locked";
};

// ─────────────────────────────────────────────
// ADMIN CRUD
// ─────────────────────────────────────────────

/**
 * POST /smoke-free-milestones
 * Admin: Create a new Smoke-Free Milestone template
 */
exports.createSmokeFreeMilestone = async (req, res) => {
    try {
        const { title, description, duration_minutes, icon, badge_image, xp_reward, is_active, sort_order } = req.body;
        if (!title || !duration_minutes) {
            return res.status(400).json({ success: false, message: "Title and duration_minutes are required" });
        }
        const milestone = await SmokeFreeMilestone.create({
            title, description, duration_minutes, icon, badge_image, xp_reward, is_active, sort_order
        });
        res.status(201).json({ success: true, message: "Smoke-free milestone created successfully", milestone });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /smoke-free-milestones
 * Public/Admin: Get all active milestone templates (no user progress)
 */
exports.getAllSmokeFreeMilestones = async (req, res) => {
    try {
        const milestones = await SmokeFreeMilestone.find({ is_active: true }).sort({ duration_minutes: 1 });
        res.status(200).json({ success: true, message: "Smoke-free milestones fetched successfully", milestones });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /smoke-free-milestones/all
 * Admin: Get ALL milestones including inactive
 */
exports.getAllSmokeFreeMilestonesAdmin = async (req, res) => {
    try {
        const milestones = await SmokeFreeMilestone.find().sort({ duration_minutes: 1 });
        res.status(200).json({ success: true, message: "Smoke-free milestones fetched successfully", milestones });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /smoke-free-milestones/:id
 * Get a single milestone template by ID
 */
exports.getSmokeFreeMilestone = async (req, res) => {
    try {
        const milestone = await SmokeFreeMilestone.findById(req.params.id);
        if (!milestone) {
            return res.status(404).json({ success: false, message: "Smoke-free milestone not found" });
        }
        res.status(200).json({ success: true, message: "Smoke-free milestone fetched successfully", milestone });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * PUT /smoke-free-milestones/:id
 * Admin: Update a milestone template
 */
exports.updateSmokeFreeMilestone = async (req, res) => {
    try {
        const { title, description, duration_minutes, icon, badge_image, xp_reward, is_active, sort_order } = req.body;
        const milestone = await SmokeFreeMilestone.findByIdAndUpdate(
            req.params.id,
            { title, description, duration_minutes, icon, badge_image, xp_reward, is_active, sort_order },
            { new: true, runValidators: true }
        );
        if (!milestone) {
            return res.status(404).json({ success: false, message: "Smoke-free milestone not found" });
        }
        res.status(200).json({ success: true, message: "Smoke-free milestone updated successfully", milestone });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * DELETE /smoke-free-milestones/:id
 * Admin: Delete a milestone template
 */
exports.deleteSmokeFreeMilestone = async (req, res) => {
    try {
        const milestone = await SmokeFreeMilestone.findByIdAndDelete(req.params.id);
        if (!milestone) {
            return res.status(404).json({ success: false, message: "Smoke-free milestone not found" });
        }
        res.status(200).json({ success: true, message: "Smoke-free milestone deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────
// USER PROGRESS ENDPOINTS
// ─────────────────────────────────────────────

/**
 * GET /smoke-free-milestones/my-progress
 * Authenticated: Returns all milestones with the current user's progress status.
 * Status:
 *   - "done"        → milestone threshold has been passed
 *   - "in_progress" → user is within 50% of reaching it (next upcoming)
 *   - "locked"      → not reached yet
 *
 * The user's quit_date is read from their profile (User.quit_date).
 * If no quit_date is set, all milestones are "locked".
 */
exports.getMyProgress = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId).select("quit_date");
        const quitDate = user?.quit_date || null;

        const milestones = await SmokeFreeMilestone.find({ is_active: true }).sort({ duration_minutes: 1 });

        const milestoneWithStatus = milestones.map(m => ({
            ...m.toObject(),
            status: computeStatus(quitDate, m.duration_minutes),
        }));

        res.status(200).json({
            success: true,
            message: "Your smoke-free milestone progress",
            quit_date: quitDate,
            milestones: milestoneWithStatus
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * POST /smoke-free-milestones/set-quit-date
 * Authenticated: Set or update the user's quit date (when they stopped smoking).
 * Body: { quit_date: "2024-04-01T00:00:00Z" }
 */
exports.setQuitDate = async (req, res) => {
    try {
        const userId = req.user.id;
        const { quit_date } = req.body;

        if (!quit_date) {
            return res.status(400).json({ success: false, message: "quit_date is required" });
        }

        const parsedDate = new Date(quit_date);
        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({ success: false, message: "Invalid quit_date format. Use ISO 8601 (e.g. 2024-04-01T00:00:00Z)" });
        }

        if (parsedDate > new Date()) {
            return res.status(400).json({ success: false, message: "quit_date cannot be in the future" });
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { quit_date: parsedDate },
            { new: true }
        ).select("quit_date name email");

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.status(200).json({
            success: true,
            message: "Quit date updated successfully",
            quit_date: user.quit_date
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
