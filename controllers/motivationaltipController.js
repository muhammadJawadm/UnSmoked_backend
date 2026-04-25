const MotivationalTip = require("../models/MotivationalTip");

// ─────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────

exports.createMotivationalTip = async (req, res) => {
    try {
        const { tip, category, tag, description, is_active, is_featured, is_fact_of_day, source, read_time } = req.body;
        const motivationalTip = new MotivationalTip({ tip, category, tag, description, is_active, is_featured, is_fact_of_day, source, read_time });
        await motivationalTip.save();
        res.status(201).json({ success: true, message: "Motivational tip created successfully", motivationalTip });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllMotivationalTips = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
        const skip = (page - 1) * limit;

        const totalItems = await MotivationalTip.countDocuments({ is_active: true });
        const totalPages = Math.ceil(totalItems / limit);

        const motivationalTips = await MotivationalTip.find({ is_active: true })
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
                itemsCount: motivationalTips.length,
                results: motivationalTips,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getMotivationalTip = async (req, res) => {
    try {
        const motivationalTip = await MotivationalTip.findById(req.params.id);
        if (!motivationalTip) {
            return res.status(404).json({ success: false, message: "Motivational tip not found" });
        }
        res.status(200).json({ success: true, message: "Motivational tip fetched successfully", motivationalTip });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateMotivationalTip = async (req, res) => {
    try {
        const { tip, category, tag, description, is_active, is_featured, is_fact_of_day, source, read_time } = req.body;
        const motivationalTip = await MotivationalTip.findByIdAndUpdate(
            req.params.id,
            { tip, category, tag, description, is_active, is_featured, is_fact_of_day, source, read_time },
            { new: true }
        );
        if (!motivationalTip) {
            return res.status(404).json({ success: false, message: "Motivational tip not found" });
        }
        res.status(200).json({ success: true, message: "Motivational tip updated successfully", motivationalTip });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteMotivationalTip = async (req, res) => {
    try {
        const motivationalTip = await MotivationalTip.findByIdAndDelete(req.params.id);
        if (!motivationalTip) {
            return res.status(404).json({ success: false, message: "Motivational tip not found" });
        }
        res.status(200).json({ success: true, message: "Motivational tip deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────
// SPECIAL MOBILE APP ENDPOINTS
// ─────────────────────────────────────────────

/**
 * GET /motivationaltips/featured
 * Returns the current "Top Pick" (Featured Tip) shown on the mobile home screen.
 * If multiple are marked featured, returns the most recently updated one.
 */
exports.getFeaturedTip = async (req, res) => {
    try {
        const featuredTip = await MotivationalTip.findOne({ is_featured: true, is_active: true }).sort({ updatedAt: -1 });
        if (!featuredTip) {
            return res.status(404).json({ success: false, message: "No featured tip found" });
        }
        res.status(200).json({ success: true, message: "Featured tip fetched successfully", featuredTip });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /motivationaltips/fact-of-the-day
 * Returns the current "Fact of the Day" shown in the banner strip.
 * If multiple are marked, returns the most recently updated one.
 */
exports.getFactOfTheDay = async (req, res) => {
    try {
        const factOfDay = await MotivationalTip.findOne({ is_fact_of_day: true, is_active: true }).sort({ updatedAt: -1 });
        if (!factOfDay) {
            return res.status(404).json({ success: false, message: "No fact of the day found" });
        }
        res.status(200).json({ success: true, message: "Fact of the day fetched successfully", factOfDay });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /motivationaltips/mobile-home
 * Returns all data needed for the Motivational Tips home screen in one call:
 *  - factOfDay
 *  - featuredTip
 *  - allTips (active)
 */
exports.getMobileHomeData = async (req, res) => {
    try {
        const [factOfDay, featuredTip, allTips] = await Promise.all([
            MotivationalTip.findOne({ is_fact_of_day: true, is_active: true }).sort({ updatedAt: -1 }),
            MotivationalTip.findOne({ is_featured: true, is_active: true }).sort({ updatedAt: -1 }),
            MotivationalTip.find({ is_active: true }).sort({ createdAt: -1 }),
        ]);

        res.status(200).json({
            success: true,
            message: "Mobile home data fetched successfully",
            data: {
                factOfDay: factOfDay || null,
                featuredTip: featuredTip || null,
                allTips
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};